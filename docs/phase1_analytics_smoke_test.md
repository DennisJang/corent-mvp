# CoRent — Phase 1 Analytics Smoke Test Runbook

_Recorded: 2026-04-30_

This runbook covers the manual verification steps for the Phase 1
analytics foundation. The automated tests in this PR cover sanitizer,
env, route handler, and admin auth boundary; the steps below cover what
automation cannot or should not (RLS verification against a real DB,
Supabase project setup, magic-link auth wiring, and pre-flight before
flipping the flag in production).

## A. Prerequisites — human-required setup

These steps **must be performed by the founder**, not by an agent. They
require browser logins to third-party consoles, real credential
generation, and rotation. The agent has explicitly stopped at these.

1. **Supabase project**
   - Create a Supabase project in the **Seoul** (`ap-northeast-2`) region.
   - Two projects: one for `dev` (anyone-recreatable), one for `prod`.
   - Save the project URL and the **service-role** key.
   - Apply the migration `supabase/migrations/20260430000000_phase1_analytics.sql`
     using the Supabase CLI: `supabase db push --linked` (or equivalent).
     Do not skip RLS — the migration enables RLS on both tables with no
     policies, which is the deny-by-default state.

2. **Vercel environment variables (server-only)**
   - In the Vercel project, set the following on **Production** and
     **Development** scopes:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `FOUNDER_ADMIN_EMAIL_ALLOWLIST` (the founder's email; one entry)
   - Leave `ENABLE_ANALYTICS_BETA` **unset** for the first deploy. We will
     flip it deliberately later.

3. **Vercel Deployment Protection**
   - Enable Vercel Deployment Protection on the `/admin/*` route group
     (or the entire deployment if the project's plan does not allow
     scoped protection). Set a strong password.
   - Reminder: this is a **soft outer gate**. The real auth boundary is
     the Supabase magic-link.

4. **Supabase Auth — magic-link**
   - In Supabase, enable Email magic-link auth.
   - Restrict the redirect URL to the production origin's
     `/admin/auth/callback` route (the route does not exist in this PR
     yet; see §F follow-up).

> **Stop point reminder.** Steps A1–A4 require third-party console
> access. The agent stops here and requests a human follow-up.

## B. Local — flag-off behavior

```bash
# Working tree clean, no env file:
npm run lint
npm run build
npm test
```

Expected: lint green, build green, all tests pass. The route handler
exists but `ENABLE_ANALYTICS_BETA` is unset → flag returns false →
`/api/events` returns 204 with no write attempted.

Verify:

```bash
npm run dev
curl -i -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{"event_kind":"search_submitted","session_hash":"sess_abcdef0123456789","consent_state":"granted"}'
```

Expect `HTTP/1.1 204 No Content` and **no** rows written.

## C. Local — flag-on behavior with placeholder env

Create `.env.local` (gitignored) with **placeholder** values pointing at
a local Supabase or a personal dev project. The migration must already
be applied to that project.

```bash
ENABLE_ANALYTICS_BETA=true
SUPABASE_URL=<dev-project-url>
SUPABASE_SERVICE_ROLE_KEY=<dev-project-service-role-key>
FOUNDER_ADMIN_EMAIL_ALLOWLIST=dev@example.com
```

Restart `npm run dev` and:

```bash
curl -i -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "event_kind":"search_submitted",
    "properties":{"category":"massage_gun","duration_days":3,"region_coarse":"seoul","price_band":"30k_70k","had_query":true},
    "session_hash":"sess_abcdef0123456789",
    "consent_state":"granted"
  }'
```

Expect `HTTP/1.1 200`. Then in the Supabase dashboard SQL editor:

```sql
select count(*) from public.growth_events;
```

Expect `1`. Verify the row contains `category=massage_gun`,
`region_coarse=seoul`, `properties->>'price_band' = '30k_70k'`, and
**none** of: any email pattern, phone, raw search text, IP, UA.

## D. Sanitizer fixture verification (automated, no human action)

```bash
npm test -- src/server/analytics/sanitize.test.ts
```

Expect 40+ tests passing, including the eight verbatim fixtures from the
Phase 1 plan §6.

## E. RLS verification — anon select/insert refusal

This step requires a real Supabase project (see §A1). Run in the
Supabase SQL editor **as the anon role**:

```sql
-- anon role cannot insert
insert into public.growth_events (event_kind, session_hash, consent_state)
values ('landing_visited', 'sess_abcdef0123456789', 'granted');
-- expected: ERROR: new row violates row-level security policy

-- anon role cannot select
select * from public.growth_events limit 1;
-- expected: empty result (RLS denies all reads with no policy)

-- anon role cannot insert into rejections
insert into public.sanitizer_rejections (event_kind, dropped_keys, reason)
values ('search_submitted', '{}', 'test');
-- expected: ERROR: new row violates row-level security policy
```

Switch to the `service_role` (Settings → API → service-role key) and
verify the same insert succeeds. **Do not paste the service-role key
into anything but a private SQL session.**

## F. Founder admin allowlist & magic-link

**Today, in this PR:** the admin dashboard at `/admin/dashboard` returns
404 for every visitor regardless of session, because the
`requireFounderSession()` reader has no Supabase SSR helpers wired. This
is the documented fail-closed default of Phase 1.

**Pre-conditions before unlocking:**

- A separate approved PR adds Supabase SSR session helpers (`@supabase/ssr`
  or equivalent), wires the magic-link callback at
  `/admin/auth/callback`, and replaces the `closedSessionReader` with a
  real one.
- That PR must include integration tests for: no session → 404,
  non-allowlisted email → 404, allowlisted email → 200, empty
  allowlist → 404 even with a session.

**Until then, manual verification:**

```bash
# Anonymous visit (no session, soft outer gate respected):
curl -i https://<your-vercel-domain>/admin/dashboard
# Expect: 401 from Vercel Deployment Protection, OR 404 if password is
# entered but the session reader fails closed.
```

## G. Deployed prod — flag-off verification

After deploy with `ENABLE_ANALYTICS_BETA` **unset**:

1. Visit `/`, `/search`, `/items/theragun-mini-2`, `/sell`, `/dashboard`
   in a browser. All should look exactly like `main` before this PR.
2. POST a probe event:
   ```bash
   curl -i -X POST https://<prod>/api/events \
     -H 'content-type: application/json' \
     -d '{"event_kind":"landing_visited","session_hash":"sess_abcdef0123456789","consent_state":"granted"}'
   ```
   Expect 204.
3. Verify the privacy/terms pages render: `https://<prod>/privacy`,
   `https://<prod>/terms`. Korean + English copy visible. No regulated
   language ("insurance" / "보험" / "보장").

## H. Manual procedure before flipping flag in prod

1. Re-run §G to confirm flag-off behavior.
2. Confirm the smoke fixtures (§D) still pass on `main`.
3. Confirm the migration is applied to the prod Supabase project and the
   anon-role RLS denial check (§E) passes.
4. Confirm `FOUNDER_ADMIN_EMAIL_ALLOWLIST` is set on Vercel prod.
5. **Then** set `ENABLE_ANALYTICS_BETA=true` in Vercel prod and redeploy.
6. Wait until the deployment completes; immediately POST one probe event
   from your own browser session and verify it lands in `growth_events`.

## I. First 24-hour observation checklist

After flipping `ENABLE_ANALYTICS_BETA=true` in prod, the founder watches
for the first 24 hours:

- Total event volume (Supabase dashboard SQL): expected non-zero, not
  spiky; spikes of 100×+ over baseline → likely a bot, investigate.
- `select event_kind, count(*) from public.growth_events group by 1 order by 2 desc;`
  expected mix dominated by `landing_visited`, `search_submitted`,
  `category_chip_clicked`. If `analytics_oversized` > 0, the route's
  size cap or sanitizer cap is wrong.
- Sanitizer rejection rate:
  `select count(*) from public.sanitizer_rejections where at > now() - interval '24 hours';`
  divided by event count. Expected < 5%. If higher, a client property is
  drifting outside the dictionaries.
- 5xx rate on `/api/events` (Vercel logs). Expected ~0%.
- Sample 10 random rows and confirm: no PII patterns, no exact KRW, no
  district-level geography, no raw search text.

## J. What to do if sanitizer rejections spike

1. Check `select event_kind, dropped_keys, reason, count(*) from public.sanitizer_rejections where at > now() - interval '1 hour' group by 1, 2, 3 order by 4 desc limit 50;`.
2. Identify the offending key + reason. Possibilities:
   - A new client property was added without updating the allow-list →
     ship a docs+code PR widening the allow-list.
   - A client serializer is leaking PII into a known property → fix at
     the client; deny-list should already block storage but the
     telemetry will flag it.
3. If the rejection rate exceeds 20% for any single source:
   - Flip `ENABLE_ANALYTICS_BETA=false` (rollback, §K).
   - Investigate; ship the fix; retest with §H.

## K. Rollback procedure

The rollback is a single env var change:

1. In Vercel prod: set `ENABLE_ANALYTICS_BETA=false` (or unset).
2. Redeploy (Vercel → Deployments → Redeploy).
3. Confirm `/api/events` returns 204 (§G step 2).
4. Existing rows in `growth_events` are untouched. Retention is rolling.

If a hard rollback (delete all rows) is required, do it from the
Supabase SQL editor as the service-role:

```sql
truncate table public.growth_events;
truncate table public.sanitizer_rejections;
```

> **This is destructive.** The agent will not run this; the founder
> performs it after confirming with another human.

## L. Stop-point summary (human-required actions)

| Step | Why human-required |
|---|---|
| A1 — Create Supabase project | Browser login + project creation |
| A1 — Apply migration to a hosted DB | Production-side write |
| A2 — Set Vercel env vars | Real secret handling |
| A3 — Vercel Deployment Protection | Real password, project setting |
| A4 — Supabase Auth provider config | Live auth provider toggle |
| §E — RLS verification | Service-role SQL session |
| §F — Magic-link wiring (follow-up PR) | Adds `@supabase/ssr` (separate approval) |
| §H — Flip flag in prod | Production env change |
| §K — Rollback (truncate) | Destructive operation |

The agent should not perform any of the above autonomously even with
auto mode active. See the Phase 1 PR brief's Human Required / Stop
Points section.

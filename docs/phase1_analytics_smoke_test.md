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
     - `SUPABASE_ANON_KEY` (server-only — used by the SSR auth client
       only, never the browser)
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
   - In Supabase, enable the Email auth provider.
   - **Disable** "enable sign-ups" / "confirm email" so anyone who is
     not already a user cannot create an account; the founder account
     is created manually in the Supabase dashboard. The sign-in route
     also passes `shouldCreateUser: false` defense-in-depth.
   - Set **Site URL** to the production origin.
   - Add to **Additional Redirect URLs**:
     - `https://<prod-origin>/admin/auth/callback`
     - `https://<dev-origin>/admin/auth/callback`
     - (For local dev only:) `http://localhost:3000/admin/auth/callback`
   - Set **Session / JWT expiry** to **12 hours** per
     [`corent_security_review_phase1_2026-04-30.md` §3.6](corent_security_review_phase1_2026-04-30.md). The 12-hour expiry is enforced by Supabase Auth (the source of truth); the app code does not extend it. The `requireFounderSession()` server check rejects expired tokens via `getUser()`.

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

## F. Founder admin allowlist & magic-link (Phase 1.5)

`@supabase/ssr` is now wired. The `requireFounderSession()` reader
validates a Supabase session via the SSR client (anon key), and the
allowlist check stays the only authorization signal. The magic-link
callback route at `/admin/auth/callback` exchanges the one-time code
for a session, and `/admin/login` is the founder's entry point.

The agent has implemented every code-level surface but **has not
configured Supabase Auth in any real project**. Steps F1–F6 below are
the human run-through.

### F1. Verify env (`.env.local` for local; Vercel env for prod)

```bash
SUPABASE_URL=<dev-or-prod-project-url>
SUPABASE_ANON_KEY=<dev-or-prod-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<dev-or-prod-service-role-key>
FOUNDER_ADMIN_EMAIL_ALLOWLIST=founder@example.com
```

Service-role key is **only** for analytics writes / admin reads. It is
**never** used for user session / auth. Sign-in / callback / dashboard
auth runs on the anon key.

### F2. Unauthenticated dashboard request → 404

```bash
curl -i http://localhost:3000/admin/dashboard
# Expect: 404. requireFounderSession() returns null because there is
# no Supabase session cookie.
```

### F3. Non-allowlisted email → generic response, dashboard stays 404

Open `http://localhost:3000/admin/login`. Submit an email that is
**not** in `FOUNDER_ADMIN_EMAIL_ALLOWLIST`.

- Expect: identical generic JSON response as for an allowlisted email.
- Expect: **no** magic-link email sent (the allowlist check fails before
  Supabase `signInWithOtp` is called).
- Visit `/admin/dashboard`: still 404 (no session was created).

### F4. Allowlisted email → magic-link delivered

Submit the founder's allowlisted email at `/admin/login`.

- Expect: same generic response.
- Expect: a magic-link email arrives at the founder's inbox from
  Supabase Auth. The link points at `/admin/auth/callback?code=...`.
- Click the link.

### F5. Callback exchanges the code → 303 redirect to `/admin/dashboard`

The browser lands on `/admin/auth/callback?code=...`. The route:

- exchanges the code via `supabase.auth.exchangeCodeForSession`,
- writes the session cookies via the SSR client,
- redirects with **303** to `/admin/dashboard`.

If the code is missing, expired, or rejected, the response is a `303`
to `/admin/login?e=1` — never a token / code echo, never a stack trace.

### F6. Allowlisted founder views dashboard

Visit `/admin/dashboard` while signed in. Expect:

- 200 + the read-only aggregate tiles render.
- The header shows the lowercased founder email (no other PII).
- `ENABLE_ANALYTICS_BETA=false` still prevents `/api/events` writes —
  the dashboard renders zeroes for the time being.

### F7. Open-redirect / `next` defense

```bash
curl -i "http://localhost:3000/admin/auth/callback?code=anything&next=https://evil.example.com"
# Expect: 303 to /admin/login?e=1 (code is invalid) — but even with a
# valid code, the next param would have been rejected by safeAdminNextPath
# and the redirect would have gone to /admin/dashboard, never to evil.

curl -i "http://localhost:3000/admin/auth/callback?code=anything&next=//evil.example.com"
# Expect: same — protocol-relative paths are rejected.
```

### F8. 12-hour session expiry (human verification)

Per [§3.6](corent_security_review_phase1_2026-04-30.md), admin
sessions expire after 12 hours. This is **enforced by Supabase Auth
configuration**, not by the app code. Verification:

- Sign in (F4–F6).
- Wait 12 hours (or use Supabase Auth admin API to expire the session).
- Reload `/admin/dashboard`. Expect 404 — `getUser()` rejects the expired
  JWT, `requireFounderSession()` returns null.

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
| §A4 — Supabase Auth redirect URL allowlist | Real Supabase project setting |
| §A4 — Supabase Auth 12h session expiry | Real Supabase project setting |
| §F — Founder account creation in Supabase | Browser login + manual user creation |
| §H — Flip flag in prod | Production env change |
| §K — Rollback (truncate) | Destructive operation |

The agent should not perform any of the above autonomously even with
auto mode active. See the Phase 1 PR brief's Human Required / Stop
Points section.

# CoRent — Dev Environment Setup Checklist

_Audience: founder. Last updated alongside Phase 1.5._

This is the **founder-facing** checklist for standing up the CoRent dev
Supabase project, the CoRent dev Vercel project, the local
`.env.local`, and the Supabase Auth magic-link path. It is repository
documentation only — no agent-driven external action is performed by
this file.

**Boundaries.** This setup is **dev only**. Production (and the future
`corent-prod` Supabase / Vercel projects) is out of scope. Real key
values are entered by the founder directly into the Supabase / Vercel
dashboards or `.env.local`. **Never paste a key into chat.** The agent
must not see, print, or rotate any real value at any step.

Cross-references:

- [`docs/corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md) — security review.
- [`docs/env_vars_phase1.md`](env_vars_phase1.md) — env var manifest (server-only vs. browser-shipped).
- [`docs/phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md) — full smoke runbook (§A1–A4 set up, §F1–F8 verify).
- [`docs/phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md) — Phase 1 plan.
- [`.env.local.example`](../.env.local.example) — the local-only template you copy from.

---

## 0. Hard rules (read first)

- **Never paste real keys into chat.** Founder enters values directly
  into Supabase / Vercel UIs or into a local `.env.local` file.
- **Never** prefix the service-role key with `NEXT_PUBLIC_`. The
  service-role key bypasses RLS and is server-only.
- **Never** flip `ENABLE_ANALYTICS_BETA=true` during dev setup. The
  flag stays `false` until a separate, explicit approval.
- **Never** modify the production Supabase project, the production
  Vercel project, or the production env vars in this session.
- `.env.local` stays gitignored. Confirm with `git check-ignore .env.local`
  if in doubt.
- If a step asks you to paste a value somewhere the agent can read, it
  is wrong. Stop and re-read this file.

---

## 1. Required env vars (names only)

Repeat from [`docs/env_vars_phase1.md`](env_vars_phase1.md) for quick reference. Names — never values:

| Name | Scope | Read by | If missing |
|---|---|---|---|
| `ENABLE_ANALYTICS_BETA` | server-only | `src/server/analytics/env.ts` | flag off → `/api/events` returns 204 with no write |
| `SUPABASE_URL` | server-only | analytics writer + SSR auth client | analytics writer fails closed (503); admin returns 404 |
| `SUPABASE_ANON_KEY` | server-only (un-prefixed by design in Phase 1.5) | SSR auth client | admin returns 404 |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | analytics writer + admin reader | analytics writer + dashboard fail closed |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | server-only | admin auth + sign-in route | every admin request fails closed (404) |

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
reserved for future browser use; Phase 1 does not need them in the
browser bundle.

---

## 2. Supabase dev project — checklist

Project name: `corent-dev`. Region: `ap-northeast-2` (Seoul).

Founder performs each step manually in the Supabase dashboard:

- [ ] **Create project** in `ap-northeast-2`. Name: `corent-dev`.
- [ ] Save the **project ref** and **project URL** in your password
  manager (not in chat, not in the repo).
- [ ] In Project Settings → API, copy the **anon (public) key** and
  the **service-role (secret) key** to your password manager. Treat
  the service-role key as a database superuser credential.
- [ ] Do **not** apply any migration yet. The Phase 1 migration
  (`supabase/migrations/20260430000000_phase1_analytics.sql`) is
  applied in a separate, explicitly-approved step (see §6).
- [ ] **Backups** — confirm Supabase's default daily backup is enabled
  on the dev project. Phase 1 plan §11.

Note: Phase 1 specifies a **separate `corent-prod` project** when
production launches. This checklist does not create it. Do not reuse
the dev project for prod traffic.

---

## 3. Supabase Auth — checklist

In the dev project's Auth settings:

- [ ] **Enable Email auth provider.**
- [ ] **Disable** "enable sign-ups" (or "confirm email signups" — set
  it to off). The founder account is created manually below; no public
  user sign-up exists in Phase 1.
- [ ] **Site URL**: set to your dev origin. Examples:
  - For purely local work today: `http://localhost:3000`.
  - For the dev Vercel deploy: `https://<corent-dev>.vercel.app`.
  - The Site URL is updated when the Vercel project goes up.
- [ ] **Additional Redirect URLs** — add **all** of these:
  - [ ] `http://localhost:3000/admin/auth/callback`
  - [ ] `https://<corent-dev-vercel-origin>/admin/auth/callback`
- [ ] **JWT / session expiry** = **12 hours** per
  [`corent_security_review_phase1_2026-04-30.md` §3.6](corent_security_review_phase1_2026-04-30.md). The 12h is the source of truth — the app does not extend it.
- [ ] **Founder user** — create the founder account by email in
  Supabase → Authentication → Users → "Add user". Use the same email
  that goes into `FOUNDER_ADMIN_EMAIL_ALLOWLIST`. Confirm the user is
  marked email-confirmed.
- [ ] Magic-link is the **only** auth path. Do not enable any other
  provider (GitHub, Google, phone, etc.) for the dev project in
  Phase 1.

The sign-in route also passes `shouldCreateUser: false` defense in
depth, so even if "enable sign-ups" is mis-toggled later, no new user
is created via `/admin/auth/sign-in`.

---

## 4. Vercel dev project — checklist

Project name: `corent-dev`. Production scope is **off-limits** in this
checklist.

- [ ] **Create Vercel project** linked to this repository. Choose the
  team `dennisjangs-projects` (already known).
- [ ] **Production branch** — leave on `main` if that's the repo
  default. **No env vars for the Production scope are set here.**
- [ ] In **Project Settings → Domains**, save the auto-assigned
  `https://<corent-dev>.vercel.app` URL — you will need it for the
  Supabase redirect URL allowlist (§3) and for Auth Site URL.
- [ ] **Deployment Protection** — enable on `/admin/*` (or the whole
  deployment if the Vercel plan does not allow scoped protection). Set
  a strong password. This is a **soft outer gate**, not the auth
  boundary.
- [ ] Set the env vars listed in §5 only for **Development** (and
  optionally **Preview**). Production scope **stays untouched**.

---

## 5. Vercel env vars — Development scope only

In Vercel → Project Settings → Environment Variables, with **only the
Development (and optionally Preview)** boxes checked:

| Variable | Scope checkbox | Notes |
|---|---|---|
| `ENABLE_ANALYTICS_BETA` | Development | Value: `false`. **Do not set Production.** Do not set to `true`. |
| `SUPABASE_URL` | Development (+ Preview) | The dev project URL. |
| `SUPABASE_ANON_KEY` | Development (+ Preview) | Server-only by Phase 1.5 design. Do **not** add a `NEXT_PUBLIC_` mirror. |
| `SUPABASE_SERVICE_ROLE_KEY` | Development (+ Preview) | Server-only. Bypasses RLS. **Never `NEXT_PUBLIC_*`.** |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | Development (+ Preview) | Single founder email. Comma-separated if multiple — Phase 1 expects exactly one. |

Hard rules:

- The **Production** environment scope is **not** modified by this
  checklist. If you accidentally check the Production box, remove the
  variable from Production immediately.
- After saving, **redeploy** the Development/Preview URL once so the
  new env vars are picked up.

---

## 6. Phase 1 migration — separate approval

Migration file: `supabase/migrations/20260430000000_phase1_analytics.sql`.

The migration:

- creates only `growth_events` and `sanitizer_rejections`,
- enables RLS on both with **no** policies (deny-by-default for anon
  and authenticated roles),
- creates four indexes on `growth_events` and one on `sanitizer_rejections`,
- introduces no users, listings, rentals, payment, or upload tables.

Application is **not** part of this checklist. Founder grants explicit
approval, then either:

- runs `supabase db push --linked` against the dev project (CLI), or
- asks the agent to invoke the Supabase MCP `apply_migration` against
  the dev project ref.

After the migration is applied, run [`docs/phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md) §E to verify RLS denies anon `select`/`insert` on both tables.

---

## 7. Local `.env.local` — checklist

Local development against the dev Supabase project:

- [ ] Copy `.env.local.example` to `.env.local`:
  ```bash
  cp .env.local.example .env.local
  ```
- [ ] Open `.env.local` in your editor and replace each `<...>`
  placeholder with the real dev value from your password manager.
- [ ] Confirm `.env.local` is gitignored:
  ```bash
  git check-ignore .env.local
  # expect: .gitignore:34:.env*    .env.local
  ```
- [ ] Confirm `.env.local.example` itself contains **only**
  placeholders (no real values).
- [ ] **Never commit** `.env.local`. **Never paste** its contents into
  chat.
- [ ] If you ever pasted a real key into a place that you wouldn't pin
  to your fridge, **rotate** the key in the Supabase dashboard before
  doing anything else.

After `.env.local` is filled, run:

```bash
npm run dev
```

Then walk through [`docs/phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md) §F1–F8 (Phase 1.5 founder admin verification).

---

## 8. Callback URL summary

The magic-link callback is hard-pinned to `/admin/auth/callback` on the
same origin as the request. The Supabase Auth allowlist must include
all origins where you intend the founder to log in:

| Environment | Callback URL |
|---|---|
| Local dev | `http://localhost:3000/admin/auth/callback` |
| Vercel dev | `https://<corent-dev-vercel-origin>/admin/auth/callback` |
| (Future) Vercel prod | `https://<corent-prod-origin>/admin/auth/callback` — **not configured in this checklist** |

The sign-in route validates `next` against `safeAdminNextPath` so even
a misconfigured allowlist cannot be used as an open-redirect.

---

## 9. How to report back safely

After you finish the manual setup, fill out the redacted inventory at
[`docs/corent_dev_secret_inventory.template.md`](corent_dev_secret_inventory.template.md) — copy it to e.g.
`docs/corent_dev_secret_inventory.md` (which is **gitignored if you
prefix the filename with `.local`** or you can simply not commit
it). The inventory tracks **only yes/no answers** — no values.

Safe ways to confirm setup with the agent:

- "Supabase dev project ref starts with `xxxx` and ends with `yyyy`" —
  the agent will not ask for the full ref unless you opt in.
- "Anon key is set in `.env.local` and Vercel Development." — yes/no
  is enough.
- "Allowlist contains exactly one entry: `<my-email>`." — the email
  itself is fine to share since it's deliberately the founder's email.

Unsafe (do **not**) :

- Pasting any `eyJ…` JWT (anon key or service-role key) into chat.
- Pasting the full Supabase project URL if you want to keep the ref
  private. (The ref leaks the project; it isn't a secret in the strict
  sense, but treat it as low-sensitivity.)
- Reading any env variable's value back from terminal output and
  forwarding the output.

---

## 10. After-setup checklist

Before considering the dev setup "done":

- [ ] §2 Supabase project created in `ap-northeast-2`.
- [ ] §3 Auth provider enabled, redirects allowlisted, JWT 12h, founder user created.
- [ ] §4 Vercel project created with Deployment Protection on `/admin/*`.
- [ ] §5 Five env vars set on Development (and optionally Preview); **Production untouched**.
- [ ] §6 Phase 1 migration applied (separate explicit approval).
- [ ] §7 `.env.local` filled and confirmed gitignored.
- [ ] [`phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md) §B–§F walked through against `npm run dev`.
- [ ] `ENABLE_ANALYTICS_BETA` is `false` everywhere.

If any check fails, stop and resolve it before flipping any flag or
setting up production.

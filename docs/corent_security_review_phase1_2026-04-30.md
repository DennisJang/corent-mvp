# CoRent Security Review — Phase 1 Validation Beta

_Recorded: 2026-04-30_

**Format:** docs-only readiness note per [`corent_security_gate_note.md` §3](corent_security_gate_note.md). Triggers cleared by this note: **real DB integration**, **real auth/session**.

**Inputs that govern this review** (priority order on conflict):
[`phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md),
[`db_readiness_audit_v1.md`](db_readiness_audit_v1.md),
[`corent_security_gate_note.md`](corent_security_gate_note.md),
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
[`corent_product_direction_v2.md`](corent_product_direction_v2.md),
[`corent_defensibility_note.md`](corent_defensibility_note.md).

**Repo state at write time:** `main`, 19 commits ahead of `origin/main`, working tree clean, latest commit `21dd46c docs: add phase 1 validation beta plan`.

**This note is docs-only.** No code, no DB, no auth, no payment, no upload, no location, no dependencies, no migrations, no app behavior changes are produced by this commit. Approval of this note does **not** authorize implementation; the implementation PR is a separate code PR that must additionally be approved by the user per [`agent_loop.md`](agent_loop.md).

---

## 1. Scope Summary

### Posture

CoRent operates in pre-revenue validation per [`corent_pre_revenue_beta_plan.md` §0–§1](corent_pre_revenue_beta_plan.md). MVP v1 is browser-demoable today with **no server-side persistence at all** (everything lives in the user's `localStorage`). Phase 1 introduces **the first server-side data path in CoRent's lifetime**.

### What Phase 1 is allowed to add

Strictly the surface defined in [`phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md):

- **One Supabase project** in `ap-northeast-2` (Seoul), single environment posture (separate `dev` and `prod` projects, no staging in Phase 1).
- **Two tables only**: `growth_events`, `sanitizer_rejections`.
- **One ingestion endpoint** at `/api/events` (POST), backed by **one server-only sanitizer module** at `src/server/analytics/sanitize.ts`.
- **One admin page** at `/admin/dashboard` (server component, read-only aggregate tiles).
- **Two static legal pages** at `/privacy` and `/terms`.
- **One Vercel route-handler region pin** (`seoul1` or `icn1`) for the analytics route.
- **One new feature flag** `ENABLE_ANALYTICS_BETA` (defaults off; turning it on is a deliberate ops action, not an automatic side effect of the implementation merge).
- **Two layers of defense** on the admin surface: Vercel Deployment Protection (soft outer gate) **and** Supabase Auth magic-link with a server-side `FOUNDER_ADMIN_EMAIL_ALLOWLIST`. The magic-link is the actual auth boundary; the deployment-protection password is **not**.
- **Privacy banner** with explicit `granted | denied | unknown` consent states recorded on every event.

### What Phase 1 explicitly forbids (hard rejection at code review)

- Any `users`, `profiles`, `listings`, `rental_intents`, or other end-user-data table. The localStorage-backed Intent flow stays untouched.
- Any user-facing sign-in surface. Only the founder authenticates, only against the admin dashboard.
- Any payment, deposit, settlement, payout, partner integration, file upload, photo handling, location/GPS, or LLM call.
- Any `NEXT_PUBLIC_*` env var carrying a service-role / secret value.
- Any storage of raw search text, raw user-agent, IP addresses, exact KRW amounts, district-level geography, names, emails, phone numbers, addresses, RRN, payment metadata, or third-party trackers.
- Any new dependency beyond the minimum required for the analytics writer + admin reader (anything beyond `@supabase/supabase-js` requires a separate explicit approval).

### What this review note authorizes

This note **clears the security gate** for the Phase 1 surface as defined above and **only** as defined above. Any deviation in the implementation PR (a third table, a second endpoint, a non-admin authenticated user, an LLM call, a payment surface, a new dependency) reopens the gate.

---

## 2. Security Gate Trigger

Per [`corent_security_gate_note.md` §1](corent_security_gate_note.md), a security review is required before any of the following changes merge. Phase 1 trips the following triggers, each enumerated explicitly so the implementation PR's review can confirm 1:1 coverage.

| Trigger (per security gate §1) | Tripped by Phase 1? | How |
|---|---|---|
| Real DB integration | **Yes** | Two new Supabase-hosted Postgres tables (`growth_events`, `sanitizer_rejections`) replace the prior "no server-side data" posture. |
| Real auth / session | **Yes** | Supabase Auth magic-link issuance and validation for the founder admin dashboard; allowlisted single email. |
| Real payment partner integration | No | Phase 1 ships zero payment code; mock adapter remains the only path. |
| Real file / photo upload | No | Phase 1 accepts no uploads; verification photos remain placeholder fixtures. |
| Location-based matching | No | Phase 1 stores `region_coarse` only; no GPS, no geofencing, no distance ranking. |
| Partner-protection wiring | No | Phase 1 introduces no insurance / guarantee / indemnity partner. |

Additional Phase-1-specific surfaces that **are** introduced and **must** be covered by this review even though they are not standalone triggers in the gate note:

- **Admin dashboard surface** — the first authenticated server-rendered route in CoRent's history. Treated equivalently to "admin/internal dashboard data exposed without role separation" risk #6 from [`db_readiness_audit_v1.md` §11](db_readiness_audit_v1.md).
- **Server-side ingestion endpoint** — the first mutating server route, even though its only "mutation" is appending sanitized analytics rows. Treated equivalently to risks #4 (route handler without auth/role checks) and #11 (excessive logging).
- **Service-role-only writes** — the first time the Supabase service-role key is used in production. Treated equivalently to risk #2 (service role key misuse).

The combined Phase 1 surface = real DB + real auth + admin dashboard + ingestion endpoint + service-role writes. This review covers all five together because they ship as one PR; splitting the review would create coverage gaps at the seams.

---

## 3. In-Scope Security Areas

For each area: **Classification** (one of: `Applies to Phase 1 and must be enforced before merge` / `Not in Phase 1 scope; revisit at Phase 2` / `Not applicable yet`), then **Description**, **Enforcement requirement**, **Test requirement**.

### 3.1 Database / RLS

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Both new tables hold sanitized but still defensibility-sensitive data; RLS is the second line of defense (after the route handler) preventing accidental anon-key reads.
- **Enforcement:** RLS enabled on `growth_events` and `sanitizer_rejections`. **No** policy permitting `select` or `insert` for the `anon` role. **No** policy permitting `select` or `insert` for the `authenticated` role at row level. Reads and writes are gated through the service-role server modules.
- **Test:** Unit test creates an `anon`-role Supabase client and asserts both `select` and `insert` against each table fail with the expected RLS denial. Test using an `authenticated` (logged-in non-admin) client also fails. Integration test against a service-role client succeeds for `insert` (analytics writer) and `select` (admin reader).

### 3.2 Supabase Service Role Key Handling

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The service-role key bypasses RLS. Its scope is server-only and used only by two call sites: the analytics writer and the admin dashboard reader. Misuse here is catastrophic.
- **Enforcement:** `SUPABASE_SERVICE_ROLE_KEY` set as a **server-only** Vercel env var (no `NEXT_PUBLIC_` prefix). Imported only from `src/server/supabase/admin.ts` (proposed path). Reachable from at most two call sites (analytics writer + admin reader). Build-fails if any file under `src/components/**` or any client component (`"use client"` directive) imports the admin client module.
- **Test:** Static check (lint or simple grep gate) that `src/server/supabase/admin.ts` is not imported from any path matching `src/components/**`, `src/app/**/*Client*.tsx`, or any file containing a `"use client"` pragma. Bundle inspection: `next build` artifacts in `.next/static/**` do **not** contain the literal service-role key value (search-by-known-prefix or known-fragment).

### 3.3 Supabase Anon Key / Client Behavior

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The Supabase anon key may legitimately ship to the browser bundle, but Phase 1 does not invoke a Supabase client from the browser at all. Even with the anon key shipped, RLS denies all access to the new tables.
- **Enforcement:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are kept defined for forward use, but Phase 1's browser code does not instantiate a Supabase client. The browser POSTs to `/api/events` only.
- **Test:** Bundle inspection: no `createClient(` from `@supabase/supabase-js` appears in browser-bundled chunks. RLS denial test from §3.1 doubles as a defense-in-depth test for anon-client misuse if it does end up running client-side later.

### 3.4 Founder Admin Auth (Supabase Magic-Link)

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Magic-link issuance lands on a server-action redirect that validates the email against a server-side allowlist before issuing a session.
- **Enforcement:** Magic-link sender restricted to a single project; redirect URL is a server-only route handler that re-validates the email against `FOUNDER_ADMIN_EMAIL_ALLOWLIST` server-side. Non-allowlisted emails return 404 (not 401, to avoid revealing the admin surface). Session creation only occurs after the email match.
- **Test:** Integration test for magic-link callback with (a) a non-allowlisted email returning 404 and **no** session created, (b) an allowlisted email returning 302 to the dashboard with a valid session.

### 3.5 Server-Side Email Allowlist

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The allowlist is the only authorization signal beyond "valid Supabase session". Misconfiguration here grants admin to anyone who can sign up.
- **Enforcement:** `FOUNDER_ADMIN_EMAIL_ALLOWLIST` set as a server-only env var. Comma-separated; emails normalized (trim + lowercase) before comparison. Read at request time from server-only code; never bundled into the client. The implementation PR ships with the env var **set** in Vercel for both `dev` and `prod` projects (not blank); a missing env var must cause every admin request to **fail closed** (return 404), not fail open.
- **Test:** Unit test for the allowlist comparator: normalization, empty env var, multi-email list, trailing whitespace, case mismatch. Integration test for admin route handler with a missing/empty env var returning 404 for every email.

### 3.6 Session Duration

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Admin sessions need to expire on a shorter window than user sessions normally would, because admin compromise is higher impact.
- **Enforcement:** Supabase Auth project setting: admin session lifetime 12 hours (configurable but pinned for Phase 1). After 12 hours the session is invalid; the next admin request 302s back to magic-link sign-in.
- **Test:** Manual smoke test (documented in the implementation PR): sign in, wait past 12h or fast-forward via Supabase test utilities, attempt admin request, observe redirect to sign-in.

### 3.7 `/api/events` Ingestion Boundary

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The first mutating server route in CoRent. Receives client-posted JSON, sanitizes, and writes to `growth_events`. Treated as a hostile input boundary.
- **Enforcement:** POST only; non-POST returns 405. Content-Type must be `application/json`; otherwise 415. Body size cap 4 KB; otherwise 413. Per-IP and per-`session_hash` rate limits (concrete numbers pinned in the implementation PR; recommendation: 60 events / minute / session_hash, 600 events / hour / IP for Phase 1). `ENABLE_ANALYTICS_BETA` flag check **first**: if off, return 204 with no body and no DB write. CSRF: not applicable for analytics POST from public visitors (the endpoint accepts cross-origin POSTs by design); the data-integrity defense is the sanitizer + rate limit, not CSRF.
- **Test:** Integration tests covering: GET returns 405; non-JSON returns 415; oversized body returns 413; rate-limit-exceeded returns 429; `ENABLE_ANALYTICS_BETA = off` returns 204 with no row written; `ENABLE_ANALYTICS_BETA = on` with valid payload writes one row.

### 3.8 Sanitizer Allow-List and Deny-List

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The sanitizer is the only writer to `growth_events`. Its allow-list per event type is the primary defense; the deny-list regex pass is belt-and-suspenders.
- **Enforcement:** Sanitizer module lives at `src/server/analytics/sanitize.ts` (server-only). Allow-list per `growth_event_type` enumerated in [`phase1_validation_beta_plan.md` §3](phase1_validation_beta_plan.md). Dictionary validation per property (closed sets). Deny-list regex pass for: email (`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`), Korean phone (`0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}` and `+82` variants), RRN (`\d{6}[-\s]?\d{7}`), 16-digit card-like (`\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}`), any string longer than 64 characters. Properties failing any check are dropped (with a `sanitizer_rejections` row); the event is still written with the surviving allow-list keys plus the always-attached fields (`event_kind`, `at`, `session_hash`, `consent_state`, `event_schema_version`).
- **Test:** All eight test fixtures from [`phase1_validation_beta_plan.md` §6](phase1_validation_beta_plan.md) pass verbatim, including the `consent_state: 'denied'` → coerce-to-`analytics_denied`-only-event rule (§3.9 below).

### 3.9 `consent_state` Handling

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The consent banner records `granted | denied | unknown` per session. Denied users still see the product but their behavior is not stored as a behavioral row.
- **Enforcement:** When `consent_state = 'denied'`, the sanitizer **forces** `event_kind = 'analytics_denied'` and **strips all properties**. This way the count of refusals is observable (which is itself a useful signal) without recording behavior. When `consent_state = 'granted'` or `'unknown'`, normal processing applies.
- **Test:** Sanitizer fixture #8 from the Phase 1 plan.

### 3.10 PII Rejection

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Any data shape that could re-identify a user must be rejected.
- **Enforcement:** Per the Phase 1 plan §4, the sanitizer rejects names, emails, phones, RRN, addresses, district-level geography (more granular than `region_coarse`), IPs, raw user-agent strings, exact KRW amounts (use `price_band` only), serial numbers, photo bytes, third-party fingerprinting ids, and any free-text payload field. The allow-list per event type is structured such that **no allowed key carries free text**.
- **Test:** Sanitizer fixtures #2 (extra key `email`), #4 (embedded PII in long string), plus a sampled-rows verification step in the manual smoke test (§3.21 below) that checks the first 50 rows on the dev project for any of the deny-list patterns.

### 3.11 Payload Limits

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Bound the surface area of any single request and any single field.
- **Enforcement:** Pre-sanitize body cap **4 KB** (route handler returns 413). Post-allow-list `properties` jsonb cap **2 KB** when serialized (sanitizer drops the row to `analytics_oversized` event with no properties if exceeded). Per-string cap **64 characters** (deny-list pass).
- **Test:** Integration test: 4097-byte body returns 413. Sanitizer test: a payload that survives the route-handler cap but produces > 2 KB of valid jsonb properties is reduced to `analytics_oversized` and a `sanitizer_rejections` row is written.

### 3.12 Logging Redaction

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Server logs, even in dev, must not contain raw request bodies. AI agents commonly add `console.log(req.body)`; this is exactly what must not happen.
- **Enforcement:** A logger wrapper module under `src/server/logging/` (proposed) is the only allowed log path in `src/server/**`. Direct `console.log` calls in `src/server/**` are banned. The logger redacts known PII keys (`email`, `phone`, `address`, `name`, `serial`, etc.) at the field level; values matching the deny-list regex are also redacted. The logger never serializes a full request body unless the route is the admin dashboard error path (which logs a request id, not the body).
- **Test:** CI / lint rule that fails on `console.log(`, `console.warn(`, `console.error(`, `console.info(` directly in any file under `src/server/**`. The logger wrapper has unit tests for redaction of each banned key.

### 3.13 Admin Dashboard Authorization

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The admin dashboard is a server component reading via the service-role client; if it accidentally renders into a public-bundled chunk or skips auth, the most defensible asset CoRent has is leaked.
- **Enforcement:** All `app/admin/**/page.tsx` and `app/admin/**/route.ts` paths are wrapped by a server-side middleware (or a shared `requireFounderSession()` function) that validates the Supabase session and the email-allowlist match before rendering / responding. Non-matches return 404. The admin Supabase client is imported **only** from server modules invoked under this gate.
- **Test:** Integration test for `/admin/dashboard` with (a) no session: 404; (b) session with a non-allowlisted email: 404; (c) session with an allowlisted email: 200 and renders. Bundle inspection: `app/admin/**` chunks are not present in the public client bundle (Next.js handles this for server components by default; the test asserts no admin-related symbols leak into a client chunk).

### 3.14 Static Privacy / Terms Pages

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Public traffic must not reach the analytics endpoint without disclosure. Static pages avoid runtime risk and are cacheable.
- **Enforcement:** `/privacy` and `/terms` are statically generated (`generateStaticParams` style, server components, no client JS). Footer of every public page links to both. Privacy banner renders on first load, dismissible with `granted | denied | unknown` outcome cookie. Banner re-shows when `privacy_version` changes.
- **Test:** Build artifact contains a static HTML file for both pages. Manual smoke test: open `/`, see banner, click each affordance, observe cookie state. Routine accessibility check (keyboard + screen-reader) for the banner and the footer links.

### 3.15 Region / Data Residency

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Korea-wide product direction makes in-region hosting the default; Korean compliance posture is simpler when data does not cross borders.
- **Enforcement:** Supabase project provisioned in `ap-northeast-2` (Seoul). Vercel route handler region pinned to `seoul1` or `icn1`. CDN-edge caching may serve from elsewhere, but the analytics POST hits a region-pinned function that talks to an in-region database.
- **Test:** Manual verification of Supabase project region in the dashboard. Manual verification of Vercel function region via `vercel.json` or route segment config. No automated test required at Phase 1; recommended automated check for Phase 2 (e.g. a deploy-time assertion).

### 3.16 Retention Policy

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Retention is a privacy and defensibility commitment. The Phase 1 plan pins the numbers; this review note requires they are documented and **scheduled for implementation** (not necessarily fully automated by the day public traffic flips on, but no later than 30 days after).
- **Enforcement:** `growth_events` retained 18 months rolling. `sanitizer_rejections` retained 90 days. Banner consent cookie 365 days. Admin session 12 hours. Aggregated dashboard reads computed live (no persistence). Implementation: a Vercel Cron route handler runs daily and deletes rows past their retention window. **If automated retention is not in the first implementation PR**, the implementation PR must include a manual deletion runbook **and** a tracking entry that the cron lands within 30 days, blocking on user approval.
- **Test:** Cron handler unit test (deletes only rows older than the threshold; never deletes newer rows). Manual smoke test: insert a row with `at = now() - 19 months`, run the job, observe deletion.

### 3.17 Dependency / Package Review

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** AI agents add packages by reflex; supply-chain risk scales with that habit. The Phase 1 plan caps the new dependency surface at `@supabase/supabase-js` plus, optionally, a small validator library if introduced under separate explicit approval.
- **Enforcement:** `package.json` diff in the implementation PR may add `@supabase/supabase-js` and **only** that. Any other new dependency requires a separate explicit user approval recorded in the PR description. No transitive-only additions are reviewed automatically; lockfile diff is read by a human reviewer.
- **Test:** Manual review of the `package.json` and `package-lock.json` diffs. Recommended (not required at Phase 1): `npm audit` clean of high/critical advisories.

### 3.18 Tests Required Before Merge

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The implementation PR is the first server-side surface in CoRent's history; the test set is the floor, not the ceiling.
- **Enforcement (minimum test set in the implementation PR):**
  - Sanitizer allow-list tests for each `growth_event_type`.
  - Sanitizer deny-list tests for email / Korean phone / RRN / 16-digit card-like / 64+ char string.
  - Eight sanitizer fixtures from [`phase1_validation_beta_plan.md` §6](phase1_validation_beta_plan.md).
  - RLS denial tests on both new tables for `anon` and `authenticated` clients.
  - Service-role insert path test (analytics writer succeeds end-to-end with a test row).
  - `/api/events` route handler tests: GET → 405, wrong content-type → 415, oversized body → 413, rate-limit → 429, flag-off → 204 no write, valid payload → 200 with row written.
  - Admin route auth tests: no session → 404, non-allowlisted email → 404, allowlisted email → 200.
  - Logger redaction unit tests for each banned key.
  - Anon-client bundle absence test (no `createClient(` in client bundles).
- **Test:** All of the above must pass green in CI / locally before merge.

### 3.19 Environment Variable Split

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** The split between client-shipped and server-only env vars is the basis of every other secrets defense.
- **Enforcement:** Per Phase 1 plan §2:
  - **Client + server (public):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - **Server-only:** `SUPABASE_SERVICE_ROLE_KEY`, `ANALYTICS_INGEST_SHARED_SECRET`, `FOUNDER_ADMIN_EMAIL_ALLOWLIST`.
  - **Vercel project setting:** `VERCEL_DEPLOYMENT_PROTECTION_PASSWORD` (not an env var the app reads).
- **Test:** A docs-only env manifest ships with the implementation PR (`docs/env_vars_phase1.md` or similar) listing every var, scope, purpose, and `.env.example` placeholder. The `.env.example` is committed; `.env.local` stays gitignored.

### 3.20 `NEXT_PUBLIC_*` Exposure Risk

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Any `NEXT_PUBLIC_*` is shipped to the browser bundle. Misuse is the most common AI-agent secrets leak.
- **Enforcement:** A CI-style grep gate that fails on any `NEXT_PUBLIC_*` matching the deny-list regex `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)`. This is documented in the Phase 1 plan and must ship in the implementation PR (as a script in `scripts/` invoked from CI when CI lands; until then, the script is run manually as part of the PR review).
- **Test:** Grep gate passes on the implementation PR. Manual bundle inspection: search the output of `next build` for the literal value of `SUPABASE_SERVICE_ROLE_KEY`; expect zero matches.

### 3.21 Manual Smoke Test (Phase 1 Specific)

- **Classification:** Applies to Phase 1 and must be enforced before merge.
- **Description:** Automated tests are the floor; a human end-to-end pass is required before flipping `ENABLE_ANALYTICS_BETA = on` in any environment.
- **Enforcement:** Implementation PR ships with a runbook (in `docs/`) for the manual smoke test. At minimum: open `/`, accept consent, submit a search, observe a single `search_submitted` row in the founder dashboard's last-24h tile within one minute, with `consent_state = 'granted'` and no PII fields. Then: open `/` (new session), decline consent, submit a search, observe a single `analytics_denied` row.
- **Test:** Documented manual run-through. The PR description includes the rendered dashboard tile screenshots **with no actual user data** — only the dev-project fixtures or test-account session.

---

## 4. Out-of-Scope Security Areas for Phase 1

Each area is **Not in Phase 1 scope; revisit at Phase 2 or later.** Listed explicitly so the implementation PR's reviewer can confirm none of these crept in.

| Area | Status | Revisit at |
|---|---|---|
| Payment integration (Toss / any PG) | Not in Phase 1 scope | Phase 3 (post-2026-07-13) |
| Toss webhook signature verification | Not in Phase 1 scope | Phase 3 |
| Deposit holds (authorize / capture / release / refund) | Not in Phase 1 scope | Phase 3 |
| Settlements (lender payout) | Not in Phase 1 scope | Phase 3 |
| Seller payouts | Not in Phase 1 scope | Phase 3 |
| Uploads / photos (verification / handoff / damage / avatar) | Not in Phase 1 scope | Phase 2+ |
| Identity verification (lender) | Not in Phase 1 scope | Phase 3 |
| Identity verification (high-risk borrower) | Not in Phase 1 scope | Phase 3+ |
| Exact pickup location (full address) | Not in Phase 1 scope | Phase 2+ (with location-information compliance review) |
| Contact exchange (in-platform messaging or contact reveal) | Not in Phase 1 scope | Phase 2+ |
| External partner / investor dashboard | Not in Phase 1 scope | Phase 2+ |
| AI parser real LLM swap | Not in Phase 1 scope | Phase 3+ |
| AI admin tooling (LLM-assisted moderation, etc.) | Not in Phase 1 scope | Phase 3+ |
| Notification provider (email / SMS / push) | Not in Phase 1 scope | Phase 2 |
| Dispute automation | Not in Phase 1 scope | Phase 3+ (concierge only at Phase 2) |
| Damage report flow (server-side) | Not in Phase 1 scope | Phase 3 |
| Real auth for end users (borrowers / lenders) | Not in Phase 1 scope | Phase 2 |
| Real listings table | Not in Phase 1 scope | Phase 2 |
| Real `rental_intents` table | Not in Phase 1 scope | Phase 2 |
| Admin actions audit log | Not in Phase 1 scope (read-only dashboard in Phase 1) | Phase 2 (when first admin write affordance lands) |
| Multi-role admin separation | Not in Phase 1 scope | Phase 2+ |
| Staging environment | Not in Phase 1 scope | Phase 2 |
| External bot defense (Cloudflare Turnstile etc.) | Not in Phase 1 scope | Phase 2 |
| 2FA enforcement | Not in Phase 1 scope (single founder, magic-link only) | Phase 2 |
| Backup / restore drill | Not applicable yet (Supabase default daily backup is sufficient for Phase 1) | Phase 2 (rehearse + document) |
| Incident response runbook (general) | Phase 1 ships only the analytics-endpoint-error runbook | Phase 2 expands |

---

## 5. Required Phase 1 Merge Gates

The implementation PR may not merge unless **all** of the following are true. Each gate is binary. Items repeated from §3 are restated here for the merge-checklist convenience of the reviewer.

### Flag and behavioral gates

- [ ] `ENABLE_ANALYTICS_BETA` defaults **off** in code; turning it on in any environment is a deliberate ops action.
- [ ] When `ENABLE_ANALYTICS_BETA = off`, the route handler returns 204 with no body and writes no DB row. Verified by integration test.
- [ ] The Phase 1 implementation does not change any existing app behavior when the flag is off.

### Code-shape gates

- [ ] Server-only modules live under `src/server/**`.
- [ ] No file under `src/components/**` and no file containing `"use client"` imports anything from `src/server/**`. Build-fail or lint-fail on violation.
- [ ] No service-role key in client bundle. Bundle inspection passes.
- [ ] No `process.env.SUPABASE_SERVICE_ROLE_KEY` (or equivalent) reads outside `src/server/**`. Grep gate.
- [ ] No `NEXT_PUBLIC_*` env var matches the deny-list regex `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)`. Grep gate.
- [ ] No `console.log` / `console.warn` / `console.error` / `console.info` direct calls in `src/server/**`. Logger wrapper is the only allowed path.

### DB / RLS gates

- [ ] RLS enabled on `growth_events` and `sanitizer_rejections`.
- [ ] Anon-client `select` and `insert` denied on both tables. Test passes.
- [ ] Authenticated-non-admin-client `select` and `insert` denied on both tables. Test passes.
- [ ] Service-role-client `insert` path tested end-to-end (sanitizer → writer → row appears).
- [ ] Service-role-client `select` path tested for the admin dashboard tiles.

### Sanitizer gates

- [ ] Sanitizer allow-list tests for **all** allowed event types from [`phase1_validation_beta_plan.md` §3](phase1_validation_beta_plan.md).
- [ ] Sanitizer deny-list tests for: email regex, Korean phone regex, RRN regex, 16-digit card-like regex, 64-char string cap.
- [ ] Pre-sanitize body **> 4 KB** is rejected at the route handler with 413.
- [ ] Per-string value **> 64 chars** is dropped (or truncated per the plan's chosen behavior — Phase 1 plan §6 says **dropped**).
- [ ] `consent_state = 'denied'` is coerced to `event_kind = 'analytics_denied'` with **no** other properties stored. Fixture #8 passes.

### PII gates

- [ ] No raw search text persisted on any `growth_events` row.
- [ ] No IP address persisted (raw or hashed-to-stable). Only the `session_hash` correlator exists.
- [ ] No raw user-agent string persisted. Only the `device_class` server-side parse output is stored.
- [ ] No exact KRW amount persisted. Only `price_band` enum.
- [ ] No district-level geography persisted (no 구, 동, 읍, 면, full address). Only `region_coarse` enum.
- [ ] No name, email, phone, RRN, address, payment metadata, serial number, photo bytes, or third-party tracker id persisted.

### Auth gates

- [ ] `/admin/**` requires a Supabase session. No session → 404. Test passes.
- [ ] `/admin/**` requires the email to be in `FOUNDER_ADMIN_EMAIL_ALLOWLIST` (server-side, normalized). Non-allowlisted → 404. Test passes.
- [ ] Empty / missing `FOUNDER_ADMIN_EMAIL_ALLOWLIST` causes every admin request to fail closed (404). Test passes.
- [ ] Admin Supabase session lifetime configured to **12 hours**. Manual smoke test passes.

### Public surface gates

- [ ] `/privacy` and `/terms` are statically generated and reachable from every public page footer.
- [ ] Privacy banner renders on first load, supports `granted | denied | unknown`, and persists via cookie.
- [ ] Privacy banner re-shows when `privacy_version` changes.

### Operational gates

- [ ] Retention policy documented: 18 months for `growth_events`, 90 days for `sanitizer_rejections`, 12h admin session, 365-day banner consent cookie.
- [ ] Retention enforcement either implemented (Vercel Cron) or scheduled-with-runbook within 30 days, blocking on user approval.
- [ ] Manual smoke test runbook included in `docs/`; first run-through documented in the PR description.
- [ ] Env var manifest committed (`docs/env_vars_phase1.md` or similar).

### Documentation gates

- [ ] If any gate is intentionally deferred, the deferral is recorded inline in the implementation PR description **and** in this security review note via a follow-up amendment.
- [ ] No silent deferrals.

---

## 6. Residual Risks

Risks accepted by approving Phase 1 with the controls in §3–§5. Each is documented so it can be tracked into Phase 2.

- **Vercel Deployment Protection is not the real auth boundary.** It is a deployment-level password, not a per-session check. If the magic-link auth path has a bug — e.g. the email-allowlist comparator silently passes empty input — the deployment-protection password is the only thing standing. Mitigation: §3.5 fail-closed test + §3.13 admin authorization tests. Residual: a configuration change that disables Deployment Protection (Vercel project setting) could expose the admin surface to anyone who has the magic-link sender configured. Phase 2 introduces a stricter posture (e.g. Cloudflare Access in front, SSO).

- **External legal review may be deferred.** [`phase1_validation_beta_plan.md` §11](phase1_validation_beta_plan.md) allows deferral with a documented user decision. If deferred, the residual risk is that the privacy notice or terms copy contains a Korean-law obligation we did not catch. Mitigation: regulated-language ban already enforced (no insurance / 보험 / 보장 wording); collected data is below the PIPA threshold for written consent of identifiable users. Residual: a legal posture finding could require a copy revision **after** public traffic has seen the unrevised copy.

- **Seoul-only hosting assumption may need review for Korea-wide expansion.** Korea-wide direction is a product positioning, not a hosting decision; Seoul (`ap-northeast-2`) covers all of Korea with low latency. The risk is reputational rather than technical: an external observer might read "Seoul region" as a product constraint. Mitigation: privacy notice language describes the hosting region without implying a service constraint.

- **Service-role server endpoint increases blast radius if route auth or sanitizer is wrong.** The analytics writer holds the service-role key and bypasses RLS. A bug that lets non-admin paths reach the writer could allow forged events or PII insertion. Mitigation: §3.7 route handler tests + §3.8 sanitizer tests + §3.10 PII rejection tests. Residual: a future code change in the writer that adds a new code path could regress the boundary; mitigated by §3.18 test set being the **floor**, not the ceiling, and the §3.12 logging-redaction posture preventing a dropped raw body from leaking to logs even if a regression occurs.

- **Analytics events are still behavioral data, even when sanitized.** A motivated reverse-engineer could infer individual users by correlating `session_hash` with timing and category cuts. Mitigation: 18-month retention is short enough that long-term profiling is bounded; aggregates only (no row-level dashboard view) make casual inference difficult. Residual: a determined adversary with admin access could still reconstruct partial sessions. Phase 2 considers k-anonymity thresholds before publishing aggregates externally.

- **Manual retention enforcement may exist before automated deletion.** If automated cron is deferred up to 30 days post-merge, the founder is responsible for running the deletion job manually. Risk: the manual run is missed, raw events accumulate past 18 months. Mitigation: explicit runbook + a calendar reminder set when the implementation PR ships. Residual: at most ~one month of buffer past the policy.

- **Sanitizer coverage is regex-bounded.** The deny-list patterns catch obvious shapes (Korean phones, RRN, etc.) but cannot catch every PII variant a user might paste. Mitigation: the **allow-list per event type** is the primary defense — no event type in §3 of the Phase 1 plan accepts free text — so deny-list misses do not become row-level leaks unless the allow-list is broadened later. Residual: a future event type added without re-reviewing the allow-list could regress.

- **Single-founder admin model.** No four-eyes principle for admin dashboard access. If the founder's email is compromised (phishing, lost device), the admin surface is reachable. Mitigation: 12-hour session + magic-link (no stored password). Residual: phishing remains possible. Phase 2 introduces 2FA for admin and considers a second admin account for redundancy.

- **No external bot defense.** Phase 1 relies on the rate limiter and sanitizer. A motivated bot could pollute the funnel; aggregates remain useful but distorted. Mitigation: §3.7 rate limits. Residual: noisier early data than necessary.

- **The implementation PR is itself the first server-side surface.** Bugs in the surface that are not caught by §3.18's test set become operational issues at the moment the flag flips. Mitigation: the flag defaults off, the manual smoke test in §3.21 must pass before flipping in `prod`, and the Phase 1 plan §15 commits to revert-and-revise rather than expand-the-PR if a hard problem appears.

---

## 7. Phase 2 Revisit List

Items that this review intentionally does not address and that **must be reopened** before Phase 2 lands. Restated here so the Phase 2 entry note has a precise checklist.

- **Staging environment** — Phase 2 introduces it; `dev` / `prod` is not enough once user data lands.
- **Broader auth roles** — Phase 1 has only `founder`. Phase 2 introduces `borrower`, `seller`, `admin`, `admin_super` (or final set).
- **Real user profiles** — `users`, `profiles`, `seller_profiles`, `borrower_profiles` tables.
- **Contact info** — phone, email, district, preferred contact channel; consent gating; reveal timing rules.
- **Listings in DB** — `listings`, `listing_versions`, `listing_verifications` per [`db_readiness_audit_v1.md` §5.1](db_readiness_audit_v1.md).
- **Rental intents in DB** — `rental_intents`, `rental_events` per audit §5.1.
- **Upload / photo storage** — private bucket, signed URLs, owner-validated writes, malware scan, isolated serial number storage.
- **Exact pickup location handling** — coarse public, exact private, reveal timing.
- **Identity verification** — partner integration; CoRent stores flag only.
- **External dashboard** — materialized snapshot table with manual approval gate per audit §9.2.
- **Operational admin actions** — first admin write affordance triggers the `admin_actions` audit log table requirement.
- **Audit log expansion** — append-only, transaction-bound logger; per-action coverage.
- **Rate limiting** — beyond the per-IP / per-`session_hash` Phase 1 limits; per-user, per-action, burst.
- **Abuse / spam monitoring** — listing spam, multi-account detection, scraping defense, external bot defense.
- **2FA for admin role** — TBD enforcement timing.
- **Backup / restore drill** — beyond Supabase's daily snapshot default; rehearsed restore.
- **CSRF for mutating route handlers** — not applicable in Phase 1 (cross-origin analytics POST is intentional); becomes mandatory the moment any non-analytics mutating handler ships.
- **k-anonymity / aggregate safety** — before any external dashboard publishes aggregates.
- **Privacy rights workflow** — self-serve deletion / export.
- **Korean compliance posture review** — once PII is collected, formal PIPA review.

---

## 8. Final Recommendation

### May the Phase 1 code PR proceed?

**Yes, conditionally.** The Phase 1 code PR may proceed **only after**:

1. This security review note is committed to `main` (this PR is the commit), and
2. The user has explicitly approved the Phase 1 implementation PR per [`agent_loop.md`](agent_loop.md). This review note alone does not authorize implementation.

The implementation PR must satisfy every gate in §5. Any gate failure blocks merge.

### What must NOT be implemented in the Phase 1 code PR

- No `users`, `profiles`, `listings`, `rental_intents`, or any other end-user-data table.
- No user-facing sign-in surface. Only the founder authenticates.
- No payment, deposit, settlement, payout, partner integration.
- No file or photo upload accept path.
- No real LLM call (the AI parser stays rule-based mock).
- No exact GPS / location-based matching.
- No external partner / investor dashboard surface.
- No third-party analytics, marketing pixel, ad tracker, or cross-site cookie.
- No new dependency beyond `@supabase/supabase-js` (small validator library acceptable only with separate explicit approval).
- No fee-formula change in [`src/lib/pricing.ts`](../src/lib/pricing.ts) (intentional debt; updated in the launch-mode PR with `fee_version` per-row pinning).
- No removal of `CURRENT_SELLER` (it is retired only when real auth lands, in the Phase 2 implementation PR).
- No silent deferrals of any §5 gate.

### Recommended next PR scope

**`feat: implement phase 1 analytics beta foundation behind ENABLE_ANALYTICS_BETA`** (or the equivalent commit-message convention this repo settles on). One code PR. Strictly matching [`phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md) and this security review note. Surfaces:

1. `src/server/supabase/admin.ts` — service-role client, server-only.
2. `src/server/analytics/sanitize.ts` — sanitizer module.
3. `src/server/analytics/writer.ts` — writer module (the only `growth_events` insert path).
4. `src/server/logging/logger.ts` — logger wrapper with redaction.
5. `app/api/events/route.ts` — POST-only route handler with body cap, content-type check, rate limit, flag check, sanitizer call, writer call.
6. `app/admin/dashboard/page.tsx` — server-component dashboard with the v0 tile set from [`phase1_validation_beta_plan.md` §7](phase1_validation_beta_plan.md).
7. `app/admin/layout.tsx` (or middleware) — `requireFounderSession()` wrapper.
8. `app/privacy/page.tsx` and `app/terms/page.tsx` — static legal pages.
9. Privacy banner client component and cookie helper.
10. Supabase migrations (or SQL scripts) creating the two tables, the enums, the indexes, and the RLS policies.
11. Test set covering every item in §3.18.
12. `docs/env_vars_phase1.md` — env var manifest.
13. `docs/runbook_phase1_smoke.md` — manual smoke test runbook.
14. `.env.example` updated with all new vars (placeholders only).
15. Vercel project settings: deployment protection on `/admin/*`, region pin on the events route, env vars set for both `dev` and `prod` projects.

The implementation PR is the **first** code PR in CoRent's history to introduce server-side persistence. The PR description must include:

- a verbatim mapping from §5 gate to the file / test that satisfies it,
- the manual smoke test screenshots from a `dev` run-through (with no real user data),
- explicit user approval recorded.

After merge but **before** flipping `ENABLE_ANALYTICS_BETA = on` in `prod`:

- Verify Supabase backups are enabled.
- Run the manual smoke test against the deployed `prod` URL with the flag still off (the consent banner / privacy / terms pages must render correctly even with the flag off).
- Then flip the flag in `prod`. The first 24 hours of public traffic are observed by the founder for sanitizer rejections, rate-limit triggers, and any unexpected event volume.

---

## Validation

- `git status --short` (run by me before write): clean.
- `git diff --check` (run by me on staged): clean (no whitespace errors).
- `npm run lint` / `npm run build` / `npm test`: **not run** — docs-only change, no app surface affected, root [eslint.config.mjs](../eslint.config.mjs) ignores `docs/**`, and this note does not introduce a code path the build or tests would reach.

(Final command outputs are reported in the session message accompanying the commit.)

# Phase 2 Backend Draft — Deep Review (2026-04-30)

Status: **REVIEW**, no code changes during this audit.
Reviewer: Claude (Opus 4.7, 1M).
Branch: `main`, 26 commits ahead of `origin/main`, working tree clean.
Dev Supabase project: `corent-dev` (id `qjmybydhggtohjwfsyci`, region `ap-northeast-2`).

This document is a point-in-time audit of the Phase 2 backend integration
draft (commits `64db215`, `1708ad7`, plus the `/sell` hydration fix in
`9aa5f45`). It classifies every part of the draft as **keep / minor change
/ change before more work / defer / revert / founder decision**, and ends
with a Go / No-Go recommendation and a next-PR proposal.

Companion documents:

- [`docs/phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md)
- [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md)
- [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql)
- [`supabase/seed.phase2_dev.sql`](../supabase/seed.phase2_dev.sql)
- [`docs/db_readiness_audit_v1.md`](db_readiness_audit_v1.md)
- [`docs/corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md)
- [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)

---

## 1. Executive Summary

**Overall verdict: KEEP as dev-only foundation.** The Phase 2 draft stayed inside the
allowed boundary, did not implement payment / deposit / settlement / upload /
identity / location features, kept the public app behavior unchanged, and applied
a deny-by-default RLS posture in dev Supabase that matches what the migration
text claims. No safety blocker was found.

- Safe to keep as-is: backend mode switch, the 11 marketplace tables,
  the sanitized `listings_public` view (ungranted), all server-only adapters,
  the import-boundary tests, the migration text-safety tests, the `/sell`
  hydration fix, the dev-only DB-health route, and the docs.
- Safe to keep with minor changes: a few callouts where the draft would
  benefit from a clarifying note (see §13). None of these are blockers.
- Should change before more work: nothing required for safety; one
  recommended hardening (a CHECK constraint on `borrower_profiles.preferred_trust_signal`
  is already present — verified). No required changes.
- Should defer: real RLS read policies (owner-read-self, public listing read),
  the seed application, the `CORENT_BACKEND_MODE=supabase` enablement, linking
  `/admin/dev/db-health` from the admin shell.
- Should revert: nothing.
- Founder decision required: whether to apply the dev seed; whether to keep
  the `li_demo_initial_seller_draft` deterministic id pattern in
  `SellerRegistration`; whether the `pickup_area` / `pickup_location_label`
  free-text columns need a tighter constraint (controlled vocabulary) before
  the next migration.

**Go / No-Go: GO** — keep the draft as the dev-only foundation; the next PR
should be small (founder approval doc + the policy-design follow-up note),
not new feature surface.

---

## 2. Boundary Compliance

The brief enumerates a forbidden list (payment, Toss, deposit, settlement,
payout, upload/photo, identity/RRN, exact pickup location, contact exchange,
external dashboard, AI parser API, notification provider, real personal data
collection, broad RLS policies, dependency additions, env / production
changes). I scanned `src/`, `supabase/`, and `docs/` for each.

| Forbidden surface | Scan result | Verdict |
|---|---|---|
| Payment table / payments column | No `payments`, `payment_events`, `transactions` table created. `rental_intents.payment_provider` is a `text` column with `check (... in ('mock','toss'))` — a forward-compatible string slot, not an integration. Mock-only path runs through pre-existing `mockPaymentAdapter`. | PASS — string slot is documented as forward-compatible. |
| Toss API call | Zero Toss SDK / Toss API URL / Toss webhook handler in tracked files. The literal `"toss"` appears only in (a) string-enum CHECK constraints, (b) pre-existing mock adapter doc strings, and (c) a single `payment_provider === "toss" ? "toss" : "mock"` coercion in `rentalIntentRepository.ts:224`. | PASS — naming a slot is not implementing a feature. |
| Deposit / settlement / payout implementation | No tables created. `rental_intents` carries `safety_deposit`, `seller_payout`, `settlement_status` as columns the in-memory state machine already produces; values are bounded and validated; nothing actually moves money. | PASS. |
| Upload / photo / file storage | No `upload_assets`, `uploads`, `photo_assets` tables. `listing_verifications` stores `boolean` flags (`front_photo`, `back_photo`, `working_proof`, `safety_code_photo`) — flags only, no urls, no buckets, no storage RLS. | PASS. |
| Identity / RRN / KYC / national_id | The migration test at `supabase/migrations/phase2.test.ts` greps for `phone`, `rrn`, `national_id`, `street_address`, `full_address`, `gps_lat`, `gps_lng`, `latitude`, `longitude` and asserts none appear in the migration text. Manual confirm: zero hits. | PASS. |
| Exact pickup location / GPS | No GPS columns. Three coarse text columns exist: `listings.pickup_area` (60 char), `listing_secrets.pickup_area_internal` (80 char, admin-only), `rental_intents.pickup_location_label` (60 char). Bounds enforced at DB. See §3 caveat. | PASS with caveat (free-text could be misused). |
| Contact exchange (phone, message thread) | None. | PASS. |
| External / partner dashboard | None. The Phase 2 admin panel on `/admin/dashboard` is founder-only and only renders aggregate counts. | PASS. |
| AI parser API call | Pre-existing mock adapter in `src/lib/adapters/ai/`. No outbound network call added. | PASS. |
| Notification provider (Kakao / SMS / email) | None. | PASS. |
| Real personal data collection | Seed file uses `@corent.invalid` reserved domain, `DEMO` display names, deterministic UUIDs. No real PII shipped. The seed has not been applied to dev. | PASS. |
| Broad RLS policies (`using (true)` / open `grant`) | Migration text test at `phase2.test.ts` asserts no `using (true)`, no `with check (true)`, no `create policy`, no `grant select … to anon`. Manual confirm via dev metadata: 0 policies on Phase 2 tables, 0 grants to anon/authenticated on Phase 2 relations including `listings_public`. | PASS. |
| Dependency additions | No new packages added in this stack. `@supabase/supabase-js` and `@supabase/ssr` were already present from Phase 1 / Phase 1.5. | PASS. |
| Env changes in Vercel / prod | This audit did not touch Vercel. `.env.example` and `.env.local.example` were updated (commit `64db215`) to document `CORENT_BACKEND_MODE=mock`; no real values added; templates only. | PASS. |
| Public beta enablement | `ENABLE_ANALYTICS_BETA=false` remains. No flag flips. | PASS. |

**Boundary verdict: PASS.** The draft did not breach the forbidden list. The
soft caveat is the free-text `pickup_*` fields — see §3 and §13.

---

## 3. Migration Review

Migration version `20260429215510 phase2_marketplace_draft` plus the
follow-up `20260429215634 phase2_set_updated_at_search_path` are present in
`corent-dev`. All 11 tables exist, RLS is enabled on every one, and zero
policies and zero anon/authenticated grants exist on any Phase 2 relation
(verified in §4).

| Table | Purpose | Sensitivity | Verdict | Notes |
|---|---|---|---|---|
| `profiles` | Identity (1:1 with auth.users). | Medium (email is PII). | KEEP AS-IS | Email shape CHECK is defensive (`[^@\s]{1,128}@[^@\s]{1,128}`); display_name bounded 60. No phone, no address, no full name distinct from display name. |
| `seller_profiles` | Seller metadata. | Low. | KEEP AS-IS | `trust_score` bounded [0,5]; `review_count` non-negative. trust_note bounded 240. Useful for Concierge DB Beta. |
| `borrower_profiles` | Borrower metadata. | Low. | KEEP AS-IS | `preferred_trust_signal` bounded to enum-of-3. |
| `listings` | Public listing row. | Low (approved) / Medium (draft). | KEEP AS-IS | All bounded ints/text; `pickup_area` and `defects` are bounded text. Indexes sensible. No private fields here. |
| `listing_secrets` | Owner+admin-only secrets. | **HIGH**. | KEEP AS-IS | See subsection below. |
| `listing_versions` | Append-only edit history. | Low. | KEEP AS-IS | `snapshot` is `jsonb` with `jsonb_typeof = 'object'` CHECK. `snapshot_version` constrained to literal `'v1'`. Reason bounded 240. |
| `listing_verifications` | Per-listing safety code + checks. | Low. | KEEP AS-IS | Safety code regex `^[A-Z]-[0-9]{3}$` enforced at DB. Photo `boolean` flags only — no URLs, no buckets. ai_notes/human_review_notes capped at 24 entries. |
| `rental_intents` | Stripe-style central row. | Medium (cached display names; coarse pickup label). | KEEP AS-IS | Money columns are integers, all bounded; `payment_provider`/`payment_status`/`pickup_method`/`pickup_status`/`return_status`/`settlement_status` are `text` with `check (... in (...))` enums. Forward-compatible without enum churn. |
| `rental_events` | Append-only log. | Low. | KEEP AS-IS | Adapter never updates/deletes; metadata `jsonb` is CHECK'd to be `'object'`; reason bounded 240. |
| `admin_reviews` | Founder review queue. | Low. | KEEP AS-IS | XOR CHECK ensures exactly one of `(listing_id, rental_intent_id)`. notes bounded 1000. |
| `admin_actions` | Append-only admin audit. | Low. | KEEP AS-IS | `actor_email` is shape-checked. `metadata` jsonb forced `'object'`. notes bounded 1000. |

### Special: `listing_secrets`

| Question | Answer | Verdict |
|---|---|---|
| What columns? | `listing_id` (PK + FK to listings, on delete cascade), `private_serial_number text` (cap 80), `pickup_area_internal text` (cap 80), `created_at`, `updated_at`. | OK |
| Is it necessary before uploads/identity? | Concierge admin needs a place to store the seller's private serial number for trust verification. Putting it in a separate table (vs. on `listings`) means a future public read view can never accidentally join it. The schema doc explicitly cites the trust-architecture posture: serial private, admin-only. | YES — design is justified. |
| Is it private by design? | Yes. RLS enabled + zero policies + revoke-all from anon/authenticated. Service-role-only access. The `listings_public` view does not reference `listing_secrets`. The `listingRepository.mapRowToIntent` explicitly sets `privateSerialNumber: undefined` when reading the public listing shape, even though the listings query never joins listing_secrets in the first place. | YES. |
| Adapter exposure | The adapter currently has **no read or write surface for `listing_secrets`**. The schema makes the table available; nothing in the Phase 2 draft writes to it yet. This is fine — the table exists, the boundaries are correct, and the writer can be added in a Concierge DB Beta PR with a fresh review. | KEEP AS-IS. |
| Should it remain? | **YES.** It is precisely the right abstraction now (separate table, deny-all, no joins). Removing it would make the next concierge feature have to invent it. | KEEP AS-IS. |

### Special: `listings_public` view

| Question | Answer | Verdict |
|---|---|---|
| Excludes private columns? | Yes. The view selects only public columns from `listings` and does not reference `listing_secrets`. Verified by `phase2.test.ts` ("excludes private columns from the view"). | OK |
| Excludes seller identity beyond `seller_id` uuid? | Yes. No email, no display_name from `profiles` is joined. | OK |
| Excludes admin notes / verification notes? | Yes. The view selects from `listings` only, not from `listing_verifications` or `admin_*` tables. | OK |
| Filters to approved? | Yes — `where l.status = 'approved'`. Verified by test. | OK |
| Granted to anon? | **NO.** `revoke all on public.listings_public from anon, authenticated` was applied. Verified in dev: zero anon/authenticated grants on the view. | OK — correct deferral. |
| Future purpose | When the security review for unauthenticated public reads is on file, a single `grant select on public.listings_public to anon, authenticated` will turn it on. The view already exists with the correct shape so granting is the only diff. | KEEP AS-IS. |

**Migration verdict: KEEP AS-IS.** The schema is conservative, defensive, and
matches the readiness audit's recommended table candidates almost exactly.

---

## 4. RLS / Grants Review

Verified against dev Supabase metadata (read-only):

```sql
-- 1) Policies on Phase 2 tables
select … from pg_policies where schemaname = 'public' …
-- result: 0 rows

-- 2) anon / authenticated grants on Phase 2 relations
select table_name, count(*) filter (where grantee in ('anon','authenticated'))
from information_schema.role_table_grants
where table_schema = 'public' and table_name in (… 11 tables + listings_public)
-- result: every Phase 2 table and the view show count = 0
```

Phase 2 RLS posture in dev matches the migration text: deny-by-default, zero
policies, zero anon/authenticated grants. `listings_public` has only postgres
+ service_role grants (default for view ownership).

**Phase 1 hygiene observation (NOT a Phase 2 issue):** `growth_events` and
`sanitizer_rejections` (Phase 1 tables) **do** still have anon/authenticated
relation-level grants (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
UPDATE). These tables have RLS enabled with no policies, so RLS still denies
all rows — the data is not actually reachable. But the relation-level grants
are an inconsistency with the Phase 2 posture: Phase 2 explicitly revokes
these. This is the Phase 1 migration's responsibility, not Phase 2's. It is
worth a small follow-up `alter`/`revoke` migration to align Phase 1 with the
Phase 2 deny-by-default posture, but it is **not a Phase 2 blocker**.

Supabase advisor (`get_advisors security`) returned only:

- 13 × `rls_enabled_no_policy` INFO notices (every public table — Phase 1 + Phase 2). Intentional.
- 1 × `auth_leaked_password_protection` WARN — pre-existing, unrelated to Phase 2.

The `function_search_path_mutable` advisor warning that the draft doc mentions
clearing is in fact gone, confirming the follow-up migration
`20260429215634 phase2_set_updated_at_search_path` was applied and effective.

**RLS verdict: KEEP AS-IS for Phase 2.** Phase 1 hygiene = `should fix soon`,
not a blocker. See §13.

---

## 5. Adapter Boundary Review

| Concern | Evidence | Verdict |
|---|---|---|
| All marketplace adapter code is server-only | Files live under `src/server/persistence/supabase/**`. Re-exports via `index.ts`. Never imported from `src/components/**` (asserted by `import-boundary.test.ts` "Phase 2 marketplace persistence boundary"). | PASS |
| Service-role client is only used in server modules | `client.ts` is the only file that constructs `createClient(serviceRoleKey, …)` for marketplace work. Reads via `readSupabaseServerEnv` (the analytics server-env reader). The boundary test grep-asserts `SUPABASE_ANON_KEY` and `readSupabaseAuthEnv` do not appear in any of the five marketplace modules. | PASS |
| Service role absent from auth/session code | Existing test ensures `supabase-ssr.ts`, `auth.ts`, and the auth route handlers never reference `SUPABASE_SERVICE_ROLE_KEY` / `readSupabaseServerEnv` / `getServiceRoleClient`. | PASS |
| Anon key only where appropriate | Anon key flows through `readSupabaseAuthEnv` and is read only by `src/server/admin/supabase-ssr.ts`. Marketplace adapters never touch it. | PASS |
| Repositories validate inputs | Every write path runs every untrusted field (id, seller_id, status, prices, item name, category, components, defects, pickup_area, safety code, verification status, durations, amounts, actor, metadata) through `validators.ts`. Reads validate the id when a single-row read accepts an id. | PASS |
| Validators reject client-supplied ownerId/userId/status/role/price | Verified in `validators.test.ts`: every set has a unit test asserting "rejects unknown" and at least one positive case. The 19-state `RentalIntentStatus` enum is fully tested. | PASS |
| IDs server-side only? | The adapters accept domain-supplied ids but require them to be RFC-4122 uuids. The mock domain still mints `li_*` / `vi_*` / `ri_*` style ids — those would FAIL validation in the supabase backend. This is intentional fail-closed behavior; the next PR that flips a real seller flow to write to Supabase will need to mint uuids server-side, but the current draft does not yet wire any UI page to the Supabase adapter. | OK (correct fail-closed) |
| Statuses changed server-side only | Yes. Status is one of the validated fields. The state-machine (in `src/lib/stateMachines/`) decides the value and the adapter validates it again. | PASS |
| Private fields excluded from public DTOs | `mapRowToIntent` in `listingRepository.ts:118-145` explicitly sets `privateSerialNumber: undefined` and the listings query does not join `listing_secrets`. The happy-path test asserts the listings upsert payload does not contain `private_serial`. | PASS |
| Routes expose raw rows? | The dev DB-health route (`/admin/dev/db-health`) returns counts only via `readMarketplaceAggregates`. The dashboard renders aggregate tiles only. No row-level data leaves the server. | PASS |
| `/admin/dev/db-health` requires founder auth + dev gating? | Code checks `process.env.NODE_ENV === "production"` first (404 in prod), then `requireFounderSession()` (404 if no founder session). Both branches return `new NextResponse(null, { status: 404 })` — fail-closed without leaking that the route exists. Verified by import-boundary test. | PASS |
| Aggregates reader avoids PII / raw rows | `marketplaceAggregates.ts` selects only `status` columns and uses `count: "exact", head: true` for totals. No raw rows are returned. | PASS |

Server / client / service-role classification: **safe**. No serious or
blocker issues.

---

## 6. Runtime Mode Review (`CORENT_BACKEND_MODE`)

| Property | Verdict |
|---|---|
| Default is `mock` | YES. Empty / missing / unknown → `mock`. Tested. |
| Production refuses `supabase` | YES. `NODE_ENV === 'production'` returns `mock` even when env asks for `supabase`. Tested. |
| Server-only | YES. Never read in `src/components/**`. Boundary test asserts `mode.ts` only references `CORENT_BACKEND_MODE` and `NODE_ENV` — never any Supabase env, never `NEXT_PUBLIC_*`. |
| Client cannot switch it | YES. Client components do not import `@/server/backend/*` (boundary test). |
| `.env.example` documents safely | YES. The new section in `.env.example` describes the switch as "single narrow switch, not a feature-flag framework" and explicitly says production falls back to mock. |
| Existing public app behavior remains mock by default | YES. No page imports `@/server/persistence/supabase` except the founder dashboard and the dev DB-health route — both founder-gated. The `/sell` page, `/items/[id]`, `/dashboard`, `/`, `/search` all continue to use the mock + localStorage path. |
| Separate from `ENABLE_ANALYTICS_BETA` | YES. Different env var, different module, different gate. |

**Runtime mode verdict: KEEP AS-IS.** The two-value mode is intentionally
narrow and well-bounded.

---

## 7. Admin Surface Review

### `/admin/dashboard` Phase 2 panel

- Renders only when `process.env.NODE_ENV !== "production"` AND
  `getBackendMode() === "supabase"` AND `readSupabaseServerEnv().ok`.
- Reads `readMarketplaceAggregates()` which returns counts only.
- Tiles: Listings / Rental intents / Rental events / Admin reviews / Profiles
  totals; sub-sections: by-status counts. No PII, no row data.
- The Phase 1 funnel and analytics views are unchanged; the Phase 2 panel
  is appended below them with a clear section header `Phase 2 / Marketplace (dev)`.
- When the env / backend mode is missing, the section simply does not render.
  The existing Phase 1 dashboard surface is untouched.

**Verdict: keep as-is. Stays dormant until env + mode are set.**

### `/admin/dev/db-health`

- Founder session required. Hard-404s in production. Hard-404s when
  `requireFounderSession()` returns null (no session, no email, or non-allowlisted).
- Returns `{ backendMode, envReady, clientReady, aggregates }`. Aggregates
  are null when the client is not ready.
- Not linked from the admin shell. Discoverable only by typed URL or by
  someone reading the source.
- No env values are echoed (boundary test asserts no `process.env.SUPABASE_SERVICE_ROLE_KEY` in the route handler).

**Verdict: keep but DO NOT link.** The route is a healthcheck, not a feature.
A founder bookmark is fine; surfacing it in the admin nav would tempt
someone to point monitoring or a third party at it.

---

## 8. Seed Review (`supabase/seed.phase2_dev.sql`)

| Check | Result | Verdict |
|---|---|---|
| Fake data only | Yes. Emails are `*@corent.invalid` (RFC 2606 reserved), names are `DEMO …`, UUIDs are deterministic `00000000-0000-4000-8000-…`. | PASS |
| No real names / emails / phones / addresses | Yes. | PASS |
| No exact pickup location | Yes — `'DEMO 권역'`, `'DEMO 픽업 라벨'`. | PASS |
| No serial numbers | Yes — `listing_secrets` is not seeded. | PASS |
| Stable, idempotent | `on conflict (id) do nothing` everywhere. Re-running is safe. | PASS |
| No DELETE / TRUNCATE / role grants | Confirmed. | PASS |
| Auto-loaded by Supabase CLI? | NO. File is `seed.phase2_dev.sql`, not the default `seed.sql`. | PASS |
| Currently applied to dev? | NO. Verified: every Phase 2 table reports `rows = 0` in dev. | PASS |

**Verdict: KEEP, do NOT apply yet.** The seed is correctly designed and
safe to apply later. Apply only by an explicit human step (Supabase SQL
editor against `corent-dev`) when Concierge DB Beta work needs demo data.

---

## 9. Test Review

`npm test` → **231 passed, 20 test files, 425ms.**

| Test file | Coverage | Verdict |
|---|---|---|
| `src/server/backend/mode.test.ts` | Default safety; production gate; unknown values; explicit `mock`. 6 cases. | Meaningful. |
| `src/server/persistence/supabase/validators.test.ts` | UUID, optional UUID, all status enums, durations, prices, estimated value, item name, pickup area, components, safety code shape, item condition. ~40 cases. | Meaningful and broad. |
| `src/server/persistence/supabase/listingRepository.test.ts` | Fail-closed on null client; rejects every untrusted shape; happy path upserts both `listings` and `listing_verifications`; **explicitly asserts the listings payload does not contain `private_serial`**. | Meaningful. The string-grep on the upsert payload is a real defense. |
| `src/server/persistence/supabase/rentalIntentRepository.test.ts` | Fail-closed; rejects bad ids, bad statuses, bad durations, negative or oversized amounts, bad event actor, bad/oversized metadata. | Meaningful. |
| `src/lib/services/listingService.test.ts` | Deterministic SSR seed; fresh ids without seed; safety code stability under same idSeed. | Meaningful — the regression test directly maps to the hydration-mismatch fix. |
| `supabase/migrations/phase2.test.ts` | Migration text safety: RLS enabled on every table; no `using (true)` / `with check (true)` / `create policy`; revoke-all on every table + view; no payment / deposit / settlement / upload / identity tables; no phone / RRN / address / GPS columns; no Phase 1 table dropped or altered; no `grant select to anon`; `listings_public` excludes private columns and joins, filters to `'approved'`. | Meaningful. The grep is exactly the right check for a draft-stage SQL spec — it catches drift. |
| `src/server/admin/import-boundary.test.ts` | Marketplace persistence not imported from `src/components/**`; backend mode env boundary; `/admin/dev/db-health` route gated; no `SUPABASE_SERVICE_ROLE_KEY` leak via auth code; NEXT_PUBLIC_* deny-list. | Meaningful, defensive. |

What is **not** tested (and would benefit from a small follow-up):

- `listingRepository`'s read paths (`getListingById`, `listApprovedListings`)
  do not have a happy-path test against a mocked client — they have only a
  null-client fail-closed test. A mock-client read test would catch a future
  regression that mismaps a column.
- `adminReviewRepository` has no unit tests at all. Validation paths are
  trivial wraps over `validators.ts` (which is fully tested), but a fail-closed
  test and an XOR-listing-or-rental-intent test would be cheap to add.
- `marketplaceAggregates.ts` has no test. The `tally`/`countAll` helpers
  are untested. Risk is low (the function only returns counts) but a single
  fake-client test would prove it never returns row-level data.
- No end-to-end test that `/admin/dashboard` and `/admin/dev/db-health`
  actually 404 when not authenticated. The route gate logic is the same as
  Phase 1 (`requireFounderSession`) which is tested elsewhere.

These are **enhancements, not blockers**.

**Test verdict: meaningful and sufficient for the draft.** Add the missing
tests in the next PR.

---

## 10. /sell Hydration Fix Review

Commit `9aa5f45 fix: stabilize seller safety code rendering`.

- Root cause: `useState(() => listingService.draftFromInput(…))` ran on both
  the server (SSR) and the client (hydration). Each call generated a fresh
  random listing id via `crypto.randomUUID()`, which fed the per-listing
  safety-code generator, so the SSR-rendered safety code mismatched the
  hydration-rendered one.
- Fix: extend `draftFromInput` to accept optional `idSeed` and `at`. When
  passed, listing id becomes `li_${idSeed}`, verification id becomes
  `vi_${idSeed}`, safety code is derived from the listing id (already
  deterministic). When NOT passed, behavior is unchanged: random ids per call.
- `SellerRegistration` initial state passes a fixed seed (`demo_initial_seller_draft`)
  and a fixed `at` (`2026-04-30T00:00:00.000Z`). User-triggered re-extract
  clicks do not pass the seed — fresh ids per click, as before.
- Test (`listingService.test.ts`) verifies determinism with seed and
  freshness without seed.
- Build succeeds; no runtime warnings observed during `npm run build`.

Concerns:

- The deterministic id `li_demo_initial_seller_draft` is **not a UUID** and
  would be rejected by the Phase 2 `validateUuid` validator if it ever reached
  Supabase. This is intentional fail-closed: the demo initial draft is meant
  to be a placeholder, not a savable record. The user has to take an explicit
  action (e.g., "AI로 다시 추출", or eventually "submit") to mint a real id.
  When the next milestone wires `/sell` to the Supabase adapter, the submit
  path will need to mint a uuid server-side. **Worth recording in the
  next-steps section.**
- The fix is a real fix at the source, not a `useEffect`-after-mount hack.

**Verdict: KEEP.** Approve the deterministic SSR seed change. Document that
the demo id pattern (`li_demo_*`) is not adapter-savable and is correct as-is.

---

## 11. Dev Supabase State (verified read-only)

| Check | Result |
|---|---|
| Project | `corent-dev` (id `qjmybydhggtohjwfsyci`, region `ap-northeast-2`). |
| Migration history | `20260429210237 phase1_analytics`, `20260429215510 phase2_marketplace_draft`, `20260429215634 phase2_set_updated_at_search_path`. Matches doc claim. |
| Phase 1 tables intact | `growth_events`, `sanitizer_rejections` present, RLS enabled, comments unchanged. |
| Phase 2 tables present | All 11: profiles, seller_profiles, borrower_profiles, listings, listing_secrets, listing_versions, listing_verifications, rental_intents, rental_events, admin_reviews, admin_actions. |
| `listings_public` view | Present. |
| RLS enabled on every Phase 2 table | YES. |
| Policies on any Phase 2 table | 0. |
| anon / authenticated grants on Phase 2 tables + view | 0 across all 12 relations. |
| Seed rows present | 0 across every Phase 2 table. Seed not applied. |
| Smoke / accidental rows | None. |
| Advisors | 13 × `rls_enabled_no_policy` (intentional INFO), 1 × `auth_leaked_password_protection` WARN (pre-existing, unrelated). `function_search_path_mutable` is gone. |

Pending: Phase 1 tables (`growth_events`, `sanitizer_rejections`) still have
relation-level grants to anon / authenticated. RLS denies access; this is a
hygiene gap not a vulnerability. See §13.

---

## 12. Documentation Review

| Doc | Verdict | Notes |
|---|---|---|
| `docs/phase2_backend_integration_draft.md` | Accurate and safe. | Says "draft", lists what was/wasn't applied to dev, lists risks + mitigations, lists a founder review checklist, and a rollback path. Does not claim production readiness. |
| `docs/phase2_marketplace_schema_draft.md` | Accurate and safe. | Per-table sensitivity is honest (calls `listing_secrets` HIGH). Future-policy SQL sketches are documented as **not applied**. Rollback SQL listed. |
| Migration SQL comments | Accurate. | Header comment correctly states the boundary. Each table's comment cites the trust posture. The trigger function comment cites the search_path defense. |
| Seed file comments | Accurate. | "Run only against corent-dev, never prod." Idempotent posture explained. |

**Doc verdict: good enough.** Two small clarifications would help the next reviewer (see §13).

---

## 13. Recommended Changes

### Must fix before continuing Phase 2 work

(none)

### Should fix soon

1. **Phase 1 hygiene: revoke relation-level grants on `growth_events` /
   `sanitizer_rejections`.** Phase 2 sets the deny-by-default precedent;
   Phase 1 should match. A small migration that does `revoke all on
   public.growth_events from anon, authenticated;` (and the same for
   `sanitizer_rejections`) brings them in line. RLS already denies
   row access, so this is purely defense-in-depth — but it removes an
   asymmetry that future reviewers will keep flagging.
2. **Add three small repo tests:** happy-path read for `listingRepository`
   against a mocked client; XOR + fail-closed for `adminReviewRepository`;
   counts-only fail-closed for `marketplaceAggregates`. Cheap, prevents
   regression.
3. **Document the demo id pattern** in `phase2_backend_integration_draft.md`:
   the SSR initial draft id `li_demo_initial_seller_draft` is intentionally
   not a UUID and cannot be saved to Supabase — the user must take an
   explicit action to mint a savable record. (Currently inferable but not
   stated.)

### Can defer

4. **Future-policy migration** (owner-read-self for profiles /
   verifications / rental_intents; public read of `listings_public`).
   Already sketched in `phase2_marketplace_schema_draft.md`. Should ship
   only after a security review, per `docs/corent_security_gate_note.md`.
5. **Admin-side write surface for `listing_secrets`.** The table exists,
   but no adapter writes to it yet. Fine to defer to the first Concierge
   DB Beta task that needs it.
6. **`pickup_area` controlled vocabulary.** Currently free-text bounded
   to 60 chars. The schema's "coarse area only" guarantee is by convention,
   not by validation. Consider tightening to a `region_coarse_marketplace` enum
   value plus an optional short label, or adding a regex CHECK that bans
   common address-shape patterns. Not a blocker because RLS deny-all means
   nothing public can read these yet.
7. **Linking `/admin/dev/db-health` from the admin shell.** Recommend keeping
   it unlinked. Founder bookmark only.

### Founder decision required

8. Apply the seed `supabase/seed.phase2_dev.sql` to `corent-dev`? Recommend:
   later, when there is a concrete concierge UI that needs visible rows.
9. Set `CORENT_BACKEND_MODE=supabase` in `.env.local`? Only if the founder
   wants to see the dashboard panel locally. No public traffic effect.
10. Keep the `li_demo_initial_seller_draft` deterministic id? Recommend:
    yes (the alternative is reverting the hydration fix or moving to a
    different anti-mismatch strategy that costs more).
11. Consider the future-policy migration scope: do we want to skip the
    public `listings_public` grant for the next 60-90 days and rely entirely
    on server-side reads via service role? That keeps the public read surface
    closed until the security review is in.

---

## 14. Go / No-Go Recommendation

**GO — keep the Phase 2 draft as the dev-only foundation.**

The draft stayed inside the boundary, did not implement any of the gated
features, applied a deny-by-default RLS posture in dev that matches the
migration text, kept the public app behavior unchanged, and added the right
shape of validators and tests. There is no safety blocker. The remaining
items are either deferred (future-policy migration, seed application) or
small hygiene fixes (Phase 1 grants, three additional tests, one doc clarification).

No partial revert is recommended. No full revert is recommended.

---

## 15. Next PR Recommendation

**Decision-only / docs-only PR (no new code surface).**

Scope:

1. Founder-approval block at the top of `docs/phase2_backend_integration_draft.md`
   recording the founder's decisions on items 8–11 above.
2. Append a "Phase 1 grant hygiene follow-up" subsection to the same
   document and create a one-liner migration plan (no migration applied)
   to revoke the Phase 1 grants. Apply only after explicit approval.
3. Append a "Future RLS policy design note" to
   `docs/phase2_marketplace_schema_draft.md` enumerating the policies to
   review (already sketched), the security review checklist, and the
   intended rollout order: owner-read-self first, public-listing-read
   last (and only if/when needed).
4. Document the demo id pattern (item 3 in §13).

Out of scope for that PR: any code change, any new migration, any seed
application, any env flip, any policy add. Each of those is a separate
gated step.

After the docs PR is merged, the next *code* PR can be either:

- Phase 1 grant-hygiene migration (small, isolated), or
- The three test additions (item 2 in §13), or
- A first concrete Concierge DB Beta wiring (founder dashboard reads
  `admin_reviews` queue, for example) — but that is bigger and should
  follow a fresh review note.

---

## 16. Validation Results

```text
$ git status --short                        →  (clean)
$ git diff --check                          →  (no whitespace errors)
$ git check-ignore -v .env.local            →  .gitignore:34:.env*  .env.local
$ git ls-files --error-unmatch .env.local   →  not tracked (expected)
$ git rev-list --count origin/main..HEAD    →  26
$ npm run lint                              →  0 problems
$ bash scripts/check-server-no-console.sh   →  OK: no disallowed console.* calls under src/server/**
$ npm test                                  →  Test Files 20 passed (20), Tests 231 passed (231), 425ms
$ npm run build                             →  Compiled successfully (15 routes), TypeScript clean
```

Local browser smoke (`/`, `/sell`, `/privacy`, `/terms`, `/admin/login`,
`/admin/dashboard`, `/admin/dev/db-health`, `/api/events`) was **not**
exercised by this audit — `npm run build` succeeded with all routes
compiled. The Phase 2 draft did not change the public route shape; the
build's static-page generation succeeded for `/`, `/sell`, `/dashboard`,
`/items/[id]`, `/privacy`, `/search`, `/terms`. The only added route is
`/admin/dev/db-health`, which is a 404 outside dev + founder context.

Read-only Supabase MCP queries used:

- `list_projects` → confirmed `corent-dev` `qjmybydhggtohjwfsyci`.
- `list_migrations` → 3 migrations as documented.
- `list_tables(public)` → 13 tables, all `rls_enabled = true`, all rows = 0
  for the Phase 2 set.
- `pg_policies` query → 0 rows.
- `role_table_grants` query → 0 anon/authenticated grants on every Phase 2
  relation; pre-existing grants on Phase 1 tables noted.
- `get_advisors security` → only intentional INFO + pre-existing WARN.

No write SQL was executed. No data was mutated. No seed was applied. No
migration was applied. No env was flipped. No production system was touched.

---

## 17. Final Git Status

```text
On branch main
Your branch is ahead of 'origin/main' by 26 commits.
nothing to commit, working tree clean
```

This review created exactly one new file:
[`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md)
(this document). No commit was created during this audit.

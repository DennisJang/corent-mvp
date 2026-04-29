# Phase 2 Backend Integration Draft

Status: **DRAFT** — dev-only Supabase wiring landed in a single PR for
review. Public traffic and product behavior are unchanged. Do not treat
this as a launch milestone.

Companion documents:

- [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md) — schema posture, sensitivity, future RLS direction
- [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql) — the migration itself
- [`supabase/seed.phase2_dev.sql`](../supabase/seed.phase2_dev.sql) — fake-only demo seed (not auto-applied)
- [`docs/db_readiness_audit_v1.md`](db_readiness_audit_v1.md), [`docs/phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md), [`docs/corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md), [`docs/corent_security_gate_note.md`](corent_security_gate_note.md), [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md), [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)

---

## What this draft is

A first-cut Postgres + Supabase backend for the CoRent marketplace
domain (profiles, listings, rental intents, admin review) plus a
server-only adapter layer that talks to it. Default behavior is
unchanged: every page still uses the mock + localStorage path. Phase 2
only lights up when an operator deliberately sets
`CORENT_BACKEND_MODE=supabase` in dev.

## What this draft is NOT

- Not a path to production. The schema is dev-only; the runtime gate
  refuses `supabase` mode in `NODE_ENV=production`.
- Not a payment / deposit / settlement / payout integration. Those are
  gated by [`docs/corent_security_gate_note.md`](corent_security_gate_note.md) and the legal/trust note.
- Not a photo / file upload integration.
- Not a location-based matching feature.
- Not an external-partner data dashboard.
- Not an AI-parser API call.

---

## Schema overview

| Table | Notes |
| --- | --- |
| `profiles` | 1:1 with `auth.users.id`. Email + display name only. |
| `seller_profiles` | Seller metadata, layered on `profiles`. |
| `borrower_profiles` | Borrower metadata, layered on `profiles`. |
| `listings` | Public-facing rentable item. No private columns. |
| `listing_secrets` | Owner+admin-only private serial number + internal pickup hint. |
| `listing_versions` | Append-only listing edit history. |
| `listing_verifications` | Per-listing safety code + photo proof flags. |
| `rental_intents` | Stripe-style central transactional row. Mirrors `src/domain/intents.ts`. |
| `rental_events` | Append-only state-transition log per rental. |
| `admin_reviews` | Founder/admin review queue (listings or rental intents). |
| `admin_actions` | Append-only admin audit log. |
| `listings_public` (view) | Sanitized read shape. NOT granted to anon yet. |

Enums added: `listing_status`, `listing_verification_status`,
`rental_intent_status` (full happy-path + failure set), `admin_review_status`,
`admin_action_type`, `region_coarse_marketplace`, `item_condition`.

Phase 1 enums (`category_id`, `region_coarse`, `growth_event_type`,
`consent_state`) are **not** redefined; the schema reuses `category_id`.

## RLS posture

Every Phase 2 table has RLS enabled with **no permissive policies**. As
defense in depth, the migration also `revoke all on … from anon, authenticated`
for every Phase 2 relation, including `listings_public`. anon and
authenticated roles cannot read or write anything; only the
service-role client (server-only) can. Future read policies (owner-read-self,
public-listing-read-where-status-approved) are sketched in the schema
draft document and will be applied in a follow-up migration after a
security review.

## Adapter design

Phase 2 introduces server-only marketplace adapters under
[`src/server/persistence/supabase/`](../src/server/persistence/supabase/):

- `client.ts` — service-role client factory. Returns `null` when env is
  missing or `getBackendMode() !== "supabase"`. Tagged with
  `x-corent-source: phase2-marketplace` so logs in the Postgres role
  audit are clearly attributable.
- `validators.ts` — pure functions that reject any client-supplied id,
  status, role, price, or text shape. Mirrors (and is slightly stricter
  than) the schema's CHECK constraints.
- `listingRepository.ts` — `listings` + `listing_verifications` CRUD.
  Listing reads do **not** join `listing_secrets`.
- `rentalIntentRepository.ts` — `rental_intents` CRUD + `rental_events`
  append.
- `adminReviewRepository.ts` — `admin_reviews` queue + `admin_actions`
  audit log.
- `marketplaceAggregates.ts` — counts-only reader for the founder admin
  dashboard's optional Phase 2 panel and the dev DB health route.

Hard rules enforced by tests in
[`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts):

- `@/server/persistence/supabase/**` is never imported from
  `src/components/**`.
- The marketplace repos never reference `SUPABASE_ANON_KEY` or
  `readSupabaseAuthEnv`. The auth path stays separate.
- The backend mode module reads only `CORENT_BACKEND_MODE` and
  `NODE_ENV` — never any Supabase env.
- The Phase 2 dev DB-health route lives behind
  `requireFounderSession` and `NODE_ENV !== "production"`.

## Backend mode

A small, deliberately narrow runtime switch:

```
CORENT_BACKEND_MODE=mock        # default; current behavior, no DB
CORENT_BACKEND_MODE=supabase    # dev-only Phase 2 path
```

[`src/server/backend/mode.ts`](../src/server/backend/mode.ts):

- Default = `mock`. Empty / missing / unknown values = `mock`.
- `supabase` is refused in production (`NODE_ENV=production` → `mock`).
- This is **not** a feature-flag framework. It is one switch with two
  values.

The default for Phase 2 PRs is to leave UI unchanged: every page still
uses the mock + localStorage adapter. The Supabase path is reachable
only by:

- the founder admin dashboard (Phase 2 aggregates panel — only renders
  when env is set and backend mode is `supabase`)
- the dev-only DB health route at `/admin/dev/db-health`
- explicit server-side calls in future Concierge DB Beta wiring

## Seed strategy

[`supabase/seed.phase2_dev.sql`](../supabase/seed.phase2_dev.sql) holds an
obviously-fake demo dataset:

- Demo profiles (no real names / emails / phone numbers)
- Demo listings + verifications
- One demo rental intent + one rental event
- One pending admin review

The file is **not** named `seed.sql` to avoid the Supabase CLI's default
pickup. Apply only by an explicit human step (Supabase SQL editor,
targeting `corent-dev`). Do not run against any non-dev project.

## Tests

New tests added in this draft:

- [`src/server/backend/mode.test.ts`](../src/server/backend/mode.test.ts) — backend mode default safety; production gate.
- [`src/server/persistence/supabase/validators.test.ts`](../src/server/persistence/supabase/validators.test.ts) — every validator rejects unsafe input.
- [`src/server/persistence/supabase/listingRepository.test.ts`](../src/server/persistence/supabase/listingRepository.test.ts) — fail-closed when client unavailable; rejects non-uuid id, unknown status, unknown category, unknown condition, oversize components, malformed safety code, negative / over-bounds prices, over-bounds estimated value; happy path upserts both `listings` and `listing_verifications` and never serializes `private_serial_number`.
- [`src/server/persistence/supabase/rentalIntentRepository.test.ts`](../src/server/persistence/supabase/rentalIntentRepository.test.ts) — fail-closed; rejects non-uuid id, unknown status, unknown duration, negative / over-bounds amounts, unknown event actor, oversize / non-object metadata.
- [`supabase/migrations/phase2.test.ts`](../supabase/migrations/phase2.test.ts) — RLS enabled on every Phase 2 table; **no** `using (true)` / `with check (true)` / `create policy`; `revoke all` on every Phase 2 relation; no payment / deposit / settlement / upload / identity tables; no phone / RRN / address / GPS columns; no Phase 1 table dropped or altered; no `grant select to anon` anywhere; `listings_public` view excludes private columns and joins, filters to `status='approved'`.
- [`src/lib/services/listingService.test.ts`](../src/lib/services/listingService.test.ts) — deterministic SSR seed path; fresh-id behavior when no seed.
- Updated [`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts) — Phase 2 marketplace persistence boundary, backend-mode env boundary, dev DB-health gate.

All 230+ tests pass.

## What was applied to dev Supabase

- Project: `corent-dev` (id `qjmybydhggtohjwfsyci`, region `ap-northeast-2`).
- Migration name: `phase2_marketplace_draft` (timestamp `20260429215510`).
- Follow-up: `phase2_set_updated_at_search_path` — sets `search_path = ''`
  on the trigger function to clear the `function_search_path_mutable`
  advisor warning.

Verified post-apply:

- All 11 Phase 2 tables present, all RLS-enabled.
- `pg_policies` returns 0 rows for every Phase 2 table.
- `information_schema.role_table_grants` returns 0 rows for anon /
  authenticated on every Phase 2 relation.
- Phase 1 tables (`growth_events`, `sanitizer_rejections`) unchanged.
- `get_advisors(security)` shows only the intentional
  `rls_enabled_no_policy` INFO notices (matching the Phase 1 posture)
  and a pre-existing `auth_leaked_password_protection` WARN unrelated
  to Phase 2.

## What was NOT applied to dev Supabase

- The seed file. Concierge demo data is not present yet; apply the seed
  only when explicitly desired.
- Any DDL outside the migration above.
- Any GRANT or POLICY change.

## Risks

| Risk | Mitigation |
| --- | --- |
| Anon key is later wired into client and accidentally reaches Phase 2 tables. | RLS is deny-by-default AND `revoke all` from anon/authenticated; the import-boundary test forbids `@/server/persistence/supabase` in client components. |
| Service-role key leaks via NEXT_PUBLIC_*. | Existing import-boundary test denies any `NEXT_PUBLIC_*` matching `(SERVICE_ROLE\|SECRET\|PRIVATE\|TOSS\|OPENAI\|ADMIN\|ALLOWLIST)` and fails CI. |
| Adapter trusts a client-supplied status / amount. | Repos run every input through `validators.ts`; tests cover each rejection. The DB CHECK constraints catch anything that slips through. |
| Phase 2 path lights up in production. | `getBackendMode()` returns `mock` whenever `NODE_ENV=production`, even if the env asks for `supabase`. The `/admin/dev/db-health` route hard-404s in production. |
| Schema drift between domain types and DB columns. | Repos map row → domain explicitly and tests assert the round-trip rejection paths. The schema mirrors `src/domain/intents.ts` documented enums. |
| Seed data accidentally applied to prod. | Seed file uses a non-default name (`seed.phase2_dev.sql`) so the Supabase CLI does not auto-load it; the seed comments say "dev-only, never prod"; no automation applies it. |

## Next review checklist (founder)

- [ ] Read `docs/phase2_marketplace_schema_draft.md` and confirm the
  table list / sensitivity model is what we want for Concierge DB Beta.
- [ ] Skim the migration; confirm no surprises.
- [ ] Confirm RLS posture (deny-all + revoke-all) is acceptable for the
  dev-only window; agree that the future-policy migration is a
  separate review.
- [ ] Confirm the seed file is what to load when Concierge demo work
  starts. Or replace it.
- [ ] Decide whether to land the `/sell` SSR-stable seed change
  (`listingService.draftFromInput({ idSeed, at })`) — it removes the
  hydration mismatch but is a small product-visible change to the
  initial demo draft (id is now `li_demo_initial_seller_draft` instead
  of a random uuid).
- [ ] Decide whether `CORENT_BACKEND_MODE=supabase` should be added to
  the local dev env (`.env.local`) so the Phase 2 admin panel renders
  on the founder dashboard.
- [ ] Decide whether `/admin/dev/db-health` should be linked into the
  admin shell, or stay reachable only by direct URL.

## Rollback notes

The migration is additive. Rollback is dev-only and requires an
explicit founder approval. SQL is in `docs/phase2_marketplace_schema_draft.md`
under "Rollback notes". Phase 1 tables and types must not be dropped by
a Phase 2 rollback.

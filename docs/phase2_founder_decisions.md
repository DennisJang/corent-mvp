# Phase 2 Founder Decisions

Status: **DECIDED**, docs-only. Recorded: 2026-04-30.
Companion: [`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md).

---

## 1. Summary

The Phase 2 backend integration draft (commits `64db215`, `1708ad7`, plus
the `/sell` hydration fix in `9aa5f45`) is **kept as the dev-only
foundation** of the CoRent marketplace schema and server-only Supabase
adapter layer. This decision does **not** approve production rollout,
public beta traffic, payment / deposit / settlement / upload / identity /
location work, real personal data collection, permissive RLS policies, or
any flip of `ENABLE_ANALYTICS_BETA`. The default runtime remains
`CORENT_BACKEND_MODE=mock`; the public app continues to use the in-memory
+ `localStorage` adapters; production refuses `supabase` mode regardless
of env. All deferred items remain gated by the security review per
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md).

---

## 2. Decision Table

| Area | Decision | Status | Notes |
| --- | --- | --- | --- |
| Phase 2 draft | Keep migration + server-only adapter draft as dev-only foundation. | KEPT | No public/user-facing behavior approved by this entry. |
| Seed file (`supabase/seed.phase2_dev.sql`) | Do not apply yet. Keep file in repo. | DEFERRED | Deferred until local founder dashboard QA requires fake rows. Application requires a separate explicit approval. Dev-only, fake-data-only. |
| Local Supabase mode (`CORENT_BACKEND_MODE=supabase`) | Allowed in `.env.local` for founder review. Default remains `mock`. Production refuses. | ALLOWED WITH LIMITS | Allowed for local/dev founder review only; default remains mock. Not a public beta switch. Not connected to `ENABLE_ANALYTICS_BETA`. |
| Deterministic demo ID (`li_demo_initial_seller_draft`) | Keep deterministic SSR seed in `SellerRegistration` initial draft. | ACCEPTED | Accepted as a demo-only deterministic SSR seed. User-triggered re-extract still mints fresh IDs/codes. Not a DB identity pattern. |
| Future RLS policy migration | Defer owner-read-self + public-listing-read policies. Keep deny-all / service-server-only posture. | DEFERRED | Deferred until Phase 2 user ownership and public listing boundaries are explicitly designed. New policies require a separate security review. No broad `using (true)` / `with check (true)` policies. |
| Phase 1 grant-hygiene follow-up | Plan a separate, non-destructive cleanup. | PLANNED, NOT APPLIED | Phase 1 analytics tables remain intentionally deny-by-default via RLS. Any cleanup must not weaken RLS, must not grant anon/authenticated access, and must be reviewed before applying to dev/prod. |
| Public beta | Not approved. | NOT APPROVED | No public traffic, no listing visibility surface, no contact exchange. |
| Analytics flag (`ENABLE_ANALYTICS_BETA`) | Remains `false`. | NOT FLIPPED | Separate gate from `CORENT_BACKEND_MODE`. Not approved here. |

---

## 3. Accepted As-Is

The following items from the Phase 2 backend draft are accepted as-is and
require no change before further work:

- The migration file [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql) (and its companion `20260429215634 phase2_set_updated_at_search_path` already applied to `corent-dev`).
- The server-only Supabase adapter draft under [`src/server/persistence/supabase/`](../src/server/persistence/supabase/), including `client.ts`, `validators.ts`, `listingRepository.ts`, `rentalIntentRepository.ts`, `adminReviewRepository.ts`, `marketplaceAggregates.ts`, and the `index.ts` barrel.
- The deny-all RLS posture (RLS enabled on every Phase 2 table; zero policies; `revoke all` from anon/authenticated on every Phase 2 relation including `listings_public`).
- `listing_secrets` isolation: separate table, deny-all, never joined into any public listing read, never serialized by the listing repository.
- `listings_public` view exists but is **ungranted** to anon/authenticated. Granting waits on a future security review.
- `CORENT_BACKEND_MODE` default of `mock` and the production refusal of `supabase` regardless of env.
- The `/sell` hydration fix in `src/lib/services/listingService.ts` and `src/components/SellerRegistration.tsx` (commit `9aa5f45`).

---

## 4. Accepted With Limits

The following items are accepted only within the limits listed.

- `CORENT_BACKEND_MODE=supabase`
  - Local/dev only.
  - Founder review only.
  - Not production. Production always falls back to `mock`.
  - Not connected to `ENABLE_ANALYTICS_BETA`.
- `/admin/dev/db-health`
  - Direct/admin-only use. Reachable only by typed URL.
  - No public link from the admin shell required yet.
  - Returns aggregate counts only; never row-level data; never echoes env values.
  - Hard-404 in production and without a founder session.
- Seed file `supabase/seed.phase2_dev.sql`
  - Keep in the repo.
  - Do not apply yet.
  - Apply only with explicit founder approval, only against `corent-dev`.

---

## 5. Deferred

The following items are deferred. Each requires a fresh approval gate
before any work begins; several also require a security review note per
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md).

- Seed application against `corent-dev`.
- Future RLS policy migration (owner-read-self for profiles, listing_verifications, rental_intents/events).
- Public listing read policy (`grant select on public.listings_public to anon, authenticated`).
- Real user profile creation flows (anything that writes a real human's email / name to `profiles` / `seller_profiles` / `borrower_profiles`).
- Public beta traffic to any DB-backed surface.
- `ENABLE_ANALYTICS_BETA=true`.
- Payment integration (Toss or other PG, deposit holds, settlement, payouts).
- Upload / photo storage (private bucket, signed URLs, owner-validated writes).
- Exact pickup location / GPS / address collection.
- Contact exchange between borrower and seller.
- External / partner dashboard (sanitized snapshot tables, public-facing aggregates).
- Real AI parser API (currently rule-based mock only).

---

## 6. Not Approved

This decision note **does not approve** any of the following. Each
remains explicitly out of scope until a separate, named approval gate is
cleared.

- Production rollout of any Phase 2 surface.
- Public beta on any DB-backed surface.
- `ENABLE_ANALYTICS_BETA=true`.
- Any permissive RLS policy (including `using (true)`, `with check (true)`, broad `grant select to anon`, or owner-read policies that have not been individually reviewed).
- Seed application.
- Payment / upload / exact-location work.
- Collection of real personal data (real names, real emails, real phone numbers, real addresses, RRN / national ID).
- External / partner dashboard or any non-founder-facing data surface.

---

## 7. Next Steps

1. Founder runs local visual QA against the existing demo path (`/`, `/sell`, `/items/[id]`, `/dashboard`, `/search`, `/privacy`, `/terms`) to confirm no regression from the Phase 2 stack and the `/sell` hydration fix.
2. Founder may set `CORENT_BACKEND_MODE=supabase` in `.env.local` if they want to see the Phase 2 DB-backed founder dashboard panel and the `/admin/dev/db-health` aggregates locally. Default stays `mock` everywhere else.
3. Founder retries magic-link only after the existing rate limit clears, using the newest link only. Magic-link will not be retried as part of this docs session.
4. Authenticated `/admin/dashboard` visual QA remains **pending** until magic-link succeeds and a founder session is established.
5. Decide separately whether to apply `supabase/seed.phase2_dev.sql` against `corent-dev`. The seed is dev-only and fake-only; application requires an explicit founder approval and a separate task.
6. Keep `ENABLE_ANALYTICS_BETA=false`.

---

## 8. Review References

- [`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md)
- [`docs/phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md)
- [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md)
- [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql)
- [`supabase/seed.phase2_dev.sql`](../supabase/seed.phase2_dev.sql)

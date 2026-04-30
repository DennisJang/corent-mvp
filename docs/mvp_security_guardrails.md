# MVP Security Guardrails

Status: **MVP** — pre-revenue beta posture. This document explains what is
currently protected, what is not production-ready, and the assumptions we
hold while real auth and real money movement remain off.

The companion documents are
[`docs/corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md),
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md),
[`docs/phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md), and
[`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md).

---

## 1. Current Auth Status — MOCK

There is **no real per-user authentication** in the consumer app today.

- The only "session" used by consumer pages (`/sell`, `/dashboard`,
  `/items/[id]`) is the hardcoded `CURRENT_SELLER` constant from
  [`src/data/mockSellers.ts`](../src/data/mockSellers.ts), surfaced
  through [`src/lib/auth/mockSession.ts`](../src/lib/auth/mockSession.ts).
  The helper is the **only** approved way to read the mock identity in
  new code; the boundary file documents the migration shape for real auth.
- The founder admin surface (`/admin/dashboard`, `/admin/dev/db-health`)
  is the **only** route group with a real session today. It uses
  Supabase magic-link via `@supabase/ssr` plus a server-side allowlist
  check in [`src/server/admin/auth.ts`](../src/server/admin/auth.ts).
  Missing session, missing email, or non-allowlisted email all return
  404 (not 401) so the admin surface is invisible to unauthenticated
  visitors.
- Consumer pages have no concept of "logged-in user". All listing /
  rental writes happen in the visitor's own browser via the
  [`LocalStoragePersistenceAdapter`](../src/lib/adapters/persistence/localStorageAdapter.ts).
- The Phase 2 server-only Supabase adapters (`src/server/persistence/supabase/**`)
  exist as a draft. They are dev-only, refused in production, and
  unreachable from the public app — see
  [`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md).

**Treat the mock identity as a placeholder. It cannot authorize anything.**

---

## 2. What Is Protected Today

These guardrails are in place and tested.

### Identity / auth boundaries
- **Mock session is explicit.** [`src/lib/auth/mockSession.ts`](../src/lib/auth/mockSession.ts)
  is the named entry point. The module's header makes the mock-only
  status unmissable. Every new caller of the "current user" should go
  through `getMockSellerSession()`, not through `CURRENT_SELLER` directly.
- **Founder admin auth is server-side.** Allowlist check in
  `requireFounderSession` returns 404 on every failure mode. The
  allowlist comes from `FOUNDER_ADMIN_EMAIL_ALLOWLIST` (server-only env).
- **Service-role key never reaches the client.** Static-text test in
  [`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts):
  no `NEXT_PUBLIC_*` variable name may match `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)`.
  CI fails if it does.

### Ownership / authorization
- **Reusable ownership guards** in [`src/lib/auth/guards.ts`](../src/lib/auth/guards.ts).
  `assertListingOwnedBy`, `assertRentalSellerIs`, `assertRentalBorrowerIs`,
  `assertRentalParty` each throw a typed `OwnershipError` with a stable
  `code` field. Use them at any new write boundary that mutates a
  listing or rental on behalf of a specific user.
- **Server-side validators** in
  [`src/server/persistence/supabase/validators.ts`](../src/server/persistence/supabase/validators.ts)
  reject every untrusted client-supplied id, status, role, price, and
  text shape. Used by the Phase 2 marketplace repos.
- **RLS deny-by-default** on every Phase 2 table in `corent-dev`. No
  policies, no anon/authenticated grants. Verified by
  [`supabase/migrations/phase2.test.ts`](../supabase/migrations/phase2.test.ts)
  and by the dev metadata audit recorded in
  [`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md).

### State transitions
- **Centralized state machine** for `RentalIntent` in
  [`src/lib/stateMachines/rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts).
  The `ALLOWED_TRANSITIONS` map declares every legal `from → to`. Terminal
  states (`settled`, `cancelled`, `seller_cancelled`, `borrower_cancelled`)
  are locked via `[]`. `canTransition()` is the single check; every
  transition function returns either the next intent + a `RentalEvent`
  or a structured `invalid_transition` error. Forward-compatible failure
  states (`payment_failed`, `pickup_missed`, `return_overdue`,
  `damage_reported`, `dispute_opened`, `settlement_blocked`) are
  first-class — no rewrite needed when deposit / dispute / return-
  verification flows are added.

### Input validation
- **Client-side draft validator** in
  [`src/lib/validators/listingInput.ts`](../src/lib/validators/listingInput.ts):
  `validateListingDraft` throws on negative or oversized prices,
  unknown category / status / condition, oversize text, oversize
  components arrays, etc. Wired into `listingService.saveDraft` and
  `listingService.submitForReview` so any local write that drifts past
  the documented bounds fails fast.
- **Server-side strict validator** in
  [`src/server/persistence/supabase/validators.ts`](../src/server/persistence/supabase/validators.ts)
  is the second wall — UUID-strict, mirrors the DB CHECK constraints,
  used by every Phase 2 repo write.
- **Database CHECK constraints** in
  [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql)
  are the third wall.

### Environment safety
- Server-only env reads live in [`src/server/analytics/env.ts`](../src/server/analytics/env.ts)
  and [`src/server/admin/auth-env.ts`](../src/server/admin/auth-env.ts).
- `.env.example` and `.env.local.example` document which variables are
  **server-only** (`SUPABASE_SERVICE_ROLE_KEY`,
  `FOUNDER_ADMIN_EMAIL_ALLOWLIST`, `ANALYTICS_INGEST_SHARED_SECRET`,
  `CORENT_BACKEND_MODE`) and which are browser-safe
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- `.env.local` is git-ignored (`.gitignore:34`) and never tracked.
- The structured logger in [`src/server/logging/logger.ts`](../src/server/logging/logger.ts)
  is the only approved logging path for server code; raw `console.*`
  is forbidden under `src/server/**` and enforced by
  [`scripts/check-server-no-console.sh`](../scripts/check-server-no-console.sh).
- Adapter route handlers (admin auth callback, sign-in, /api/events)
  log only short reason codes — never email, token, session body, or
  any env value. Asserted by `import-boundary.test.ts`.

### Backend mode
- [`src/server/backend/mode.ts`](../src/server/backend/mode.ts):
  `CORENT_BACKEND_MODE` defaults to `mock`. Production refuses
  `supabase` regardless of env. Unknown / empty values fall back to
  `mock`. Tested.

---

## 3. What Is NOT Production-Ready

This is the honest list. Each item is gated by an explicit approval per
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md).

- **Real per-user authentication.** Consumer pages run with a hardcoded
  mock seller. Anyone can "be" the mock seller because there is no
  session.
- **Cross-user write authorization.** The ownership guards exist and
  are tested, but they are not yet wired into every write path. The
  current MVP is single-actor (the visitor's own browser) so this gap
  is not exploitable today; once real auth ships, every service write
  must `assertListingOwnedBy` / `assertRentalSellerIs` / etc.
- **Server-side write enforcement.** Today the in-memory persistence
  is the only path. The Phase 2 Supabase adapter is dev-only and
  unreachable from the public app.
- **RLS read policies.** Phase 2 schema is deny-by-default. Owner-read-self
  and public-listing-read policies are deferred per
  [`docs/phase2_founder_decisions.md`](phase2_founder_decisions.md).
- **Audit log retention / scheduled jobs.** The `admin_actions` and
  `rental_events` tables are append-only by design, but no retention or
  rotation jobs run yet.
- **Abuse / rate-limit defenses on consumer paths.** `/api/events` has
  basic ingest protection (sanitizer + shared-secret token). No other
  consumer path has rate limiting yet.
- **Real money movement.** No payment, deposit, settlement, or payout
  is implemented. The fields on `RentalIntent` exist for forward-
  compatibility only; the mock payment adapter never moves money.
- **Photo / file upload pipeline.** `listing_verifications` stores
  boolean flags only — no buckets, no signed URLs, no owner-validated
  writes.
- **Identity / KYC.** No phone, no national ID / RRN, no full address.
  The schema rejects those fields explicitly via the migration text-
  safety test.
- **Exact pickup location / GPS.** Coarse free-text labels only,
  bounded ≤ 60–80 chars. A controlled vocabulary or stricter regex is
  on the deferred list.
- **Dispute automation, bot detection, WAF, CAPTCHA, SBOM, SAST/DAST.**
  Out of scope for this pass per
  [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md).
- **External / partner data dashboard.** Not implemented; defensibility
  posture in [`docs/corent_defensibility_note.md`](corent_defensibility_note.md)
  forbids exposing demand / supply / conversion data publicly.

---

## 4. Assumptions Before Real Users

The current guardrails are written **assuming** all of the following hold.
If any one of them breaks, the threat model breaks and a fresh review is
required.

1. **No real users.** The consumer pages are visited by the founder, by
   internal demo viewers, and by the AI dev tooling. There is no
   account creation, no password, no third-party identity provider in
   the app today.
2. **No money movement.** The mock payment adapter writes only to a
   process-local map (`globalThis.__corentMockPaymentStore`). No PG /
   Toss integration, no deposit, no payout.
3. **Single-tab, single-actor mutations.** All consumer writes go to
   the visitor's own `localStorage`. There is no shared state and no
   cross-user write path.
4. **Phase 2 Supabase mode is opt-in dev-only.** Production builds
   refuse `CORENT_BACKEND_MODE=supabase`. The dev DB-health route 404s
   in production.
5. **`ENABLE_ANALYTICS_BETA=false`.** Phase 1 analytics ingest is off
   by default; flipping it requires a separate review.
6. **`.env.local` stays local.** Real secrets are set in Vercel project
   settings; templates only are tracked.

---

## 5. Future Required Work

When the MVP graduates to a real-user beta, these become hard
requirements (not nice-to-haves). Each will need its own review note
and an explicit founder approval.

1. **Real auth.** Replace `getMockSellerSession()` with a server-resolved
   session bound to a signed cookie. Delete the mock branch. Migrate
   every component that currently imports `CURRENT_SELLER` /
   `getMockSellerSession`.
2. **Server-side authorization on every write.** Every service method
   that mutates a listing or a rental must run `assertListingOwnedBy`
   / `assertRentalSellerIs` / `assertRentalBorrowerIs` against the
   server-resolved session id.
3. **Narrow RLS read policies** (owner-read-self for profiles, listing
   verifications, rental intents/events; sanitized public-listing read
   via the `listings_public` view). Each policy must be reviewed
   individually before being applied. See sketches in
   [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md).
4. **Audit logs + retention jobs.** Append-only audit tables exist;
   add retention rotation and a way to query them safely from the
   admin shell.
5. **Abuse / rate-limit defenses.** At minimum, per-IP rate limit on
   any consumer write endpoint and a captcha-like challenge on signup.
6. **Deposit / dispute / return-verification security.** Money-bearing
   transitions must be server-driven. Client-supplied amounts are
   advisory only. Webhook signatures verified, idempotency keys
   enforced, reconciliation runs daily. Dispute resolution must have an
   immutable audit trail.
7. **Real payment provider integration.** Toss Payments (or chosen PG)
   with partner-mediated money movement, per
   [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md).
   No CoRent wallet.
8. **Photo / upload pipeline** behind private buckets with signed URLs,
   owner-validated writes, and explicit serial-number isolation in the
   private bucket — never on the listing record.
9. **Privacy / terms / consent flow.** A consent capture and a clear
   data-controller statement before any field that is even arguably
   PII is written off-device.

---

## 6. Implementation Notes for Contributors and AI Agents

If you are adding a new write path, new admin action, new persistence
write, or new authorization check, follow these rules.

- **Never trust client-side state for authorization.** UI state, URL
  params, request bodies, and `localStorage` are not authority. The
  authority is either (a) the server-resolved founder session for admin
  routes, or (b) the future server-resolved user session. There is no
  third option.
- **Prefer routing every write through a service.** Services live in
  `src/lib/services/`. UI components must not call adapters or state
  machines directly — see the `RentalIntent` flow in
  `src/lib/services/rentalService.ts` for the pattern.
- **Use the centralized state machine.** New rental status transitions
  must be added to `ALLOWED_TRANSITIONS` in
  `rentalIntentMachine.ts`. Never hand-roll a status change.
- **Use the ownership guards.** When a write happens on behalf of a
  specific user, run `assertListingOwnedBy` /
  `assertRentalSellerIs` / `assertRentalBorrowerIs` before mutating.
  These throw `OwnershipError` with a typed `code`.
- **Validate input at the write boundary.** For the in-memory path,
  use `validateListingDraft`. For the Phase 2 Supabase path, the
  repository validators run automatically on every upsert.
- **Never put a server-only secret behind a `NEXT_PUBLIC_*` name.** The
  import-boundary test will fail CI. The deny-list regex matches
  `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)`.
- **Never use `console.*` in `src/server/**`.** Use the structured
  logger in `src/server/logging/logger.ts`. Log short reason codes,
  never email / token / session / env values.
- **Never bypass an existing guard with a `// TODO`.** If a flow
  requires loosening a guard, that is a separate review-gated change.

---

## 7. References

- [`docs/corent_security_gate_note.md`](corent_security_gate_note.md) — what each integration requires before it can ship
- [`docs/corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md) — Phase 1 security review (analytics + admin auth)
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) — C2C marketplace posture, no wallet, partner-mediated payment
- [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) — pre-revenue posture, runtime modes / feature flags
- [`docs/phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md), [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md), [`docs/phase2_backend_draft_review.md`](phase2_backend_draft_review.md), [`docs/phase2_founder_decisions.md`](phase2_founder_decisions.md) — Phase 2 dev backend stack

# CoRent DB Readiness Audit v1

_Recorded: 2026-04-30_

**Audit window:** repo state at commit `5277f09 docs: clean stale product logic artifacts`, `main` 17 commits ahead of `origin/main`, working tree clean. MVP v1 browser-demoable per [`corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md).

**This is an audit and migration plan only.** No DB, payment, feature flags, dependencies, migrations, or source code changes were produced by this session. All recommendations below are gated on explicit user approval per [`agent_loop.md`](agent_loop.md), and the security gate in [`corent_security_gate_note.md`](corent_security_gate_note.md) governs which integrations require which prior reviews.

**Direction inputs that govern this audit** (priority order on conflict):
[`corent_product_direction_v2.md`](corent_product_direction_v2.md),
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
[`corent_security_gate_note.md`](corent_security_gate_note.md),
[`corent_defensibility_note.md`](corent_defensibility_note.md).

**Note on the session-prompt brief:** the calling brief described CoRent as a "Seoul beta rental/sharing platform". That phrasing is from an older framing. Per Direction v2 §2 and legal/trust §5, the product direction is **Korea-wide**; Seoul is a demo/test region only. This audit treats Korea-wide as authoritative. Region-typed code (`region: "seoul"` literal in domain types) is flagged as a Phase 2 alignment item below.

---

## 1. Executive Summary

### Current data state

CoRent has **no real persistence beyond the user's own browser tab.** All "data" is one of four kinds: in-memory state in React, hardcoded TypeScript fixtures, derived calculations from those fixtures, or JSON blobs in the user's `localStorage`. There is no shared database, no server-side write path, no real authentication, no real payment, no real upload, no telemetry. There is exactly one server-side data store at all (the mock-payment session map on `globalThis`) and it is intentionally process-local.

### What is browser/local/mock only

- Every `RentalIntent`, `ListingIntent`, `SearchIntent`, `RentalEvent` lives only in `localStorage` keys under the `corent:` namespace, written by `LocalStoragePersistenceAdapter`. SSR uses `MemoryPersistenceAdapter`, which forgets on every request.
- All seller, product, and dashboard fixtures (`PRODUCTS`, `SELLERS`, `MOCK_RENTAL_INTENTS`, `LISTED_ITEMS`) are hardcoded TypeScript constants.
- The mock payment adapter stores sessions on `globalThis.__corentMockPaymentStore` — process-local, not durable, not shared.
- The mock AI parser is rule-based regex/keyword matching with no network call.

### Demo-safe

- Browser-local demo against the static MVP. The user is the only actor; no other users exist; no real money moves; no PII collected; no upload accepted.
- Seed/clear affordances on `/dashboard` (`모의 대여 추가` / `로컬 데이터 비우기`) are safe — they touch only the user's own browser.

### Beta-blocking (must exist before any public beta, even pre-revenue / no-payment)

- A **server-side analytics event sink** with explicit anonymity/sanitization rules. Any "we collected this" surface that is shared across users must not run from `localStorage`.
- A **privacy/terms disclosure** layer before any field that is even arguably PII is written anywhere off-device.
- A **no-PII contract** for what beta collects (see §6.1) backed by code-level redaction (no raw search text → server without sanitization, no addresses, no phone numbers, no contact info).
- A **single declared data-controller identity** (which entity stores what, where, for how long) before any inbound user data leaves the browser.

### Launch-blocking (must exist before any paid transaction post-2026-07-13)

- Real authentication with server-side session validation; client cannot self-declare role, sellerId, borrowerId, or admin status.
- Postgres (Supabase) with RLS policies, server-only writes for money-bearing tables, and zero service-role key in client bundles.
- Server-side pricing, deposit, settlement, and fee calculation. Client-supplied amounts are advisory only.
- Toss Payments (or chosen PG) with **webhook signature verification, idempotency keys, and reconciliation**. No money state is computed from anything the client posts.
- Photo/upload pipeline behind private buckets with signed URLs, owner-validated writes, and explicit serial-number isolation (private bucket, not on the listing record).
- Audit log table for admin actions and a documented retention/deletion plan.
- Dispute and damage-report operational playbook + state-machine wiring (the state machine already supports the states; the operational side is missing).

### Future architecture

- Postgres-first, Supabase-hosted, portable to any Postgres host. Drizzle/Kysely or Supabase client server-side; **no service role on the client**.
- Vercel-first hosting. Webhooks via route handlers; admin via gated route handlers; long jobs and background reconciliation extracted to a separate worker once the cron hits Vercel limits.
- Two-dashboard split (founder admin vs. external sanitized) with materialized snapshot tables for the external view; admin dashboard reads live with row-level audit.
- Event-log strategy split into business / analytics / admin-audit / payment-webhook / AI-parser logs, each with separate sensitivity classification.

---

## 2. Current Codebase Data Inventory

Inventoried by file path. Fields per row: **Current role** / **Data sensitivity** / **Persistence today** / **Future DB table candidate** / **Security concerns** / **Migration notes**.

### Domain types

#### [`src/domain/intents.ts`](../src/domain/intents.ts)

- **Current role:** Stripe-style Intent type definitions. Holds `SearchIntent`, `VerificationIntent`, `ListingIntent`, `PaymentSession`, `SettlementState`, `RentalIntent`, `RentalEvent`, plus the `RentalIntentStatus` 19-state union and `RENTAL_HAPPY_PATH` / `RENTAL_FAILURE_STATES` arrays.
- **Data sensitivity:** Type definitions only — no runtime data. The eventual *instances* span anonymous (status, durationDays) to PII-adjacent (`borrowerName`, `sellerName`, `pickupArea`, `privateSerialNumber`, `safetyCode`).
- **Persistence today:** N/A (types).
- **Future DB table candidate:** Each Intent type maps to a future table. `RentalIntent` → `rental_intents`. `ListingIntent` → `listings` + `listing_versions` + `listing_verifications`. `SearchIntent` → `search_intents` (sanitized) + `growth_events`. `VerificationIntent` → `listing_verifications`. `RentalEvent` → `rental_events`. `PaymentSession` → `payments` + `payment_events`. `SettlementState` → `settlements`.
- **Security concerns:** `ListingIntent.item.privateSerialNumber` is private and must never end up on a public listing row, in a public photo bucket, or in any external dashboard. `borrowerName` is a name string with no input validation.
- **Migration notes:** The `RentalIntentStatus` enum must be preserved 1:1 in the DB enum. Failure states are first-class — do not collapse to "failed" + reason in DB.

#### [`src/domain/categories.ts`](../src/domain/categories.ts)

- **Current role:** Static category registry (7 ids, 3 enabled). Includes Korean keywords used by the mock parser.
- **Data sensitivity:** Public reference data.
- **Persistence today:** Hardcoded TS constants.
- **Future DB table candidate:** `categories` reference table (or stay as code constants seeded into a DB enum). Keywords likely stay client-side for the rule-based parser; with a real LLM the keyword list becomes redundant.
- **Security concerns:** None.
- **Migration notes:** When adding `enabled` or new categories, the seed/migration must keep ids stable.

#### [`src/domain/durations.ts`](../src/domain/durations.ts)

- **Current role:** Three-window enum (`1d` / `3d` / `7d`).
- **Data sensitivity:** Public.
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** DB enum or constants table. Stable.
- **Security concerns:** None.
- **Migration notes:** Adding a duration is a domain decision — pricing and parser must be updated atomically.

#### [`src/domain/products.ts`](../src/domain/products.ts)

- **Current role:** `Product` type with `region: "seoul"` literal, hardcoded trust block, prices, components.
- **Data sensitivity:** Will become PII-adjacent once real lender registration replaces the fixture (pickupArea, sellerName).
- **Persistence today:** Hardcoded fixtures in `src/data/products.ts`.
- **Future DB table candidate:** `listings` (one row per listing, per-product not per-listing-version) joined with `listing_versions` for edit history.
- **Security concerns:** `region: "seoul"` literal type **blocks Korea-wide direction**. Must widen to `RegionId` enum (e.g. `seoul`, `busan`, `incheon`, `gyeonggi`, …) with a corresponding DB enum.
- **Migration notes:** Listing prices in DB must derive from `estimatedValue` via the same canonical pricing math (`src/lib/pricing.ts`) — never trust client-supplied price.

#### [`src/domain/sellers.ts`](../src/domain/sellers.ts)

- **Current role:** `Seller` shape: id, name, region, trustScore, reviewCount, joinedAt, optional trustNote.
- **Data sensitivity:** PII once real (real names attached to real accounts).
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** Split into `users` (auth identity), `profiles` (display name), and `seller_profiles` (trustScore, reviewCount, joinedAt, trustNote). Do not flatten.
- **Security concerns:** Real `trustScore` must be **server-derived** from review/dispute aggregates — never client-writable.
- **Migration notes:** `region` literal is the same Korea-wide blocker as Product.

### Mock data

#### [`src/data/products.ts`](../src/data/products.ts)

- **Current role:** Six fixture products keyed to `seller_jisu`, `seller_minho`. Prices derived from `calculateRecommendedPriceTable(estimatedValue)` so the formula is the single source of truth.
- **Data sensitivity:** Public seed data; no real PII.
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** `listings` seed for local dev. Production uses real seller-created listings.
- **Security concerns:** None for fixtures.
- **Migration notes:** When DB exists, this file becomes a dev seed script — not the source of truth.

#### [`src/data/mockSellers.ts`](../src/data/mockSellers.ts)

- **Current role:** Three seller fixtures. `CURRENT_SELLER = SELLERS[0]` (`seller_jisu`) is the dashboard's hardcoded "logged-in" identity.
- **Data sensitivity:** Public seed.
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** `seller_profiles` seed for local dev; production sellers come from real registration.
- **Security concerns:** `CURRENT_SELLER` is the **client-side hardcoded "current user"** — once auth exists, every reference to `CURRENT_SELLER.id` must be replaced by a server-validated session identity. Currently 14 references in `src/components/SellerDashboard.tsx`, `src/components/SellerRegistration.tsx`, mock data files. **Do not allow this pattern to leak into post-auth code.**
- **Migration notes:** First DB integration should retire `CURRENT_SELLER` in the same PR as it lands real sessions, never half-migrate.

#### [`src/data/mockRentalIntents.ts`](../src/data/mockRentalIntents.ts)

- **Current role:** Lifecycle fixtures covering each `RentalIntentStatus` so the dashboard can render the full range immediately.
- **Data sensitivity:** Public seed (no real names).
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** Dev seed, not production data.
- **Security concerns:** When persisted via `seedMockData()`, these fixtures land in localStorage with stable IDs — fine for demo.
- **Migration notes:** Keep this fixture set; replace stable IDs to avoid colliding with real production IDs (e.g. prefix `seed_ri_…`).

#### [`src/data/dashboard.ts`](../src/data/dashboard.ts)

- **Current role:** Legacy `LISTED_ITEMS` table fixture — only the listed-items table on `/dashboard` reads it.
- **Data sensitivity:** Public seed.
- **Persistence today:** Hardcoded.
- **Future DB table candidate:** Becomes per-listing analytics rows on `listings` (views, rentalsThisMonth) — not its own table.
- **Security concerns:** None.
- **Migration notes:** Comment in the file already says "do not extend it"; retire when per-listing analytics ship.

### Persistence layer

#### [`src/lib/adapters/persistence/types.ts`](../src/lib/adapters/persistence/types.ts)

- **Current role:** `PersistenceAdapter` interface — save/get/list/delete for RentalIntent, save/get/list for ListingIntent, save/get-latest/list for SearchIntent, append/list for RentalEvent, `clearAll`.
- **Data sensitivity:** Interface only.
- **Persistence today:** N/A.
- **Future DB table candidate:** Becomes the repository contract. Real implementation goes through Postgres; the contract may grow to support pagination, RLS scope, multi-row updates.
- **Security concerns:** Current interface is unscoped (no `userId` parameter). When DB exists, the adapter must derive scope from the **server session**, not from method arguments — otherwise callers can fetch other users' rows by passing a different id.
- **Migration notes:** Plan for a `RepositoryAdapter` v2 with explicit scope contracts (`forBorrower(userId)`, `forSeller(userId)`, `admin()`).

#### [`src/lib/adapters/persistence/memoryAdapter.ts`](../src/lib/adapters/persistence/memoryAdapter.ts)

- **Current role:** SSR fallback. Map/array fields, full contract.
- **Data sensitivity:** Process-local; resets per request.
- **Persistence today:** Memory.
- **Future DB table candidate:** N/A (test/dev only).
- **Security concerns:** None — no shared state.
- **Migration notes:** Keep for unit tests after DB lands.

#### [`src/lib/adapters/persistence/localStorageAdapter.ts`](../src/lib/adapters/persistence/localStorageAdapter.ts)

- **Current role:** Browser persistence under `corent:rentalIntents`, `corent:listingIntents`, `corent:searchIntents`, `corent:rentalEvents`. Safe JSON parsing degrades to empty defaults on corruption.
- **Data sensitivity:** Whatever the browser writes — currently mostly mock-shaped data (no real PII because no real auth or data entry).
- **Persistence today:** Browser localStorage.
- **Future DB table candidate:** N/A — replaced by server-side persistence after auth/DB land.
- **Security concerns:** **Anything in localStorage is client-mutable.** Once real DB exists, the adapter becomes a *cache*, not the source of truth, and must never be trusted for identity, role, payment status, settlement amount, or any money-bearing field.
- **Migration notes:** Plan a migration-safety helper: at first auth-aware boot, read any local intents and either submit them as fresh server requests (with server-side validation) or discard. Do not bulk-import client state into the DB without re-validation.

#### [`src/lib/adapters/persistence/index.ts`](../src/lib/adapters/persistence/index.ts)

- **Current role:** `getPersistence()` returns LocalStorage in browser, Memory in SSR. Cached singleton per module instance.
- **Data sensitivity:** N/A.
- **Persistence today:** N/A.
- **Future DB table candidate:** N/A.
- **Security concerns:** Module-singleton caching is fine for read paths but may surprise auth-aware code (the adapter caches across user transitions). After auth lands, the adapter resolution must depend on the request session, not module state.
- **Migration notes:** Replace the singleton with `getPersistence(session)` once sessions exist.

### Pricing / fee / deposit / payout

#### [`src/lib/pricing.ts`](../src/lib/pricing.ts)

- **Current role:** Pure functions: `calculateRecommendedRentalPrice`, `calculateRecommendedPriceTable`, `calculateSafetyDeposit`, `calculatePlatformFee`, `calculateSellerPayout`, `calculateBorrowerTotal`, `calculateRentalAmounts`, `calculateSettlementAmount`. Constants: `COMMISSION_RATE = 0.1`, `RATE_BY_DAYS`, `SAFETY_DEPOSIT_TIERS`, `HIGH_VALUE_THRESHOLD = 700_000`.
- **Data sensitivity:** Math; not data.
- **Persistence today:** N/A.
- **Future DB table candidate:** None — pricing must remain a server-side library, not a DB table. The constants may migrate to a `pricing_config` row later if seller-tier pricing is introduced.
- **Security concerns:** **`COMMISSION_RATE = 0.1` contradicts Direction v2 (target 3% + fixed)**. This is recorded debt — implementation of the new fee shape is gated and intentional. **Once DB/payment exists, the server-side calculator must be the only source of fee math; clients must never compute or post fees/deposits/payouts.**
- **Migration notes:** When the fee model is updated, *every* fee field on every saved RentalIntent / payment row must record the **calculation version** (e.g. `fee_version: "v2"`) so historical rentals settle on the rate that was active at request time. Do not retroactively apply the new rate.

#### [`src/lib/format.ts`](../src/lib/format.ts)

- **Current role:** `formatKRW`. Re-exports `COMMISSION_RATE`/`calculateSettlementAmount` from pricing for backwards compatibility.
- **Security concerns:** None — display only.

#### [`src/lib/safetyCode.ts`](../src/lib/safetyCode.ts)

- **Current role:** `generateSafetyCode(date)` — deterministic letter+3-digits per UTC day. `generateListingSafetyCode(seedId)` — per-listing variant.
- **Data sensitivity:** The "today's safety code" is intended as a freshness signal in trust photos.
- **Persistence today:** Computed; not stored as a fact.
- **Future DB table candidate:** Per-listing safety codes belong on `listing_verifications` rows. The daily code is computed server-side at verification time.
- **Security concerns:** **Daily code is deterministic and predictable** — anyone who knows the algorithm can pre-generate the next year of codes. Acceptable for a freshness signal (the value is the photo metadata + visible code in the same frame, not the secrecy of the code itself), but the system **must not** treat the code as a verification secret. Document this constraint.
- **Migration notes:** When real verification exists, the per-submission code becomes a server-issued one-time token; the daily code stays as a UI freshness affordance.

### Request lifecycle / state machine

#### [`src/lib/stateMachines/rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts)

- **Current role:** Pure transition functions. `ALLOWED_TRANSITIONS` table, `transition()` helper that emits `RentalEvent`, plus `createRentalIntent`, all happy-path transitions, all failure transitions.
- **Data sensitivity:** Operates on RentalIntent shape; same sensitivity as RentalIntent.
- **Persistence today:** None — pure.
- **Future DB table candidate:** Translates 1:1 to server-side service that writes to `rental_intents` + `rental_events` inside a transaction.
- **Security concerns:** When server-side, transitions must be **gated by role** — only the seller can `approveRentalIntent`, only the system or borrower can `confirmPickup`, etc. Currently all transitions are callable by anyone with a `RentalIntent` reference; that is an acceptable gap given no real auth exists, but it is **launch-blocking**.
- **Migration notes:** Keep `ALLOWED_TRANSITIONS` as the single source of truth and add a parallel `ALLOWED_ACTORS_BY_TRANSITION` map when role-gating is added.

### Listing state

#### [`src/lib/services/listingService.ts`](../src/lib/services/listingService.ts)

- **Current role:** Build draft from rawInput → `applyEdits` → `toggleVerificationCheck` → `saveDraft` / `submitForReview`.
- **Data sensitivity:** Listings include `item.privateSerialNumber` (sensitive) and `item.pickupArea` (location-adjacent).
- **Persistence today:** Saved via `getPersistence().saveListingIntent(...)`.
- **Future DB table candidate:** `listings`, `listing_versions`, `listing_verifications`, `upload_assets`.
- **Security concerns:** **`privateSerialNumber` lives on the same blob as the public listing** — once DB exists this must split into a separate `listing_private_data` table or column with stricter RLS. Verification photos are not yet uploadable; once they are, they go in a private bucket.
- **Migration notes:** Server-side `submitForReview` must compute verification completeness server-side; `isVerificationComplete()` is currently client-trusting.

### Search / parser state

#### [`src/lib/services/searchService.ts`](../src/lib/services/searchService.ts)

- **Current role:** `parse(rawInput)`, `save(intent)`, `latest()`, `toQuery(intent)`, `fromQuery(params)`. Persists last 10 search intents.
- **Data sensitivity:** **Search rawInput can be sensitive** — natural-language queries may contain location text, product brand specifics, intent signals. In aggregate this is the most defensible asset CoRent will collect.
- **Persistence today:** localStorage.
- **Future DB table candidate:** `search_intents` (sanitized, retention-bounded) + `growth_events` (anonymized aggregates).
- **Security concerns:** Once shipped to a server, the raw search text **must be stripped of obvious PII** (phone numbers, e-mail addresses, addresses) by a server-side sanitizer **before write**. Per-user identifiable search history must never feed the external dashboard (per [`corent_defensibility_note.md` §2](corent_defensibility_note.md)).
- **Migration notes:** Add `sanitized_text` and `pii_redacted_at` columns; never store the raw input on the analytics row; if raw text is needed for product debugging, store on a **separate, short-retention internal log** with admin-only access.

#### [`src/lib/adapters/ai/mockAIParserAdapter.ts`](../src/lib/adapters/ai/mockAIParserAdapter.ts)

- **Current role:** Rule-based regex/keyword parser. No network call. Detects category, duration, region (Seoul keywords only), priceMax, condition, brand model, components, defects, estimatedValue.
- **Data sensitivity:** Operates on raw text; same sensitivity as search.
- **Persistence today:** N/A — pure function call.
- **Future DB table candidate:** N/A.
- **Security concerns:** When replaced by a real LLM, **prompt injection** from raw user text becomes a real vector. The mock currently can't be injected; the real one will need a server-side parser endpoint, system-prompt isolation, and outputs validated against the existing types. Do **not** call the LLM from the client.
- **Migration notes:** Plan an `OpenAIParserAdapter` behind the same interface. The interface already returns structured `Omit<SearchIntent, "id" | "createdAt">` and `ParsedSellerInput` — clean fit. Region detection is hardcoded to Seoul neighborhoods; widen alongside Korea-wide rollout.

### Dashboard calculation state

#### [`src/lib/services/dashboardService.ts`](../src/lib/services/dashboardService.ts)

- **Current role:** Pure derivations: `deriveDashboardSummary`, `pendingRequestRows`, `activeRentalRows`, `failureRows`, `relativeTime`. Tested at 6 cases on `main`.
- **Data sensitivity:** Operates on RentalIntent + ListingIntent input.
- **Persistence today:** N/A.
- **Future DB table candidate:** Derivations may move to materialized views on `dashboard_snapshots`; for the founder admin dashboard, live SQL aggregates.
- **Security concerns:** None at this layer (pure). Risk is upstream: if upstream queries return cross-seller data, the derivations leak.
- **Migration notes:** Keep these as the authoritative summary shape; the SQL-backed implementation must produce identical results for the same inputs.

### Event-like structures

- **`RentalEvent`** (in [`src/domain/intents.ts`](../src/domain/intents.ts)) — emitted by every successful state transition. Lifecycle audit log.
- **`PaymentSession`** — payment state envelope with timestamps.
- **`searchIntents` array in localStorage** — last 10 search submissions.
- **No analytics events** exist yet — there is no `growth_events` write path, no telemetry, no observability.

### TODO / security comments

`grep -rn "TODO\|FIXME\|XXX\|HACK\|SECURITY:\|password\|api[_-]?key\|secret"` over `src/` returned **zero results**. The codebase is intentionally clean. There are no inline risk markers and no leaked-key patterns. (Audit ran during this session; result preserved here.)

---

## 3. Current MVP Persistence Boundary

### What persists today, and how

| Data | Storage | Class |
|---|---|---|
| `RentalIntent` rows | `localStorage["corent:rentalIntents"]` (object keyed by id) | localStorage |
| `ListingIntent` rows | `localStorage["corent:listingIntents"]` (object keyed by id) | localStorage |
| `SearchIntent` history (last 10) | `localStorage["corent:searchIntents"]` (array) | localStorage |
| `RentalEvent` log (per-rental array) | `localStorage["corent:rentalEvents"]` (object keyed by rentalIntentId) | localStorage |
| `PaymentSession` records | `globalThis.__corentMockPaymentStore` (server-process Map) | memory-only (server process, not durable) |
| `PRODUCTS`, `SELLERS`, `MOCK_RENTAL_INTENTS`, `LISTED_ITEMS` | TS source | hardcoded mock |
| Pricing / deposit / fee / payout values | `src/lib/pricing.ts` outputs | derived/calculated |
| AI-parser output | per-call regex match | derived/calculated |
| Toss / OpenAI / Supabase / S3 / Auth state | none | future external provider placeholder |

### What would be lost on browser reset

**Everything in localStorage.** A user who clears site data, switches browsers, opens an incognito tab, or hard-refreshes after `clearAll()` loses:

- their search history
- any rental requests they created
- any listings they drafted
- any state-machine progress on requests they were managing

This is acceptable for MVP v1 (browser-demoable) and is part of why the app is demo-safe. It is **not** acceptable for any user-visible "your account" affordance.

### What can be manipulated by client/devtools

**Every persisted field, without exception.** A user with devtools open can:

- write any `RentalIntent.status` (e.g. set their own request to `paid` or `settled`)
- write any `RentalIntent.amounts` (rentalFee, safetyDeposit, platformFee, sellerPayout, borrowerTotal)
- mint new `RentalIntent.id` values, set arbitrary `borrowerId`/`sellerId`
- forge `RentalEvent` entries
- alter `ListingIntent.verification.status` to `verified`
- alter `ListingIntent.pricing.sellerAdjusted = true` to bypass any future seller-price guardrails

This is **expected and acceptable today** because none of those values cross any trust boundary. **It becomes catastrophic the moment any of those values informs a server decision, payment amount, or seller payout.** This is the single most important invariant in the migration plan: **once DB exists, every money-bearing field must be server-derived from server-side identity, server-side pricing, and the immutable event log**.

### What should never be trusted once real DB exists

- `RentalIntent.status` — server-only, derived from transition guards.
- `RentalIntent.amounts.*` — server-recomputed on every transition that involves money.
- `RentalIntent.payment.status` / `payment.sessionId` — only writable by the payment-webhook handler, never by the client.
- `RentalIntent.settlement.*` — server-only.
- `RentalIntent.sellerId` / `borrowerId` — server-derived from session.
- `ListingIntent.verification.status` — server-only, set by admin review.
- `ListingIntent.pricing.*` — server-recomputed when the seller does not opt into manual price; manual price is bounded to a server-validated range.
- `ListingIntent.item.privateSerialNumber` — written once, read only by server-side admin tooling and the lender themselves, never broadcast.
- `RentalEvent` rows — append-only, server-emitted. Client may *read* its own rentals' events but never *write*.

### What can remain client-only after DB exists

- UI-local form state (input values being typed, modal open/closed, selected duration before request submit).
- The cached read of "last 5 searches" for autocomplete UX (with a server round-trip on session start to refresh from the authoritative source).
- Anonymous pre-auth UI memory (e.g. "the user landed on this category before signing up" — kept until session start, then forwarded with consent or discarded).

---

## 4. Domain Model Audit

Per-entity status: **Current status** / **Recommended future DB status** / **Reason**.

| Entity | Current status | Recommended future DB status | Reason |
|---|---|---|---|
| **User / Account** | missing | table | Required for any non-anonymous data. Auth identity, server-validated. Must precede every other PII-bearing table. |
| **Profile** | implied (currently fused into `Seller.name`) | table | Display name, avatar metadata, locale. Separate from auth so a user can change display name without rotating credentials. |
| **SellerProfile** | partially exists (`Seller` shape) | table | Trust score, review count, joinedAt, optional trustNote. Fields that are **derived** (trustScore, reviewCount) are computed server-side from `reviews` / `rental_events`, not stored as input fields. |
| **BorrowerProfile** | missing | table | Trust signals from the borrower side (rentals completed, on-time return rate, dispute rate). Optional v2; required if the seller side wants reciprocal scoring. |
| **Listing** | partially exists (`Product` fixture + `ListingIntent`) | table | Production listings come from `ListingIntent.submitForReview()`. The `Product` fixture is dev-only. |
| **ListingDraft / ListingIntent** | exists | table (`listings`) + version table (`listing_versions`) | Drafts and approved listings live in the same row with `status`; edit history goes into `listing_versions` for audit. |
| **ListingVerification** | exists (`VerificationIntent`) | table | Photo proofs, AI/human review notes, status. Sensitive — RLS scope: lender owns, admin reads. |
| **ProductPhoto / UploadAsset** | missing | table | Stores private-bucket object keys, owner, role, content-type, size, malware-scan status. Listings join via `listing_id`. |
| **SafetyCode** | exists (computed; not stored) | event | Per-listing code goes on `listing_verifications.safety_code`. Daily code is computed; no need to persist. |
| **SearchIntent** | exists | table (sanitized) + event (`growth_events`) | Two writes: sanitized full row for product debugging (short retention), anonymized event for the funnel. |
| **RentalIntent** | exists | table | Central transactional row. RLS scope: borrower owns + seller reads (their listings). |
| **RentalEvent** | exists | event (table-backed append-only) | Lifecycle audit log; RLS scope: borrower / seller of the parent rental + admin. |
| **PaymentIntent** | partially exists (`PaymentSession`) | table (`payments`) | One row per payment attempt. Server-only writes. |
| **PaymentEvent** | implied (state changes inside `PaymentSession`) | event (`payment_events`) | Webhook-driven event log with idempotency keys. |
| **DepositHold** | implied (math only, no record) | table | Once partner integration exists, every authorization/release/refund is its own row. |
| **Settlement** | partially exists (`SettlementState`) | table | Tracks ready / blocked / settled with dispute flag and payout amount. |
| **Dispute** | implied (state `dispute_opened`) | table | Each dispute is its own row with evidence pointers and status. |
| **DamageReport** | implied (state `damage_reported`) | table | Photo references, reporter, observed condition, resolution. |
| **PickupHandoff** | partially exists (state on RentalIntent) | event | Append-only handoff record (timestamp, photos, party). |
| **ReturnHandoff** | partially exists (state on RentalIntent) | event | Same shape, return side. |
| **Review / TrustSignal** | missing | table | Review row per completed rental, plus aggregated trust signals (cancellation rate, on-time return rate). Aggregates derived. |
| **AdminReview** | missing | table | Admin review queue: subject (listing / dispute / damage report), reviewer, decision, notes. |
| **AdminAction** | missing | event | Audit log of every admin write. Append-only. |
| **GrowthEvent** | missing | event | Anonymized funnel events (search, view, request, registration). The defensibility-protected dataset. |
| **AnalyticsSnapshot** | missing | derived view + cached snapshot | Internal admin dashboard reads; computed on schedule from events. |
| **ExternalDashboardSnapshot** | missing | table (manually approved) | Sanitized, aggregated, per-period rows. Manual approval gate per [`corent_defensibility_note.md` §4](corent_defensibility_note.md). |

**Do-not-store list (deliberately not adding tables for these):**

- raw IP addresses (compliance and minimization);
- raw user-agent strings (use a fingerprint hash if needed);
- precise GPS coordinates (gated on location-info compliance review);
- payment card data (PG provider holds it; CoRent only references session ids and receipts);
- raw identity-document images (handled by identity provider; CoRent stores only verification status + reference id);
- third-party social profile blobs (only verification flags).

---

## 5. Recommended Supabase / Postgres Architecture

**This is a proposed schema, not a migration.** No SQL is written; no Supabase project files are created; no `migrations/` directory is added to the repo. Implementation is gated on:

1. Approval of this audit.
2. Security review per [`corent_security_gate_note.md`](corent_security_gate_note.md).
3. A dedicated implementation plan note before any code lands.

### 5.1 Core Marketplace Tables

For each table: **purpose** / **important columns** / **PII/sensitivity** / **read by** / **write by** / **RLS** / **retention** / **indexes (later)**.

#### `users`

- **Purpose:** Auth identity. One row per real CoRent user.
- **Important columns:** `id` (uuid PK), `email` (unique, lowercased), `phone` (nullable, e.164), `created_at`, `last_seen_at`, `disabled_at`.
- **PII:** High (email, phone). Locked.
- **Read by:** the user themselves; admin.
- **Write by:** auth provider only; the app does not write directly.
- **RLS:** strict — `auth.uid() = id`; admin via dedicated role.
- **Retention:** indefinite while account active; 30-day soft-delete hold then hard-delete with audit trail.
- **Indexes later:** `(email)`, `(phone)`, `(last_seen_at)`.

#### `profiles`

- **Purpose:** Display name, avatar, locale.
- **Columns:** `user_id` PK/FK, `display_name`, `locale`, `avatar_asset_id` FK → `upload_assets`, `updated_at`.
- **PII:** Medium (display_name).
- **Read by:** the user themselves; counterparties on confirmed rentals (display name only); admin.
- **Write by:** the user; admin.
- **RLS:** `auth.uid() = user_id` for self; counterparty read scoped to confirmed rental relationships.
- **Retention:** with `users`.
- **Indexes:** `(user_id)`.

#### `seller_profiles`

- **Purpose:** Lender-side trust signals + onboarding state.
- **Columns:** `user_id` PK/FK, `joined_at`, `verified_at`, `trust_score` (computed), `review_count` (computed), `default_pickup_region`, `default_pickup_district`, `disabled_reason`.
- **PII:** Medium.
- **Read by:** seller themselves; counterparty (limited fields); admin.
- **Write by:** seller (registration fields); admin (verification, disable); server (computed fields).
- **RLS:** self + counterparty + admin.
- **Retention:** with `users`.
- **Indexes:** `(default_pickup_region, default_pickup_district)`, `(verified_at)`.

#### `borrower_profiles`

- **Purpose:** Borrower-side trust signals.
- **Columns:** `user_id` PK/FK, `rentals_completed`, `on_time_return_rate`, `dispute_count`, `last_rental_at`.
- **PII:** Medium.
- **RLS:** self + admin; lender on confirmed rentals (limited).
- **Retention:** with `users`.

#### `listings`

- **Purpose:** Public listing rows.
- **Columns:** `id` PK, `seller_id` FK → `users`, `status` (`listing_status` enum), `name`, `category` (`category_id` enum), `estimated_value`, `condition`, `components` (text[]), `defects`, `pickup_region`, `pickup_district`, `summary`, `created_at`, `updated_at`, `published_at`, `disabled_at`, `current_version_id` FK → `listing_versions`.
- **PII:** Low for the public-facing fields; **the private serial number does NOT live here** (separate table).
- **Read by:** anyone (when `status = 'approved'`); seller themselves (any status); admin.
- **Write by:** seller (their own); admin.
- **RLS:** `auth.uid() = seller_id` for non-published; public read gated on `status = 'approved'`.
- **Retention:** indefinite while active.
- **Indexes:** `(status, category, pickup_region)`, `(seller_id, status)`, `(published_at desc)`.

#### `listing_versions`

- **Purpose:** Edit history. One row per save / submit.
- **Columns:** `id` PK, `listing_id` FK, `version_number`, `payload` jsonb (immutable snapshot), `created_at`, `created_by`.
- **PII:** Same as listings; payload is the snapshot.
- **RLS:** seller reads own; admin reads all.
- **Retention:** keep all versions while listing active; 12-month archive after disable.

#### `listing_verifications`

- **Purpose:** Verification state for a listing version.
- **Columns:** `id` PK, `listing_id` FK, `listing_version_id` FK, `safety_code`, `status` (`listing_verification_status` enum), `checks` jsonb, `ai_notes` text[], `human_review_notes` text[], `private_serial_number` (encrypted at rest, separate role required), `submitted_at`, `decided_at`, `decided_by`.
- **PII:** **High** (private_serial_number). Encryption at rest required.
- **Read by:** seller (own, except encrypted serial); admin (all).
- **Write by:** seller (initial submission); admin (decision).
- **RLS:** strict — separate column-level grants for `private_serial_number`.
- **Retention:** with listing.
- **Indexes:** `(status, submitted_at)`.

#### `rental_intents`

- **Purpose:** Transaction state per rental request.
- **Columns:** mirror `RentalIntent` shape: `id`, `listing_id`, `seller_id`, `borrower_id`, `status` (`rental_intent_status` enum), `duration_days`, `rental_fee`, `safety_deposit`, `platform_fee`, `seller_payout`, `borrower_total`, `fee_version` (string — pin to the pricing-formula version active at request time), `payment_id` (FK, nullable), `pickup_status`, `pickup_location_label`, `return_status`, `return_due_at`, `return_confirmed_at`, `settlement_status`, `settlement_blocked_reason`, `settled_at`, `created_at`, `updated_at`.
- **PII:** Medium (joins to seller / borrower identities).
- **Read by:** seller of listing; borrower; admin.
- **Write by:** server only via state-machine service; clients never write directly.
- **RLS:** `borrower_id = auth.uid() OR seller_id = auth.uid()`; admin role bypass.
- **Retention:** indefinite while either party active; archive 36 months post-settlement.
- **Indexes:** `(seller_id, status, updated_at desc)`, `(borrower_id, status, updated_at desc)`, `(status, return_due_at)` for overdue scans.

#### `rental_events`

- **Purpose:** Append-only lifecycle log.
- **Columns:** `id` PK, `rental_intent_id` FK, `from_status`, `to_status`, `at`, `actor` (`system|seller|borrower|admin`), `reason`, `metadata` jsonb (sanitized).
- **PII:** Low (status transitions). Counter-party identity is implicit via the parent.
- **RLS:** matches parent.
- **Retention:** with parent + 6 months extra (for dispute lookback).
- **Indexes:** `(rental_intent_id, at)`.

#### `payments`

- **Purpose:** Payment session state. One row per attempt.
- **Columns:** `id` PK, `rental_intent_id` FK, `provider` (enum: `mock|toss|...`), `provider_session_id` (unique per provider), `amount`, `status` (`payment_status` enum), `created_at`, `authorized_at`, `paid_at`, `failed_at`, `failure_reason`.
- **PII:** Medium (links to user via rental).
- **Read by:** parties to the rental; admin; reconciliation job.
- **Write by:** server (initial create); webhook handler (status changes).
- **RLS:** through parent rental.
- **Retention:** **regulatory** — typically 5+ years for financial records; check Korean tax/accounting requirements before final retention is set.
- **Indexes:** `(provider, provider_session_id)` unique, `(rental_intent_id)`, `(status, created_at)`.

#### `payment_events`

- **Purpose:** Webhook event log. **Idempotency boundary.**
- **Columns:** `id` PK, `payment_id` FK, `provider_event_id` (unique per provider), `kind`, `payload` jsonb (signed/raw), `signature_verified` bool, `received_at`, `processed_at`.
- **PII:** Same as payments.
- **Write by:** webhook endpoint **only**.
- **Constraints:** unique `(provider, provider_event_id)` to enforce idempotency.
- **Retention:** with `payments`.
- **Indexes:** `(provider_event_id)` unique, `(received_at)`.

#### `deposit_holds`

- **Purpose:** Authorization, capture, release/refund of safety deposit.
- **Columns:** `id` PK, `rental_intent_id` FK, `amount`, `status` (`deposit_status` enum), `provider_authorization_id`, `authorized_at`, `released_at`, `refunded_at`, `captured_at`, `failure_reason`.
- **PII:** Medium.
- **Write by:** webhook + server.
- **RLS:** parties + admin.
- **Retention:** financial.
- **Indexes:** `(rental_intent_id)`, `(status, authorized_at)`.

#### `settlements`

- **Purpose:** Lender payout records.
- **Columns:** `id` PK, `rental_intent_id` FK, `amount`, `status` (`settlement_status` enum), `blocked_reason`, `ready_at`, `settled_at`, `provider_payout_id`.
- **PII:** Medium.
- **Write by:** server.
- **RLS:** parties + admin.
- **Retention:** financial.
- **Indexes:** `(status, ready_at)`, `(rental_intent_id)`.

#### `disputes`

- **Purpose:** Open dispute records.
- **Columns:** `id` PK, `rental_intent_id` FK, `opened_by` (`seller|borrower|admin`), `opened_reason`, `evidence` jsonb (asset_ids[]), `status` (`dispute_status` enum), `resolution_kind`, `resolution_note`, `opened_at`, `resolved_at`, `resolved_by`.
- **PII:** Medium-High (notes can include personal context).
- **Read by:** parties + admin.
- **Write by:** parties (open), admin (resolve).
- **Retention:** with rental + 36 months.

#### `damage_reports`

- **Purpose:** Reported damage at return.
- **Columns:** `id` PK, `rental_intent_id` FK, `reported_by`, `description`, `photo_asset_ids` int[], `severity` (`light|moderate|severe`), `created_at`.
- **PII:** Same as parent.
- **RLS:** parties + admin.
- **Retention:** with rental.

#### `handoff_confirmations`

- **Purpose:** Pickup and return condition records.
- **Columns:** `id` PK, `rental_intent_id` FK, `kind` (`pickup|return`), `at`, `confirmed_by`, `notes`, `photo_asset_ids` int[], `status` (`handoff_status` enum).
- **PII:** Medium.
- **Retention:** with rental.

#### `reviews`

- **Purpose:** Post-rental review by either party.
- **Columns:** `id` PK, `rental_intent_id` FK, `author_id`, `subject_id`, `subject_kind` (`seller|borrower|item`), `rating` smallint, `body` text, `created_at`, `hidden_at`, `hidden_reason`.
- **PII:** Medium (body is free text).
- **RLS:** public read for non-hidden; author can edit within window; admin can hide.
- **Retention:** indefinite while account active.

#### `trust_signals`

- **Purpose:** Aggregated, computed trust metrics per user (cancel rate, late return rate, photo-quality score).
- **Columns:** `user_id` PK, `metrics` jsonb, `computed_at`.
- **PII:** Low aggregate.
- **Write by:** server (scheduled compute).

#### `admin_reviews`

- **Purpose:** Admin queue (listing verification, dispute, damage report).
- **Columns:** `id` PK, `subject_kind`, `subject_id`, `status` (`admin_review_status`), `assigned_to`, `decided_at`, `decided_by`, `decision_notes`.
- **PII:** Notes can include sensitive context.
- **RLS:** admin only.

#### `admin_actions`

- **Purpose:** Audit log of every admin write. Append-only.
- **Columns:** `id` PK, `actor_admin_id`, `action_kind`, `subject_kind`, `subject_id`, `before` jsonb, `after` jsonb, `at`, `ip_hash`, `user_agent_hash`.
- **PII:** Low (admin user; no end-user identifiers in raw).
- **RLS:** admin read; **no writes outside the dedicated audit logger**.
- **Retention:** **legal/compliance** — long retention (5+ years).

#### `growth_events`

- **Purpose:** Anonymized funnel events for the founder admin dashboard and (after sanitization) the external dashboard.
- **Columns:** `id` PK, `event_kind` (`growth_event_type` enum), `properties` jsonb (sanitized), `region_coarse`, `category` enum (nullable), `at`, `session_hash`, `consent_state`.
- **PII:** None at the row level (this is the contract); enforced by sanitizer at write time.
- **Read by:** admin; sanitized aggregates feed external dashboard.
- **Write by:** server only (the sanitizer is the only write path).
- **RLS:** admin only at row level; aggregates exposed via materialized views.
- **Retention:** 18 months rolling for raw events; aggregates indefinite.

#### `dashboard_snapshots`

- **Purpose:** Cached internal admin dashboard tiles.
- **Columns:** `key` PK, `payload` jsonb, `computed_at`, `period`.
- **RLS:** admin only.
- **Retention:** rolling.

#### `external_dashboard_snapshots`

- **Purpose:** Approved sanitized aggregates for partner/investor dashboards.
- **Columns:** `id` PK, `period`, `payload` jsonb, `approved_by`, `approved_at`, `published_at`, `audience_kind` (`partner|investor|public`).
- **RLS:** read for the matching audience; admin writes only after manual approval.
- **Retention:** indefinite.

#### `upload_assets`

- **Purpose:** Object-storage references for any photo/document.
- **Columns:** `id` PK, `owner_id` FK, `bucket`, `object_key`, `kind` (`avatar|listing_photo|verification_photo|handoff_photo|damage_photo`), `mime_type`, `byte_size`, `status` (`upload_asset_status` enum: `pending|scanned|safe|rejected`), `created_at`.
- **PII:** **High** (photos can show people, places, serial numbers).
- **Read by:** owner; counterparty when joined to a confirmed rental; admin.
- **Write by:** owner via signed URL only.
- **RLS:** owner + admin; counterparty access only via join through `rental_intents` and `listings`.
- **Retention:** with parent record.
- **Indexes:** `(owner_id, kind)`, `(status, created_at)` for moderation backlog.

### 5.2 Enum / State Model

Direct ports of existing TypeScript unions plus the new ones the DB requires.

- **`listing_status`**: `draft`, `ai_extracted`, `verification_incomplete`, `human_review_pending`, `approved`, `rejected` (matches [`src/domain/intents.ts`](../src/domain/intents.ts) `ListingStatus`).
- **`listing_verification_status`**: `not_started`, `pending`, `submitted`, `ai_checked`, `human_review_pending`, `verified`, `rejected` (matches `VerificationStatus`).
- **`rental_intent_status`**: full 19 values exactly as in `src/domain/intents.ts` — `draft`, `requested`, `seller_approved`, `payment_pending`, `paid`, `pickup_confirmed`, `return_pending`, `return_confirmed`, `settlement_ready`, `settled`, `cancelled`, `payment_failed`, `seller_cancelled`, `borrower_cancelled`, `pickup_missed`, `return_overdue`, `damage_reported`, `dispute_opened`, `settlement_blocked`. **Failure states must remain first-class**, not collapsed into `failed` + reason. The state machine and the dashboard depend on the discrete states.
- **`payment_status`**: `not_started`, `pending`, `authorized`, `paid`, `failed`, `refunded` (matches `PaymentStatus`).
- **`deposit_status`**: `not_authorized`, `authorized`, `captured`, `released`, `refunded`, `failed`.
- **`settlement_status`**: `not_ready`, `ready`, `blocked`, `settled` (matches `SettlementStatus`).
- **`dispute_status`**: `open`, `under_review`, `resolved_credit_borrower`, `resolved_credit_seller`, `resolved_split`, `closed_no_action`.
- **`handoff_status`**: `not_scheduled`, `scheduled`, `confirmed`, `missed` (matches existing pickup/return states).
- **`admin_review_status`**: `pending`, `assigned`, `approved`, `rejected`, `escalated`.
- **`upload_asset_status`**: `pending`, `scanned`, `safe`, `rejected`.
- **`growth_event_type`**: `search_submitted`, `search_filter_changed`, `category_chip_clicked`, `listing_view`, `duration_selected`, `request_clicked`, `request_submitted`, `seller_registration_started`, `seller_registration_submitted`, `dashboard_cta_clicked`, `trust_explanation_opened`, `waitlist_opt_in`. Extensible.
- **`dashboard_visibility`**: `internal_admin`, `partner`, `investor`, `public`.

### 5.3 Event Log Model

Five separate event streams, with explicit sensitivity differences. **Do not collapse them into one `events` table** — different audiences, retention, and PII rules.

| Stream | Table | Sensitivity | Sanitization |
|---|---|---|---|
| Business lifecycle | `rental_events` | Medium | Status transitions; `metadata` is jsonb but must exclude raw PII (no addresses, no phone numbers). |
| Analytics / growth | `growth_events` | Anonymized by contract | Sanitizer is the only writer. Strips PII, hashes session id, coarsens location to region/district. |
| Admin audit | `admin_actions` | Internal high | Includes `before`/`after` jsonb. Read-only after write. Encryption at rest. |
| Payment provider webhook | `payment_events` | Financial | Raw signed payload stored; access via admin/reconciliation only. |
| AI parser | `ai_parser_runs` (proposed) | Medium | Stores: input hash, parser version, structured output, latency. **Does not** store the raw input text on the row — raw text goes to a separate short-retention `ai_parser_inputs` table that admin-only roles can read for product debugging. |

Logs that **may contain PII**: `rental_events.metadata`, `payment_events.payload`, `admin_actions.before/after`, `ai_parser_inputs.text`. Each gets row-level access scoped to the operator who needs it; nothing is exposed to the external dashboard.

Logs that **must be sanitized at write time**: `growth_events`. The sanitizer is the only write path, lives server-side, is unit-tested, and rejects writes that don't conform.

---

## 6. Pre-Revenue Beta Data Collection Plan

Per [`corent_pre_revenue_beta_plan.md` §2](corent_pre_revenue_beta_plan.md), beta exists to learn what to build next. Below is the practical mapping.

### 6.1 Safe to collect before auth/payment

For each item: **purpose** / **retention** / **risk** / **future table** / **dashboard usage**.

- **Anonymous search text (sanitized).** Purpose: category demand, intent shape. Retention: 90 days raw, 18 months sanitized. Risk: free-text can carry PII; sanitizer must run before write. Future table: `growth_events` (`search_submitted`) + `search_intents` (sanitized). Dashboard: founder admin (top searches), external (top categories).
- **Category interest.** Purpose: which categories convert. Retention: rolling. Risk: none. Future table: `growth_events`. Dashboard: both.
- **Duration selection.** Purpose: length preference. Future table: `growth_events`. Dashboard: both.
- **Price range clicked.** Purpose: price sensitivity. Future table: `growth_events`. Dashboard: founder admin only (per defensibility note); external as bucketed bands.
- **Listing draft started.** Purpose: lender supply intent. Future table: `growth_events`. Dashboard: both.
- **Rental request intent clicked.** Purpose: borrower conversion. Future table: `growth_events`. Dashboard: both.
- **Seller registration started/completed.** Purpose: lender funnel. Future table: `growth_events`. Dashboard: both.
- **Trust explanation opened.** Purpose: trust friction. Future table: `growth_events`. Dashboard: founder admin.
- **Dashboard CTA clicked.** Purpose: lender engagement. Future table: `growth_events`. Dashboard: both.

**All of the above are written through the sanitizer to `growth_events` only.** No raw table writes from the client.

### 6.2 Collect only after user consent / auth

Each requires explicit consent (not just "by using the site you agree…"), explicit purpose disclosure, and the auth gate.

- **Name** (display name): `profiles.display_name`. Consent: explicit on profile creation.
- **Phone**: `users.phone`. Consent: explicit on phone-verification step. Used for handoff coordination only.
- **Email**: `users.email`. Consent: required for auth.
- **Address / neighborhood** (district-level): `seller_profiles.default_pickup_*`. Consent: explicit on lender registration.
- **Identity verification status**: `seller_profiles.verified_at` + a reference id from the identity partner. The partner holds the underlying documents; CoRent stores only the verification flag.
- **Seller contact info** (preferred channel): on `seller_profiles`. Consent: explicit.
- **Serial number**: `listing_verifications.private_serial_number`. Encrypted at rest. Read role isolated.
- **Product ownership proof**: `upload_assets` of kind `verification_photo`, joined to `listing_verifications`. Private bucket.
- **Pickup details** (district + general meeting note, never exact address until handoff window): on `rental_intents`.

### 6.3 Do not collect yet

Each carries regulatory/compliance weight that must be solved before collection.

- **Full address** (line 1, line 2, exact GPS): not collected. Pickup is district-level; exact location is exchanged out-of-band (or via a future approved messaging surface).
- **National ID / Resident Registration Number (주민등록번호)**: handled by the identity partner only; CoRent never stores it. There is **no excuse** to land this column in CoRent's DB.
- **Payment credentials** (card numbers, CVV, etc.): held by the PG (Toss); CoRent stores only references and receipts.
- **Bank account details** (for lender payouts): held by the PG/payout partner; CoRent stores only references.
- **Raw identity documents**: identity partner; CoRent stores verification status only.
- **Unnecessary location history**: no per-event coordinates, no continuous location tracking.

---

## 7. Launch-Mode Paid Marketplace Readiness After 2026-07-13

Per [`corent_pre_revenue_beta_plan.md` §0](corent_pre_revenue_beta_plan.md), launch requires the calendar plus explicit readiness. Below is a gate-by-gate readiness map.

| Gate | Classification | Notes |
|---|---|---|
| Real auth | required before public beta | Required before any logged-in surface, well before paid launch. |
| RLS on every user-data table | required before public beta | RLS-by-default; opt-out is server-only roles. |
| Server-side role checks (defense in depth on top of RLS) | required before public beta | Route handlers / server actions assert role; do not rely on RLS alone. |
| Toss Payments integration | required before paid launch | Sandbox during concierge ops; live with explicit gate. |
| Payment webhook signature verification | required before paid launch | Idempotency table; replay protection. |
| Deposit hold model | required before paid launch | Authorize on confirmation; capture/release per status. |
| Delayed settlement | required before paid launch | Server-only state transitions; reconciliation job. |
| Lender payout | required before paid launch | Through PG payout product; never direct CoRent → bank. |
| Dispute handling | required before paid launch | Operational playbook + state transitions wired. |
| Damage report flow | required before paid launch | Photo evidence, severity, resolution states. |
| Admin review flow | required before public beta | Concierge ops requires it from day 1. |
| Upload / photo verification | required before public beta | Private bucket, signed URLs, owner-validated writes. |
| Identity verification (lender) | required before paid launch | Partner integration; CoRent stores flag only. |
| Identity verification (high-risk borrower) | can wait until concierge ops scale | Risk-based; partner-driven trigger. |
| Terms / privacy consent | required before public beta | Versioned acceptance log. |
| Audit logs (admin actions) | required before public beta | Append-only. |
| Notification events (email/SMS) | required before public beta | Through partner; rate-limited. |
| Reconciliation job (payments vs. settlements) | required before paid launch | Daily job; alerts on mismatch. |
| Privacy rights workflow (export / delete) | required before public beta | Self-serve delete + admin-approved export. |
| Backup / restore drill | required before public beta | Documented + rehearsed. |
| Incident response runbook | required before public beta | Single page; on-call rotation defined. |
| Rate limits (request creation, search, listing submit) | required before public beta | Per-account, per-IP, per-action. |
| External dashboard sanitization pipeline | later automation | Manual export acceptable until volume justifies. |

---

## 8. Server Strategy: Vercel-First, Hosting-Portable

### Boundary

Next.js App Router on Vercel for v1 of the server. All DB calls live in `src/server/` (proposed) and only **server components**, **route handlers** (`app/api/*/route.ts`), and **server actions** call them. Client components never import the server module; a barrel rule + an ESLint boundary check (proposed in §15) enforces this.

### Supabase client split

- **`@/server/supabase/server.ts`** — server-only Supabase client. Uses the `service_role` key only when an admin-only action requires it (e.g. webhook handler creating cross-user rows). Otherwise uses the user-scoped client created from the request session.
- **`@/server/supabase/admin.ts`** — admin client. Extra import gate; calling sites lint-marked.
- **No client-bundled Supabase service role key, ever.** The only Supabase key in the browser bundle is the public anon key, and only if RLS is on every table the anon key can reach.

### Environment variables

- Public (browser-shipped): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both audited not to be sensitive.
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`, `OPENAI_API_KEY` (when AI lands), upload-bucket credentials. None of these prefix with `NEXT_PUBLIC_`. CI check rejects PRs that introduce a `NEXT_PUBLIC_*` for any of these names.
- Local `.env.local` is gitignored; `.env.example` is committed with placeholders.

### Background jobs on Vercel

Vercel serverless / edge limits make long-running background work unreliable:

- Use **Vercel Cron** (route handler invoked on a schedule) for short-running periodic work: nightly settlement readiness sweep, returns-overdue scan, dashboard snapshot recompute.
- **Do not** use cron handlers for anything > ~30s, anything that requires durable progress, or anything that should retry exactly once. For those, plan a **separate worker** (Supabase Edge Function, Cloud Run, or a dedicated tiny VM running a queue consumer).
- **Webhook ingestion** stays on Vercel route handlers; they are short-lived and fan out to durable processors via a queue (SQS / pg-listen + worker) once webhook volume justifies.

### Webhook endpoint design

- Single handler per provider: `app/api/webhooks/toss/route.ts`.
- Steps in order: parse → verify signature → dedupe by `provider_event_id` → write `payment_events` row in a transaction → enqueue downstream work → return 2xx.
- Idempotency is at the row level via the unique constraint on `(provider, provider_event_id)`. Replays are no-ops.
- 4xx responses for malformed/unsigned payloads; 5xx for unexpected errors so the provider retries. **Never** swallow a verification failure as 2xx.

### Admin-only endpoints

- Dedicated route group: `app/api/admin/*`. Middleware checks the session against an admin role on the server; clients cannot self-elevate.
- Every admin write goes through a single audit logger that writes `admin_actions` in the same transaction as the underlying mutation.

### Future worker / scheduler extraction

- Keep all "scheduled" code in pure modules under `src/server/jobs/`. Vercel Cron handlers are thin invokers. When extracted, the worker imports the same modules and runs them on its own schedule.
- DB connection pooling: use Supabase's connection pooler (Pgbouncer in transaction mode) from Vercel; for the worker, a regular pool is fine.

### Queue / event processing

- v1: synchronous handlers + Vercel Cron sweeps. Acceptable for concierge ops volume.
- v2 (when load justifies): Postgres `LISTEN/NOTIFY` from a worker, or a Supabase queue extension, or external SQS. Decision deferred — depends on what Supabase supports in-region (kr-central / ap-northeast).

### Local dev strategy

- Supabase CLI for local DB.
- `npm run dev` boots Next.js against the local Supabase URL / anon key.
- Seed script under `scripts/seed-dev-db.ts` (proposed; not in this audit) replicates `PRODUCTS` / `SELLERS` / `MOCK_RENTAL_INTENTS` into the local DB. Stable IDs prefixed `seed_*` so production never collides.
- `npm test` continues to run with no DB needed; service-layer tests use the existing Memory adapter or DB integration tests use a docker-compose Postgres on CI.

### Migration strategy

- Plain SQL migrations checked into `migrations/` (or `supabase/migrations/`), forward-only.
- Each migration paired with a rollback note (manual revert SQL kept in the PR description, not auto-run).
- Migrations gated through the security review and applied via the Supabase CLI; production deploys do not auto-run migrations on first request.

---

## 9. Admin & Dashboard Architecture

### 9.1 Internal Founder Admin Growth Dashboard

**Audience:** founder, internal operators. Sensitive content allowed.

**Surfaces:**

- total searches (with breakdown by category, region, time)
- top categories by search → view → request funnel
- seller listing attempts (started / submitted / approved)
- rental request intent count
- request → approval → payment → pickup → return → settlement funnel
- pending admin reviews (listing verifications, disputes, damage reports)
- trust verification backlog (listings awaiting human review)
- payment / settlement state distribution (post-launch)
- dispute / damage state distribution (post-launch)
- neighborhood demand heatmap **at coarse area only** (e.g. district level, not exact address)
- manual concierge notes (linked to user/listing/rental, not free-shared)

**Required hardening:**

- Auth: server-validated session.
- Role: `admin` role flag on `users`, server-checked via middleware on every `app/api/admin/*` request.
- Authorization: per-action checks (e.g. only `admin_super` can disable accounts). Multi-tier admin roles documented.
- Audit log: every admin write writes an `admin_actions` row in the same transaction.
- IP/UA: hashed only; never raw.
- Session timeout: shorter than user sessions (e.g. 12h vs 30d).
- 2FA: required for admin role (TBD enforcement timing).

### 9.2 External Sanitized Partner / Investor Dashboard

**Audience:** partners, investors, occasional public-facing slides. **Must be sanitized.**

**Must NOT expose:**

- names
- emails
- phone numbers
- raw addresses
- exact pickup locations
- serial numbers
- raw search text
- individual user timelines
- payment metadata (provider session ids, exact amounts per transaction)
- admin notes
- dispute details tied to individuals

**May expose:**

- aggregate totals (rentals completed, settlements run, GMV bucketed)
- sanitized category trends (top N categories, share-of-funnel %)
- funnel percentages (request → settled rate)
- coarse geography (region; never district unless district size > N users)
- anonymized time buckets (week / month, never exact timestamps)
- marketplace liquidity indicators (matches per region per week, bucketed)
- trust/safety aggregate metrics (dispute rate, on-time return rate)
- growth snapshots **approved for sharing**

**Recommended implementation: materialized snapshot table with manual approval gate.**

Reasoning:

- A read-only API risks accidental detail leakage as new fields are added; a materialized snapshot is a curated artifact.
- A static export is too friction-heavy for the cadence partners want.
- A materialized table at `external_dashboard_snapshots` with `approved_by` and `approved_at` columns gives both: cadence + approval gate. The dashboard reads only approved rows.
- A per-snapshot `audience_kind` column (`partner|investor|public`) lets one source feed multiple audiences with different aggregation cuts.

The sanitizer / aggregator is its own server module. It writes draft snapshots; admin approval flips them to `approved_at IS NOT NULL`; only approved rows are read by the external dashboard endpoint.

---

## 10. Legal / Trust Boundaries

Per [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md), CoRent is a C2C intermediary, not the counterparty. Every disclosure must reflect that.

| Disclosure / boundary | Required before |
|---|---|
| Privacy consent (versioned acceptance log) | collecting any contact info |
| Terms acceptance | collecting any contact info |
| Lender responsibility statement (item condition, accuracy of description, on-time pickup, no off-platform payment) | enabling lender registration |
| Borrower responsibility statement (timely return, condition, deposit forfeiture rules, no off-platform payment) | enabling rental request |
| Safety deposit explanation (what triggers hold, when released, when forfeited) | enabling real payment |
| Delayed settlement explanation (lender payout timing, blocking conditions) | enabling real payment |
| Damage report handling (who reports, what evidence, dispute path) | enabling real pickup |
| Serial number private-storage statement | collecting serial numbers |
| Photo verification disclosure (what is checked, how long stored, who sees what) | accepting verification photos |
| Direct pickup safety guidance (meet in public, no late hours, no third-party pickup) | enabling real pickup |
| **No off-platform payment** copy (clear, surfaced repeatedly) | enabling real pickup; **must not** be buried in legalese |
| Admin review limitation copy (what admin can/cannot decide) | enabling dispute flow |
| AI recommendation disclaimer ("recommended price is informational, lender decides") | exposing the AI parser |
| Partner / investor data sharing consent + sanitization explanation | exposing the external dashboard |

Gate alignment:

- Before **collecting contact info**: privacy + terms + role responsibilities + AI disclaimer.
- Before **collecting item ownership / serial info**: serial private-storage statement + photo verification disclosure.
- Before **enabling real pickup**: damage handling + direct pickup safety + no-off-platform copy.
- Before **enabling real payment**: deposit + delayed settlement + payment partner disclosure.
- Before **exposing external dashboard**: sanitization + sharing consent.

---

## 11. AI-Coded Security Risk Review

This codebase is built primarily with AI coding agents. The audit below classifies the 20 standard AI-generated risks against the current state.

| # | Risk | Classification | Evidence | Why it matters | Gate before real integration | Recommended check / test |
|---|---|---|---|---|---|---|
| 1 | Secrets / API keys in client bundles | **already safe** | `grep -rn "process\.env\|NEXT_PUBLIC_" src/` returned **no matches**. No env reads anywhere in `src/`. | Any `NEXT_PUBLIC_*` for a secret-bearing key would ship to browsers. | Mandatory CI check before any `process.env` usage lands. | Add a CI step that fails the build if any `NEXT_PUBLIC_*` matches a deny-list of names (`SERVICE_ROLE`, `SECRET`, `PRIVATE`, `TOSS_SECRET`, `OPENAI_API_KEY`, etc.). |
| 2 | Supabase service role key misuse | **not applicable yet** | No Supabase code exists. | Service role key bypasses RLS; client-side use is catastrophic. | Mandatory before DB integration. | Lint rule that bans importing the admin Supabase client from any file under `src/app/**` that is not a route handler / server action; explicit unit test that the admin client never appears in the client bundle. |
| 3 | Missing RLS / access-control boundaries | **needs future gate** | No DB exists; therefore no RLS. The persistence adapter interface is unscoped (no caller-supplied scope). | Any "fetch by id" path becomes "fetch any user's data" if RLS is missing or wrong. | Mandatory before DB integration. | RLS policy unit tests using a non-admin role; deny-by-default schema check. |
| 4 | Route handlers / server actions without auth/role checks | **not applicable yet** | No route handlers or server actions exist (`src/app/**` is server components calling pure client components only). | Becomes an immediate vector once the first handler lands. | Mandatory before any handler that touches user data. | Middleware that reads session, asserts role, and is unit-tested with each handler. |
| 5 | Trusting client-provided userId / ownerId / sellerId / price / status / role | **needs future gate** (current state acceptable; pattern would be catastrophic post-DB) | `src/components/ItemDetailClient.tsx` passes `product.sellerId`/`sellerName` into `rentalService.create`; `src/components/SellerDashboard.tsx` filters by `CURRENT_SELLER.id`. All client-side. | Once the server is real, any of these values posted by the client could spoof a counterparty. | Mandatory before DB integration. | Server-side: derive `seller_id` from `listing_id` on the server, not from the client; derive `borrower_id` from `auth.uid()`. Test that posting a forged sellerId fails. |
| 6 | Admin / internal dashboard data exposed without role separation | **not applicable yet** | No admin surface exists. | Once it exists, accidental client-bundle inclusion of admin queries is a common AI-agent mistake. | Mandatory before admin surface. | Admin route group + middleware test; admin Supabase client import test. |
| 7 | Raw analytics / sensitive event logs exposed to external dashboards | **not applicable yet** | No analytics exist. | The external dashboard must read only sanitized aggregates. | Mandatory before external dashboard. | Snapshot-table-only read endpoint; integration test that asserts no `growth_events.*` field is reachable via the external endpoint. |
| 8 | File / photo upload access-control gaps | **not applicable yet** | No upload flow exists. | Public buckets and unsigned URLs leak photos and serial numbers. | Mandatory before any upload feature. | Bucket default deny; signed-URL TTL test; owner-validated POST endpoint test. |
| 9 | Payment webhook signature verification gaps | **not applicable yet** | Mock payment adapter does not have webhooks. | Forged webhook = forged "paid" state = lender payout from nothing. | Mandatory before live PG. | Provider-signature verification unit + integration tests; signed-but-replayed test should be a no-op via idempotency. |
| 10 | Prompt-injection risks in future AI parser / admin tooling | **not applicable yet** | Current parser is rule-based; no LLM call. | Becomes real the moment a real LLM is wired. | Mandatory before LLM swap. | Server-only parser endpoint; system prompt isolation; output JSON-validated against `Omit<SearchIntent, …>` and `ParsedSellerInput` types. |
| 11 | Excessive logging of personal data / search text / addresses / contact info / tokens / payment metadata | **needs future gate** (current state acceptable; pattern would be catastrophic post-server) | No server logs exist. | AI agents commonly add `console.log(req.body)`; this is exactly what must not happen. | Mandatory before any server logging. | Logger wrapper that redacts known PII keys; CI scanner that flags `console.log` in `src/server/**`. |
| 12 | Unreviewed dependencies / AI-added packages | **already safe** for runtime; **needs future gate** for process | `package.json`: `next 16.2.4`, `react 19.2.4`, `react-dom 19.2.4` plus dev deps (`vitest`, `eslint`, `tailwindcss`, types). All pulled in deliberately. | AI agents add packages by reflex; supply-chain risk scales with that habit. | Process: every dep PR requires explicit user approval (already a documented constraint). | CI step that fails on `package.json` diff without an "approved-deps" PR label, or simply enforce existing review discipline. |
| 13 | TODO / security comments that imply future protection but are not enforced | **already safe** | `grep -rn "TODO\|FIXME\|XXX\|HACK\|SECURITY:"` over `src/` returned **zero matches**. | Comment-only protection is a frequent AI tell. | Already enforced. | Keep the TODO scanner part of CI when CI lands; treat any new TODO as a gate. |
| 14 | Client-side calculation trusted for payment / deposit / settlement | **needs future gate** | All pricing flows through `src/lib/pricing.ts` *which is also imported on the client* (e.g. `ItemDetailClient.tsx` calls `calculateRentalAmounts`). The client computes the borrower-facing display correctly today; the server has no computation. | Once the server is real, the server **must** recompute on every transition. The client display is advisory; the row's stored `amounts.*` must come from the server. | Mandatory before payment / settlement integration. | Server-side amount-calc test: posting a different `rentalFee` in a request body must be rejected (or recomputed silently). |
| 15 | localStorage data treated as authoritative | **needs future gate** | `getPersistence()` resolves to `LocalStoragePersistenceAdapter`. The dashboard, item detail, and search all currently treat localStorage as the source of truth — appropriate for MVP v1. | Once DB exists, localStorage must become a cache; treating it as authoritative would let users self-promote rentals to `settled`. | Mandatory before DB integration. | After DB lands: integration test that bulk-poking `corent:*` keys does not change server state; explicit "cache only" comment in the migrated adapter. |
| 16 | Missing rate limits on future intent creation / search / listing submission | **not applicable yet** | No server endpoints. | A search endpoint without rate limits is trivially abusable. | Mandatory before public beta. | Rate-limit middleware (per-IP, per-user, per-action); load test on the first protected endpoint. |
| 17 | Missing CSRF / session assumptions for future server mutations | **not applicable yet** | No mutating endpoints. | Server actions in App Router get CSRF protection by framework, but **route handlers do not**. | Mandatory before any mutating route handler. | CSRF check on every mutating route handler (or restrict mutations to server actions only). |
| 18 | Overly broad admin queries | **not applicable yet** | No admin code. | "Select * from listings" in an admin dashboard is one drift away from leaking everything. | Mandatory before admin surface. | Admin queries must go through a typed repository module that enforces field-level visibility; lint rule banning `select *` on user-data tables. |
| 19 | Missing audit log for admin actions | **not applicable yet** | No admin actions. | Lack of audit log means undetectable insider misuse. | Mandatory before admin surface. | `admin_actions` table; transaction wrapper that requires a non-null actor and a non-empty before/after delta. |
| 20 | Missing data retention / deletion plan | **needs future gate** | No persistence beyond localStorage. | Compliance and trust both require this; AI agents skip it. | Mandatory before public beta. | Documented retention table per row-class (this audit §5.1 is a starting point); user-initiated delete flow tested; admin-approved export tested. |

---

## 12. Risk Classification Summary

### 12.1 Not applicable yet

Naturally blocked because the surfaces don't exist yet. **Become mandatory the moment the surface lands.**

- 2: Supabase service role key misuse
- 4: Route handlers / server actions without auth/role checks
- 6: Admin dashboard role separation
- 7: Raw analytics in external dashboards
- 8: File upload access control
- 9: Payment webhook signature verification
- 10: Prompt injection in real LLM parser
- 16: Rate limits on mutating endpoints
- 17: CSRF for mutating route handlers
- 18: Overly broad admin queries
- 19: Admin action audit log

### 12.2 Already safe

Safe because the implementation is mock/local/demo-only or by design.

- 1: No secrets in client bundle (no `process.env.*` reads anywhere in `src/`).
- 12: Dependency set is small and reviewed (`next`, `react`, `vitest`, `eslint`, `tailwindcss`, type packages).
- 13: Zero TODO/FIXME/SECURITY comments in `src/`.

### 12.3 Needs future gate before DB / auth / payment / upload / location

Acceptable today; mandatory before integration.

- 3: RLS / access control boundaries.
- 5: Server-side derivation of userId / sellerId / amounts / status (instead of trusting the client posts).
- 11: Logger redaction discipline.
- 14: Server-side amount recomputation on every money-bearing transition.
- 15: localStorage-as-cache-only (not authoritative) once DB lands.
- 20: Data retention / deletion plan documented and implemented.

### 12.4 Immediate blocker before public beta

**None today** at the code level — the codebase is intentionally pre-everything. The only items that block even pre-revenue **public** beta are at the documentation / process level:

- A **server-side analytics ingestion path** with a sanitizer must exist before the first public-traffic event. (Without it, the alternative is to instrument from `localStorage`, which cannot meet basic anonymity guarantees across users.)
- A **privacy / terms surface** must exist before any field that could be PII reaches a server.
- A documented **data controller identity** (which entity is responsible for the data) must exist before any inbound user data leaves a browser.

These are documented expectations in [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) and [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md); making them blockers means we will not flip on a public-traffic surface (even pre-revenue) until they exist.

---

## 13. Migration Plan

Phases 0–4 with explicit gates at each transition. Each phase ends with a docs-only readiness note, a security review where applicable, and explicit user approval.

### Phase 0 — Current Browser Demo

- No real DB, auth, payment, uploads, or personal data.
- Use for demo only.
- **Status:** complete (`5277f09`).

### Phase 1 — Instrumented Validation Beta

**Goal:** collect sanitized demand signals.

**Allowed:**

- anonymous / sanitized events written through a server-only sanitizer endpoint to a `growth_events` table on a small isolated database (Supabase or even a single-table SaaS — decision deferred);
- aggregate growth dashboard for the founder (gated behind hard-coded admin auth at first);
- local / manual founder review of weekly aggregates;
- **no payments, no listings persisted off-device, no rentals persisted off-device.**

**Required:**

- analytics event schema (the `growth_event_type` enum proposed in §5.2);
- PII guardrails (sanitizer module is the only writer);
- privacy copy (terms acceptance + data-collection disclosure on first public load);
- event retention policy (90 days raw event sanitized at ingest, 18 months sanitized aggregates);
- **no raw external dashboard.**

**Exit criterion:** founder admin can read the funnel from real anonymous traffic; sanitizer has zero PII leakage in a tested sample.

### Phase 2 — Concierge DB Beta

**Goal:** founder manually operates the first supply/demand workflow.

**Allowed:**

- Supabase / Postgres (per §5.1);
- auth (Supabase Auth, magic-link or password+MFA — decision in implementation note);
- admin review (queue + decision);
- listing / rental submissions persisted server-side;
- manual status changes by admin (with audit log);
- limited contact info **with explicit consent**.

**Required:**

- RLS on every table (deny-by-default; opt-out only for admin role);
- server-side role checks on every endpoint (defense in depth on top of RLS);
- admin audit log (`admin_actions`);
- data retention plan, written;
- table-level PII classification (this audit §5.1 is the starting point);
- **no service role key in client bundles** (CI guard);
- domain-type widening for region (`"seoul"` literal → enum) to support Korea-wide;
- retire `CURRENT_SELLER` hardcode; replace every reference with session-derived identity in the same PR that introduces auth.

**Exit criterion:** ten concierge-managed end-to-end rentals (mock payments still) running cleanly on real DB with real auth, zero PII leakage in audit, at least one tested RLS denial per role.

### Phase 3 — Paid Test Transactions After 2026-07-13

**Goal:** limited real payments with operational control.

**Allowed:**

- Toss Payments (test → live behind a flag);
- payment / deposit / settlement records;
- webhook event storage;
- delayed settlement state.

**Required:**

- webhook signature verification + replay protection (idempotency);
- server-side amount calculation (client never authoritative on price/fee/deposit/payout);
- dispute / damage operational playbook (docs-only first, then wired);
- legal terms (versioned acceptance);
- payment failure states wired (`payment_failed`, `payment_pending` recovery, etc.);
- reconciliation process (daily job comparing `payments` ↔ `settlements`, alerts on mismatch);
- explicit calendar gate satisfied (post-2026-07-13) and explicit user approval recorded.

**Exit criterion:** 30 paid rentals settled cleanly, full reconciliation, zero unresolved webhook anomalies.

### Phase 4 — Public Beta

**Goal:** broader real-user beta.

**Required:**

- production auth (MFA available; required for admin);
- production RLS reviewed by a second pair of eyes;
- upload access control (private bucket, signed URLs, owner-validated);
- rate limiting (per-account / per-IP / per-action);
- admin tooling (queue, search, export);
- privacy / legal review (external counsel pass);
- monitoring (error rate, latency, auth-failure rate, RLS-denial rate);
- incident response runbook;
- backup / restore drill (tested);
- external dashboard sanitization pipeline (materialized snapshots with manual approval, per §9.2);
- public terms / privacy versioned and consented.

**Exit criterion:** all of the above + zero unresolved security-review items.

---

## 14. Proposed Acceptance Gates

### Before real DB

- [ ] Schema reviewed and matches §5.1 (or explicit deviations documented).
- [ ] RLS policy design reviewed: deny-by-default, per-table policies, per-role grants.
- [ ] PII table classification complete: every table has a sensitivity label.
- [ ] Server-only DB access pattern chosen: which client (Supabase server client / direct PG via Drizzle / etc.).
- [ ] Migration rollback plan: every migration has a reverse SQL note.
- [ ] Local seed / demo strategy: stable `seed_*` ids, dev seed script, no production collisions.

### Before auth

- [ ] Roles defined: `user`, `seller`, `admin`, `admin_super` (or final set).
- [ ] Account / profile separation: auth identity and display profile are distinct rows.
- [ ] Admin role cannot be client-controlled: only mutable by `admin_super` via dedicated endpoint.
- [ ] Session validation pattern: middleware function, unit-tested, used by every handler that mutates.
- [ ] Protected route policy: list of routes, expected role, denial behavior (302 vs. 401 vs. 404).

### Before payment

- [ ] Server-side pricing only: every fee/deposit/payout reads from `src/server/pricing.ts`, never from request body.
- [ ] Toss webhook signature verification: implemented + tested + monitored on failure.
- [ ] Payment event idempotency: unique `(provider, provider_event_id)` constraint; replayed events are no-ops.
- [ ] Amount mismatch handling: PG-reported amount ≠ stored amount → `payment_failed` + alert.
- [ ] Refund / cancel / dispute states: state machine extended; transitions covered by tests.
- [ ] Settlement hold rules: per-status hold reasons; tested.

### Before upload / photo

- [ ] Private bucket by default: public access denied at the bucket level.
- [ ] Signed URLs: short TTL (e.g. 5 min for upload, 60s for view); refresh path documented.
- [ ] Upload owner validation: signed-URL request requires authenticated user; row created server-side, not client-supplied.
- [ ] File type / size validation: server-checked at signed-URL request time and again on the upload event.
- [ ] Malware / content moderation plan: at minimum, a virus-scan trigger (provider TBD); content moderation deferred unless required.
- [ ] No public serial / photo leakage: serial number on its own table/column with isolated grant.

### Before location / pickup

- [ ] Coarse location public: region + district publicly visible on listings.
- [ ] Exact pickup location private: revealed to confirmed counterparty only at pickup window.
- [ ] Reveal timing rules: documented (e.g. pickup details revealed 1h before scheduled handoff).
- [ ] Contact exchange rules: prefer in-platform messaging once it lands; until then, share via the system on confirmation.
- [ ] Safety guidance: copy surfaced before first pickup confirmation (in-platform).

### Before external dashboard

- [ ] Only aggregate snapshots: no row-level data exposed.
- [ ] Manual approval option: each snapshot has `approved_by` / `approved_at`; only approved rows reachable.
- [ ] No raw event logs: external endpoint reads only `external_dashboard_snapshots`.
- [ ] No user-level drilldown.
- [ ] No PII fields in the snapshot payload (sanitizer-tested).
- [ ] No exact location.
- [ ] No payment metadata.

---

## 15. Recommended Tests / Static Checks Later

Each is a docs-only proposal; none is implemented in this audit.

- **Domain state-transition tests** (already exist for `rentalIntentMachine`; extend with per-actor tests once role-gating lands).
- **Server-side amount calculation tests** — posting a forged `rentalFee` results in either rejection or server recomputation; never accepts the client value.
- **RLS policy tests** — test matrix per role × per table × per CRUD verb; deny-by-default verified.
- **Admin authorization tests** — non-admin requests to `app/api/admin/*` get 403/404; admin-action-without-audit-row test.
- **Payment webhook idempotency tests** — same `provider_event_id` replayed N times produces one row.
- **Upload access tests** — non-owner GET on a verification photo signed-URL is denied; expired URL fails predictably.
- **Analytics sanitization tests** — feed sample search inputs containing PII; assert sanitizer strips them and `growth_events` row never contains the raw input.
- **External dashboard snapshot tests** — only `approved_at IS NOT NULL` rows are reachable; no PII fields exist on the schema.
- **No-secret-in-client-bundle check** — CI grep that fails on `NEXT_PUBLIC_*` matches against a deny-list.
- **Dependency review check** — `package.json` diffs require an explicit approval label.
- **TODO / security comment scanner** — CI fails if a new `TODO|FIXME|XXX|HACK|SECURITY:` is added without a tracking issue.
- **Logging redaction tests** — logger wrapper redacts known PII keys; raw `console.log` in `src/server/**` fails CI.

---

## 16. Final Recommendation

### What should happen next

The single most useful next PR is **docs-only**: a phased implementation plan note that translates this audit into the smallest first concrete step. That step is **Phase 1 — Instrumented Validation Beta**, sized as the smallest possible cut: a single sanitizer endpoint, a single `growth_events` table, an admin dashboard read-only against that table. Nothing else.

Before any code, the implementation plan note should:

- pick the host (Supabase region + project), constrained to in-region (kr-central / ap-northeast) for compliance posture;
- pick the auth strategy for the founder admin dashboard (likely IP-allowlist + one-time link until Phase 2 brings real auth);
- name the sanitizer's allow-list of fields, deny-list of patterns, and test fixtures;
- pick the retention windows in concrete numbers;
- list the privacy / terms copy required before public traffic;
- name the explicit gates from §14 that apply to Phase 1 (a small subset).

### What should not happen yet

- No DB migration files in this repo.
- No Supabase project files.
- No payment integration.
- No feature flag implementation.
- No new dependencies.
- No source code changes.
- No admin UI implementation.
- No external dashboard implementation.
- No deletion of `CURRENT_SELLER` (it is the only "logged-in identity" CoRent has today; replacing it requires the auth landing PR, not a piecemeal removal).
- No fee-formula update in [`src/lib/pricing.ts`](../src/lib/pricing.ts) (intentional debt; updating it requires the launch-mode PR with versioned `fee_version` recording on every saved row).

### One recommended next PR scope

**`docs: add phase 1 implementation plan note`** — single new file under `docs/`, e.g. `docs/corent_phase_1_implementation_plan.md`. Docs-only. Picks the Supabase region, auth strategy for founder admin, sanitizer allow/deny lists, retention numbers, privacy/terms copy requirements, and the §14 subset. After that note lands and is approved, the very next PR can begin Phase 1 implementation **gated behind the security review note** required by [`corent_security_gate_note.md`](corent_security_gate_note.md) for any DB integration.

---

## Required Final Command Checks

Per the audit prompt: only commands that make sense for a docs-only change.

- `git status --short` (run by me): clean before this audit, will show one new file after.
- `git diff --check` (run by me on staged): will report no whitespace errors.
- `npm run lint` (optional for docs-only): not run; nothing under `src/` changed and `eslint.config.mjs` ignores all of `docs/**`. If run, would no-op.
- `npm run build` (optional for docs-only): not run; build does not consume `docs/`.
- `npm test` (optional for docs-only): not run; no test surface changed.

Validation results recorded in this session's report message.

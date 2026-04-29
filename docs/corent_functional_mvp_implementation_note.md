# CoRent Functional MVP — Implementation Note

_Last updated: 2026-04-29_

This note describes the move from static visual MVP to **functional local MVP**, while keeping the BW Swiss Grid design language intact.

---

## 1. What was implemented

### Domain layer (`src/domain/`)

- `categories.ts` — Category registry. MVP categories enabled, future
  categories (vacuum, projector, camera, camping) defined but disabled.
- `durations.ts` — 1/3/7-day durations as a single source of truth.
- `products.ts` — Product type.
- `sellers.ts` — Seller type.
- `intents.ts` — `SearchIntent`, `ListingIntent`, `RentalIntent`,
  `VerificationIntent`, `PaymentSession`, `SettlementState`, `RentalEvent`,
  plus full status enums and `RENTAL_HAPPY_PATH` / `RENTAL_FAILURE_STATES`.

### Pure functions (`src/lib/`)

- `pricing.ts` — `calculateRecommendedRentalPrice`, `calculateSafetyDeposit`,
  `calculatePlatformFee`, `calculateSellerPayout`, `calculateBorrowerTotal`,
  and `calculateRentalAmounts` (one call to derive all five).
- `safetyCode.ts` — `generateSafetyCode()` (deterministic by UTC day) and
  `generateListingSafetyCode(seed)`.
- `ids.ts` — `generateId(prefix)` and `nowIso()`.
- `format.ts` — `formatKRW`. Re-exports the pricing module's settlement
  helpers so legacy callers keep working.

### State machine (`src/lib/stateMachines/`)

- `rentalIntentMachine.ts` — pure transitions for the entire RentalIntent
  lifecycle plus failure paths. Validates moves (`canTransition`), returns
  `TransitionResult` with structured errors, never mutates input, and emits
  a `RentalEvent` on every successful transition. Functions:
  `createRentalIntent`, `approveRentalIntent`, `markPaymentPending`,
  `mockConfirmPayment`, `confirmPickup`, `markReturnPending`,
  `confirmReturn`, `markSettlementReady`, `mockSettle`, `openDispute`,
  `markPaymentFailed`, `markPickupMissed`, `markReturnOverdue`,
  `reportDamage`, `blockSettlement`, `cancelRentalIntent`.

### Adapters (`src/lib/adapters/`)

- `payment/types.ts` + `mockPaymentAdapter.ts` — Toss-shaped session and
  confirmation simulation, in-memory.
- `ai/types.ts` + `mockAIParserAdapter.ts` — rule-based KO/EN parser for
  search input and seller input.
- `persistence/types.ts` + `localStorageAdapter.ts` + `memoryAdapter.ts` +
  `index.ts` — `getPersistence()` returns localStorage in browser,
  in-memory on SSR, never crashes during hydration.

### Application services (`src/lib/services/`)

- `searchService` — parse / save / encode + decode SearchIntent via URL.
- `listingService` — draft from raw input, edit, toggle verification
  checks, save draft, submit for review.
- `rentalService` — orchestrates state machine + payment adapter +
  persistence on top of pure transitions. UI only talks to this.
- `dashboardService` — derives `DashboardSummary`, pending/active/failure
  rows, and relative-time strings from a list of RentalIntents + listings.

### UI

| Route | What's now functional |
|---|---|
| `/` | `AISearchInput` parses live, persists `SearchIntent`, navigates to `/search?q=…&category=…&duration=…`. Shows live AI-parsed preview as you type. |
| `/search` | Reads parsed conditions from URL; category chips and 1/3/7 duration filter actually filter `PRODUCTS`. Empty state. Parsed-condition card uses dashed lines for missing values. |
| `/items/[id]` | Duration toggle changes rental fee, deposit, platform fee, seller payout, and borrower total live. Request CTA creates a real `RentalIntent`, persists it, and shows the lifecycle timeline. Existing intent for the product is rehydrated on revisit. |
| `/sell` | Natural-language input → mock parser → editable structured fields. Listing preview, AI price band, and safety code regenerate as the seller edits. Verification checklist toggles per-item. Submit either creates a `human_review_pending` ListingIntent or, if checks are missing, persists as `verification_incomplete`. |
| `/dashboard` | All numbers (monthly earnings, pending settlement, active rentals, return-due-soon, pending requests, listed items) are derived from RentalIntents in localStorage with mock-data fallback. Includes per-rental "다음 단계 진행" actions that step through the state machine. Failure/blocked rentals render as a dedicated BW block. Demo controls to seed/clear local data. |

### Components added

- `components/AISearchInput.tsx`
- `components/SearchResults.tsx`
- `components/ItemDetailClient.tsx`
- `components/SellerRegistration.tsx`
- `components/SellerDashboard.tsx`
- `components/intent/RentalIntentTimeline.tsx`
- `components/intent/IntentStatusBadge.tsx`
- `components/pricing/PriceBreakdown.tsx`

The original reusable components (`Button`, `Card`, `Badge`, `Input`,
`PageShell`, `SectionHeader`, `ProductCard`, `TrustSummary`,
`DurationSelector`, `SafetyCodeCard`, `SellerDashboardStat`,
`AIChatPanel`) are unchanged.

---

## 2. Intent model summary

```
SearchIntent       borrower's parsed query (transient)
ListingIntent      seller's listing draft + verification checks
VerificationIntent embedded in ListingIntent — checks + safety code + status
PaymentSession     adapter-shaped session (mock today, Toss tomorrow)
RentalIntent       central transactional object (lifecycle + amounts +
                   payment + pickup + return + settlement)
RentalEvent        append-only lifecycle log per RentalIntent
```

`RentalIntent.status` lifecycle:

```
draft → requested → seller_approved → payment_pending → paid →
pickup_confirmed → return_pending → return_confirmed →
settlement_ready → settled
```

Failure states modeled from day one:

```
cancelled, payment_failed, seller_cancelled, borrower_cancelled,
pickup_missed, return_overdue, damage_reported, dispute_opened,
settlement_blocked
```

---

## 3. Adapter boundaries

```
UI ─────► Application service (rental / listing / search / dashboard)
              │
              ├──► Pure domain functions (state machine, pricing)
              │
              └──► Adapter interfaces
                       │
                       ├── PaymentAdapter        (mock today)
                       ├── AIParserAdapter       (rule-based today)
                       └── PersistenceAdapter    (localStorage today)
```

UI never imports an adapter. Swapping an adapter requires:

- Toss → write `TossPaymentAdapter implements PaymentAdapter`, replace the
  one import in `rentalService.ts`.
- OpenAI → write `OpenAIParserAdapter implements AIParserAdapter`, replace
  the one import in `searchService.ts` / `listingService.ts`.
- Supabase → write `SupabasePersistenceAdapter implements
  PersistenceAdapter`, return it from `getPersistence()` instead of the
  local one.

---

## 4. What is still mocked

- **Payment**: simulated session + immediate paid confirmation. No real
  Toss Payments call.
- **AI parsing**: rule-based keyword detection. No LLM call.
- **Persistence**: localStorage (per-browser, no sync).
- **Auth**: a single `CURRENT_SELLER` constant. No login.
- **Image upload**: not implemented; verification checks are toggles only.
- **Identity verification**: out of scope.
- **Settlement processor**: marks `settled` in localStorage; no payout.
- **Dispute flow**: states exist; no resolution UI.

---

## 5. How to run

```bash
npm install
npm run lint     # clean
npm run build    # 13 routes, all static
npm run dev
```

---

## 6. Known issues

- `docs/eslint.config.mjs` is a markdown design document misnamed `.mjs`.
  ESLint cannot parse it as JavaScript. Mitigated by `globalIgnores` in
  `eslint.config.mjs`. Renaming the doc to `.md` would let us drop the
  ignore.
- The legacy `src/lib/payments.ts` and `src/data/dashboard.ts` are still
  present. `dashboard.ts` is read for the legacy "listed items" rows; the
  rest is superseded. Removing them is a separate cleanup pass.

---

## 7. Next steps

### Toss Payments integration
1. Add Toss SDK + server route `app/api/payments/route.ts`.
2. Implement `TossPaymentAdapter` against the same `PaymentAdapter` shape.
3. Replace `mockPaymentAdapter` in `rentalService.startPayment` /
   `confirmPayment`.
4. Add a Toss redirect-return handler that calls `confirmPayment` with the
   real `paymentKey`.

### Supabase / Postgres
1. Spin up a Supabase project. Use the schema in
   `docs/corent_database_schema_draft.md`.
2. Implement `SupabasePersistenceAdapter` against `PersistenceAdapter`.
3. Update `getPersistence()` to return the Supabase adapter when
   `NEXT_PUBLIC_SUPABASE_URL` is set; keep localStorage as a dev fallback.
4. Move "current seller" out of `CURRENT_SELLER` into Supabase auth.

### OpenAI structured extraction
1. Add an `app/api/ai/parse/route.ts` route that calls OpenAI with a
   structured-output schema matching `Omit<SearchIntent, "id" |
   "createdAt">` and `ParsedSellerInput`.
2. Implement `OpenAIParserAdapter` that calls that route.
3. Swap one import in the search/listing services. UI does not change.

### Hardening
- Add `RentalIntentTimeline` to `/dashboard` per-row drill-down.
- Add chaos-engineering dev controls (force `payment_failed`,
  `pickup_missed`, etc.) on dashboard rows.
- Server actions for state transitions once a real DB lands, so the
  state machine runs on the server and writes are auditable.

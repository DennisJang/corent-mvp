# CoRent MVP — QA & Stabilization Note

_Last updated: 2026-04-29_

This pass came right after the intent-based functional MVP foundation
landed. No new features, no visual redesigns, no external services —
just verifying the existing local flows behave correctly and tightening a
few seams.

The BW Swiss Grid visual system is unchanged. Palette, typography,
spacing, line tokens, and grid splits are all preserved exactly.

---

## 1. What was checked

### Borrower flow

| Step | Verified |
|---|---|
| Landing AI input parses live | ✓ |
| Empty submit no longer fabricates a "마사지건 3일" query — falls through to `/search` cleanly | fixed |
| URL hand-off (`q`, `category`, `duration`, `region`, `priceMax`) round-trips | ✓ |
| Category chips on `/search` toggle without dropping other params | ✓ |
| Duration toggle preserves category and price-max | ✓ |
| Empty results state gives an obvious "조건 초기화" affordance | ✓ |
| Product detail duration toggle re-derives every amount | ✓ |
| Price breakdown rows match the borrower total | ✓ |
| `대여 요청하기` creates a `RentalIntent` and persists it | ✓ |
| Returning to the same product rehydrates the existing intent | ✓ |

### Seller flow

| Step | Verified |
|---|---|
| `/sell` natural-language input → mock parser → editable fields | ✓ |
| Category select filtered to enabled categories only | ✓ |
| Estimated-value edit recalculates AI price band | ✓ |
| Safety code generated per listing (deterministic by seed) | ✓ |
| Verification checklist toggles individually | ✓ |
| `검수 요청 보내기` flips status to `human_review_pending` only when checks pass; otherwise persists as `verification_incomplete` | ✓ |
| Submitted listings appear on the seller dashboard | ✓ |

### Dashboard flow

| Step | Verified |
|---|---|
| Mock fallback shows up only when there is no real data for the current seller | fixed (was: shows when *anyone's* data is empty) |
| "모의 대여 채우기" / "추가" seeds without duplicating (mock IDs are stable, save-overwrites) | ✓ |
| "로컬 데이터 비우기" wipes every CoRent key (rentals, listings, search intents, events) | fixed (was: only deleted rentals visible to the current user) |
| Derived stats (monthly settled, pending settlement, active, requests, returns due, failures) come from `dashboardService` | ✓ |
| "다음 단계 진행" advances every status in the active block | fixed (`return_confirmed` and `settlement_ready` were filtered out before) |
| Failure block renders calmly in BW only | ✓ |
| Relative-time strings no longer cause hydration mismatch — render only after mount | fixed |
| `RentalIntent` rows are filtered to the current seller | fixed (was: showed every seller's rentals) |

---

## 2. Bugs / inconsistencies fixed

1. **State machine — missing recovery transitions.** Added `return_overdue → return_pending` and `settlement_blocked → settlement_ready`. These were called for in the spec but not in `ALLOWED_TRANSITIONS`.
2. **State machine — invalid `paid → borrower_cancelled`.** Removed: leaves `payment.status === "paid"` while `status === "borrower_cancelled"`, which would need a refund flow we don't have. Borrower can still cancel before payment via `payment_pending → borrower_cancelled`.
3. **Dashboard — `return_confirmed` and `settlement_ready` were invisible.** Both were handled by the "다음 단계 진행" switch but excluded from `ACTIVE_STATUSES`, so a seller could never reach the settle action without DevTools. Added them.
4. **Dashboard — rentals from other sellers leaked in.** The borrower flow can produce a `RentalIntent` with `sellerId !== CURRENT_SELLER`, and the dashboard rendered all of them. Now filtered by `sellerId`.
5. **Dashboard — "로컬 데이터 비우기" was incomplete.** It iterated over the displayed rentals only; listings, search intents, and event logs survived. Replaced with `getPersistence().clearAll()`.
6. **Dashboard — relative-time SSR mismatch.** `relativeTime(r.createdAt)` is computed against `new Date()` at render time. During the static prerender that's the build clock; in the browser it's now. The strings differed → hydration warnings/mismatch. Now only rendered after `loaded`.
7. **Persistence — corrupted localStorage could crash readers.** `readJson` returned whatever `JSON.parse` produced. If a key held an array but the caller expected a record, `Object.values(...)` blew up. Added a shape check that falls back to the empty default when the parsed value doesn't match.
8. **Persistence — no clear-all primitive.** Added `PersistenceAdapter.clearAll()` to both the in-memory and localStorage implementations.
9. **AI search — empty submit fabricated a fallback query.** Hitting "결과 보기" with an empty input redirected to `/search?q=마사지건+3일` which lied about the user's intent. Now: empty submit goes to plain `/search`.
10. **Search — invalid category in the URL was used as-is.** `?category=garbage` was cast to `CategoryId`. Now validated against the enabled-category set; unknown values are dropped.
11. **Search — `fromQuery` returned null when only filter params were present.** Setting `?duration=7&category=massage_gun` (no `q`) produced a null intent and reset to defaults. Now any non-empty param keeps the intent alive.
12. **Search — non-deterministic intent IDs.** `fromQuery` minted a fresh `generateId(...)` and `nowIso()` on every render. Replaced with a deterministic id derived from the query string.
13. **Pricing — LG Styler 1-day price drifted from the formula.** Hardcoded `24000` vs. formula `24200`. All product `prices` are now derived from `calculateRecommendedPriceTable(estimatedValue)`, so search cards, detail page, listing recommendation, and `RentalIntent` amounts can never disagree.
14. **Pricing — mock RentalIntents hardcoded fees.** Replaced with the same formula via `getProductById(...).prices`. Adding a future product no longer requires touching the fixtures.
15. **Microcopy — clearer status labels.** `요청됨 → 요청 접수`, `승인됨 → 판매자 승인`, `수령 누락 → 수령 미완료`, `분쟁 진행 → 분쟁 처리`.
16. **Lint — pre-existing `docs/eslint.config.mjs` parse error** was already suppressed via `globalIgnores`. Confirmed clean.

---

## 3. Files changed

| File | Why |
|---|---|
| `src/lib/stateMachines/rentalIntentMachine.ts` | recovery transitions + comment, removed `paid → borrower_cancelled` |
| `src/lib/adapters/persistence/types.ts` | `clearAll()` in interface |
| `src/lib/adapters/persistence/memoryAdapter.ts` | `clearAll()` impl |
| `src/lib/adapters/persistence/localStorageAdapter.ts` | `clearAll()` impl + shape-checked `readJson` |
| `src/lib/services/dashboardService.ts` | `ACTIVE_STATUSES` includes `return_confirmed`, `settlement_ready` |
| `src/lib/services/searchService.ts` | category validation + deterministic id + tolerant `fromQuery` |
| `src/components/SellerDashboard.tsx` | seller-scoped filter, `clearAll()` use, hydration-safe relative time |
| `src/components/AISearchInput.tsx` | empty-submit fallback removed |
| `src/components/intent/IntentStatusBadge.tsx` | sharper Korean labels |
| `src/data/products.ts` | seeds + derived prices via `calculateRecommendedPriceTable` |
| `src/data/mockRentalIntents.ts` | seeds derive prices from product, exhaustive lifecycle helpers |
| `src/data/dashboard.ts` | trimmed to the still-used `LISTED_ITEMS` + legacy comment |
| `src/components/DurationSelector.tsx` | legacy comment + dropped a redundant `focus-visible:outline` class |
| `src/components/AIChatPanel.tsx` | legacy comment |
| `src/lib/payments.ts` | **deleted** (truly unused) |

---

## 4. Confirmed flows

After these fixes the following paths run end-to-end on a fresh
localStorage:

1. Landing → AI search → `/search` (with parsed conditions) → product
   detail → 대여 요청 → `RentalIntent` persisted → timeline rendered →
   navigate to dashboard → request appears under "대기 중인 대여 요청".
2. Dashboard → 승인 → 다음 단계 진행 (`payment_pending` → `paid` →
   `pickup_confirmed` → `return_pending` → `return_confirmed` →
   `settlement_ready` → `settled`) → 이번 달 정산 number updates.
3. /sell → natural-language input → editable fields → 검수 요청 보내기 →
   listing appears on dashboard with the `사람 검수 대기` badge.
4. Failure recovery: `payment_failed → payment_pending`, `return_overdue →
   return_pending`, `settlement_blocked → settlement_ready` are all valid
   transitions and emit `RentalEvent`s.

---

## 5. What is still mocked

- **Payment**: `MockPaymentAdapter` — synthetic session, immediate confirm.
- **AI parsing**: rule-based KO/EN keyword detection. No model calls.
- **Persistence**: localStorage in browser, in-memory on SSR. No
  cross-device sync. No event log truncation policy.
- **Auth**: a single `CURRENT_SELLER` constant. Borrower identity is
  hard-coded to anonymous.
- **Image upload**: not implemented; verification photo checks are toggles.
- **Identity verification**: out of scope.
- **Settlement processor**: marks `settled` in localStorage; no payout.
- **Dispute resolution**: states exist; resolution UI does not.
- **Listed-items analytics row** (views, monthly rentals): still backed by
  a hand-curated fixture in `src/data/dashboard.ts`. Marked legacy.

---

## 6. Assumptions that remain

- Mock seller is `seller_jisu`. All mock RentalIntents are reassigned to
  this seller for demo purposes, even when the source product technically
  belongs to a different mock seller in the catalog. A real auth pass will
  remove this fudge.
- Listings created via `/sell` carry `sellerId = seller_jisu` and surface
  on the dashboard immediately. There is no admin-side review UI — the
  status simply moves to `human_review_pending` and stays there until
  someone manually flips it in DevTools.
- `settled` is the terminal state of a successful rental. There is no
  refund/reverse settlement path yet.
- `paid → borrower_cancelled` was removed. If we add a refund flow, this
  is the transition to revisit.
- Safety code is deterministic per UTC day for the borrower-facing
  display, and per-listing-seed for sellers. Both formulations are
  collision-tolerant for the MVP scale; do not assume cryptographic
  uniqueness when wiring real verification.
- `relativeTime` is rendered only after client mount. Before mount, the
  ledger row shows duration + total without a "30분 전" suffix. This is
  intentional and avoids hydration mismatch in static-prerendered pages.

---

## 7. Known limitations

- The legacy `LISTED_ITEMS` table still lives in `src/data/dashboard.ts`.
  Rentals counts and view counts on that table are not derived from
  RentalIntents — this is a known display gap, not a regression.
- `RentalIntentTimeline` collapses every failure path into a single
  "실패 상태" footer row regardless of which failure occurred. The status
  badge above carries the specific label.
- The AI parser only detects neighborhoods and keywords from a fixed list.
  Anything outside the keyword set silently falls through with no
  partial-match fallback.
- `MOCK_RENTAL_INTENTS` are dated April 2026; if the system clock is
  outside that window the "이번 달 정산" stat may read ₩0 even when
  fixtures are seeded. Real persisted rentals are not affected.
- `searchService.toQuery` does not encode `priceMax` ≤ 0; values created
  by hand-crafted URLs with `priceMax=0` will be ignored. Intentional.

---

## 8. What should be integrated next

In rough priority order:

1. **Toss Payments** — replace `MockPaymentAdapter`. Add a server route
   for the redirect callback so `confirmPayment` runs against the real
   `paymentKey`.
2. **Supabase / Postgres** — implement `SupabasePersistenceAdapter` per
   the schema in `docs/corent_database_schema_draft.md`. Keep
   localStorage as a dev fallback.
3. **Real auth** — replace `CURRENT_SELLER` with a session and switch the
   dashboard's seller filter to the authenticated user's id.
4. **Server-side state machine** — move the rental transitions behind a
   server action so writes are auditable and `rental_events` becomes
   tamper-resistant.
5. **OpenAI structured extraction** — implement `OpenAIParserAdapter` and
   swap the import in the search/listing services.
6. **Image upload** — Supabase Storage bucket per listing-id; toggle the
   verification checks based on real upload completions.

---

## 9. Build / lint result

```
npm run lint    →  0 errors, 0 warnings
npm run build   →  13 routes static, /items/[id] SSG via generateStaticParams
```

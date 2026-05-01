# CoRent Return Trust Layer

Status: **DRAFT** (2026-04-30). Foundation only — types, copy, and doc.
This document defines the product, data, status, and copy foundation
for CoRent's trust model. **It does not implement** seller approval flows,
handoff checklists, return confirmation flows, claim window enforcement,
deposit calculation, dispute automation, escrow, insurance, payment, or
seller storefronts. Each of those is a separate later PR with its own
review.

Companion documents:

- [`docs/corent_product_direction_v2.md`](corent_product_direction_v2.md) — fee, geography, design maturity
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) — C2C marketplace posture, no wallet, partner-mediated payment, regulated-language ban
- [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) — pre-revenue posture, runtime modes / feature flags
- [`docs/mvp_security_guardrails.md`](mvp_security_guardrails.md) — current auth status, ownership guards, validation
- [`src/lib/stateMachines/rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts) — `RentalIntent` `ALLOWED_TRANSITIONS` map

---

## 1. Why this exists

CoRent is a **try-before-buy** rental platform. The product promise is
"borrow it for a few days, decide if it's worth buying." Two failure
modes break that promise the moment a user lands on a card:

1. **A large upfront deposit (보증금) framed as the first impression.**
   "₩8,000 + 보증금 ₩80,000" tells the visitor "this is a security
   posture problem, not a product." Try-before-buy converts on
   *low friction*; the deposit number competes with desire and almost
   always wins.
2. **A hidden price.** Forcing a click to "see how much" trades trust
   for engagement. Visitors who suspect price-for-attention bait leave.

The Return Trust Layer is the answer to both: build enough verifiable,
low-friction trust into the rental flow that **large upfront deposits
become the exception, not the default**, while keeping price visible
and product identity unchanged. We **do not** make CoRent
"deposit-free at all costs" — we make the soft hold a conditional,
tail-case mechanism rather than the front-page price tag.

## 2. The model

```text
CoRent Return Trust Layer
  = Seller Approval Before Payment
  + Return Ritual (handoff checklist on pickup + return)
  + Condition Proof Loop (lightweight evidence, not insurance)
  + Delayed Settlement concept (post-return inspection window)
  + Borrower Unlock Levels (first-time vs returning vs trusted)
  + Conditional Soft Hold later only for high-risk cases
```

Each component is a **trust signal**, not a financial guarantee. Words
like 보험 / 보장 / 보상 보장 / 안전거래 / 에스크로 are **forbidden** in
user-facing copy until a licensed partner is contracted and legally
reviewed (see [§7](#7-uxcopy-guardrails) and the legal/trust note).

### 2.1 Seller Approval Before Payment

The borrower requests, the seller approves, **then** payment is asked.
This is the single biggest trust unlock and is already shaped into the
existing `RentalIntent` state machine (`requested → seller_approved →
payment_pending → paid`). Removing the "stranger pays an automatic
machine, then waits to be told no" failure mode is what lets us drop
the front-page deposit number.

### 2.2 Return Ritual

A short, repeatable handoff checklist that runs on **pickup** and on
**return**, performed by both parties:

- Pickup: "이 물건이 사진과 같다" + safety code photo + components
  present.
- Return: "물건이 픽업 때와 동일한 상태로 돌아왔다" + condition
  comparison.

Each step writes a `TrustEvent` (see [`src/domain/trust.ts`](../src/domain/trust.ts)).
The ritual is a **process trust**, not a payout — failing it does not
trigger a payout, it triggers an admin review.

### 2.3 Condition Proof Loop

Each handoff phase records evidence (photo flags + optional notes;
photo upload itself is gated by the
[security gate note](corent_security_gate_note.md) and is **not** part
of this PR). The loop closes when both pickup evidence and return
evidence exist, with a "match / mismatch" comparison. A mismatch is
the only thing that can extend the lifecycle past `return_confirmed`.

### 2.4 Delayed Settlement / Claim Window

After a return is confirmed, a **claim window** opens for a defined
duration (Phase 1: 24h; later: tier-dependent). During the window the
seller may flag a condition issue. If no flag is raised, settlement
proceeds. If a flag is raised, the rental moves into admin review
before any seller payout. In data, the claim window is a
*sibling concept* to the rental status — it doesn't replace existing
states; it tracks a window with `open / closed_no_claim /
closed_with_claim`. See [`src/domain/trust.ts`](../src/domain/trust.ts).

### 2.5 Borrower Unlock Levels

A returner with N successful returns and a clean condition-match
record sees fewer / smaller upfront barriers than a brand-new
borrower. Unlock level is **derived**, not stored as a privilege:

- `new` — first-time borrower
- `verified_basic` — profile complete + at least one ID-style
  verification (out of scope for this PR; see security gate)
- `returner` — ≥ 1 successful return on platform
- `trusted` — multiple successful returns + clean condition-match rate

These are **type-level placeholders**. They drive copy variations and
the conditional-soft-hold decision in a later PR; they do not yet
gate any flow.

### 2.6 Conditional Soft Hold (later)

A pre-authorisation-style hold is reserved for **high-risk** cases:
new borrower + high-value item + first interaction with seller. It
is **not** the default. The legal mechanism for any actual hold is
delegated to a licensed PG partner once contracted (per the
legal/trust note). Phase 1 ships **no** hold logic; Phase 2 adds
a tier-based recommendation surface for admin review only.

## 3. Pricing & first-impression hierarchy

CoRent does **not** hide rental price. CoRent **does** demote price
from "first thing you see" to "visible alongside intent and trust."

Recommended on-card hierarchy:

1. **Experience desire / try-before-buy framing** — e.g.
   `사기 전 며칠만 써보기`.
2. **Product identity** — name, category.
3. **Return trust signal** — e.g. `픽업·반납 상태 확인`,
   `안전 코드 사진 검증 완료`.
4. **Rental price, visually secondary** — e.g.
   `1일 ₩8,000부터` at `text-body`/`text-title`, never at `text-h3`.
5. **Request / approval condition** — e.g.
   `요청 후 대여 가능 여부 확인`.

The shared copy strings live in
[`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts) so any
listing surface can opt into the same wording without duplicating it.

What **must not** appear as a first impression on a card:

- A standalone deposit figure (`보증금 ₩80,000`).
- A combined "₩X + 보증금 ₩Y" line.
- "보호 / 보장 / 보상" framing of any kind.
- Hidden-price patterns ("see price after request", "click to reveal").

What **may** appear in deeper surfaces (item detail, booking flow):

- Detailed pricing breakdown by duration.
- A clear, plain explanation that for high-risk cases a small,
  conditional hold may apply (later, partner-mediated).

## 4. Phase scope

### Phase 1 — foundation (already shipped)

- Doc + types + copy. No state machine change. No UI redesign.
- Demote rental price visual weight on `ProductCard`. Add three
  small copy lines (try-before-buy, condition check, approval hint).
- Document how the conceptual lifecycle maps onto the existing
  19-state `RentalIntent` machine (see [§5](#5-mapping-to-existing-state-machine)).

### Phase 1.1 — Seller Approval Before Payment (THIS PR)

The first real implementation step of the trust layer. After this PR:

- A rental request lands in the existing `requested` status (no
  change). Borrowers cannot proceed past it without seller action.
- Seller approves via the new `rentalService.approveRequest(intent,
  actorUserId)` → moves to `seller_approved`.
- Seller declines via the new `rentalService.declineRequest(intent,
  actorUserId, reason?)` → moves to `seller_cancelled` (the
  documented mapping for `seller_declined` per [§5](#5-mapping-to-existing-state-machine)).
- Borrower self-cancels via the new
  `rentalService.cancelByBorrower(intent, actorUserId)` →
  `borrower_cancelled`.
- Each of the three new methods runs `assertRentalSellerIs` /
  `assertRentalBorrowerIs` from
  [`src/lib/auth/guards.ts`](../src/lib/auth/guards.ts) **before** the
  state machine transition. A foreign actor receives `OwnershipError`
  with a typed `code` and the persistence layer is never written.
- The seller dashboard's existing approve/decline buttons now route
  through the actor-aware methods, with `getMockSellerSession()` as
  the `actorUserId`. The mock-session boundary is the documented
  migration site for real auth.
- The legacy `rentalService.approve(intent)` and
  `rentalService.cancel(intent, by)` remain for back-compat. New code
  must use the actor-aware variants.
- Item detail page replaces the premature
  `결제는 요청 승인 후 토스페이먼츠로 진행됩니다` line with the
  shared `APPROVAL_COPY.notChargedYet` +
  `APPROVAL_COPY.awaitingSellerApproval` +
  `APPROVAL_COPY.paymentNotImplementedYet` strings — no PG name, no
  payment-implementation claim, no regulated language.

What is **still not implemented** after this PR:

- No payment integration. No money moves.
- No deposit, no soft hold, no escrow, no settlement payout.
- No upload / photo evidence pipeline (boolean flags only on the
  existing verification record).
- No dispute automation, no admin write surface.
- No seller storefront.
- No real per-user authentication. The dashboard still resolves the
  mock seller via `getMockSellerSession()`. Real auth replaces this
  helper without changing `approveRequest` / `declineRequest` /
  `cancelByBorrower` signatures — they already take `actorUserId`.

### Phase 1.2 — Handoff / Return Ritual Skeleton (THIS PR)

The first lightweight implementation of the Return Ritual. After this
PR the data + service shape exists for both pickup and return checks;
the interactive UI and persistence are deferred so the change stays
small and reviewable.

**What is now implemented:**

- New domain types in [`src/domain/trust.ts`](../src/domain/trust.ts):
  - `HandoffChecks` (5 booleans: `mainUnit`, `components`, `working`,
    `appearance`, `preexisting`),
  - `EMPTY_HANDOFF_CHECKS`,
  - `HANDOFF_CHECKLIST_KEYS` (stable order),
  - `HandoffRecord` (one record per `(rentalIntentId, phase)` with
    `confirmedBySeller`, `confirmedByBorrower`, optional `note`,
    optional `manualEvidenceUrl`).
- Pure handoff helpers in
  [`src/lib/services/handoffService.ts`](../src/lib/services/handoffService.ts):
  - `createHandoffRecord(rentalIntentId, phase)` — fresh record, all
    checks false, both confirmations false.
  - `handoffService.confirmAsSeller(intent, record, actorUserId,
    patch?, confirm?)` — runs `assertRentalSellerIs` BEFORE building
    the new record. Patch applies an immutable update. `confirm=true`
    flips `confirmedBySeller`.
  - `handoffService.confirmAsBorrower(intent, record, actorUserId,
    patch?, confirm?)` — runs `assertRentalBorrowerIs`. Hard-fails
    with `HandoffInputError("phase_invalid")` if the rental has no
    `borrowerId` recorded yet (real auth gap; documented below).
  - `handoffService.isComplete(record)` and `completedCount(record)`
    — read-only helpers for surface code.
- Bounded input validation:
  - `note` ≤ 240 chars, optional, `null` clears.
  - `manualEvidenceUrl` ≤ 500 chars, must start with `http://` or
    `https://` (the URL is stored, never fetched, never auto-rendered
    as a clickable href by this module). `null` clears.
  - `checks` only accepts the five known keys; non-boolean values
    are rejected.
  - All violations throw a typed `HandoffInputError` with a stable
    `code` field.
- Extended copy in
  [`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts):
  `HANDOFF_RITUAL_COPY.checklist` now exposes the 5 Korean labels;
  `HANDOFF_RITUAL_COPY.{noUploadYet, manualNoteHint, conditionStatus,
  returnConfirmed}` are new top-level entries; `pickup.intro` and
  `return.intro` add a one-line framing each. Copy tests scan every
  new string against the regulated-language deny-list.

**What is intentionally NOT implemented:**

- **No persistence.** `HandoffRecord` lives only in caller memory.
  The persistence adapter (`src/lib/adapters/persistence/types.ts`)
  is unchanged. Saving / loading handoff records is Phase 1.3.
- **No interactive UI.** Neither the seller dashboard nor the item
  detail page currently surfaces the checklist. The dashboard's
  `ActiveBlock` does not have a natural compact slot for a 5-step
  checklist + note + URL field without redesigning rows or adding a
  modal. Per the brief's "do not force UI" rule, surfacing is
  deferred to Phase 1.3 along with persistence.
- **No upload, no media storage, no file picker.** The
  `manualEvidenceUrl` field is a typed slot for a URL the user pasted
  in from elsewhere; the service never fetches or parses it.
- **No automatic damage judgment.** The five checks are seller- and
  borrower-recorded only. Mismatch handling is admin-routed in a
  future PR.
- **No claim window enforcement.** `ClaimWindow` types still exist;
  the timer + admin routing are Phase 3.
- **No payment, no deposit, no soft hold, no escrow, no settlement
  payout, no insurance / guarantee / coverage language anywhere.**
- **No seller storefront.** Still Phase 3.
- **No real per-user authentication.** The dashboard still resolves
  the mock seller via `getMockSellerSession()`.

**Mapping to the existing `RentalIntent` state machine:**

`rentalIntentMachine.ts` is unchanged. The handoff record is a
**sibling concept** to the rental status — the same way `ClaimWindow`
is documented in [§5](#5-mapping-to-existing-state-machine). A surface
that wants to render the pickup checklist would scope its lookup to
rentals at status `paid` or `pickup_confirmed`; the return checklist
to rentals at `return_pending` or `return_confirmed`. No new
transitions, no new statuses, no rename.

**Real-auth gap (recorded as Phase 1.2's known limitation):**

`handoffService.confirmAsBorrower` requires `intent.borrowerId` to be
truthy. Today's request creation flow in `ItemDetailClient` calls
`rentalService.create(...)` without attaching a borrower id (no real
auth → no real borrower identity). Until real auth ships, the
borrower-side handoff path is gated. The seller-side path works for
mock-session sellers via `getMockSellerSession()`.

The migration site is the same one called out in
[`docs/mvp_security_guardrails.md`](mvp_security_guardrails.md) §5
item 1: replace `getMockSellerSession()` with a server-resolved
session, and have the rental-create flow attach the resolved
borrower id at request time. No changes to `handoffService` are
required when that happens — it already takes `actorUserId`.

### Phase 1.3 — Handoff Persistence + Minimal Seller Dashboard Surface + TrustEvent Basics (THIS PR)

After this PR the handoff record is persisted, the seller dashboard
shows a compact handoff surface for real (localStorage-persisted)
rentals, and the typed TrustEvent factory exists for future surfaces
to call.

**What is now implemented:**

- **Handoff persistence** in
  [`src/lib/adapters/persistence/types.ts`](../src/lib/adapters/persistence/types.ts)
  + both adapters (memory + localStorage). Three new methods on the
  `PersistenceAdapter` interface:
  - `saveHandoffRecord(record)` — upsert by `(rentalIntentId, phase)`.
  - `getHandoffRecord(rentalIntentId, phase)` — null when missing.
  - `listHandoffRecordsForRental(rentalIntentId)` — both phases for one rental.
  - `clearAll()` now wipes the new `corent:handoffRecords` key alongside
    the existing CoRent keys; unrelated localStorage keys are still
    preserved.
- **Orchestration on `rentalService`** in
  [`src/lib/services/rentalService.ts`](../src/lib/services/rentalService.ts):
  - `rentalService.getHandoffRecord(rentalIntentId, phase)` and
    `rentalService.listHandoffRecords(rentalIntentId)` — read passthroughs.
  - `rentalService.recordSellerHandoff(rentalIntentId, phase, actorUserId, patch?, confirm?)`
    — loads the rental + existing record (or creates a fresh one),
    runs `handoffService.confirmAsSeller` (which calls
    `assertRentalSellerIs` BEFORE building the new record), and
    persists the result. Throws `Error("rental_not_found")` when the
    rental id is unknown, `OwnershipError` on actor mismatch, and
    `HandoffInputError` on bounded-shape violations. The pure
    `handoffService` from Phase 1.2 is unchanged — orchestration is
    additive.
- **TrustEvent factory** in
  [`src/lib/services/trustEvents.ts`](../src/lib/services/trustEvents.ts):
  `createTrustEvent({ rentalIntentId, type, actor, handoffPhase?,
  evidenceRefs?, notes?, at? })` returns a typed `TrustEvent`. Validates
  every field: known type / actor / phase enums, bounded `notes`,
  array-of-strings `evidenceRefs`. **No persistence, no service
  integration.** Surfaces that want to emit a trust event today
  construct one and discard it; a future PR adds persistence and
  wires it into the handoff orchestrator + admin surfaces.
- **Seller dashboard surface** in
  [`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx):
  a new compact `HandoffBlock` section appears between the active /
  pending block and the failure block whenever the seller has
  real-persistence rentals at status `paid`, `pickup_confirmed`,
  `return_pending`, or `return_confirmed`. Each row shows:
  - product name + borrower name + duration,
  - the phase intro (`픽업 때 상태를 함께 확인해요.` /
    `반납 때 구성품과 작동 여부를 다시 확인해요.`),
  - the 5 checklist labels rendered as inline pills,
  - a progress label (`픽업 체크 N/5` or `반납 체크 N/5`),
  - a single `판매자 확인` button. Clicking it calls
    `rentalService.recordSellerHandoff` with all five checks set to
    true and `confirmedBySeller=true`, then refreshes the dashboard.
    Once seller-confirmed, the button switches to `판매자 확인 완료`
    and is disabled.
  Above the row list, three muted captions are always visible:
  `사진 업로드는 아직 구현되지 않았어요.`,
  `메모나 링크로 상태 기록을 남길 수 있어요.`, and
  `대여자 확인은 실제 로그인 이후 연결됩니다.`
  The block does NOT render when the dashboard is in mock-fallback
  mode — those rentals aren't persisted and the orchestrator would
  reject the click with `rental_not_found`.
- **Shared copy** in
  [`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts):
  `HANDOFF_RITUAL_COPY` extended with `dashboardSectionTitle`,
  `sellerConfirmAction`, `sellerConfirmDone`, `borrowerLater`. New
  `formatHandoffProgress(phase, done, total?)` helper renders the
  `픽업 체크 3/5` shape. Copy tests scan every new string against
  the regulated-language deny-list.

**Mapping to the existing `RentalIntent` state machine:**

`rentalIntentMachine.ts` is unchanged. The handoff record remains a
**sibling concept** to the rental status — the dashboard surface uses
`handoffPhaseForStatus(status)` to decide whether to render a row, but
the machine itself is untouched. Marking the handoff seller-side
complete does NOT advance the rental status; the existing
`다음 단계 진행 →` button on the active block continues to do that
through the `confirmPickup` / `startReturn` / `confirmReturn` service
methods. Linking handoff completion to status advancement is a
deliberate Phase 2 decision.

**What is intentionally NOT implemented:**

- **No upload, no media storage, no file picker.** The
  `manualEvidenceUrl` slot on `HandoffRecord` accepts a bounded URL,
  but the dashboard does not yet expose an input for it.
- **No per-item checklist editor.** The dashboard ships the
  one-button "판매자 확인" action; toggling individual checks is
  Phase 2.
- **No borrower-side handoff confirmation.** `confirmAsBorrower`
  exists and is tested, but the dashboard cannot exercise it without
  real auth attaching a borrower id at request creation. The static
  `대여자 확인은 실제 로그인 이후 연결됩니다.` caption records the
  gap on the surface.
- **No automatic damage judgment.** Mismatch routing is Phase 3.
- **No claim window timer.** `ClaimWindow` types still exist; the
  timer is Phase 3.
- **No TrustEvent persistence.** Factory only. The handoff
  orchestrator does not yet emit a trust event when a seller-side
  handoff completes.
- **No payment, no deposit, no soft hold, no escrow, no settlement
  payout, no insurance / guarantee / coverage language.**
- **No seller storefront.** Still Phase 3.
- **No real per-user authentication.** The dashboard still resolves
  the mock seller via `getMockSellerSession()`.
- **No state machine changes.** `rentalIntentMachine.ts` is untouched.
- **No new dependencies.**

### Phase 1.4 — TrustEvent Persistence + Basic Trust Summary (THIS PR)

After this PR, `TrustEvent` records are persisted in both adapters,
the seller's count-only trust history is computed from those events,
the seller dashboard surfaces a compact `신뢰 이력` summary, and the
seller-side handoff flow emits a single trust event on the
false-to-true confirmation transition. Everything is still
local persistence + mock auth — there is no scoring, no automatic
tier upgrade, no automatic blocking, no server DB.

**What is now implemented:**

- **TrustEvent persistence** in
  [`src/lib/adapters/persistence/types.ts`](../src/lib/adapters/persistence/types.ts)
  + both adapters. Three new methods on `PersistenceAdapter`:
  - `saveTrustEvent(event)` — upsert by `event.id`. The collection is
    treated as append-only by the service layer; the adapter accepts
    re-saves so a future replay path remains idempotent.
  - `listTrustEventsForRental(rentalIntentId)` — scoped read.
  - `listTrustEvents()` — full list. Used by `summarizeUserTrust`.
  - `clearAll()` now wipes the new `corent:trustEvents` key alongside
    the existing CoRent keys. Unrelated localStorage entries remain
    untouched.
- **trustEventService orchestration** in
  [`src/lib/services/trustEvents.ts`](../src/lib/services/trustEvents.ts):
  - `recordTrustEvent(input)` — validates via `createTrustEvent`,
    persists, returns the event.
  - `listTrustEventsForRental(id)` — passthrough.
  - `listTrustEventsForUser(userId)` — joins rentals + events and
    returns events for any rental where the user is seller OR
    borrower. Returns `[]` for empty `userId`.
  - `summarizeUserTrust(userId)` — loads everything once and returns
    a `UserTrustSummary`. Convenience over calling
    `listTrustEventsForUser` + `summarizeTrustEvents` separately.
- **Pure summary helper** `summarizeTrustEvents(events, rentalById,
  userId)` — count-only, scoped to seller-or-borrower rentals,
  `damageReportsAgainst` further scoped to rentals where the user is
  the seller. **`accountStanding` is always `"normal"`** in the MVP
  output; the summarizer never auto-changes it.
- **New domain types** in
  [`src/domain/trust.ts`](../src/domain/trust.ts):
  - `AccountStanding` = `"normal" | "limited" | "blocked"` (manual
    admin state, never auto-set).
  - `UserTrustSummary` — count-only view: `successfulReturns`,
    `pickupConfirmedCount`, `returnConfirmedCount`,
    `conditionCheckCompletedCount`, `disputesOpened`,
    `damageReportsAgainst`, `accountStanding`.
  - `EMPTY_USER_TRUST_SUMMARY` — zeros + `"normal"`.
- **Handoff → TrustEvent integration** in
  [`src/lib/services/rentalService.ts`](../src/lib/services/rentalService.ts):
  `recordSellerHandoff` now emits exactly one TrustEvent when the
  seller-side `confirmedBySeller` flag flips from false to true:
  - `pickup` phase → `pickup_evidence_recorded`
  - `return` phase → `return_evidence_recorded`
  Re-saves of an already-confirmed record do NOT emit again. Calls
  with `confirm=false` do not emit. Calls that fail ownership
  validation do not emit (ownership runs before any persistence).
- **Seller dashboard `신뢰 이력` block** in
  [`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx):
  a compact 4-tile section (정상 반납 이력 / 픽업 체크 완료 /
  반납 체크 완료 / 상태 확인 완료) appears only when the seller has
  any non-zero count. Header shows
  `계정 상태: 정상` (or `제한` / `차단` if a future admin PR ever
  changes the value). The block uses existing design tokens — no new
  colors, no charts, no badges.
- **Shared copy** in
  [`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts):
  new `TRUST_SUMMARY_COPY` group covering the section title, the
  four count labels, the account-standing label, and the three
  standing values. Copy tests scan every new string against the
  regulated-language deny-list.

**Mapping to the existing `RentalIntent` state machine:**

Unchanged. Trust events live alongside the machine in the
`rental_events`-like spirit but with a typed event-type vocabulary
and a derived per-user summary view. No status renames, no new
transitions, no new statuses.

**What is intentionally NOT implemented:**

- **No scoring, no tier upgrades, no unlock-level inference, no
  automatic account-standing change.** `accountStanding` is hard-
  coded to `"normal"` in every code path. Moving a user out of it
  requires a future admin write surface.
- **No real authentication.** The dashboard still resolves the mock
  seller via `getMockSellerSession()`.
- **No server DB, no ingest endpoint.** All persistence remains
  local (memory + localStorage). The deny-by-default Phase 2
  Supabase schema is still dev-only.
- **No upload, no media storage, no file picker.**
- **No automatic damage judgment.** `condition_issue_reported` is a
  countable event today; routing it into admin review is Phase 3.
- **No claim window timer.** `ClaimWindow` types still exist;
  enforcement is Phase 3.
- **No payment, no deposit, no soft hold, no escrow, no settlement
  payout, no insurance / guarantee / coverage / safe-escrow
  language.**
- **No seller storefront.**
- **No automatic emission of trust events** outside the seller
  handoff transition this PR added. Borrower-side, admin-side, and
  state-machine-driven emissions are deferred.
- **No state machine changes.** `rentalIntentMachine.ts` is
  untouched.
- **No new dependencies.**

### Phase 1.5 — Claim Window + Admin Review Skeleton (THIS PR)

After this PR, a post-return claim window is opened automatically when
a rental reaches `return_confirmed`, the seller can either close the
window cleanly or open a claim, and an admin queue (`/admin/claims`)
exposes a placeholder approve / reject / needs-review decision. None
of these moves money, triggers a refund, deposits, escrow, a PG call,
or a notification — this is a SKELETON only.

**What is now implemented:**

- **New domain types** in
  [`src/domain/trust.ts`](../src/domain/trust.ts):
  - `ClaimReviewStatus` = `"open" | "approved" | "rejected" | "needs_review"`.
  - `ClaimReview` — `{ id, rentalIntentId, claimWindowId, status,
    openedAt, openedReason?, decidedBy?, decidedAt?, decisionNotes? }`.
- **Persistence** in
  [`src/lib/adapters/persistence/types.ts`](../src/lib/adapters/persistence/types.ts)
  + both adapters (memory + localStorage). New methods:
  - `saveClaimWindow(window)` / `getClaimWindowForRental(id)` /
    `listClaimWindows()`.
  - `saveClaimReview(review)` / `getClaimReview(id)` /
    `listClaimReviewsForRental(id)` / `listClaimReviews()`.
  - `clearAll()` now wipes the new `corent:claimWindows` and
    `corent:claimReviews` keys.
- **`claimReviewService` orchestration** in
  [`src/lib/services/claimReviewService.ts`](../src/lib/services/claimReviewService.ts):
  - `openClaimWindow(rentalIntentId)` — idempotent. Opens a window
    only when the rental is at `return_confirmed` (or further along
    the post-return statuses). Emits `claim_window_opened`.
  - `closeClaimWindowAsNoClaim(rentalIntentId, actorUserId)` — runs
    `assertRentalSellerIs` BEFORE any persistence write. Emits
    `claim_window_closed`.
  - `openClaim(rentalIntentId, actorUserId, reason?)` — runs
    `assertRentalSellerIs`, closes the window with
    `closed_with_claim`, creates a `ClaimReview` row in `open`, and
    emits `claim_window_closed` + `admin_review_started`.
  - `recordAdminDecision(reviewId, decision, decidedBy, notes?)` —
    sets the review to `approved` / `rejected` / `needs_review`.
    `needs_review` keeps the row eligible for a follow-up decision;
    `approved` and `rejected` are final. Emits
    `admin_decision_recorded`.
- **`rentalService.confirmReturn` integration** — calls
  `claimReviewService.openClaimWindow(next.id)` after persisting, so
  every confirmed return automatically opens a window.
- **Seller dashboard surface** in
  [`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx):
  a new compact `ClaimWindowBlock` appears whenever the seller has a
  real (persisted) rental with an opened window. Each row exposes
  `정상 반납으로 마무리` and `상태 문제 보고` actions plus a bounded
  optional reason input. Closed windows render as a status badge
  only.
- **Admin review queue** at `/admin/claims`
  ([`src/app/admin/claims/page.tsx`](../src/app/admin/claims/page.tsx)
  + [`src/components/AdminClaimsConsole.tsx`](../src/components/AdminClaimsConsole.tsx)):
  server component gates on `requireFounderSession()` (404 fail-closed,
  identical to the existing dashboard route). The client island lists
  reviews from local persistence, surfaces approve / reject /
  needs-review buttons, and records the decision through
  `claimReviewService.recordAdminDecision` with the founder email as
  `decidedBy`.
- **Shared copy** in
  [`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts):
  extended `CLAIM_WINDOW_COPY` with action labels + a
  `noPayoutNote` disclaimer. New `CLAIM_REVIEW_COPY` group covers the
  admin queue's title, hint, decision labels, and status labels. Copy
  tests scan the new strings against the regulated-language
  deny-list.

**What is intentionally NOT implemented:**

- **No payment, no deposit forfeiture, no refund, no escrow, no
  settlement payout, no Toss/PG integration.** Recording any decision
  emits a TrustEvent and updates state — nothing more.
- **No automatic dispute routing, no automatic damage judgment, no
  legal adjudication.** A claim opens a review row; an admin must
  make every decision by hand.
- **No notifications.** Email, push, or webhook delivery is out of
  scope.
- **No automatic block / limit.** `accountStanding` is still
  manual-only and unchanged by any decision recorded here.
- **No state machine changes.** `rentalIntentMachine.ts` is
  untouched. The claim window remains a sibling concept.
- **No real authentication.** The seller path still resolves the mock
  seller via `getMockSellerSession()`. The admin path is still gated
  by the existing `requireFounderSession()` allowlist.
- **No new dependencies.**

### Phase 2 — later PR (gated by review)

- Wire the Return Ritual checklist into the rental flow (pickup
  evidence + return evidence). No upload pipeline yet — boolean
  flags only, mirroring `listing_verifications`.
- Add `TrustEvent` write-path through a new service (server-side,
  validated). Persistence stays mock until the upload + auth gates
  clear.
- Surface `UserTrustProfile` summary on the borrower / seller
  side as a derived read-only view.

### Phase 3 — later PR (gated by partner contract + legal review)

- Conditional soft hold recommendation based on
  `recommendedDepositTier`. **Recommendation only**; the actual
  hold is delegated to a PG partner.
- Claim window timer enforcement at the server layer.
- Admin-side dispute UI built on top of the existing
  `admin_reviews` / `admin_actions` tables.

## 5. Mapping to existing state machine

The current `RentalIntent` machine in
[`rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts)
already covers the lifecycle. The Return Trust Layer **does not add
or rename rental statuses in this PR.** Instead, the table below
explains how the conceptual trust-layer terms reduce to the existing
states.

| Trust-layer term | Existing `RentalIntentStatus` | Note |
| --- | --- | --- |
| `requested` | `requested` | identical |
| `seller_approved` | `seller_approved` | identical |
| `payment_pending` | `payment_pending` | identical |
| `paid` | `paid` | identical |
| `pickup_confirmed` | `pickup_confirmed` | identical |
| `active` (rental period) | implicit interval between `pickup_confirmed` and `return_pending` | no separate status; the "in use" period is the interval, not a state |
| `return_pending` | `return_pending` | identical |
| `return_confirmed` | `return_confirmed` | identical |
| `claim_window_open` | (sibling concept) | tracked via `ClaimWindow` (see `src/domain/trust.ts`), not as a rental status |
| `settlement_ready` | `settlement_ready` | identical |
| `completed` (terminal) | `settled` | terminal in both models |
| `seller_declined` | `seller_cancelled` | semantically a decline of a request before approval; reuse for now |
| `borrower_cancelled` | `borrower_cancelled` | identical |
| `expired` | (none yet) | future addition; today expressed via `borrower_cancelled` / `seller_cancelled` with reason |
| `damage_reported` | `damage_reported` | identical |
| `admin_review` | `dispute_opened` | currently `dispute_opened`; could be renamed/split later — out of scope here |
| `settlement_blocked` | `settlement_blocked` | identical |
| `resolved` | back to `settlement_ready` / `settled` | expressed via existing `settlement_blocked → settlement_ready / settled` transitions |

A future PR may rename `dispute_opened → admin_review` or split it,
but that requires a coordinated update to: the in-memory machine, the
Phase 2 Postgres `rental_intent_status` enum (`alter type … add value`
or rename), the supabase server-side validators, and the migration's
text-safety test. None of that is justified by this foundation PR.

## 6. Trust types (foundation)

The foundation types live in [`src/domain/trust.ts`](../src/domain/trust.ts):

- `TrustEvent` — append-only log of trust-relevant actions on a
  rental (seller approved, pickup recorded, return recorded,
  condition match recorded, condition issue reported, admin review
  started, admin decision recorded, claim window opened/closed).
  Mirrors the shape of the existing `RentalEvent` so the future
  storage table can sit alongside `rental_events`.
- `UserTrustProfile` — derived per-user summary (successful returns,
  condition match rate, response rate, unlock level, recommended
  deposit tier). **Derived**, not authoritative — never trust a
  client-submitted profile.
- `HandoffPhase` — `'pickup' | 'return'`.
- `EvidenceType` — photo / note types. Mirrors the existing
  `VerificationChecks` boolean flags so a future migration is
  straightforward.
- `ClaimWindow` — `{ open | closed_no_claim | closed_with_claim }`
  alongside the rental, opened at `return_confirmed`, closed
  on a flag or on timer.

These are types only. No write paths, no service methods, no UI yet.

## 7. UX/copy guardrails

**Safe Korean words** (use freely):

- 안심 절차
- 상태 확인
- 반납 확인
- 픽업 체크
- 반납 체크
- 상태 기록
- 소유자 확인
- 관리자 검토
- 문제 확인
- 계정 상태
- 인증된 프로필
- 정상 반납 이력

**Forbidden Korean words** (until a licensed partner is contracted
and legally reviewed):

- 보험
- 보장
- 보상 보장
- 파손 보장
- 전액 보상
- 안전거래
- 에스크로
- 무조건 보호

**English equivalents to avoid in any user-facing surface, even in
internal admin tooling that a screenshot might reach a partner**:

- "insurance", "coverage", "guarantee", "claim payout", "safe escrow",
  "protected", "fully refunded", "fraud protection"

These rules apply to component copy, marketing copy, and any AI-
generated string. The shared copy module
[`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts) keeps
the safe wording in one place; new surfaces should import from it
rather than hand-rolling Korean strings.

## 8. Future trust surface — Seller Storefront

A seller storefront is **not** implemented in this PR. It is the
future trust surface that aggregates a seller's history into one
page so a borrower can decide *before* requesting:

- seller profile (name + region, no phone, no email)
- seller policies (preferred handoff window, response style)
- seller item collection (active listings owned by this seller)
- response/approval behavior (response rate, median response time)
- successful return count
- condition-check completion rate
- local pickup area
- public reviews / trust signals (later — needs review/abuse-control
  system)

The storefront naturally uses `UserTrustProfile` (sellers are users).
It will need a new surface, a sanitized read-shape, an abuse-control
posture for review text, and probably a moderation queue. Each of
those is its own review-gated PR.

## 9. Security & MVP guardrails interaction

This PR adds **no** new write paths. Future trust-write paths
(recording a handoff event, opening a claim window) must:

- Run through a service (`src/lib/services/`), never from a UI
  component directly.
- Accept an `actorUserId` parameter and call the appropriate
  `assert*` ownership guard from
  [`src/lib/auth/guards.ts`](../src/lib/auth/guards.ts) before
  mutating.
- Validate every untrusted shape via the existing validator pattern
  (the Phase 2 `src/server/persistence/supabase/validators.ts` for
  the server path, and the in-memory equivalents for client writes).
- Never log raw evidence content, names, or email values.
- Continue to refuse `CORENT_BACKEND_MODE=supabase` in production.

These are reminders, not new code. They are listed here so the next
PR's reviewer has a checklist.

## 10. References

- [`docs/corent_product_direction_v2.md`](corent_product_direction_v2.md)
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
- [`docs/corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md)
- [`docs/mvp_security_guardrails.md`](mvp_security_guardrails.md)
- [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md)
- [`src/domain/intents.ts`](../src/domain/intents.ts) — existing transactional types
- [`src/lib/stateMachines/rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts) — existing 19-state machine
- [`src/domain/trust.ts`](../src/domain/trust.ts) — new trust types (this PR)
- [`src/lib/copy/returnTrust.ts`](../src/lib/copy/returnTrust.ts) — shared safe Korean copy (this PR)

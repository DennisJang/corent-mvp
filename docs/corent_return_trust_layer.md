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

### Phase 1 — THIS PR

- Doc + types + copy. No state machine change. No UI redesign.
- Demote rental price visual weight on `ProductCard`. Add three
  small copy lines (try-before-buy, condition check, approval hint).
- Document how the conceptual lifecycle maps onto the existing
  19-state `RentalIntent` machine (see [§5](#5-mapping-to-existing-state-machine)).

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

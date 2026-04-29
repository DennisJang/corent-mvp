# CoRent Legal / Trust Architecture Note

_Recorded: 2026-04-30_

## 0. Purpose & Scope

CoRent MVP v1 is browser-demoable on `main` (see
[`corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md)).
Before any real database, payment processor, location service,
insurance, or partner trust workflow is wired in, this note defines the
**safe product architecture** the next phase must operate inside.

This note is docs-only. It does not change app code, design tokens,
package dependencies, persistence behavior, or the design system. It
also does not authorize any external integration. Every gated item
below still requires explicit user approval per
[`agent_loop.md`](agent_loop.md), and partner/legal items additionally
require partner contracts and legal review outside this repository.

This note **supersedes** the implicit 10% commission and Seoul-only
framing that still appears in [`../CLAUDE.md`](../CLAUDE.md),
[`corent_context_note.md`](corent_context_note.md), and
[`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md).
Those documents are flagged in section 9 for a separate follow-up
docs PR; this note alone does not edit them.

## 1. Fee Model

**Remove the 10% platform-fee framing entirely.** It does not match the
direction below and reads as marketplace rake.

Target structure for the next phase:

- **3% of the rental fee, plus a fixed transaction fee.**
- The fixed transaction fee is **TBD** in this note. It will be
  decided alongside the payment-partner contract.

The fixed fee is positioned as compensation for the work CoRent
actually does on each rental:

- payment processing coordination via the payment partner
- safe-transaction workflow orchestration
- pickup and return condition-photo intake
- dispute intake and lifecycle tracking
- trust infrastructure (verification, evidence, state machine)

**Copy guidance (Korean and English):**

- Use: "서비스 이용료", "안전거래 수수료", "거래 보호 수수료",
  "platform service fee", "safe-transaction fee".
- Avoid: "수수료 10%", "marketplace commission", or any rake-style
  language that frames CoRent as taking a cut from the lender.

Implementation impact lives in `src/lib/pricing.ts`,
`src/components/pricing/PriceBreakdown.tsx`, and the borrower-facing
copy on landing / detail / dashboard. **Implementation is out of this
note's scope** — it is queued behind the DB readiness audit and a
direction-aligned doc PR.

## 2. Legal Role / Marketplace Position

CoRent's initial legal posture:

> **CoRent is a C2C rental marketplace and a transaction-state /
> trust-workflow layer. CoRent is not the direct rental counterparty.**

Concretely:

- The rental contract is between the **lender** (item owner) and the
  **borrower** (user borrowing the item).
- CoRent **intermediates** the request, evidence, payment routing
  (through a partner), and dispute intake.
- CoRent does **not** own the item, take legal possession, or
  underwrite the transaction.

Consumer-facing disclosures must make this unambiguous **before
payment or request confirmation**. The relevant surfaces (item detail,
request confirmation, dashboard) must clearly identify:

- who the lender is
- who the borrower is
- what CoRent does (intermediary, evidence, workflow, dispute intake,
  payment partner routing)
- what CoRent does **not** do (no item ownership, no direct fund
  custody beyond partner integration, no legal counterparty role, no
  insurance underwriting)
- the cancellation and refund rules that apply at each lifecycle stage
- the damage / missing-item responsibility rules
- the late-return rules

> **Terminology gap to flag, not fix here:** the codebase currently
> uses `seller` / `sellerId` / `sellerName` (e.g. in
> `src/domain/intents.ts`, `src/components/SellerDashboard.tsx`).
> The product direction prefers **lender / borrower** for legal
> clarity. A future docs+code PR may rename or alias the terminology.
> No code change in this note.

## 3. Payment / Deposit Architecture

**CoRent must not custody user funds directly in the early version.**

- No CoRent-owned wallet.
- No internal balance ledger that holds user money.
- All money movement (payment, deposit hold, deposit release,
  cancellation refund, settlement payout to the lender) flows through
  a **licensed PG / payment partner** (e.g. Toss Payments, plus an
  appropriate escrow-style mechanism if and when contracted).

CoRent's responsibilities in this split:

- transaction state machine (`RentalIntent` lifecycle)
- evidence capture (photos, checklists, timestamps)
- workflow orchestration (request, approval, pickup, return)
- dispute intake (collecting reports, freezing settlement)
- exposing read-only views of partner-held money state via API/webhook

Things CoRent does **not** do in this version:

- hold cash, virtual cash, or stored-value balances
- compute or pay out from an internal balance
- bypass the partner for any leg of the money flow

**Real payment integration is gated.** Wiring Toss Payments (or any
other PG), connecting partner webhooks, or storing partner-issued
session tokens in production requires explicit user approval and
falls under the "external integrations" approval gate in
[`agent_loop.md`](agent_loop.md). The current `mockPaymentAdapter`
remains in place until that approval lands.

## 4. Insurance / Damage Protection Language

**Do not use regulated language.** Without a licensed insurance or
guarantee partner and legal review, the product must not say or imply:

- "insurance" / "보험"
- "premium" / "보험료"
- "coverage" / "보장"
- "claim" / "청구" (in the insurance sense)
- "claim payout" / "보험금 지급"
- any phrasing that suggests CoRent indemnifies losses

Use the following early-product language instead:

- **deposit** / 안전 보증금
- **condition check** / 상태 점검
- **photo proof** / 사진 증빙
- **damage responsibility rules** / 파손 책임 규정
- **dispute intake** / 분쟁 접수
- **settlement hold** / 정산 보류

If a protection product (insurance, guarantee, indemnity) is added
later, it must be **partner-backed**, separately documented, and
disclosed under the partner's regulated branding. Such a product is
out of scope for this note and out of scope for MVP v1's direct
follow-up work.

## 5. Location / Nationwide Direction

- Product direction is **Korea-wide**.
- Seoul-only was a demo/test assumption, not a product constraint.
  Existing seed data (e.g. "서울 마포구 합정", "서울 강남구 역삼")
  may stay as fixtures.
- **Do not add GPS / current-location-based matching yet.** That
  triggers location-information compliance obligations (위치정보의
  보호 및 이용 등에 관한 법률 등) that need separate review and a
  documented compliance posture.
- Initial geography model:
  - user-entered **region** (e.g. `seoul`, `busan`, `incheon`)
  - user-entered **city / district** text (free-form, fixture-style
    "구/동" labels are acceptable)
  - explicit **pickup / delivery availability** flags on listings
- Location-based recommendations (distance ranking, "nearest first",
  geofenced search) are gated on a future location-compliance review
  and a designated DPO/responsible owner.

## 6. Trust Workflow — Safe-Transaction Abstraction

**Goal of the abstraction:** the user sees a simple safe-rental flow.
The system absorbs the complexity behind it.

The minimum trust flow (every CoRent rental must move through this
ordered set of states or an explicit failure / dispute branch):

1. **Request** — borrower creates a rental request (`RentalIntent` in
   `requested`).
2. **Lender approval** — lender approves or declines.
3. **Payment / deposit authorization through partner** — payment
   session opened with the PG; rental fee + safety deposit authorized
   on the borrower's instrument.
4. **Pickup condition photos** — lender uploads dated condition
   photos at handover; system stores evidence with the
   `RentalIntent`.
5. **Component / accessory checklist** — both parties confirm the
   listed components/accessories are present.
6. **Borrower pickup confirmation** — borrower confirms receipt;
   lifecycle moves to `pickup_confirmed`.
7. **Return condition photos** — borrower uploads return photos at
   the agreed return time.
8. **Lender return confirmation** — lender confirms condition and
   completeness; lifecycle moves to `return_confirmed`.
9. **Settlement** — partner releases the lender payout (rental fee
   minus CoRent's 3% + fixed fee); deposit is released to the
   borrower.
10. **Dispute intake** — at any branch where conditions disagree
    (damage, missing components, late return, no-show), the rental
    moves to a dispute path; settlement is held; CoRent collects
    structured evidence and routes it under the partner's process.

The current `RentalIntent` state machine in
[`src/lib/stateMachines/rentalIntentMachine.ts`](../src/lib/stateMachines/rentalIntentMachine.ts)
already covers the core lifecycle (`requested → seller_approved →
payment_pending → paid → pickup_confirmed → return_pending →
return_confirmed → settlement_ready → settled`) and explicit failure
branches. The deltas this note implies for that state machine
(photo evidence requirements, partner-mediated money state, lender
terminology) are **specification only** here — code work is gated.

## 7. Product Principle — Flow First, Screens Later

CoRent is not designed from pretty screens. It is designed from flows.

The required design loop:

1. Start from the **user's rental intent** and the **lender's
   operating preferences** (what they actually want to do, in their
   own words).
2. Walk the full flow end to end: search, matching, pricing,
   scheduling, trust, payment, pickup, return, settlement, dispute.
3. List the parts that are **annoying or complex** for the user.
4. Decide which of those the **system can absorb** (search ranking,
   pricing math, scheduling reminders, trust evidence collection,
   payment routing, lifecycle status, dispute intake).
5. Leave the user with **only the essential decisions** (which item,
   how many days, accept/decline, confirm pickup, confirm return).
6. Design the visual UI **around the simplified flow**, not the other
   way around.

The current BW Swiss Grid implementation is a **demoable foundation**,
not the final UI. Future visual polish must come after a documented
flow map under this principle.

## 8. Next Work Options (advisory; user is final approver)

These are queued, not started. None auto-runs.

- **Scheduling docs commit** — `docs/today_queue.md` modification +
  `docs/scheduled_runs/` folder remain a separate intentional commit,
  unchanged by this note.
- **DB readiness audit** — recommended before any real DB
  integration. Scope: entity mapping, repository / service boundary
  conformance, persistence adapter contract verification, seed/demo
  migration plan, future Supabase / Postgres schema implications.
  Output is another docs-only note. No DB code in that step.
- **Category research** — score candidate rental categories on:
  demand, supply, rental-vs-buy advantage, shipping / pickup
  feasibility, condition-check ease, damage risk, hygiene risk, and
  legal risk. Output is a docs-only ranking note. No code work.
- **`codex/mock-ai-parser-tests`** — optional Codex fallback test
  task, still queued in [`today_queue.md`](today_queue.md). Do not
  start without explicit user approval. Test-only scope; absorption
  still gated on user approval.
- **Flow-led UI work** — only after flow mapping under section 7. Do
  not start visual redesign before the flow doc exists.

## 9. Documents With Stale Direction (informational, no edits in this commit)

The following documents still encode the old 10% / Seoul-only / "5
screens first" framing. They are inconsistent with this note. They are
**not edited here.** A separate docs PR should align them.

- [`../CLAUDE.md`](../CLAUDE.md) — "Commission: 10% of rental fee",
  "Initial region: Seoul beta".
- [`corent_context_note.md`](corent_context_note.md) — likely contains
  the same fee/region framing.
- [`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md)
  — pricing rule example uses 10%, references Seoul, uses "seller"
  terminology end-to-end.

When that follow-up PR is approved, the canonical reference for fee
model, geography, lender/borrower terminology, and trust-workflow
architecture is **this note**.

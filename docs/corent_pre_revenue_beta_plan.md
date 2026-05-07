# CoRent Pre-Revenue Beta Plan

_Recorded: 2026-04-30_

> **Status:** Historical / Closed-alpha Operations Posture
> **Scope:** former pre-revenue posture (no fee, no payment, no
> deposit, no settlement, no payout) for the CoRent rental-
> marketplace vertical, plus a feature-flag table for runtime
> modes.
> **Superseded by:** [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md)
> as the active product direction. The "no payment / no
> settlement / no trust system today" rule is now enforced at
> the platform level by ISS-0 §13 +
> [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
> §5 (Tier 4–T5).
> **Last reviewed:** 2026-05-07 (demoted to Historical per the
> 2026-05-07 platform pivot).
> **Current use:** the runtime-mode and feature-flag discipline
> remains useful for **closed-alpha ops continuity**. The
> marketplace / fee / rental-revenue framing is superseded.
> **Do not use for:** current roadmap, fee planning, payment
> integration, marketplace launch sequencing, public-beta
> sequencing. Body unchanged.

## 0. Window

CoRent operates in a **pre-revenue validation window** anchored on the
founder's mandatory military-service discharge date:

> **Founder discharge date: 2026-07-13.**

Until **both** of the following are true, CoRent must remain in
pre-revenue posture:

1. The discharge date (2026-07-13) has passed, **and**
2. Explicit **legal / payment / business readiness** approval has been
   recorded by the user (the only final approver per
   [`agent_loop.md`](agent_loop.md)).

Either condition alone is **not** sufficient. A calendar pass without
readiness keeps the product in beta. Readiness without the calendar
pass also keeps the product in beta.

This note defines what "pre-revenue beta" means as a product posture
**and** as a code-level enforcement model. Both halves are kept in one
document because the posture is meaningless without the enforcement
model, and the enforcement model is meaningless without the posture.

## 1. Pre-Revenue Beta Posture

While the window in §0 is open, CoRent must run **as a public
validation product with no revenue activation**. Concretely:

- **No platform fee.** Even though the v2 direction is 3% + fixed
  (see
  [`corent_product_direction_v2.md` §1](corent_product_direction_v2.md)
  and
  [`corent_legal_trust_architecture_note.md` §1](corent_legal_trust_architecture_note.md)),
  no fee is **collected, displayed as charged, or executed** during
  beta.
- **No payment integration.** No live Toss Payments connection, no
  PG webhook handling in production, no real card capture. The
  current `mockPaymentAdapter` remains the only path.
- **No deposit collection.** Deposits may appear in the UI as part
  of the trust narrative, but no real authorization or hold against
  a user instrument occurs.
- **No settlement / payout.** Lender payouts are not executed. The
  state machine may transition into `settlement_ready` / `settled`,
  but no money moves.
- **No CoRent wallet.** No internal balance. No stored value of any
  kind on a CoRent ledger. (Restated from
  [`corent_legal_trust_architecture_note.md` §3](corent_legal_trust_architecture_note.md).)
- **No advertising monetization.** No paid ad slots, no sponsored
  listings, no monetized recommendations.
- **No subscription.** No paid tiers, no premium membership, no
  paywalls.
- **No active paid-brokerage language.** UI copy must not claim or
  imply that CoRent is currently brokering paid transactions for a
  fee.
- **Future pricing model may be displayed only as planned / under
  review.** If the planned 3% + fixed structure is shown anywhere
  for transparency, it must be labeled clearly (e.g. "예정 / 검토
  중", "planned, subject to review") and never as an active charge.

The boundary is: **show the trust workflow, do not charge for it.**

## 2. Beta Validation Metrics to Collect

Beta exists to learn what to build next. The following signals
should be collected during the window. Capture method and storage
are not specified here (no DB integration in this note); the
**identity and forward compatibility** of these metrics matter more
than today's storage location.

- **Search volume** — how many natural-language searches are run.
- **Category intent** — which categories the searches resolve into
  (and which fall back to "전체").
- **Item-detail CTR** — clicks from `/search` results into
  `/items/[id]`.
- **Rental-request conversion** — proportion of item-detail views
  that submit a rental request.
- **Waitlist conversion** — opt-ins to a future-launch waitlist (UI
  surface to be designed separately).
- **Expected-price acceptance** — willingness to proceed at the
  shown duration price (and at what price the drop-off happens).
- **Lender registration intent** — sellers/lenders entering the
  registration flow and what fraction complete it.
- **Deposit acceptance signal** — whether borrowers proceed past
  the deposit disclosure.
- **Trust-flow dropoff** — at which lifecycle step requests
  abandon (request → approval → photos → checklist → confirmation
  → return → settlement).
- **Region demand** — regional distribution of searches and
  requests across Korea.

These metrics inform the future pricing, category, and partner
decisions. They are **not** product features themselves; they are
beta instrumentation.

## 3. Beta / Launch Mode Architecture

CoRent maintains **one** codebase. Both beta and launch behavior
ship from the same `main` branch.

- **Do not** maintain long-lived `beta` and `production` branches.
  The Codex / Claude / main workflow in
  [`agent_loop.md`](agent_loop.md) is the only branching model.
- **Use explicit runtime modes / feature flags** to gate behavior.
  The flag set for v2 / pre-revenue beta is:

| Flag                         | Purpose                                                    | Default in beta | Activates when                                        |
|------------------------------|------------------------------------------------------------|-----------------|-------------------------------------------------------|
| `PRE_REVENUE_BETA`           | Top-level posture flag; disables revenue surfaces          | **on**          | always on until §0 window closes                      |
| `LAUNCH_READY`               | Top-level posture flag for post-window mode                | **off**         | §0 window closed AND user-approved readiness          |
| `ENABLE_PAYMENTS`            | Live PG / Toss Payments integration                        | **off**         | partner contract + security gate cleared              |
| `ENABLE_DEPOSITS`            | Real deposit authorization and hold                        | **off**         | partner contract + security gate cleared              |
| `ENABLE_FEES`                | Real fee collection and lender-side payout reduction       | **off**         | `LAUNCH_READY` + `ENABLE_PAYMENTS`                    |
| `ENABLE_REAL_DB`             | Real database backing (replaces localStorage adapter)      | **off**         | DB readiness audit + security gate cleared            |
| `ENABLE_LOCATION_MATCHING`   | GPS / geofenced / distance-ranked matching                 | **off**         | location-information compliance review                |
| `ENABLE_PARTNER_PROTECTION`  | Partner-backed protection product (insurance/guarantee)    | **off**         | licensed partner contract + legal review              |

- **Beta mode** = `PRE_REVENUE_BETA = on`, all `ENABLE_*` flags off.
  Public validation, no revenue, mock adapters only.
- **Launch mode** = `LAUNCH_READY = on` plus the specific
  `ENABLE_*` flags required for the launched surface. Activates only
  after 2026-07-13 **and** explicit legal/payment/business readiness
  approval.

**Flag hygiene rules** (apply when flags are eventually implemented;
no implementation in this note):

- Each flag has a **clear name** that describes the surface it
  controls, not the implementation.
- Each flag has a documented **owner / purpose** entry — what it
  controls and who owns the decision to flip it.
- Each flag has **on/off behavior tests** so the off-path is not
  silently broken when the on-path is added.
- Each flag has a **removal / cleanup plan** when it is intended to
  be temporary (e.g. flags that exist only to gate a launch are
  removed once the launch is permanent).

## 4. Data Forward-Compatibility

Whatever beta data is collected must **map cleanly into the future
launch DB schema**. Concretely:

- The shape of beta-collected fields (search inputs, request
  outcomes, lender preferences) must reuse the current Intent
  domain types defined in `src/domain/intents.ts`. Beta should not
  invent ad-hoc parallel structures.
- The forthcoming **DB readiness audit** (queued; not started)
  inherits this constraint. Its scope must include a **seed /
  migration plan** that takes the localStorage-shaped beta data
  and lifts it into the launch-time persistence layer without
  schema rewrites.
- Beta data identifiers (RentalIntent ids, ListingIntent ids,
  RentalEvent ids) should remain stable across the beta-to-launch
  transition wherever feasible, so dashboards and analytics do not
  reset.

This note does **not** prescribe a specific DB. The DB readiness
audit will.

## 5. Internal Launch Prep Allowance

Launch-only code may be **prepared** behind disabled flags during
the beta window, with the following constraints:

- **Allowed:** scaffolding adapters, type definitions, internal
  modules, and tests **behind disabled flags**, as long as no live
  paid flow is exposed and no external service is called.
- **Allowed:** docs-only design work — DB schema drafts, payment
  partner integration sketches, security review structures —
  produced as additional notes in `docs/`.
- **Allowed:** static analysis passes — TypeScript types, lint,
  unit tests against mock implementations.
- **Not allowed:** live wiring of any paid flow, partner SDK
  initialization on the production runtime, real network calls to
  PG / DB / location / file storage providers, even with the flags
  off (because credentials in the runtime are themselves a leak
  surface).
- **Not allowed:** copy that implies a paid flow is currently
  active (see §1 last bullet).

In short: **prepare the launch model in the codebase, but do not
expose it to users until the §0 window closes and the relevant
flags are flipped under approval.**

## 6. Out of Scope (this note)

- No flag implementation. The flag table in §3 is a specification,
  not code. Implementing the flags requires a separate approved
  docs+code PR.
- No DB integration. The forward-compatibility constraint in §4 is
  a design rule for the future audit, not a green-light to start
  the audit's implementation phase.
- No payment integration. All current code remains on
  `mockPaymentAdapter`.
- No UI mode-switching code. No `PRE_REVENUE_BETA` checks in
  React components, no conditional copy gated on `LAUNCH_READY`.
- No metric collection wiring. The list in §2 defines **what** to
  collect when collection is built; it does not authorize
  collection infrastructure.

All implementation items above remain gated on explicit user
approval per [`agent_loop.md`](agent_loop.md).

# CoRent Product Direction v2

_Recorded: 2026-04-30_

> **Status:** Historical / Former Vertical Direction
> **Scope:** CoRent discovery path and former rental-marketplace
> thesis (fee model, geography, design maturity, flow-first
> principle).
> **Superseded by:** [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md).
> **Last reviewed:** 2026-05-07 (demoted to Historical per the
> 2026-05-07 platform pivot).
> **Current use:** context only.
> **Do not use for:** current roadmap, marketplace growth,
> payment / trust / rental expansion, fee-shape planning,
> category wedge selection.
>
> **This document no longer drives active product direction.** It
> is preserved as a record of the discovery path that produced
> the platform primitives we now build on. Body unchanged.

## 0. Purpose & Versioning

This note declares the **CoRent Product Direction v2**.

It supersedes the implicit "v1" direction fragments scattered across:

- [`../CLAUDE.md`](../CLAUDE.md)
- [`corent_context_note.md`](corent_context_note.md)
- [`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md)

Those documents still encode the older 10% commission and Seoul-beta
framing. They are flagged in section 5 below for a separate follow-up
alignment PR. **No edits to existing docs in this commit.**

This note also:

- does **not** modify the frozen MVP v1 milestone marker
  ([`corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md));
- does **not** duplicate the legal/trust architecture scope already
  defined in
  [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md).
  Where the legal/trust note is the canonical source on a topic, this
  note points to it instead of restating.

The role of this v2 note is to be the **single grep-able anchor for
the current product direction**: fee shape, geography, design
maturity, flow-first principle.

## 1. Fee Model

Target structure: **3% of the rental fee, plus a fixed transaction
fee (TBD).** Not 10%. Not marketplace rake.

The fee is positioned as compensation for **platform / service /
safe-transaction infrastructure** — payment processing coordination,
safe-transaction workflow, pickup/return evidence intake, dispute
intake, lifecycle tracking, and trust infrastructure.

The full positioning, copy guidance (Korean and English), and the
reasoning behind each component live in
[`corent_legal_trust_architecture_note.md` §1](corent_legal_trust_architecture_note.md).
That note is the source of truth on fee shape and language. Implementation in `src/lib/pricing.ts` and the borrower-facing copy in
`src/components/pricing/PriceBreakdown.tsx` is **out of scope** here
and gated behind the DB readiness audit and a direction-aligned doc
PR.

## 2. Geography

Product direction is **Korea-wide**. Seoul-only was a demo/test
assumption, not a product constraint. Existing seed data (e.g. the
"서울 마포구 합정", "서울 강남구 역삼" pickup labels in
`src/data/products.ts`) may stay as fixtures.

The geography model — region / city-district / pickup-availability,
no GPS yet, location-based ranking gated on compliance review — is
defined in
[`corent_legal_trust_architecture_note.md` §5](corent_legal_trust_architecture_note.md).
That note is the source of truth on geography. This note simply
records that Korea-wide is the v2 stance and Seoul is **not** a
product constraint.

## 3. Design Maturity

**The current UI is a foundation, not the finished interface.**

What this means concretely:

- The black-and-white Swiss Grid system implemented in
  `src/app/globals.css` and the existing components is a **rule-based,
  internally consistent, demoable foundation**. It is intentionally
  disciplined — line hierarchy, ink opacity, fixed spacing — to
  prevent agent-driven drift.
- It is **not** the final polished UI. It is what the product looks
  like when no flow mapping has yet been done. It is good enough to
  validate end-to-end Intent wiring and to show real users what the
  product is supposed to feel like, not the visual end state.
- Future visual work must follow §4 below: flow mapping first, then
  UI. **Do not treat current screens as the final design** during
  reviews, partner conversations, or any decision that depends on
  visual completeness.
- The visual-system change approval gate from
  [`agent_loop.md`](agent_loop.md) still applies. "Foundation, not
  final" is not a license to drift the design tokens; it means the
  next visual round is a **deliberate** redesign on top of the
  flow-mapped product, not ad-hoc per-screen polish.

This is the single new declaration in v2 that the legal/trust note
does not already cover.

## 4. Flow-First Product Design

CoRent is designed from **flows**, not from pretty screens.

The required loop:

1. Start from the user's **rental intent** and the lender's
   **operating preferences**.
2. Walk the full flow end to end (search, matching, pricing,
   scheduling, trust, payment, pickup, return, settlement, dispute).
3. List the parts that are **annoying or complex** for the user.
4. Decide which of those the **system can absorb**.
5. Leave the user with **only the essential decisions**.
6. Design the visual UI **around the simplified flow**, not the other
   way around.

The full statement of this principle, including how it interacts with
the safe-transaction abstraction and the existing state machine,
lives in
[`corent_legal_trust_architecture_note.md` §6 and §7](corent_legal_trust_architecture_note.md).
That note is the source of truth on the flow-first principle. The v2
direction restates the loop here so future agents reading this anchor
do not need to chase to land on the rule.

## 5. Documents With Stale Direction

The following documents still reference the old 10% commission and
Seoul-beta framing. They are inconsistent with v2 but are **not edited
in this commit.**

- [`../CLAUDE.md`](../CLAUDE.md)
- [`corent_context_note.md`](corent_context_note.md)
- [`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md)

A separate follow-up docs PR will mechanically replace those stale
lines with pointers to:

- this note (`corent_product_direction_v2.md`)
- [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)

Until that alignment PR lands, **agents must treat the new v2 notes
as authoritative on fee, geography, design maturity, flow-first
principle, and pre-revenue beta posture, and ignore the stale lines
in the three documents above.**

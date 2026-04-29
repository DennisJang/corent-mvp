# CLAUDE.md — CoRent MVP

You are working on CoRent, a Korea-wide AI rental/sharing MVP. Seoul is a demo/test region only and is **not** a product constraint — the canonical reference is [`docs/corent_product_direction_v2.md`](docs/corent_product_direction_v2.md).

## Required Reading Before Major Work

Read these in order, every time you start non-trivial work. **The Direction v2 documents (1–5) win on conflict over the older context/intent-rule documents (7–9).**

1. `docs/corent_product_direction_v2.md` — current product direction (fee, geography, design maturity, flow-first principle)
2. `docs/corent_legal_trust_architecture_note.md` — legal/trust architecture (C2C marketplace, no wallet, partner-mediated payment, regulated-language ban)
3. `docs/corent_pre_revenue_beta_plan.md` — pre-revenue posture, runtime modes / feature flags, beta validation metrics
4. `docs/corent_security_gate_note.md` — security review gate before any DB / auth / payment / file-upload / location work
5. `docs/corent_defensibility_note.md` — disclosure boundaries and defensible assets
6. `docs/agent_loop.md` — Claude ↔ Codex workflow and approval gates
7. `docs/corent_context_note.md` — original product context (older 10% / Seoul-beta framing; superseded inline by Direction v2)
8. `docs/corent_design_system_bw_v1.md` — current visual system (BW Swiss Grid); see also "Design Maturity" below
9. `docs/corent_functional_mvp_intent_rules.md` — Intent-model implementation rules (older 10% / Seoul-beta framing; superseded inline by Direction v2)
10. `CLAUDE.md` (this file)

The **previous blue-based design (v0) has been retired**. Any document still referring to a blue palette or to `docs/corent_mvp_design_system_v0.md` is out of date and must not be followed. The single source of truth for visuals is `docs/corent_design_system_bw_v1.md`.

## Visual References

The five visual reference images live in `docs/references/`:

```txt
docs/references/01-golden-ratio-grid.png
docs/references/02-celestial-orbit-diagram.png
docs/references/03-muller-brockmann-film.png
docs/references/04-muller-brockmann-grid-overlap.png
docs/references/05-helvetica-typography.png
```

These are visual anchors only. Do not trace, recreate, or import them as decorative assets.

## Product Summary

CoRent lets people borrow products before buying them and lets owners turn idle products into short-term rental income.

Main consumer positioning:

> 사기 전에, 며칠만 살아보기.

Seller positioning:

> 집에 잠든 물건을 작은 렌탈 사업장으로.

This is a validation MVP, not a full public launch.

## Current MVP Scope

Build only these 5 screens first:

1. Landing / AI search
2. Matching results
3. Product detail / trust summary
4. Seller AI registration
5. Seller dashboard

Initial categories:

- Massage guns
- Home-care devices
- Small exercise equipment

Initial region:

- **Korea-wide product direction.** Seoul is a demo/test assumption, not a product constraint. Seed/demo data may still include Seoul examples. See [`docs/corent_product_direction_v2.md`](docs/corent_product_direction_v2.md) §2 and [`docs/corent_legal_trust_architecture_note.md`](docs/corent_legal_trust_architecture_note.md) §5.

Rental method:

- Direct pickup and return only
- Payment still happens inside the platform
- Do not design around cash or in-person payment

Rental durations:

- 1 day
- 3 days
- 7 days

Payment:

- Toss Payments-ready architecture (interfaces only). `mockPaymentAdapter` is the only path during the pre-revenue beta window.
- Real PG / Toss integration is gated behind partner contract and a security review per [`docs/corent_security_gate_note.md`](docs/corent_security_gate_note.md). See also [`docs/corent_legal_trust_architecture_note.md`](docs/corent_legal_trust_architecture_note.md) §3 and [`docs/corent_pre_revenue_beta_plan.md`](docs/corent_pre_revenue_beta_plan.md) §1.

Fee model:

- **Pre-revenue beta:** no fee is collected, displayed as charged, or executed. Future pricing model may appear only as **planned / under review**, never as an active charge.
- **Future target (post-2026-07-13 + readiness):** 3% of rental fee + fixed transaction fee (TBD). Positioned as platform / safe-transaction infrastructure, not marketplace rake.
- Sources of truth: [`docs/corent_product_direction_v2.md`](docs/corent_product_direction_v2.md) §1, [`docs/corent_legal_trust_architecture_note.md`](docs/corent_legal_trust_architecture_note.md) §1, [`docs/corent_pre_revenue_beta_plan.md`](docs/corent_pre_revenue_beta_plan.md) §1.

Trust model:

- AI first check
- Human final review
- Today's safety code photo
- Private serial number storage
- Buyer safety deposit
- Delayed settlement after return confirmation

## Pre-Revenue Beta Posture

CoRent operates in a **pre-revenue validation window** until **2026-07-13** AND explicit legal/payment/business readiness approval. During this window:

- No platform fee, no payment integration, no deposit collection, no settlement/payout, no CoRent wallet, no ad monetization, no subscription, no active paid-brokerage language.
- One `main` codebase. Beta vs. launch behavior is gated by named runtime modes / feature flags (`PRE_REVENUE_BETA`, `LAUNCH_READY`, `ENABLE_PAYMENTS`, `ENABLE_DEPOSITS`, `ENABLE_FEES`, `ENABLE_REAL_DB`, `ENABLE_LOCATION_MATCHING`, `ENABLE_PARTNER_PROTECTION`). Flags are documented but **not yet implemented in code** — implementation requires a separate approved PR.
- Full posture, metrics list, and flag table: [`docs/corent_pre_revenue_beta_plan.md`](docs/corent_pre_revenue_beta_plan.md).

## Security Gate

Real DB, real auth/session, real payment, real file/photo upload, location-based matching, and partner-protection wiring **all require a security review to be cleared first** as a docs-only readiness note. Do not start any of those without it. Full gate: [`docs/corent_security_gate_note.md`](docs/corent_security_gate_note.md).

## Legal / Trust Framing

CoRent is a **C2C rental marketplace and transaction-state / trust-workflow layer**, not the direct rental counterparty. No CoRent wallet. Money movement (payment, deposit hold/release, refunds, settlement) flows through a **licensed PG / payment partner** once integrated. Avoid regulated language ("insurance", "premium", "coverage", "claim payout") unless a licensed partner is contracted and legally reviewed. Full posture: [`docs/corent_legal_trust_architecture_note.md`](docs/corent_legal_trust_architecture_note.md).

## Design Maturity & Flow-First

The current BW Swiss Grid UI is a **demoable, rule-based foundation — not the final polished UI**. Do not treat current screens as final. Future visual work is **flow-first**: start from the user's rental intent and lender operating preferences, identify annoying/complex steps, abstract what the system can absorb, leave the user with only essential decisions, and then design the UI around the simplified flow. The visual-system change approval gate from `docs/agent_loop.md` still applies — "foundation, not final" is not a license to drift design tokens. See [`docs/corent_product_direction_v2.md`](docs/corent_product_direction_v2.md) §3 and §4.

## Defensibility

Public beta exposes only the high-level concept and basic mechanics. Do not publish category rankings, demand/supply conversion, price sensitivity, partner pipeline, or detailed trust/fee logic. Lead partner conversations with **validated demand data**, not the raw idea. Full posture: [`docs/corent_defensibility_note.md`](docs/corent_defensibility_note.md).

## Design System — BW Swiss Grid (v1)

The full specification lives in `docs/corent_design_system_bw_v1.md`. This section is a quick-reference summary; on conflict, the v1 document wins.

### Palette — black-and-white only

```css
--black: #000000;
--white: #FFFFFF;
```

Permitted ink opacity tokens (for hierarchy and dividers only — not for color):

```css
--ink-100: rgba(0,0,0,1);
--ink-80:  rgba(0,0,0,0.8);
--ink-60:  rgba(0,0,0,0.6);
--ink-40:  rgba(0,0,0,0.4);
--ink-20:  rgba(0,0,0,0.2);
--ink-12:  rgba(0,0,0,0.12);
--ink-08:  rgba(0,0,0,0.08);
```

Do not introduce blue, green, red, yellow, gradients, decorative accent colors, colorful badges, or arbitrary gray hex values. Failure and error states use black text and dashed/strong lines, never red.

### Line hierarchy

```css
--line-thin:    1px solid rgba(0,0,0,0.12);   /* secondary structure */
--line-base:    1px solid rgba(0,0,0,0.2);    /* normal boundary */
--line-strong:  1px solid #000000;            /* selected / confirmed */
--line-dashed:  1px dashed rgba(0,0,0,0.28);  /* pending / inferred / suggested */
```

### Typography

```css
font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
```

Weights: `400`, `500`, `700` only.

Type scale (also encoded as utility classes in `src/app/globals.css`):

```css
--type-display:  80px;
--type-h1:       56px;
--type-h2:       40px;
--type-h3:       28px;
--type-title:    20px;
--type-body:     16px;
--type-small:    13px;
--type-caption:  11px;
```

### Spacing (only these values)

```txt
4px  8px  12px  16px  24px  32px  48px  64px  96px  128px
```

### Radius

```css
--radius-none:  0px;   /* core cards, product cards */
--radius-small: 8px;   /* inputs */
--radius-pill:  999px; /* badges, pill buttons */
```

### Visual rules

- Prefer borders over shadows. No drop shadows on standard cards.
- No gradients, no soft SaaS surfaces, no decorative icon sets.
- Keep the UI calm, premium, trustworthy, spacious, and structured.
- Failure UI: black text labels and dashed/strong lines — never red.

### Visual-system change gate

Any modification to the palette, line hierarchy, typography, spacing scale, radius set, or layout philosophy is a **visual system change** and is one of the approval gates listed in `docs/agent_loop.md`. Claude and Codex cannot make these changes without explicit user approval, and the canonical reference is `docs/corent_design_system_bw_v1.md`.

## Implementation Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- `src/` directory
- `@/*` import alias

Reusable components already in the repo (extend these — don't fork):

- `Button`, `Card`, `Badge`, `Input`
- `PageShell`, `SectionHeader`
- `ProductCard`, `TrustSummary`, `DurationSelector`, `SafetyCodeCard`
- `SellerDashboardStat`, `AIChatPanel`
- `intent/RentalIntentTimeline`, `intent/IntentStatusBadge`
- `pricing/PriceBreakdown`

Use mock data first. Each of the following is gated by the [security review](docs/corent_security_gate_note.md) and explicit user approval — do not start any of them without both:

- real auth / session
- real database
- real payment integration
- real file / photo upload
- real AI API call
- real admin console
- location-based matching / GPS

Out of scope for MVP and not on the near-term roadmap:

- insurance / underwriting (regulated language banned per [legal/trust note §4](docs/corent_legal_trust_architecture_note.md))
- delivery logistics
- full dispute automation

## Architecture — Stripe-Style Intent Model

CoRent's domain is centered on Intent objects. The most important is `RentalIntent`, which owns the full lifecycle of a rental transaction (request → seller approval → payment → pickup → return → settlement, plus failure and recovery states).

Architectural rules (full detail in `docs/corent_functional_mvp_intent_rules.md`):

- Domain logic lives in `src/domain/` and `src/lib/stateMachines/`. UI components must not call adapters or state machines directly — they go through services in `src/lib/services/`.
- Persistence, payment, and AI parsing all sit behind adapter interfaces in `src/lib/adapters/`. Mock implementations are wired now; real Toss / Supabase / OpenAI implementations are slotted in later via the same interface.
- Failures (`payment_failed`, `pickup_missed`, `return_overdue`, `damage_reported`, `dispute_opened`, `settlement_blocked`, etc.) are first-class states, not afterthoughts.

## Working Style

Bias toward small, safe, reviewable changes.

Before editing:

- inspect the relevant files
- understand the existing structure
- explain the short plan

While editing:

- keep changes scoped
- prefer reusable components
- avoid one-off styles
- preserve design tokens
- do not rewrite unrelated files
- do not delete files unless explicitly asked

After editing:

- run `npm run lint`, `npm run build`, `npm test`
- summarize files changed
- explain what is mocked
- explain what should be built next

## Agentic Coding Guardrails

- Do not hallucinate existing files, APIs, routes, or packages.
- If a file does not exist, create it deliberately.
- If a dependency is not installed, ask before adding it unless it is already part of the requested stack.
- Prefer simple code over clever code.
- Do not over-engineer.
- Do not implement features outside the current milestone.
- Do not hide uncertainty. If something is ambiguous, make a reasonable MVP assumption and state it.
- Follow the workflow in `docs/agent_loop.md`. Codex branches are never auto-merged; the user is the final approver on every approval gate.

## Current Milestone

**Milestone 1 — DONE.** Functional Intent MVP on the BW Swiss Grid system is browser-demoable as of 2026-04-30 (see [`docs/corent_mvp_v1_completion_note.md`](docs/corent_mvp_v1_completion_note.md)).

**Next milestone — flow mapping + DB readiness audit (docs-only).** No DB, payment, auth, upload, or location integration starts until the relevant docs-only audit and security review notes exist and are explicitly approved. The pre-revenue beta posture in [`docs/corent_pre_revenue_beta_plan.md`](docs/corent_pre_revenue_beta_plan.md) holds throughout, and the visual system stays on the BW foundation until a flow-mapped redesign is approved.

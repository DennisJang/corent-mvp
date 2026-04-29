# CLAUDE.md — CoRent MVP

You are working on CoRent, a Seoul-based AI rental/sharing MVP.

## Required Reading Before Major Work

Read these in order, every time you start non-trivial work:

1. `docs/corent_context_note.md` — product context
2. `docs/corent_design_system_bw_v1.md` — current visual system (BW Swiss Grid)
3. `docs/corent_functional_mvp_intent_rules.md` — Intent-model implementation rules
4. `docs/agent_loop.md` — Claude ↔ Codex workflow and approval gates
5. `CLAUDE.md` (this file)

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

- Seoul beta

Rental method:

- Direct pickup and return only
- Payment still happens inside the platform
- Do not design around cash or in-person payment

Rental durations:

- 1 day
- 3 days
- 7 days

Payment:

- Toss Payments-ready architecture
- Placeholder/mock payment only for now
- No real Toss integration yet

Commission:

- 10% of rental fee

Trust model:

- AI first check
- Human final review
- Today's safety code photo
- Private serial number storage
- Buyer safety deposit
- Delayed settlement after return confirmation

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

Use mock data first. Do not add:

- real auth
- real database
- real payment
- real file upload backend
- real AI API call
- real admin console
- insurance
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

Milestone 1 — functional Intent MVP on the BW Swiss Grid system.

Goal:

Make CoRent feel like a real, trustworthy, premium product using mock data only, with the Intent model wired end-to-end (search → listing → rental request → state transitions → dashboard) on the black-and-white Swiss grid.

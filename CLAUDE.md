Always read these before major work:
1. docs/corent_context_note.md
2. docs/corent_design_system_bw_v1.md
3. docs/corent_functional_mvp_intent_rules.md
4. CLAUDE.md

## Visual References

The 5 visual reference images are stored in:

```txt
docs/references/


# CLAUDE.md — CoRent MVP

You are working on CoRent, a Seoul-based AI rental/sharing MVP.

Read the product and design document before making implementation decisions:

- docs/corent_mvp_design_system_v0.md

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

- Today’s safety code photo

- Private serial number storage

- Buyer safety deposit

- Delayed settlement after return confirmation

## Design System

Use only the approved design system from:

- docs/corent_mvp_design_system_v0.md

Core rules:

- Palette only:

  - Ink: #111827

  - Primary Trust Blue: #2B59C3

  - Accent Clarity Blue: #5BC0EB

  - Air Surface: #F3F8FF

  - White: #FFFFFF

- Font:

  - Helvetica, "Helvetica Neue", Arial, sans-serif

- Weights only:

  - 400

  - 500

  - 700

- Spacing tokens only:

  - 4px

  - 8px

  - 12px

  - 16px

  - 24px

  - 32px

  - 48px

  - 64px

  - 96px

  - 128px

- Do not invent random colors.

- Do not invent random font sizes.

- Do not invent random spacing values.

- Do not add decorative noise.

- Prefer borders over heavy shadows.

- Keep the UI calm, premium, trustworthy, spacious, and structured.

## Implementation Stack

Use:

- Next.js App Router

- TypeScript

- Tailwind CSS

- src directory

- import alias @/*

Create reusable components:

- Button

- Card

- Badge

- Input

- PageShell

- SectionHeader

- ProductCard

- TrustSummary

- DurationSelector

- SafetyCodeCard

- SellerDashboardStat

- AIChatPanel

Use mock data first.

Do not add:

- real auth

- real database

- real payment

- real file upload backend

- real AI API call

- real admin console

- insurance

- delivery logistics

- full dispute automation

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

- run lint/build if available

- summarize files changed

- explain what is mocked

- explain what should be built next

## Agentic Coding Guardrails

Do not hallucinate existing files, APIs, routes, or packages.

If a file does not exist, create it deliberately.

If a dependency is not installed, ask before adding it unless it is already part of the requested stack.

Prefer simple code over clever code.

Do not over-engineer.

Do not implement features outside the current milestone.

Do not hide uncertainty. If something is ambiguous, make a reasonable MVP assumption and state it.

## Current Milestone

Milestone 1:

Static MVP.

Goal:

Make CoRent feel like a real, trustworthy, premium product using mock data only.
# CLAUDE.md — CoRent MVP

You are working on CoRent, a Seoul-based AI rental/sharing MVP.

Read the product and design document before making implementation decisions:

- docs/corent_mvp_design_system_v0.md

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

- Today’s safety code photo

- Private serial number storage

- Buyer safety deposit

- Delayed settlement after return confirmation

## Design System

Use only the approved design system from:

- docs/corent_mvp_design_system_v0.md

Core rules:

- Palette only:

  - Ink: #111827

  - Primary Trust Blue: #2B59C3

  - Accent Clarity Blue: #5BC0EB

  - Air Surface: #F3F8FF

  - White: #FFFFFF

- Font:

  - Helvetica, "Helvetica Neue", Arial, sans-serif

- Weights only:

  - 400

  - 500

  - 700

- Spacing tokens only:

  - 4px

  - 8px

  - 12px

  - 16px

  - 24px

  - 32px

  - 48px

  - 64px

  - 96px

  - 128px

- Do not invent random colors.

- Do not invent random font sizes.

- Do not invent random spacing values.

- Do not add decorative noise.

- Prefer borders over heavy shadows.

- Keep the UI calm, premium, trustworthy, spacious, and structured.

## Implementation Stack

Use:

- Next.js App Router

- TypeScript

- Tailwind CSS

- src directory

- import alias @/*

Create reusable components:

- Button

- Card

- Badge

- Input

- PageShell

- SectionHeader

- ProductCard

- TrustSummary

- DurationSelector

- SafetyCodeCard

- SellerDashboardStat

- AIChatPanel

Use mock data first.

Do not add:

- real auth

- real database

- real payment

- real file upload backend

- real AI API call

- real admin console

- insurance

- delivery logistics

- full dispute automation

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

- run lint/build if available

- summarize files changed

- explain what is mocked

- explain what should be built next

## Agentic Coding Guardrails

Do not hallucinate existing files, APIs, routes, or packages.

If a file does not exist, create it deliberately.

If a dependency is not installed, ask before adding it unless it is already part of the requested stack.

Prefer simple code over clever code.

Do not over-engineer.

Do not implement features outside the current milestone.

Do not hide uncertainty. If something is ambiguous, make a reasonable MVP assumption and state it.

## Current Milestone

Milestone 1:

Static MVP.

Goal:

Make CoRent feel like a real, trustworthy, premium product using mock data only.

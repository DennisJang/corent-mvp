# CoRent Design System BW v1

> **Status:** Design System — current visual system (the only one)
> **Scope:** Palette (BW only + ink-opacity tokens), typography
> (Helvetica), spacing scale, line hierarchy, radius, layout
> philosophy, reference images, and visual-system change gate
> **Last reviewed:** 2026-05-06 (last content update: 2026-04-29)
> **Read before:** any visual / token / component change; any new
> Korean copy that needs to render at the right type scale
> **Do not use for:** copy banlist (use
> [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md));
> readiness card or wanted-form copy variants (use
> [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md));
> the retired blue v0 system (do not use; superseded by this doc)

_Last updated: 2026-04-29_
## Reference Images

The black-and-white visual system is grounded in five local reference images.

These images are stored in:

docs/references/

Reference files:

- 01-golden-ratio-grid.png

- 02-celestial-orbit-diagram.png

- 03-muller-brockmann-film.png

- 04-muller-brockmann-grid-overlap.png

- 05-helvetica-typography.png

## Reference Mapping

Use the five reference images only as visual anchors. Do not copy them literally and do not use them as decorative assets.

| File | Role in CoRent |
|---|---|
| `docs/references/01-golden-ratio-grid.png` | Proportion, page structure, 7/5 and 6/6 layout splits |
| `docs/references/02-celestial-orbit-diagram.png` | Sparse AI matching / trust flow diagrams using nodes, arcs, solid lines, and dashed lines |
| `docs/references/03-muller-brockmann-film.png` | Strict Swiss poster grid, hierarchy through alignment, large type, and whitespace |
| `docs/references/04-muller-brockmann-grid-overlap.png` | Typographic grid tension, controlled overlap, structure before expression |
| `docs/references/05-helvetica-typography.png` | Helvetica-first black-and-white information design, neutral tone, type as interface |
Implementation rule:

The extracted principles in this document are the source of truth. The images are reference anchors only. Claude Code and Codex must not recreate the images directly, trace them, or introduce decorative graphics just because the references contain visual diagrams.

## 0. Purpose

This document replaces the previous blue-based CoRent visual direction.

The CoRent MVP should now use a **black-and-white Swiss grid editorial system** inspired by:

1. Golden ratio construction grids
2. Celestial/orbital diagrams
3. Müller-Brockmann poster grid systems
4. Overlapping typographic grid construction
5. Helvetica typographic restraint

The product logic, MVP scope, routes, and business decisions remain unchanged. This document only redefines the visual system and layout language.

---

# 1. Design Thesis

CoRent is not a colorful rental marketplace.

CoRent should feel like:

> **a precise trust system for borrowing and lending personal products.**

The UI should communicate reliability through structure, proportion, typography, black-and-white contrast, line hierarchy, visible grid discipline, and calm whitespace.

The interface should feel trustworthy, minimal, architectural, mathematical, editorial, monochrome, grid-first, quiet, precise, premium, and not decorative or noisy.

---

# 2. Reference Principles

## 2.1 Golden Ratio Construction Grid

Extracted principles:

- Use proportion before decoration.
- Use 61.8 / 38.2, 3:2, 5:3, or 50/50 splits deliberately.
- Let the page structure feel constructed, not randomly arranged.
- Large empty areas are allowed if they support hierarchy.
- Key modules should sit inside visible or implied proportional systems.

Application:

- Landing hero can use a 7-column / 5-column split.
- Product detail can use a 6-column / 6-column split.
- Seller registration can use a 5-column / 7-column split.
- Dashboard can use proportional rows instead of dense widgets.

## 2.2 Celestial / Orbit Diagram

Extracted principles:

- Use circles, arcs, points, and crossing lines as abstract diagrams.
- Solid lines mean confirmed states.
- Dashed lines mean pending, inferred, AI-generated, or suggested states.
- Nodes can represent user, item, seller, pickup, return, verification.
- Diagrams should be sparse and functional.

Application:

- Landing AI search module may include an orbital matching diagram.
- Empty states can use a minimal orbital diagram.
- Trust flow can use dots and lines.
- Do not use orbital graphics everywhere.
- Do not turn diagrams into decorative illustrations.

## 2.3 Müller-Brockmann Grid Construction

Extracted principles:

- Build the grid first.
- Place information on the grid.
- Use spacing as structure.
- Make hierarchy through alignment and scale.
- Do not fill space just because it exists.
- Graphic force comes from structure, not decoration.

Application:

- Use a consistent 12-column desktop grid.
- Product cards align to strict columns.
- Section titles align to fixed grid starts.
- Cards, text, lists, and CTAs should not float randomly.
- Overlap is allowed only when the underlying grid is obvious.

## 2.4 Overlapping Typography

Extracted principles:

- Typography can become the graphic.
- Large type is allowed when structure is strong.
- Overlap must not destroy readability.
- Leave enough whitespace around bold typographic decisions.

Application:

- Landing headline can be large and poster-like.
- Some page labels can sit close to grid lines.
- Do not use overlapping typography inside dense functional screens.
- Product detail and dashboard should prioritize clarity.

## 2.5 Helvetica Reference

Extracted principles:

- Helvetica is the core identity.
- Black text on white space is enough.
- Use type size, weight, and position for hierarchy.
- Avoid expressive fonts, unnecessary icons, and decorative styling.
- Typography should feel rational and neutral.

Application:

- Use Helvetica everywhere.
- Use only 400, 500, and 700.
- Avoid overusing bold.
- Avoid colorful badges.
- Let type and grid carry the product.

---

# 3. Color System

## 3.1 Core Palette

Use only:

```css
:root {
  --black: #000000;
  --white: #FFFFFF;
}
```

No blue. No gray hex colors. No green, red, yellow, purple, orange, or accent colors.

## 3.2 Permitted Opacity Tokens

Because UI needs hierarchy, borders, disabled states, and secondary text, black opacity values are allowed.

```css
:root {
  --ink-100: rgba(0, 0, 0, 1);
  --ink-80: rgba(0, 0, 0, 0.8);
  --ink-60: rgba(0, 0, 0, 0.6);
  --ink-40: rgba(0, 0, 0, 0.4);
  --ink-20: rgba(0, 0, 0, 0.2);
  --ink-12: rgba(0, 0, 0, 0.12);
  --ink-08: rgba(0, 0, 0, 0.08);
}
```

## 3.3 Color Rules

Allowed:

- black
- white
- black opacity
- white opacity over black surfaces

Not allowed:

- blue
- gradients
- colorful status labels
- colorful charts
- decorative accent fills
- random grayscale hex values

## 3.4 State Without Color

Do not use color to communicate status.

| State | Visual Treatment |
|---|---|
| Confirmed / Live | black fill, white text |
| Neutral | solid black opacity outline |
| Pending | dashed outline |
| AI suggested | dashed line or outlined label |
| Selected | strong black border |
| Disabled | black opacity text and border |
| Warning | plain black text with clear label, no color |

---

# 4. Typography

## 4.1 Font Family

```css
font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
```

## 4.2 Font Weights

Use only:

- 400
- 500
- 700

Do not use 300, 600, 800, or 900.

## 4.3 Type Scale

```css
:root {
  --type-display: 80px;
  --type-h1: 56px;
  --type-h2: 40px;
  --type-h3: 28px;
  --type-title: 20px;
  --type-body: 16px;
  --type-small: 13px;
  --type-caption: 11px;
}
```

## 4.4 Type Styles

```css
.text-display {
  font-size: 80px;
  line-height: 0.96;
  font-weight: 700;
  letter-spacing: -0.055em;
}

.text-h1 {
  font-size: 56px;
  line-height: 1.02;
  font-weight: 700;
  letter-spacing: -0.045em;
}

.text-h2 {
  font-size: 40px;
  line-height: 1.08;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.text-h3 {
  font-size: 28px;
  line-height: 1.16;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.text-title {
  font-size: 20px;
  line-height: 1.25;
  font-weight: 500;
  letter-spacing: -0.015em;
}

.text-body {
  font-size: 16px;
  line-height: 1.55;
  font-weight: 400;
}

.text-small {
  font-size: 13px;
  line-height: 1.45;
  font-weight: 400;
}

.text-caption {
  font-size: 11px;
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

## 4.5 Typography Usage

| Style | Use |
|---|---|
| Display | Landing hero, major brand statements |
| H1 | Main page title |
| H2 | Section title |
| H3 | Major card group title |
| Title | Product names, dashboard labels |
| Body | Explanatory copy |
| Small | Supporting metadata |
| Caption | Labels, states, section markers |

## 4.6 Typography Rules

- Use typography as structure, not decoration.
- Avoid too many sizes on one screen.
- Do not bold every important phrase.
- Use alignment, scale, and spacing before weight.
- Keep body text width under 640px.
- Keep hero text width under 720px.
- Large type should align to grid columns.

---

# 5. Grid System

## 5.1 Desktop Grid

```txt
max-width: 1200px
columns: 12
gutter: 24px
outer margin: 64px
```

## 5.2 Wide Desktop Grid

```txt
max-width: 1440px
columns: 12
gutter: 32px
outer margin: 96px
```

## 5.3 Dashboard Grid

```txt
max-width: 1280px
columns: 12
gutter: 24px
outer margin: 64px
```

## 5.4 Mobile Grid

```txt
columns: 4
margin: 20px
gutter: 16px
```

## 5.5 Grid Rules

- Every page should align to a grid.
- Do not center random floating modules.
- Use column spans intentionally.
- Use 7/5, 6/6, 5/7, 4/8, or 3/9 splits.
- Avoid arbitrary widths.
- If an element overlaps, the underlying grid must still feel clear.
- Dashboard density is allowed only if alignment remains strict.

---

# 6. Spacing System

## 6.1 Allowed Spacing Tokens

Use only:

```txt
4px
8px
12px
16px
24px
32px
48px
64px
96px
128px
```

No random spacing values.

## 6.2 Spacing Rules

| Use Case | Spacing |
|---|---:|
| Tiny internal relationship | 4px |
| Small related items | 8px–12px |
| Text group spacing | 12px–16px |
| Component internal padding | 16px–24px |
| Card internal padding | 24px–32px |
| Card-to-card gap | 16px–24px |
| Section-to-section gap | 64px–96px |
| Hero vertical padding | 96px–128px |
| Mobile page padding | 20px |
| Tablet page padding | 32px |
| Desktop page padding | 64px |
| Wide desktop page padding | 96px |

## 6.3 Spacing Principle

Whitespace is not empty.

Whitespace is the main material that makes CoRent feel trustworthy, premium, calm, and easy to scan.

Use spacing before dividers. Use dividers only when spacing is insufficient.

---

# 7. Line System

Lines are a core visual material in the BW system.

## 7.1 Line Tokens

```css
:root {
  --line-thin: 1px solid rgba(0, 0, 0, 0.12);
  --line-base: 1px solid rgba(0, 0, 0, 0.2);
  --line-strong: 1px solid #000000;
  --line-dashed: 1px dashed rgba(0, 0, 0, 0.28);
}
```

## 7.2 Line Meaning

| Line Type | Meaning |
|---|---|
| Thin solid | secondary structure |
| Base solid | normal card/input boundary |
| Strong solid | selected, confirmed, primary frame |
| Dashed | pending, AI-inferred, suggested, incomplete |
| Large construction line | hero/editorial grid only |

## 7.3 Line Rules

- Use lines to express structure.
- Do not use heavy shadows.
- Do not overdivide dense areas.
- Dashed lines should have semantic meaning.
- Solid lines should represent confirmed structure.

---

# 8. Radius System

This design should feel more architectural and less soft SaaS.

```css
:root {
  --radius-none: 0px;
  --radius-small: 8px;
  --radius-pill: 999px;
}
```

| Component | Radius |
|---|---|
| Core cards | 0px |
| Editorial modules | 0px |
| Inputs | 0px or 8px |
| Action buttons | 999px or 0px |
| Pills/badges | 999px |
| Modals | 0px or 12px only if necessary |
| Product cards | 0px |

Use fewer rounded corners than the previous design.

---

# 9. Shadows

## 9.1 Default

No shadows.

## 9.2 Allowed Exceptions

Shadows may be used only for:

- modal overlay focus
- active floating panel
- rare elevated preview state

Even then, keep it subtle and monochrome.

Do not use card shadows for standard layout.

---

# 10. Components

## 10.1 Button

### Primary

```css
.button-primary {
  height: 56px;
  padding: 0 24px;
  border-radius: 999px;
  background: #000000;
  color: #FFFFFF;
  border: 1px solid #000000;
  font-size: 16px;
  font-weight: 500;
}
```

### Secondary

```css
.button-secondary {
  height: 56px;
  padding: 0 24px;
  border-radius: 999px;
  background: #FFFFFF;
  color: #000000;
  border: 1px solid rgba(0, 0, 0, 0.2);
  font-size: 16px;
  font-weight: 500;
}
```

### Text Button

```txt
black text
optional underline
optional arrow
no color hover
```

### Focus

```css
.button:focus-visible {
  outline: 2px solid #000000;
  outline-offset: 2px;
}
```

## 10.2 Card

```css
.card {
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 0;
  padding: 32px;
}
```

Selected card:

```css
.card-selected {
  border: 1px solid #000000;
}
```

Card rules:

- no shadows
- no gradient backgrounds
- no colored accent bars
- no random radius
- card content must align to grid

## 10.3 Badge

```css
.badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #FFFFFF;
  color: #000000;
  border: 1px solid rgba(0, 0, 0, 0.2);
  font-size: 11px;
  line-height: 1.35;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

Badge variants:

```txt
Confirmed / Live:
black fill + white text

Neutral:
white background + solid outline

Pending / AI:
white background + dashed outline

Selected:
white background + strong black outline
```

## 10.4 Input

```css
.input {
  height: 56px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 0;
  background: #FFFFFF;
  color: #000000;
  padding: 0 16px;
  font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
}
```

Focus:

```css
.input:focus {
  outline: 2px solid #000000;
  outline-offset: 2px;
}
```

## 10.5 Product Card

Product card structure:

```txt
Top:
CATEGORY / STATUS

Middle:
Product name

Meta:
Price
Duration
Pickup area

Trust:
One-line trust summary
```

Example:

```txt
MASSAGE GUN / VERIFIED
Hypervolt Go 2

₩16,000 / 3 days
Seoul · Direct pickup

Safety code photo required
```

Rules:

- no colorful status
- no decorative product image background
- no soft SaaS card styling
- use black/white line structure
- use large product name as visual anchor

## 10.6 Trust Summary

Trust summary should be numbered.

Example:

```txt
01 Recent code photo
02 Components checked
03 Private serial stored
04 Return before settlement
```

Rules:

- numbers create hierarchy
- no colorful check icons
- line separation is allowed
- solid line means confirmed
- dashed line means pending

## 10.7 AI Module

AI should not look like a casual chat app.

Avoid:

- round bubbly chat UI
- colorful assistant avatars
- excessive icons

Use structured blocks:

```txt
AI QUESTION 01
What item do you want to lend?

SELLER RESPONSE
Theragun Mini, barely used.

EXTRACTED
Product: Theragun Mini
Category: Massage gun
AI price: ₩16,000 / 3 days
```

## 10.8 Orbital Diagram

A minimal orbital diagram may be used as a supporting graphic.

Rules:

- black stroke only
- white background
- thin solid and dashed lines
- small node circles
- no fill colors except black/white
- no animation unless extremely subtle
- must communicate AI matching/trust flow

---

# 11. Screen-Level Direction

## 11.1 Landing / AI Search

Goal:

Make the first screen feel like a Swiss poster and a product interface at the same time.

Structure:

```txt
12-column grid

Left 7 columns:
large headline

Right 5 columns:
AI search module + minimal orbital diagram

Bottom:
1 / 3 / 7 day strip
```

Hero headline:

```txt
사기 전에,
며칠 써보기.
```

Supporting copy:

```txt
서울에서 마사지건, 홈케어 디바이스, 소형 운동기구를 1일, 3일, 7일 동안 빌려 써보세요.
```

Primary CTA:

```txt
며칠 써볼 물건 찾기
```

Secondary CTA:

```txt
내 물건 빌려주기
```

Visual rules:

- large black typography
- white background
- optional thin construction grid
- minimal orbit diagram
- no blue
- no gradients
- no colorful hero block

## 11.2 Matching Results

Goal:

Make comparison clear and editorial.

Structure:

```txt
Top:
search query + interpreted conditions

Filters:
1 day / 3 days / 7 days

Main:
3-column product grid on desktop
1-column list on mobile
```

Product card should show:

- category
- item name
- price
- duration
- pickup area
- trust summary
- request CTA

Avoid ecommerce clutter, colorful tags, star ratings, fake discount UI, and crowded metadata.

## 11.3 Product Detail / Trust Summary

Goal:

Make the user feel safe before requesting rental.

Structure:

```txt
Left 6 columns:
product image / wireframe / item information

Right 6 columns:
duration selector
price
trust summary
safety deposit copy
request CTA
```

Trust summary:

```txt
01 Recent code photo
02 Components checked
03 Private serial stored
04 Return before settlement
```

Primary CTA:

```txt
대여 요청하기
```

Supporting copy:

```txt
반납 확인 전까지 정산되지 않아요.
```

## 11.4 Seller AI Registration

Goal:

Make listing creation feel structured, not playful.

Structure:

```txt
Left 5 columns:
AI question / seller response / extracted fields

Right 7 columns:
listing preview

Bottom:
verification checklist
```

Replace chat bubbles with structured blocks.

Use today’s safety code:

```txt
TODAY'S SAFETY CODE
B-428

제품 옆에 이 코드를 두고 촬영해주세요.
```

## 11.5 Seller Dashboard

Goal:

Make dashboard feel like a minimal ledger.

Structure:

```txt
Top:
seller summary

Main:
large financial/stat numbers

Lower:
pending requests
return due
listed items
```

Use large numbers, thin lines, white cards, no colorful statuses, and no chart decorations.

Example:

```txt
₩184,000
monthly rental revenue

3
active rentals

1
return due today

98%
trust record
```

---

# 12. Product Logic Is Not Owned Here

> _Updated 2026-04-30: this section previously listed product decisions (region, fee model, payment, trust model, screens, scope exclusions). Those are **not** owned by the design-system document and were inconsistent with Direction v2. The full block has been replaced with the pointers below._

The design-system document **only** owns the visual system: palette, line hierarchy, typography, spacing, radius, layout philosophy, and component visual rules.

It does **not** own:

- **product logic and MVP scope** (5 screens, categories, durations, rental method, trust model) — see [`../CLAUDE.md`](../CLAUDE.md) "Current MVP Scope" and [`corent_context_note.md`](corent_context_note.md);
- **fee model** (3% + fixed transaction fee, pre-revenue beta = no fee) — see [`corent_product_direction_v2.md` §1](corent_product_direction_v2.md) and [`corent_legal_trust_architecture_note.md` §1](corent_legal_trust_architecture_note.md);
- **geography** (Korea-wide; Seoul is demo only) — see [`corent_product_direction_v2.md` §2](corent_product_direction_v2.md) and [`corent_legal_trust_architecture_note.md` §5](corent_legal_trust_architecture_note.md);
- **pre-revenue beta posture and runtime modes / feature flags** — see [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md);
- **legal / trust boundaries** (C2C marketplace, no wallet, partner-mediated payment, regulated-language ban) — see [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md);
- **security gate triggers** for real DB / auth / payment / file upload / location work — see [`corent_security_gate_note.md`](corent_security_gate_note.md).
- **route / product UX principles** (state clarity, trust transparency, motion posture, role-based flows) — see [`corent_ux_system_v1.md`](corent_ux_system_v1.md).

If a product, fee, geography, or scope decision appears to conflict with this document, **the documents above win**. Visual rules in this document remain authoritative for visual decisions only.

---

# 13. Implementation Notes for Claude Code

When updating an existing implementation:

1. Keep routes and mock data.
2. Replace previous blue design tokens.
3. Remove blue colors from Tailwind classes.
4. Remove gradient backgrounds.
5. Remove colored badges.
6. Remove excessive rounded corners.
7. Remove decorative shadows.
8. Convert chat bubbles into structured AI blocks.
9. Convert trust checkmarks into numbered trust rows.
10. Make product cards line-based and editorial.
11. Use black/white token classes consistently.
12. Run lint/build after changes.

---

# 14. Claude Code Revision Prompt

Use this prompt after placing this document at:

```txt
docs/corent_design_system_bw_v1.md
```

```txt
Read CLAUDE.md, docs/corent_mvp_design_system_v0.md, and docs/corent_design_system_bw_v1.md.

We need to revise the CoRent MVP visual direction.

Keep all product logic, routes, mock data, and MVP scope the same.

But replace the visual design system.

New design direction:
Black-and-white Swiss grid editorial interface.

Use only:
- #000000
- #FFFFFF
- black opacity values for borders, secondary text, disabled states

Do not use:
- blue
- accent colors
- gradients
- colorful badges
- soft SaaS styling
- decorative shadows
- excessive rounded corners

References:
1. Golden ratio construction grid
2. Celestial orbit diagram
3. Müller-Brockmann grid poster construction
4. Müller-Brockmann overlapping grid typography
5. Helvetica typography reference

Extract these principles:
- strict grid
- mathematical proportion
- visible structure
- line-based hierarchy
- Helvetica-first typography
- editorial composition
- generous whitespace
- black text on white surfaces
- dashed lines for pending/AI/inferred states
- solid lines for confirmed states

Update the design tokens:
Colors:
--black: #000000
--white: #FFFFFF
--ink-100: rgba(0,0,0,1)
--ink-80: rgba(0,0,0,0.8)
--ink-60: rgba(0,0,0,0.6)
--ink-40: rgba(0,0,0,0.4)
--ink-20: rgba(0,0,0,0.2)
--ink-12: rgba(0,0,0,0.12)
--ink-08: rgba(0,0,0,0.08)

Typography:
Use Helvetica, "Helvetica Neue", Arial, sans-serif.
Weights only: 400, 500, 700.
Use large typography as structure, not decoration.

Grid:
Desktop:
- max width 1200px
- 12 columns
- 24px gutters
- 64px outer margin

Wide:
- max width 1440px
- 12 columns
- 32px gutters
- 96px outer margin

Mobile:
- 4 columns
- 20px margin
- 16px gutter

Spacing:
Use only:
4, 8, 12, 16, 24, 32, 48, 64, 96, 128

Lines:
- thin line: 1px solid rgba(0,0,0,0.12)
- base line: 1px solid rgba(0,0,0,0.2)
- strong line: 1px solid #000
- dashed line: 1px dashed rgba(0,0,0,0.28)

Radius:
- core cards: 0px
- action/form elements: 0px or 8px
- pill buttons only may use 999px

Buttons:
- primary: black background, white text
- secondary: white background, black text, black opacity border
- no blue focus ring
- focus: 2px black outline with 2px offset

Cards:
- white background
- black opacity border
- no shadow
- no decorative background
- use 0 radius unless interaction demands 8px

Badges:
- black/white only
- filled black for confirmed/live
- outlined for neutral
- dashed outline for pending/AI/inferred

Screen changes:
1. Landing:
   - Make it feel like a Swiss poster layout.
   - Use a 12-column grid.
   - Large headline on the left.
   - AI search/orbit module on the right.
   - Add subtle construction grid lines only if they do not create noise.

2. Search results:
   - Make cards editorial and line-based.
   - Avoid marketplace clutter.
   - Use 3-column layout on desktop.

3. Product detail:
   - Make trust summary a numbered system:
     01 Recent code photo
     02 Components checked
     03 Private serial stored
     04 Return before settlement

4. Seller registration:
   - Avoid chat app bubbles.
   - Use structured AI question / seller response / extracted fields blocks.
   - Show listing preview on the right.

5. Dashboard:
   - Make it feel like a minimal ledger.
   - Use large numbers, lines, and quiet lists.
   - No colorful status labels.

Important:
Do not change the MVP business decisions.
Do not add new features.
Do not add external libraries.
Do not use colors beyond black and white.
Do not use random spacing.
Do not overdecorate.

After changes:
- run lint/build
- summarize changed files
- explain how the new visual system maps to the five references
```

---

# 15. Design Philosophy Summary

CoRent BW v1 should feel like:

> **a Swiss editorial trust interface for short-term product rental.**

The interface should not persuade with color. It should persuade with order.

The user should feel:

- the product is controlled
- the process is structured
- the trust flow is visible
- the platform is serious
- the system is calm enough to handle money, deposits, and personal property

The fewer colors, the more important structure becomes.

Therefore:

> **Grid is trust.  
> Typography is hierarchy.  
> Lines are state.  
> Whitespace is confidence.**

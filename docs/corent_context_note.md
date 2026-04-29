# CoRent Context Note

_Last updated: 2026-04-29_

> **Direction v2 alignment notice (2026-04-30):** the fee model, region, and pre-revenue posture sections in this note are partially aligned inline with [`corent_product_direction_v2.md`](corent_product_direction_v2.md), [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md), and [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md). **Where this note conflicts with the v2 documents, the v2 documents win.** Specific lines have been corrected below; older paragraphs may still describe the original framing for historical context.

## 0. Purpose

This note preserves the full product context behind CoRent so future work does not lose the original intent.

It combines:

- the original business idea
- the MVP decisions
- the trust and verification model
- the first implementation scope
- the black-and-white design direction
- the reference-based design logic
- the current Claude Code implementation status
- next steps for validation and iteration

Use this note when handing the project to Claude Code, Codex, collaborators, designers, or future versions of the product plan.

---

# 1. Original Idea

The original idea started from a simple personal observation:

Someone may own many products they like and collect, such as massage guns. They feel ownership and attachment, so they do not want to sell them permanently. But many of those products sit unused for long periods.

Instead of selling them, the owner could rent them out for a short period.

This creates value for both sides:

## For the owner / seller

- They already own products they care about.
- The products are idle most of the time.
- Selling the product feels too final.
- Short-term lending can generate income without giving up ownership.
- A collection of products can become a small rental storefront.

## For the borrower / consumer

- Buying expensive products upfront can feel risky.
- In-store testing is too short and unrealistic.
- A few days of real-life use is more valuable than a 30-second demo.
- Renting for 1 to 7 days can help them decide whether to buy.
- Some products are only needed temporarily.

The broader vision is:

> A C2C rental marketplace where people can borrow before buying, and owners can turn idle products into short-term rental income.

The closest metaphor is:

> Airbnb for personal products, but with AI-assisted seller onboarding and trust infrastructure.

---

# 2. Product Thesis

CoRent is not just a listing marketplace.

It is a trust system for short-term access to personal products.

The core thesis:

> People will borrow and lend personal products if the platform makes the transaction feel structured, safe, and simple.

The product has to solve three problems at once:

1. Discovery  
   Help borrowers find the right product for the right short-term need.

2. Seller enablement  
   Help owners turn their idle products into clean rental listings without writing complex product pages themselves.

3. Trust  
   Reduce fear around fraud, damage, non-return, false claims, payment, settlement, and unclear responsibility.

The product should hide operational complexity behind a simple interface.

The user should not have to understand every verification rule.

They should mostly see:

- 안전 확인
- 오늘 찍은 사진 확인
- 비공개 보관
- 반납 후 정산
- 대여 요청
- 안전 보증

Internally, the system may handle:

- verification rules
- safety code photo
- private serial storage
- deposit logic
- delayed settlement
- AI first check
- human final review
- dispute states
- payment states
- admin review

---

# 3. Product Name

Current temporary name:

> **CoRent**

This name can still change later, but it is now the working project name and repo identity.

---

# 4. Positioning

## 4.1 Consumer Main Positioning

Current primary positioning:

> **사기 전에, 며칠만 살아보기.**

Working English version:

> **Try it for a few days before you buy it.**

This positioning focuses on purchase-before-use behavior.

## 4.2 Seller Positioning

Seller-side positioning:

> **집에 잠든 물건을 작은 렌탈 사업장으로.**

Working English version:

> **Turn idle products into a small rental storefront.**

## 4.3 Why Both Matter

The product is two-sided.

Consumer demand comes from:

- purchase hesitation
- temporary need
- desire for real-life trial

Seller supply comes from:

- idle personal products
- collection behavior
- unwillingness to sell
- desire for small income

The MVP currently leads with the consumer message but keeps the seller business-storefront idea visible.

---

# 5. MVP Scope

The MVP is not a full public launch.

It is a fast validation prototype.

The first MVP should answer:

1. Do people want to borrow products for 1, 3, or 7 days?
2. Do people want to list idle products for rental income?
3. Can trust-heavy C2C rental be made simple through interface design?
4. Can AI help structure product listing and pricing?
5. Does the product feel reliable enough to continue?

## 5.1 Initial Region

> **Korea-wide product direction. Seoul is a demo/test assumption, not a product constraint.**

The real first operation may still launch in specific Seoul neighborhoods for logistical reasons, and seed/demo data may continue to use Seoul examples. The earlier "Seoul beta" framing as a product constraint is **superseded** — see [`corent_product_direction_v2.md` §2](corent_product_direction_v2.md) and [`corent_legal_trust_architecture_note.md` §5](corent_legal_trust_architecture_note.md). Location-based matching / GPS is gated on a location-information compliance review and is not in MVP scope.

## 5.2 Initial Categories

Start with:

- Massage guns
- Home-care devices
- Small exercise equipment

Do not start with all categories.

Future expansion candidates:

- vacuum cleaners
- projectors
- camping gear
- camera equipment
- platform pickup/delivery categories

## 5.3 Rental Method

Initial MVP:

> **Direct pickup and return only**

Important:

Direct pickup does not mean in-person payment.

Payment should happen inside the platform before pickup confirmation.

Why:

- prevents awkward cash negotiation
- creates proof of transaction
- enables safety deposit logic
- supports delayed settlement
- makes the platform feel trustworthy

Future roadmap:

1. Direct pickup
2. Courier delivery
3. Platform-managed pickup/delivery

## 5.4 Rental Duration

Use only three options:

- 1 day
- 3 days
- 7 days

Default recommendation:

> **3 days**

Rationale:

- 1 day is useful for urgent trial
- 3 days is best for purchase-before-use
- 7 days is good for deeper trial

Do not support arbitrary date ranges in the first MVP.

## 5.5 Pricing

Pricing model:

1. Platform baseline rate
2. Similar product average
3. AI-recommended price
4. Seller final decision

Suggested baseline:

| Duration | Approximate Rate |
|---|---:|
| 1 day | 3.5% of product value |
| 3 days | 8% of product value |
| 7 days | 15% of product value |

The product can label this as:

> AI 추천 가격

But the seller decides the final price.

## 5.6 Fee Model

> _Updated 2026-04-30: the previous "10% of rental fee" framing is **superseded** by Direction v2._

**Pre-revenue beta (until 2026-07-13 + readiness):** no fee is collected, displayed as charged, or executed. See [`corent_pre_revenue_beta_plan.md` §1](corent_pre_revenue_beta_plan.md).

**Future target:** 3% of rental fee + fixed transaction fee (TBD). Positioned as platform / safe-transaction infrastructure, not marketplace rake. See [`corent_product_direction_v2.md` §1](corent_product_direction_v2.md) and [`corent_legal_trust_architecture_note.md` §1](corent_legal_trust_architecture_note.md).

Lender-facing copy guidance is in the legal/trust note §1. Do **not** use "수수료 10%" or any rake-style language. Acceptable phrases include "서비스 이용료", "안전거래 수수료", "거래 보호 수수료", "platform service fee", "safe-transaction fee".

## 5.7 Payment

Target payment system:

> **Toss Payments**

Stripe is not the target because the product is being built for Korea.

Initial implementation:

- Toss Payments-ready architecture
- placeholder/mock payment states
- no real Toss integration yet

Recommended payment states:

1. Requested
2. Approved by seller
3. Payment pending
4. Paid
5. Pickup confirmed
6. Return pending
7. Return confirmed
8. Settlement ready
9. Settled
10. Disputed

## 5.8 Safety Deposit / Trust Structure

Use the concept:

> **양방향 안전 보증**

The borrower may pay a refundable safety deposit.

Initial borrower-side tiers:

| Product Estimated Value | Borrower Safety Deposit |
|---|---:|
| Under ₩100,000 | ₩0 |
| ₩100,000–₩300,000 | ₩30,000 |
| ₩300,000–₩700,000 | ₩70,000 |
| Over ₩700,000 | Excluded from MVP |

Seller-side trust responsibility is handled through:

- identity verification
- item verification
- delayed settlement
- cancellation/false-claim policy
- review impact
- admin review
- future seller-side deposit for high-risk categories if needed

Use simple copy:

- 안전 보증
- 반납 후 돌려받아요
- 정산은 반납 확인 후 진행돼요
- 서로 안심하고 거래하기 위한 장치예요

---

# 6. Trust System

The trust system is the core of CoRent.

The first MVP should use:

> **AI first check + human final review**

This is not fully automated.

## 6.1 Required Seller Listing Checks

- Product front photo
- Product back photo
- Accessories/components photo
- Working proof photo or short video
- Purchase time or estimated age
- Product condition
- Existing scratches or defects
- Optional private serial number
- Today’s safety code photo

## 6.2 Today’s Safety Code

Use today’s safety code method to verify freshness.

User-facing copy:

> 오늘 찍은 사진인지 확인할게요.  
> 아래 코드를 제품 옆에 두고 촬영해주세요.

Example:

> 오늘의 안전 코드: B-428

Purpose:

- simple freshness check
- reduces reused old photos
- avoids complex computer vision for v0
- builds visible trust

## 6.3 Serial Number Policy

Use:

> **Private storage + dispute-only/internal use**

Rules:

- Serial number is never displayed publicly.
- It is optional in MVP.
- It is used for internal verification.
- It may be used during dispute review.
- It should be labeled as private information.

UI copy:

> 비공개 보관 정보  
> 다른 사용자에게 보이지 않아요.

## 6.4 Trust Summary Pattern

Trust summary should be displayed as a numbered system:

```txt
01 Recent code photo
02 Components checked
03 Private serial stored
04 Return before settlement
```

Do not use colorful check icons.

Use lines, numbers, and clear text.

---

# 7. AI Role

AI is not decoration.

AI should structure complex user intent and reduce effort.

## 7.1 Consumer AI

The consumer experience should combine category selection and AI search.

Opening prompt:

> 무엇을 며칠 써보고 싶나요?

Example inputs:

- 마사지건 3일
- 홈케어 기기
- 소형 운동기구
- 구매 전 체험
- 서울 직거래

AI should convert natural language into structured filters:

- category
- duration
- region
- price range
- safety deposit preference
- pickup availability

## 7.2 Seller AI

Seller registration should use:

> **AI chat + structured form**

Not chat-only.  
Not form-only.

Flow:

1. AI asks simple questions.
2. Seller answers naturally.
3. System extracts structured fields.
4. Listing preview is generated.
5. Seller edits final details.
6. Human/admin final review happens before listing goes live.

AI should help with:

- listing title
- category
- condition summary
- component checklist
- rental duration options
- AI-recommended price
- safety code guidance
- trust summary copy

## 7.3 AI Interface Style

After the BW design revision, AI should not look like a casual chat app.

Avoid:

- round bubbly chat UI
- colorful assistant avatars
- playful bot styling
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

---

# 8. First 5 Screens

The MVP is currently limited to 5 routes/screens.

## 8.1 Landing / AI Search

Purpose:

- communicate the main idea
- introduce CoRent as a Korea-wide pre-revenue beta (see `corent_pre_revenue_beta_plan.md`; Seoul is demo data only, not a product constraint)
- show purchase-before-use positioning
- provide AI search entry
- show the trust/matching diagram language

Core content:

- headline: 사기 전에, 며칠만 살아보기.
- supporting copy framing CoRent as a Korea-wide short-term rental product (Seoul examples in seed data are illustrative only)
- primary CTA: 며칠 써볼 물건 찾기
- secondary CTA: 내 물건 빌려주기
- AI search/orbit module

## 8.2 Matching Results

Purpose:

- show AI-interpreted search conditions
- compare available products
- keep cards editorial and uncluttered

Must show:

- search query
- parsed conditions
- duration tabs
- 3-column product grid on desktop
- product name
- price
- duration
- pickup area
- safety/trust summary

## 8.3 Product Detail / Trust Summary

Purpose:

- make the user feel safe before requesting a rental

Must show:

- product information
- duration selector
- price
- trust summary
- safety deposit copy
- request CTA
- safety code / verification explanation

Trust pattern:

```txt
01 Recent code photo
02 Components checked
03 Private serial stored
04 Return before settlement
```

## 8.4 Seller AI Registration

Purpose:

- help a seller create a rental listing without writing everything manually

Must show:

- structured AI question/response/extracted fields
- listing preview
- AI price recommendation
- safety code card
- verification checklist
- private serial number explanation

## 8.5 Seller Dashboard

Purpose:

- make the seller feel they have a small rental business dashboard

Must show:

- monthly rental revenue
- active rentals
- return due
- trust record
- pending requests
- active rentals
- listed items
- settlement/review-related states

Visual metaphor:

> a minimal ledger

---

# 9. Design Direction

The design direction changed from a blue premium fintech-like system to a black-and-white Swiss grid editorial system.

## 9.1 Current Design Thesis

> **CoRent is a Swiss editorial trust interface for short-term product rental.**

The interface should not persuade with color.

It should persuade with order.

## 9.2 Core Design Keywords

- black and white
- Helvetica
- strict grid
- editorial composition
- mathematical proportion
- visible structure
- line-based hierarchy
- calm whitespace
- no decorative color
- no gradients
- no colorful badges
- no soft SaaS aesthetic
- no excessive rounded corners

## 9.3 References

The current visual system is based on five references:

1. Golden ratio construction grid
2. Celestial/orbital diagram
3. Müller-Brockmann grid poster construction
4. Müller-Brockmann overlapping grid typography
5. Helvetica typographic reference

## 9.4 Design Principles Extracted

### Golden ratio / construction grid

- Use proportion before decoration.
- Use 7/5, 6/6, 5/7, 4/8, or similar grid splits.
- Let empty space feel intentional.

### Celestial/orbit diagram

- Use circles, arcs, nodes, solid lines, dashed lines.
- Solid = confirmed.
- Dashed = pending, inferred, AI-generated, or suggested.

### Müller-Brockmann grid

- Build the grid first.
- Place information on the grid.
- Structure creates confidence.
- Whitespace is material.

### Overlapping typography

- Typography can become the graphic.
- Large type is allowed when the grid is strong.
- Use restraint in functional screens.

### Helvetica

- Helvetica is the identity.
- Use only 400, 500, 700.
- Use type, lines, and spacing instead of decoration.

---

# 10. Design Tokens

## 10.1 Colors

Only use:

```css
--black: #000000;
--white: #FFFFFF;
```

Permitted opacity values:

```css
--ink-100: rgba(0,0,0,1);
--ink-80: rgba(0,0,0,0.8);
--ink-60: rgba(0,0,0,0.6);
--ink-40: rgba(0,0,0,0.4);
--ink-20: rgba(0,0,0,0.2);
--ink-12: rgba(0,0,0,0.12);
--ink-08: rgba(0,0,0,0.08);
```

Do not use:

- blue
- green
- red
- yellow
- gradients
- random grayscale hex colors

## 10.2 Typography

Font stack:

```css
font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
```

Weights:

- 400
- 500
- 700

Type scale:

```css
--type-display: 80px;
--type-h1: 56px;
--type-h2: 40px;
--type-h3: 28px;
--type-title: 20px;
--type-body: 16px;
--type-small: 13px;
--type-caption: 11px;
```

## 10.3 Spacing

Allowed tokens:

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

## 10.4 Grid

Desktop:

```txt
max-width: 1200px
12 columns
24px gutter
64px outer margin
```

Wide:

```txt
max-width: 1440px
12 columns
32px gutter
96px outer margin
```

Mobile:

```txt
4 columns
20px margin
16px gutter
```

Dashboard:

```txt
max-width: 1280px
12 columns
24px gutter
64px outer margin
```

## 10.5 Lines

```css
--line-thin: 1px solid rgba(0,0,0,0.12);
--line-base: 1px solid rgba(0,0,0,0.2);
--line-strong: 1px solid #000000;
--line-dashed: 1px dashed rgba(0,0,0,0.28);
```

Meaning:

- thin solid = secondary structure
- base solid = normal boundary
- strong solid = selected or confirmed
- dashed = pending, AI-inferred, suggested, incomplete

## 10.6 Radius

```css
--radius-none: 0px;
--radius-small: 8px;
--radius-pill: 999px;
```

Rules:

- core cards: 0px
- inputs: 0px or 8px
- buttons: 999px or 0px
- badges: 999px
- product cards: 0px

## 10.7 Shadows

Default:

> no shadows

Allowed only for rare active overlay or modal focus states.

---

# 11. Current Claude Code Implementation Status

The latest Claude Code revision reports:

## 11.1 Build / Lint

- Build passes.
- All 13 routes are static-generated.
- Lint is clean across `src/`.
- Only pre-existing issue is `docs/eslint.config.mjs`, which is a design document misnamed as `.mjs`. It was left untouched.

## 11.2 Tokens and Layout

`src/app/globals.css` was updated to:

- remove blue/air palette
- remove 20px radius default
- remove radial gradient
- add BW tokens
- add `--ink-*` opacity ladder
- add `--line-*` solid/dashed tokens
- add 0px default radius
- add Helvetica type scale:
  - Display 80
  - H1 56
  - H2 40
  - H3 28
  - Title 20
  - Body 16
  - Small 13
  - Caption 11
- add 1200px main container
- add 1280px dashboard container
- add `.grid-12` utility:
  - 24px gutter desktop
  - 16px mobile
  - 32px wide

## 11.3 Component Updates

Updated components include:

- Button
- Card
- Input
- PageShell
- SectionHeader
- ProductCard
- TrustSummary
- DurationSelector
- SafetyCodeCard
- SellerDashboardStat
- AIChatPanel

Important implementation changes:

- Button now uses black/white only.
- Card supports thin/base/strong/dashed border variants.
- Input uses 56px height and black focus outline.
- PageShell uses black hairline header/footer.
- ProductCard is line-based with large initials and ledger pricing.
- TrustSummary uses numbered 01–04 rows.
- DurationSelector uses contiguous radio cells and black selected fill.
- SafetyCodeCard uses Display-size safety code and dashed pending state.
- AIChatPanel removed bubbles and uses structured rows.

## 11.4 Page Updates

Routes preserve mock data and MVP scope.

### `/`

Landing page:

- Swiss poster-style direction
- 7/5 hero split
- large type
- OrbitDiagram SVG
- no gradient
- no blue

### `/search`

Search results:

- 7/5 split header
- parsed condition mini-table
- duration tabs
- 3-column editorial product cards
- hairline structure

### `/items/[id]`

Product detail:

- 6/6 hero split
- large display initials in frame
- right column with duration selector, meta, and CTA
- trust and safety code section below
- 7/5 split for trust section

### `/sell`

Seller registration:

- 5-column structured conversation log
- 7-column extracted fields table + listing preview
- AI price band
- SafetyCodeCard with dashed pending state
- numbered verification checklist

### `/dashboard`

Seller dashboard:

- top label strip
- ledger-style stat row
- large h2 numbers in contiguous cells
- pending requests and active rentals as numbered rows
- listed items as hairline table
- status uses filled / dashed / outline badges

## 11.5 Reference Mapping

Claude Code mapped the implementation to references as follows:

1. Golden ratio construction grid  
   7/5, 6/6, 5/7, and 4/8 splits.

2. Celestial/orbit diagram  
   Landing includes OrbitDiagram SVG with dashed and solid orbit lines.

3. Müller-Brockmann poster construction  
   12-column grid, caption labels, structural spacing, visible layout logic.

4. Overlapping typographic grid  
   Landing uses large display headline; large numerals act as graphic elements.

5. Helvetica reference  
   Single Helvetica stack, 400/500/700 weights, no icons, no decorative borders.

---

# 12. What Is Still Mocked

The current MVP intentionally mocks:

- payment
- AI calls
- auth
- image uploads
- serial number storage
- dashboard data
- seller verification backend
- admin review
- Toss Payments integration
- real database
- settlement logic
- dispute process

This is correct for the current milestone.

---

# 13. Recommended Next Steps

## 13.1 Immediate Visual Review

Review the current UI for:

- Does it feel too poster-like or still usable?
- Does the lack of color make the CTA clear enough?
- Are the product cards readable?
- Is the orbital diagram subtle or distracting?
- Is the dashboard too dense?
- Does the seller flow feel structured rather than conversational?
- Are line weights consistent?
- Are there any remaining blue/gray hex values?
- Does mobile still work?

## 13.2 Codex Polish Pass

Use Codex next for UI refinement.

Suggested Codex tasks:

- tighten responsive behavior
- tune line weights
- refine landing hero composition
- improve product card rhythm
- polish dashboard table density
- check all spacing tokens
- remove any accidental one-off styles
- adjust typography scale if Korean text feels too large
- verify CTA hierarchy in monochrome

## 13.3 Claude Code Structural Pass

After Codex polish, use Claude Code again for:

- cleanup
- component consistency
- route stability
- mock data organization
- preparation for interactive MVP

## 13.4 Milestone 2 — Interactive MVP

Build next:

- duration selection state
- AI search mock parser
- seller registration form state
- safety code generation
- listing preview state
- request state
- local mock persistence if needed

## 13.5 Milestone 3 — Concierge MVP

Build next:

- simple database
- listing submission
- request submission
- admin review state
- manual approval flow
- Toss Payments test or payment-link placeholder
- direct pickup state
- return confirmation state

---

# 14. Principles To Preserve

## 14.1 Simplicity Is Trust

Users should not see all the operational complexity.

They should see simple, clear states.

## 14.2 AI Structures The Experience

AI should help users move from natural language to structured decisions.

AI should not be a visual gimmick.

## 14.3 Design Consistency Equals Trust

Do not randomly change:

- border radius
- spacing
- line weight
- badge style
- font size
- button style
- card structure
- page width

## 14.4 Grid Is Trust

In the current visual system:

> Grid is trust.  
> Typography is hierarchy.  
> Lines are state.  
> Whitespace is confidence.

## 14.5 The MVP Should Stay Small

Do not overbuild:

- insurance
- delivery logistics
- full tax automation
- real escrow
- full dispute automation
- all product categories
- full user ranking
- complex recommender systems

Build enough to test:

- demand
- trust
- seller willingness
- clarity of the flow
- willingness to pay
- willingness to list

---

# 15. Current Working Strategy

The current workflow is:

```txt
Claude Code
→ project structure, routes, tokens, core components

Codex
→ UI polish, responsive refinement, visual iteration

Claude Code
→ integration, cleanup, interaction/state buildout
```

Do not use Codex to redefine product scope.

Use Codex to refine execution.

Do not use Claude Code to overbuild features.

Use Claude Code to maintain structure and correctness.

---

# 16. Short One-Paragraph Context

CoRent is a Korea-wide AI rental/sharing MVP that lets people borrow products before buying them and lets owners turn idle products into short-term rental income. The first MVP focuses only on massage guns, home-care devices, and small exercise equipment, with 1-day, 3-day, and 7-day rentals, direct pickup/return, and a Toss Payments-ready architecture wired only behind a `mockPaymentAdapter` during the pre-revenue beta window (see `corent_pre_revenue_beta_plan.md`). Today's safety code photo, private serial number storage, AI first check, and human final review remain part of the trust model; settlement happens after return confirmation. The product should feel like a black-and-white Swiss editorial trust system: Helvetica, strict grid, line-based hierarchy, mathematical proportion, generous whitespace, no color, no gradients, and no noisy marketplace styling — but the current UI is a demoable foundation only, with a flow-first redesign queued (`corent_product_direction_v2.md`). The fee model targets 3% + fixed transaction fee post-launch (`corent_legal_trust_architecture_note.md`); no fee is collected during pre-revenue beta. Seoul examples in seed data are illustrative only — the product direction is Korea-wide.

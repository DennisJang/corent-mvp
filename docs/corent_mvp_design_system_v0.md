# CoRent MVP + Design System v0

_Last updated: 2026-04-29_

## 0. Decision

CoRent should move directly into **Claude Code** after this document.

Do **not** spend another long round in a web chat before implementation. The MVP scope, product logic, trust model, and visual system are now defined enough to create the first usable prototype.

Use the web interface later only for:
- product critique after the first working build
- legal/terms wording refinement
- conversion copy refinement
- investor/demo narrative

Use Claude Code now for:
- Next.js app structure
- screen implementation
- component system
- design token setup
- MVP data model
- trust-check flow
- Toss Payments placeholder integration

---

# 1. Product Summary

## Product Name

**CoRent**

## Product Type

A Seoul-based AI rental/sharing MVP for short-term borrowing and lending of personal items.

## Core Concept

CoRent helps people borrow expensive or rarely used items for a short period before buying, while helping owners turn idle products into small rental income.

## Main Consumer Positioning

> **사기 전에, 며칠만 살아보기.**

English working version:

> **Try it for a few days before you buy it.**

## Seller Positioning

> **집에 잠든 물건을 작은 렌탈 사업장으로.**

English working version:

> **Turn idle products into a small rental storefront.**

## MVP Goal

The MVP is not a full public launch.  
It is a fast validation prototype to answer:

1. Do people want to borrow personal products for 1, 3, or 7 days?
2. Do people want to lend idle products for money?
3. Can a complex trust process be made simple through AI-assisted UX?
4. Does the service feel trustworthy enough to continue toward a real launch?

---

# 2. Locked MVP Decisions

## 2.1 Initial Category

Start with:

- Massage guns
- Home-care devices
- Small exercise equipment

Do not start with all categories.

Future expansion candidates:

- Vacuum cleaners
- Projectors
- Camping gear
- Camera equipment
- Platform pickup/delivery categories

## 2.2 Initial Region

Start with:

> **Seoul beta**

The first real operation can be limited to specific Seoul neighborhoods, but the product copy can say Seoul beta.

## 2.3 Rental Method

Initial MVP:

> **Direct pickup and return only**

This means users meet to hand off and return the item.

Important:

> **Direct pickup does not mean in-person payment.**

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

## 2.4 Rental Duration

Use only three options:

- 1 day
- 3 days
- 7 days

Default recommended duration:

> **3 days**

Reason:
- 1 day is good for urgent trial
- 3 days is the best purchase-before-use period
- 7 days is good for deeper trial

Do not support arbitrary date ranges in the first MVP.

## 2.5 Pricing

Pricing is based on:

1. Platform baseline rate
2. Average pricing of similar items
3. AI-recommended price
4. Seller final decision

The system should present pricing as:

> **AI 추천 가격**

But internally the first version can use a simple formula.

Example logic:

```ts
recommendedPrice = productEstimatedValue * categoryRate * durationMultiplier
```

Suggested initial baseline:

| Duration | Approx. Rate |
|---|---:|
| 1 day | 3.5% of product value |
| 3 days | 8% of product value |
| 7 days | 15% of product value |

The seller can adjust the final price.

## 2.6 Commission

Platform commission:

> **10% of rental fee**

Do not use 15% in the MVP.

Copy:

> 대여가 끝나고 반납이 확인되면, 수수료 10%를 제외한 금액이 정산돼요.

## 2.7 Payment

Use:

> **Toss Payments**

Stripe is not the target for Korea.

Initial technical implementation:

- Create Toss Payments-ready architecture.
- Use placeholder/mock payment flow first if needed.
- Later connect actual Toss Payments test keys.
- Do not design around cash payment.

Recommended MVP payment states:

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

## 2.8 Safety Deposit / Trust Structure

The deposit model should not feel like only one side is burdened.

Use the language:

> **양방향 안전 보증**

But internally separate responsibilities.

### Borrower side

The borrower may pay a refundable safety deposit.

Possible initial tiers:

| Product Estimated Value | Borrower Safety Deposit |
|---|---:|
| Under ₩100,000 | ₩0 |
| ₩100,000–₩300,000 | ₩30,000 |
| ₩300,000–₩700,000 | ₩70,000 |
| Over ₩700,000 | Excluded from MVP |

### Seller side

The seller does not necessarily pay the same deposit in v0.  
Instead, seller trust responsibility is handled through:

- identity verification
- private item verification
- delayed settlement
- cancellation/false-claim penalty policy
- review impact
- admin review
- possible future seller-side deposit for high-risk categories

### UI language

Use simple user-facing language:

- **안전 보증**
- **반납 후 돌려받아요**
- **정산은 반납 확인 후 진행돼요**
- **서로 안심하고 거래하기 위한 장치예요**

Avoid legalistic or intimidating wording in main UI.

## 2.9 Trust Verification

Use:

> **AI first check + human final review**

This is not fully automated at MVP.

Required seller listing checks:

- Product front photo
- Product back photo
- Accessories/components photo
- Working proof photo or short video
- Purchase time or estimated age
- Product condition
- Existing scratches or defects
- Optional private serial number
- Today’s safety code photo

## 2.10 Recent Photo Verification

Use today’s safety code method.

User-facing copy:

> **오늘 찍은 사진인지 확인할게요.**  
> 아래 코드를 제품 옆에 두고 촬영해주세요.

Example:

> 오늘의 안전 코드: **B-428**

Required behavior:

- Generate a short safety code.
- Ask seller to include the code physically beside the item.
- Use this as a lightweight freshness check.
- Store verification state.

This creates trust without complex computer vision in v0.

## 2.11 Serial Number Policy

Use:

> **Private storage + dispute-only/internal use**

Policy:

- Serial number is never displayed publicly.
- It is optional in MVP.
- It is used for internal verification.
- It may be used during dispute review.
- It should be labeled as private information.

UI copy:

> **비공개 보관 정보**  
> 다른 사용자에게 보이지 않아요.

## 2.12 Seller Registration UX

Use:

> **AI chat + structured form**

Do not use only chat.  
Do not use only a traditional form.

Flow:

1. AI asks simple questions.
2. Seller answers naturally.
3. System extracts structured fields.
4. A listing preview is generated.
5. Seller edits final details in a clean form.
6. Human/admin final review happens before listing goes live.

## 2.13 Consumer Search UX

Use:

> **Category selection + AI search**

The first screen should ask:

> 무엇을 며칠 써보고 싶나요?

Example chips:

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

## 2.14 MVP Screen Count

Build 5 screens first:

1. Landing / AI search
2. Matching results
3. Product detail / trust summary
4. Seller AI registration
5. Seller dashboard

Do not implement the full app yet.

Secondary screens can be mocked or added later:

- payment page
- pickup confirmation
- return check
- dispute review
- admin console

---

# 3. CoRent MVP Information Architecture

## 3.1 Routes

Suggested Next.js routes:

```txt
/
  Landing + AI search entry

/search
  Matching results

/items/[id]
  Product detail + trust summary + rental request

/sell
  AI seller registration + structured form

/dashboard
  Seller dashboard

/request/[id]
  Optional rental request state page

/admin
  Optional internal review placeholder
```

## 3.2 Primary User Flows

### Consumer Flow

```txt
Landing
→ AI search
→ Matching results
→ Product detail
→ Rental duration selection
→ Safety summary
→ Rental request
→ Seller approval
→ Toss Payments
→ Direct pickup
→ Return
→ Deposit release / settlement
```

### Seller Flow

```txt
Sell page
→ AI onboarding
→ Product details extracted
→ Price recommendation
→ Safety code photo upload
→ Private serial number optional
→ Listing preview
→ Human review
→ Listing live
→ Rental request received
→ Approve/decline
→ Pickup
→ Return check
→ Settlement
```

---

# 4. Design Direction

## 4.1 Visual Goal

The UI must feel:

- trustworthy
- minimal
- spacious
- calm
- premium
- consistent
- highly structured
- easy to scan
- not decorative
- not noisy

The interface should feel like:

- Apple-level restraint
- Stripe-level trust
- Shopify Polaris-level system clarity
- IBM Carbon-level grid discipline
- Airbnb-level unified product language

Do not make it look like a noisy marketplace.

This is not a cheap rental app.  
It should feel like a calm trust system.

---

# 5. Design Tokens

## 5.1 Color Tokens

Use only this palette.

```css
:root {
  --color-ink: #111827;
  --color-primary: #2B59C3;
  --color-accent: #5BC0EB;
  --color-air: #F3F8FF;
  --color-white: #FFFFFF;
}
```

## 5.2 Color Ratio

Approximate visual ratio:

| Color | Usage Ratio |
|---|---:|
| White / Air Surface | 75% |
| Ink | 15% |
| Primary Trust Blue | 7% |
| Accent Clarity Blue | 3% |

## 5.3 Semantic Color Usage

```css
:root {
  --surface-page: #F3F8FF;
  --surface-card: #FFFFFF;
  --surface-subtle: #F3F8FF;

  --text-primary: #111827;
  --text-secondary: rgba(17, 24, 39, 0.68);
  --text-tertiary: rgba(17, 24, 39, 0.48);

  --border-subtle: rgba(17, 24, 39, 0.10);
  --border-strong: rgba(17, 24, 39, 0.18);

  --action-primary: #2B59C3;
  --action-primary-hover: #234AA6;
  --action-accent: #5BC0EB;

  --focus-ring: 0 0 0 4px rgba(43, 89, 195, 0.14);
}
```

Do not introduce red, green, yellow, purple, orange, or gray palettes in core UI.  
If a status is needed, use text + border + blue tone instead of multiple status colors.

---

# 6. Typography System

## 6.1 Font

Use Helvetica as the primary font.

```css
font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
```

## 6.2 Font Weights

Use only:

- 400
- 500
- 700

Do not overuse bold.  
Use spacing, size, and placement for hierarchy.

## 6.3 Type Tokens

```css
.text-display {
  font-size: 64px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.text-h1 {
  font-size: 48px;
  line-height: 1.12;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.text-h2 {
  font-size: 36px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.text-h3 {
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.text-title {
  font-size: 22px;
  line-height: 1.25;
  font-weight: 500;
}

.text-body-large {
  font-size: 18px;
  line-height: 1.55;
  font-weight: 400;
}

.text-body {
  font-size: 16px;
  line-height: 1.55;
  font-weight: 400;
}

.text-body-small {
  font-size: 14px;
  line-height: 1.45;
  font-weight: 400;
}

.text-caption {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.01em;
}
```

Note: The user provided H3 weight 600 or 700, but the system only permits 400, 500, 700.  
Therefore, use 700 for H3 and 500 for Title.

---

# 7. Spacing System

Use only these spacing tokens:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;
  --space-32: 128px;
}
```

Do not use random spacing values.

## 7.1 Spacing Rules

| Use Case | Spacing |
|---|---:|
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

Note: Mobile padding is 20px, which is not in the spacing token list.  
Treat mobile page padding as a layout exception because it was explicitly specified.

## 7.2 Why This Spacing Works

CoRent is a trust-based product.  
Trust is created through clarity, not density.

Large section spacing makes the service feel calm and premium.  
Strict card gaps make the UI easy to scan.  
Limited spacing tokens prevent visual drift across screens.

---

# 8. Layout Rules

## 8.1 General Layout

- Use generous whitespace.
- Do not fill empty space just because it exists.
- Every screen should have one primary action.
- Use a clear hierarchy:
  1. Page title
  2. Supporting text
  3. Primary action
  4. Secondary content
- Keep body text width under 640px.
- Keep hero text width under 720px.
- Main desktop content width: around 1120px.
- Dashboard/admin max width: 1280px.
- Align content to a consistent grid.
- Avoid random spacing values.
- Avoid one-off component styles.

## 8.2 Page Container

```css
.container-main {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding-left: 64px;
  padding-right: 64px;
}

.container-dashboard {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding-left: 64px;
  padding-right: 64px;
}
```

Responsive:

```css
@media (max-width: 767px) {
  .container-main,
  .container-dashboard {
    padding-left: 20px;
    padding-right: 20px;
  }
}

@media (min-width: 768px) and (max-width: 1199px) {
  .container-main,
  .container-dashboard {
    padding-left: 32px;
    padding-right: 32px;
  }
}

@media (min-width: 1440px) {
  .container-main,
  .container-dashboard {
    padding-left: 96px;
    padding-right: 96px;
  }
}
```

---

# 9. Component Rules

## 9.1 Cards

Cards should use:

- background: `#FFFFFF` or `#F3F8FF`
- border: `rgba(17, 24, 39, 0.10)`
- border radius: `20px`
- padding: `24px` or `32px`
- prefer borders over shadows

```css
.card {
  background: #FFFFFF;
  border: 1px solid rgba(17, 24, 39, 0.10);
  border-radius: 20px;
  padding: 24px;
}
```

Use shadows only for:

- focused elements
- active overlays
- elevated hero preview
- modal surfaces

## 9.2 Buttons

Primary button:

```css
.button-primary {
  height: 56px;
  padding: 0 24px;
  border-radius: 999px;
  background: #2B59C3;
  color: #FFFFFF;
  font-size: 16px;
  line-height: 1;
  font-weight: 500;
}

.button-primary:hover {
  background: #234AA6;
}

.button-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(43, 89, 195, 0.14);
}
```

Secondary button:

```css
.button-secondary {
  height: 56px;
  padding: 0 24px;
  border-radius: 999px;
  background: #FFFFFF;
  color: #111827;
  border: 1px solid rgba(17, 24, 39, 0.10);
  font-size: 16px;
  font-weight: 500;
}
```

Contextual buttons inside forms can use 12px radius.

## 9.3 Inputs

```css
.input {
  height: 52px;
  border-radius: 12px;
  border: 1px solid rgba(17, 24, 39, 0.10);
  background: #FFFFFF;
  padding: 0 16px;
  font-size: 16px;
  font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
}

.input:focus {
  outline: none;
  border-color: #2B59C3;
  box-shadow: 0 0 0 4px rgba(43, 89, 195, 0.14);
}
```

## 9.4 Pills / Badges

Badges should be functional, not decorative.

Use for:

- rental status
- safety check state
- Seoul beta
- 1일 / 3일 / 7일
- AI recommended

Do not create many badge colors.

```css
.badge {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #F3F8FF;
  color: #2B59C3;
  border: 1px solid rgba(43, 89, 195, 0.18);
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0.01em;
}
```

## 9.5 Modals

```css
.modal {
  border-radius: 28px;
  background: #FFFFFF;
  border: 1px solid rgba(17, 24, 39, 0.10);
  padding: 32px;
}
```

## 9.6 List Items

```css
.list-item {
  min-height: 64px;
  padding: 16px 0;
  display: flex;
  align-items: center;
  gap: 16px;
}
```

---

# 10. Interaction States

## 10.1 Primary Action

- default: `#2B59C3`
- hover: `#234AA6`
- focus ring: `0 0 0 4px rgba(43, 89, 195, 0.14)`

## 10.2 Selected State

Use:

- primary blue border
- soft blue background
- clear text label

```css
.selected {
  background: rgba(43, 89, 195, 0.08);
  border-color: #2B59C3;
}
```

## 10.3 Gradients

Do not use loud gradients for core UI.

Allowed:

- subtle hero background
- soft decorative area
- very low contrast blue-to-white wash

Do not use gradients in cards, buttons, or status elements.

---

# 11. Screen-Level Design Direction

## 11.1 Landing / AI Search

Goal:

Make the user immediately understand:

> I can borrow before buying.

Structure:

1. Header
2. Hero label: Seoul beta / AI rental
3. Display headline
4. Supporting body text
5. One primary CTA
6. Secondary seller CTA
7. AI search module preview

Primary action:

> 며칠 써볼 물건 찾기

Secondary action:

> 내 물건 빌려주기

Hero headline:

> 사기 전에,  
> 며칠만 살아보기.

Supporting copy:

> 마사지건, 홈케어 디바이스, 소형 운동기구를 서울에서 1일, 3일, 7일 동안 빌려 써보세요.

## 11.2 Matching Results

Goal:

Make results easy to compare.

Result card should show:

- item name
- category
- rental price
- 1/3/7 day options
- pickup area
- safety summary
- seller trust note
- primary action

Avoid crowded cards.

## 11.3 Product Detail / Trust Summary

Goal:

Make the user feel safe before requesting rental.

Sections:

1. Product hero
2. Price and duration selector
3. Safety summary
4. Seller profile
5. Pickup method
6. Deposit explanation
7. Request CTA

Primary action:

> 대여 요청하기

Trust copy:

> 이 물건은 최근 사진, 구성품, 작동 상태를 확인한 뒤 등록됩니다.

## 11.4 Seller AI Registration

Goal:

Make listing creation feel effortless.

Layout:

- Left: AI chat
- Right: structured listing preview
- Bottom/right: next action

Key phrase:

> 글을 쓰지 않아도 괜찮아요. 대화하면 상품 페이지가 만들어져요.

Fields extracted:

- item name
- category
- condition
- estimated value
- recommended price
- duration options
- components
- defects
- private serial number
- safety code photo

## 11.5 Seller Dashboard

Goal:

Show the seller that this is a small business dashboard, but keep it calm.

Show:

- this month’s earnings
- active rentals
- return due
- review/trust score
- pending requests
- items listed
- next action

Primary action:

> 새 물건 등록하기

---

# 12. Implementation Strategy

## 12.1 Use Claude Code First

Use Claude Code now.

Reason:

The next step is not visual polishing.  
It is converting the locked MVP into a maintainable codebase.

Claude Code should:

1. Create Next.js app structure.
2. Set up Tailwind with CoRent design tokens.
3. Build the 5 MVP screens.
4. Create reusable components.
5. Set up mock data.
6. Add AI/search/seller registration placeholders.
7. Add Toss Payments placeholder architecture.
8. Keep future real implementation paths clean.

## 12.2 Use Codex Second

Use Codex after Claude Code creates the first functional codebase.

Codex should:

- polish UI components
- tighten spacing
- refactor visual components
- create hover/focus states
- improve responsiveness
- fix layout bugs
- iterate quickly on screen design

Recommended order:

```txt
Claude Code
→ first working app structure

Codex
→ UI polish and responsive refinement

Claude Code
→ integrate, clean up, and prepare next MVP iteration
```

---

# 13. Claude Code Prompt

Use this prompt directly in Claude Code.

```txt
You are building the first MVP prototype for CoRent, a Seoul-based AI rental/sharing platform.

Build a premium, minimal, trustworthy Next.js web app prototype.

The MVP is for validation, not public launch.

Product summary:
CoRent lets people borrow products before buying them and lets owners turn idle products into short-term rental income.

Main consumer positioning:
“사기 전에, 며칠만 살아보기.”

Seller positioning:
“집에 잠든 물건을 작은 렌탈 사업장으로.”

Initial categories:
- Massage guns
- Home-care devices
- Small exercise equipment

Initial region:
- Seoul beta

Rental method:
- Direct pickup and return only
- Payment should still happen inside the platform, not in person

Rental durations:
- 1 day
- 3 days
- 7 days

Pricing:
- Use platform baseline rate + similar product averages + AI recommendation
- Seller makes final decision

Payment:
- Prepare Toss Payments-ready architecture
- For now, use placeholder/mock payment states

Commission:
- 10% of rental fee

Trust model:
- AI first check + human final review
- Today’s safety code photo
- Private serial number storage
- Buyer safety deposit
- Seller trust responsibility through verification, delayed settlement, and policy

Build these 5 screens:
1. Landing / AI search
2. Matching results
3. Product detail / trust summary
4. Seller AI registration
5. Seller dashboard

Use this design system exactly:

Colors:
- Ink: #111827
- Primary Trust Blue: #2B59C3
- Accent Clarity Blue: #5BC0EB
- Air Surface: #F3F8FF
- White: #FFFFFF

Color ratio:
- White / #F3F8FF around 75%
- #111827 around 15%
- #2B59C3 around 7%
- #5BC0EB around 3%

Typography:
- Helvetica, "Helvetica Neue", Arial, sans-serif
- Weights only: 400, 500, 700

Type scale:
- Display: 64px / 1.05 / 700 / -0.04em
- H1: 48px / 1.12 / 700 / -0.03em
- H2: 36px / 1.15 / 700 / -0.03em
- H3: 28px / 1.2 / 700 / -0.02em
- Title: 22px / 1.25 / 500
- Body large: 18px / 1.55 / 400
- Body: 16px / 1.55 / 400
- Body small: 14px / 1.45 / 400
- Caption: 12px / 1.4 / 500 / 0.01em

Spacing tokens only:
4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 128px

Spacing rules:
- Small related items: 8px to 12px
- Text groups: 12px to 16px
- Component internal padding: 16px to 24px
- Card internal padding: 24px to 32px
- Card-to-card gap: 16px to 24px
- Section-to-section gap: 64px to 96px
- Hero vertical padding: 96px to 128px
- Mobile page padding: 20px
- Tablet page padding: 32px
- Desktop page padding: 64px
- Wide desktop page padding: 96px

Layout:
- Main desktop content width around 1120px
- Dashboard max width 1280px
- Body text width under 640px
- Hero text width under 720px
- Every screen should have one primary action
- Use generous whitespace
- Do not fill empty space unnecessarily
- Do not use random spacing values

Components:
- Cards use #FFFFFF or #F3F8FF
- Borders: rgba(17, 24, 39, 0.10)
- Card radius: 20px
- Modal radius: 28px
- Input radius: 12px
- Button radius: 999px or 12px
- Input height: 52px
- Primary button height: 52px to 56px
- Mobile bottom CTA height: 56px
- List item minimum height: 64px
- Prefer borders over shadows
- Avoid excessive icons
- Avoid noisy badges
- Avoid loud gradients

Interaction:
- Primary button: #2B59C3
- Hover: #234AA6
- Focus ring: 0 0 0 4px rgba(43, 89, 195, 0.14)
- Selected state: #2B59C3 border with soft blue tint background

Implementation requirements:
- Use Next.js App Router
- Use TypeScript
- Use Tailwind CSS
- Create reusable components:
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
- Use mock data for products and seller dashboard
- Keep Toss Payments as a placeholder module/service, not a real integration yet
- Keep code clean and easy to extend
- Do not add unrelated libraries unless necessary
- Do not introduce extra colors, random font sizes, random spacing, or decorative UI
```

---

# 14. Development Milestones

## Milestone 1 — Static MVP

Build:

- 5 pages
- mock data
- no backend
- no real login
- no real payment

Goal:

> Can the product feel real and trustworthy?

## Milestone 2 — Interactive MVP

Add:

- duration selection
- AI search mock parsing
- product request state
- seller registration form state
- safety code generation
- listing preview

Goal:

> Can users understand the flow without explanation?

## Milestone 3 — Concierge MVP

Add:

- simple database
- admin review
- request submission
- seller listing submission
- manual approval state
- Toss Payments test flow or payment link placeholder

Goal:

> Can the founder manually run first transactions?

## Milestone 4 — Real Beta

Add:

- authentication
- identity verification path
- real Toss Payments
- settlement logic
- dispute state
- notification system
- legal terms

Goal:

> Can the first real users safely transact?

---

# 15. Important Product Principles

## 15.1 Simplicity Is Trust

The user should not see all the complexity.

Internally, CoRent may have:

- verification rules
- deposit logic
- admin review
- payment states
- dispute policies
- settlement holds

But the user should mostly see:

- 안전 확인 완료
- 반납 후 정산
- 비공개 보관
- 오늘 찍은 사진인지 확인
- 대여 요청하기

## 15.2 AI Should Structure, Not Decorate

AI is not a visual gimmick.

AI should help with:

- turning natural language into filters
- generating seller listing drafts
- recommending prices
- summarizing trust signals
- checking whether required verification fields are complete

## 15.3 Design Consistency Equals Trust

Every inconsistency makes the product feel less reliable.

Do not randomly change:

- border radius
- colors
- spacing
- button height
- badge style
- font size
- card padding
- shadow style

## 15.4 MVP Is for Fast Learning

The first version should be small enough to fail quickly.

Do not overbuild:

- insurance
- full delivery logistics
- full dispute automation
- full tax automation
- real escrow
- multi-category marketplace
- complex user ranking

Build enough to test trust and demand.

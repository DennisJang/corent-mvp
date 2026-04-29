# CoRent Functional MVP Intent Rules

_Last updated: 2026-04-29_

## 0. Purpose

This document defines the implementation rules for moving CoRent from a static visual MVP into a functional MVP.

It must be read together with:

- `docs/corent_context_note.md`
- `docs/corent_design_system_bw_v1.md`
- `CLAUDE.md`

The goal is to implement real local functionality without requiring external API keys yet.

This means:

- no real Toss Payments yet
- no real OpenAI API yet
- no real database yet
- no real auth yet
- no real image upload yet

But the code must be structured so those can be connected later with minimal changes.

---

# 1. Non-Negotiable Product Context

CoRent is a Seoul-based AI rental/sharing MVP.

It helps people:

1. Borrow products before buying them.
2. Turn idle personal products into short-term rental income.

Main consumer positioning:

> 사기 전에, 며칠만 살아보기.

Seller positioning:

> 집에 잠든 물건을 작은 렌탈 사업장으로.

Initial MVP categories:

- Massage guns
- Home-care devices
- Small exercise equipment

Initial region:

- Seoul beta

Rental durations:

- 1 day
- 3 days
- 7 days

Rental method:

- Direct pickup and return only
- Payment still happens inside the platform
- Do not design around cash or in-person payment

Commission:

- 10% of rental fee

Trust model:

- AI first check
- Human final review
- Today’s safety code photo
- Private serial number storage
- Safety deposit
- Delayed settlement after return confirmation

---

# 2. Design Rules Must Stay Intact

The current design direction is:

> **Black-and-white Swiss Grid editorial trust system**

Do not redesign the product while implementing functionality.

## 2.1 References

The design is based only on these five references:

1. Golden ratio construction grid
2. Celestial / orbital diagram
3. Müller-Brockmann grid poster construction
4. Müller-Brockmann overlapping typographic grid
5. Helvetica typography reference

## 2.2 Extracted Design Principles

### Golden Ratio / Construction Grid

- Use proportion before decoration.
- Use 7/5, 6/6, 5/7, and 4/8 splits.
- Large empty space is allowed.
- The layout should feel constructed, not randomly arranged.

### Celestial / Orbit Diagram

- Use circles, arcs, points, and crossing lines as sparse diagrams.
- Solid lines mean confirmed states.
- Dashed lines mean pending, inferred, AI-generated, or suggested states.
- Do not overuse orbital graphics.

### Müller-Brockmann Grid

- Build the grid first.
- Place information on the grid.
- Use spacing as structure.
- Make hierarchy through alignment and scale.
- Do not fill empty space just because it exists.

### Overlapping Typography

- Typography can become the graphic.
- Large type is allowed when the grid is strong.
- Overlap must not hurt readability.
- Dense functional screens should prioritize clarity.

### Helvetica

- Helvetica is the identity.
- Use typography, grid, and line hierarchy instead of decoration.
- Avoid expressive fonts, colorful icons, or unnecessary visual noise.

## 2.3 Color Rules

Use only:

```css
--black: #000000;
--white: #FFFFFF;
```

Permitted black opacity tokens:

```css
--ink-100: rgba(0,0,0,1);
--ink-80: rgba(0,0,0,0.8);
--ink-60: rgba(0,0,0,0.6);
--ink-40: rgba(0,0,0,0.4);
--ink-20: rgba(0,0,0,0.2);
--ink-12: rgba(0,0,0,0.12);
--ink-08: rgba(0,0,0,0.08);
```

Never use:

- blue
- green
- red
- yellow
- gradients
- decorative accent colors
- colorful badges
- random gray hex colors

## 2.4 Typography Rules

Use:

```css
font-family: Helvetica, "Helvetica Neue", Arial, sans-serif;
```

Weights only:

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

## 2.5 Spacing Rules

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

## 2.6 Line Rules

```css
--line-thin: 1px solid rgba(0,0,0,0.12);
--line-base: 1px solid rgba(0,0,0,0.2);
--line-strong: 1px solid #000000;
--line-dashed: 1px dashed rgba(0,0,0,0.28);
```

Meaning:

- Thin solid = secondary structure
- Base solid = normal boundary
- Strong solid = selected / confirmed
- Dashed = pending / AI-inferred / suggested / incomplete

## 2.7 Radius Rules

```css
--radius-none: 0px;
--radius-small: 8px;
--radius-pill: 999px;
```

Use:

- core cards: 0px
- product cards: 0px
- inputs: 0px or 8px
- badges: 999px
- buttons: 999px or 0px

## 2.8 Visual Implementation Rules

Do not add:

- shadows on standard cards
- gradients
- soft SaaS cards
- decorative icon sets
- colorful status badges
- rounded glass panels
- random one-off UI styles

Preserve:

- black/white only
- Helvetica
- strict grid
- line-based hierarchy
- numbered trust rows
- ledger-like dashboard
- structured AI blocks instead of chat bubbles

---

# 3. Architecture Philosophy

CoRent should be built with three core engineering principles.

## 3.1 Stripe-Style Intent Model

CoRent should model core workflows as Intent objects.

An Intent represents user or system intention plus lifecycle state.

The most important object is:

> **RentalIntent**

A RentalIntent is not just a request.  
It is the lifecycle of a rental transaction.

It includes:

- selected product
- borrower
- seller
- duration
- price
- safety deposit
- platform fee
- seller payout
- payment state
- pickup state
- return state
- settlement state
- failure state
- dispute state

This is inspired by Stripe's Intent model.

The goal is to make the flow:

- explicit
- stateful
- resumable
- failure-aware
- easy to extend
- easy to swap from mock to real provider

## 3.2 Netflix Chaos Engineering Mindset

Do not only build happy paths.

Assume that these can fail:

- payment
- seller approval
- pickup
- return
- verification
- settlement
- dispute handling

The MVP does not need real chaos testing yet.

But it must include failure states in the type system and UI state handling.

Failures are not afterthoughts.

They are part of the lifecycle.

## 3.3 Stripe-Style Maintainable Code

Write code so future systems can be swapped in with minimal changes.

Current implementation should use:

- mock AI parser
- mock payment adapter
- localStorage persistence
- mock verification flow

Future implementation should be able to swap to:

- OpenAI API
- Toss Payments
- real database
- image storage
- identity verification
- settlement ledger

The UI should not know which provider is used.

Use adapter interfaces.

---

# 4. Intent Model

## 4.1 SearchIntent

Represents a borrower’s search intent.

Example input:

> 이번 주말에 마사지건 3일 빌리고 싶어.

Should be parsed into:

```ts
type SearchIntent = {
  id: string;
  rawInput: string;
  category?: CategoryId;
  durationDays?: 1 | 3 | 7;
  region?: "seoul";
  priceMax?: number;
  pickupMethod: "direct";
  trustPreference?: "verified_first" | "low_deposit" | "closest";
  createdAt: string;
};
```

## 4.2 ListingIntent

Represents a seller’s intent to list an item.

```ts
type ListingIntent = {
  id: string;
  sellerId: string;
  status:
    | "draft"
    | "ai_extracted"
    | "verification_incomplete"
    | "human_review_pending"
    | "approved"
    | "rejected";

  rawSellerInput?: string;

  item: {
    name: string;
    category: CategoryId;
    estimatedValue: number;
    condition: ItemCondition;
    components: string[];
    defects?: string;
    privateSerialNumber?: string;
  };

  pricing: {
    oneDay: number;
    threeDays: number;
    sevenDays: number;
    sellerAdjusted?: boolean;
  };

  verification: VerificationIntent;

  createdAt: string;
  updatedAt: string;
};
```

## 4.3 RentalIntent

Represents the full lifecycle of a rental.

```ts
type RentalIntentStatus =
  | "draft"
  | "requested"
  | "seller_approved"
  | "payment_pending"
  | "paid"
  | "pickup_confirmed"
  | "return_pending"
  | "return_confirmed"
  | "settlement_ready"
  | "settled"
  | "cancelled"
  | "payment_failed"
  | "seller_cancelled"
  | "borrower_cancelled"
  | "pickup_missed"
  | "return_overdue"
  | "damage_reported"
  | "dispute_opened"
  | "settlement_blocked";

type RentalIntent = {
  id: string;
  productId: string;
  borrowerId?: string;
  sellerId: string;

  status: RentalIntentStatus;

  durationDays: 1 | 3 | 7;

  amounts: {
    rentalFee: number;
    safetyDeposit: number;
    platformFee: number;
    sellerPayout: number;
    borrowerTotal: number;
  };

  payment: {
    provider: "mock" | "toss";
    sessionId?: string;
    status:
      | "not_started"
      | "pending"
      | "authorized"
      | "paid"
      | "failed"
      | "refunded";
  };

  pickup: {
    method: "direct";
    status: "not_scheduled" | "scheduled" | "confirmed" | "missed";
    locationLabel?: string;
  };

  return: {
    status: "not_due" | "pending" | "confirmed" | "overdue" | "damage_reported";
    dueAt?: string;
  };

  settlement: {
    status: "not_ready" | "ready" | "blocked" | "settled";
    sellerPayout: number;
  };

  createdAt: string;
  updatedAt: string;
};
```

## 4.4 VerificationIntent

Represents trust and verification state.

```ts
type VerificationIntent = {
  id: string;
  safetyCode: string;

  status:
    | "not_started"
    | "pending"
    | "submitted"
    | "ai_checked"
    | "human_review_pending"
    | "verified"
    | "rejected";

  checks: {
    frontPhoto: boolean;
    backPhoto: boolean;
    componentsPhoto: boolean;
    workingProof: boolean;
    safetyCodePhoto: boolean;
    privateSerialStored: boolean;
  };

  aiNotes?: string[];
  humanReviewNotes?: string[];
};
```

---

# 5. Functional Modules To Build Now

These do not require external API keys.

## 5.1 Domain Types

Create domain types for:

- Category
- Product
- Seller
- ListingIntent
- RentalIntent
- SearchIntent
- VerificationIntent
- Payment state
- Settlement state
- Trust check state

## 5.2 Pricing Functions

Implement pure functions:

```ts
calculateRecommendedRentalPrice()
calculateSafetyDeposit()
calculatePlatformFee()
calculateSellerPayout()
calculateBorrowerTotal()
```

Rules:

- 1 day: about 3.5% of product value
- 3 days: about 8% of product value
- 7 days: about 15% of product value
- platform fee: 10% of rental fee

Safety deposit:

| Estimated Value | Deposit |
|---|---:|
| Under ₩100,000 | ₩0 |
| ₩100,000–₩300,000 | ₩30,000 |
| ₩300,000–₩700,000 | ₩70,000 |
| Over ₩700,000 | Excluded from MVP |

## 5.3 RentalIntent State Machine

Implement transition functions:

```ts
createRentalIntent()
approveRentalIntent()
markPaymentPending()
mockConfirmPayment()
confirmPickup()
markReturnPending()
confirmReturn()
markSettlementReady()
mockSettle()
openDispute()
markPaymentFailed()
markPickupMissed()
markReturnOverdue()
blockSettlement()
cancelRentalIntent()
```

Rules:

- Use pure functions where possible.
- Validate transitions.
- Do not allow impossible transitions.
- Return clear errors for invalid transitions.
- Keep UI state separate from domain logic.

## 5.4 Search Parser

Implement a mock/rule-based parser.

It should parse:

- category
- duration
- Seoul region
- direct pickup intent
- basic price preference

Example:

```txt
이번 주말에 마사지건 3일 빌리고 싶어
```

Output:

```ts
{
  category: "massage_gun",
  durationDays: 3,
  region: "seoul",
  pickupMethod: "direct"
}
```

## 5.5 Seller Input Parser

Implement mock/rule-based seller parser.

Example:

```txt
테라건 미니고 거의 안 썼어. 3일 정도 빌려주고 싶어.
```

Output:

```ts
{
  itemName: "Theragun Mini",
  category: "massage_gun",
  condition: "like_new",
  recommendedDurationDays: 3
}
```

## 5.6 Safety Code Generator

Implement:

```ts
generateSafetyCode()
```

Rules:

- short code
- readable
- date-based or deterministic enough for MVP
- example format: `B-428`
- no external dependency required

## 5.7 LocalStorage Persistence Adapter

Implement:

```ts
interface PersistenceAdapter {
  saveRentalIntent(intent: RentalIntent): Promise<void>;
  getRentalIntent(id: string): Promise<RentalIntent | null>;
  listRentalIntents(): Promise<RentalIntent[]>;
  saveListingIntent(intent: ListingIntent): Promise<void>;
  listListingIntents(): Promise<ListingIntent[]>;
}
```

Current implementation:

- localStorage

Future implementation:

- database

## 5.8 Mock Payment Adapter

Implement:

```ts
interface PaymentAdapter {
  createSession(intent: RentalIntent): Promise<PaymentSession>;
  confirmPayment(sessionId: string): Promise<PaymentResult>;
  getStatus(sessionId: string): Promise<PaymentStatus>;
}
```

Current implementation:

- mock payment

Future implementation:

- Toss Payments

## 5.9 Mock AI Parser Adapter

Implement:

```ts
interface AIParserAdapter {
  parseSearch(input: string): SearchIntent;
  parseSellerInput(input: string): Partial<ListingIntent>;
}
```

Current implementation:

- rule-based parser

Future implementation:

- OpenAI structured extraction

---

# 6. Functional Screens To Connect

## 6.1 Landing / AI Search

Make the AI search input functional with mock parser.

Expected behavior:

1. User enters query.
2. Parser creates SearchIntent.
3. SearchIntent is persisted or passed to results.
4. User is sent to `/search`.

## 6.2 Search Results

Make filters functional.

Expected behavior:

- duration filter updates results
- category filter updates results
- parsed search conditions display correctly
- product results are filtered from mock product data

## 6.3 Product Detail

Make product detail functional.

Expected behavior:

- duration selector changes price
- safety deposit updates
- platform fee and seller payout calculate
- borrower total calculates
- rental request creates RentalIntent
- request state is persisted
- user sees request timeline or confirmation state

## 6.4 Seller Registration

Make listing creation functional.

Expected behavior:

1. Seller enters natural language.
2. mock parser extracts listing fields.
3. listing preview updates.
4. seller edits structured fields.
5. safety code is generated.
6. verification checklist must be completed.
7. listing submits as `human_review_pending`.
8. listing is persisted locally.

## 6.5 Seller Dashboard

Make dashboard data calculated.

Expected behavior:

- monthly revenue calculated from local/mock settled rentals
- active rentals calculated from RentalIntent statuses
- return due calculated from return state
- pending requests shown from local/mock intents
- listed items shown from local/mock listings
- failure states appear calmly using BW status patterns

---

# 7. Failure States

Implement failure-ready states now.

Do not wait until real APIs exist.

## 7.1 Required Failure States

For RentalIntent:

- payment_failed
- seller_cancelled
- borrower_cancelled
- pickup_missed
- return_overdue
- damage_reported
- dispute_opened
- settlement_blocked

## 7.2 UI Treatment

Use current BW design rules:

- confirmed = solid line / black fill
- current = strong black frame or black fill
- pending = dashed line
- failed/problem = clear black text label, no red
- blocked = dashed or strong line with explicit wording

Do not introduce red or warning colors.

## 7.3 Development Simulation

Optional:

- Create development-only failure simulation helpers.
- Do not expose noisy controls in production UI.
- Use these helpers to verify UI does not break.

---

# 8. File Structure Recommendation

Suggested structure:

```txt
src/
  domain/
    categories.ts
    products.ts
    intents.ts
    rentalIntent.ts
    listingIntent.ts
    verificationIntent.ts

  lib/
    pricing.ts
    safetyCode.ts
    stateMachines/
      rentalIntentMachine.ts
      listingIntentMachine.ts
    adapters/
      payment/
        types.ts
        mockPaymentAdapter.ts
      ai/
        types.ts
        mockAIParserAdapter.ts
      persistence/
        types.ts
        localStorageAdapter.ts

  data/
    mockProducts.ts
    mockSellers.ts
    mockRentalIntents.ts

  components/
    intent/
      RentalIntentTimeline.tsx
      IntentStatusBadge.tsx
    pricing/
      PriceBreakdown.tsx
    seller/
      ListingPreview.tsx
```

Do not create unnecessary files.  
But keep domain logic out of UI components.

---

# 9. Claude Code Execution Prompt

Use this prompt after adding this file to:

```txt
docs/corent_functional_mvp_intent_rules.md
```

```txt
Read CLAUDE.md, docs/corent_context_note.md, docs/corent_design_system_bw_v1.md, and docs/corent_functional_mvp_intent_rules.md.

We are moving CoRent from static mockup to functional MVP behavior.

Keep the current black-and-white Swiss Grid design system exactly.
Do not redesign the visual language.
Do not add colors.
Do not add external libraries unless absolutely necessary.

Core architectural direction:
Use a Stripe-style Intent model.

Create and wire the following intent-centered domain model:
- SearchIntent
- ListingIntent
- RentalIntent
- VerificationIntent
- PaymentIntent adapter interface
- Settlement state model

The most important object is RentalIntent.
RentalIntent should represent the full lifecycle of a rental request:
draft → requested → seller_approved → payment_pending → paid → pickup_confirmed → return_pending → return_confirmed → settlement_ready → settled.

Also include failure states from the beginning:
payment_failed, seller_cancelled, borrower_cancelled, pickup_missed, return_overdue, damage_reported, dispute_opened, settlement_blocked.

Use Netflix Chaos Engineering as a design principle:
Do not build only happy paths.
Assume payment, pickup, return, verification, and settlement can fail.
Model those failures as explicit states.
The UI should handle them calmly and clearly.

Use Stripe-style code structure:
- isolate domain logic from UI
- use pure functions for pricing, deposits, fees, payouts, and state transitions
- create adapter interfaces for payments, AI parsing, and persistence
- implement mock adapters now
- make future Toss Payments, real AI, and real DB integration possible with minimal changes

Implement without external API keys:
1. Domain types and constants
2. RentalIntent state machine
3. ListingIntent flow
4. SearchIntent parser using mock/rule-based logic
5. Seller input parser using mock/rule-based logic
6. calculateRecommendedRentalPrice()
7. calculateSafetyDeposit()
8. calculatePlatformFee()
9. calculateSellerPayout()
10. calculateBorrowerTotal()
11. generateSafetyCode()
12. localStorage persistence adapter
13. mock PaymentAdapter
14. mock AIParserAdapter
15. interactive duration selection
16. product detail price/deposit updates
17. rental request creation
18. request timeline UI
19. seller registration state + validation
20. listing preview updates
21. dashboard values calculated from mock/local data
22. failure-state UI support

Do not implement:
- real Toss Payments
- real OpenAI API
- real database
- real auth
- real image upload
- real identity verification
- insurance
- delivery logistics
- tax automation
- full admin console

Design requirements:
- preserve black/white only
- preserve Helvetica
- preserve strict grid
- preserve line-based hierarchy
- preserve numbered trust rows
- preserve no-shadow, no-gradient, no-blue rule
- preserve current routes and product scope

After implementation:
- run lint and build
- summarize files changed
- explain the Intent model
- explain what is functional now
- explain what is still mocked
- explain what can be swapped later via adapters
- list next steps for real Toss/DB/AI integration
```

---

# 10. Final Principle

CoRent should be built so that:

> **The user sees simple trust.  
> The code contains explicit intent.  
> The system expects failure.  
> The design remains disciplined.**

Implementation priority:

1. Intent model
2. State machine
3. Pure calculation functions
4. Adapter boundaries
5. Functional local flows
6. Failure-ready states
7. UI wiring
8. Polish last

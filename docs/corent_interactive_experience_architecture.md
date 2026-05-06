# CoRent Interactive Experience — architecture plan (docs-only)

_Author: founder + Claude. Recorded: 2026-05-06. Posture:
closed-alpha + pre-revenue beta._

_Companion to
[`corent_product_direction_v2.md`](corent_product_direction_v2.md),
[`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
[`corent_security_gate_note.md`](corent_security_gate_note.md),
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md),
[`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md),
[`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md),
[`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md),
and [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)._

This is a **docs-only** plan. It locks the architectural shape of
the CoRent Interactive Experience before any runtime PR opens.
Implementation lands later, slice-by-slice, behind feature flags
([§13](#13-phased-roadmap), [§14](#14-implementation-principles)).

---

## 1. Product definition

**CoRent Interactive Experience** (`CIE` for short in this doc) is
CoRent's first-class interface: an AI-assisted **try-before-buy
guide** that turns a user's purchase hesitation into concrete
marketplace actions. It is built on top of the deterministic
services CoRent already ships (search, listing detail, readiness
card, request flow, seller readiness, wanted-try-request) and
exposes them through a single conversational+block surface.

**What CIE is:**

- An interactive product surface where a user types or selects
  intent and CoRent answers with **rendered UI blocks** (cards,
  pills, forms, lists) plus optional short captions.
- A guide for the try-before-buy decision: what to validate
  before buying, what to ask the seller, what kind of trial
  period makes sense, what responsibility basis applies.
- An orchestrator that invokes the existing tools
  ([§7](#7-tool-orchestration)) on the user's behalf with the
  user's confirmation.

**What CIE is NOT:**

- It is **not** a generic chatbot. It does not converse for the
  sake of conversation. Every assistant turn either renders a
  block, invokes a tool with confirmation, or asks a bounded
  follow-up question.
- It is **not** a third-party widget or embed. CIE is built into
  CoRent's surfaces and stack; it does not depend on an external
  bot platform.
- It is **not** a generic rental search. The default mental model
  is "구매 전 며칠 써보기" — try-before-buy — not "rent for the
  weekend."
- It is **not** an authority. It cannot grant founder / seller /
  borrower capability, mark a request approved, mark a payment
  succeeded, mark a listing verified, or promise a match.
  Authority remains with the deterministic server actions
  ([§9](#9-deterministic-role)).

## 2. Difference from Interact AI (and similar reference products)

Interact AI and similar "talk-to-the-website" agents typically:

- explain a product page or document on demand;
- summarize structured content into chat answers;
- do not own marketplace state.

CIE inherits the explanatory and summarization affordances but
extends them in a CoRent-specific way:

| Concern | Interact AI-style | CoRent Interactive Experience |
| --- | --- | --- |
| Primary goal | Explain content | Convert hesitation → action |
| State touched | None (read-only) | CoRent marketplace state via tool calls |
| Authority | None | None (same — never granted to LLM) |
| Output | Chat | Block recipes ([§6](#6-ui-block-orchestration)) + bounded captions |
| Wedge | "Help me understand X" | "Help me decide whether to buy X by trying it first" |
| Failure mode | Hallucinated explanation | Hallucinated **action** (banned by [§10](#10-safety-model)) |

CIE's wedge is **action conversion under guardrails**, not
explanation density. The user's typical journey ends in one of
four observable outcomes:

1. The user submits a rental request for an existing listing.
2. The user submits a wanted-try-request when no listing exists.
3. The user opens a listing detail page (`/listings/[id]`) to
   read the readiness card and decide later.
4. The user gets a calm "no, this is out of scope" answer (e.g.
   asks for delivery, insurance, or a payment that isn't wired
   yet) and walks away informed.

Anything beyond those four — chit-chat, marketing pitch, vague
recommendations — is **out of scope** for CIE.

## 3. Core loop

```
[user intent — typed or surface-tapped]
    ↓
[interpret] (LLM candidate or deterministic parser)
    ↓
[derive try criteria] (deterministic readiness service today,
                       LLM-augmented later)
    ↓
[search listings] (existing publicListingService /
                   listPublicListings)
    ↓
   ┌── matches found ──→ [render listing block] ──→ [request flow]
   │                                                    ↓
   │                                              [/requests status]
   │
   └── no matches ─────→ [render wanted-try block] ──→
                          [submitFeedback kind=wanted_item]
                                              ↓
                                  [founder cockpit signal]
                                              ↓
                  later: [seller demand activation] (gated future)
                                              ↓
                                      [request lifecycle]
```

The loop respects the **wedge invariant**: every node either
moves the user toward a try-before-buy decision or tells the user
honestly that the question is out of scope. There is no "browse
forever" state and no "confirm match for me" state.

Lifecycle past `requested` (approve / decline / pickup / return /
settlement / claim) stays on the deterministic server-action side
([`runIntentCommand`](../src/server/intents/runIntentCommand.ts)).
CIE can only **describe** lifecycle transitions to the user, not
trigger them out of the user's own request submission. Seller
approval / decline runs through the existing
`/dashboard` UI; CIE does not give a borrower a "force approve"
button.

## 4. System architecture

CIE is a **layered** architecture. Each layer has a narrow job
and a narrow set of dependencies. The split below is the canonical
shape; PRs name their target layer in the title.

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Experience layer                                             │
│    /                                                            │
│    ├─ intent input (text, surface tap, suggested chip)          │
│    ├─ block renderer (deterministic; renders block recipes)     │
│    └─ confirmation UI (every tool call has a confirm step)      │
└─────────────────┬──────────────────────────────────────────────┘
                  │ block recipes + tool calls (typed envelopes)
┌─────────────────▼──────────────────────────────────────────────┐
│ 2. Orchestrator (server-only)                                   │
│    ├─ planner: turns user intent → next-step plan               │
│    ├─ tool dispatcher: invokes §7 tools by name + args          │
│    └─ block emitter: assembles allowed blocks (§6) for the      │
│       experience layer                                          │
└──┬──────────────┬──────────────┬──────────────┬────────────────┘
   │              │              │              │
┌──▼──────┐  ┌────▼────┐  ┌──────▼──────┐  ┌────▼─────────┐
│ 3.      │  │ 4.      │  │ 5.          │  │ 6.           │
│ Knowl.  │  │ Tool /  │  │ Marketplace │  │ Governance   │
│ layer   │  │ action  │  │ state       │  │ layer        │
│         │  │ layer   │  │ layer       │  │ (banlists,   │
│ - thesis│  │         │  │             │  │ caps,        │
│ - cat.  │  │ -search │  │ -listings   │  │ DTO checks,  │
│   crit. │  │ -derive │  │ -intents    │  │ banned       │
│ - copy  │  │   try   │  │ -feedback   │  │ phrase       │
│   pol.  │  │ -create │  │  submissions│  │ scan,        │
│ - bann. │  │   wanted│  │ -auth       │  │ cost cap)    │
│   claims│  │ -create │  │ -founder    │  │              │
│ - FAQ   │  │   rent. │  │  cockpit    │  │              │
│ - surf. │  │ -create │  │             │  │              │
│   guide │  │   seller│  │             │  │              │
│         │  │   draft │  │             │  │              │
│         │  │ -show   │  │             │  │              │
│         │  │   req.  │  │             │  │              │
│         │  │   status│  │             │  │              │
│         │  │ -show   │  │             │  │              │
│         │  │   demand│  │             │  │              │
└─────────┘  └─────────┘  └─────────────┘  └──────────────┘
```

### 4.1 Experience layer

The user-visible interface. Lives under `src/app/**` and
`src/components/**`. Contains:

- The intent capture surface (textarea + chip suggestions on the
  landing page; embedded chip surfaces inside `/search` and
  `/listings/[id]` for in-context follow-ups).
- A **deterministic block renderer** that turns block recipes
  ([§6](#6-ui-block-orchestration)) into BW Swiss Grid components.
- A **confirmation UI** for every tool call. The orchestrator
  proposes a tool invocation; the user confirms with a button
  press; only then does the action execute. There is no
  "auto-execute" path from the LLM to the marketplace.

### 4.2 Orchestrator

Server-only. Sits behind a server action. Uses the existing
`runIntentCommand`-style envelopes for any state-changing tool
call ([§7](#7-tool-orchestration)). The orchestrator's job is:

1. Read the user's typed turn + the bounded conversation context
   (capped — see [§12](#12-cost-model)).
2. Call the **planner** to produce a next-step plan: zero or
   more tool invocations + zero or more block recipes + zero or
   one bounded follow-up question.
3. Run the **tool dispatcher** for any tool calls the planner
   proposed.
4. Emit a typed **block batch** the experience layer renders.

The orchestrator never owns marketplace authority. It is a
narrow bridge between the LLM (or deterministic planner) and the
existing server actions.

### 4.3 Knowledge layer

Static, server-only registries that hold the project's
**ground truth** for the LLM's retrieval channel. Lives under
`src/server/cie/knowledge/**` (proposed path; PR 2). Contents
([§5](#5-knowledge-sources)):

- product thesis,
- category criteria,
- copy policies + banlist,
- safe FAQ,
- surface guides,
- readiness copy.

The knowledge layer is **read-only** from the orchestrator's
perspective. Nothing in this layer is user-supplied. RAG (when
it lands — [§11](#11-data--rag-plan)) reads from this layer; it
does not embed user prompts at the same level.

### 4.4 Marketplace state layer

The existing CoRent stack:

- listings, listing intents, rental intents, rental events,
  feedback submissions, profiles + capability rows;
- `runIntentCommand` for state-changing flows;
- `resolveServerActor`, `requireFounderSession` for authority;
- public-projection mappers (e.g.
  `mapApprovedListingIntentToPublicListing`).

CIE **does not extend** this layer in this slice. Every CIE tool
([§7](#7-tool-orchestration)) is a wrapper over an existing
action or a read of an existing projection.

### 4.5 Tool / action layer

Thin wrappers around the existing server actions. One wrapper
per CIE tool ([§7](#7-tool-orchestration)). The wrapper:

- validates the tool's argument shape (banlist phrase scan
  applies to free-text fields the LLM produced);
- forwards to the existing action;
- returns a typed envelope the orchestrator can convert to a
  block.

Wrappers are intentionally ≤ ~50 lines each. They do not
contain business logic.

### 4.6 Governance layer

Server-only invariants enforced before any block is emitted or
any tool is dispatched:

- **Banned phrase scan** on every assistant-emitted string
  (closed-alpha banlist + insurance / guarantee / verified
  seller).
- **DTO check**: any block that surfaces marketplace state must
  go through the existing public projection (no `rawSellerInput`,
  no `privateSerialNumber`, no `borrower_id` to a seller, no
  `contact_email` outside the founder cockpit).
- **Authority refusal**: tool calls that would set status,
  payment, settlement, founder, capability, role, or
  verification fields are refused at the dispatcher level. The
  envelope signature does not even expose those slots.
- **Cost cap** ([§12](#12-cost-model)): an orchestrator turn
  whose estimated cost exceeds the configured cap is short-
  circuited to a "다시 시도해 주세요" block with no LLM call.
- **Provenance stamp**: every block carries a provenance tag
  (`deterministic` | `llm_candidate`); UI never strips it.

## 5. Knowledge sources

The knowledge layer ([§4.3](#43-knowledge-layer)) bundles
**static, reviewed** content. Each entry is a typed registry the
orchestrator can read; no entry is user-editable.

| Registry | What it holds | Source of truth |
| --- | --- | --- |
| `productThesis` | The try-before-buy framing, wedge sentence, what CoRent is and is not | `docs/corent_product_direction_v2.md` + this doc §1–§2 |
| `categoryCriteria` | Per-category: try-before-buy points, what to validate, what NOT to claim | `tryBeforeBuyReadinessService.TRY_POINTS_BY_CATEGORY` |
| `copyPolicies` | Required phrasing patterns (closed vocabulary, calm captions, BW Swiss tone) | `corent_design_system_bw_v1.md`, readiness card service |
| `bannedClaims` | The 14-phrase banlist + adjacent forbidden framings (auto-match, auto-payment, exact address) | `copyGuardrails.test.ts`, this doc §10 |
| `safeFAQ` | A small set of pre-written answers for high-risk questions ("보증금은 얼마예요?", "택배 되나요?", "보험 되나요?") | `readiness_feedback_decision_aid.md` |
| `surfaceGuides` | What each route does, what its DTOs are, what it must NOT show | `corent_closed_alpha_quality_gates.md` + `corent_externalization_architecture_v1.md` |
| `readinessCopy` | Variant pool per readiness sub-surface | `corent_readiness_copy_experiment_backlog.md` |

Two design constraints on the registries:

1. **Closed vocabulary at the edge.** A registry value can only
   be inserted into a block via the deterministic block renderer,
   not concatenated into a free-text LLM completion that the
   user reads.
2. **Versioned.** Every registry is timestamped (`updated_at`)
   and has a comment explaining why a phrase exists. A registry
   change is a separate, reviewed PR — never an inline edit
   bundled with a feature.

## 6. UI block orchestration

CIE never lets the LLM render UI directly. Instead, the LLM (or
the deterministic planner) emits **block recipes** — typed JSON
envelopes that the experience layer's deterministic renderer
turns into actual BW Swiss Grid components.

### 6.1 Allowed block types

The block-type vocabulary is closed. Adding a new block type is
a deliberate PR that lands in this list before the orchestrator
can emit it.

| Block type | Purpose | Example |
| --- | --- | --- |
| `caption` | Short calm sentence above or below another block | "조건에 맞는 매물이 아직 없어요." |
| `try_criteria` | Try-before-buy checks for a category | Reuse `tryBeforeBuyReadinessService` output |
| `listing_card` | One approved listing | Re-uses `PublicListing` projection |
| `listing_grid` | A bounded set of listing cards | Capped at 12 rows |
| `match_hints` | The dashed-pill recommendation block | `explainMatch` output |
| `request_form` | A bounded form for `createRentalRequest` | Pre-filled from intent |
| `wanted_form` | A bounded form for `createWantedTryRequest` | Pre-filled from intent |
| `seller_draft_form` | A bounded form for `createSellerDraft` | Reuses chat intake |
| `request_status` | Borrower's `/requests` row, single-row variant | Reuses request DTO |
| `demand_signal_summary` | Aggregated, **non-identifying** demand signal counts | Future seller-side block, gated |
| `out_of_scope` | Calm "this isn't built yet" answer | "택배는 아직 지원하지 않아요." |
| `error` | Calm error chip | "결과를 불러오지 못했어요." |
| `confirm` | Wraps a tool call with an explicit user-confirmed button | Required before any state change |

### 6.2 Recipe schema

Every block recipe is a TypeScript-typed envelope. The
orchestrator emits an array of recipes; the renderer renders
them in order. The **renderer never accepts free-form HTML or
free-form Markdown from the LLM**; recipes only carry typed
slots.

Sketch:

```ts
// Proposed shape (PR 3 lands the real types)
type BlockRecipe =
  | { type: "caption"; text: string; tone: "calm" | "warning" }
  | { type: "listing_grid"; listings: PublicListing[]; limit: number }
  | { type: "request_form"; listingId: string; defaults: { durationDays?: 1|3|7 } }
  | { type: "wanted_form"; defaults: { message?: string; category?: CategoryId } }
  | { type: "out_of_scope"; reason: "delivery" | "insurance" | "payment_now" | "exact_address" }
  // … (closed list)
```

### 6.3 Deterministic rendering

- The renderer is pure (no I/O, no env reads).
- Every recipe field is **validated** before render (length caps,
  type narrowing, banlist scan on `text` slots).
- An invalid recipe → the renderer emits `block: error` with a
  calm caption; the LLM does not get a second chance to retry
  inline.
- Blocks render in BW Swiss Grid only. New components do not
  introduce new tokens.

This is the same posture the readiness card uses today:
deterministic Korean copy, closed vocabulary, calm dashed-border
pills, no inline LLM-string-to-DOM.

## 7. Tool orchestration

The orchestrator can dispatch a closed set of tools. Each tool
is a thin wrapper over an existing action (or a future deferred
action). Tool argument shapes are validated; banlist applies to
free-text args.

| Tool | Wraps | Authority | Input shape (proposed) | Output shape |
| --- | --- | --- | --- | --- |
| `searchListings` | `publicListingService.listPublicListings` + filter | Public read | `{ category?, durationDays?, priceMax?, region? }` | `PublicListing[]` (capped) |
| `deriveTryCriteria` | `tryBeforeBuyReadinessService.deriveTryBeforeBuyReadiness` | Pure function | `{ category, pickupArea, condition, estimatedValue }` | `TryBeforeBuyReadinessCard` |
| `createWantedTryRequest` | `submitFeedbackAction({ kind: "wanted_item" })` | Anonymous-OK; signed-in `profile_id` server-derived | `{ message, itemName?, category?, contactEmail? }` | `{ id }` |
| `createRentalRequest` | Existing renter-side rental request action | Renter actor required (`expectedActorKind: "renter"`) | `{ listingId, durationDays }` | `RentalIntent` summary |
| `createSellerDraft` | Existing chat-intake draft action | Seller actor required | `{ rawText }` | `ListingDraftSummary` |
| `showRequestStatus` | Existing `listMyRentalRequestsAction` | Renter actor required | `{ requestId? }` | `MyRequestRow` summary |
| `showSellerDemandSignals` | **Future tool**, gated. Aggregated category-level counts only | Seller actor required + DTO projection that strips borrower id / email / message | `{ category? }` | `{ category, count, region_hint }[]` (no borrower data) |

Hard rules across all tools:

- **No state-changing tool runs without a `confirm` block.** The
  orchestrator emits `confirm` first; the user clicks; only then
  does the wrapper invoke the action.
- **No tool exposes private fields.** Output uses public DTO
  projections only (existing allowlist mappers).
- **No tool grants authority.** Tools cannot set status,
  payment, founder, capability, or verification fields.
- **No tool implements payment, deposit, escrow, settlement,
  refund, insurance, handoff, return, claim, dispute,
  notification, external webhook, or trust-score logic.** Those
  are forbidden by the closed-alpha gate.

A tool is **out of scope for CIE** if it cannot satisfy all four
rules.

## 8. LLM role

The LLM is a **candidate-generation channel** with no authority.
Allowed:

- **Interpret** free-text intent into a structured `SearchIntent`
  candidate. The user confirms before any state change.
- **Summarize** a deterministic block (e.g. caption a `try_criteria`
  card) using the closed copy vocabulary.
- **Generate candidate fields** for a `wanted_form` or
  `seller_draft_form` from raw user text. Provenance:
  `llm_candidate`. The user edits and confirms.
- **Entity resolution** later — "다이슨 에어랩" ≅ "Dyson
  Airwrap". Output: candidate match list with
  `provenance: "llm_candidate"`.
- **Bounded follow-up question**: at most one short Korean
  question per turn, drawn from a closed pattern set ("어떤
  카테고리예요?", "며칠 정도 써보고 싶으세요?"). Free-form
  follow-ups are forbidden.

Forbidden:

- The LLM **never** writes a final persisted value. Final
  values come from deterministic services or user-confirmed
  forms.
- The LLM **never** decides authority (status, role, capability,
  founder, verification, payment).
- The LLM **never** outputs banlist phrases. The governance
  layer scans every assistant-emitted string before it reaches
  the user.
- The LLM **never** invokes a tool directly. The orchestrator
  proposes; the user confirms; the wrapper dispatches.
- The LLM **never** sees raw seller input, private serial
  numbers, exact pickup addresses, contact info, or any private
  field. The retrieval channel feeds it the **knowledge
  registry** + the **public DTO projections**, not raw rows.

## 9. Deterministic role

These layers are CoRent's authority. The LLM channel is layered
on top; it cannot override them.

| Concern | Authority | Notes |
| --- | --- | --- |
| Pricing | `priceCatalog` + `PriceBreakdown` deterministic helpers | LLM never writes a price |
| Status | `runIntentCommand` + `rentalIntentMachine` | Status transitions are typed; LLM cannot bypass |
| Actor identity | `resolveServerActor`, `requireFounderSession` | Cookie + Supabase session; not a tool arg |
| Publication | Founder cockpit `publishListingAction` | Founder only; LLM has no path |
| Responsibility copy | `tryBeforeBuyReadinessService` + `sellerListingReadinessService` | Closed vocabulary; LLM may caption but not invent |
| Final persisted values | The repository layer (`*Repository.ts`) + validators | LLM candidate must round-trip user confirmation first |
| DTO projection | Existing public mappers | LLM never reads raw rows |
| Search ranking and match hints | `marketplaceIntelligenceService.explainMatch` | Deterministic; LLM cannot reorder |
| Banlist enforcement | `copyGuardrails.test.ts` + governance scan | LLM emissions are scanned before render |

The principle: **the LLM observes and proposes; the
deterministic layer decides and persists.**

## 10. Safety model

Every CIE block, every tool argument, every assistant-emitted
caption is checked against the rules below. A violation
short-circuits the turn to a calm `block: error` or
`block: out_of_scope`.

- **No exact address.** Free-text fields run through a redaction
  pass that strips Korean address tokens (`구`, `동`, `로`,
  `번길`, ranges of digits with road-name patterns) before any
  surface that could re-emit them. Region hints stay at
  district-level (e.g. "마포 권역") at most.
- **No contact exposure.** `contact_email`, phone numbers, and
  social handles never appear on a borrower-, seller-, or
  public-facing surface. The founder cockpit
  (`/admin/cockpit`, `requireFounderSession`-gated) is the only
  reader.
- **No payment promise.** Banned phrases: `결제 완료`, `결제
  진행`, `결제 처리`, `대여 확정`, `보증금`, `보증금 청구`,
  `정산 완료`, `환불`. The `out_of_scope` block surfaces "이
  단계에서는 결제·픽업·정산이 시작되지 않아요." instead.
- **No guarantee / insurance language.** Banned: `보증`, `보험`,
  `보장`, `guaranteed`, `insured`, `insurance`. Use
  `책임 기준`, `참고용`, `아직 연결되어 있지 않아요`,
  `요청 단계` instead.
- **No trust score.** No numeric trust rating, star score,
  reputation index, or "verified seller" badge. `verified
  seller` is on the banlist.
- **No automatic matching promise.** Wanted-try-request copy is
  always conditional ("같은 물건을 가진 셀러가 보면 다시
  안내드려요"), never promissory ("셀러를 찾아드릴게요").
- **No PII to sellers.** No borrower email, no `borrower_id`,
  no raw `message`, no `profile_id` on a seller-visible
  surface. The future seller demand block exposes only
  category-level counts + region-hint, never identity.
- **No raw prompt logging.** Prompts and completions are not
  logged in their raw form. Cost telemetry stores **token
  counts and labels** only.

## 11. Data / RAG plan

CIE's retrieval starts simple and stays explicit. A vector
embedding store is **future**, not MVP.

### 11.1 Phase A — structured registries (MVP)

- The knowledge layer ([§4.3](#43-knowledge-layer)) is a set of
  TypeScript modules. Each registry exports a typed object with
  documented entries.
- The orchestrator runs **rule-based retrieval**: given the
  user's parsed intent, pull the relevant `categoryCriteria`,
  `safeFAQ`, and `surfaceGuides` entries and pass their text
  into the LLM context window.
- **No vector DB. No embeddings. No external search.** The
  registry is small enough (≤ 50 entries) that rule-based
  retrieval is enough.

### 11.2 Phase B — embeddings + vector store (future)

- When the registry exceeds rule-based retrieval (likely once
  the wedge expands beyond the initial categories), embeddings
  land. Provider choice is open ([§15](#15-open-questions)).
- All embedded content stays from the **knowledge registry**.
  User prompts and free-text submissions are never embedded
  back into the registry without a separate, reviewed slice.
- Vector store choice (pgvector inside Supabase vs. a
  dedicated vector DB) is a separate decision with its own
  security review.

### 11.3 Logging discipline

- **No raw prompt logging.** Logger emissions stay at the
  closed-alpha pattern: event name + non-secret reason code +
  bounded counts.
- Telemetry stores: turn id, registry entries fetched (by
  short stable id), token counts, latency, cost estimate,
  error code (if any). It does **not** store the prompt body,
  the completion body, the user's free text, or the model's
  free-text answers.
- A prompt is a **secret-equivalent** for the purposes of this
  doc (it can carry user PII even if the user typed
  inadvertently).

## 12. Cost model

CIE never spends real LLM cost in a state where mock could have
worked.

### 12.1 Mock-first

- The orchestrator's first runtime PR ships against the
  existing `mockAdapter` only. No real provider is wired. The
  mock returns deterministic block recipes for a small set of
  test prompts; nothing else is allowed in `NODE_ENV !==
  "production"` until a real-provider PR explicitly enables it.

### 12.2 Provider adapters later

- A real provider lands behind the existing
  [`LLMAdapter`](../src/server/llm/index.ts) interface, in a
  separate slice with its own security review.
- Provider config (model id, max tokens, base URL) lives in
  env. Env values are **never** inspected by the agent; the
  founder sets them in Supabase / hosting dashboards.

### 12.3 Per-task cost estimate

- Each tool / block has a documented `costClass`: `free`
  (deterministic), `low` (small completion), `medium`
  (completion + a few retrieval entries), `high` (multi-step
  reasoning).
- The orchestrator estimates the turn's cost class before
  dispatch using `approximateTokenCount` (already present in
  `src/server/llm/cost.ts`).
- A turn whose estimate exceeds the configured per-turn cap is
  short-circuited to a `block: out_of_scope` with reason
  `budget_exceeded`. The user retries with a narrower question.

### 12.4 Budget cap

- A daily / monthly cap lives in env. The founder sets it
  out-of-band; the agent does not inspect it.
- When the cap fires, all turns degrade to **deterministic-only
  mode**: the planner uses rule-based retrieval and pre-written
  block recipes; the LLM channel is muted. The user still gets
  useful blocks (search, readiness, wanted-try-request, request
  status). Only the LLM-augmented summarization disappears.
- Cap breach emits a single non-secret log event
  (`cie_budget_exceeded`) per cap period. No prompt body, no
  user identity.

## 13. Phased roadmap

Each phase is a **separate PR sequence**. No phase begins
before the prior phase's invariants are pinned by tests +
observed in tester rounds.

### Phase 1 — deterministic interactive experience

**Status: ready to start (PR sequence below).**

- Block renderer with the allowed block-type vocabulary
  ([§6.1](#61-allowed-block-types)).
- Intent capture surface (textarea + chips) on `/` and
  `/search`.
- Orchestrator with a **deterministic planner** only (no LLM).
  The planner uses `searchService.parse` + rule-based registry
  lookup.
- Tools wired: `searchListings`, `deriveTryCriteria`,
  `createWantedTryRequest`, `createRentalRequest`,
  `showRequestStatus`. All gated behind a feature flag.
- All copy from the closed vocabulary +
  [`copy backlog`](corent_readiness_copy_experiment_backlog.md).
- Banlist + governance pin every assistant string.

### Phase 2 — knowledge registry

- Knowledge-layer modules under `src/server/cie/knowledge/**`
  (proposed).
- Tests pin: each registry entry has a `last_reviewed_at`,
  every `text` slot passes the banlist, no entry references a
  raw row.
- Founder workflow: a registry change is a one-PR slice. Lint
  + banlist + tests run.

### Phase 3 — mock LLM orchestration

- The orchestrator gains a planner adapter that calls the
  existing `mockAdapter`. Mock candidates flow through
  `provenance: "llm_candidate"` blocks that the user confirms.
- The mock can be exercised end-to-end in tester rounds. No
  real cost. No real PII risk.

### Phase 4 — real provider gated

- A real provider implements the same `LLMAdapter` interface.
  Lands in a separate slice with a security review note
  (see [`corent_security_gate_note.md`](corent_security_gate_note.md)).
- Cost telemetry, cap enforcement, and degradation-to-
  deterministic mode ([§12](#12-cost-model)) are tested before
  any real key is provisioned.

### Phase 5 — full interactive product

- Embeddings + vector retrieval (Phase B in
  [§11.2](#112-phase-b--embeddings--vector-store-future)).
- Optional surface expansion: home AI entry as the default
  homepage, `/listings/[id]` chat-augmented FAQ, seller-side
  CIE for chat intake polish.
- The seller demand board ([§7 `showSellerDemandSignals`](#7-tool-orchestration))
  lands here, with a DTO projection + RLS read policy + its
  own security review.

A phase ships only when the prior phase's tester rounds + smoke
runs are stable and copy guardrails are tight.

## 14. Implementation principles

1. **Tests-first.** A feature ships with tests that pin the
   invariant, including the negation of the failure mode.
   Banlist test, source-level guard, and end-to-end test on
   the orchestrator's most common turn.
2. **Docs-first for architecture.** Architectural shifts (new
   layer, new block type, new tool, new provider) start as a
   docs-only PR. Implementation follows.
3. **Runtime guarded by feature flags.** Every CIE surface
   ships behind a flag (`ENABLE_CIE_EXPERIENCE`,
   `ENABLE_CIE_LLM`, `ENABLE_CIE_DEMAND_BOARD`, …). Default off
   in production until the closed-alpha window closes per
   [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md).
4. **No broad redesign until flows are proven.** Visual changes
   gate through the existing
   [`agent_loop.md`](agent_loop.md) approval. CIE rides on the
   BW Swiss Grid v1 system; new components are subtractive
   compositions of existing tokens.
5. **Reversibility over scale.** Every CIE PR is small enough
   that revert is cheap. No multi-PR orchestrator drops.
6. **Authority stays deterministic.** Authority decisions
   (`runIntentCommand`, `requireFounderSession`,
   `resolveServerActor`, projection mappers, banlist) are not
   inside the orchestrator. They are called by the
   orchestrator.
7. **Closed vocabulary at the edge.** Every assistant-emitted
   string ends up in the [readiness copy
   backlog](corent_readiness_copy_experiment_backlog.md) before
   shipping. New strings invented inline at render time fail
   review.
8. **Observability without prompts.** Telemetry never stores
   prompts or completions. Counts and labels only.

## 15. Open questions

These are not blockers for Phase 1, but they have to be answered
before later phases land. Each gets its own future docs-only
slice.

1. **Primary category wedge.** The
   [`category wedge research checklist`](corent_category_wedge_research_checklist.md)
   tracks the data. Decision target: after 2–3 readiness
   rounds. Likely candidates: 마사지건 / 빔프로젝터 / UMPC.
   CIE Phase 1 should not over-fit any single category.
2. **Provider choice.** Anthropic vs. OpenAI vs. open-source
   adapter. Decision target: before Phase 4. Criteria: latency
   in Korean, cost class for the most common CIE turn,
   availability of structured outputs, contractual posture.
3. **Embeddings DB.** Supabase pgvector vs. a dedicated vector
   service (Pinecone / Weaviate / others). Decision target:
   before Phase 5. Criteria: ops cost in the closed-alpha
   window, RLS posture, SDK fit.
4. **Seller demand board timing.** When does the `showSellerDemandSignals`
   tool ship? After how many wanted-try-request signals?
   Decision target: tracked in
   [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md)
   §12.
5. **External commerce / rental links.** Does CIE link to
   Coupang / 11st / 당근마켓 listings when CoRent's inventory
   is empty? Today: no. Linking out gives up the wedge unless
   the link is framed strictly as "이 가격이 합리적인지 비교만
   해 보세요" (price-anchor only, not a purchase CTA). Decision
   target: after the wanted-try-request signal has been
   observed for 4 rounds.

## 16. Cross-references

- Product direction: [`corent_product_direction_v2.md`](corent_product_direction_v2.md)
- Pre-revenue beta posture: [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- Security gate: [`corent_security_gate_note.md`](corent_security_gate_note.md)
- Legal / trust framing: [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- Closed-alpha quality gates: [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
- Externalization architecture: [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
- Functional MVP intent rules: [`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md)
- Product flow completion plan: [`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md)
- Wanted try request slice plan: [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md)
- Copy experiment backlog: [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)
- Category wedge checklist: [`corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md)
- Visual system: [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)

End of architecture plan.

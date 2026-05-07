# Platform Thesis — AI Interaction Layer for complex websites

> **Status:** Current — platform-level product thesis (highest-level
> below `CLAUDE.md` and `docs/README.md`)
> **Scope:** the company-level direction beneath which CoRent and
> all future verticals sit. Defines category, primitives,
> guardrail-first posture, and decision rules for future work.
> **Last reviewed:** 2026-05-07
> **Read before:** any product-direction, CIE, CoRent vertical,
> LLM, payment, trust, design, or external-integration work.
> **Do not use for:** detailed implementation tasks. Slice plans
> stay in their own docs (e.g.
> [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md),
> [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)).
> This document is the **why and what**, not the **how**.

> **Safety posture (2026-05-07).** Safety posture for everything
> in this thesis is governed by
> [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md):
> risk tier model (T0–T5), 10 core safety principles,
> ComponentBlock / Action / KnowledgeSource / LLM /
> InteractionIntent / AuditEvent rules, allow / block lists,
> and a pre-work decision checklist. On safety questions, the
> safety standard wins; on direction questions (category,
> primitives, market wedge), this thesis wins.

---

## 1. One-line thesis

**We turn complex websites into purpose-driven interactive
interfaces.**

> 복잡한 웹사이트를 사용자의 목적 중심 인터페이스로 바꾼다.

The underlying product is an **AI Interaction Layer** that sits
on top of (or alongside) a complex website and renders, for any
given user moment, the smallest set of UI blocks and dispatchable
actions needed to complete the user's actual purpose — under
strict, deterministic guardrails.

It is **not a chatbot**. It is **not a generic AI website
builder**. It is a guarded interaction layer with a small set of
durable primitives that any vertical can be built on top of.

## 2. What changed

CoRent's earlier internal framing was: a Korea-wide **C2C
try-before-buy / rental marketplace MVP**. That framing was
correct as a starting product but understates the underlying
opportunity. The repo and our recent slices have, in effect,
been building primitives — a knowledge registry, a deterministic
planner, block-recipe orchestration, a human-review workflow —
that generalize beyond rental.

The internal thesis is now updated:

- **CoRent is not the company. CoRent is the first vertical
  proof.**
- The company-level product is an **AI Interaction Layer for
  complex websites**.
- The repo continues shipping CoRent. CoRent's surfaces remain
  active and tested. But architectural decisions should now
  prefer **reusable platform primitives** over CoRent-only
  glue, *when the cost is negligible*. (Premature abstraction
  is still bad — see §12 decision rules.)

This is not a re-org. This is a re-naming of what we have been
building all along, with a tighter lens on which seams are
durable and which are vertical.

## 3. The category

We are deliberate about the words because the wrong word puts
us in the wrong evaluation set.

- **AI Interaction Layer** — the canonical category we belong
  to. The product reads a website's domain (knowledge, allowed
  components, allowed actions, guardrails) and produces a
  task-shaped interactive surface for any given user moment.
- **Website Interaction Infrastructure** — the developer-facing
  framing. Sites integrate the layer the same way they integrate
  analytics or auth: as a small, opinionated SDK + a registry
  the host site populates.
- **Purpose-driven Web Interface** — the user-facing framing.
  The user does not browse a menu; the user expresses a purpose
  and receives the interface they need to complete it, with the
  host site's authority preserved.

**Why "chatbot" is the wrong category.** A chatbot's output is a
free-form text answer; success is measured in answer quality.
The Interaction Layer's output is a **bounded set of typed UI
blocks plus a bounded set of dispatchable actions** with the
host site's authority intact; success is measured in **task
completion**. The category difference matters because every
investor / buyer / partner pattern-matches on the word — and
"chatbot" pulls evaluation toward NLG quality benchmarks rather
than completion rates, blast-radius limits, and integration
surface.

Reference framing (do not overclaim — see §10):

- Stripe formed durable primitives (PaymentIntent, etc.) around
  a messy lifecycle so application code only had to handle
  declared states.
- Generative-UI directions describe front-ends assembled in
  real time from the user's behavior, context, and intent.
- "Intelligent front door" customer-self-service framing pushes
  toward effort-reduction and routing to the right resource —
  not toward longer answers.

We borrow the **discipline of typed primitives** from those
reference points; we do not borrow the scope.

## 4. The primitive model

The platform's durable surface is a small set of typed
primitives. Each primitive has a one-sentence definition, a
reason to exist, the closest analog already living in this repo,
and what it becomes at the platform level.

### KnowledgeSource

- **Definition.** A registered, structured, host-authored bundle
  of safe knowledge that describes one task, one audience, one
  surface.
- **Why it exists.** The model needs ground-truth, host-bounded
  content to plan against. Free retrieval over the open web is
  the wrong shape.
- **Repo analog today.** [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts) — typed
  cards with `audience` × `surface` × `intentKind`, allowed and
  forbidden claims, suggested blocks, related actions.
- **Future platform meaning.** A registry every host site
  populates — versioned, reviewed, banlist-clean, optionally
  multi-tenant — that the planner reads as its primary context
  source.

### ComponentBlock

- **Definition.** A typed, recipe-driven UI block with a closed
  set of slots. Hosts implement renderers for each block type.
- **Why it exists.** The AI must never emit raw HTML. It picks
  from a closed vocabulary of host-implemented blocks; the host
  controls the actual render.
- **Repo analog today.** The 9 block-recipe types in [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
  (`intent_summary`, `try_criteria`, `listing_matches`,
  `wanted_request_cta`, `listing_readiness`, `request_status`,
  `seller_readiness`, `founder_feedback_review`, `safety_note`).
- **Future platform meaning.** A general block library +
  versioned host-supplied extensions. Recipes are
  discriminated-union JSON; renderers live with the host.

### Action

- **Definition.** A registered, parameter-validated host
  capability the layer is allowed to propose or dispatch.
- **Why it exists.** "Click for me" without a registry equals
  arbitrary code execution. With a registry, the layer's tool
  surface is bounded.
- **Repo analog today.** The `CIE_RELATED_ACTIONS` list:
  `search_listings`, `derive_try_criteria`,
  `create_wanted_request`, `create_rental_request`,
  `create_seller_draft`, `show_request_status`,
  `show_seller_demand_signals_future`, `update_feedback_status`.
- **Future platform meaning.** A typed action registry with
  per-action argument schemas, confirmation policies, audit
  trail, and reversibility metadata.

### Guardrail

- **Definition.** Composable, host-configurable rules that
  validate every block, action, and string before render or
  dispatch.
- **Why it exists.** A guarded interaction layer is the product
  category. Without strict validation we are a chatbot with
  buttons.
- **Repo analog today.** Banlist scans (`copyGuardrails.test.ts`),
  `assertNoBannedClaimsInKnowledgeRegistry`,
  `assertNoBannedClaimsInCIEPlan`, `validateCIEPlan`, the closed
  vocabularies in the registry + planner.
- **Future platform meaning.** A guardrail registry — copy
  banlists, DTO projections, authority gates, payment-language
  policy, regulated-language policy, exact-address redaction —
  that hosts compose and the planner consumes.

### Planner

- **Definition.** The pure function that turns a (user × surface
  × intent × context) tuple into a deterministic plan: which
  KnowledgeSources apply, which ComponentBlocks to render, which
  Actions are reachable.
- **Why it exists.** Determinism is the host's authority anchor.
  Even when an LLM later contributes candidates, the deterministic
  plan is the baseline we diff against.
- **Repo analog today.** [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
  — `planCIEExperience(input) → CIEPlan`, byte-stable per input.
- **Future platform meaning.** A two-stage planner: a strict
  deterministic baseline + a candidate-only LLM channel that
  proposes recipes against the same shape. Authority remains
  on the deterministic side; LLM candidates are reviewed
  before they ship to the user.

### HumanReview

- **Definition.** A small set of typed workflows where a
  human (host operator / founder / domain expert) reviews
  candidate items, approves or archives, and the result feeds
  back into the layer's plan.
- **Why it exists.** Domains where AI authority is unsafe
  (regulated copy, sensitive intent, ambiguous match) need a
  bounded, observable place where a human stays in the loop.
- **Repo analog today.** [`FeedbackReviewControls`](../src/components/FeedbackReviewControls.tsx)
  + the founder-only `updateFeedbackStatusAction`. Feedback
  rows transition `new → reviewed → archived`; founder cockpit
  is the only reader.
- **Future platform meaning.** A typed HumanReview workflow
  primitive: queue, transitions, allowed reviewers, audit
  trail, reversibility — composable across verticals.

### AnalyticsEvent

- **Definition.** A small, taxonomy-bounded set of typed events
  emitted by every block render and every action dispatch.
  Counts and labels only.
- **Why it exists.** Without event taxonomy you cannot improve
  task completion. Without rules on what is loggable you leak
  PII into telemetry.
- **Repo analog today.** Existing logger pattern (event name +
  non-secret reason code only); no raw prompt logging is
  written into either CIE module.
- **Future platform meaning.** An event taxonomy registry —
  per-block render, per-action dispatch, per-guardrail violation,
  per-human-review transition — exposed as a stable analytics
  surface for hosts.

### Integration

- **Definition.** The seam through which an external host site
  registers KnowledgeSources, ComponentBlocks, Actions, and
  Guardrails, and through which the layer reads the host's
  current user state (auth, locale, surface).
- **Why it exists.** A pure registry is useless unless the host
  can actually plug into it. The integration shape is the API
  contract every vertical must respect.
- **Repo analog today.** None yet — CoRent is the first vertical
  and lives in the same repo. The integration is implicit
  (direct module imports). The shape is still being learned.
- **Future platform meaning.** A small SDK + a server-side
  contract: `registerKnowledge(...)`, `registerComponent(...)`,
  `registerAction(...)`, `registerGuardrail(...)`,
  `getUserContext()`. JS-snippet and full-SDK distribution
  patterns are future, gated decisions (§9).

## 5. CoRent as first vertical

CoRent's vertical purpose is **AI-guided try-before-buy commerce
flow**. It is the domain we use to sharpen the platform
primitives, because it is high-stakes (payment-adjacent), needs
calm copy (regulated-language risk), needs a human-review loop
(wanted-item triage), and is small enough to ship in slices.

### Mapping CoRent objects to platform primitives

| CoRent surface today | Platform primitive | Notes |
| --- | --- | --- |
| `SearchIntentSummary` | **IntentSummaryBlock** | Echoes parsed intent + try criteria; closed vocabulary already pinned by tests. |
| `WantedTryRequestForm` | **UnmetIntentCaptureBlock** | Captures demand when no listing matches; writes through a single registered Action (`create_wanted_request`). |
| `FeedbackReviewControls` | **HumanReviewWorkflow** | `new → reviewed → archived` transitions, founder-only via `requireFounderSession`. |
| `TryBeforeBuyReadiness` | **PreActionChecklistBlock** | Closed-vocabulary "things to validate before this action" derived deterministically from category. |
| `SellerListingReadiness` | **SupplierReadinessBlock** | Closed-vocabulary "things the supplier should clarify before exposing the listing"; status-aware footer. |
| `knowledgeRegistry.ts` | **KnowledgeSource registry** (typed cards) | 8 v1 cards; closed audience × surface × intent; banlist-clean. |
| `deterministicPlanner.ts` | **Planner** (deterministic baseline) | Pure function (input × surface × intent × context) → 9-type block-recipe union + sorted action list. |
| Banlist + `copyGuardrails.test.ts` + `assertNoBannedClaimsInCIEPlan` | **Guardrail registry** (closed-alpha CoRent profile) | Vertical-specific policy on top of the platform primitive. |
| Server logger event codes | **AnalyticsEvent** (early) | Event-name + non-secret reason-code shape exists; no prompt body / PII; not yet a typed taxonomy. |
| (none yet) | **Integration** | CoRent is in-repo today; the integration seam is implicit. |

This mapping is informational. It does not authorize a renaming
spree or a refactor. The point is to track which CoRent objects
are platform-shaped and which are vertical-shaped, so we can
graduate the right ones at the right time.

## 6. What we should build generically vs vertically

A small triage table to keep us honest while CoRent stays the
visible product.

| Platform primitive (build generic) | CoRent vertical (build specific) | Defer |
| --- | --- | --- |
| Knowledge registry + closed audience/surface/intent vocab | Category labels, try-before-buy criteria, rental request lifecycle copy | Real LLM provider + key handling |
| Deterministic planner (block recipes + action list) | Wanted-item flow, seller listing readiness panel | Embeddings / vector store |
| Action registry + per-action argument shapes | `create_wanted_request`, `create_rental_request`, `update_feedback_status` argument schemas | External JS-snippet / SDK distribution |
| Guardrail validation + banlist scan + DTO projection | Closed-alpha banlist, regulated-language ban, contact-email founder-only DTO | Multi-tenant host config + per-tenant guardrails |
| Human review workflow primitive (typed transitions) | Founder cockpit feedback review (`new → reviewed → archived`) | Multi-reviewer / role-based review |
| Analytics event taxonomy primitive | Per-CoRent-action event names + reason codes | Cross-tenant analytics rollups |
| Block recipe union + renderer contract | `SearchIntentSummary`, `WantedTryRequestForm`, `FeedbackReviewControls`, readiness cards | Generative UI playground / authoring tool |
| - | - | Payment / PG integration |
| - | - | Trust / underwriting / claim system |
| - | - | Legal multi-tenant terms |

The rule is conservative: a primitive **graduates** to the
platform side only when (a) two or more verticals would clearly
need it, or (b) keeping it vertical-specific creates a bigger
repeat-cost than the abstraction's review cost. CoRent is one
vertical today; only seams that already feel reused (registry,
planner, banlist, human-review transitions, action argument
schemas) belong on the platform side.

## 7. Guardrail-first thesis

The product category lives or dies on guardrails. The thesis,
restated as rules:

- **AI must not emit arbitrary HTML.** It picks block types from
  a closed union (`CIE_ALLOWED_BLOCKS`). The host renders.
- **AI must choose from registered ComponentBlocks.** The recipe
  schema rejects unknown types at the boundary
  (`validateCIEPlan`).
- **AI must not execute arbitrary actions.** Every dispatched
  call name is in the action registry (`CIE_RELATED_ACTIONS`).
- **AI must not invent action arguments.** Each Action's
  per-argument shape is validated; the dispatcher refuses
  unknown keys (mirrors the existing payload pattern in
  `submitFeedback` / `publishListing` / `updateFeedbackStatus`).
- **High-risk actions require user confirmation and/or human
  review.** Confirmation surfaces are part of the renderer's
  contract; HumanReview is a first-class primitive (§4).
- **Deterministic systems own authority.** Status transitions,
  pricing, persistence, projections, banlist enforcement,
  founder-allowlist gating, RLS deny-by-default — all live in
  the deterministic / typed-server side. The planner writes
  nothing.
- **LLM is candidate-only until explicitly promoted.** A real
  provider lands behind the existing `LLMAdapter` interface in a
  separately-gated slice with a security review. Until then,
  every authority claim flows through the deterministic baseline.

## 8. Market wedge

We are **not** going government-first. We are **not** going
"all websites" first. CoRent is the internal vertical proof so
the primitives are forced through a real, concrete domain
before we open the platform to external hosts.

Future external-wedge candidates (informational, **future
scope, not authorized today**):

- university international office / visa guide
- foreigner HR / visa admin support
- hospital foreigner admin guide
- government support program guide
- complex B2B SaaS onboarding

The decision on the next external wedge after CoRent is open
(§15). What is fixed is the shape of the wedge: a domain where
(a) users have a complex, unfamiliar purpose, (b) the host has
authority that must be preserved, (c) free-form text is the
wrong UI, and (d) blast radius is bounded by registered
KnowledgeSources / Components / Actions / Guardrails.

## 9. Stripe analogy, carefully

We do **not** claim "we are Stripe." Different category, different
scope. What we borrow is the **method**:

- Stripe's lesson is to create durable primitives around messy
  workflows. PaymentIntent models the lifecycle of a single
  payment attempt — a stable API on top of a moving substrate
  (issuer, network, 3DS, retry) — so application code only
  handles declared states.
- Our equivalent ambition is **purpose-driven website
  interaction**, not payments. The substrate we are taming is
  not card networks; it is **website complexity + AI
  hallucination + arbitrary action execution**.
- Our durable primitives are **KnowledgeSource, ComponentBlock,
  Action, Guardrail, Planner, HumanReview, AnalyticsEvent,
  Integration** (§4). They model the lifecycle of a user's
  intent through a guarded interaction layer.

This is the only useful analogy: discipline of primitives. We
are not building payments, not building auth, not building
regulated infrastructure. The analogy is a framing tool, not a
positioning claim.

## 10. Relationship to CIE

**CIE** ("CoRent Interactive Experience") is the current
**internal implementation name** for the platform thesis. The
naming is intentional during the closed-alpha window: keeping
the internal label CoRent-flavored avoids over-promising the
platform externally before it is ready.

- [`docs/corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
  is the current implementation architecture for CIE — block
  recipes, tool list, deterministic-vs-LLM split, 5-phase
  roadmap. That document remains correct as **how**.
- [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts)
  + [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
  are the first two code seams of the platform primitives, even
  though the path lives under `cie/` for now.
- CoRent UI surfaces (`/`, `/search`, `/listings/[id]`,
  `/requests`, `/dashboard`, `/admin/cockpit`) are current
  **consumers / proofs** of those primitives. Runtime wiring
  remains incremental (Phase 1 deterministic interactive
  experience).

When the platform thesis graduates publicly, "CIE" can be
re-namespaced; the modules stay shaped the same.

## 11. Decision rules for future work

Before authoring any new feature, the author asks these
questions in order. A "no" early in the list means the work
needs reshaping or rejection.

1. **Is this a platform primitive or only CoRent-specific?**
   Identify which of §4's 8 primitives the work belongs to. If
   it doesn't fit any, examine whether the work is actually
   CoRent vertical glue — that's fine, just label it.
2. **Can it be expressed as KnowledgeSource / ComponentBlock /
   Action / Guardrail / Planner / HumanReview /
   AnalyticsEvent / Integration?** If not, the shape is wrong —
   reshape before shipping.
3. **Does it preserve deterministic authority?** Status,
   pricing, projection, allowlist, RLS, banlist must remain in
   typed deterministic code paths. The new feature does not
   move authority into a candidate channel.
4. **Does it avoid arbitrary AI UI/action execution?** Every
   render path goes through a registered ComponentBlock; every
   dispatch goes through a registered Action.
5. **Does it improve task completion rather than just answer
   quality?** Answer-quality wins are nice; task-completion
   wins are the product. If a feature optimizes only chat-style
   answers, reshape it toward the action it leads to.
6. **Is it reversible?** Schema changes, RLS policy changes,
   payment / settlement / claim writes are not. Defer or split
   the irreversible part.

If all six questions pass, the feature is either a primitive
or a vertical proof. If any fail, the feature is reshaped or
rejected.

## 12. Non-goals

Plain list. We do not build any of these in the current window:

- chatbot clone / NLG-first product
- free-form AI website builder
- arbitrary HTML or Markdown generation that reaches the user
- full browser automation / "click anywhere" agent
- autonomous transaction execution
- government-procurement-first go-to-market
- real LLM provider before security gate clears
- payment / trust / legal commitment before founder decision
- broad visual redesign before UX review
- multi-tenant SaaS distribution before the first external
  wedge is chosen

Any of these may become a future scope, but each requires a
separately-gated slice with its own doc.

## 13. Near-term implications

What changes in current work, given this thesis:

- **Continue CoRent.** The vertical stays. Its surfaces
  (`/search`, `/listings/[id]`, `/requests`, `/dashboard`,
  `/admin/cockpit`, `/login`, `/admin/login`) ship and tester
  rounds continue.
- **Keep building CIE primitives under `src/lib/cie/`** when the
  marginal cost is small. Today: knowledge registry + planner.
  Soon: action argument schemas, HumanReview workflow primitive,
  AnalyticsEvent taxonomy.
- **Keep runtime UX slices small and test-heavy.** No "platform
  ceremony" inside CoRent UI components. Wiring CIE primitives
  into a CoRent surface is its own slice with its own tests.
- **Treat
  [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
  as implementation architecture** — block recipes, tool list,
  phased roadmap. It does **not** redefine the company.
- **Treat this thesis doc as higher-level product direction.**
  When this doc and a CoRent-only doc disagree, this doc wins
  on platform questions, the CoRent doc wins on CoRent questions.
- **Future design work should express the platform thesis
  visually.** Not now. The BW Swiss Grid v1 system stays the
  current visual system; visual-system change is a gated
  approval per [`agent_loop.md`](agent_loop.md).

## 14. Non-goals for this doc

This document is a **direction**, not a backlog. It deliberately
does not:

- declare timelines or milestones for any external wedge;
- prescribe SDK or JS-snippet shape;
- choose a public product name;
- approve any new dependency, env var, or schema change;
- override the closed-alpha quality gates in
  [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md);
- override the security gate in
  [`corent_security_gate_note.md`](corent_security_gate_note.md);
- move CoRent into "deprecated" status. CoRent is alive and
  active.

## 15. Open questions

These are tracked as open. Each will get its own docs-only PR
to record the decision when it's made.

1. **Product / company name.** Public name for the platform —
   distinct from "CoRent"? Internal "CIE" is a placeholder.
2. **CoRent's public identity.** Does CoRent remain a public
   brand, or become a vertical demo behind the platform brand?
3. **First external wedge after CoRent.** University international
   office / foreigner HR / hospital admin / government support /
   complex B2B onboarding — which one, and on what evidence?
4. **Pricing model for the AI Interaction Layer.** Per-MAU,
   per-action, per-tenant flat, hybrid? Strongly downstream of
   the first external wedge.
5. **Multi-tenant + security architecture timing.** When does
   the platform stop being one-host (CoRent-only) and become
   multi-tenant? Each item in the [`corent_security_gate_note.md`](corent_security_gate_note.md)
   list applies — and a few new items appear once a second host
   is involved.
6. **Distribution shape — JS snippet vs SDK vs both.** Tightly
   coupled to (3). A JS snippet has the shortest integration
   path; an SDK has the strongest guardrail surface. We don't
   commit to either yet.

End of platform thesis.

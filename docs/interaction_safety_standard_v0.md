# Interaction Safety Standard v0

> **Status:** Current — internal product safety standard
> **Scope:** safety posture for the AI Interaction Layer (the
> platform-level product). Governs every CIE primitive, every
> LLM-channel decision, every Action / ComponentBlock /
> KnowledgeSource / HumanReview / AnalyticsEvent / Integration
> we register, and every external-customer or high-trust
> vertical we choose to support.
> **Last reviewed:** 2026-05-07
> **Read before:** any CIE or platform-primitive work; any LLM
> integration or provider work; any new Action or block recipe
> wired to write data; any external-customer integration or
> snippet/SDK work; any analytics or audit-event work; any
> high-trust vertical work (public, healthcare, finance, legal,
> immigration, insurance, tax, HR).
> **Do not use for:** legal certification claims, external
> compliance claims, audit attestations, or marketing collateral.
> This is an **internal product safety standard**, not a
> certification.

---

## 1. One-line standard

> **AI may assist website interaction only through registered
> knowledge, approved components, registered actions,
> deterministic authority, and reviewable logs.**

> AI는 등록된 지식, 승인된 컴포넌트, 등록된 액션, 결정론적
> 권한, 검토 가능한 로그 안에서만 웹사이트 상호작용을 도울 수
> 있다.

Everything else in this document is the long form of that
sentence.

## 2. Why this standard exists

The AI Interaction Layer described in
[`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
runs on someone else's website and may, given enough time,
influence what users decide and what hosts convert. Some of the
verticals we want to support eventually touch high-trust
workflows (public services, healthcare, finance, immigration,
HR). Two facts follow:

1. **Safety must be built into primitives, not patched later.**
   A guarded surface that occasionally bypasses its guards is a
   chatbot with extra steps. The product's identity depends on
   guardrails living *inside* the primitive contracts — typed
   block recipes, registered actions, validated argument shapes,
   banlist scans, deterministic authority — rather than as
   external review checklists.
2. **Trust is non-fungible across verticals.** A safety failure
   in CoRent does not stay in CoRent. We are designing a
   platform; the lessons codified here apply to every future
   host site. This is why the standard sits one tier below
   `CLAUDE.md` and the platform thesis, and one tier above
   the project-specific quality gates.

The standard is intentionally version-pinned (`v0`) to make
future amendment explicit. A v1 will land when the first
external-customer integration is in scope.

## 3. External references, carefully

We borrow vocabulary and shape from established frameworks. We
**do not** claim certification or compliance.

- **OWASP Top 10 for LLM Applications** (LLM01 prompt injection,
  LLM02 insecure output handling, LLM03 training-data poisoning,
  LLM04 model DoS, LLM05 supply chain, LLM06 sensitive
  information disclosure, LLM07 insecure plugin design, LLM08
  excessive agency, LLM09 overreliance, LLM10 model theft).
  These are reference categories. Our primitives (Guardrail,
  KnowledgeSource provenance, Action registration, candidate-
  only LLM channel, prompt/output rules) map to several of
  them by design.
- **NIST AI Risk Management Framework (AI RMF 1.0)** — the
  identify / measure / manage / govern lens for AI risk and
  trustworthiness. We use it as a structural reminder that
  identification (risk tiers, §6) and measurement (logged
  blocks, §12) must happen before management (deterministic
  authority, human review).
- **ISO/IEC 42001 — AI management system direction.** A
  systematic shape for AI policies, roles, change control, and
  continuous improvement. We borrow the orientation toward
  durable internal governance, not the certification surface.

**We are not certified against any of these frameworks. We do
not claim compliance today.** They are conceptual references
that shape this standard's vocabulary. External claims about
compliance/certification require a separate, founder-approved
slice with legal review.

## 4. Core safety principles (10)

Each principle is enforced **inside** a primitive whenever
possible — at the boundary, not in a checklist.

### 4.1 No arbitrary UI

- **Rule.** AI may not emit raw HTML, raw Markdown, or any UI
  shape outside the closed `CIEBlockRecipe` union. The host
  renders.
- **Why.** Arbitrary UI is the chatbot category we are not. It
  also reintroduces XSS risk and breaks BrandProfile control.
- **Repo analog.** [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
  — 9 typed block recipes; `validateCIEPlan` rejects unknown
  `block.type`.
- **Future enforcement.** Block-recipe schema published as part
  of the host SDK; the renderer contract is `(recipe) → DOM`,
  no string concatenation path exists.

### 4.2 No arbitrary action

- **Rule.** AI may not invoke a callable not present in the
  registered Action list. AI may not invent action arguments.
- **Why.** "Click for me" without a registry is arbitrary code
  execution. Excessive agency (LLM08 in OWASP terms) maps here.
- **Repo analog.** `CIE_RELATED_ACTIONS` in
  [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts);
  `validateCIEPlan` rejects out-of-vocab `relatedAction`.
- **Future enforcement.** A typed Action registry with per-
  action argument schemas and a dispatcher that validates
  every key against the schema before forwarding.

### 4.3 Source-backed knowledge

- **Rule.** Every claim a block surfaces must be traceable to a
  registered KnowledgeSource via `sourceCardId`. No block
  emits a free-text claim without a source link.
- **Why.** Hallucinated claims on someone else's website are
  the platform's worst failure mode.
- **Repo analog.** `sourceCardId` on every block recipe (§4 of
  CIE arch); registry cards carry `id`, `title`, `safeSummary`,
  `allowedClaims`, `forbiddenClaims`.
- **Future enforcement.** Source-required policy per block
  type; renderer optionally surfaces an "출처 / source" affordance
  for high-risk blocks.

### 4.4 Deterministic authority

- **Rule.** Status, pricing, projection, allowlist, RLS,
  banlist, and any other authority-bearing field is owned by
  typed deterministic code paths. The planner writes nothing.
- **Why.** Authority must not migrate into a candidate channel.
- **Repo analog.** `runIntentCommand`, `requireFounderSession`,
  `resolveServerActor`, public-projection mappers, banlist
  tests; `deterministicPlanner.provenance: "deterministic"`.
- **Future enforcement.** Type-level separation: deterministic
  modules never import candidate modules; candidate modules
  cannot persist.

### 4.5 LLM candidate-only

- **Rule.** LLM output is `provenance: "llm_candidate"` until a
  deterministic pass has reviewed it (or a human has reviewed
  it for high-risk paths).
- **Why.** LLM outputs are advisory until promoted; promotion
  is itself a tracked event.
- **Repo analog.** LLM types in [`src/server/llm/types.ts`](../src/server/llm/types.ts)
  enforce `provenance` on every candidate; the
  `mockAdapter` / future provider adapter slot returns
  candidates only.
- **Future enforcement.** The orchestrator's promotion step
  emits an `AnalyticsEvent` and routes high-tier candidates to
  HumanReview before render.

### 4.6 Human review for high-risk flows

- **Rule.** Tier 3+ flows (§6) require a typed HumanReview step
  with allowed reviewer, transitions, and audit trail.
- **Why.** Some domains (regulated copy, sensitive intent,
  ambiguous match) are not safe for candidate-only authority
  even with deterministic checks.
- **Repo analog.** Founder feedback review workflow:
  `FeedbackReviewControls` + `updateFeedbackStatusAction` +
  `feedback_status` enum (`new → reviewed → archived`).
- **Future enforcement.** A typed `HumanReviewWorkflow`
  primitive: queue, transitions, allowed reviewers, audit
  trail, reversibility flag.

### 4.7 PII minimization

- **Rule.** No primitive stores or logs PII it does not need.
  No primitive surfaces PII to a layer that does not need it.
  No DTO carries `contactEmail` / `profileId` / `borrowerId` /
  `sellerId` / `exactAddress` / `payment` / `settlement` /
  `rawPrompt` / `messages` / `system` slots.
- **Why.** OWASP LLM06 sensitive information disclosure; NIST
  AI RMF "manage" lens; vertical-specific privacy law.
- **Repo analog.** Tight DTOs in `feedbackRepository.ts`,
  `submitFeedback.ts`, `updateFeedbackStatus.ts`,
  `publishListing.ts`; 26-slot forbidden-field test in
  `knowledgeRegistry.test.ts` and `deterministicPlanner.test.ts`.
- **Future enforcement.** Per-primitive slot allowlists,
  enforced by tests; per-host config that further narrows
  allowed fields per integration.

### 4.8 Prompt / output security

- **Rule.** Raw prompts and raw model outputs are not logged by
  default. Outputs are validated against the host's banlist
  before render. Inputs going to a real provider are scoped to
  the minimum needed.
- **Why.** OWASP LLM01 prompt injection (do not trust
  untrusted input as instruction), LLM02 insecure output
  handling (do not trust LLM output as code or copy), LLM06
  sensitive information disclosure (do not log secrets).
- **Repo analog.** Closed-alpha banlist (`copyGuardrails.test.ts`),
  `assertNoBannedClaimsInKnowledgeRegistry`,
  `assertNoBannedClaimsInCIEPlan`, server logger pattern (event
  name + non-secret reason code only).
- **Future enforcement.** Output validators that span every
  user-facing string slot in every block type before render;
  per-tier prompt-and-tool-policy templates fed to the
  provider; redaction layer on inputs that may contain user
  PII.

### 4.9 Auditability

- **Rule.** Every block render, every action dispatch, every
  human-review transition emits a typed AnalyticsEvent. The
  event carries labels and ids only — no raw prompt body, no
  user PII.
- **Why.** Without auditable events you cannot improve task
  completion; without rules on what is loggable you leak PII
  into telemetry.
- **Repo analog.** Server logger event-code pattern; founder
  cockpit's read of `feedback_submissions` rows.
- **Future enforcement.** A typed event taxonomy registry
  (`AnalyticsEvent` primitive in §4 of platform thesis); per-
  event field allowlist; retention policy.

### 4.10 Task-completion measurement

- **Rule.** The platform's success metric is **task
  completion**, not chat-message count or NLG quality. Every
  user goal becomes an `InteractionIntent` (§11) with an
  explicit lifecycle and resolution outcome.
- **Why.** Chat-message counts mislead optimization. Task
  completion is the only metric a host's CFO recognizes.
- **Repo analog.** `feedback_submissions` `status` workflow
  is a coarse early shape; existing rental request lifecycle
  is the sharper one.
- **Future enforcement.** Per-tier completion definitions;
  AnalyticsEvent shape carries an `intentId`.

## 5. Risk tier model

The standard organizes work by **what could go wrong** rather
than by surface or audience. Every Action and every block
inherits a tier from its declared risk.

| Tier | Description | Allowed by default? | Required guardrails | Human review | Logging | May current project build it now? |
| --- | --- | --- | --- | --- | --- | --- |
| **Tier 0** | Read-only public guidance (FAQs, definitions, links to source pages, "what to expect") | Yes | source-backed knowledge; banlist scan; deterministic copy | No | per-render AnalyticsEvent (label + sourceCardId only) | Yes |
| **Tier 1** | Lead capture / low-risk CTA (newsletter signup; "ask a question"; **wanted-try-request** signal) | Yes, with confirmation | source-backed; banlist; explicit submit affordance; per-action argument schema; DTO discipline | No (founder triage downstream is fine) | per-dispatch AnalyticsEvent + audit row in the destination table | Yes — limited shape only (CoRent wanted-try-request is the canonical case) |
| **Tier 2** | Authenticated user workflow on the host (rental request submission, review of one's own state, founder-only operations) | Only via host's own auth surfaces | host auth + actor resolution + per-action allowlist + DTO discipline + banlist | No for the user's own data; **Yes** for any operator workflow that touches another user's data | per-action AnalyticsEvent; host audit row | Yes — only for existing CoRent closed-alpha patterns (`/dashboard`, `/admin/cockpit`, request lifecycle) |
| **Tier 3** | External integration / outbound-side-effect actions (CRM write, calendar create, ticket file, webhook to a third party) | **No.** Requires founder approval and a separately-gated security review | tier 2 + reversibility metadata + signed integration contract + rate limit + provider-failure handling | **Yes** for the first N events; sampling thereafter only with explicit policy | per-action AnalyticsEvent + integration log + delivery status | **No.** Out of current scope — wait for the first external-wedge decision (open question §15 of platform thesis). |
| **Tier 4** | High-trust workflow in regulated or socially sensitive domains (public services, healthcare, finance, legal, immigration, insurance, tax, HR) | **No** | tier 3 + domain-expert source-of-truth review + jurisdiction-aware copy policy + explicit "this is not advice" framing where applicable + escalation to human handoff | **Yes**, with role-based reviewers | per-action AnalyticsEvent + domain-required retention | **No.** Out of current scope — explicitly listed as a future-only direction. |
| **Tier 5** | Transaction / payment / legally binding submission / irreversible action | **No** | tier 4 + partner contract + PG/regulatory integration + tested rollback / dispute path + signed-by-user evidence | **Yes**, with two-party review where applicable | per-action AnalyticsEvent + immutable audit + retention per jurisdiction | **No.** Forbidden in the current window per [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) and the platform thesis non-goals. |

**Current answer summary**: Tier 0 and a limited Tier 1 (the
existing wanted-try-request pattern) may be built. Tier 2 only
where the existing CoRent closed-alpha patterns already shipped
(magic-link / password sign-in, founder cockpit, server-mode
listings, request lifecycle through `seller_approved` /
`seller_cancelled`). Tier 3+ require explicit founder approval
and a separate security gate. Tier 5 is forbidden.

## 6. ComponentBlock safety rules

- **Registered.** Every block type lives in `CIE_ALLOWED_BLOCKS`
  (or its successor on the platform side). The recipe schema
  rejects unknown types at the boundary.
- **Length-capped text slots.** Every text slot has a maximum
  length declared at the type level. Renderer truncation is a
  bug, not a feature.
- **No raw HTML / Markdown from LLM.** LLM-emitted strings are
  treated as untrusted plain text and pass through the host
  renderer's typography path only.
- **Renderer owns appearance.** Block recipes carry typed data
  fields; the host's renderer maps fields to BW Swiss Grid (or
  the host's design tokens). The recipe never carries CSS,
  className, or style information.
- **BrandProfile may style; cannot disable safety copy.** A
  future BrandProfile primitive may swap typography tokens or
  reorder visible blocks but **cannot** suppress the
  `safety_note` recipe, the source-of-truth caption, or any
  block flagged as required.
- **Allowed data fields declared.** Each recipe variant lists
  its allowed slots in the typed union. The forbidden-slot
  test (`contactEmail`, `profileId`, `payment`, etc.) runs on
  every emitted block.
- **High-risk blocks require a source note or review note.**
  Tier 3+ blocks must carry either a `sourceCardId` resolving
  to a registered KnowledgeSource OR a `reviewedBy` reference
  resolving to a HumanReview decision. Both is acceptable;
  neither is not.

Repo anchor: [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
+ [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts).

## 7. Action safety rules

- **Registered.** Every callable lives in `CIE_RELATED_ACTIONS`
  (or its successor). The dispatcher rejects unknown ids.
- **Risk tier declared.** Each Action declares its tier (0–5).
  The dispatcher uses the tier to choose the confirmation /
  review / logging policy.
- **Required confirmation declared.** Tier 1+ actions declare
  whether user confirmation is required, what the confirmation
  copy says, and whether the confirmation is reusable across
  similar actions.
- **Allowed input fields declared.** Each Action has a typed
  argument schema; the dispatcher rejects keys not in the
  schema (mirroring the existing payload pattern in
  `submitFeedback`, `publishListing`, `updateFeedbackStatus`).
- **No raw prompt / message as authority.** Action arguments
  must be the validated, typed shape — never the raw user
  message, the raw LLM output, or the raw conversation
  history. (OWASP LLM01 / LLM08.)
- **Execution is logged.** Every dispatch emits an
  AnalyticsEvent with action id, tier, outcome label (success /
  failure / blocked), and a non-secret reason code. No payload
  echo.
- **High-risk actions require human review or explicit user
  confirmation.** Tier 3+ requires HumanReview; Tier 1+
  requires user confirmation.
- **No hidden action execution.** A planner emitting a
  `confirm` block proposes; only the user confirming dispatches.
  An LLM channel never dispatches directly.

Repo anchors: `submitFeedbackAction`,
`updateFeedbackStatusAction`, `publishListingAction`,
`submitRentalRequestAction` (renter-side request), the
seller approve/decline actions.

## 8. KnowledgeSource safety rules

- **Source type declared.** Every entry declares its source
  type (e.g. `internal_doc`, `host_authored_faq`,
  `regulatory_quote`, `vendor_specsheet`,
  `community_inferred`, `third_party_url`). Higher-trust types
  outrank lower-trust types in the planner.
- **Freshness tracked where relevant.** Time-sensitive entries
  (regulatory quotes, prices, deadlines) carry a
  `last_reviewed_at` and a `freshness_window`. Stale entries
  must degrade to `safety_note` "다시 확인해 주세요" framing
  before the planner uses them.
- **Official / high-priority sources outrank uploaded loose
  docs.** When two sources conflict, the higher source-type
  wins; tie-breaking is documented per host.
- **Conflicting sources degrade to uncertainty / handoff.**
  When the conflict is unresolvable at registration time, the
  planner emits a `safety_note` recipe + a HumanReview handoff
  rather than a confident answer.
- **No unsupported claims.** A KnowledgeSource entry's
  `allowedClaims` are reviewed in PR; a card whose claim is
  not derivable from a registered source fails review.
- **No source-free high-risk answer.** Tier 3+ output that
  doesn't have a `sourceCardId` is blocked at planner level.

Repo anchor: 8 v1 cards in
[`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts);
`validateCIEKnowledgeRegistry` flags structural drift.

## 9. LLM safety rules

- **Outputs are candidates only.** Every output carries
  `provenance: "llm_candidate"` until a deterministic pass or
  a HumanReview promotes it. The deterministic baseline is
  always computed; the LLM channel is layered on top.
- **No authority decisions.** The LLM never decides status,
  pricing, projection, allowlist, payment, settlement,
  capability, role, or claim outcome.
- **No hidden actions.** The LLM cannot dispatch an Action
  directly; it can only propose a block recipe (e.g. a
  `confirm` recipe) that the user confirms.
- **Minimum PII.** The LLM context window contains only the
  KnowledgeSources the planner selected for the current intent
  and the safe public projection of any DTO. No raw rows,
  no `contactEmail`, no `profileId`, no `payment` /
  `settlement` slots.
- **Prompts and raw messages are not logged by default.**
  Logging stores token counts, label, and a non-secret reason
  code. Prompt body / completion body are off by default and
  require an opt-in route with retention policy.
- **Provider use requires security review.** A real provider
  ships behind the existing `LLMAdapter` interface in a
  separately-gated slice (see
  [`corent_security_gate_note.md`](corent_security_gate_note.md))
  with its own threat model and retention plan.
- **Fallback is deterministic.** Every LLM-using flow has a
  deterministic fallback path that ships even when the
  provider is offline or budget-capped.
- **Budget / cost guardrail.** A real provider lands with a
  per-turn cost estimator, a per-tenant cap, and a degrade-to-
  deterministic-only mode when the cap fires (CIE arch §12.4).

Repo anchor: [`src/server/llm/types.ts`](../src/server/llm/types.ts)
+ [`src/server/llm/invoke.ts`](../src/server/llm/invoke.ts)
+ [`src/server/llm/mockAdapter.ts`](../src/server/llm/mockAdapter.ts).

## 10. InteractionIntent safety rules

`InteractionIntent` is the platform-level wrapper for "the user
wants to accomplish X here." It is **defined now** (this doc)
even though no `InteractionIntent` table or class exists yet —
because the safety rules below should be designed in before the
code lands.

- **Every user goal becomes an InteractionIntent.** The
  platform never operates on a free-floating message. The
  planner reads an intent (current state + audience + surface +
  resolution target); the LLM proposes against it.
- **Lifecycle is explicit.** States are typed and limited.
  Initial proposal: `created → planning → action_proposed →
  action_dispatched → resolved | handed_off | abandoned`.
  Every transition is logged.
- **Action proposals attach to the intent.** A proposed Action
  carries the intent id; the dispatcher refuses to run an
  Action whose `intentId` is not registered.
- **Handoff / review / resolution attach to the intent.** A
  HumanReview decision references the intent it relates to; a
  resolution outcome (success / partial / handed off /
  abandoned) is the intent's terminal state.
- **Analytics measure task completion, not chat messages.**
  The platform's primary KPI is intent resolution rate, not
  message-count or chat-length.
- **InteractionIntent is the future billing / analytics unit.**
  Per-tenant pricing, per-host SLOs, and per-vertical success
  metrics will all anchor on the intent. **No billing
  implementation now.** This is a design lock so future code
  doesn't have to retrofit the unit of account.

This section is intentionally a forward-design lock. Code is
not authorized in this slice. CoRent's `RentalIntent` and
`feedback_submissions.kind = "wanted_item"` rows are the
closest in-repo prefigurations.

## 11. AuditEvent safety rules

- **Log labels and ids only.** Event name + non-secret reason
  code + minimal id fields (`intentId`, `actionId`,
  `sourceCardId`, `humanReviewId`). No prompt body, no message
  body, no completion body.
- **Required slots.** `block.type`, `action.id`, status
  transition (`from`, `to`), `humanReview.decision` where
  applicable.
- **Avoid raw prompt / body / messages.** Even at debug levels,
  the default is "off." A debug opt-in route requires its own
  gated slice with retention policy and access-control review.
- **Retention policy is future but planned.** A retention
  schedule lands with the first AnalyticsEvent table (future
  slice). This standard requires the schedule to exist before
  any real-customer integration ships.
- **No PII in event labels.** Event names and reason codes are
  closed-vocabulary strings; runtime-supplied parameters do
  not carry user data.

Repo anchor: server logger pattern (event name + `err_code` /
`reason` only). Examples: `chat_intake_mode_local`,
`user_auth_password_sign_in_failed`,
`admin_auth_password_sign_in_no_client`.

## 12. What is allowed now

- **Docs.** This document, the platform thesis, the CIE
  architecture, the slice plans, the smoke-run kit.
- **Deterministic registries.** The KnowledgeSource shape in
  [`knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts).
  Adding a v2 card with a banlist-clean Korean copy +
  closed-vocab membership.
- **Deterministic planner.** The `planCIEExperience` shape in
  [`deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts).
  Adding new block recipe types is a deliberate review gate.
- **Read-only UI blocks.** `SearchIntentSummary`,
  `try_criteria` rendering, listing readiness card,
  request-status display, founder cockpit feedback panel.
- **CoRent vertical proof flows (Tier 0–2 only).** Search,
  listing detail, request submission, request status review,
  seller listing readiness, founder feedback review.
- **Wanted-request capture via the existing
  `feedback_submissions` schema.** No new table.
- **Founder-only HumanReview.**
  `FeedbackReviewControls` + `updateFeedbackStatusAction`.
- **Tests and guardrails.** Banlist tests, source-level import-
  boundary tests, validators in CIE primitives.

## 13. What is blocked now

- **Real LLM provider call.** Mock adapter only.
- **Embeddings / vector store.** Out of scope until the
  thesis's Phase B lands with its own gate.
- **External JS snippet for third-party customers.** No
  multi-host distribution yet.
- **Multi-tenant admin / tenancy primitives.** Single-host
  in-repo only.
- **CRM / calendar / ticket / external-webhook integrations.**
  Tier 3 — out of scope.
- **Payment / PG integration.** Tier 5 — forbidden in the
  current window.
- **Legal / medical / financial / immigration decisioning.**
  Tier 4 — forbidden in the current window.
- **Autonomous action execution.** Even Tier 1 actions require
  user confirmation; LLM-side autonomy is forbidden.
- **Arbitrary HTML / Markdown generation that reaches the
  user.** Always bounded by the recipe schema.
- **Broad public customer launch.** No external customers
  before the next external-wedge decision and a fresh security
  review.

## 14. Decision checklist before future work

Run this list in order. A "no" early in the list means the
work needs reshaping or rejection.

- [ ] **Which risk tier?** Document the answer. If unclear,
      treat as the higher tier.
- [ ] **Which primitive?** KnowledgeSource / ComponentBlock /
      Action / Guardrail / Planner / HumanReview /
      AnalyticsEvent / Integration. If "none of these," reshape
      the work to fit one.
- [ ] **What data fields enter the layer?** List them. If any
      are PII the LLM doesn't need, narrow before proceeding.
- [ ] **What data fields leave the layer toward the user?**
      List them. Forbidden-slot scan must pass.
- [ ] **Does the LLM see PII?** If yes, redact or refuse.
- [ ] **Is the output source-backed?** Every claim ties to a
      registered KnowledgeSource via `sourceCardId`.
- [ ] **Is there a registered ComponentBlock?** If new, add to
      `CIE_ALLOWED_BLOCKS` + recipe union in the same PR.
- [ ] **Is there a registered Action?** If new, add to
      `CIE_RELATED_ACTIONS` + per-action argument schema in
      the same PR.
- [ ] **Is user confirmation required?** Tier 1+ → yes, with
      typed confirmation copy.
- [ ] **Is human review required?** Tier 3+ → yes; Tier 2 if
      operator workflow touches another user's data.
- [ ] **What is logged?** AnalyticsEvent name + minimum ids.
      No prompt, no body, no PII.
- [ ] **How is the action reversible?** State the rollback
      path. If irreversible, require Tier-5 gating.
- [ ] **What test pins the safety rule?** Source-level test or
      runtime test that fails when the rule breaks.

A new feature ships only when every checkbox above is "yes" or
explicitly justified in the slice plan.

## 15. Relationship to current docs / code

- **Why** — [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md).
  Direction.
- **What is allowed** — this document. Safety standard.
- **How it is built** — [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md).
  Implementation architecture (block recipes, tools,
  deterministic-vs-LLM split, 5-phase roadmap).
- **Project-specific guardrails** — [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md).
  CoRent / closed-alpha banlist, server/local separation,
  password sign-in posture, wanted-try-request posture.
- **Code seams (early)**:
  - [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts)
    — KnowledgeSource primitive, closed audience/surface/intent
    vocab, banlist-clean v1 cards.
  - [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts)
    — Planner primitive, 9 typed block recipes,
    `validateCIEPlan`, `assertNoBannedClaimsInCIEPlan`.
  - [`src/server/llm/types.ts`](../src/server/llm/types.ts) +
    [`src/server/llm/invoke.ts`](../src/server/llm/invoke.ts)
    — provider-neutral `LLMAdapter` shape,
    `provenance: "llm_candidate"` on every output.
  - `FeedbackReviewControls` + `updateFeedbackStatusAction` —
    early HumanReview workflow shape.

## 16. Versioning + amendment

- **Version pin.** This is **v0**. Future amendments increment
  the version (`v1`, `v2`) and land via docs-only PR with the
  founder approving the diff.
- **Amendment scope.** Adding a tier, demoting a non-goal,
  loosening any rule listed here is an explicit amendment, not
  an incidental change in another PR.
- **First v1 trigger.** v1 lands when the first external-
  customer integration enters scope. v1 will, at minimum,
  expand §4.7 (PII minimization) into a per-tenant config
  shape, formalize §11 (InteractionIntent) into runtime types,
  and add a retention policy section that this v0 explicitly
  defers.

End of safety standard v0.

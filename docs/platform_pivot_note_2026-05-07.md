# Platform Pivot Note — 2026-05-07

> **Status:** Current — decision record
> **Scope:** the founder's strategic decision to wind down CoRent
> as an active product direction and treat the AI Interaction
> Layer primitive system as the main product. Sits alongside
> [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> as the explicit *narrative* of the pivot; the thesis is the
> *direction*, this note is the *decision*.
> **Last reviewed:** 2026-05-07
> **Read before:** any product-direction work, any CoRent slice,
> any new vertical wedge, any docs cleanup or repository
> reshape, and any decision about whether to revive a CoRent
> marketplace surface.
> **Do not use for:** runtime code changes, file moves, route
> renames, schema or migration changes. This is a strategy /
> direction record. Implementation slices are gated separately.

---

## 1. Decision

**CoRent (the Korea-wide rental marketplace / store / try-before-
buy commerce thesis) is no longer an active product direction.**

The active product is the **AI Interaction Layer** —
specifically, the primitive system in
[`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md):
KnowledgeSource, ComponentBlock, Action, Guardrail, Planner,
HumanReview, AnalyticsEvent, Integration. CoRent code, surfaces,
and docs continue to exist on disk, but they no longer set
roadmap.

This note exists so a future agent (or a future founder),
reading the repo cold, does not interpret the abundance of
`corent_*` docs and `/dashboard` / `/listings` / `/sellers`
routes as evidence of an active rental-marketplace product
direction. The repo's mass is not the same as the company's
direction.

## 2. Why this decision was made

CoRent was the **discovery path**, not the destination. Building
a rental marketplace forced us to design typed primitives for:

- a guarded knowledge surface (the readiness card → the
  knowledge registry);
- closed-vocabulary UI rendering (the readiness/seller-
  readiness card → block recipes);
- typed action argument schemas with confirmation gates
  (`submitFeedback`, `publishListing`, `respondToRentalRequest`,
  `updateFeedbackStatus`);
- an authority-bearing actor model (`requireFounderSession`,
  `resolveServerActor`);
- DTO discipline (`PublicListing` projection, banlist scans);
- a typed lifecycle (`feedback_submissions.status` workflow,
  `RentalIntent` lifecycle).

Those primitives are durable. The vertical they came from is
narrow. The right move is to keep the primitives and stop
investing in the marketplace.

## 3. What this decision is NOT

- It is **not** a deletion plan. Existing CoRent files stay on
  disk. DB schema and migrations stay. Routes stay. Tests stay.
  Closed-alpha smoke ops continue to run while the founder
  finds them useful.
- It is **not** a deprecation announcement to any external
  audience. There is no public CoRent audience yet; the closed-
  alpha tester pool is small and known. No notice owed to
  anyone outside the founder + agents.
- It is **not** a license to weaken safety guardrails. The
  [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
  applies to every primitive going forward; the existing
  closed-alpha quality gates apply to every CoRent surface
  still on disk.
- It is **not** a permission to start anything ISS-0 defers.
  Payment, deposit, escrow, settlement, refund, insurance,
  trust score, dispute, claim, return, handoff (external),
  multi-tenant admin, real LLM provider, embeddings, external
  JS snippet, autonomous action execution — all still blocked.

## 4. What changes immediately

- **Documentation hierarchy.** Platform thesis + safety
  standard + (when shipped) the platform primitive docs are
  the only "Current source of truth." CoRent product direction,
  marketplace plans, vertical slice plans, and the marketplace
  legal/trust note become **Historical / Discovery / Pattern
  Source / Deferred** as appropriate (this PR stamps them).
- **Roadmap.** The next build target is **ComponentBlock
  registry v1**, then **Action registry v1**, then
  **BrandProfile v1**, then **GuardrailPolicy v1**, then
  **AnalyticsEvent taxonomy v1** — per the platform
  repositioning audit
  ([`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md)
  §11). InteractionIntent v1 already shipped.
- **Labeling rule.** Every new feature is labeled
  **Platform Core / Alpha Ops / Historical / Deferred** in
  its slice plan or PR description. CoRent-specific work that
  doesn't validate a platform primitive is labeled
  *Historical* or *Deferred*, not *Active*.
- **Smoke ops.** Tester rounds keep happening while the
  founder finds them useful. Their **purpose** is now to
  surface platform primitives' edges (block recipes, typed
  copy, human review), not to grow the rental marketplace.

## 5. What does NOT change

These remain in force exactly as before this note. The pivot
does not relax them.

- [`CLAUDE.md`](../CLAUDE.md) operational rules.
- [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
  — direction.
- [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
  — safety gates.
- [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
  — implementation architecture for the platform thesis. The
  filename is CoRent-flavored (the repositioning audit flagged
  this for a future rename); the substance is platform-shaped
  and current.
- [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)
  — visual system. Visual-system change is gated separately by
  [`agent_loop.md`](agent_loop.md).
- [`agent_loop.md`](agent_loop.md) — workflow + approval gates.
- All shipped CIE primitive code seams:
  [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts),
  [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts),
  [`src/lib/cie/interactionIntent.ts`](../src/lib/cie/interactionIntent.ts),
  [`src/server/llm/types.ts`](../src/server/llm/types.ts),
  [`src/server/llm/normalize.ts`](../src/server/llm/normalize.ts),
  [`src/server/llm/mockAdapter.ts`](../src/server/llm/mockAdapter.ts),
  [`src/server/llm/invoke.ts`](../src/server/llm/invoke.ts).
- All closed-alpha ops surfaces (auth, founder cockpit,
  feedback review). They are explicitly **internal alpha ops**
  per the repositioning audit §5.

## 6. Explicit deferrals

The following are deferred to separately-gated future PRs.
**This pivot note does not authorize any of them.**

- **DB / schema cleanup.** `feedback_submissions`, `listings`,
  `rental_intents`, `rental_events`, `seller_profiles`,
  `borrower_profiles`, `profiles`, and the supporting
  migrations stay as-is. A future docs-only PR may catalog
  which tables remain useful for the platform primitives
  (e.g. `feedback_submissions` for the demo
  UnmetIntentCaptureBlock) and which are vertical-only. **No
  schema change in this PR.** No migration.
- **Runtime route rename.** `/dashboard`, `/admin/cockpit`,
  `/listings/[listingId]`, `/items/[id]`, `/sellers/[sellerId]`,
  `/sell`, `/search`, `/requests`, `/auth/*`, `/admin/auth/*`,
  `/login`, `/admin/login`, `/api/*`, `/privacy`, `/terms`
  stay as-is. If the platform graduates publicly, the route
  layout changes via a separately-gated PR.
- **`src/lib/cie/` namespace rename.** Stays as-is. The audit
  flags it for future repositioning when a public product name
  is chosen.
- **CoRent-named component / service rename.** No `git mv`. The
  audit's §8 lists candidates that may eventually become
  generic (`SearchIntentSummary` → generic
  `IntentSummaryBlock`, etc.) — but only when a second
  vertical needs the same shape.
- **CoRent doc deletions.** This PR stamps **status
  headers**, not deletions. Future docs-only PRs may delete a
  doc only when it is clearly duplicate, stale, and already
  superseded — but the audit's bias is "label, not delete."

## 7. Directly affected docs (status changes in this PR)

The PR that ships alongside this note stamps the following docs
with new top-of-file status headers. Bodies are not rewritten.
Cross-links remain valid.

- [`corent_product_direction_v2.md`](corent_product_direction_v2.md)
  → **Historical / Former Vertical Direction.** Replaces the
  earlier "Repositioning note" with a stronger header.
- [`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md)
  → **Historical / Former Vertical Execution Plan.** Replaces
  the earlier "Current — umbrella implementation plan" status.
- [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md)
  → **Historical / Pattern Source.** The reusable shape is
  `UnmetIntentCaptureBlock`; the slice plan itself no longer
  drives roadmap.
- [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
  → **Deferred / Blocked by ISS-0.** Payment / trust / legal /
  insurance / deposit / rental-liability work is not active.
- [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
  → **Historical / Closed-alpha Operations Posture.** The
  pre-revenue posture and feature-flag table remain useful for
  closed-alpha ops continuity, but the marketplace / fee /
  rental framing is superseded.
- [`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md)
  → **Historical / Superseded Backlog.** Next actions now live
  in the platform primitive roadmap, not this list.
- [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
  → **Historical / Former Vertical Externalization Plan.** Did
  the local-mock → Supabase externalization for CoRent; not
  driving current architecture.
- [`corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md)
  → **Historical / Discovery Artifact.** Helped surface the
  Interaction Layer thesis; no longer guides active rental
  category work.
- [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)
  → **Pattern Source.** Reusable for `PreActionChecklistBlock`
  / future copy experiments; not active rental-copy roadmap.
- [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
  → **Guardrail (closed-alpha surfaces only).** Platform-level
  safety governance now sits in
  [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md).
- [`smoke_runs/README.md`](smoke_runs/README.md) → posture
  statement extended: smoke records are **historical alpha run
  data**, not product direction.

[`docs/README.md`](README.md) is updated in the same PR to
reposition Platform Thesis + Interaction Safety Standard +
(future) primitive docs at the top, demote `corent_*` docs to a
**Historical / Discovery / Former vertical proof** band, and
add an explicit "CoRent docs must not drive current roadmap"
banner.

## 8. Future-work labeling rule

Every new feature, doc, or PR going forward carries one of
these labels:

- **Platform Core** — primitive code, primitive docs, safety
  governance, cross-cutting platform infrastructure.
- **Alpha Ops** — closed-alpha-only operational surfaces that
  let the founder run smokes (auth, founder cockpit, feedback
  review, smoke runbooks). Internal-only; not the platform
  product surface.
- **Historical** — kept on disk; does not drive roadmap. Most
  `corent_*` docs and code go here after this pivot.
- **Deferred** — explicitly deferred per ISS-0 (payment,
  trust, claim, dispute, return, handoff, real LLM provider,
  embeddings, external JS snippet, multi-tenant admin, etc.)
  or per a founder decision (the rental-marketplace thesis,
  for instance).

If a slice plan or PR description does not name one of these
four labels, the work needs reshaping before it ships.

## 9. Next build target

The next two PRs (per
[`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md)
§11 and §14):

1. **`feat: ComponentBlock registry v1`** — typed registry
   with per-block allowed-slot manifests, length caps, source-
   required flags. Pure-data + tests-only. No UI wiring.
2. **`feat: Action registry v1`** — typed registry with per-
   action argument schemas, declared risk tier, declared
   confirmation policy, allowed-input-fields manifest,
   reversibility metadata. Pure-data + tests-only. No
   dispatcher seam.

After those land, the order continues with **BrandProfile v1**,
**GuardrailPolicy v1**, **AnalyticsEvent taxonomy v1**.
**InteractionIntent v1** is already shipped
([`src/lib/cie/interactionIntent.ts`](../src/lib/cie/interactionIntent.ts)).

## 10. Cross-references

- Direction: [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md).
- Safety gates: [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md).
- Implementation architecture (filename CoRent-flavored, substance platform): [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md).
- Repository classification audit: [`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md).
- Documentation hierarchy index: [`README.md`](README.md).
- Operational rules: [`../CLAUDE.md`](../CLAUDE.md).
- Workflow + approval gates: [`agent_loop.md`](agent_loop.md).

End of pivot note.

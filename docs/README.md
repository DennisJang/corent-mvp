# CoRent docs — hierarchy index

_Last reviewed: 2026-05-07 (platform pivot — CoRent demoted to Historical). Maintainer: founder + Claude._

This index exists so a future agent (Claude, Codex, or a human
reviewer arriving cold) **does not treat stale docs as current
truth**. Many markdown files have accumulated quickly. Some are
the source of truth, some are active implementation plans, some
are smoke records, and a few are historical context. This file
labels each, defines a recommended reading order, and identifies
likely-historical docs without deleting or moving them.

> **Pivot note (2026-05-07).** The active product direction is
> the **AI Interaction Layer** captured in
> [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md).
> **CoRent (the rental marketplace / store / try-before-buy
> commerce thesis) is no longer an active product direction.**
> CoRent code, surfaces, and docs continue to exist on disk and
> the closed-alpha ops stack still runs while it remains useful,
> but `corent_*` docs **must not drive current roadmap**. They
> are kept as Historical / Pattern Source / Discovery
> Artifact / Deferred — see §1 below for the new band layout.
> Implementation architecture for the platform thesis lives in
> [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md);
> the filename is CoRent-flavored but the substance is platform-
> shaped and current.

> **Safety standard note (2026-05-07).** The internal product
> safety standard for the AI Interaction Layer is
> [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md).
> It defines what is allowed (tier 0–5 risk model, 10 core
> safety principles, ComponentBlock / Action / KnowledgeSource /
> LLM / InteractionIntent / AuditEvent rules). It sits between
> the platform thesis (the "why") and the implementation
> architecture / project guardrails (the "how"). It is **not** a
> certification or compliance claim; it borrows vocabulary from
> OWASP LLM Top 10, NIST AI RMF, and ISO/IEC 42001 only as
> reference frameworks.

When a doc in this repo conflicts with a higher-tier doc, the
higher-tier doc wins. The tier order is:

1. **CLAUDE.md** (root of the repo). Project-wide ground rules.
2. **Platform pivot note** —
   [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md).
   The decision record: CoRent is no longer an active product
   direction; the AI Interaction Layer primitive system is.
3. **Platform thesis** —
   [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md).
   Highest-level product direction (the "why").
4. **Interaction Safety Standard** —
   [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md).
   What is allowed at the platform level (risk tiers + 10
   safety principles).
5. **Current source of truth** (`§1` below). Implementation
   architecture for the platform thesis + closed-alpha ops
   posture. **CoRent vertical-direction docs are no longer in
   this band** — they live in §7 Historical.
6. **Active implementation plans** (`§2`). Pattern sources only
   after the pivot; no active CoRent slice plans.
7. **Quality gates / guardrails** (`§3`).
8. **Design system** (`§4`).
9. **Smoke runs / tester operations** (`§5`). Closed-alpha
   alpha-ops historical run data; not product direction.
10. **Reference / setup** (`§6`).
11. **Historical / context only** (`§7`). Read for orientation;
    do not use for current scope. **All `corent_*` product /
    marketplace direction docs now sit here** after the pivot.

This is an **index**, not a redaction. Nothing has been deleted
or moved.

---

## How to use this index

Pick the matching subsection in **§9 Recommended reading order
for future agents** and read those files in order before starting
work. Then come back here for the broader catalog when you need
to look something up.

If a doc is missing from this index, add it here in the same PR
that added the doc. If a doc graduates from active to historical,
move its entry from the "active" section to the "historical"
section in a separate docs-only PR — never silently.

---

## §1. Current source of truth

These define the active product direction (platform thesis +
safety standard + decision record), the implementation
architecture, the workflow, and the (one) posture doc that
genuinely cuts across the platform. **CoRent vertical-direction
docs are no longer in this band** — they have been demoted to
§7 Historical with new status headers per the pivot.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md) | **Current — decision record** | The strategic decision to wind CoRent down as an active product direction and treat the AI Interaction Layer primitive system as the main product. Defines the four future labels (Platform Core / Alpha Ops / Historical / Deferred) and the next build target. | Status header pinned. Read before any product-direction work or any decision about whether to revive a CoRent surface. |
| [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md) | **Current — platform thesis (highest)** | AI Interaction Layer for complex websites; primitive model (KnowledgeSource / ComponentBlock / Action / Guardrail / Planner / HumanReview / AnalyticsEvent / Integration); guardrail-first posture; decision rules; non-goals | Status header pinned. Highest-level product direction below `CLAUDE.md`. |
| [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md) | **Current — internal product safety standard** | Risk tier model (T0–T5); 10 core safety principles; ComponentBlock / Action / KnowledgeSource / LLM / InteractionIntent / AuditEvent safety rules; allow / block lists; pre-work decision checklist | Status header pinned. Sits between the platform thesis (the "why") and the implementation architecture / project guardrails (the "how"). Not a certification claim; borrows vocabulary from OWASP LLM Top 10, NIST AI RMF, and ISO/IEC 42001 only as reference frameworks. |
| [`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md) | **Current — classification audit** | Read-only repository classification into 6 bands: Platform Core / CoRent Vertical Proof / Closed-alpha Operations / Deferred / Historical / Needs Repositioning Later. Stop-list + continue-list + next primitive roadmap + non-actions list. | Status header pinned. Companion to the pivot note. |
| [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md) | **Current — implementation architecture** | The AI-native try-before-buy interface, layered architecture, block-recipe UI orchestration, closed tool set, deterministic-vs-LLM split. **Filename is CoRent-flavored; the substance is platform-shaped and current.** | Status header pinned. The repositioning audit flagged the filename for a future rename; do not rename in this PR. |
| [`corent_defensibility_note.md`](corent_defensibility_note.md) | **Current (posture)** | Disclosure boundaries (what is public vs. partner-only). | Read before any external-facing copy. |
| [`agent_loop.md`](agent_loop.md) | **Current (workflow)** | Claude ↔ Codex workflow + approval gates (visual-system change, schema, payment, etc.). | The user is the final approver on every gate. |

## §2. Active implementation plans

There are **no active CoRent slice plans** after the 2026-05-07
pivot. The next runtime PRs are platform-primitive PRs per
[`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md)
§11 (ComponentBlock registry v1 → Action registry v1 →
BrandProfile v1 → GuardrailPolicy v1 → AnalyticsEvent taxonomy
v1). When a primitive slice plan is written, it lands here.

The previous CoRent slice plans have moved to §7 Historical
with a **Pattern Source** label. The patterns they encode
(UnmetIntentCaptureBlock, PreActionChecklistBlock, copy-variant
backlog, category research) remain useful for primitive design
but do not drive a CoRent product roadmap.

## §3. Quality gates / guardrails

Cross-cutting rules every PR must satisfy. They are not slice
plans; they are constraints. **Platform-level safety governance
now sits in
[`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
(§1).** The docs below are guardrails for the closed-alpha
surfaces still on disk; they do not extend the platform.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md) | **Guardrail (closed-alpha surfaces only)** | Banned copy phrases, server/local separation, LLM candidate-only rules, DTO/projection rules, password sign-in posture, wanted-try-request posture | Pinned by `src/lib/copy/copyGuardrails.test.ts` and source-level tests. **Applies to existing closed-alpha CoRent surfaces only**; new platform work is governed by `interaction_safety_standard_v0.md`. |
| [`corent_security_gate_note.md`](corent_security_gate_note.md) | **Guardrail (security)** | Security-review gate for DB / auth / payment / file upload / location work | Read before any of those surfaces. |
| [`corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md) | **Guardrail (alpha-ops auth/identity)** | Manual provisioning workflow for `profiles` + `seller_profiles` + `borrower_profiles`. No auto-provisioning anywhere | Sign-in routes pin this rule. **Closed-alpha ops only**; not a platform contract. |
| [`mvp_security_guardrails.md`](mvp_security_guardrails.md) | **Guardrail (general)** | MVP security guardrails and posture | Older but still active. |

## §4. Design system

Visual identity. The current system is **BW Swiss Grid v1**.
Earlier blue palettes are retired (per `CLAUDE.md` in the repo
root). Visual-system changes go through the gate in
`agent_loop.md`.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md) | **Design System (current)** | BW Swiss Grid v1: palette, type, spacing, line hierarchy, radius, layout philosophy | Status header pinned. The single source of truth for visuals. |
| [`corent_ux_system_v1.md`](corent_ux_system_v1.md) | **Historical (UX system)** | Older UX rules, predates the BW Swiss Grid system | Read for orientation only; on conflict the BW Swiss Grid system wins. |

## §5. Smoke runs / tester operations

Smoke records, templates, and the readiness-feedback ops kit.
**These files are run records / templates. They do not override
current product architecture (§1) or guardrails (§3).** A smoke
record is a snapshot of one run; if it disagrees with a §1/§3
doc, the §1/§3 doc is right and the smoke record is dated.

See also [`smoke_runs/README.md`](smoke_runs/README.md) for the
posture statement.

| File | Status | Scope |
| --- | --- | --- |
| [`smoke_runs/2026-05-06_readiness_flow_template.md`](smoke_runs/2026-05-06_readiness_flow_template.md) | **Template** | Reusable readiness-flow smoke template (founder-run) |
| [`smoke_runs/2026-05-06_readiness_flow_round1.md`](smoke_runs/2026-05-06_readiness_flow_round1.md) | **Run record** | Round 1 readiness-flow run |
| [`smoke_runs/2026-05-06_password_login_readiness_round1.md`](smoke_runs/2026-05-06_password_login_readiness_round1.md) | **Combined runbook** | Password-login + readiness Round 1 founder script |
| [`smoke_runs/tester_feedback_form_template.md`](smoke_runs/tester_feedback_form_template.md) | **Template (tester-facing)** | Tester-facing 5-question form |
| [`smoke_runs/readiness_round_report_template.md`](smoke_runs/readiness_round_report_template.md) | **Template (founder-facing)** | Per-round report template |
| [`smoke_runs/readiness_feedback_decision_aid.md`](smoke_runs/readiness_feedback_decision_aid.md) | **Operational** | Quote → action triage table |
| [`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md) | **Operational** | 11-tag taxonomy for feedback |
| [`smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`](smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md) | **Run record** | First remote smoke against `corent-dev` |
| [`corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md) | **Operational (founder)** | Founder smoke-run ops checklist |
| [`corent_closed_alpha_smoke_test_plan.md`](corent_closed_alpha_smoke_test_plan.md) | **Operational** | Smoke test plan |
| [`corent_closed_alpha_intake_dispatch_smoke_note.md`](corent_closed_alpha_intake_dispatch_smoke_note.md) | **Operational** | Chat intake dispatch smoke notes |
| [`phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md) | **Run record** | Phase 1 analytics smoke |
| [`scheduled_runs/_template.md`](scheduled_runs/_template.md) | **Template** | Scheduled-run note template |
| [`scheduled_runs/schedule_prompt_template.md`](scheduled_runs/schedule_prompt_template.md) | **Template** | Scheduled-run prompt template |

## §6. Reference / setup

Lower-tier docs the agent reaches for when a specific question
comes up. These are not strategic.

| File | Scope |
| --- | --- |
| [`corent_dev_environment_setup.md`](corent_dev_environment_setup.md) | Local dev env setup |
| [`corent_dev_secret_inventory.template.md`](corent_dev_secret_inventory.template.md) | Secret inventory template (no actual values) |
| [`env_vars_phase1.md`](env_vars_phase1.md) | Env var inventory (Phase 1) |
| [`corent_database_schema_draft.md`](corent_database_schema_draft.md) | Schema overview / draft |
| [`db_readiness_audit_v1.md`](db_readiness_audit_v1.md) | DB readiness audit v1 |
| [`phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md) | Phase 1 validation beta plan |
| [`phase2_backend_draft_review.md`](phase2_backend_draft_review.md) | Phase 2 backend draft review |
| [`phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md) | Phase 2 backend integration draft |
| [`phase2_founder_decisions.md`](phase2_founder_decisions.md) | Phase 2 founder decisions log |
| [`phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md) | Phase 2 marketplace schema draft |
| [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md) | Externalization architecture v1 (local → Supabase pattern) |
| [`corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md) | Phase 1 security review (dated record) |
| [`today_queue.md`](today_queue.md) | Tactical today-queue notes |

## §7. Historical / context-only

Read these for orientation. **Do not use for current scope.** A
later doc supersedes them on every conflict.

After the 2026-05-07 platform pivot
([`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md)),
the previously "Current" CoRent vertical-direction docs and
"Active" CoRent slice plans have been demoted into this band.
They remain on disk; they do not drive roadmap.

### CoRent vertical direction + plans (demoted 2026-05-07)

| File | Why historical |
| --- | --- |
| [`corent_product_direction_v2.md`](corent_product_direction_v2.md) | **Former vertical direction.** Defined the CoRent rental / try-before-buy direction. Superseded as active direction by [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md) + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md). |
| [`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md) | **Former vertical execution plan.** "Skeleton-passing → product-UX-passing" milestone tracker for the rental marketplace. CIE-related sections live on in [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md) (still current). |
| [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md) | **Pattern Source.** Cold-start wedge slice plan; PR 2 + PR 3 shipped. The reusable shape is `UnmetIntentCaptureBlock`. The slice plan no longer drives a CoRent roadmap. |
| [`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md) | **Superseded backlog.** 10-task list after the first remote smoke. Several items shipped; the list is not the canonical near-term backlog after the pivot. |
| [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) | **Deferred / Blocked by ISS-0.** Payment / trust / legal / insurance / deposit / rental-liability work is not active. The regulated-language ban inside it remains useful as guardrail context. |
| [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) | **Closed-alpha operations posture (historical).** Feature-flag table and runtime-mode discipline remain useful for closed-alpha continuity, but the marketplace / fee / rental framing is superseded. |
| [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md) | **Former vertical externalization plan.** Local-mock → Supabase externalization for the rental marketplace. Useful pattern reference for future platform persistence work. |
| [`corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md) | **Discovery artifact.** Helped surface the Interaction Layer thesis. No longer guides active rental category work. |
| [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md) | **Pattern source.** Reusable for `PreActionChecklistBlock` / future copy experiments. Not active rental-copy roadmap. |

### Earlier history (already historical before 2026-05-07)

| File | Why historical |
| --- | --- |
| [`corent_context_note.md`](corent_context_note.md) | Older 10%-only / Seoul-beta framing. Superseded by `corent_product_direction_v2.md`. |
| [`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md) | Older intent-model rules (10% / Seoul-beta). Direction v2 + closed-alpha quality gates supersede on conflict. |
| [`corent_functional_mvp_implementation_note.md`](corent_functional_mvp_implementation_note.md) | Implementation snapshot during the functional MVP era. Useful for orientation; current PRs follow the slice plans in §2. |
| [`corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md) | Milestone 1 completion record (2026-04-30). |
| [`corent_codex_absorption_note.md`](corent_codex_absorption_note.md) | Codex branch absorption record. Workflow snapshot. |
| [`corent_mvp_qa_stabilization_note.md`](corent_mvp_qa_stabilization_note.md) | One-off QA stabilization cycle. |
| [`corent_return_trust_layer.md`](corent_return_trust_layer.md) | Earlier return-trust copy module note. The current return / responsibility framing lives in the readiness service + closed-alpha quality gates. |
| [`corent_validation_bundle1_part3_publication_note.md`](corent_validation_bundle1_part3_publication_note.md) | Slice landing note for the founder publish action (shipped). |
| [`corent_validation_bundle1_part4_renter_request_note.md`](corent_validation_bundle1_part4_renter_request_note.md) | Slice landing note for the renter request flow (shipped). |
| [`corent_validation_bundle2_slice1_public_browse_bridge_note.md`](corent_validation_bundle2_slice1_public_browse_bridge_note.md) | Slice landing note for the public browse bridge (shipped). |
| [`corent_validation_bundle2_slice2_renter_request_ui_note.md`](corent_validation_bundle2_slice2_renter_request_ui_note.md) | Slice landing note for renter request UI (shipped). |
| [`corent_validation_bundle2_slice3_seller_request_visibility_note.md`](corent_validation_bundle2_slice3_seller_request_visibility_note.md) | Slice landing note for seller request visibility (shipped). |
| [`corent_validation_bundle2_slice4_founder_cockpit_note.md`](corent_validation_bundle2_slice4_founder_cockpit_note.md) | Slice landing note for the founder cockpit (shipped). |
| [`corent_closed_alpha_actor_resolver_note.md`](corent_closed_alpha_actor_resolver_note.md) | Closed-alpha actor resolver design note (shipped). |
| [`corent_closed_alpha_chat_intake_client_mode_note.md`](corent_closed_alpha_chat_intake_client_mode_note.md) | Closed-alpha chat intake client-mode note (shipped). |
| [`corent_closed_alpha_dashboard_listings_externalization_note.md`](corent_closed_alpha_dashboard_listings_externalization_note.md) | Dashboard listings externalization note (shipped). |
| [`corent_closed_alpha_listing_draft_externalization_note.md`](corent_closed_alpha_listing_draft_externalization_note.md) | Listing draft externalization note (shipped). |
| [`corent_closed_alpha_user_auth_note.md`](corent_closed_alpha_user_auth_note.md) | Closed-alpha user auth design note (shipped; password sign-in slice now sits on top). |

These docs are **kept on purpose**. They explain how the current
state was reached. They should not be the basis for current
scope decisions; for that, read §1–§4.

## §8. Subdirectories at a glance

| Directory | Purpose |
| --- | --- |
| `docs/smoke_runs/` | Smoke records, templates, readiness-feedback ops kit. See `smoke_runs/README.md`. |
| `docs/scheduled_runs/` | Scheduled-run templates. |
| `docs/sql_templates/` | Founder-only SQL templates (do not run via agent). |
| `docs/codex_tasks/` | Codex task templates. |
| `docs/claude_absorption/` | Claude absorption task templates. |
| `docs/references/` | Visual reference images for the design system. |

## §9. Recommended reading order for future agents

Pick the row that matches the work you're about to start, then
read those files in order before opening any runtime PR.

### Before any runtime implementation (default order)

1. `CLAUDE.md` (root of the repo).
2. [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
   — platform thesis + decision rules + non-goals (§11–§12).
3. [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
   — risk tier model + 10 core safety principles + pre-work
   decision checklist (§14).
4. [`corent_product_direction_v2.md`](corent_product_direction_v2.md)
   — CoRent vertical direction.
5. [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
   — implementation architecture.
6. [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md).
7. [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md).
8. [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md).
9. The matching active slice plan in `§2` if your task touches one.
10. The matching guardrail in `§3` if your task touches DB / auth /
    payment / file upload / location.

### Before visual / design changes

1. `CLAUDE.md`.
2. [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
   — §11 decision rules; §13 near-term implications include
   "future design work should express the platform thesis
   visually, but not now."
3. [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
   — §6 ComponentBlock safety rules (BrandProfile may style but
   cannot disable safety copy; renderer owns appearance; no raw
   HTML from LLM).
4. [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md).
5. [`agent_loop.md`](agent_loop.md) (visual-system change is a
   gated approval).
6. [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)
   if you're shipping new Korean strings.
7. [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
   (banned copy + server/local separation).

### Before smoke testing

1. [`smoke_runs/README.md`](smoke_runs/README.md).
2. [`corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md).
3. [`smoke_runs/2026-05-06_readiness_flow_template.md`](smoke_runs/2026-05-06_readiness_flow_template.md)
   (or the combined password-login + readiness round script if
   you are running a full session).
4. [`smoke_runs/tester_feedback_form_template.md`](smoke_runs/tester_feedback_form_template.md).
5. [`smoke_runs/readiness_round_report_template.md`](smoke_runs/readiness_round_report_template.md).
6. [`smoke_runs/readiness_feedback_decision_aid.md`](smoke_runs/readiness_feedback_decision_aid.md)
   + [`smoke_runs/readiness_feedback_taxonomy.md`](smoke_runs/readiness_feedback_taxonomy.md)
   for triage after the round.

### Before LLM / Interactive Experience work

1. [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
   — §4 primitive model, §7 guardrail-first thesis, §11 decision
   rules, §12 non-goals. The thesis is the **why** for every
   CIE decision below.
2. [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
   — §4 ten core safety principles (esp. 4.5 LLM candidate-only,
   4.7 PII minimization, 4.8 prompt/output security), §5 risk
   tier model, §9 LLM safety rules, §10 InteractionIntent
   forward-design lock, §14 pre-work decision checklist.
3. [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
   (especially §6 block recipes, §7 tools, §8 LLM role, §10
   safety, §11 data/RAG, §12 cost).
4. [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
   (LLM candidate-only rules + banlist).
5. [`corent_security_gate_note.md`](corent_security_gate_note.md)
   (real provider hits a gated review).
6. [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
   (feature-flag posture).

### Before payment / trust / security work

1. [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
   — §12 non-goals explicitly defer payment/trust/legal
   commitments and §11 decision rules require deterministic
   authority + reversibility.
2. [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
   — §5 risk tier model (Tier 4 high-trust workflows / Tier 5
   transactions are out of current scope), §13 explicit block
   list, §14 reversibility checkbox.
3. [`corent_security_gate_note.md`](corent_security_gate_note.md)
   (the gate fires here).
4. [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
   (regulated-language ban + partner posture).
5. [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
   (no fee, no payment, no settlement until the cutoff date AND
   readiness approval).
6. [`mvp_security_guardrails.md`](mvp_security_guardrails.md).
7. [`corent_security_review_phase1_2026-04-30.md`](corent_security_review_phase1_2026-04-30.md)
   for prior-review context.

## §10. Maintenance

- A new doc must land in this index in the same PR. Add a row
  with status + scope + notes.
- A doc that graduates to historical/context-only moves from
  §2/§3/§4 to §7 in a separate docs-only PR — never silently.
- This index is **not** a workflow for deletion. Keeping older
  docs around is intentional; the labels below are the
  precision tool.
- If a runtime PR adds a status header to one of the docs in
  §1–§4, keep the wording consistent with this index.

End of docs index.

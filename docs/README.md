# CoRent docs — hierarchy index

_Last reviewed: 2026-05-07 (safety standard v0 added). Maintainer: founder + Claude._

This index exists so a future agent (Claude, Codex, or a human
reviewer arriving cold) **does not treat stale docs as current
truth**. Many markdown files have accumulated quickly. Some are
the source of truth, some are active implementation plans, some
are smoke records, and a few are historical context. This file
labels each, defines a recommended reading order, and identifies
likely-historical docs without deleting or moving them.

> **Repositioning note (2026-05-07).** The internal thesis has
> been updated. The company-level direction is now an **AI
> Interaction Layer for complex websites**, captured in
> [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md).
> CoRent remains alive and active, but is repositioned as the
> **first vertical proof** of the platform thesis (AI-guided
> try-before-buy commerce flow). All `corent_*` docs in §1–§4
> below are now **vertical / product docs under the platform
> thesis**; the platform thesis sits above them on conflict.

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
2. **Platform thesis** —
   [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md).
   Highest-level product direction (the "why").
3. **Interaction Safety Standard** —
   [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md).
   What is allowed at the platform level (risk tiers + 10
   safety principles).
4. **Current source of truth** (`§1` below). Vertical / product
   direction for CoRent + macro architecture (CIE).
5. **Active implementation plans** (`§2`).
6. **Quality gates / guardrails** (`§3`).
7. **Design system** (`§4`).
8. **Smoke runs / tester operations** (`§5`).
9. **Reference / setup** (`§6`).
10. **Historical / context only** (`§7`). Read for orientation;
    do not use for current scope.

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

These define the product's wedge, identity, and macro
architecture **right now**. Read them before any other doc when
you arrive cold. Within §1, the **platform thesis is highest**;
everything else is vertical / product / posture / workflow.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md) | **Current — platform thesis (highest)** | AI Interaction Layer for complex websites; primitive model (KnowledgeSource / ComponentBlock / Action / Guardrail / Planner / HumanReview / AnalyticsEvent / Integration); guardrail-first posture; decision rules; non-goals | Status header pinned. Highest-level product direction below `CLAUDE.md`. CoRent docs below are now vertical / product docs **under** this thesis. |
| [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md) | **Current — internal product safety standard** | Risk tier model (T0–T5); 10 core safety principles; ComponentBlock / Action / KnowledgeSource / LLM / InteractionIntent / AuditEvent safety rules; allow / block lists; pre-work decision checklist | Status header pinned. Sits between the platform thesis (the "why") and the CIE implementation / project guardrails (the "how"). Not a certification claim; borrows vocabulary from OWASP LLM Top 10, NIST AI RMF, and ISO/IEC 42001 only as reference frameworks. |
| [`corent_product_direction_v2.md`](corent_product_direction_v2.md) | **Current — CoRent vertical direction** | Product direction (Korea-wide, fee model, design maturity, flow-first) for the **CoRent vertical** | Wins over `corent_context_note.md` and `corent_functional_mvp_intent_rules.md` on every conflict. Sits **under** the platform thesis: CoRent is the first vertical proof. |
| [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md) | **Current — implementation architecture** | CoRent Interactive Experience (CIE) — the AI-native try-before-buy interface, layered architecture, block-recipe UI orchestration, closed tool set, deterministic-vs-LLM split | Status header pinned in the file. CIE is the **internal implementation name** for the platform thesis during the closed-alpha window. Phases align with `corent_product_flow_completion_plan.md`. |
| [`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md) | **Current (umbrella)** | Path from "skeleton-passing → product-UX-passing", milestone tracker | Status header pinned. §10 cross-links the CIE plan. |
| [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) | **Current (posture)** | Pre-revenue posture, runtime modes, feature-flag table, validation metrics | Posture is in force until `2026-07-13` AND explicit founder + legal/payment readiness approval. |
| [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) | **Current (posture)** | C2C marketplace framing, no wallet, partner-mediated payment, regulated-language ban | Wins on every regulated-language question. |
| [`corent_defensibility_note.md`](corent_defensibility_note.md) | **Current (posture)** | Disclosure boundaries (what is public vs. partner-only) | Read before any external-facing copy. |
| [`agent_loop.md`](agent_loop.md) | **Current (workflow)** | Claude ↔ Codex workflow + approval gates (visual-system change, schema, payment, etc.) | The user is the final approver on every gate. |

## §2. Active implementation plans

Slices that are **actively driving the next runtime PRs**. When
a plan is finished, it stays here as historical context until a
docs-only PR moves it to §7.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md) | **Active Plan** | Cold-start wedge: turn `/search` empty state into a demand signal via `feedback_submissions.kind = "wanted_item"` | Status header pinned. PR 2 has shipped (`/search` empty CTA + form). PR 3 has shipped (founder review workflow on `/admin/cockpit`). PR 4–6 future. |
| [`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md) | **Active Plan (companion)** | 10-task list after the 2026-05-05 first remote smoke | Several items have shipped (smoke ops checklist patch, responsibility copy, seller approve/decline, my-requests page, feedback status workflow). The list itself remains the canonical near-term backlog. |
| [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md) | **Active (copy)** | Pre-approved Korean copy variants for readiness card, seller readiness panel, request confirmation, search match-reason, and §10 wanted-try-request | Source of every new user-facing string before it lands in code. |
| [`corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md) | **Active (research)** | Per-category try-before-buy value × seller fear × logistics × condition baseline × responsibility 기준 difficulty × pricing × AI-readiness lift | Founder updates per round. Wedge graduation rule lives here. |

## §3. Quality gates / guardrails

Cross-cutting rules every PR must satisfy. They are not slice
plans; they are constraints.

| File | Status | Scope | Notes |
| --- | --- | --- | --- |
| [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md) | **Guardrail (master)** | Banned copy phrases, server/local separation, LLM candidate-only rules, DTO/projection rules, password sign-in posture, wanted-try-request posture | Status header pinned. Pinned by `src/lib/copy/copyGuardrails.test.ts` and source-level tests. |
| [`corent_security_gate_note.md`](corent_security_gate_note.md) | **Guardrail (security)** | Security-review gate for DB / auth / payment / file upload / location work | Read before any of those surfaces. |
| [`corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md) | **Guardrail (auth/identity)** | Manual provisioning workflow for `profiles` + `seller_profiles` + `borrower_profiles`. No auto-provisioning anywhere | Sign-in routes pin this rule. |
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

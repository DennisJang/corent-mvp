# Platform Repositioning Audit — 2026-05-07

> **Status:** Audit
> **Scope:** repository repositioning after the platform thesis
> change (CoRent → first vertical proof of an AI Interaction
> Layer). Classifies every shipped doc, module, route, and
> service into one of six categories.
> **Last reviewed:** 2026-05-07
> **Read before:** any file move, route rename, CoRent
> deprecation, platform extraction, namespace rename, or public
> relaunch work.
> **Do not use for:** deleting files directly. This is a
> classification audit, not an execution plan. File moves,
> renames, and deletions are deliberate, separately-gated PRs
> that may follow this audit but never piggy-back on it.

---

## 1. Executive summary

CoRent work is **not** wasted. The slices that shipped are
exactly the slices that produced the primitives the platform
thesis now depends on: a typed knowledge registry, a
deterministic planner, a typed lifecycle wrapper
(InteractionIntent), a banlist-clean copy backlog, a typed
human-review workflow, server-only DTO projections, an LLM
adapter shape with `provenance: "llm_candidate"` on every
output, and a working closed-alpha operations stack
(magic-link + password sign-in, founder cockpit, server-mode
listings, request lifecycle through `seller_approved` /
`seller_cancelled`).

The repositioning means three operational changes:

1. **CoRent is reframed as the first vertical proof.** It
   stays alive. UI surfaces continue to ship in small slices
   — but the **purpose** of each new CoRent slice is now to
   force the platform primitives through a real domain, not
   to build out the rental marketplace.
2. **Marketplace / payment / trust expansion stops** unless a
   slice explicitly validates a platform primitive. Items in
   §10's stop-list are not bad ideas; they are deferred until
   a separately-gated CoRent vertical decision authorizes
   them.
3. **Platform Core gets priority.** §12's "next primitive
   roadmap" lays out the next five primitives. They are the
   work that compounds across every future vertical.

This audit moves **zero files**, deletes **zero files**,
renames **zero routes**, and changes **no runtime code or
test**. It is a classification exercise so future PRs can
choose the right shape.

## 2. Classification taxonomy

The repository is classified into six categories. Each entry
in the inventories below carries one tag from this set.

| Category | Definition | Recommendation | Examples |
| --- | --- | --- | --- |
| **A. Platform Core** | Primitives, types, validators, and cross-cutting safety machinery that any future vertical (and the platform itself) depends on. | **Build.** Priority work. Every change is reviewed against the platform thesis + the safety standard. | `src/lib/cie/*`, `src/server/llm/types.ts`, the platform thesis doc, the safety standard, the CIE architecture doc. |
| **B. CoRent Vertical Proof** | UI / service code that demonstrates a platform primitive against the rental try-before-buy domain. Useful as proof-of-shape; not as the company's product. | **Keep but do not deepen** marketplace-specific scope unless the slice validates a platform primitive. | `AISearchInput`, `SearchIntentSummary`, `WantedTryRequestForm`, readiness services, request lifecycle. |
| **C. Closed-alpha Operations** | The internal-only operations stack that lets the founder run smokes and review tester signal. Not the platform product surface. | **Keep as internal alpha ops.** Do not confuse with the public platform surface. Do not graduate to multi-tenant without security review. | Auth routes, `/admin/cockpit`, founder feedback review, smoke run docs, provisioning docs. |
| **D. Deferred / Blocked by ISS-0** | Existing code or planned scope that the [Interaction Safety Standard v0](interaction_safety_standard_v0.md) explicitly defers. Not "wrong"; just out of the current build window. | **Stop building.** Explicit founder approval + a separately-gated security review are required to revive any of these. | Real LLM provider, embeddings, payment / PG, trust score, claim/dispute, seller demand board, multi-tenant admin. |
| **E. Historical / Context-only** | Docs that capture how we got here. They explain past decisions but should not drive current planning. Direction v2, the platform thesis, the safety standard, and the CIE architecture supersede them on conflict. | **Keep for orientation.** Do not delete. Future docs-only PR may add `Status: Historical` headers where missing. | Older context / intent-rule notes, MVP v1 completion record, validation bundle landing notes, retired UX system v1, Codex absorption record. |
| **F. Needs Repositioning Later** | Files / namespaces / route names that are shaped correctly but bear the wrong label given the platform thesis. Renaming is a deliberate future decision; not in scope today. | **Note and defer.** Do not rename now; the rename PR is separate and depends on choices we have not made (public product name, namespace, multi-tenancy). | `src/lib/cie/*` namespace, `corent_*` doc filenames that describe platform-level primitives, possibly `/dashboard` if a platform admin surfaces. |

## 3. Platform Core inventory (A)

These files / modules are the platform's durable surface. Every
one of them passes ISS-0's import-boundary tests today (no
`@/server/**` from client modules where forbidden, no Supabase
in pure data primitives, no LLM provider SDKs, no payment
imports). Continue to evolve them inside the safety standard.

### Strategic / governance docs

| File | Why platform core |
| --- | --- |
| [`docs/platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md) | The "why" — defines AI Interaction Layer category, the 8-primitive model, and the decision rules for every future slice. |
| [`docs/interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md) | The "what is allowed" — risk tier model (T0–T5), 10 core safety principles, primitive safety rules, pre-work decision checklist. v0 pin. |
| [`docs/corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md) | The "how" — block-recipe vocabulary, tool list, deterministic-vs-LLM split, 5-phase roadmap. Status header marks it as implementation architecture for the platform thesis. (Filename is CoRent-flavored — see §9.) |
| [`docs/README.md`](README.md) | Documentation hierarchy index. The 10-tier order is the on-ramp every future agent reads first. |

### CIE primitive code seams

| File | Primitive | Notes |
| --- | --- | --- |
| [`src/lib/cie/knowledgeRegistry.ts`](../src/lib/cie/knowledgeRegistry.ts) | **KnowledgeSource** | Closed audience × surface × intent vocab; 8 v1 cards; `validateCIEKnowledgeRegistry`; `assertNoBannedClaimsInKnowledgeRegistry`. Banlist-clean. |
| [`src/lib/cie/deterministicPlanner.ts`](../src/lib/cie/deterministicPlanner.ts) | **Planner (deterministic baseline)** | 9-type closed block-recipe union; pure `(input × surface × intent × context) → CIEPlan`; `validateCIEPlan`; `assertNoBannedClaimsInCIEPlan`. Byte-stable. |
| [`src/lib/cie/interactionIntent.ts`](../src/lib/cie/interactionIntent.ts) | **InteractionIntent** | 11-status lifecycle; 6-tier risk model (ISS-0 aligned); 11 event types; 29-slot DTO discipline; T3/T4/T5 cannot reach `executed`; pure data + pure functions. |

### LLM adapter shape (provider-neutral, mock-first)

| File | Why platform core |
| --- | --- |
| [`src/server/llm/types.ts`](../src/server/llm/types.ts) | The provider-neutral `LLMAdapter` interface + `provenance: "llm_candidate"` on every candidate. The shape every future provider plug-in fits into. |
| [`src/server/llm/normalize.ts`](../src/server/llm/normalize.ts) | The single normalizer the mock + future real providers both pass through. Output authority discipline lives here. |
| [`src/server/llm/mockAdapter.ts`](../src/server/llm/mockAdapter.ts) | Deterministic stub; no env reads, no network, no provider SDK. Today's only LLM. |
| [`src/server/llm/invoke.ts`](../src/server/llm/invoke.ts) | The orchestration entry point. The seam where a real provider plugs in (separately gated by ISS-0). |
| [`src/server/llm/cost.ts`](../src/server/llm/cost.ts) | Token-count + cost-class shape. Future budget cap relies on this. |
| [`src/server/llm/index.ts`](../src/server/llm/index.ts) | Public barrel — server-only, never imported from `src/components/**`. |

### Cross-cutting safety machinery

| File | Why platform core |
| --- | --- |
| [`src/server/intents/intentResult.ts`](../src/server/intents/intentResult.ts) | The typed `IntentResult<T>` envelope every server action returns. The shape that makes "every action declares its argument schema" enforceable. |
| [`src/lib/copy/copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts) | The closed-alpha banlist scan that pins `Guardrail` policy at the test layer. Future platform Guardrail registry inherits this discipline. |
| [`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts) | The static-text boundary test that prevents `@/server/**` leaking into client modules. The first concrete enforcement of the "no arbitrary import" surface. |
| [`src/server/actors/import-boundary.test.ts`](../src/server/actors/import-boundary.test.ts) | Boundary protection for actor-resolution — keeps client code from importing `resolveServerActor` directly. |

## 4. CoRent Vertical Proof inventory (B)

These surfaces continue to ship as proof of shape. **Do not
deepen marketplace-specific scope** unless the slice
demonstrates a platform primitive. Keep slices small,
test-heavy, banlist-clean.

### Borrower-side proof

| File | Demonstrates |
| --- | --- |
| [`src/components/AISearchInput.tsx`](../src/components/AISearchInput.tsx) + [`src/app/page.tsx`](../src/app/page.tsx) | **Home → IntentSummary** entry. Try-before-buy intent capture; routes into `/search` only (no LLM, no wanted-write from home). Maps to platform's home-surface IntentSummaryBlock. |
| [`src/components/SearchIntentSummary.tsx`](../src/components/SearchIntentSummary.tsx) + [`src/components/SearchResults.tsx`](../src/components/SearchResults.tsx) + [`src/app/search/page.tsx`](../src/app/search/page.tsx) | **CIE Step 02** — IntentSummary + try criteria + listing matches + wanted-CTA. Maps to four block recipes in `deterministicPlanner.ts`. |
| [`src/components/WantedTryRequestForm.tsx`](../src/components/WantedTryRequestForm.tsx) + [`src/lib/client/feedbackClient.ts`](../src/lib/client/feedbackClient.ts) + [`src/server/feedback/submitFeedback.ts`](../src/server/feedback/submitFeedback.ts) | **UnmetIntentCaptureBlock** prototype. T1 lead-capture pattern via existing `feedback_submissions.kind = "wanted_item"` — no schema change. |
| [`src/components/ServerListingDetailClient.tsx`](../src/components/ServerListingDetailClient.tsx) + [`src/app/listings/[listingId]`](../src/app/listings/[listingId]) | **PreActionChecklistBlock** prototype. Listing-detail readiness card derived from a deterministic service. |
| [`src/components/MyRequestsClient.tsx`](../src/components/MyRequestsClient.tsx) + [`src/app/requests`](../src/app/requests) + [`src/lib/client/myRequestsClient.ts`](../src/lib/client/myRequestsClient.ts) | **Request status block** prototype. Borrower-side request lifecycle echo. Useful only insofar as it forces InteractionIntent's lifecycle through a real action. |

### Seller-side proof

| File | Demonstrates |
| --- | --- |
| [`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx) + [`src/app/dashboard`](../src/app/dashboard) | **SupplierReadinessBlock** prototype. Status-aware "what to clarify before publishing" panel + listing table. |
| [`src/components/ChatToListingIntakeCard.tsx`](../src/components/ChatToListingIntakeCard.tsx) + [`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts) + [`src/server/intake/*`](../src/server/intake) | **Chat intake** prototype — drives the deterministic chat-listing intake service + LLM-candidate channel. Seam where an Action's argument schema is exercised. |
| [`src/lib/client/sellerDashboardListingsClient.ts`](../src/lib/client/sellerDashboardListingsClient.ts) + [`src/lib/client/sellerDashboardRequestsClient.ts`](../src/lib/client/sellerDashboardRequestsClient.ts) + [`src/lib/client/respondToRentalRequestClient.ts`](../src/lib/client/respondToRentalRequestClient.ts) | Seller's proof that **typed Action argument schemas + per-action validation** scale across multiple actions. |

### Deterministic readiness services (the closed-vocabulary core)

| File | Notes |
| --- | --- |
| [`src/lib/services/tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts) | Pure deterministic — closed Korean vocabulary keyed by `CategoryId`. Source of `try_criteria` block recipes. |
| [`src/lib/services/sellerListingReadinessService.ts`](../src/lib/services/sellerListingReadinessService.ts) | Pure deterministic — status-aware seller copy. Source of `seller_readiness` block. |
| [`src/lib/services/marketplaceIntelligenceService.ts`](../src/lib/services/marketplaceIntelligenceService.ts) | Deterministic match hints + match explanations. Source of `match_hints` blocks. |
| [`src/lib/services/searchService.ts`](../src/lib/services/searchService.ts) | URL-param round-trip + mock parser. Future `parse_intent` action wraps this. |
| [`src/lib/services/publicListingService.ts`](../src/lib/services/publicListingService.ts) | Public allowlist projection. Source of `listing_matches` and `listing_card` block payloads. |

### CoRent vertical-direction docs that remain useful

| File | Notes |
| --- | --- |
| [`docs/corent_product_direction_v2.md`](corent_product_direction_v2.md) | CoRent vertical direction (fee shape, geography, design maturity, flow-first). Status header pins it as vertical-only under the platform thesis. |
| [`docs/corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md) | Cold-start wedge plan. PR 2 + PR 3 shipped; PR 4–6 future. |
| [`docs/corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md) | The copy-variant pool every new Korean string passes through. |
| [`docs/corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md) | Per-category fitness scoring. Drives "first wedge" decision. |
| [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) | Pre-revenue posture / runtime modes. Still in force. |
| [`docs/corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md) | The visual system. Survives platform repositioning intact (visual change is gated separately). |
| [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) | Regulated-language ban + partner posture. Vertical-specific but the discipline is platform-relevant. |
| [`docs/corent_defensibility_note.md`](corent_defensibility_note.md) | Disclosure boundaries. Still in force. |

## 5. Closed-alpha Operations inventory (C)

The internal stack that lets the founder run rounds. **Keep as
internal alpha ops.** It is **not** the platform product
surface — do not graduate it to multi-tenant or external use
without a fresh security review.

### Auth + identity

| File | Notes |
| --- | --- |
| [`src/app/auth/sign-in/route.ts`](../src/app/auth/sign-in/route.ts) | Magic-link initiation (user). |
| [`src/app/auth/password-sign-in/route.ts`](../src/app/auth/password-sign-in/route.ts) | Closed-alpha password sign-in (user). |
| [`src/app/auth/callback/route.ts`](../src/app/auth/callback/route.ts) + [`src/app/auth/sign-out/route.ts`](../src/app/auth/sign-out/route.ts) | Callback + sign-out. |
| [`src/app/admin/auth/sign-in/route.ts`](../src/app/admin/auth/sign-in/route.ts) + [`src/app/admin/auth/password-sign-in/route.ts`](../src/app/admin/auth/password-sign-in/route.ts) + [`src/app/admin/auth/callback/route.ts`](../src/app/admin/auth/callback/route.ts) | Founder admin auth (allowlist-gated). |
| [`src/app/login/page.tsx`](../src/app/login/page.tsx) + [`src/app/admin/login/page.tsx`](../src/app/admin/login/page.tsx) | Login surfaces (password-first, magic-link fallback). |
| [`src/server/auth/sessionSummary.ts`](../src/server/auth/sessionSummary.ts) + [`src/server/auth/redirect.ts`](../src/server/auth/redirect.ts) + [`src/server/admin/auth.ts`](../src/server/admin/auth.ts) + [`src/server/admin/redirect.ts`](../src/server/admin/redirect.ts) + [`src/server/admin/supabase-ssr.ts`](../src/server/admin/supabase-ssr.ts) | Session, founder allowlist, SSR cookie store. |
| [`src/server/actors/resolveServerActor.ts`](../src/server/actors/resolveServerActor.ts) + [`src/server/actors/profileLookup.ts`](../src/server/actors/profileLookup.ts) | Actor resolution (seller / borrower / founder) for `runIntentCommand`. |

### Founder cockpit

| File | Notes |
| --- | --- |
| [`src/app/admin/cockpit/page.tsx`](../src/app/admin/cockpit/page.tsx) + [`src/server/admin/founderCockpitData.ts`](../src/server/admin/founderCockpitData.ts) | Founder-only validation cockpit. Recent listings / requests / feedback / aggregates. |
| [`src/components/FeedbackReviewControls.tsx`](../src/components/FeedbackReviewControls.tsx) + [`src/lib/client/feedbackReviewClient.ts`](../src/lib/client/feedbackReviewClient.ts) + [`src/server/feedback/updateFeedbackStatus.ts`](../src/server/feedback/updateFeedbackStatus.ts) | Founder-only feedback review workflow (`new → reviewed → archived`). The early **HumanReview primitive** prototype. |
| [`src/components/PublishListingButton.tsx`](../src/components/PublishListingButton.tsx) + [`src/lib/client/publishListingClient.ts`](../src/lib/client/publishListingClient.ts) + [`src/server/listings/publishListing.ts`](../src/server/listings/publishListing.ts) | Founder-only listing publication action. |
| [`src/app/admin/dashboard`](../src/app/admin/dashboard) + [`src/server/admin/dashboard-data.ts`](../src/server/admin/dashboard-data.ts) | Phase 1 analytics dashboard. |
| [`src/app/admin/dev/db-health`](../src/app/admin/dev/db-health) | Founder-only DB health probe. |

### Smoke / tester operations

| File | Notes |
| --- | --- |
| [`docs/smoke_runs/*`](smoke_runs/) | Templates + run records + readiness-feedback ops kit. Snapshots, not authority. |
| [`docs/corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md) + [`docs/corent_closed_alpha_smoke_test_plan.md`](corent_closed_alpha_smoke_test_plan.md) | Founder smoke runbooks. |
| [`docs/corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md) | Manual `profiles` + capability provisioning workflow. |
| [`docs/corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md) | Project-specific guardrails (banned copy, server/local, password sign-in posture, wanted-try-request posture). Sits **under** the safety standard. |
| [`docs/corent_security_gate_note.md`](corent_security_gate_note.md) | Gates that fire for DB / auth / payment / file upload / location work. |
| [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql) | Founder-only SQL template. **Never run via agent.** |

## 6. Deferred / Blocked by ISS-0 inventory (D)

Each row below is **stop-list**: do not build, expand, or
deepen until a separately-gated slice authorizes it.

| Area | Existing repo footprint | ISS-0 tier that blocks it | Why blocked now |
| --- | --- | --- | --- |
| **Real LLM provider call** | None — only `mockAdapter`. | T-cross-cutting: §4.5 LLM candidate-only + §9 (provider use requires security review). | Mock-first is the rule. A real provider lands behind the existing `LLMAdapter` interface in a separately-gated slice with its own threat model. |
| **Embeddings / vector store** | None. | T-cross-cutting: §11 data/RAG (Phase B in CIE arch). | Phase A structured registries first. |
| **External JS snippet for 3rd-party customers** | None. | T3+ Integration scope. | No multi-host distribution before the first external-wedge decision. |
| **Multi-tenant admin / tenancy primitives** | None. | T3+ Integration. | Single-host in-repo only. |
| **CRM / calendar / ticket / external webhook integrations** | None. | T3 — explicitly forbidden by §13 of ISS-0. | Out of scope. |
| **Payment / PG integration** | Pricing helpers + `PriceBreakdown` are vertical scaffolding, not payment. No real PG adapter. | T5 — explicitly forbidden by §12 of platform thesis + ISS-0 §13 + pre-revenue beta plan. | Forbidden in the current window. |
| **Deposit / escrow / settlement / refund** | None at code level. | T5. | Forbidden. |
| **Insurance / guarantee framing** | None — banned copy already enforced. | T4 high-trust regulated language. | Banned phrases pinned in `copyGuardrails.test.ts`. |
| **Legal / medical / financial / immigration decisioning** | None. | T4. | No wedge selected; out of scope. |
| **Autonomous action execution** | None — every Action requires user confirmation. | Cross-cutting: §4.2 No arbitrary action + §7 Action safety rules. | Forbidden. Every dispatch goes through a `confirm` block. |
| **Seller demand board** | Reserved as `show_seller_demand_signals_future` in `CIE_RELATED_ACTIONS`. No surface yet. | T3 — DTO projection + RLS read policy + security review required. | Deferred to PR 4 of the wanted-try-request slice plan. |
| **Trust score / broad trust system** | [`src/lib/services/trustEvents.ts`](../src/lib/services/trustEvents.ts) is a vertical-era scaffold. **Do not deepen.** Banlist forbids `trustScore`. | T4. | "Verified seller" / trust score language is banlist-banned. The existing file may eventually be repositioned (§9) but no new feature ships on it. |
| **Disputes / claims / returns** | [`src/lib/services/claimReviewService.ts`](../src/lib/services/claimReviewService.ts) + [`src/app/admin/claims`](../src/app/admin/claims) + [`src/app/api/admin/claims`](../src/app/api/admin/claims). Pre-platform-thesis scaffold. **Do not deepen.** | T4–T5. | Existing surfaces are gated and read-only-shaped; do not graduate to a full lifecycle. |
| **Handoff workflow as a vertical mechanism** | [`src/lib/services/handoffService.ts`](../src/lib/services/handoffService.ts) — pre-platform-thesis vertical scaffold. **Do not deepen** as a rental-pickup mechanism. | T3+ when it touches external delivery; T2 internal-only. | Internal `handoff` lifecycle word in `interactionIntent.ts` is unrelated to a rental-pickup handoff service; do not conflate. |
| **Logistics / delivery** | None. Direct pickup only per CoRent direction v2. | T3+. | Out of scope. |

## 7. Historical / Context-only docs (E)

These are already cataloged in [`docs/README.md`](README.md)
§7. They explain how we got here. **Do not delete.** Future
docs-only PR may stamp `Status: Historical` headers where
missing — that's PR A in §15.

| File | Reason it should not drive current planning |
| --- | --- |
| [`docs/corent_context_note.md`](corent_context_note.md) | Older 10% / Seoul-beta framing. Direction v2 + the platform thesis supersede on conflict. |
| [`docs/corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md) | Older intent-model implementation rules; reads as if CoRent is the company. |
| [`docs/corent_functional_mvp_implementation_note.md`](corent_functional_mvp_implementation_note.md) | Implementation snapshot during the functional-MVP era. |
| [`docs/corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md) | Milestone 1 record (2026-04-30). |
| [`docs/corent_codex_absorption_note.md`](corent_codex_absorption_note.md) | Codex branch absorption record. |
| [`docs/corent_mvp_qa_stabilization_note.md`](corent_mvp_qa_stabilization_note.md) | One-off QA stabilization cycle. |
| [`docs/corent_return_trust_layer.md`](corent_return_trust_layer.md) | Older return-trust copy module. The current responsibility framing lives in the readiness service + closed-alpha quality gates. |
| [`docs/corent_validation_bundle1_part3_publication_note.md`](corent_validation_bundle1_part3_publication_note.md) + [`_part4`](corent_validation_bundle1_part4_renter_request_note.md) + [`bundle2_slice1`](corent_validation_bundle2_slice1_public_browse_bridge_note.md) + [`slice2`](corent_validation_bundle2_slice2_renter_request_ui_note.md) + [`slice3`](corent_validation_bundle2_slice3_seller_request_visibility_note.md) + [`slice4`](corent_validation_bundle2_slice4_founder_cockpit_note.md) | Slice landing notes (all shipped). Useful for archeology. |
| [`docs/corent_closed_alpha_actor_resolver_note.md`](corent_closed_alpha_actor_resolver_note.md) + [`_chat_intake_client_mode_note.md`](corent_closed_alpha_chat_intake_client_mode_note.md) + [`_dashboard_listings_externalization_note.md`](corent_closed_alpha_dashboard_listings_externalization_note.md) + [`_listing_draft_externalization_note.md`](corent_closed_alpha_listing_draft_externalization_note.md) + [`_user_auth_note.md`](corent_closed_alpha_user_auth_note.md) | Closed-alpha implementation slice notes (all shipped). |
| [`docs/corent_closed_alpha_intake_dispatch_smoke_note.md`](corent_closed_alpha_intake_dispatch_smoke_note.md) | Older smoke note. |
| [`docs/corent_ux_system_v1.md`](corent_ux_system_v1.md) | Older UX system. BW Swiss Grid v1 supersedes. |
| [`docs/db_readiness_audit_v1.md`](db_readiness_audit_v1.md) | Earlier DB readiness audit; the architecture has moved on. |
| [`docs/today_queue.md`](today_queue.md) | Tactical day-of notes. Not a plan. |
| [`docs/phase1_validation_beta_plan.md`](phase1_validation_beta_plan.md) + [`phase2_backend_draft_review.md`](phase2_backend_draft_review.md) + [`phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md) + [`phase2_founder_decisions.md`](phase2_founder_decisions.md) + [`phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md) | Phase-1 / Phase-2 era planning. Some are reference, some are stale; all should be read as snapshots, not direction. |

## 8. Needs Repositioning Later (F)

These items are shaped right but labeled wrong given the
platform thesis. **Do not rename now.** Renaming requires the
public product name + namespace decisions that are still open
([platform thesis §15](platform_thesis_ai_interaction_layer.md)).

### Code namespace

| Item | Why it may need repositioning | What not to do yet | Safe future action |
| --- | --- | --- | --- |
| [`src/lib/cie/`](../src/lib/cie/) namespace (`knowledgeRegistry.ts`, `deterministicPlanner.ts`, `interactionIntent.ts`) | "CIE" is CoRent-flavored. The platform thesis explicitly notes `cie/` is the closed-alpha-window internal name. | No `git mv`, no module-spec refactor, no public API rename. Importers (zero today outside the same folder + tests) would have to update. | Future docs-only PR proposes a target namespace (`src/lib/platform/`?) tied to the public name decision. The rename PR is its own slice. |
| [`src/server/llm/`](../src/server/llm/) | Already platform-shaped. Name is fine. | — | Possibly graduate to `src/server/platform/llm/` if a `src/server/platform/` namespace lands later; otherwise leave. |
| Components shaped like generic blocks but named CoRent-specifically: [`SearchIntentSummary.tsx`](../src/components/SearchIntentSummary.tsx), [`WantedTryRequestForm.tsx`](../src/components/WantedTryRequestForm.tsx), [`SellerListingReadiness*`](../src/lib/services/sellerListingReadinessService.ts), [`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts) | The component is a `<BlockType>` recipe renderer; the name reads as a CoRent UI surface. The §6 mapping in the platform thesis already proposes generic names: `IntentSummaryBlock` / `UnmetIntentCaptureBlock` / `SupplierReadinessBlock` / `PreActionChecklistBlock`. | Do not rename. The component contract still matches today's CoRent flow exactly; renaming now creates churn without value. | When a second vertical actually needs the same shape, extract a generic block module (e.g. `src/components/blocks/IntentSummaryBlock.tsx`) and have the CoRent component re-export it. |

### Doc filenames

| Item | Why it may need repositioning |
| --- | --- |
| [`docs/corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md) | This is the platform's implementation architecture; the `corent_` prefix is CoRent-flavored. Status header already calls it "implementation architecture for the platform thesis." Eventual rename target: `docs/platform_implementation_architecture.md` or similar. **Do not rename now** — every cross-link in `docs/README.md` and slice plans points at the current name. |
| [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md), [`docs/corent_security_gate_note.md`](corent_security_gate_note.md), [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md), [`docs/corent_defensibility_note.md`](corent_defensibility_note.md) | These are vertical-direction-style docs but their *substance* is platform-relevant (regulated language ban, security gate, pre-revenue posture, disclosure boundaries). Eventual repositioning may split each into a "platform" + "CoRent vertical" pair. **Do not split now**; the substance is correct as-is. |

### Routes

| Item | Why it may need repositioning | Safe future action |
| --- | --- | --- |
| `/dashboard` (currently CoRent seller dashboard) | If a multi-tenant **platform admin** ever surfaces, `/dashboard` becomes ambiguous. | When platform admin lands, host CoRent dashboard at `/c/<host>/dashboard` or similar; **not before**. |
| `/admin/cockpit` (founder-only validation cockpit) | If platform operators arrive (multi-tenant), a separate platform admin namespace may be needed. | Add a platform admin namespace later (`/admin/platform/...`) and keep `/admin/cockpit` as the host's own cockpit. |
| `/items/[id]` vs `/listings/[listingId]` | `/items` is the static/local demo path; `/listings` is the server-only path. The split is intentional but reads as legacy. | Keep both routes for now (test surfaces depend on them). When the platform's block renderer matures, the demo path can graduate to `/demo/...`. |

## 9. Stop-list for CoRent expansion

Do **not** build, expand, or deepen any of the following until a
separately-gated CoRent vertical decision is made.

- **Marketplace growth.** No category expansion past the
  current 7 (`massage_gun / home_care / exercise / vacuum /
  projector / camera / camping`) without a wedge decision per
  [`corent_category_wedge_research_checklist.md`](corent_category_wedge_research_checklist.md).
- **Seller store sophistication.** Storefront polish, seller
  branding, store-level analytics — no new slices.
- **Rental payment.** No PG integration, no Toss / PortOne
  wiring, no fee-calculation lift, no checkout surface.
  Pricing helpers stay informational only.
- **Trust / deposit / insurance / dispute.** Banned framing.
  No new entries to `trustEvents.ts` / `claimReviewService.ts`.
- **Return / handoff / claim flows.** No lifecycle past
  `seller_approved` / `seller_cancelled`. Direct pickup only.
- **Logistics.** No delivery integration, no shipping
  estimation.
- **Broad user acquisition as a rental marketplace.** No
  growth experiments framing CoRent as "the rental app."

These are not bad ideas. They simply belong to a future CoRent
vertical decision (when a non-platform reason justifies them),
not to current platform-core work.

## 10. Continue-list for CoRent proof

Continue **only** when the slice strengthens a platform
primitive. Each item below has a stable test surface today and
is small enough to not derail.

- **Minimal try-before-buy flow.** Search → intent summary →
  result or wanted-try-request → request submission. Adds
  signal toward InteractionIntent's lifecycle.
- **Search intent summary tightening.** Copy variants,
  category-specific try-criteria expansions — sourced from
  [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md).
- **Wanted-request capture.** Strict `T1` shape; no schema
  expansion; founder cockpit remains the only reader.
- **Founder review workflow.** Fits the HumanReview primitive
  prototype. Adding a second transition (e.g. `reviewed →
  reopened`) would prove the workflow's reversibility — **but
  only** as a HumanReview slice, not a feedback-only one.
- **Readiness cards as checklist-block proof.** When a third
  reading-stage shows up (e.g. for `apply` or `book` intent
  kinds in another vertical), generalize then. Until then,
  keep the closed Korean vocabulary.
- **Request lifecycle** only insofar as it forces an
  InteractionIntent + Action through a real domain. Do not
  add lifecycle states past `seller_approved` /
  `seller_cancelled` (they live in the lifecycle wrapper, not
  in CoRent vertical surfaces).
- **Smoke runs with real founder + real testers.** Tester
  rounds drive the copy backlog; copy backlog drives the
  KnowledgeSource registry.

## 11. Next primitive roadmap

The platform now has three primitives shipped (KnowledgeSource,
Planner, InteractionIntent). The recommended next five, in
order:

| # | Primitive | Why next | Notes |
| --- | --- | --- | --- |
| 1 | **ComponentBlock registry v1** | The block-recipe vocabulary today lives as a discriminated union in `deterministicPlanner.ts`. A first-class registry that hosts can extend (per ISS-0 §6) is the next seam. Pure-data, tests-only — no UI wiring. | Lift `CIEBlockRecipe` shapes into a typed registry with per-block `length` caps, allowed slot manifests, source-required flags. |
| 2 | **Action registry v1** | Today's actions are listed as ids in `CIE_RELATED_ACTIONS`. v1 adds per-action argument schemas, declared risk tier, declared confirmation policy, allowed-input-fields manifest, declared reversibility metadata. Pure-data, tests-only. | Maps to ISS-0 §7 Action safety rules. The dispatcher seam follows in a later slice. |
| 3 | **BrandProfile v1** | The "renderer owns appearance; BrandProfile may style but cannot disable safety copy" rule from ISS-0 §6 needs a first concrete shape. v1 declares which tokens are themable and which are pinned. Pure-data, tests-only. | The visual-system change gate from `agent_loop.md` still applies; BrandProfile is *additive*, not a redesign. |
| 4 | **GuardrailPolicy v1** | Today's guardrails are spread across `copyGuardrails.test.ts` + `assertNoBannedClaims*` helpers + boundary tests. v1 unifies them into a typed `GuardrailPolicy` with banlist + DTO-projection + authority-gate slots. Pure-data, tests-only. | Maps to ISS-0 §4.7 / §4.8 / §6 / §7 / §8. Hosts compose; orchestrator consumes. |
| 5 | **AnalyticsEvent taxonomy v1** | The closed-vocabulary event-name + reason-code pattern already exists in `src/server/logging`. v1 lifts it into a typed taxonomy with per-event field allowlists, retention policy, intent-id linkage. | Maps to ISS-0 §4.9 / §11 / InteractionIntent's lifecycle. **No retention implementation** — the policy is declared, not enforced, in v1. |

InteractionIntent v1 is already shipped
([`src/lib/cie/interactionIntent.ts`](../src/lib/cie/interactionIntent.ts))
— it does not appear on this list.

The 6th–8th primitives (HumanReview workflow, Integration
contract, future LLM provider behind the existing adapter
shape) are intentionally deferred until at least three of the
above five have shipped.

## 12. Suggested repo policy going forward

Rules. These are the new defaults; future PRs cite them.

- **Every new feature is labeled** as **Platform Core /
  Vertical Proof / Alpha Ops / Deferred** in the slice plan or
  PR description. If the label is unclear, the work needs
  reshaping.
- **Platform Core lives under** [`src/lib/cie/`](../src/lib/cie/)
  (or a future `src/lib/platform/` once a rename is
  authorized). It does not live inside `src/components/**`.
- **CoRent-specific code must not introduce platform
  authority concepts.** A CoRent component imports primitives
  from Platform Core; Platform Core never imports a CoRent
  component.
- **High-risk feature must cite an ISS-0 tier.** T0–T2 are
  buildable now; T3+ require a separately-gated slice.
- **Docs that change direction must update
  [`docs/README.md`](README.md).** The hierarchy index is the
  cold-read entry point.
- **No file moves until this audit is accepted.** Rename PRs
  follow the audit; they do not piggy-back.
- **Banlist + DTO discipline are non-negotiable.** Every new
  user-facing string passes the closed-alpha banlist; every
  new data shape passes the forbidden-slot scan.
- **Mock-first always.** Real provider adapters land in
  separately-gated slices.

## 13. Non-actions in this audit

Plain statement so a future reader does not misread the audit
as an execution log:

- **No files moved.** Every path referenced above is
  unchanged from the pre-audit tree.
- **No files deleted.** Historical docs in §7 are kept.
- **No routes renamed.** `/dashboard`, `/admin/cockpit`,
  `/items/[id]`, `/listings/[listingId]`, `/auth/*`,
  `/admin/auth/*`, `/login`, `/admin/login`, `/sell`,
  `/search`, `/requests`, `/sellers/[sellerId]`, `/api/*`,
  `/privacy`, `/terms` — all unchanged.
- **No runtime code changed.** `src/lib/`, `src/server/`,
  `src/app/`, `src/components/` all untouched.
- **No tests changed.** Test count stays at 1711 across 103
  files.
- **No docs marked historical except this audit's
  recommendations.** Stamping `Status: Historical` on the
  candidates listed in §7 is **PR A** in §15 — a separate
  docs-only PR.

## 14. Recommended next PRs

In order:

### PR A — `docs: apply Historical / Deferred status headers to legacy CoRent docs`

Stamps the docs in §7 with `Status: Historical` blockquotes.
Stamps the Deferred / Blocked items in §6 with `Status:
Deferred` notes where they live as runtime files (the
trust/claim/handoff service files get a "do not deepen" note;
no code change). Does **not** move or delete any file.

### PR B — `feat: ComponentBlock registry v1`

Lifts `CIEBlockRecipe` into a typed registry with per-block
allowed-slot manifests, `length` caps, source-required flags.
Pure-data + tests-only. No UI wiring. Follows the same shape
as `knowledgeRegistry.ts` and `interactionIntent.ts`.

### PR C — `feat: Action registry v1`

Lifts `CIE_RELATED_ACTIONS` ids into a typed Action registry
with per-action argument schema, declared risk tier, declared
confirmation policy, declared reversibility metadata. Pure-
data + tests-only. The dispatcher seam follows in a later
slice.

### Optional PR D — `docs: platform homepage / public positioning plan`

Docs-only proposal for the public positioning of the platform
once a name is chosen. Open questions from
[`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
§15 are explicitly *not* answered in this PR — it's a plan, not
a decision.

End of repositioning audit.

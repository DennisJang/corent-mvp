# CoRent Product Flow Completion Plan

> **Status:** Current — umbrella implementation plan
> **Scope:** Path from "skeleton-passing → product-UX-passing":
> milestone tracker, summaries of LLM / payment / location /
> design completion (each graduating to its own dedicated doc when
> the slice starts), and §10 cross-link to the CIE architecture
> plan
> **Last reviewed:** 2026-05-06 (recorded 2026-05-05)
> **Read before:** any non-trivial runtime PR; planning the next
> slice; aligning with the CIE roadmap phases
> **Do not use for:** strategic architecture (use
> [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md));
> the closed-alpha banlist (use
> [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md));
> the cold-start wedge (use
> [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md))

_Recorded: 2026-05-05. Author: founder + Claude. Posture: closed-alpha._

> **Honesty banner.** The first real remote E2E smoke passed against
> `corent-dev` on 2026-05-05
> ([`docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`](smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md)).
> That smoke validated **Auth + DB + closed-alpha skeleton
> connectivity**. It did **not** validate final product UX. The
> product is still pre-revenue. **No real money has moved, no real
> deposit has been held, no real lifecycle past `requested` exists
> server-side, and no global readiness has been validated.** This
> document plans the path from skeleton-passing to product-UX-passing
> without overclaiming what is built.

This is the umbrella plan. LLM, payment, location, and design
completion sections in this file are **summaries only**; each will
graduate to its own dedicated doc when the corresponding slice
starts.

## 0. Posture & non-goals

- Pre-revenue beta posture in
  [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
  is in force until **2026-07-13** AND explicit founder /
  legal / payment / business readiness approval. Either alone is
  insufficient.
- Security gate in
  [`corent_security_gate_note.md`](corent_security_gate_note.md)
  applies to every surface that touches: real auth/session, real
  DB, real payment, real file/photo upload, location-based
  matching, partner-protection wiring.
- Legal/trust posture in
  [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
  bans regulated language (insurance / coverage / claim payout /
  premium) until a licensed partner is contracted and reviewed.
- BW Swiss Grid v1 (
  [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)
  ) is the only visual system. Adding a third color, gradient, or
  decorative accent is forbidden.
- The externalization architecture in
  [`corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
  is the canonical playbook for moving any new domain from local
  → Supabase. New surfaces follow that pattern; do not invent
  new ones.

## 1. Current working skeleton flow (already built, smoke-tested)

The 2026-05-05 remote smoke
([`docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`](smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md))
validated this exact path:

| # | Surface | Route / action | Tables written | Status |
| --- | --- | --- | --- | --- |
| 1 | Founder magic-link login | `/admin/login` → `/admin/auth/callback` | (auth cookie only) | ✅ |
| 2 | Renter magic-link login | `/login` → `/auth/callback` | (auth cookie only) | ✅ |
| 3 | Manual founder provisioning | SQL editor → [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql) | `profiles`, `seller_profiles`, `borrower_profiles` | ✅ |
| 4 | Seller chat intake (server) | `/sell` → `getChatIntakeModeAction` → `startIntakeSessionAction` → `appendIntakeSellerMessageAction` → `createIntakeListingDraftAction` | `listing_intake_sessions`, `listing_intake_messages`, `listing_extractions`, `listings` (draft), `listing_verifications` | ✅ |
| 5 | Seller dashboard (server mode) | `/dashboard` → `listSellerOwnedListingsAction`, `listSellerRentalRequestsAction`, `getChatIntakeModeAction` | (read) | ✅ |
| 6 | Founder cockpit (read + publish) | `/admin/cockpit` → `readFounderCockpitData`, `publishListingAction` | `listings.status = 'approved'` | ✅ |
| 7 | Public browse | `/search` → `listPublicListingsAction` | (read) | ✅ |
| 8 | Public listing detail | `/listings/[id]` → `getServerApprovedPublicListingAction` | (read) | ✅ |
| 9 | Renter request creation | `/listings/[id]` → `createRentalRequestAction` | `rental_intents` (`requested`), `rental_events` (`null → requested`, `actor=borrower`) | ✅ |
| 10 | Feedback intake | `/` → `submitFeedbackAction` | `feedback_submissions` | ✅ |
| 11 | Cockpit feedback read | `/admin/cockpit` → `readFounderCockpitData` | (read) | ✅ |

What is **not yet built or not yet remote-externalized** (this is
the honest list — see §3 for detail):

- Seller server-side approve / decline / cancel for `requested`
  rentals. The dashboard's existing approve/decline buttons run
  through `rentalService` against local persistence; no server
  action exists yet.
- Renter "my requests" page. After clicking `요청 보내기`, the
  renter has no surface to come back to; the seller can see the
  request but the renter cannot follow up.
- Real LLM. `chatIntakeExtractor.ts` is a deterministic local
  keyword/heuristic extractor; the file header explicitly states
  "**No external AI / LLM call. No network. No API keys.**"
- Real payment / deposit / escrow / settlement / refund. Schema
  carries forward-compatible columns (`payment_provider`,
  `payment_status`, `settlement_status`) but no money moves.
- Handoff and return lifecycle remote-externalization. Handoff
  service writes only to local persistence (`getPersistence()`).
- `trust_events` and `rental_handoffs` tables. They do not exist
  in any migration; the corresponding services run locally only.
- Notifications (email / push / SMS).
- Global location model. Schema enum is Korea-only;
  `pickup_area` is bounded free text.
- Korean + English copy. All user-facing strings are hard-coded
  Korean; no i18n framework wired.
- Cross-seller isolation under realistic load. The single-tester
  smoke did not exercise it.

## 2. Final intended product flow (target state)

```
[Onboarding]              [Listing creation]               [Discovery]
sign-up + capability     seller chats with LLM-assisted   renter browses /search
(closed-alpha manual,    intake → structured listing →    with KR/EN locale +
 future self-service)    founder/human review queue       coarse global region

       ↓                       ↓                                ↓

[Trust framing]          [Request]                         [Detail]
seller display name,    renter selects duration, sees     sanitized DTO + price
trust note,             reference total + deposit         breakdown (참고용),
condition language,     responsibility framing, sends     trust block, request CTA
pre-payment caption     request

       ↓                       ↓                                ↓

[Seller response]        [Coordination]                    [Handoff]
seller approves /        pickup time + meeting             evidence record
declines in dashboard    window agreed in-app              (photo + checklist),
(server lifecycle),      (deferred)                        safety code,
borrower notified                                          condition baseline

       ↓                       ↓                                ↓

[Payment gate]           [Return]                          [Settlement]
real PG/escrow           return checklist,                 release deposit, pay
integration              condition delta, claim            seller. ALL gated
(post-2026-07-13 +       window opens                      by security review +
 readiness + legal)                                        legal/partner sign-off

                              ↓
                    [Trust events accumulate]
                    per-user trust profile, hidden risk,
                    founder/admin overrides — never auto-graded
```

Each stage gate is enforced by either:
- the security gate (real photo, real auth, real DB, real
  payment, location-based matching);
- the pre-revenue beta plan window (2026-07-13 + readiness);
- the legal/trust posture (regulated language ban; partner
  contracted before paid-brokerage framing).

## 3. Gap matrix

Honest assessment of the delta between §1 and §2.

| Surface | Current state | Missing UX | Missing data / API | Design impact | Risk | Recommended slice |
| --- | --- | --- | --- | --- | --- | --- |
| Seller intake | Deterministic extractor, server-validated draft | LLM round-trip, correction / re-extract, inline missing-fields editing | LLM adapter interface, post-LLM normalizer, prompt cache | Chat card grows to multi-step | Medium (hallucination / wrong price) | A → B (LLM later) |
| Publish workflow | Single "공개로 승인" button | Reject + revision request, review notes, validation photos | `admin_actions` externalization, photo upload (security-gated) | Cockpit panel grows | Medium (security gate) | Public beta (after photo gate) |
| Public detail | Sanitized DTO renders | Seller trust block, safety-code photo, condition photo gallery | `listing_versions` selective read, photo URLs in DTO | Detail page grows | Medium | Public beta |
| Seller response (approve / decline) | **Not implemented server-side** | Inline approve / decline, decline reason input, toast | `seller_approveRequestAction`, `seller_declineRequestAction`, `rental_events` append | Dashboard action column | **High** (lifecycle entry) | A-must |
| Renter follow-up (my requests, cancel) | **Not implemented** | "My requests" page, cancel CTA | `listMyRequestsAction`, `borrower_cancelRequestAction` | New `/requests` route | Medium-High | A-must |
| Location / region | Korea enum + free text | Global region autocomplete, locale-aware display | `locale` (BCP-47) + `country_code` (ISO-3166) + `region_coarse_v2`, indexes | Search / cards / detail | High (schema) | Public beta |
| Payment | Mock-only | Provider-neutral copy, "참고용 → 결제 게이트" stage | `payment_intent` abstraction, provider adapter, webhook | New stage page | Very High (legal + security) | Later (gated) |
| Deposit / responsibility copy | Reference-only string | Responsibility framing block (no insurance / coverage words) | `safety_deposit` already in DTO | Copy in 3 surfaces | Low (copy only) | A-must |
| Handoff / return | Local-only | Pickup / return checklist, photo evidence | `rental_handoffs` table, externalized actions | New section | High | Later (gated) |
| Trust events | Local-only | User trust profile, hidden risk score | `trust_events` table | Cockpit panel + user card | Medium-High | Later |
| Wishlist / feedback review | Cockpit read-only | `new → reviewed → archived` workflow, response tracking | `feedbackRepository.updateStatus` | Cockpit panel | Low | A-nice |
| KR + EN i18n | Korean hardcoded | All user-facing copy in EN | `next-intl` (or lightweight) catalog | Layout / line-length tweaks | High (launch blocker) | Public beta |
| Notifications | None | At-least-one transactional channel | Provider adapter (Resend etc.) + governance | TBD | Very High | Later (gated) |

## 4. Slice roadmap

Each slice is sized to one PR or a short PR stack (2–3). All
slices preserve the BW Swiss Grid system, the pre-revenue posture,
and the deny-by-default RLS / service-role-only invariant.

### A. Closed-alpha must-have (before inviting real testers)

| # | Slice | Why |
| --- | --- | --- |
| A-1 | Smoke ops runbook patch — `:3000` port pin, diagnostic logger reason-code interpretation table | Without this, the next tester loses 30 min on a port quirk and 30 min on the no-actor branch. |
| A-2 | Responsibility / deposit copy strengthening + banned-words static check | Tells the tester what they are agreeing to without activating money movement. Banned-words check prevents drift. |
| A-3 | Cockpit feedback status workflow | Closes the validation-signal loop; founder can mark a feedback row reviewed without auto-routing PII. |
| A-4 | Seller approve / decline server actions | First real lifecycle past `requested`. Without this, a borrower request just sits forever. |
| A-5 | Seller dashboard approve / decline UI | Pairs with A-4. Inline action buttons + decline-reason modal. |
| A-6 | Renter "my requests" page | Without this, the renter clicks 요청 보내기 and disappears. Bare-minimum follow-up surface; no cancellation yet. |

### B. Closed-alpha nice-to-have

| # | Slice | Why |
| --- | --- | --- |
| B-1 | LLM adapter interface (mock-only first) | Lays the seam without pulling any LLM SDK. Behavior unchanged. Sets up B-2. |
| B-2 | Seller intake LLM call (dev-only feature flag) | Replaces the deterministic extractor with a real LLM behind the B-1 interface; server-side validates every output field. Production fallback to deterministic. |
| B-3 | Cockpit shows seller display name from `seller_profiles` (instead of UUID) | Founder UX nicety; one DB join. |
| B-4 | Storefront `/sellers/[sellerId]` supabase-mode bridge | Carry-over from Bundle 2 Slice 1. |

### C. Public beta must-have

| # | Slice | Why |
| --- | --- | --- |
| C-1 | i18n framework + KR/EN copy catalog | Launch blocker. KR remains canonical; EN is parallel. |
| C-2 | Global location model v1 (`locale` + `country_code` + `region_coarse_v2`) | Schema migration + validator. Kept coarse — no exact address. |
| C-3 | Photo upload security review note + Supabase Storage policy | Required precondition for C-4. |
| C-4 | Verification photos in public listing detail | Renter trust requires seeing the item. Sanitized: photo URLs only. |
| C-5 | Notification channel v1 (email only) | First transactional signal: seller learns about a new request. |

### D. Later — trust / payment / lifecycle (all security-gated)

These do **not** start until the security gate, the legal/trust
gate, and the pre-revenue beta gate are explicitly cleared. Each
needs its own readiness note before code lands:

- D-1 Payment provider-neutral adapter (mock → real)
- D-2 Deposit hold / release
- D-3 Handoff (pickup / return) externalization + photo evidence
- D-4 Claim / dispute workflow
- D-5 `trust_events` table + per-user trust profile
- D-6 Settlement / payout

## 5. LLM integration (summary only — see future dedicated doc)

> Full plan will graduate to **`docs/corent_llm_integration_plan.md`** when slice B-1 starts.

Headline:

- Entry point: seller intake (`/sell`). Search-side LLM is a
  separate later slice.
- Adapter pattern: `LLMAdapter` interface + `mockLLMAdapter` in
  closed-alpha, real adapter (OpenAI / Anthropic) gated by env
  and dev-only feature flag.
- **Never trusted from LLM output**: seller id, borrower id,
  status, payment / settlement / pickup, safety deposit (computed),
  safety code (computed), prices (computed from estimated value),
  exact address / phone / email / serial number.
- **Server-validated from LLM output**: category enum, condition
  enum, item name length, components array length, defects length,
  pickup area length.
- **Fallback**: every failure mode (timeout, invalid JSON, schema
  validation reject) collapses to the existing deterministic
  extractor and shows a transparent toast.
- The `IntakeWriter` boundary is unchanged; the LLM hop sits
  inside the service, not the writer.

## 6. Payment / deposit / responsibility (summary only — see future dedicated doc)

> Full plan will graduate to **`docs/corent_payment_deposit_trust_plan.md`** when the gate clears.

Headline:

- Provider-neutral state model already exists on `rental_intents`
  (`payment_provider`, `payment_status`, `settlement_status`).
  Extending the enum to include a real provider (e.g. `'toss'`,
  `'stripe'`) is a single migration line.
- What can be shown today: reference-only totals, deposit
  responsibility framing (no insurance / coverage / claim payout
  / premium words), explicit pre-payment captions on every
  surface.
- What is gated: real PG webhook handlers, real card capture,
  real authorization, real refund, deposit hold, payout.
- Gates: 2026-07-13 + readiness + legal sign-off + partner
  contract + security review note for every new surface.

## 7. Global location (summary only — see future dedicated doc)

> Full plan will graduate to **`docs/corent_global_location_plan.md`** when slice C-2 starts.

Headline:

- Today: `region_coarse_marketplace` Korea-only enum;
  `pickup_area` ≤ 60-char free text. No coordinates, no GPS, no
  exact address (per legal/trust §5).
- Target minimum fields: `locale` (BCP-47), `country_code`
  (ISO-3166 alpha-2), `region_coarse_v2` (free text ≤ 80 chars at
  city / district / county granularity).
- Search/filter: `(country_code, region_coarse_v2)` index;
  locale-aware copy and ordering on `/search`.
- What we will NOT add early: exact addresses, GPS coordinates,
  reverse geocoding, location-based matching. Each requires a
  security review note.

## 8. Design completion (summary only — see future dedicated doc)

> Full plan will graduate to **`docs/corent_design_completion_plan.md`** after each new functional slice lands.

Headline:

- The BW Swiss Grid v1 system in
  [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)
  is the only visual system; visual-system change requires the
  approval gate from
  [`agent_loop.md`](agent_loop.md).
- Final product UX must be re-audited after each major slice
  (LLM intake, payment stage, trust block, location model,
  handoff). Each surface receives a screen-by-screen pass against
  the design system, not the inverse.
- Legacy mock fixtures (`MOCK_RENTAL_INTENTS`, `LISTED_ITEMS`,
  `mockSellers`) must remain hidden in supabase mode by explicit
  gating, not by accident. The boundary tests already enforce a
  large part of this; the design audit confirms the rest.

## 9. Cross-references

- Smoke run record: [`docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`](smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md)
- Founder smoke ops checklist: [`docs/corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md)
- Externalization architecture: [`docs/corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
- Visual system: [`docs/corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)
- Pre-revenue posture: [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- Security gate: [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
- Legal / trust framing: [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- Companion next-actions doc: [`docs/corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md)

## 10. CoRent Interactive Experience (CIE)

The umbrella plan above ends at "skeleton-passing → product-UX-passing".
The next layer — turning CoRent's deterministic services into an
AI-native try-before-buy interface — is captured in a dedicated
architecture plan:

- [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md)
  — 16-section docs-only plan. Defines CIE as an AI-assisted
  try-before-buy guide (not a chatbot, not a generic rental
  search), splits the system into Experience / Orchestrator /
  Knowledge / Tool / Marketplace state / Governance layers, pins
  block-recipe-only UI orchestration, lists the closed tool set,
  scopes the LLM to candidate-only, and stages a 5-phase
  roadmap behind feature flags.

CIE phases align with the milestones in §3–§8 above:

- Phase 1 (deterministic interactive experience) is additive to
  the existing flow and does not block any §3–§8 task.
- Phase 4 (real LLM provider) inherits the LLM follow-up gate
  from §6 and the security gate from
  [`corent_security_gate_note.md`](corent_security_gate_note.md).
- Phase 5 (full interactive product) inherits the seller demand
  board gate from
  [`corent_wanted_try_request_slice_plan.md`](corent_wanted_try_request_slice_plan.md)
  §12 and the visual change gate from
  [`agent_loop.md`](agent_loop.md).

# CoRent Closed-Alpha Quality Gates

> **Status:** Guardrail — master cross-cutting rules for the closed-alpha
> **Scope:** Banned copy phrases, server/local separation, LLM
> candidate-only rules, DTO/projection rules, password sign-in
> posture, wanted-try-request posture, and links to the smoke ops
> kit + slice plans
> **Last reviewed:** 2026-05-06
> **Read before:** every runtime PR, especially any user-facing
> copy change, public DTO change, LLM-related change, or
> /admin/cockpit change
> **Do not use for:** strategic architecture (use
> [`corent_interactive_experience_architecture.md`](corent_interactive_experience_architecture.md));
> visual tokens (use
> [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md));
> security review of DB / auth / payment / file upload / location
> work (use
> [`corent_security_gate_note.md`](corent_security_gate_note.md))

> **Cross-reference (2026-05-07).** Platform-level safety
> standard lives in
> [`interaction_safety_standard_v0.md`](interaction_safety_standard_v0.md)
> — risk tier model (T0–T5), 10 core safety principles, and
> ComponentBlock / Action / KnowledgeSource / LLM /
> InteractionIntent / AuditEvent rules that apply across every
> vertical the AI Interaction Layer ever supports. This file
> contains **CoRent / closed-alpha-specific** guardrails (banned
> copy phrases, server / local separation, password sign-in
> posture, wanted-try-request posture). The platform safety
> standard wins on cross-cutting safety questions; this file
> wins on CoRent-specific copy / posture questions.

CoRent is an AI-assisted try-before-buy protocol for high-consideration
goods. The alpha should not read like a generic rental marketplace, a
payment product, an insurance product, or an LLM-authoritative system.

## Product Thesis

- Borrowers understand what they can validate before buying.
- Borrowers see what to check before requesting.
- Sellers see what to clarify before a listing feels trustworthy.
- Responsibility is explained as a basis for review, not as a deposit,
  guarantee, insurance, refund, settlement, or confirmed rental.
- LLM output is candidate/advisory only; deterministic server validation
  remains authority.

## Banned Copy Rules

Runtime user-facing copy must not imply active payment, deposit,
insurance, guarantee, refund, settlement, or confirmed rental. Guarded
phrases include `보증`, `보증금`, `보험`, `보장`, `결제 완료`, `결제 진행`,
`결제 처리`, `보증금 청구`, `대여 확정`, `환불`, `정산 완료`,
`guaranteed`, `insured`, `insurance`, and `verified seller`.

Negated beta posture may mention unavailable concepts when needed, but
prefer wording such as `책임 기준`, `참고용`, `아직 연결되어 있지 않아요`,
and `요청 단계`.

## Server / Local Separation

- `/search` must not seed static `PRODUCTS` before the server/local probe
  resolves. On server read failure, it should show a calm error, not demo
  products.
- `/listings/[listingId]` is server-only and renders only approved public
  projection DTOs.
- `/items/[id]` remains the static/local demo detail path.
- `/sell` routes through the probing chat intake card, not the legacy
  local-only `SellerRegistration` form.
- `/dashboard`, `/requests`, and `/admin/cockpit` must keep local/mock and
  server-backed states visibly separate.

## LLM Candidate-Only Rules

- `src/server/llm/**` stays server-only.
- Mock LLM modules must not read env vars, call network APIs, or import
  provider SDKs.
- LLM candidates must strip authority fields such as status, seller,
  borrower, price, payment, settlement, admin, role, capability, and trust.
- Cost estimates must contain counts and labels only, never prompt bodies,
  raw input, messages, or system text.

## DTO / Projection Rules

- Public listing DTOs are allowlist-only.
- Public/renter surfaces must never expose `rawSellerInput`,
  `privateSerialNumber`, extraction internals, listing secrets, admin notes,
  private pickup/contact details, payment internals, settlement internals,
  or trust/claim internals.
- Seller dashboard readiness should use seller-owned safe fields only.
  If it needs more precision later, add booleans/counts before raw text.

## Password Sign-in Posture

The closed-alpha exposes both magic-link and email/password sign-in. Both are
sign-in only — never signup, never profile or capability provisioning.

- Password login is for **existing provisioned closed-alpha accounts only**.
  Capability remains row-presence in `seller_profiles` / `borrower_profiles`,
  manually seeded by the founder per
  `docs/corent_closed_alpha_provisioning_workflow.md`.
- **No self-serve signup.** Neither `/auth/password-sign-in` nor
  `/admin/auth/password-sign-in` calls `signUp`, sets `shouldCreateUser`, or
  inserts into `profiles` / `seller_profiles` / `borrower_profiles`. A static
  source-level test (`src/app/auth/password-sign-in/import-boundary.test.ts`)
  pins this against drift.
- **No auto profile provisioning.** A user who authenticates without a
  `profiles` row hits the existing `signed_in_no_profile` panel — the route
  never repairs the gap.
- **Magic-link fallback remains.** The `/auth/sign-in` and
  `/admin/auth/sign-in` routes are unchanged. Both `/login` and `/admin/login`
  render the magic-link form below the password form so testers can fall back
  without losing the flow.
- **Founder/admin authority remains allowlist-gated.**
  `/admin/auth/password-sign-in` does not import or call
  `requireFounderSession` and does not set founder / role / capability fields
  on the session. `/admin/cockpit` decides authority per-request via
  `requireFounderSession`, which checks the server-side
  `FOUNDER_ADMIN_EMAIL_ALLOWLIST` against the session email at every request.
  As defense in depth, the admin password route still gates on the allowlist
  before calling Supabase, so a non-allowlisted email returns the same
  `pe=invalid` envelope as a wrong password — no allowlist disclosure.
- **Open-redirect guarded.** The user route uses `safeUserNextPath` (rejects
  `/admin/*`); the admin route uses `safeAdminNextPath` (requires `/admin`).
- **Password and email never logged.** Both routes only emit non-secret
  reason codes (`user_auth_password_sign_in_no_client` / `_failed`,
  `admin_auth_password_sign_in_no_client` / `_failed`) plus `err_code` from
  Supabase. The password is also never present in the redirect URL.
- **Password reset is out of scope.** No in-app reset surface yet. Resets are
  founder-driven via Supabase Studio's user-row → **Reset password** action.
  Future docs-only follow-up: an in-app reset slice with security review.
- **Agents do not configure Supabase remotely.** Enabling the email/password
  provider, setting passwords, marking `email_confirmed_at`, and creating
  `profiles` / `seller_profiles` / `borrower_profiles` rows are
  founder-only Studio actions. The agent's role is local code + docs only.

## Wanted Try Request Posture

CoRent's cold-start wedge captures demand when `/search` returns no
matches, instead of dead-ending the user. The MVP rides on the
existing `feedback_submissions` table with `kind = 'wanted_item'`.
Plan: `docs/corent_wanted_try_request_slice_plan.md`.

- **Storage**: re-uses `feedback_submissions` with `kind =
  'wanted_item'`. No new table, no migration, no new RLS policy, no
  new public DTO until the demand signal validates across multiple
  rounds.
- **No automatic matching.** No copy, code path, or future LLM
  candidate may claim that the platform matches a wanted request to
  a seller. Auto-match is forbidden phrasing alongside the existing
  banlist (`보증` / `보험` / `결제 완료` / etc.). Surfaces always
  read as conditional ("같은 물건을 가진 셀러가 보면 다시
  안내드려요"), never promissory.
- **No seller contact exposure.** Borrower email, `profile_id`,
  `borrower_id`, raw free-text `message`, and any field traceable
  to a borrower's identity are **never** rendered on a seller-facing
  surface. The founder cockpit (`/admin/cockpit`) is founder-gated
  by `requireFounderSession` and is the only reader of contact
  email. A future seller demand board requires its own DTO
  projection + RLS read policy + security review before any seller
  visibility is built.
- **No payment / deposit / insurance / guarantee framing.** The
  closed-alpha banlist applies in full to every wanted-try-request
  surface — empty-state CTA, form heading, helper copy, submit
  success, and any future seller-side surface. Pinned by
  `src/lib/copy/copyGuardrails.test.ts`.
- **No schema until the signal validates.** A separate
  `wanted_try_requests` table, a new `wanted_try_status` enum,
  structured `desired_duration_days` / `price_ceiling_krw` /
  `region_hint` columns, and any seller-side projection are
  deliberately deferred. The MVP ships with the existing
  `feedback_submissions` shape; structured fields stay in the
  free-text `message` until founder-mediated triage demonstrates
  the wedge.
- **Provenance stays deterministic.** The current parser
  (`searchService.parse` + `mockAIParser`) and the readiness card
  (`tryBeforeBuyReadinessService`) provide all hints in this slice.
  Any future LLM-based intent extraction or wanted ↔ listing match
  scoring lands behind the existing `LLMAdapter` interface with
  `provenance: "llm_candidate"`, gated by a separate security
  review.
- **Anonymous-OK, no auto-provisioning.** The intake action
  (`submitFeedbackAction`) is anonymous-friendly. A signed-in
  caller's `profile_id` is server-derived; the payload type
  forbids client-supplied `profile_id`, `id`, `status`,
  `created_at`. The slice does not create `profiles`,
  `seller_profiles`, or `borrower_profiles` rows.

## Smoke Checklist Links

- Remote smoke ops: `docs/corent_closed_alpha_smoke_ops_checklist.md`
- Readiness flow template:
  `docs/smoke_runs/2026-05-06_readiness_flow_template.md`
- First remote smoke record:
  `docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`

## Readiness Feedback Operations Kit

When a tester round produces verbatim feedback, run it through the
operations kit before patching anything:

- Tester-facing form: `docs/smoke_runs/tester_feedback_form_template.md`
- Round report template:
  `docs/smoke_runs/readiness_round_report_template.md`
- Quote → action triage:
  `docs/smoke_runs/readiness_feedback_decision_aid.md`
- Tagging vocabulary:
  `docs/smoke_runs/readiness_feedback_taxonomy.md`
- Pre-approved Korean copy variants:
  `docs/corent_readiness_copy_experiment_backlog.md`
- Category wedge prioritization:
  `docs/corent_category_wedge_research_checklist.md`
- Combined password-login + readiness Round 1 script:
  `docs/smoke_runs/2026-05-06_password_login_readiness_round1.md`
- Wanted Try Request slice plan:
  `docs/corent_wanted_try_request_slice_plan.md`

The kit is docs-only and does not relax any of the rules in this gate.

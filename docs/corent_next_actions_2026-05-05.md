# CoRent next actions — 2026-05-05

_Companion to [`docs/corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md)._

> **Status:** Historical / Superseded Backlog
> **Scope:** the 10-task list captured after the 2026-05-05
> first remote smoke for the CoRent rental-marketplace vertical.
> Several items shipped (smoke ops checklist patch, responsibility
> copy, seller approve / decline, my-requests page, feedback
> status workflow). The list is preserved as a record.
> **Superseded by:** [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md)
> §9 (next build target) + [`platform_repositioning_audit_2026-05-07.md`](platform_repositioning_audit_2026-05-07.md)
> §11 (next primitive roadmap). Active backlog now lives there.
> **Last reviewed:** 2026-05-07 (demoted to Historical per the
> 2026-05-07 platform pivot).
> **Read before:** nothing on the active roadmap.
> **Do not use for:** current backlog, current sprint planning,
> current PR sequencing. The next two PRs after this pivot are
> ComponentBlock registry v1 and Action registry v1, not items
> from this list. Body unchanged.

The next 10 tasks after the first successful corent-dev remote
smoke. Each task has a one-PR boundary. **None of them activate
real money movement, real lifecycle past `requested`, or remove
the deny-by-default RLS posture.**

Use this file as the working list — tick items as they land,
strike them when they ship.

| # | Status | Task |
| --- | --- | --- |
| 1 | ☐ | Smoke ops checklist patch |
| 2 | ☐ | Preserve product flow completion plan (this PR) |
| 3 | ☐ | Responsibility / deposit copy + banned-words static check |
| 4 | ☐ | Cockpit feedback status workflow |
| 5 | ☐ | Seller approve / decline server actions |
| 6 | ☐ | Seller dashboard approve / decline UI |
| 7 | ☐ | Borrower "my requests" page |
| 8 | ☐ | LLM adapter interface — mock-only first |
| 9 | ☐ | i18n / KR copy catalog decision |
| 10 | ☐ | Second corent-dev smoke + cross-seller isolation |

---

## 1. Update smoke ops checklist with port / auth / no-actor lessons

| Field | Value |
| --- | --- |
| Type | **docs-only** |
| Expected output | Patch to [`docs/corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md) §1.5 (Auth project settings) and §8 (Stop conditions): pin `localhost:3000` as the redirect origin (not `:3001`); add a reason-code interpretation table for the dev-only `chat_intake_mode_local` log lines (`backend_mode_not_supabase`, `no_actor`, `actor_source_not_supabase`, `unsupported_actor_kind`); link the new fix commits (`57cfe7a`, `80981f6`, `ec45d8d`). |
| Why it matters | Without this, the next tester repeats the 30-min port quirk and 30-min no-actor debug from 2026-05-05. Documentation is the cheapest intervention. |
| Dependency / gate | None. Docs-only. Safe to land before any code. |
| Suggested commit | `docs: patch smoke ops with port + diagnostic lessons` |

## 2. Preserve product flow completion plan

| Field | Value |
| --- | --- |
| Type | **docs-only** |
| Expected output | Two new docs: [`docs/corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md) and [`docs/corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md) (this file). |
| Why it matters | Captures the gap analysis between smoke-passing and product-UX-passing while it is fresh. Future LLM / payment / location / design slices each graduate from this doc into their own dedicated docs at the moment they start, so the umbrella stays small. |
| Dependency / gate | None. Self-contained. |
| Suggested commit | `docs: add product flow completion plan` (this PR). |

## 3. Responsibility / deposit copy without real money movement

| Field | Value |
| --- | --- |
| Type | **code (UI copy + tests only)** |
| Expected output | New module `src/lib/copy/responsibilityCopy.ts` containing the bounded responsibility framing strings (Korean only — EN follows in #9). Three import sites: detail page (`/listings/[id]`), renter request confirmation panel, seller dashboard request block. New static-text guard (or extension of an existing one in `src/server/admin/import-boundary.test.ts`) that blocks the regulated words `보험` / `보장` / `커버리지` / `손해보장` / `claim payout` / `premium` from appearing in any user-facing component file. |
| Why it matters | Tells the closed-alpha tester what they are agreeing to without activating a regulated surface. Banned-words check makes it impossible to drift later. Pre-revenue posture explicit on every surface that touches money-shaped concepts (deposit, total, settlement). |
| Dependency / gate | None. No DB, no schema, no env. Mirrors existing `responsibilityCopy`-style usage in `returnTrust.ts`. |
| Suggested commit | `copy: add responsibility framing without regulated language` |

## 4. Cockpit feedback status workflow

| Field | Value |
| --- | --- |
| Type | **code (server + UI)** |
| Expected output | New repo function `updateFeedbackStatus(id, status)` (uses existing `validateFeedbackStatus` validator); new server action `updateFeedbackStatusAction({ id, status })` behind `requireFounderSession`; client adapter `feedbackReviewClient.ts`; cockpit panel gains inline pill buttons for `new → reviewed → archived`. No PII routing, no email — pure status transitions. |
| Why it matters | Closes the validation-signal loop. Founder can mark a feedback row `reviewed` after acting on it manually, so the cockpit `최근 의견 / 위시리스트` panel stops growing without bound. |
| Dependency / gate | None. Schema already has the `feedback_status` enum; `feedback_submissions.status` column is already present; only writes are missing. |
| Suggested commit | `feat: feedback status workflow on cockpit` |

## 5. Seller approve / decline server actions

| Field | Value |
| --- | --- |
| Type | **code (server only) + tests** |
| Expected output | Two new server actions in `src/server/rentals/`: `approveRentalRequestAction({ rentalIntentId })` and `declineRentalRequestAction({ rentalIntentId, reason? })`. Both: `runIntentCommand` with `expectedActorKind: "seller"`, `prefer: "seller"`; supabase mode + supabase actor only; canonical rental id loaded server-side; `assertRentalSellerIs(canonical, actor.sellerId)` enforced; state-machine transition (`requested → seller_approved` for approve; `requested → seller_cancelled` for decline — per existing `cancelRentalIntent("seller")` semantics in `rentalIntentMachine`); `rental_events` append; tight non-secret response DTO. **No payment, no notification.** Coverage: 20+ test cases (auth gate, mock-actor defense, ownership mismatch, invalid transition, forged payload, repo throw → typed `internal`, no payment / settlement / claim columns touched). |
| Why it matters | First lifecycle transition past `requested`. Without this, every borrower request that lands on `corent-dev` sits forever in `requested`, and the closed-alpha cannot validate the matching loop. |
| Dependency / gate | None for code. Founder must run a manual SQL spot-check after the smoke (`select count(*) from rental_intents where status='seller_approved' …`) to confirm the transition. |
| Suggested commit | `feat: seller approve/decline server actions` |

## 6. Seller dashboard approve / decline UI

| Field | Value |
| --- | --- |
| Type | **UI** |
| Expected output | `SellerDashboard` server-mode `서버에서 받은 대여 요청` block gains inline `승인` / `거절` buttons next to each row; decline opens a small bounded textarea modal for an optional reason; success toast `요청을 ${approved ? "승인" : "거절"}했어요.`; failure toast bound to typed envelope (`unauthenticated` / `ownership` / `not_found` / `conflict` / `internal`). The `/dashboard` "Active" / "Pending" mock blocks remain hidden in server mode (Slice 3 invariant). No design-token change. |
| Why it matters | The seller can finally **act** on the smoke-validated request. The cockpit's `승인·거절·결제 단계는 아직 준비 중이에요` caption shrinks to `승인·거절은 셀러가, 결제 단계는 아직 준비 중이에요`. |
| Dependency / gate | #5 (server actions must land first). |
| Suggested commit | `feat: dashboard approve/decline UI for server-side requests` |

## 7. Borrower "my requests" page

| Field | Value |
| --- | --- |
| Type | **code + UI + tests** |
| Expected output | New route `src/app/requests/page.tsx` (force-dynamic). New server action `listMyRentalRequestsAction()` with `expectedActorKind: "renter"`, `prefer: "renter"`; supabase mode + supabase actor only; queries `rental_intents` filtered by `borrower_id = actor.borrowerId`; tight DTO mirroring `SellerDashboardRequest` shape (no payment / settlement / sellerId leak — show `productName`, `durationDays`, `status`, reference total, `createdAt`, latest event `to_status` from `rental_events`). New client component `MyRequestsClient` rendering each row + pre-payment caption + the deferred-actions caption ("취소 기능은 준비 중이에요"). The renter cancel action is **out of scope** for this PR — it is a follow-up. |
| Why it matters | After clicking `요청 보내기` on `/listings/[id]`, the renter currently has no surface to come back to. The seller saw the request on /dashboard; the renter sees nothing. This adds the missing renter-side mirror. |
| Dependency / gate | None for code. Helps if #5 + #6 land first so renters can also see status flips, but technically independent (the page can show `requested` rows alone). |
| Suggested commit | `feat: borrower my-requests page` |

## 8. LLM adapter interface — mock-only first

| Field | Value |
| --- | --- |
| Type | **code (interface + mock impl) + tests** |
| Expected output | New `src/lib/adapters/llm/llmAdapter.ts` defining `LLMAdapter` interface with one method (e.g. `extractListingFromText(text: string): Promise<LLMExtractionResult>`); `mockLLMAdapter` returning a deterministic stub (or simply delegating to the existing `chatIntakeExtractor` so behavior is unchanged); `chatListingIntakeService` accepts the adapter via dependency injection (default = `mockLLMAdapter`). No real LLM SDK, no network call, no API key, no env read. The actual LLM call (B-2) is a **follow-up slice** with its own security note. |
| Why it matters | Lays the seam without any LLM dependency. Future B-2 swap is an adapter-replacement PR, not a service-rewrite PR. The interface forces the post-LLM normalizer / validator boundary up front. |
| Dependency / gate | None for B-1 (this PR). B-2 (real LLM call) needs its own dedicated doc + security review. |
| Suggested commit | `feat: llm adapter interface (mock impl only)` |

## 9. i18n / KR copy catalog decision

| Field | Value |
| --- | --- |
| Type | **docs + code (catalog scaffold only)** |
| Expected output | Decision doc `docs/corent_i18n_decision_note.md` covering: (a) framework choice (`next-intl` vs lightweight in-house solution, default + recommendation), (b) copy catalog file layout (`src/lib/copy/locales/ko.ts` + future `en.ts`), (c) server-vs-client copy ownership rule (server actions return locale-neutral DTOs; copy is applied client-side), (d) BW Swiss Grid spacing implications for line-length differences. Code part: scaffold the KR catalog file with **only the existing hard-coded Korean strings extracted into keys** — no behavior change, no new strings, no EN translation (EN is a follow-up slice). |
| Why it matters | EN launch is a public-beta blocker. Doing the framework decision + KR extraction first means the EN PR is mechanical translation, not architectural. Starting EN without this would force the framework choice mid-translation. |
| Dependency / gate | None. Mostly docs-only with a small mechanical extraction. |
| Suggested commit | `docs+chore: i18n decision + extract KR copy catalog` |

## 10. Second corent-dev smoke + cross-seller isolation

| Field | Value |
| --- | --- |
| Type | **smoke / manual + docs** |
| Expected output | Second founder-run smoke against `corent-dev`, this time provisioning **two seller-only testers** plus the founder's borrower capability. Walk the §1 ten-step path twice (once per seller), then verify cross-seller isolation: borrower's request to seller A must NOT appear on seller B's `/dashboard` or seller B's read of `listSellerRentalRequestsAction`; founder cockpit shows both rows but `cockpitRequestRow.sellerId` differentiates them. Record results in `docs/smoke_runs/<date>_corent_dev_second_remote_e2e.md` using the same template as the 2026-05-05 record. |
| Why it matters | The 2026-05-05 smoke was single-tester dual-capability — cross-seller isolation invariant was **not exercised**. Before inviting any external tester, this hole closes. |
| Dependency / gate | Founder schedules; agents do not run remote commands. Best after #1 (so the new tester gets the corrected runbook), #5/#6 (so the seller can actually act on requests), and #7 (so renters see their side). #8 / #9 are independent. |
| Suggested commit | `docs: record corent-dev second remote smoke` |

---

## How to use this list

- **Order is the recommended order**, but #1, #2, #3, #4, #8, #9
  are mutually independent — they can land in parallel PRs.
- #5 → #6 must be sequential (UI follows server).
- #7 is independent of #5/#6 but UX is best after them.
- #10 is the gate for inviting any external closed-alpha tester.
- Every task preserves the BW Swiss Grid system, the
  pre-revenue posture, and deny-by-default RLS / service-role-only.
- No task implements payment, deposit, escrow, settlement,
  refund, insurance, handoff, return lifecycle, claim, dispute,
  trust events, notifications, photo upload, exact location, or
  GPS. Each of those is a separately-gated future slice — see
  [`corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md)
  §4 D.

## Cross-references

- Umbrella plan: [`docs/corent_product_flow_completion_plan.md`](corent_product_flow_completion_plan.md)
- Smoke run record: [`docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`](smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md)
- Smoke ops runbook: [`docs/corent_closed_alpha_smoke_ops_checklist.md`](corent_closed_alpha_smoke_ops_checklist.md)
- Pre-revenue posture: [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- Security gate: [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
- Legal / trust framing: [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)

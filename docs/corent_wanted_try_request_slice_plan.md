# CoRent Wanted Try Request — slice plan (docs-only)

> **Status:** Active Plan — cold-start wedge
> **Scope:** Turn `/search` empty state into a demand signal via
> `feedback_submissions.kind = "wanted_item"`. PR 2 (search empty
> CTA + form) and PR 3 (founder review workflow on
> `/admin/cockpit`) shipped 2026-05-06. PR 4 (seller demand board)
> and beyond remain future, gated by signal validation +
> security review.
> **Last reviewed:** 2026-05-06
> **Read before:** any change to `/search` empty state, the
> wanted-try-request form, the cockpit feedback panel, or any
> seller-side demand surface
> **Do not use for:** schema changes (no migration is in scope —
> the slice deliberately reuses the existing `feedback_submissions`
> table); seller demand board design (deferred to a future slice
> with its own DTO projection + RLS review)

_Companion to [`corent_product_direction_v2.md`](corent_product_direction_v2.md),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md),
[`corent_security_gate_note.md`](corent_security_gate_note.md),
[`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md),
and [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)._

This plan is **docs-only**. It locks the founder ↔ Claude alignment
on the cold-start "Wanted Try Request" wedge before any runtime PR
opens. The implementation follows in subsequent PRs (§12).

## 1. Product thesis

CoRent is an AI-assisted **try-before-buy** interface for
high-consideration goods. It is not a generic rental marketplace.

The cold-start problem:

- The closed-alpha inventory is small. Most early `/search` queries
  will return zero matches.
- The current `/search` empty state is a **dead-end** — it tells
  the user to relax filters and offers a "조건 초기화" button.
  That answer is wrong for the try-before-buy wedge: the user's
  intent is already specific (e.g. "다이슨 에어랩 사기 전에 써보고
  싶어요"). Relaxing filters does not surface what they actually
  need.
- A user with that intent and no matching listing has *expressed
  demand*. CoRent's wedge is to capture that demand as a signal
  that can later **recruit supply**.

The wanted-try-request flow turns "no matches" into "demand
recorded — same item shown to a future seller". The signal is
non-promissory: no auto-match, no payment, no seller contact
disclosure, no insurance / guarantee language. It is a calm
demand registry that founder operations can act on by hand
during the closed-alpha window.

## 2. MVP decision

**Reuse the existing
[`feedback_submissions`](../supabase/migrations/20260504120000_phase2_feedback_intake.sql)
table with `kind = 'wanted_item'`.** The schema, validators,
service-role insert path, and founder cockpit panel are already
in place. No migration, no new table, no new RLS policy, no new
DTO surface for the MVP.

| Layer | Status |
| --- | --- |
| Schema (`feedback_submissions`, `feedback_kind enum`, `feedback_status enum`) | ✅ Already migrated |
| Validators (`validateFeedbackKind` etc.) | ✅ Present |
| Insert action ([`submitFeedbackAction`](../src/server/feedback/submitFeedback.ts)) | ✅ Anonymous-OK, signed-in `profile_id` auto-attach, mock-mode safe |
| Repository ([`feedbackRepository.ts`](../src/server/persistence/supabase/feedbackRepository.ts)) | ✅ Service-role, RLS deny-by-default |
| Founder cockpit panel ([`/admin/cockpit`](../src/app/admin/cockpit/page.tsx)) | ✅ "최근 의견 / 위시리스트" already renders `wanted_item` rows |
| Status workflow (`new → reviewed → archived`) | ❌ Enum present, write action deferred — see [`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md) #4 |

A separate `wanted_try_requests` table is **deliberately deferred**
until the demand signal is validated (see §12 PR 4 / future). The
audit recommendation in
[`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md)
already says manual operations is the right loop for the closed-
alpha window.

## 3. Current empty-search behavior

[`SearchResults.tsx`](../src/components/SearchResults.tsx) renders
`EmptyResults` (lines 413–430) when `filtered.length === 0`. The
copy is:

> **No matches** / "조건에 맞는 물건이 아직 없어요." / "조건을
> 줄이면 더 많은 결과가 나와요. 카테고리나 가격 조건을 풀어보세요."
> / `[조건 초기화]` (primary)

Three problems:

1. **Dead-end.** No path forward except clearing filters. If the
   user wanted a specific item, clearing filters does not surface
   it.
2. **Intent thrown away.** The parsed `SearchIntent` (rawInput,
   category, durationDays, priceMax) is in scope but not passed
   to `EmptyResults`. The data needed to pre-fill a wanted-try-
   request form is already on hand.
3. **Wedge mismatch.** The copy frames the page as a generic
   marketplace ("조건을 풀어보세요"). It does not frame
   try-before-buy or demand capture.

Note: `loadState === "error"` renders `ErrorResults` separately —
that is **server read failure**, not "no matches". The wanted-
try-request CTA must NOT appear on the error path. Demand capture
on a transient backend error would be a UX regression.

## 4. Proposed MVP flow

```
[사용자] "다이슨 에어랩 사기 전에 써보고 싶어요"  → /search?q=...
  ↓
SearchResults loads. searchService.fromQuery(intent) parses:
  rawInput, category (best-effort), durationDays, priceMax
  ↓
loadPublicListings() resolves (server or local).
  ↓
filtered.length === 0  →  EmptyResults receives `intent` prop.
  ↓
EmptyResults renders try-before-buy framing + a primary CTA:
  [써보고 싶다고 알리기]
  ↓
User clicks → WantedTryRequestForm opens (modal or inline).
  Pre-filled:
    - message ← intent.rawInput
    - itemName ← (optional, user-edited)
    - category ← intent.category (if confirmed)
    - sourcePage ← "/search?empty"
    - contactEmail ← (optional)
  ↓
[알리기] → submitFeedbackAction({ kind: "wanted_item", ... })
  ↓
Server (supabase mode): row written. Action returns ok.
  Client renders calm success copy (§10) — no payment, no
  seller-match promise.
Server (mock mode): action returns `unsupported`/`local`. Client
  renders the existing "데모 환경에서는 저장되지 않아요" caption
  unchanged.
  ↓
Founder reads /admin/cockpit "최근 의견 / 위시리스트" panel.
Existing wanted_item rendering surfaces the row with: kind,
message, optional item_name, category, optional contact_email,
sourcePage = "/search?empty", status `new`.
  ↓
Founder triages out-of-band:
  - Manually contacts a known seller: "이 물건 가지고 있으면
    알려주세요" (1:1, not in-app).
  - Updates row to `reviewed` once acted on (PR 3 in §12).
  - Archives once stale or matched.
```

The flow ends at founder cockpit. Auto-matching, seller demand
boards, in-app notifications, and any seller-facing visibility
are **out of scope** for this slice. They come back through §12 PR
4 / future after the signal is validated.

## 5. Data mapping

| Wanted-try-request field | feedback_submissions column | Source / encoding |
| --- | --- | --- |
| Free-text demand ("…사기 전에 써보고 싶어요") | `message` | `intent.rawInput` pre-fill, user-editable, ≤ 2000 chars (existing CHECK) |
| Optional structured item name | `item_name` | User-typed, optional, ≤ 80 chars |
| Best-effort / confirmed category | `category` | `intent.category` if user confirms; null otherwise. Validated against existing `category_id` enum |
| Surface tag | `source_page` | Hard-coded `"/search?empty"` for this slice; ≤ 80 chars (existing CHECK) |
| Optional contact email | `contact_email` | Optional input, captioned "응답이 있을 때만 사용해요" |
| Authoring profile (when signed in) | `profile_id` | Server-derived via `resolveOptionalProfileId` — never client-supplied |
| Founder workflow | `status` | Defaults to `'new'` (column default). Workflow transitions (PR 3) are server-only |
| Kind | `kind` | Hard-coded `"wanted_item"` in this slice |

**Fields the form does NOT collect** (deliberately):

- Exact address / GPS / detailed location.
- Phone number / non-email contact.
- Desired duration (1/3/7) as a structured field — leave it in
  free text. If the demand signal is real, the founder picks it
  up from the `message`. Adding a structured slot here would
  require a schema change.
- Price ceiling — same reason.
- Any seller hint, seller id, listing id, preferred-seller
  reference. That would imply matching authority that the slice
  does not have.

## 6. Security / privacy

- **No exact address.** Free-text `message` is the only place a
  user could type one. Founder operations review removes it
  before any out-of-band contact.
- **No contact info exposure.** `contact_email` lives in
  `feedback_submissions`. RLS is deny-by-default + the explicit
  `revoke all from anon, authenticated` means only the
  service-role / founder cockpit reader can see it. The founder
  cockpit is gated by `requireFounderSession`.
- **No seller-match promise.** Copy never says "셀러를
  찾아드릴게요" / "곧 연결돼요". Always conditional: "같은 물건을
  가진 셀러가 보면 다시 안내드려요." Auto-matching is out of
  scope.
- **No payment promise.** Submit success copy says "이 단계에서는
  결제·픽업·정산이 시작되지 않아요." Banlist applies.
- **No guarantee / insurance.** Banned phrases (`보증` / `보증금`
  / `보험` / `보장` / `결제 완료/진행/처리` / `보증금 청구` /
  `대여 확정` / `환불` / `정산 완료` / `guaranteed` / `insured`
  / `insurance` / `verified seller`) must not appear in any new
  surface added by this slice. Pinned by
  [`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts).
- **No borrower email / id to sellers.** No seller-facing surface
  is built in this slice. The deferred "seller demand board"
  surface (PR 4 / future) requires a separate DTO projection
  that strips `borrower_id`, `contact_email`, `profile_id`,
  `message` raw text, and any free-text typed by the borrower
  before exposure to a seller. That projection design is **out
  of scope** for this slice — schema-only re-use does not give
  us a seller-side projection by accident.
- **No public DTO widening.** This slice writes through the
  existing `submitFeedbackAction` only. No new public DTO. The
  founder cockpit reader (`listRecentFeedbackSubmissions`) is
  unchanged.
- **Forged authority fields.** `submitFeedbackAction`'s payload
  type already forbids `profile_id`, `id`, `status`,
  `created_at`, etc. The slice does not relax that.
- **Anonymous-OK.** Anonymous users can submit. The action
  attaches `profile_id` only when a signed-in actor exists. The
  closed-alpha provisioning workflow is unchanged.

## 7. What stays deterministic / mock-only now

- **Search intent parsing.** `searchService.parse` +
  `mockAIParser.parseSearch` only. No real LLM call.
- **Try-before-buy hints displayed in / near the form.** Re-use
  [`tryBeforeBuyReadinessService.deriveTryBeforeBuyReadiness`](../src/lib/services/tryBeforeBuyReadinessService.ts)
  output's `tryBeforeBuyPoints` array as a small preview *if* the
  parsed `category` is known. Provenance stays
  `"deterministic"`.
- **Form copy.** All Korean strings come from the bounded vocabulary
  in §10 / the
  [copy backlog](corent_readiness_copy_experiment_backlog.md). No
  new Korean strings invented inline at render time.
- **Insert action.** Existing
  [`submitFeedbackAction`](../src/server/feedback/submitFeedback.ts).
  No new server action.
- **Cockpit display.** Existing
  [`founderCockpitData.ts`](../src/server/admin/founderCockpitData.ts)
  + [`/admin/cockpit/page.tsx`](../src/app/admin/cockpit/page.tsx).
  No new founder-side surface.

## 8. What is reserved for future LLM

All of the following are **future slices** with their own gated
PRs and security review notes (per
[`corent_security_gate_note.md`](corent_security_gate_note.md)):

- **Free text → structured intent.** "다이슨 에어랩 사기 전에
  써보고 싶어요" → `{itemName: "다이슨 에어랩", category:
  "home_care", desiredDurationDays: 3}`. Output stamped
  `provenance: "llm_candidate"`. User confirms before write.
- **Entity resolution.** "다이슨 에어랩" ≅ "Dyson Airwrap" ≅
  "에어랩 컴플리트" — only the LLM channel can decide. Until
  then, exact-string match only.
- **Wanted ↔ listing match candidates.** Score-based suggestion
  for a future seller demand board. Output stamped
  `llm_candidate`. Authority remains "seller clicks 'I have
  this'" — the model does not auto-match.
- **Group similar wanted requests.** "X명이 같은 물건을 기다려요"
  count signal. Counting is deterministic; the entity-resolution
  step that decides "same item" is the LLM part.

All of the above land behind the existing
[`LLMAdapter`](../src/server/llm/index.ts) interface. The mock
adapter ships first; a real provider replaces it through a future
slice with a security review.

## 9. UI placement

| Surface | When | Notes |
| --- | --- | --- |
| `/search` empty state | **This slice (PR 2).** | Lowest implementation risk + highest demand-capture value. Re-uses parsed `intent`, existing `submitFeedbackAction`, existing copy backlog. |
| Home AI entry (`/`'s `AIChatPanel`) | Later (§12 future). | After PR 2 stabilizes and the wedge copy passes 2+ readiness rounds. The same form component is mounted from the home page. |
| `/listings/[id]` no-match state | **Out of scope.** | `/listings/[id]` is server-only and renders an approved listing or 404. There is no in-product "no-match-here" state to bolt this onto. |
| `/dashboard` seller demand board | Future, separate slice with security review. | Requires DTO projection (no borrower email / id / free text / location), seller-side RLS read policy, founder-mediated reveal. **Schema/RLS work is out of scope** until the demand signal is validated. |

## 10. Suggested safe Korean copy

Every string below has been written against the closed-alpha
banlist. New variants must round-trip through
[`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)
§"Wanted Try Request" before shipping.

**Empty-state CTA (replaces current "조건 초기화"-only panel):**

> **No matches**
>
> 조건에 맞는 매물이 아직 없어요. 사기 전에 며칠 써보고 싶다는
> 생각은 그대로 유효해요. 같은 물건을 가진 셀러가 보면 다시
> 안내드려요. 자동으로 매칭되거나 결제·픽업·정산이 시작되지는
> 않아요.
>
> [써보고 싶다고 알리기] (primary)
> [조건 초기화] (secondary, kept)

**Form heading + sub-caption:**

> **이 물건을 사기 전에 써보고 싶어요**
>
> 자동으로 정리한 안내예요. 카테고리·아이템 이름은 한 번 더
> 확인해 주세요. 이 단계에서는 결제·픽업·정산이 시작되지 않아요.

**Helper copy (above the form fields):**

> 적어 주신 내용은 운영자가 먼저 확인해요. 같은 물건을 가진
> 셀러가 보면 다시 안내드려요. 응답을 받고 싶다면 이메일을 함께
> 적어 주세요. (이메일은 선택이에요.)

**Submit success:**

> **받았어요.**
>
> 같은 물건을 가진 셀러가 보면 다시 안내드려요. 자동으로
> 매칭되거나 결제가 시작되지는 않아요. 아래에서 비슷한 다른
> 물건도 살펴볼 수 있어요.
>
> [/search 다시 보기] [/listings 둘러보기]

**Mock / local unavailable** (re-uses the existing
`FeedbackIntakeCard` caption verbatim — do not invent a new
string here):

> 데모 환경에서는 저장되지 않아요. 클로즈드 알파 환경에서만
> 저장돼요.

**Future seller demand board (deferred — design copy only, not
shipping in this slice):**

> **써보고 싶다는 신호 — 베타**
>
> 같은 카테고리에 등록된 셀러에게 보이는 비식별 신호 묶음이에요.
> 자동으로 매칭되거나 결제·픽업·정산이 시작되지는 않아요.
>
> ─ 마사지건 · 마포 권역 · 1일 시도 희망 · 3건
> ─ 빔프로젝터 · 강남 권역 · 7일 시도 희망 · 1건
>
> [이 물건 가지고 있어요] (per-row CTA — 클릭은 운영자에게
> 신호를 보낼 뿐이에요. 자동 연결은 아니에요.)

## 11. Tests needed for the implementation PR

**(For PR 2, not this docs-only PR.)**

- `SearchResults` empty-state branch:
  - When `filtered.length === 0` AND `loadState === "loaded"`,
    the wanted-try-request CTA renders.
  - When `loadState === "error"`, the CTA does **not** render
    (only the retry surface).
  - When `filtered.length === 0` AND no `intent` exists (the user
    landed on `/search` with no params), the form fields fall
    back to safe defaults — message empty, category null.
  - Filled-black "확정" pills do not appear on the CTA copy.
- `WantedTryRequestForm` tests:
  - Pre-fills `message ← intent.rawInput`, `category ←
    intent.category`.
  - On submit, calls `submitFeedback({ kind: "wanted_item",
    sourcePage: "/search?empty", … })`.
  - Never sends `profile_id`, `status`, `id`, `created_at` in
    the payload.
  - Renders the existing `local`/`unsupported` caption verbatim
    in mock mode.
  - Disables the submit button while busy.
- `submitFeedback.test.ts` (additive):
  - `kind: "wanted_item"` + `sourcePage: "/search?empty"` round-
    trips through validators and lands in the repo with that
    exact source page. (The existing tests cover the kind; this
    pins the new source-page code path.)
- Copy guardrails:
  - All new Korean strings shipped in PR 2 (the empty-state CTA,
    form heading, helper, success) are scanned by
    `copyGuardrails.test.ts` against the 14-phrase banlist.
  - The static SearchResults source must not contain any banlist
    phrase even as decoration.
- Source-level guards:
  - `WantedTryRequestForm.tsx` does not import any server-only
    module (`@/server/**` is forbidden in `"use client"`).
  - `WantedTryRequestForm` payload type does not have a
    `profile_id`, `id`, `status`, `borrowerId`, `sellerId`,
    `price`, `payment`, `settlement` slot.
  - `EmptyResults` does not start fetching listings on its own —
    it only renders.

## 12. Minimal implementation sequence

| # | PR | Type | Scope |
| --- | --- | --- | --- |
| 1 | **docs: wanted-try-request slice plan** | docs-only | This file + copy backlog §"Wanted Try Request" + quality gates §"Wanted Try Request Posture". |
| 2 | **feat: wanted-try-request from /search empty state** | code (UI + tests) | `SearchResults` passes parsed `intent` into `EmptyResults`. New `WantedTryRequestForm` client component calls existing `submitFeedbackAction`. New copy strings sourced from §10. New tests per §11. **No schema, no migration, no env, no new server action.** |
| 3 | **feat: feedback status workflow on cockpit** | code (server + UI + tests) | The deferred [`corent_next_actions_2026-05-05.md`](corent_next_actions_2026-05-05.md) #4 lifts as-is. Founder can move `wanted_item` (and other) rows from `new → reviewed → archived`. Uses the existing `feedback_status` enum + `validateFeedbackStatus` validator. **No schema change.** |
| 4 | **(future, separate slice) feat: seller demand board** | code + design + security review | DTO projection design (no borrower email / id / free text / location). New seller-side RLS read policy. Founder-mediated reveal. Triggered only after 2+ rounds of demand signal validate the wedge. **Schema work, if any, lives here.** |
| 5 | **(future) feat: home AI entry uses same form** | code (UI) | Reuse PR 2's `WantedTryRequestForm` from the landing page when the user types intent and there are 0 results. Same component, different mount. |
| 6 | **(future) docs: future LLM extraction note** | docs | When the LLM-candidate slice is ready, this slice's data mapping (§5) gets a "candidate" channel for `parsed_intent` etc. Until then, `provenance: "deterministic"` only. |

The current slice is **PR 1 only** (docs-only). PR 2 is the next
runtime PR; it should be small (one UI component, one prop pass,
existing action). PR 3 is independent and can ship before or after
PR 2 since it touches a different surface.

## 13. Stop conditions

If any of the following surface during PR 2's smoke or in tester
quotes, halt and patch before continuing.

- **Auto-matching implied.** Any copy on the empty state, form,
  or success surface reads "셀러를 찾아드릴게요", "곧 연결돼요",
  "자동으로 매칭", "verified seller", or any other word that
  implies the platform performs matching authority.
- **Payment implied.** Any visible string contains `결제 완료`,
  `결제 진행`, `결제 처리`, `대여 확정`, `보증금`, `보증`,
  `보험`, `보장`, `환불`, `정산 완료`, `guaranteed`, `insured`,
  `insurance`, or `verified seller`.
- **Contact info exposed to seller.** Any seller-facing surface
  (`/dashboard`, `/admin/cockpit` is **not** seller-facing — it
  is founder-only) contains the borrower's email, phone,
  `profile_id`, raw `message`, or any other field that traces
  back to the borrower's identity.
- **Schema created prematurely.** A migration introducing a
  `wanted_try_requests` table, a `wanted_try_status` enum, or
  any new column on `feedback_submissions` is opened in PR 2.
  These belong in PR 4 / future after the signal validates.
- **Server-mode leakage.** `/search` server mode shows static
  `PRODUCTS` cards mixed with empty-state CTA. The server probe
  guard ([`SearchResults.tsx:39-90`](../src/components/SearchResults.tsx#L39-L90))
  must keep the existing `loadState === "error"` vs `"loaded"`
  vs `"loading"` discipline. The wanted-try-request CTA only
  appears on `loaded` + `length === 0`.
- **Payload widening.** The form submits any field beyond the
  six allowed by `SubmitFeedbackPayload` (`kind`, `message`,
  `itemName`, `category`, `contactEmail`, `sourcePage`). A
  forged `profile_id`, `borrowerId`, `status`, etc. is dropped
  by the action — but the form must not even attempt them.
- **Mock-mode silent fallback.** In mock backend mode the form
  must show "데모 환경에서는 저장되지 않아요" and not pretend a
  row was written. Reuse the existing caption verbatim.

## 14. Recommendation

Implement the **`/search` empty-state MVP** next (PR 2 in §12).

The wedge value is highest there:

- The user has *already articulated demand* by typing a query.
  They are at the highest-intent moment of the session.
- Inventory is empty most of the time during cold-start, so the
  CTA gets seen — that is exactly the validation signal needed.
- The implementation surface is small: one client component, one
  prop pass into `EmptyResults`, one re-use of an existing
  server action, no schema, no migration, no env, no new public
  DTO.
- Tester rounds 2 and 3 can use the `wanted_item` count + the
  source-page tag `/search?empty` as the primary success metric
  for the wedge. If demand signal is high, PR 4 (seller demand
  board) becomes urgent. If it is low, the founder learns that
  the wedge needs better framing before any schema work.

Do **not** start PR 4 or any seller-facing surface in the same
window. Schema decisions before signal arrives are sunk cost.

## 15. Cross-references

- Audit that produced this plan: in-conversation read-only audit,
  2026-05-06.
- Existing feedback intake schema:
  [`supabase/migrations/20260504120000_phase2_feedback_intake.sql`](../supabase/migrations/20260504120000_phase2_feedback_intake.sql)
- Action: [`submitFeedbackAction`](../src/server/feedback/submitFeedback.ts)
- Repository: [`feedbackRepository.ts`](../src/server/persistence/supabase/feedbackRepository.ts)
- Cockpit reader: [`founderCockpitData.ts`](../src/server/admin/founderCockpitData.ts)
- Cockpit panel: [`/admin/cockpit/page.tsx`](../src/app/admin/cockpit/page.tsx)
- Empty state today: [`SearchResults.tsx`](../src/components/SearchResults.tsx) §`EmptyResults`
- Try-before-buy readiness: [`tryBeforeBuyReadinessService.ts`](../src/lib/services/tryBeforeBuyReadinessService.ts)
- Banlist test: [`copyGuardrails.test.ts`](../src/lib/copy/copyGuardrails.test.ts)
- Quality gates: [`corent_closed_alpha_quality_gates.md`](corent_closed_alpha_quality_gates.md)
- Copy backlog: [`corent_readiness_copy_experiment_backlog.md`](corent_readiness_copy_experiment_backlog.md)
- Pre-revenue posture: [`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- Security gate: [`corent_security_gate_note.md`](corent_security_gate_note.md)
- Legal/trust framing: [`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)

End of slice plan.

# CoRent password-login + readiness Round 1 — founder-run script

_Companion to [`2026-05-06_readiness_flow_round1.md`](2026-05-06_readiness_flow_round1.md),
[`tester_feedback_form_template.md`](tester_feedback_form_template.md),
[`readiness_round_report_template.md`](readiness_round_report_template.md),
[`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md),
and [`../corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md)._

This is a **practical founder-run script** for the first readiness
round AFTER the password sign-in foundation slice landed
(commit `6b1075e`). It bundles three things into one timeline:

1. A one-time **Supabase Studio manual setup** (founder-only).
2. The **auth method smoke** — password login + magic-link
   fallback, on both user and admin surfaces.
3. The **readiness flow Round 1** — the original Round 1 path,
   now reachable in seconds because no magic-link round-trip is
   needed between testers.

Total founder time: ~30 min (setup + auth smoke) + 20 min per
tester (readiness flow). When you start a new round, copy this
file to `docs/smoke_runs/YYYY-MM-DD_password_login_readiness_round<N>.md`
and fill in the run-specific notes. Do **not** edit this template
in place during a run.

---

## 0. Hard rules

- [ ] No agent (Claude Code, Codex, MCP) executes any command in
      this file. Every step is performed by the founder.
- [ ] No `supabase login` / `link` / `db push` / `--db-url` /
      `gen types` / MCP `apply_migration` / `execute_sql` against
      the founder's account.
- [ ] No production project may be addressed.
- [ ] Out of scope and forbidden if surfaced: payment, deposit,
      escrow, refund, settlement, payout, pickup/return/handoff
      lifecycle, claim/dispute/trust scoring, notifications,
      insurance, guarantee.
- [ ] Forbidden user-facing copy anywhere in this run:
      `보증` / `보증금` / `보험` / `보장` / `결제 완료` /
      `결제 진행` / `결제 처리` / `보증금 청구` / `대여 확정` /
      `환불` / `정산 완료` / `guaranteed` / `insured` /
      `insurance` / `verified seller`.

---

## 1. Supabase Studio manual setup (founder-only)

> **DO NOT RUN VIA AGENT.** The agent cannot enable email/password
> auth or set tester passwords. The founder performs every step
> below, by hand, on the **dev** project (`corent-dev`).

- [ ] Sign in to Supabase Studio for `corent-dev`.
- [ ] **Authentication → Providers → Email**:
  - Enable email provider (already on for magic-link).
  - Confirm that "Email + Password" is enabled.
  - Leave "Confirm email" set per existing project policy — the
    closed-alpha provisioning workflow already creates users with
    confirmed status, so password sign-in works without a
    re-confirmation round-trip.
- [ ] **Authentication → Users**:
  - For each closed-alpha account that needs to sign in via
    password (the founder + each tester):
    - Open the user row.
    - **Reset password** → set a strong password OR use the admin
      API to set one out-of-band.
    - Confirm the user has `email_confirmed_at` set; if not, mark
      confirmed manually.
  - **Do not** create new users through the password sign-in
    surface — the routes are sign-in-only and `shouldCreateUser`
    is forbidden by the [closed-alpha provisioning workflow](../corent_closed_alpha_provisioning_workflow.md).
- [ ] Confirm `profiles` + capability rows already exist for
      every account that will sign in. The login routes never
      create these — they only authenticate. A user without a
      `profiles` row will hit the `signed_in_no_profile` panel on
      `/login`, not the dashboard.
- [ ] Hand each tester their credentials over a private channel
      (1:1 message, not a shared doc). **The password is not
      stored in the repo, in `.env*`, or in any agent's memory.**

If any tester needs a reset later: re-run the **Reset password**
step in Studio. There is no in-app password reset surface yet —
that is intentional and tracked as a future docs-only note in the
[closed-alpha quality gates](../corent_closed_alpha_quality_gates.md).

---

## 2. Preconditions

- [ ] Local working tree clean. `git status` is empty.
- [ ] At least the password-sign-in slice commit `6b1075e` (or
      later) is checked out. Record the SHA in §11.
- [ ] Dev preview or local `npm run dev` pointed at `corent-dev`
      via founder-managed `.env.local` (never agent-inspected).
- [ ] On the smoke commit, all four tooling gates are green —
      record counts in §11:
  - `npm run lint`
  - `bash scripts/check-server-no-console.sh`
  - `npm test -- --run`
  - `npm run build`
- [ ] Founder account has `profiles` + both
      `seller_profiles` + `borrower_profiles` rows (per the
      magic-link Round 1 template).
- [ ] Borrower-only test account is provisioned for the cross-
      borrower isolation step in §6.7.
- [ ] At least one approved server-backed listing exists.
- [ ] Browser session is signed out before §3 starts (cookie jar
      cleared, or use an incognito window — the §3 first step is
      "you're signed out").

---

## 3. User password login smoke

**Goal**: confirm the password route delivers a usable session
for the user surface, the readiness card / request flow remains
reachable, and no signup / mock leakage / payment copy surfaced.

- [ ] **Sign out start point.** Visit `/login`. If you're already
      signed in, click **로그아웃**. URL ends with `?out=1` and a
      calm chip reads "로그아웃되었어요…".
- [ ] **`/login` password form is primary.** With `?out=1` chip
      visible, the **password form renders ABOVE the magic-link
      form**. The page heading reads "CoRent 로그인", and the
      copy below it includes:
  - "등록된 클로즈드 알파 계정으로 로그인해 주세요."
  - "새 계정 생성은 아직 열려 있지 않아요."
  - "비밀번호가 빠르고, 매직 링크는 백업 경로예요."
- [ ] **Submit password form.** Enter a closed-alpha tester
      email + password. Click **비밀번호로 로그인**.
  - Expected: 303 redirect to `/dashboard` (no `next`) or to
    the safe `next` you supplied.
  - DOM: no `pe=` query param survives.
- [ ] **`/sell` server mode.** From the dashboard, navigate to
      `/sell`. The chat intake card caption should read
      **"서버 연결됨 · 베타"**. If it reads `로컬 도우미` /
      `로컬 데모`, **stop** — the dev preview is wired to local
      mock and the password session never made it to the actor
      resolver. See §8 stop conditions.
- [ ] **`/dashboard` server data.** Listings table caption
      should read **"서버에서 불러온 내 리스팅이에요."** Local
      demo rows must NOT be mixed in. The seller readiness panel
      (Bundle 4 Slice 7) renders below the listings table —
      heading **`공개·요청 전 더 신뢰를 주려면`**.
- [ ] **`/search` server listing.** Approved server listings
      render with `추천 이유` + `확인할 점` dashed-pill blocks.
      Static `PRODUCTS` cards must NOT be mixed in.
- [ ] **Failure path — wrong password.** Sign out → revisit
      `/login` → enter the same email with a wrong password →
      submit. Expected: 303 redirect to `/login?pe=invalid`.
      Calm chip reads "이메일 또는 비밀번호가 일치하지 않아요…".
      No raw Supabase error text visible.

Capture in §10.4: the post-login `/dashboard` and the
`/login?pe=invalid` chip rendering.

---

## 4. Admin password login smoke

**Goal**: confirm the founder can sign in with password and reach
`/admin/cockpit`, AND that a non-allowlisted account that knows a
password still 404s on `/admin/cockpit`.

- [ ] **Sign out from §3.** End up signed out at `/login`.
- [ ] **`/admin/login` page.** Visit `/admin/login`. Heading
      reads "CoRent 운영자 로그인". Password form is primary.
      Copy below the heading clarifies:
  - "운영자 권한은 로그인만으로 부여되지 않아요."
  - "허용 목록에 등록된 계정만 cockpit에 접근할 수 있어요."
- [ ] **Founder password login.** Enter the founder email
      (allowlisted) + password. Click **비밀번호로 로그인**.
  - Expected: 303 redirect to `/admin/dashboard`.
- [ ] **`/admin/cockpit` still guarded.** Visit `/admin/cockpit`.
      The cockpit panels render. (If they 404, the founder
      session was never written — stop.)
- [ ] **Non-allowlisted password attempt.** Sign out. Return to
      `/admin/login`. Enter a known **non-allowlisted** account
      email + a real password. Click **비밀번호로 로그인**.
  - Expected: 303 redirect to `/admin/login?pe=invalid`. Same
    envelope as a wrong password — no allowlist disclosure.
  - Confirm `signInWithPassword` was NOT invoked: in DevTools
    Network panel, the response time should be near-immediate
    (allowlist gate runs before Supabase).
- [ ] **Cross-check: even if non-allowlisted account WAS
      authenticated** (e.g. via `/auth/password-sign-in` on the
      user surface) and you visit `/admin/cockpit`, it 404s. The
      `requireFounderSession` per-request gate is the authority,
      not the route handler.
- [ ] **Failure path — wrong password.** Founder email +
      wrong password → 303 to `/admin/login?pe=invalid`. Same
      chip copy as the user surface.

Capture in §10.4: the `/admin/cockpit` post-login state and the
`pe=invalid` chip on a wrong-password attempt.

---

## 5. Magic-link fallback smoke

**Goal**: confirm the magic-link path was not regressed by the
password slice. Both fallbacks must still work.

- [ ] **User magic-link path.**
  - Sign out → `/login`.
  - Submit the **second** form on the page (labeled "매직 링크
    (백업 경로)") with the same email.
  - Expected: a generic 200 response, magic link arrives in your
    inbox.
  - Click the magic link. The callback redirects to `/` or your
    `next` path — same behavior as before this slice.
- [ ] **Admin magic-link path.**
  - Sign out → `/admin/login`.
  - Submit the magic-link form with the founder email.
  - Click the magic link → callback → `/admin/dashboard`.
  - `/admin/cockpit` still loads.

If either path fails, **stop** — magic link is the long-term
auth path; the password slice must not have broken it. The
import-boundary tests should have caught a regression in CI; if
they didn't, log a `stop` event in §10.5 of the round report.

---

## 6. Readiness flow Round 1 (post-password-login)

This is the same path as
[`2026-05-06_readiness_flow_round1.md`](2026-05-06_readiness_flow_round1.md)
§4–§5. The only difference is that you reach `/listings/[id]`
in seconds, not after a magic-link round-trip. Re-running the
relevant subsections below; the canonical sub-section IDs
(§4.1, §4.3, §5.2, etc.) match the original round template so
the round report can cross-link cleanly.

### 6.1 `/search` (matches §4.1 of original)

- [ ] Approved server listings render. No static `PRODUCTS` mix.
- [ ] `추천 이유` block: ≤ 5 dashed pills.
- [ ] `확인할 점` block: 1–2 dashed pills.
- [ ] No filled-black pill in the hints block.
- [ ] Pill text passes the readiness banlist scan.

### 6.2 `/listings/[id]` (matches §4.2)

- [ ] Detail page renders title / summary / pickup area /
      condition / seller id / duration selector / price
      breakdown.
- [ ] **`구매 전 확인할 수 있는 것`** card renders below the
      main grid.
- [ ] Pre-payment caption reads **"아직 결제는 발생하지
      않아요. 요청만 전송돼요."**

### 6.3 Readiness card check (matches §4.3)

- [ ] Heading **`구매 전 확인할 수 있는 것`** + sub-caption
      **"자동으로 정리한 안내예요. 셀러 응답 전에 다시 확인해
      주세요."**.
- [ ] Two columns:
  - Left: category-specific try-before-buy points.
  - Right: ≥ 1 universal item, pickup area echo, duration
    nudge.
- [ ] Bottom row: `책임 기준` caption + dashed pill of the
      form **"책임 기준: 예상 가치 ₩…"** (or "정보 없음").
- [ ] Responsibility caption matches the closed vocabulary.
- [ ] Footer caption matches the closed vocabulary.
- [ ] Banlist scan passes.

### 6.4 Request submission (matches §4.4)

- [ ] Pick a duration (1일 / 3일 / 7일).
- [ ] Click **요청 보내기**. Success copy reads **"요청이
      전송되었어요. 셀러의 응답을 기다리는 중이에요."** plus
      the deferred-rental caption.
- [ ] No payment / charge / deposit copy on the success panel.

### 6.5 `/requests` (matches §4.5)

- [ ] New request appears with status **"셀러 응답을
      기다리는 중"**.
- [ ] No pill on `/requests` reads `결제` / `보증금` /
      `대여 확정` / etc.

### 6.6 `/dashboard` seller readiness (matches §5.2)

- [ ] Heading **`공개·요청 전 더 신뢰를 주려면`** + sub-caption.
- [ ] Two columns: `지금 상태` count line + `추천 점검 항목`.
- [ ] Bottom row: `책임 기준 안내` caption + dashed pill.
- [ ] Status-aware footer caption matches the seller's row mix
      (empty / pending / all-approved / partial-rejected /
      rejected-only).

### 6.7 Approve / decline + `/requests` status update (matches §5.4 + §4.6)

- [ ] On `/dashboard` approve the borrower's request → status
      flips to `판매자 승인`.
- [ ] Re-open `/requests` → row reads **"셀러가 요청을
      수락했어요. 아직 결제·픽업·정산은 시작되지 않았어요."**
- [ ] No payment / settlement copy anywhere on either side.

### 6.8 Cross-borrower isolation (matches §4.7)

- [ ] Sign out → sign in via password (or magic link) as the
      borrower-only test account.
- [ ] Open `/requests`. None of the founder's borrower rows
      should appear.

---

## 7. Tester run (after §3–§6 founder dry-run is green)

- [ ] Hand the tester their credentials privately (per §1).
- [ ] Walk them to `/login` cold (do NOT share the founder's
      §3–§6 checklist).
- [ ] Have them complete
      [`tester_feedback_form_template.md`](tester_feedback_form_template.md)
      while looking at `/search → /listings/[id] → 요청 → /requests`.
- [ ] Capture **verbatim Korean** quotes in §10.4 of the round
      report.
- [ ] Triage each quote per
      [`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md)
      and tag per
      [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md).

---

## 8. Stop conditions

If any of the following surface, halt the smoke and patch before
the next tester sees the build.

**Auth method (new, this slice)**:

- The browser DevTools Network panel shows a `password` field in
  any response body, redirect Location, or 3rd-party request
  payload after a `/auth/password-sign-in` or
  `/admin/auth/password-sign-in` POST.
- Server logs (terminal running `npm run dev`) show a
  `password=` token, the user's email, or the Supabase message
  body verbatim. Permitted log fields: event name +
  `err_code: <token>` only.
- After a successful password login, `/sell` or `/dashboard`
  reads **"로컬 도우미"** / **"로컬 데모"** / shows static
  `PRODUCTS`. The session cookie was not picked up by
  `resolveServerActor` — likely a cookie domain / `mutable` flag
  regression.
- The dev-only `chat_intake_mode_local` log line emits
  `reason: "no_actor"` immediately after a successful password
  login (instead of `actor_source_supabase`).
- `/admin/cockpit` opens for an account that is **not** in
  `FOUNDER_ADMIN_EMAIL_ALLOWLIST` after that account password-
  signed-in to `/admin/auth/password-sign-in`.
- `/admin/auth/password-sign-in` redirects to `/admin/cockpit`
  or to `/admin/dashboard` for a non-allowlisted email, instead
  of `/admin/login?pe=invalid`.
- A magic-link form on `/login` or `/admin/login` 404s, returns
  a non-200, or has been removed from the DOM.

**Readiness flow (existing, from Round 1 template)**:

- `/search` shows static `PRODUCTS` cards in server mode.
- `/listings/[id]` is reached but the readiness card does NOT
  render.
- Any visible copy on `/search` / `/listings/[id]` / `/dashboard`
  / `/requests` / `/admin/cockpit` contains `결제 완료/진행/처리`,
  `대여 확정`, `보증` / `보증금` / `보증금 청구`, `보험` /
  `보장`, `환불`, `정산 완료`, `guaranteed`, `insured`,
  `insurance`, or `verified seller`.
- The borrower request payload carries any forged authority
  field (`sellerId` / `borrowerId` / `status` / `price` /
  `payment` / `settlement`) — inspect the Network →
  `submitRentalRequest` payload.
- A seller's approve / decline mutates fields beyond `status`.
- A seller whose only listing got rejected sees the
  all-approved success caption.
- `/requests` shows a borrower another borrower's row.
- The link from `/search` to a result card goes to `/items/[id]`
  (the local-mock detail path) instead of `/listings/[listingId]`
  (the server-only detail path).

If a stop condition surfaces, fill §11 of the round report with
the exact patch task before re-running.

---

## 9. Optional SQL verification (founder-only, read-only)

> **DO NOT RUN VIA AGENT.** Paste each block into the Supabase
> Studio SQL editor for the **dev** project. Substitute
> placeholders by hand. Read-only `select` queries only.

```sql
-- ⚠️ DO NOT RUN VIA AGENT. Founder-only, dev project, read-only.

-- 1) Confirm the smoke borrower's request landed and the status
--    matches what /requests reads.
select id, status, listing_id, duration_days,
       borrower_total, created_at, updated_at
from rental_intents
where borrower_id = '<FOUNDER_PROFILE_UUID>'
order by updated_at desc
limit 5;

-- 2) Confirm rental_events recorded the seller_approved /
--    seller_cancelled transition.
select id, rental_intent_id, from_status, to_status, actor, at
from rental_events
where rental_intent_id = '<RENTAL_INTENT_UUID>'
order by at asc;

-- 3) Confirm the listing is approved.
select id, status, item_name, category, pickup_area
from listings
where id = '<LISTING_UUID>';
```

If any query disagrees with the UI, **stop** and log under §10.5
of the round report.

---

## 10. Run-specific notes (fill in during the run)

- **Commit SHA:**
- **`npm run lint`:** `<pass/fail>`
- **`bash scripts/check-server-no-console.sh`:** `<pass/fail>`
- **`npm test -- --run`:** `<N> files / <M> tests`
- **`npm run build`:** `<pass/fail>`
- **Supabase Studio password-set timestamp(s):**
  - founder account — `<HH:MM>`
  - tester-1 — `<HH:MM>`
- **Auth smoke results:**
  - §3 user password login — `<pass/fail>`
  - §4 admin password login — `<pass/fail>`
  - §4 non-allowlisted attempt = `pe=invalid` — `<pass/fail>`
  - §5 user magic-link fallback — `<pass/fail>`
  - §5 admin magic-link fallback — `<pass/fail>`
- **Readiness smoke results:** copy the §10.2 table from
  [`readiness_round_report_template.md`](readiness_round_report_template.md)
  here.

---

## 11. Cross-references

- Original Round 1 smoke: [`2026-05-06_readiness_flow_round1.md`](2026-05-06_readiness_flow_round1.md)
- Tester form: [`tester_feedback_form_template.md`](tester_feedback_form_template.md)
- Round report template: [`readiness_round_report_template.md`](readiness_round_report_template.md)
- Decision aid: [`readiness_feedback_decision_aid.md`](readiness_feedback_decision_aid.md)
- Taxonomy: [`readiness_feedback_taxonomy.md`](readiness_feedback_taxonomy.md)
- Quality gates: [`../corent_closed_alpha_quality_gates.md`](../corent_closed_alpha_quality_gates.md)
- Closed-alpha provisioning workflow: [`../corent_closed_alpha_provisioning_workflow.md`](../corent_closed_alpha_provisioning_workflow.md)

End of password-login + readiness Round 1 script.

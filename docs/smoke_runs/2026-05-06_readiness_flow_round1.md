# CoRent readiness-flow smoke — founder-run template

_Companion to [`docs/corent_closed_alpha_smoke_ops_checklist.md`](../corent_closed_alpha_smoke_ops_checklist.md)
and [`docs/corent_closed_alpha_smoke_test_plan.md`](../corent_closed_alpha_smoke_test_plan.md)._

This is a **reusable founder-run template** for smoke-testing the
readiness-centered closed-alpha flow added in Bundle 4
(borrower try-before-buy readiness card on `/listings/[id]`,
seller listing readiness panel on `/dashboard`, plus the
deterministic match-hints, seller-store preview, and copy
guardrail hardening that came with them).

When you start a new smoke session, copy this file to
`docs/smoke_runs/YYYY-MM-DD_readiness_flow_<round>.md` and fill
in the run-specific notes. Do **not** edit this template in
place during a run.

---

## 0. Hard rules

- [ ] No agent (Claude Code, Codex, MCP) executes any command in
      this file. Every step is performed by the founder.
- [ ] No `supabase login` / `link` / `db push` / `--db-url` /
      `gen types` / MCP `apply_migration` / `execute_sql` against
      the founder's account.
- [ ] No production project may be addressed. `getBackendMode()`
      hard-fails closed in `NODE_ENV=production`.
- [ ] Out of scope for this smoke and forbidden if surfaced:
      payment, deposit, escrow, refund, settlement, payout,
      pickup/return/handoff lifecycle, claim/dispute/trust
      scoring, notifications, insurance, guarantee.
- [ ] Any SQL block marked **DO NOT RUN VIA AGENT** is
      founder-only, run by hand in the Supabase Studio SQL editor
      against the dev project.

---

## 1. Purpose

Validate not only that the new readiness surfaces *render*, but
that the **try-before-buy thesis** is understandable to a real
tester:

- A borrower can see what they will be able to validate before
  buying.
- A borrower understands the responsibility basis without
  feeling like payment / deposit has started.
- A seller understands what to clarify before a listing feels
  trustworthy enough to request.
- The full request → approve / decline → status loop still
  works end to end.

If a tester reads the surfaces and walks away thinking "this
already charged my card", "this guarantees the item", or "I have
no idea what I'm responsible for", **the smoke fails even if
every component renders**.

---

## 2. Preconditions

- Local working tree clean. `git status` shows no uncommitted
  changes.
- Local `main` (or smoke branch) at the commit being tested.
  Record the SHA in §11.
- Dev preview or local `npm run dev` pointed at the `corent-dev`
  Supabase project via `.env.local` (founder-managed, never
  agent-inspected).
- The founder account has a `profiles` row plus **both**
  `seller_profiles` and `borrower_profiles` rows in `corent-dev`
  so the same magic-link account can play both sides. Use the
  `docs/sql_templates/closed_alpha_profile_capabilities.sql`
  template as a starting point — never run it as-is.
- A separate borrower-only test account is provisioned for the
  cross-borrower isolation step (§4.7).
- At least one approved server-backed listing exists, or the
  founder is ready to publish a fresh draft via
  `/admin/cockpit`. The readiness card requires an *approved*
  listing.
- Last `npm run lint`, `npm test -- --run`, and `npm run build`
  on the smoke commit are green. Record counts in §11.

---

## 3. Founder setup

1. **Sign in.** Open `/admin/login` and request a magic link for
   the founder email. Sign in via the magic-link callback.
2. **Confirm dual capability.** Open `/login`. The signed-in
   panel should show pills `Seller ✓` + `Borrower ✓` (and
   `Founder ✓` if allowlisted). If a pill is missing, fix
   provisioning in Supabase Studio first — do not patch
   capability via the app.
3. **Confirm server backend.** Open `/dashboard`. The chat
   intake card should read **"서버 연결됨 · 베타"**. The
   listings table caption should read
   **"서버에서 불러온 내 리스팅이에요."** If either reads
   *"로컬 도우미"* / *"로컬 데모"*, the dev preview is wired
   wrong — stop and check `.env.local`.
4. **Have at least one approved listing.** If none exist:
   1. From `/dashboard`, create a draft via the chat intake card.
   2. From `/admin/cockpit`, click **공개로 승인** on the new
      row. Confirm the row flips to `approved`.
5. **Open the founder smoke notes file.** Copy this template to
   `docs/smoke_runs/YYYY-MM-DD_readiness_flow_<round>.md` and
   work from the copy. Do not edit this template during a run.

---

## 4. Borrower flow

The borrower's job is to validate the try-before-buy thesis. Run
this section first as the founder (dual-capable account), then
optionally repeat as the borrower-only account from §2.

### 4.1 `/search`

- [ ] Open `/search`. Approved server listings render. Static
      `PRODUCTS` cards must NOT be mixed in (server-mode leakage
      guard).
- [ ] Below each card a `추천 이유` block renders with up to 5
      dashed-border pills (e.g. `카테고리 일치`, `마포 픽업`,
      `1일 체험에 적합`, `구매 전 체험`, `희망 가격 이내`).
- [ ] An `확인할 점` block renders with 1–2 dashed-border pills
      (e.g. `결제·픽업 전 단계`, `구성품 확인 필요`).
- [ ] No filled-black pill appears inside the hints block (those
      would imply confirmed authority).
- [ ] No pill text contains `보증`, `보증금`, `보험`, `보장`,
      `결제 완료`, `결제 진행`, `결제 처리`, `보증금 청구`,
      `대여 확정`, `환불`, or `정산 완료`.

### 4.2 `/listings/[id]`

- [ ] Click into one approved listing. The detail page renders
      the title, summary, pickup area, condition, seller id,
      duration selector, price breakdown, and the
      **`구매 전 확인할 수 있는 것`** card below the main grid.
- [ ] Pre-payment caption inside the request panel reads
      **"아직 결제는 발생하지 않아요. 요청만 전송돼요."**

### 4.3 Readiness card check

The readiness card is the heart of this smoke. Inspect it
carefully.

- [ ] Heading reads **`구매 전 확인할 수 있는 것`** with the
      sub-caption **"자동으로 정리한 안내예요. 셀러 응답 전에
      다시 확인해 주세요."**
- [ ] Two columns:
  - [ ] Left: `구매 전 확인할 수 있는 것` — category-specific
        try-before-buy points (e.g. for a 마사지건 listing:
        진동 강도·소음, 손에 쥐었을 때 무게감, 충전·배터리).
  - [ ] Right: `요청 전 확인할 점` — at least one universal
        item ("구성품과 동봉 자료를 사진과 다시 비교해 주세요"),
        the pickup area echoed back if present, and the
        duration nudge ("1일·3일·7일 중 본인에게 맞는 기간을
        골라 주세요").
- [ ] Bottom row: `책임 기준` caption + dashed-border pill of
      the form **"책임 기준: 예상 가치 ₩…"** (or
      "책임 기준: 예상 가치 정보 없음" when the listing has no
      estimated value).
- [ ] Responsibility caption reads **"사용 중 이상이나 분실이
      발생하면 셀러와 책임 기준에 따라 협의하게 돼요. 정확한
      책임 기준은 셀러 응답 후 다시 안내돼요."**
- [ ] Footer caption reads **"아직 결제·픽업·정산은 시작되지
      않아요. 요청 전 책임 기준을 다시 확인해요."**
- [ ] Banlist scan on the visible card text:
      **must NOT contain** `보증`, `보증금`, `보험`, `보장`,
      `결제 완료`, `결제 진행`, `결제 처리`, `보증금 청구`,
      `대여 확정`, `환불`, `정산 완료`.

### 4.4 Request submission

- [ ] Pick a duration (try **1일** for short-trial, then **7일**
      for weekly-trial in a separate run if you want to confirm
      the match hints flip).
- [ ] Click **요청 보내기**. Success copy reads **"요청이
      전송되었어요. 셀러의 응답을 기다리는 중이에요."** plus
      **"아직 대여가 확정된 것은 아니에요. 셀러 승인 + 일정
      합의 이후에 다음 단계로 넘어가요."**
- [ ] No payment / charge / deposit copy appears anywhere on
      the success panel.

### 4.5 `/requests` status check

- [ ] Open `/requests`. The new request appears with status
      **"셀러 응답을 기다리는 중"**.
- [ ] No pill on `/requests` reads `결제`, `보증금`, `대여
      확정`, etc.

### 4.6 After seller responds (cross-flow)

After §5.4 below:

- [ ] If seller approved → `/requests` shows the row with
      **"셀러가 요청을 수락했어요. 아직 결제·픽업·정산은
      시작되지 않았어요."**
- [ ] If seller declined → `/requests` shows the row with
      **"셀러가 요청을 거절했어요. 이 요청은 더 진행되지
      않아요."**

### 4.7 Cross-borrower isolation

- [ ] Sign out, then sign in as the borrower-only test account
      from §2.
- [ ] Open `/requests`. None of the rows from §4.5 / §4.6
      appear. Either an empty state with a `/search` link, or
      only that account's own rows.

---

## 5. Seller flow

Sign back in as the founder (dual-capable) account.

### 5.1 `/dashboard` — listings still render

- [ ] `/dashboard` loads in server mode. Listings table caption
      **"서버에서 불러온 내 리스팅이에요."** present. Local
      demo rows hidden.
- [ ] Existing 셀러 스토어 초안 panel still renders (Bundle 4
      Slice 2). Existing ServerRequestsBlock still present.

### 5.2 Seller listing readiness panel check

Below the listings table, above the **새 물건 등록** button.

- [ ] Heading reads **`공개·요청 전 더 신뢰를 주려면`** with
      the sub-caption **"자동으로 정리한 안내예요.
      구성품·상태·수령 권역을 먼저 확인해 주세요."**
- [ ] Two columns:
  - [ ] Left: `지금 상태` — count line (e.g. "2개 리스팅 중
        1개가 공개됐어요"). If any row is rejected, a separate
        line reads "{N}개 리스팅은 운영자 검토에서 보류됐어요."
  - [ ] Right: `추천 점검 항목` — at least the three universal
        nudges (수령 권역, 사용감, 사진) plus a category-specific
        nudge for each unique category in the seller's listings.
- [ ] Bottom row: `책임 기준 안내` caption + dashed-border pill
      reading **"책임 기준은 예상 가치 기준으로 안내돼요."**
- [ ] Footer caption is status-aware:
  - empty seller → **"리스팅을 1개 이상 등록한 뒤 공개 검토를
    받게 돼요."**
  - any draft / pending → **"검토 중·초안 리스팅이 있어요.
    운영자 검토 후 공개되면 다시 안내돼요."**
  - all approved → **"모든 리스팅이 공개되어 있어요. 추천
    항목을 정기적으로 다시 확인해 주세요."**
  - rejected-only → **"모든 리스팅이 운영자 검토에서
    보류됐어요. 추천 항목을 확인한 뒤 다시 등록을 시도해
    주세요."** (and crucially **NOT** the all-approved line)
- [ ] Panel does not appear in local-mock mode (verify by
      flipping `.env.local` mode in a sandbox preview, optional).
- [ ] Banlist scan on the visible panel text: **must NOT
      contain** `보증`, `보증금`, `보험`, `보장`, `결제 완료`,
      `결제 진행`, `결제 처리`, `보증금 청구`, `대여 확정`,
      `환불`, `정산 완료`.

### 5.3 Incoming request check

- [ ] The `서버에서 받은 대여 요청` block above shows the
      borrower's request from §4.4 with status `요청 접수`.
- [ ] The pre-payment caption inside the block reads
      **"베타: 수락·거절은 처리되지만, 결제·픽업·반납·정산
      단계는 아직 연결되어 있지 않아요."**

### 5.4 Approve / decline

- [ ] Click **요청 수락** (or **요청 거절** for the second
      borrower request you set up in §4.4 if running both).
- [ ] Status flips to `판매자 승인` (approve) or `판매자 취소`
      (decline). Toast reads non-secret Korean copy. Buttons
      become read-only `statusLabel(...)` for that row.
- [ ] No payment / settlement copy appears. Approve does NOT
      surface a "rental confirmed" or "deposit charged" line.

---

## 6. Admin / founder check

### 6.1 `/admin/cockpit` status visibility

- [ ] Open `/admin/cockpit`. The cockpit visibility row for the
      borrower's request reflects the seller response (`요청
      접수` → `판매자 승인` / `판매자 취소`).
- [ ] No payment / settlement / refund copy appears. The
      cockpit panels remain pre-revenue posture.

### 6.2 `/admin/login` signed-in panel

- [ ] `/admin/login` shows the founder's email + the
      `Founder ✓` pill + a calm link to `/admin/cockpit`. No
      capability promotion, no auto-provisioning.

---

## 7. What to ask a tester

Hand the tester the URL, sign in for them with a *test* magic
link if needed, and ask them open-ended questions. Capture
verbatim quotes in §11.

1. **"`구매 전 확인할 수 있는 것` 카드를 보고 이 물건이 어떤
   사용감인지 더 잘 이해되셨나요?"**
   _(Did the readiness card make the item more understandable?)_
2. **"`책임 기준`이라는 말을 봤을 때, 무섭다 / 명확하다 /
   안심된다 중 어디에 가까웠나요? 그 이유는요?"**
   _(Did "책임 기준" feel scary, clear, or reassuring? Why?)_
3. **"이 페이지를 보고 ‘이미 결제가 시작된 것 같다’고
   느껴졌나요?"**
   _(Did it feel like payment had started?)_
4. **"이 물건을 요청 보내기 전에 멈칫하게 만든 건 무엇이었나요?"**
   _(What would stop you from requesting?)_
5. **"내 물건을 등록한다고 상상해 보세요. 어떤 점이 가장 망설여졌나요?"**
   _(What would stop you from listing your own item?)_

Bonus probe (optional): **"`아직 결제·픽업·정산은 시작되지
않아요`라는 문구를 보고 어떤 단계라고 이해하셨나요?"**

---

## 8. Stop conditions

If any of the following surface, stop the smoke and file a
patch task before continuing:

- Any visible copy on `/search`, `/listings/[id]`, `/dashboard`,
  `/requests`, or `/admin/cockpit` implies any of:
  - 결제 완료 / 결제 진행 / 결제 처리
  - 대여 확정 / 대여 완료
  - 보험 / 보장 / 보증 / 보증금 / 보증금 청구
  - 환불 / 정산 완료
- Local demo cards or mock fixtures appear in server mode on
  `/search` or `/dashboard` (the Bundle 2 leakage guards are
  broken).
- Borrower request payload carries any forged authority field
  (`sellerId`, `borrowerId`, `status`, `price`, `payment`,
  `settlement`, …) — inspect Network → `submitRentalRequest`
  payload.
- Approve / decline mutates fields beyond `status` (e.g. a
  `safetyDeposit` / `borrowerTotal` change).
- A seller whose only listing got rejected sees the
  all-approved success caption (the rejected-only branch is
  broken).
- A draft-only or empty-listings seller sees the all-approved
  success caption.
- `/requests` shows a borrower another borrower's row (cross-
  borrower isolation broken).
- `/admin/cockpit` is reachable by a non-allowlisted account
  (founder gate broken).

---

## 9. Optional SQL verification (founder-only, read-only)

> **DO NOT RUN VIA AGENT.** Paste each block into the Supabase
> Studio SQL editor for the **dev** project (`corent-dev`).
> Substitute placeholders by hand. Read-only `select` queries
> only — no inserts, no updates, no deletes.

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

-- 2) Confirm the seller-side row is the same one and the
--    approve/decline transition was recorded.
select id, status, seller_id, listing_id, updated_at
from rental_intents
where seller_id = '<FOUNDER_PROFILE_UUID>'
order by updated_at desc
limit 5;

-- 3) Confirm the listing the borrower hit is approved and not
--    leaking through static PRODUCTS.
select id, status, item_name, category, pickup_area
from listings
where id = '<LISTING_UUID>';

-- 4) Confirm rental_events recorded the seller_approved /
--    seller_cancelled transition (read-only audit trail).
select id, rental_intent_id, from_status, to_status, actor, at
from rental_events
where rental_intent_id = '<RENTAL_INTENT_UUID>'
order by at asc;
```

If any of these queries return rows that contradict what the UI
shows, **stop** and capture the divergence in §11.

---

## 10. Expected report format after smoke

Fill out the copy of this template at
`docs/smoke_runs/YYYY-MM-DD_readiness_flow_<round>.md` after
running. Recommended structure:

### 10.1 Summary

- **Run date / time:**
- **Commit SHA:**
- **Dev project:** `corent-dev`
- **Result:** `pass` / `pass-with-followups` / `fail`
- **Founder account:** (email — never include the magic-link
  token)
- **Tester account(s):** (anonymized handle / role only)
- **Test count:** `<N> files / <M> tests` from the green
  `npm test -- --run` on the smoke commit.

### 10.2 Pass / fail

A flat table, one row per checklist heading from §3 / §4 / §5
/ §6:

| Section | Status | Notes |
|---|---|---|
| 3. Founder setup | ✅ / ❌ |  |
| 4.1 /search | ✅ / ❌ |  |
| 4.2 /listings/[id] | ✅ / ❌ |  |
| 4.3 readiness card | ✅ / ❌ |  |
| 4.4 request submission | ✅ / ❌ |  |
| 4.5 /requests status | ✅ / ❌ |  |
| 4.6 after seller responds | ✅ / ❌ |  |
| 4.7 cross-borrower isolation | ✅ / ❌ |  |
| 5.1 /dashboard listings | ✅ / ❌ |  |
| 5.2 seller readiness panel | ✅ / ❌ |  |
| 5.3 incoming request | ✅ / ❌ |  |
| 5.4 approve / decline | ✅ / ❌ |  |
| 6.1 /admin/cockpit | ✅ / ❌ |  |
| 6.2 /admin/login | ✅ / ❌ |  |

### 10.3 Screenshots to capture

- `/listings/[id]` showing the readiness card with the
  responsibility-basis pill.
- `/dashboard` showing the seller readiness panel with the
  status-aware footer.
- `/requests` after a seller approval, showing the
  `seller_approved` Korean copy.
- `/requests` after a seller decline, showing the
  `seller_cancelled` Korean copy.
- `/admin/cockpit` after the seller response, showing the row
  in its post-response state.

Strip avatars, emails, and any session-bound tokens before
attaching to the run note.

### 10.4 Tester quotes

Verbatim Korean quotes only. One per question from §7. Mark the
quote as `tester-1`, `tester-2`, … rather than the tester's
name. Attach a sentiment annotation: `clear` / `unclear` /
`scary` / `reassuring` / `confused`.

> **Q3 ("결제가 시작된 것 같다고 느껴졌나요?")** — `tester-1`:
> "결제는 시작 안 된 것 같아 보였어요." → `clear`.

### 10.5 Open issues

Numbered list. For each:

- **Title** (≤ 12 words)
- **Where surfaced** (URL or section)
- **What you saw** (≤ 3 sentences, no screenshots inline)
- **Severity** (`stop` / `next-patch` / `nice-to-have`)
- **Suggested next slice** (1–2 sentences only — never a full
  spec)

### 10.6 Next patch recommendation

One paragraph. Examples of valid recommendations:

- "Tighten the readiness banlist to also cover `…`."
- "Add a `잘못된 사진` nudge to the seller readiness panel
  when a category is `…`."
- "Render the readiness card on `/items/[id]` as well so the
  static demo path matches the server-mode path."

If the smoke passed cleanly with no copy or behavior issues:
"No follow-up patch required; recommend graduating the
readiness card from advisory to default-on for all closed-alpha
testers."

---

## 11. Run-specific notes (fill in during the run)

- **Commit SHA:**
- **`npm run lint`:**
- **`bash scripts/check-server-no-console.sh`:**
- **`npm test -- --run`:** `<N> files / <M> tests`
- **`npm run build`:**
- **Founder dual-capability provisioned at:** (timestamp)
- **First approved server listing id:**
- **Borrower request id:**
- **Seller response (approve/decline) at:** (timestamp)
- **Tester sessions:**
  - `tester-1` —
  - `tester-2` —

End of template.

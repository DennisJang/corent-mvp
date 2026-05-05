# CoRent corent-dev first remote E2E smoke — 2026-05-05

## 1. Summary

- **First real remote/dev end-to-end smoke passed against `corent-dev`.**
- This is founder-run closed-alpha validation. **Not production readiness.**
- Local `main` / `origin/main` at the time of writing: `ec45d8d` (the
  three fixes landed during the smoke session — see §4). Local
  `main` is currently `[ahead 3]` of `origin/main`; the founder
  controls when to push.
- Remote Supabase project: `corent-dev` (region `ap-northeast-2`).
- **Every Supabase dashboard, SQL editor, and Auth UI action was
  performed manually by the founder.** No agent (Claude Code,
  Codex, MCP) ran any remote command on the founder's behalf, in
  line with [`docs/agent_loop.md`](../agent_loop.md) and
  [`docs/corent_closed_alpha_provisioning_workflow.md`](../corent_closed_alpha_provisioning_workflow.md).

## 2. What was validated

The minimum visible marketplace loop, end to end, against the real
`corent-dev` schema:

- [x] Supabase Auth magic link — founder / admin via `/admin/login`
      → `/admin/auth/callback` → `/admin/dashboard` lands.
- [x] Supabase Auth magic link — normal user via `/login` →
      `/auth/callback` → `/` lands. (Founder dual-capability used the
      same account for the seller and borrower legs.)
- [x] Founder profile provisioned with **both** seller + borrower
      capability rows (`profiles` + `seller_profiles` +
      `borrower_profiles`) via the `docs/sql_templates/closed_alpha_profile_capabilities.sql`
      template, substituted in a local scratch file (not committed).
- [x] `/sell` engaged **server** intake mode (post-fix — see §4).
      Header badge read **"서버 연결됨 · 베타"**.
- [x] `listing_intake_sessions` — 1 row created on first
      "초안 미리보기" click.
- [x] `listing_intake_messages` — ≥ 2 rows (seller + assistant).
- [x] `listing_extractions` — 1 row.
- [x] `listings` — 1 draft row at `status='draft'` after
      "리스팅 초안으로 저장" click.
- [x] `listing_verifications` — 1 matching row, `safety_code` matched
      `^[A-Z]-[0-9]{3}$`.
- [x] `/dashboard` — server mode, listings table caption
      **"서버에서 불러온 내 리스팅이에요."** rendered the new draft.
      Local mock pending/active blocks correctly hidden in server
      mode.
- [x] `/admin/cockpit` — "최근 리스팅" panel rendered the draft with
      a **"공개로 승인"** button.
- [x] Founder publish — clicking "공개로 승인" flipped
      `listings.status` to `approved`. Idempotent re-click rendered
      "이미 공개됨".
- [x] `/search` — server-projected card visible. Static `PRODUCTS`
      cards correctly **not** mixed in (Bundle 2 Slice 1
      invariant).
- [x] `/listings/[id]` — sanitized DTO detail page rendered for the
      approved listing. Pre-payment caption
      "아직 결제는 발생하지 않아요. 요청만 전송돼요." present.
- [x] Borrower request — duration selected (3 days), "요청 보내기"
      clicked. Success copy "요청이 전송되었어요. 셀러의 응답을
      기다리는 중이에요." + "아직 대여가 확정된 것은 아니에요." rendered.
- [x] `rental_intents` — 1 row at `status='requested'`,
      `payment_provider='mock'`, `payment_status='not_started'`,
      `pickup_status='not_scheduled'`, `return_status='not_due'`,
      `settlement_status='not_ready'`.
- [x] `rental_events` — 1 row, `from_status=NULL`,
      `to_status='requested'`, `actor='borrower'`,
      `reason='rental_request_created'`.
- [x] `/dashboard` — seller side shows the new request inside the
      "서버에서 받은 대여 요청" block with the deferred-actions
      caption "승인·거절·결제 단계는 아직 준비 중이에요."
- [x] `/admin/cockpit` — "최근 대여 요청" panel rendered the new row
      at `status='requested'`. Status counts updated.

## 3. Concrete smoke artifacts

The actual rows produced by this run:

| Field | Value |
| --- | --- |
| Founder profile / `auth.users.id` / `profiles.id` | `7881f284-21b2-4c84-b95f-1befdc2a1787` |
| Listing id | `4d600de1-3244-4034-9871-ca66997a5f40` |
| Rental intent id | `f8ae2421-0f39-4331-9275-b7824557f9b6` |
| Rental event id | `d6ec71b3-c1a3-42ad-8438-bd10d00589da` |
| Item | Theragun Mini |
| Pickup area | 마포 |
| Listing status after publish | `approved` |
| Rental event `to_status` | `requested` |
| Rental event `actor` | `borrower` |
| Rental event `reason` | `rental_request_created` |

Founder UUID is documented here intentionally — the project uses
the founder's auth user id as the canonical closed-alpha test
identity. No tester PII is included.

## 4. Issues discovered and fixed during the smoke

The smoke surfaced three real bugs and one environment quirk. All
three bugs were resolved during the same session and are committed
on `main`:

| # | Issue | Resolution |
| 1 | `/sell` originally rendered the legacy local-only `SellerRegistration` form. The Supabase-backed write path lived only on `/dashboard` via `ChatToListingIntakeCard`. The founder seeing `/sell` clicked through and writes never reached `corent-dev` — they landed in browser localStorage instead. | Commit **`57cfe7a`** — `fix: route sell page to server intake`. `/sell` now renders `ChatToListingIntakeCard`, the same probe-driven supabase-aware surface `/dashboard` uses. The legacy `SellerRegistration` component is preserved in the codebase but no longer wired. |
| 2 | The Supabase intake writer's session/message ids were minted via `generateId("isn")` / `generateId("imsg")` (e.g. `isn_<16hex>`). The Phase 2 schema declares `listing_intake_sessions.id` and `listing_intake_messages.id` as uuid PKs; `intakeRepository.saveIntakeSession` / `appendIntakeMessage` validate the id with `validateUuid` before any DB call. Validator rejected up-front, the supabase writer threw, the action mapped that to `internal`, and the chat card surfaced **"서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요."** with zero rows in any of the four target tables. | Commit **`80981f6`** — `fix: mint uuid intake ids for supabase writer`. Mirrors the existing `ListingDraftWriter.newDraftId()` pattern. The `IntakeWriter` interface gains `newSessionId()` / `newMessageId()`; the local writer keeps `isn_<16hex>` / `imsg_<16hex>`; the supabase writer returns `crypto.randomUUID()`. Service uses `writer.newSessionId()` / `writer.newMessageId()` instead of hard-coding. New 3-case regression guard (`supabaseIntakeWriter.test.ts`) asserts uuid shape + freshness. |
| 3 | After fix #2 landed, `/sell` still showed **"로컬 도우미"** because `getChatIntakeModeAction` was returning `{ mode: "local" }` and the four early-return branches all collapsed to the same response. Without diagnostic output the founder couldn't tell whether the cause was env, auth cookie, missing profile, or missing capability. The actual cause turned out to be missing/expired auth cookie scope on the dev origin (the auth session lived on a different cookie context than `/sell` saw). | Commit **`ec45d8d`** — `chore: log chat intake local fallback reason in dev`. Added `logServerWarn` calls at each of the four fallback sites emitting non-secret reason codes (`backend_mode_not_supabase` / `no_actor` / `actor_source_not_supabase` / `unsupported_actor_kind`). Guarded by `NODE_ENV !== "production"`; uses the redacting server logger, not `console.*`; response shape unchanged. The dev console reason code immediately pinpointed the no-actor branch, the founder re-logged-in on the same origin, and the smoke proceeded. |

### Environment quirk (not a code change)

- **Port 3001 vs 3000.** Local `npm run dev` opportunistically picks
  `:3001` when `:3000` is occupied. Supabase Auth's project
  redirect URLs were configured for `localhost:3000`, so a
  magic-link callback issued under `:3001` would land on the wrong
  origin and not establish a session for the next leg of the
  smoke. **For the smoke to work the founder must run dev on
  `localhost:3000`** (kill any other process on `:3000` first).
  Adding both `:3000` and `:3001` to the Supabase Auth redirect
  list works as well, but pinning `:3000` is cleaner. This is an
  ops/runbook fact, not a bug.

## 5. Current known limits

Be explicit about what this smoke does **not** prove:

- ❌ **Not production-ready.** The schema is the dev-only Phase 2
  draft, RLS is deny-by-default with no permissive policies, and
  `getBackendMode()` is hard-coded to refuse `supabase` mode in
  `NODE_ENV=production`.
- ❌ **No real payment.** `payment_provider='mock'`,
  `payment_status='not_started'`. No PG / Toss integration.
- ❌ **No deposit collection.** `safety_deposit` is a
  reference-only display number; no card authorization or hold.
- ❌ **No escrow.** No CoRent wallet exists.
- ❌ **No settlement / refund / insurance.** Money does not move.
  Regulated language is banned in copy per
  [`docs/corent_legal_trust_architecture_note.md`](../corent_legal_trust_architecture_note.md).
- ❌ **No remote handoff / return lifecycle.** Pickup, return, and
  settlement transitions exist locally for the demo dashboard but
  are not externalized to `corent-dev` server-side.
- ❌ **No `trust_events` remote table yet.** Trust scoring and
  trust-event externalization are deferred future slices; the
  current schema does not include this table.
- ❌ **No `rental_handoffs` remote table.** Handoff service runs in
  local persistence only.
- ⚠ **LLM extraction is not yet the final production experience.**
  This smoke used the existing deterministic / server intake
  extractor (`chatIntakeExtractor`), not a real LLM. The chat
  card's "베타" badge is honest about this.
- ⚠ **Location is still coarse.** `pickup_area` is bounded
  free-text (e.g. `마포`); a global-ready location model with
  structured region / locale typing is future work.
- ⚠ **Founder provisioning is manual.** Profile + capability rows
  are inserted via the human-driven SQL template per tester. No
  auto-provisioning exists or is approved.
- ⚠ **Admin cockpit is founder-run, not a full operations
  console.** The cockpit ships read panels + a single mutation
  (publish). Approve / reject / cancel / payment / lifecycle
  operations are intentionally absent.

## 6. Stop conditions NOT observed during the run

The runbook
([`docs/corent_closed_alpha_smoke_ops_checklist.md`](../corent_closed_alpha_smoke_ops_checklist.md)
§8) lists hard-stop conditions. None fired:

- [x] **No mock / server listing mix.** After fix #1, `/sell`,
      `/dashboard`, and `/search` rendered server data only when
      the probe was `server`; static `PRODUCTS` did not appear in
      `/search` results in supabase mode.
- [x] **No payment / deposit / settlement copy was activated as a
      real transaction.** Pre-payment captions ("아직 결제는
      발생하지 않아요. 요청만 전송돼요.", "결제·정산은 아직 연결되어
      있지 않아요.") rendered correctly. No 결제 완료 / 대여 확정 /
      보증금 청구 / 보험 / 보장 / 환불 / 정산 완료 string appeared.
- [x] **No cross-seller leak.** Single-founder dual-capability run;
      cross-seller isolation invariant was not exercised in this
      pass — to be re-checked on a future run with two
      seller-capable testers (recommended for the next smoke).
- [x] **No remote Supabase command was run by an agent.** Every
      migration apply, SQL execution, Auth UI action, and
      provisioning template substitution was a manual founder step
      in the Supabase Studio UI.
- [x] **SQL execution was founder / manual only.** No
      `supabase login` / `link` / `db push` / `--db-url` / MCP
      `apply_migration` / `execute_sql` invoked by any agent.
- [x] **Out-of-scope tables unchanged.** `admin_actions`,
      `admin_reviews`, `listing_versions`, `listing_secrets` row
      counts did not increase during the walk.

## 7. Next recommended work

Practical, narrow, and ranked. None of this changes the
pre-revenue posture or moves money:

1. **Update the smoke checklist with lessons from this run.**
   - Add the `:3000` port pinning instruction to
     `docs/corent_closed_alpha_smoke_ops_checklist.md` §1.5
     (Supabase Auth project settings).
   - Note that the diagnostic logger now prints a reason code on
     the local-fallback branch — interpret it before debugging
     env / cookie / capability.
2. **Improve / document auth-session / port requirements.** The
   port-3001 quirk cost real time; bake it into the runbook so the
   next tester does not lose a session over it.
3. **LLM / extractor improvement.** Replace the deterministic
   `chatIntakeExtractor` with the real LLM call once the security
   review note for that surface lands. Stay behind the existing
   `IntakeWriter` boundary so the swap is local.
4. **Coarse location / global location model v1.** Move
   `pickup_area` from free-text to a structured locale + coarse
   region pair. Slice cleanly: schema migration, validator change,
   public projection refresh — no UI overhaul.
5. **Launch copy in Korean + English.** The product direction is
   global-ready; the closed-alpha surface is Korean-only. Add
   English alongside, do not redesign the BW Swiss Grid system.
6. **Feedback / wishlist loop on the cockpit.** Bundle 2 Slice 4
   surfaces feedback rows read-only; a tiny `new` →
   `reviewed` / `archived` status workflow on the cockpit would
   close the loop without auto-routing PII anywhere.
7. **Trust / deposit responsibility copy without moving money.**
   Make the safety-deposit / trust framing more concrete in copy
   (still labeled "참고용" / reference-only) so renters understand
   the future expectation, without activating any real charge.
8. **Later: handoff / return / `trust_events` externalization.**
   Each is its own slice with its own security review. Out of
   scope until at least one of #1–#7 lands and the closed-alpha
   has produced enough validation signal to justify it.

## References

- [`docs/corent_closed_alpha_smoke_ops_checklist.md`](../corent_closed_alpha_smoke_ops_checklist.md)
  — the runbook this smoke followed.
- [`docs/corent_closed_alpha_smoke_test_plan.md`](../corent_closed_alpha_smoke_test_plan.md)
  — the posture/runbook narrative companion.
- [`docs/corent_closed_alpha_provisioning_workflow.md`](../corent_closed_alpha_provisioning_workflow.md)
  — manual founder-only provisioning rules (PR 5B).
- [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](../sql_templates/closed_alpha_profile_capabilities.sql)
  — TEMPLATE-ONLY per-tester provisioning SQL.
- Bundle posture notes:
  [Bundle 1 Part 3](../corent_validation_bundle1_part3_publication_note.md),
  [Bundle 1 Part 4](../corent_validation_bundle1_part4_renter_request_note.md),
  [Bundle 2 Slice 1](../corent_validation_bundle2_slice1_public_browse_bridge_note.md),
  [Bundle 2 Slice 2](../corent_validation_bundle2_slice2_renter_request_ui_note.md),
  [Bundle 2 Slice 3](../corent_validation_bundle2_slice3_seller_request_visibility_note.md),
  [Bundle 2 Slice 4](../corent_validation_bundle2_slice4_founder_cockpit_note.md).
- Commits referenced in §4:
  - `57cfe7a` — `fix: route sell page to server intake`
  - `80981f6` — `fix: mint uuid intake ids for supabase writer`
  - `ec45d8d` — `chore: log chat intake local fallback reason in dev`
- [`docs/agent_loop.md`](../agent_loop.md) — agent approval gates
  and the rule that no agent runs remote Supabase commands on the
  founder's behalf.
- [`docs/corent_security_gate_note.md`](../corent_security_gate_note.md)
- [`docs/corent_pre_revenue_beta_plan.md`](../corent_pre_revenue_beta_plan.md)
- [`docs/corent_legal_trust_architecture_note.md`](../corent_legal_trust_architecture_note.md)

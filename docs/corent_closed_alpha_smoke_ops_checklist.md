# Closed-alpha smoke ops — founder-run checklist

_Companion to [`docs/corent_closed_alpha_smoke_test_plan.md`](corent_closed_alpha_smoke_test_plan.md)._

This is the **executable founder-run checklist** for smoke-testing
`corent-dev`. Every command is a placeholder for the founder to
type into their own terminal or paste into the Supabase SQL
editor. **No agent (Claude Code, Codex, etc.) may run any of the
commands below on the founder's behalf** per
[`docs/agent_loop.md`](agent_loop.md) and
[`docs/corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md).

When a step says **`[FOUNDER MANUAL STEP]`**, the founder runs it.
When a step says **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**,
the SQL is copied into the Supabase Studio SQL editor for
`corent-dev` and the founder clicks Run. Agents do neither.

---

## Section 0 — Hard rules

- [ ] No agent (Claude Code, Codex, MCP) executes any command in
      this file. Every step is performed by the founder.
- [ ] No `supabase login` / `link` / `db push` / `--db-url` /
      `gen types` / MCP `apply_migration` / `execute_sql` against
      the founder's account.
- [ ] No production project may be addressed.
      `getBackendMode()` hard-fails closed in `NODE_ENV=production`.
      Smoke runs against a dev preview (Vercel Preview/Development
      scope) or a local `npm run dev` with `.env.local` pointed
      at `corent-dev`.
- [ ] [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql)
      is **TEMPLATE ONLY — DO NOT RUN AS-IS**. Copy it to a local
      working scratch file outside the repo, substitute
      placeholders, paste into the Supabase SQL editor, run.
- [ ] Out of scope for this smoke and forbidden if surfaced:
      payment, deposit, escrow, refund, settlement, payout,
      pickup/return/handoff lifecycle, claim/dispute/trust
      scoring, notifications.

---

## Section 1 — Preconditions

### 1.1 Repo state
- [ ] **`[FOUNDER MANUAL STEP]`** — confirm local SHA matches origin:
  ```sh
  git fetch origin
  git rev-parse HEAD
  git rev-parse origin/main
  # both should equal: 82459b8 (or later)
  ```
- [ ] Working tree clean: `git status -s` returns nothing.

### 1.2 Local validation (run BEFORE remote ops)
- [ ] **`[FOUNDER MANUAL STEP]`** — local validation passes end-to-end:
  ```sh
  git diff --check
  npm run lint
  bash scripts/check-server-no-console.sh
  npm test -- --run
  npm run build
  ```
  Expected: lint clean, no-console clean, **989 tests across 71 files**
  passing, build succeeds with `ƒ /admin/cockpit`, `ƒ /listings/[listingId]`
  registered as dynamic routes.

### 1.3 Supabase project
- [ ] `corent-dev` project exists in region `ap-northeast-2` (Seoul).
- [ ] Project URL recorded as `<<SUPABASE_DEV_URL>>` (you will use
      this several times below).
- [ ] **`corent-prod`** must NOT be touched in this smoke.

### 1.4 Env vars (server-only, dev scope)
Set these on the **dev** Vercel project (Development scope) **and/or**
in `.env.local` for a local-machine smoke. Never on production.

| Var | Value source | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `<<SUPABASE_DEV_URL>>` | server-only |
| `SUPABASE_SERVICE_ROLE_KEY` | dev project service-role key | **never** as `NEXT_PUBLIC_*` |
| `SUPABASE_ANON_KEY` | dev project anon key | server-only despite being browser-safe |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | `<<FOUNDER_EMAIL>>` (comma-separated, lowercased on read) | empty/missing → admin 404s |
| `CORENT_BACKEND_MODE` | `supabase` | refused in production by `getBackendMode()` |
| `ENABLE_ANALYTICS_BETA` | `true` (optional for the smoke) | default off |

- [ ] **`[FOUNDER MANUAL STEP]`** — env values set; no real secret
      values pasted into `.env.example` or any tracked file.

### 1.5 Supabase Auth project settings (Supabase Studio UI)
| Setting | Required value |
| --- | --- |
| Email provider | Enabled |
| Email confirmation / sign-up | **Disabled** (manual founder-driven account creation) |
| Site URL | `https://<<DEV_ORIGIN>>` |
| Additional redirect URLs | `https://<<DEV_ORIGIN>>/auth/callback` AND `https://<<DEV_ORIGIN>>/admin/auth/callback` |
| Session lifetime / JWT expiry | 12 hours (Phase 1 SR §3.6) |

- [ ] **`[FOUNDER MANUAL STEP]`** — both redirect URLs configured.
      Missing either redirect causes magic-link callback to fail
      and is a Stop Condition (§9).

---

## Section 2 — Migration apply plan

> ⚠ **Agents must not run any of the commands in this section.**
> The founder pastes each migration's SQL into the Supabase SQL
> editor for `corent-dev`, in the order listed, and clicks Run.

### 2.1 Files (apply IN THIS ORDER)

| # | File | Tables introduced |
| - | --- | --- |
| 1 | `supabase/migrations/20260430000000_phase1_analytics.sql` | `growth_events`, `sanitizer_rejections` (likely already applied) |
| 2 | `supabase/migrations/20260430120000_phase2_marketplace_draft.sql` | `profiles`, `seller_profiles`, `borrower_profiles`, `listings`, `listing_secrets`, `listing_versions`, `listing_verifications`, `rental_intents`, `rental_events`, `admin_reviews`, `admin_actions`; deny-by-default RLS |
| 3 | `supabase/migrations/20260502120000_phase2_intake_draft.sql` | `listing_intake_sessions`, `listing_intake_messages`, `listing_intake_extractions` |
| 4 | `supabase/migrations/20260504120000_phase2_feedback_intake.sql` | `feedback_submissions` |

- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      run each migration's SQL against `corent-dev`. Each migration
      is idempotent (`if not exists` on tables/types/triggers).

### 2.2 Verification (read-only)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      after all four migrations, confirm shape:
      ```sql
      -- Tables present
      select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in (
           'growth_events','sanitizer_rejections',
           'profiles','seller_profiles','borrower_profiles',
           'listings','listing_secrets','listing_versions',
           'listing_verifications','rental_intents','rental_events',
           'admin_reviews','admin_actions',
           'listing_intake_sessions','listing_intake_messages',
           'listing_intake_extractions',
           'feedback_submissions'
         )
       order by table_name;
      -- Expect 16 rows.

      -- RLS deny-by-default on every Phase 2 table
      select relname, relrowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and relname in (
           'profiles','seller_profiles','borrower_profiles',
           'listings','listing_secrets','listing_versions',
           'listing_verifications','rental_intents','rental_events',
           'admin_reviews','admin_actions','feedback_submissions'
         );
      -- Expect relrowsecurity = true on every row.

      -- No permissive policies on Phase 2 tables (deny-by-default holds)
      select schemaname, tablename, policyname
        from pg_policies
       where schemaname = 'public'
         and tablename in ('profiles','seller_profiles','borrower_profiles',
                           'listings','rental_intents','feedback_submissions');
      -- Expect 0 rows.
      ```

### 2.3 Out of scope
- [ ] No `listings_public` view grant to anon. (View exists but is
      not granted; service-role client is the only reader.)
- [ ] No new RLS policy added during this smoke.
- [ ] No `revoke` / `grant` changes on existing tables.

---

## Section 3 — Test account provisioning

Provision four accounts. Each account flows through:
1. Create the auth user in Supabase Studio Auth UI (Email
   confirmation OFF, password optional — magic-link path is the
   primary flow).
2. Note the resulting `auth.users.id` (uuid).
3. Substitute placeholders in a **local working scratch copy** of
   [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql).
4. Paste the substituted SQL into the Supabase SQL editor for
   `corent-dev`.

> ⚠ **Do not commit the substituted SQL.** Keep your working copy
> outside the repo or in a `.gitignore`-d scratch directory. The
> template uses `on conflict do nothing` so re-running with the
> same uuids is safe; a real auth_user_id ending up in git history
> is not.

### 3.1 Account matrix

| # | Account | profiles | seller_profiles | borrower_profiles | Allowlist | Notes |
| - | --- | --- | --- | --- | --- | --- |
| A | Founder | ✅ (block 1) | optional | optional | `FOUNDER_ADMIN_EMAIL_ALLOWLIST` ✅ | optional dual capability so the founder can self-test the renter loop |
| B | Seller-only | ✅ (block 1) | ✅ (block 2a) | — | — | smoke step 5 (chat intake → draft) |
| C | Borrower-only | ✅ (block 1) | — | ✅ (block 2b) | — | smoke step 9 (renter request) |
| D | Dual (optional) | ✅ (block 1) | ✅ (block 2c) | ✅ (block 2c) | — | cross-role bug hunting only |

### 3.2 Per-tester provisioning steps

For EACH tester (founder, seller-only, borrower-only, optional dual):

- [ ] **`[FOUNDER MANUAL STEP — Supabase Auth UI]`** — create the
      auth user. Record the returned `auth.users.id` as
      `<<AUTH_USER_ID_UUID>>`.
- [ ] **`[FOUNDER MANUAL STEP — local scratch file]`** — copy
      `docs/sql_templates/closed_alpha_profile_capabilities.sql`
      to a scratch file outside the repo. Substitute:
      - `<<AUTH_USER_ID_UUID>>` → the uuid from above
      - `<<TESTER_EMAIL>>` → the tester's contact email (≤128, must match `auth.users.email`)
      - `<<TESTER_DISPLAY_NAME>>` → ≤60 chars
      - `<<REGION_COARSE>>` → one of `seoul | busan | incheon | gyeonggi | other_metro | non_metro | unknown`
      - `<<SELLER_DISPLAY_NAME>>` → ≤60 chars (block 2a/2c)
      - `<<SELLER_TRUST_NOTE>>` → ≤240 chars, never marketing copy (block 2a/2c)
      - `<<BORROWER_DISPLAY_NAME>>` → ≤60 chars (block 2b/2c)
      - `<<BORROWER_TRUST_SIGNAL>>` → one of `verified_first | low_deposit | closest` or `null` (block 2b/2c)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      run the substituted block 1 (profiles) FIRST, then exactly
      one of block 2a / 2b / 2c. Re-runs are safe (`on conflict
      do nothing`).
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      run the §3.3 verification queries below. Confirm the
      expected `(has_seller, has_borrower)` shape for the
      account.

### 3.3 Per-tester verification (paste into SQL editor, substitute uuid)
```sql
-- Profile present
select id, email, display_name, region_coarse, created_at
  from public.profiles
 where id = '<<AUTH_USER_ID_UUID>>';

-- Capability summary
select
  p.id                                 as profile_id,
  p.display_name                       as profile_display_name,
  (sp.profile_id is not null)          as has_seller,
  (bp.profile_id is not null)          as has_borrower,
  sp.display_name                      as seller_display_name,
  bp.display_name                      as borrower_display_name
from public.profiles p
left join public.seller_profiles  sp on sp.profile_id = p.id
left join public.borrower_profiles bp on bp.profile_id = p.id
where p.id = '<<AUTH_USER_ID_UUID>>';
```

Expected:
- founder (account A): row in `profiles`, capability rows per the dual choice.
- seller-only (B): `has_seller = true`, `has_borrower = false`.
- borrower-only (C): `has_seller = false`, `has_borrower = true`.
- dual (D): both `true`.

### 3.4 Founder allowlist
- [ ] **`[FOUNDER MANUAL STEP]`** — `FOUNDER_ADMIN_EMAIL_ALLOWLIST`
      contains the founder's email (account A). Without this,
      `/admin/dashboard` and `/admin/cockpit` both 404 by design.

---

## Section 4 — Smoke path (visible loop, ~15 minutes)

Each step has an expected UI signal in §5 and a verification query
in §6.

### 4.1 Founder login
- [ ] **`[FOUNDER MANUAL — BROWSER]`** — open `https://<<DEV_ORIGIN>>/admin/login`.
- [ ] Submit the magic-link form with the founder's allowlisted email.
- [ ] Click the magic-link in the email → lands on `/admin/dashboard`.
- [ ] **`[FOUNDER MANUAL — BROWSER]`** — visit `/admin/cockpit`.
      Expected: founder cockpit renders with status counts (mostly
      zeros at this stage), four sections.

### 4.2 Seller login
- [ ] **`[FOUNDER MANUAL — BROWSER, separate window/profile]`** —
      open `https://<<DEV_ORIGIN>>/login` as the seller-only tester
      (account B).
- [ ] Submit the magic-link form. Click the magic-link.
- [ ] Land on `/`. Cookie session set.

### 4.3 Seller creates listing draft
- [ ] **`[FOUNDER MANUAL — BROWSER (as seller)]`** — visit `/sell`.
- [ ] In the chat-to-listing card, paste a Korean description of
      a sample item (e.g. mock massage gun).
- [ ] Submit. Expected: chat intake mode probe flips client to
      `server`; the assistant message returns; the draft is
      created.

### 4.4 Seller dashboard shows draft
- [ ] **`[FOUNDER MANUAL — BROWSER (as seller)]`** — visit `/dashboard`.
- [ ] Expected: listings table caption reads "서버에서 불러온 내
      리스팅이에요." The new draft row appears with status badge.

### 4.5 Founder cockpit publishes the listing
- [ ] **`[FOUNDER MANUAL — BROWSER (as founder)]`** — visit
      `/admin/cockpit`.
- [ ] Expected: under "최근 리스팅" the seller's draft appears with
      a "공개로 승인" button.
- [ ] Click "공개로 승인". Expected: button flips to
      "공개로 승인됨 — 새로고침하면 반영돼요". Re-clicking the same
      row would show "이미 공개됨" (idempotent).

### 4.6 Renter sees listing in public browse
- [ ] **`[FOUNDER MANUAL — BROWSER, separate window/profile]`** —
      open `https://<<DEV_ORIGIN>>/search` as the borrower-only
      tester (account C).
- [ ] Expected: server-projected card for the just-approved listing
      appears; **static `PRODUCTS` are NOT mixed in** (Bundle 2
      Slice 1 invariant).
- [ ] Card has a clickable detail link of the form
      `/listings/<uuid>` (Bundle 2 Slice 2 invariant).

### 4.7 Renter opens listing detail
- [ ] **`[FOUNDER MANUAL — BROWSER (as borrower)]`** — click the
      card.
- [ ] Land on `/listings/<uuid>`. Expected: sanitized DTO renders
      title / pickupArea / pricing / duration selector + explicit
      pre-payment caption "아직 결제는 발생하지 않아요. 요청만
      전송돼요."

### 4.8 Renter submits request (magic-link first if not signed in)
- [ ] **`[FOUNDER MANUAL — BROWSER (as borrower)]`** — confirm
      signed in as the borrower-only tester via `/login`.
- [ ] On `/listings/<uuid>`, select duration (1 / 3 / 7 days).
- [ ] Click "요청 보내기". Expected: success panel reads "요청이
      전송되었어요. 셀러의 응답을 기다리는 중이에요." + reference-only
      total + "아직 대여가 확정된 것은 아니에요."

### 4.9 Seller dashboard sees the incoming request
- [ ] **`[FOUNDER MANUAL — BROWSER (as seller)]`** — return to
      `/dashboard` and refresh.
- [ ] Expected: the new "서버에서 받은 대여 요청" block shows the
      incoming request with productName / borrowerDisplayName /
      durationDays / reference total / pickup area / status badge
      + caption "베타: 요청만 표시돼요. 결제·정산은 아직 연결되어
      있지 않아요." + deferred-actions caption "승인·거절·결제 단계는
      아직 준비 중이에요."
- [ ] **NO local mock pending block visible in server mode** (Slice 3
      invariant).

### 4.10 Founder cockpit sees the request and any feedback
- [ ] **`[FOUNDER MANUAL — BROWSER (as founder)]`** — refresh
      `/admin/cockpit`.
- [ ] Expected: status counts updated; "최근 대여 요청" panel shows
      the new row at status `requested`.
- [ ] (Optional) Submit a feedback note via the landing-page form
      `/` while logged out, then check `/admin/cockpit` again.
      Expected: the feedback row appears under "최근 의견 / 위시리스트"
      with the contact email shown only if it was provided.

### 4.11 Stop here
- [ ] **`[FOUNDER MANUAL STEP]`** — **do not** approve, decline,
      cancel, charge, hand off, return, or settle. None of those
      paths exist server-side. The pre-payment caption is the
      tester's signal that the loop is intentionally stopping
      here.

---

## Section 5 — Expected UI signals

| Surface | Mock-mode signal | Supabase-mode signal |
| --- | --- | --- |
| `/sell` chat intake | (none) | "서버 모드" path engaged; draft persists to `listings` table |
| `/dashboard` listings table | "이 화면의 리스팅 목록은 아직 로컬 데모예요…" (legacy) | **"서버에서 불러온 내 리스팅이에요."** caption |
| `/dashboard` requests | local `PendingBlock` + `ActiveBlock` | local blocks **hidden**; new "서버에서 받은 대여 요청" block + deferred-actions caption |
| `/search` | static `PRODUCTS` | **server-approved listings only**; static `PRODUCTS` NOT mixed in |
| browse cards | clickable to `/items/<id>` | clickable to **`/listings/<uuid>`** |
| `/listings/[uuid]` | 404 (server-only route) | sanitized public DTO + duration selector + "아직 결제는 발생하지 않아요. 요청만 전송돼요." |
| `/listings/[uuid]` after submit | (n/a) | "요청이 전송되었어요…" + "아직 대여가 확정된 것은 아니에요." |
| `/admin/dashboard` | Phase 1 analytics tiles | + Phase 2 marketplace aggregates panel (dev-only) |
| `/admin/cockpit` (mock) | calm "서버 백엔드가 아직 활성화되지 않았어요" panel | (n/a) |
| `/admin/cockpit` (supabase) | (n/a) | four sections + per-row "공개로 승인" button on non-approved listings |

### 5.1 Negative signals (must NOT appear anywhere)
- [ ] No "결제 완료" / "결제 처리" / "결제 진행"
- [ ] No "보증금 청구" / "보증금 결제"
- [ ] No "대여 확정" / "대여 완료"
- [ ] No "보험" / "보장" / "환불" / "정산 완료"
- [ ] No approve / decline / cancel / "승인하기" / "거절하기" /
      "결제하기" buttons in any server-mode block
- [ ] No PendingBlock / ActiveBlock rendered with `MOCK_RENTAL_INTENTS`
      in server mode (Slice 3 invariant)
- [ ] No static `PRODUCTS` in `/search` results in supabase mode
      (Slice 1 invariant)

---

## Section 6 — Verification queries

> All queries are **read-only**. Run via the Supabase SQL editor.

### 6.1 Listings
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  select id, seller_id, status, item_name, category, created_at
    from public.listings
   order by created_at desc
   limit 10;
  -- Expect at least one row at status='approved' for the seller
  -- (account B) you walked through §4.5.
  ```

### 6.2 The `requested` rental_intents row
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  select id, listing_id, seller_id, borrower_id,
         status, duration_days, rental_fee, borrower_total,
         payment_provider, payment_status,
         pickup_status, return_status, settlement_status,
         created_at
    from public.rental_intents
   order by created_at desc
   limit 5;
  -- Expect ONE row created during §4.8:
  --   status='requested', payment_provider='mock',
  --   payment_status='not_started', pickup_status='not_scheduled',
  --   return_status='not_due', settlement_status='not_ready'.
  -- The seller_id matches account B's profile id; borrower_id
  -- matches account C's profile id.
  ```
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  select id, rental_intent_id, from_status, to_status, actor, reason
    from public.rental_events
   order by at desc
   limit 5;
  -- Expect a single matching row: from_status=NULL, to_status='requested',
  -- actor='borrower', reason='rental_request_created'.
  ```

### 6.3 Feedback rows (if any submitted)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  select id, kind, status, item_name, category, contact_email,
         profile_id, source_page, created_at
    from public.feedback_submissions
   order by created_at desc
   limit 10;
  -- Expect rows you submitted in §4.10 (if any), with status='new'
  -- and contact_email populated only when the form provided one.
  ```

### 6.4 Out-of-scope tables MUST be empty (or unchanged)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  -- Payment / handoff / claim / trust externalization is OUT OF SCOPE
  -- for this smoke. The schema permits these tables but no UI surface
  -- writes to them in Bundle 1/2. A non-zero count means the smoke
  -- accidentally exercised an unsupported surface.
  select 'admin_actions'   as t, count(*) from public.admin_actions
   union all
  select 'admin_reviews',     count(*) from public.admin_reviews
   union all
  select 'listing_versions',  count(*) from public.listing_versions
   union all
  select 'listing_secrets',   count(*) from public.listing_secrets;
  -- Expect every row's count to be 0 unless prior unrelated work
  -- populated them. Compare with the pre-smoke baseline.
  ```
- [ ] If any of those four counts increased during the smoke walk,
      treat as a Stop Condition (§9).

### 6.5 Cross-seller isolation spot-check (only if you provisioned 2+ seller-capable testers)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  -- Seller A's rental_intents must NOT contain any row whose seller_id
  -- equals seller B's profile id.
  select count(*) as cross_seller_leak_count
    from public.rental_intents
   where seller_id = '<<SELLER_A_PROFILE_ID>>'
     and id in (
       select id from public.rental_intents where seller_id = '<<SELLER_B_PROFILE_ID>>'
     );
  -- Expect 0.
  ```

---

## Section 7 — Rollback (per-tester cleanup)

> The Phase 2 schema uses `on delete cascade` for capability rows
> (`seller_profiles`, `borrower_profiles`) and intake sessions /
> messages, but **`on delete restrict`** for `listings` and
> `rental_intents` (both `seller_id` and `listing_id` references).
> Profile deletion will fail until those referencing rows are
> removed first.

### 7.1 Capability-only rollback (most common)
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`**:
  ```sql
  -- Revoke seller capability only (keeps profile + listings)
  delete from public.seller_profiles
   where profile_id = '<<AUTH_USER_ID_UUID>>';

  -- Revoke borrower capability only
  delete from public.borrower_profiles
   where profile_id = '<<AUTH_USER_ID_UUID>>';
  ```
- [ ] After running, `requireFounderSession()` for the founder is
      unaffected (allowlist is the signal) but the seller/renter
      capability is gone — the next chat intake / request creation
      attempt fails closed at the resolver.

### 7.2 Full profile removal (rare; founder-driven)
Required pre-cleanup if `listings` or `rental_intents` exist for
the tester (the FK is `on delete restrict`):

- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      compute fan-out before any deletion:
  ```sql
  select 'listings'                    as related_table, count(*)
    from public.listings              where seller_id  = '<<AUTH_USER_ID_UUID>>'
   union all
  select 'rental_intents (seller)',     count(*)
    from public.rental_intents        where seller_id  = '<<AUTH_USER_ID_UUID>>'
   union all
  select 'rental_intents (borrower)',   count(*)
    from public.rental_intents        where borrower_id = '<<AUTH_USER_ID_UUID>>'
   union all
  select 'listing_intake_sessions',     count(*)
    from public.listing_intake_sessions where seller_id = '<<AUTH_USER_ID_UUID>>';
  ```
- [ ] **`[FOUNDER MANUAL — PASTE INTO SUPABASE SQL EDITOR]`** —
      remove referencing rows in this order (each cascade
      automatically removes its dependents):
  ```sql
  -- 1. Rental intents owned by the tester (cascades to rental_events)
  delete from public.rental_intents
   where seller_id   = '<<AUTH_USER_ID_UUID>>'
      or borrower_id = '<<AUTH_USER_ID_UUID>>';

  -- 2. Listings owned by the tester (cascades to listing_secrets,
  --    listing_versions, listing_verifications)
  delete from public.listings
   where seller_id = '<<AUTH_USER_ID_UUID>>';

  -- 3. Intake sessions owned by the tester (cascades to messages
  --    + extractions)
  delete from public.listing_intake_sessions
   where seller_id = '<<AUTH_USER_ID_UUID>>';

  -- 4. Capability rows (also cascade from profiles, but explicit
  --    removal here is fine)
  delete from public.seller_profiles
   where profile_id = '<<AUTH_USER_ID_UUID>>';
  delete from public.borrower_profiles
   where profile_id = '<<AUTH_USER_ID_UUID>>';

  -- 5. Profile row
  delete from public.profiles
   where id = '<<AUTH_USER_ID_UUID>>';

  -- 6. Optional: also remove the auth user via the Supabase
  --    Auth UI (Auth → Users → delete). The schema has no FK
  --    to auth.users; deletion is independent.
  ```

### 7.3 What NOT to drop
- [ ] **Do NOT** drop tables, types, indexes, or triggers.
- [ ] **Do NOT** alter / drop RLS or run `revoke` / `grant`.
- [ ] **Do NOT** truncate `growth_events` /
      `sanitizer_rejections` (Phase 1 analytics history is
      independent of the closed-alpha smoke).
- [ ] **Do NOT** delete `feedback_submissions` rows from the
      cockpit smoke unless they are clearly test entries; they
      are validation signal worth keeping.

### 7.4 Auth project rollback (if needed)
- [ ] Disable email auth provider in the Supabase Auth UI to
      hard-stop sign-ins. Reversible. Agents must not flip this.

---

## Section 8 — Stop conditions (abort the smoke)

If ANY of the following appears, **stop the smoke and treat as a bug**:

- [ ] Magic-link callback fails (lands on a 4xx page, never
      establishes a session). Likely cause: redirect URL not in
      Supabase Auth allowlist. Fix = §1.5.
- [ ] `/sell` chat intake card never flips to "서버 모드"
      (`chatIntakeMode` stays `local` after probe). Likely cause:
      missing/wrong `CORENT_BACKEND_MODE`, missing seller capability
      row, or env not deployed. Fix = §1.4 + §3.
- [ ] Server mode shows mock data alongside server data on any
      surface (e.g. `/dashboard` rendering both `MOCK_RENTAL_INTENTS`
      and the new server requests block). This is a Slice 3 invariant
      violation. **Stop and capture the screenshot.**
- [ ] Static `PRODUCTS` cards appear in `/search` while in supabase
      mode. This is a Slice 1 invariant violation. **Stop.**
- [ ] Any private field appears in a renter / public surface:
      `rawSellerInput`, `privateSerialNumber`, `safetyCode`,
      `humanReviewNotes`, `payment.sessionId`,
      `payment.failureReason`, `settlement.blockedReason`,
      `seller_payout`, `platformFee`. **Stop.**
- [ ] Cross-seller leakage detected by §6.5 (count > 0). **Stop.**
- [ ] `admin_actions`, `admin_reviews`, `listing_versions`, or
      `listing_secrets` row count increased during the smoke
      (§6.4). **Stop.**
- [ ] Any UI surface shows "결제 완료", "대여 확정", "보증금 청구",
      "보험", "보장", "환불", "정산 완료". **Stop.**
- [ ] An approve / decline / cancel / payment button renders inside
      the new server-mode "서버에서 받은 대여 요청" block. This is
      a Slice 3 read-only invariant violation. **Stop.**
- [ ] `/admin/cockpit` returns anything other than 404 for a
      non-allowlisted user. This is a Bundle 2 Slice 4 founder-gate
      invariant. **Stop.**
- [ ] An agent ran a remote Supabase command at any point during
      the smoke walk. Per [`docs/agent_loop.md`](agent_loop.md)
      this is a hard violation; **stop and audit.**

---

## Section 9 — Completion checklist

Tick every box BEFORE declaring the closed-alpha smoke done.

- [ ] §1 preconditions complete (repo SHA matches, local validation
      green, env vars set, Supabase Auth redirects configured).
- [ ] §2 four migrations applied to `corent-dev`. RLS / table
      shape verified.
- [ ] §3 four test accounts provisioned. Capability shape verified
      per tester.
- [ ] §4 ten-step smoke path walked end to end without surprises.
- [ ] §5 expected UI signals all matched; negative signals all
      absent.
- [ ] §6 verification queries pass: requested rental_intents row
      shape correct; rental_events row correct; feedback rows
      correct; out-of-scope tables unchanged; cross-seller
      isolation holds.
- [ ] §7 rollback snippets are at hand if cleanup is needed; no
      cleanup performed mid-smoke unless truly required.
- [ ] §8 zero Stop Conditions encountered.
- [ ] No agent ran any remote Supabase command at any point in the
      smoke.
- [ ] No SQL template was auto-run; every founder-side SQL was a
      deliberate paste into the Supabase SQL editor with
      placeholders substituted in a local scratch file.

---

## References

- [`docs/corent_closed_alpha_smoke_test_plan.md`](corent_closed_alpha_smoke_test_plan.md)
  (companion runbook, posture-style)
- [`docs/corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md)
  (PR 5B — provisioning rules)
- [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql)
  (the per-tester template — TEMPLATE ONLY)
- [`docs/env_vars_phase1.md`](env_vars_phase1.md)
- [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
- [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
- [`docs/agent_loop.md`](agent_loop.md)
- Bundle posture notes:
  - [`docs/corent_validation_bundle1_part3_publication_note.md`](corent_validation_bundle1_part3_publication_note.md)
  - [`docs/corent_validation_bundle1_part4_renter_request_note.md`](corent_validation_bundle1_part4_renter_request_note.md)
  - [`docs/corent_validation_bundle2_slice1_public_browse_bridge_note.md`](corent_validation_bundle2_slice1_public_browse_bridge_note.md)
  - [`docs/corent_validation_bundle2_slice2_renter_request_ui_note.md`](corent_validation_bundle2_slice2_renter_request_ui_note.md)
  - [`docs/corent_validation_bundle2_slice3_seller_request_visibility_note.md`](corent_validation_bundle2_slice3_seller_request_visibility_note.md)
  - [`docs/corent_validation_bundle2_slice4_founder_cockpit_note.md`](corent_validation_bundle2_slice4_founder_cockpit_note.md)

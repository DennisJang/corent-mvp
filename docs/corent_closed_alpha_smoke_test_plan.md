# Closed-alpha smoke test plan

_Companion to Bundle 2, Slice 3 (`db: add seller request visibility`)._

This is the **founder-only** runbook for exercising the closed-alpha
visible loop end-to-end against `corent-dev`. Every step in the
"prerequisites" and "execute" sections is performed by the founder
on the founder's own machine, with explicit intent. Agents (Claude
Code, Codex, etc.) **must not** run any of these commands without an
explicit, separate ops approval per
[`docs/agent_loop.md`](agent_loop.md).

## 0. Hard rules

- **No remote Supabase command runs from an agent.** No
  `supabase login`, `supabase link`, `supabase db push`,
  `supabase gen types`, `--db-url`, MCP `apply_migration`,
  MCP `execute_sql`, or any other operation that touches the
  founder's `corent-dev` project. Per
  [`docs/corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md)
  §"Provisioning rules" — every remote step is explicitly
  founder-driven.
- **No production project may be addressed.** `getBackendMode()`
  hard-fails closed in `NODE_ENV=production` and refuses to
  return `"supabase"` even when the env says so
  ([`src/server/backend/mode.ts`](../src/server/backend/mode.ts)).
  The smoke runs against a Vercel **dev/preview** deployment or a
  local `pnpm dev` against the dev project only.
- **The closed-alpha SQL template is documentation, not a seed.**
  [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql)
  is marked `TEMPLATE ONLY — DO NOT RUN AS-IS`. The founder
  substitutes placeholders and pastes the result into the Supabase
  SQL editor for `corent-dev` per-tester. Auto-run is forbidden
  by both the workflow doc and the path layout (template lives
  outside any path the Supabase CLI scans).
- **No payment / deposit / escrow / refund / settlement / lifecycle
  / handoff / claim / trust scoring / notification work is in
  scope** for this smoke. The visible loop stops at "seller sees
  the request"; the dashboard's pre-payment caption makes this
  explicit to the tester.

## 1. Intended smoke path (visible loop)

The closed-alpha tester walks through this sequence. Total time
budget: ~10–15 minutes for a clean run.

| # | Surface | Action | Expected |
| - | --- | --- | --- |
| 1 | `/login` | Founder enters their allowlisted email; submits magic-link form | "요청이 접수되었습니다" generic response. Magic-link email arrives. |
| 2 | Magic-link callback | Founder clicks the email link | Redirect lands on `/`. Cookie session is set. |
| 3 | `/sell` | Seller-tester (provisioned with a `seller_profiles` row) signs in via the same `/login` page; opens the chat-to-listing card | Chat intake mode probe flips client to `server`. The dashboard's listings table caption reads "서버에서 불러온 내 리스팅이에요." |
| 4 | `/sell` (chat) | Seller pastes a Korean description of an item | Chat intake creates a `listings` row at `status='draft'` and a `listing_verifications` row. The listings table updates. |
| 5 | `/dashboard` | Seller refreshes | Server draft appears in the listings table. |
| 6 | Founder publishes the listing | Founder calls `publishListingAction({ listingId })` (no UI in Bundle 1 Part 3 — invoke via a temporary handler / internal route under the founder gate) | Row flips to `status='approved'`. |
| 7 | `/search` | Public visitor (or the renter-tester) browses | Server-projected card appears with `detailHref="/listings/<uuid>"`. Static `PRODUCTS` are NOT shown in supabase mode. |
| 8 | `/listings/<uuid>` | Renter-tester opens the listing | Sanitized DTO renders title / pickupArea / pricing / duration selector / pre-payment caption. |
| 9 | `/listings/<uuid>` | Renter selects duration, clicks "요청 보내기" | `createRentalRequestAction` writes the row. UI shows "요청이 전송되었어요" + reference-only amounts. |
| 10 | `/dashboard` (seller) | Seller refreshes | The new `ServerRequestsBlock` shows the incoming request: product name, borrower display name, duration, reference total, pickup area, status badge. The deferred-actions caption is visible. |

Stopping points by design:

- After step 10 the loop is complete. **Do not** attempt to
  approve, reject, charge, hand off, return, or settle — none of
  those paths exist server-side. The pre-payment caption tells
  the tester this explicitly.
- If the founder publish step (#6) is performed by hand against
  `corent-dev`, double-check the row flipped via the SQL editor
  (`SELECT id, status FROM public.listings WHERE id = '<uuid>';`)
  before continuing.

## 2. Remote `corent-dev` prerequisites

These are performed once by the founder, before testers exercise
the loop. Re-running is safe (every insert uses `on conflict do
nothing` per the provisioning template).

### 2.1 Migrations

Apply against `corent-dev` only, in order:

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260430000000_phase1_analytics.sql` | Analytics — likely already applied. |
| `supabase/migrations/20260430120000_phase2_marketplace_draft.sql` | profiles, seller_profiles, borrower_profiles, listings, listing_secrets, listing_versions, listing_verifications, rental_intents, rental_events, admin_reviews, admin_actions; deny-by-default RLS. |
| `supabase/migrations/20260502120000_phase2_intake_draft.sql` | Chat intake. |
| `supabase/migrations/20260504120000_phase2_feedback_intake.sql` | Feedback intake. |

The founder applies these via the Supabase SQL editor or
`psql --single-transaction` against the `corent-dev` connection.
**Agents must not run any of the apply commands.**

### 2.2 Env vars (server-only, dev project only)

Set on the dev Vercel project (Development scope) or in `.env.local`
for a local smoke. Per [`docs/env_vars_phase1.md`](env_vars_phase1.md)
and the security review:

| Var | Required for | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | service-role client + SSR auth | dev project URL only |
| `SUPABASE_SERVICE_ROLE_KEY` | marketplace repo + analytics writer | **never** as `NEXT_PUBLIC_*`; never in browser bundle |
| `SUPABASE_ANON_KEY` | SSR auth client (`@supabase/ssr`) | server-only despite being browser-safe in principle |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | admin gate + `publishListingAction` | comma-separated, founder email(s) only |
| `CORENT_BACKEND_MODE` | flips runtime to `supabase` | refused in production by `getBackendMode()` |
| `ENABLE_ANALYTICS_BETA` | optional Phase 1 analytics writes | `"true"` to enable; default off |

`NEXT_PUBLIC_*` env vars are constrained by the deny-list regex
`(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)` —
enforced by `src/server/admin/import-boundary.test.ts`.

### 2.3 Supabase Auth project settings

Set in the Supabase Auth UI for `corent-dev` (these are NOT app
env vars):

| Setting | Required value |
| --- | --- |
| Email auth provider | Enabled |
| Email confirmation / sign-up | Disabled (manual founder-driven account creation) |
| Site URL | The dev origin |
| Additional redirect URLs | `https://<dev-origin>/auth/callback` AND `https://<dev-origin>/admin/auth/callback` |
| Session lifetime / JWT expiry | 12 hours per Phase 1 security review §3.6 |

### 2.4 Founder allowlist

`FOUNDER_ADMIN_EMAIL_ALLOWLIST` must contain the founder's email
(lowercased on read). Without it, every admin request 404s and
`publishListingAction` returns `unauthenticated` — by design.

### 2.5 Test account provisioning

For a minimum-viable closed-alpha smoke, provision four accounts:

| Account | Role | Provisioning |
| --- | --- | --- |
| Founder | admin allowlist + dual-capability | Sign up via Supabase Auth UI (Email confirmation disabled). Add email to `FOUNDER_ADMIN_EMAIL_ALLOWLIST`. Optionally insert `seller_profiles` + `borrower_profiles` rows so the founder can self-test the renter loop. |
| Seller-only tester | `seller_profiles` row only | Sign up via Supabase Auth UI. Run the seller-only block of [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql) with placeholders substituted. |
| Borrower-only tester | `borrower_profiles` row only | Same flow with the borrower-only block. |
| Dual-capability tester | both rows | Same flow with the dual block. Useful for cross-role bug hunting. |

The provisioning template uses `on conflict do nothing` for every
insert, so re-running is safe. Verify with:

```sql
SELECT id FROM public.profiles WHERE id = '<auth_user_id>';
SELECT profile_id FROM public.seller_profiles WHERE profile_id = '<auth_user_id>';
SELECT profile_id FROM public.borrower_profiles WHERE profile_id = '<auth_user_id>';
```

## 3. Privacy / scope checks during the smoke

While walking the loop, verify these invariants by direct DB
inspection (founder-only, via Supabase SQL editor):

| Invariant | Verification |
| --- | --- |
| No payment, claim, trust, handoff, or notification rows | `SELECT count(*) FROM public.admin_actions;` and `SELECT count(*) FROM public.rental_events WHERE actor != 'borrower' OR to_status != 'requested';` should both stay near zero across the loop. The only `rental_events` row added is the initial `from=null → to=requested`. |
| Listing private fields untouched | `SELECT count(*) FROM public.listing_secrets;` does not change during the loop (no inserts from `publishListingAction` / `createRentalRequestAction`). |
| Cross-seller isolation | Provision a second seller-only tester with their own listing; confirm Tester A's dashboard does NOT show Tester B's rental_intents, even though both flow through the same service-role client. |
| No remote schema drift | Every column referenced by the runtime should be exactly the schema in `supabase/migrations/20260430120000_phase2_marketplace_draft.sql`. The smoke does not add, alter, or drop columns. |

## 4. What must NOT be tested yet

The following surfaces are **out of scope** for this smoke. If the
tester encounters any of them in the UI, that is a bug — they
should NOT be exercised:

- **Payment** — no Toss / PG / live card capture; no
  `mockPaymentAdapter` end-to-end via the server path.
- **Deposit collection / hold / release** — no real authorization.
- **Escrow / refund / settlement / payout** — no money movement.
- **Pickup / return / handoff lifecycle** — no `paid →
  pickup_confirmed → return_pending → return_confirmed`
  transitions on server-side rentals. (Local-mode dashboard's
  existing approve / decline / handoff buttons remain LOCAL — they
  are hidden in server mode by Bundle 2 Slice 3's mode gate.)
- **Claim / dispute / trust scoring** — `admin_reviews`,
  `admin_actions`, `claim_reviews`, `trust_events` are
  schema-present but not externalized in any UI surface.
- **Notifications** — no email / SMS / push channel exists.
- **Production traffic** — `CORENT_BACKEND_MODE=supabase` is
  refused in production by `getBackendMode()`.

## 5. Rollback

### 5.1 Per-tester rollback

Use the snippets at the bottom of
[`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql):

```sql
DELETE FROM public.seller_profiles WHERE profile_id = '<auth_user_id>';
DELETE FROM public.borrower_profiles WHERE profile_id = '<auth_user_id>';
DELETE FROM public.profiles WHERE id = '<auth_user_id>';
```

`ON DELETE CASCADE` removes intake sessions / messages, listings,
listing_verifications, listing_secrets, listing_versions, and
rental_intents owned by that profile. The provisioning template
also includes a SELECT block for verifying fan-out before
deletion.

### 5.2 Schema rollback

Schema rollback for the Phase 2 tables would require a follow-up
`DROP` migration. **Not in scope today.** Closed-alpha schema is
acceptable to leave in place because every table has RLS deny-by-
default and is unreadable by `anon` / `authenticated` roles
(`REVOKE ALL` is in the parent migration).

### 5.3 Auth project rollback

If the smoke needs to be torn down completely, the founder may
disable the email auth provider in the Supabase Auth UI. This is
reversible per founder discretion. Agents must not flip this.

## 6. Smoke completion checklist

- [ ] All four migrations applied to `corent-dev`.
- [ ] All five env vars set on the dev project.
- [ ] Supabase Auth Site URL + redirect URLs configured.
- [ ] `FOUNDER_ADMIN_EMAIL_ALLOWLIST` contains founder email.
- [ ] Four test accounts provisioned (founder, seller-only,
      borrower-only, dual).
- [ ] Walk steps 1–10 of §1; each step matches the expected
      result.
- [ ] Direct-DB privacy checks (§3) pass: no payment / claim /
      trust / handoff / notification rows; no `listing_secrets`
      writes; cross-seller isolation holds.
- [ ] No agent ran a remote Supabase command at any point.
- [ ] No SQL template auto-ran; every founder-side SQL was a
      deliberate paste into the Supabase SQL editor with
      placeholders substituted.
- [ ] Per-tester rollback snippets are at hand if the smoke
      needs to be torn down.

## 7. Known limitations (documented, expected)

- The **founder publish UI is not yet implemented** —
  `publishListingAction` is callable today only via a temporary
  founder-only handler or `curl`. Future slice will add a
  one-button affordance under `/admin/dashboard`.
- The **storefront page** (`/sellers/[sellerId]`) is statically
  generated and currently does NOT show server-approved
  listings. Bundle 2 Slice 1 deferred this. The visible loop
  still works through `/search` → `/listings/[uuid]`.
- **Seller approve / reject** is intentionally not implemented in
  Slice 3. The dashboard's `ServerRequestsBlock` is read-only;
  the deferred-actions caption surfaces this to the tester.
- The **renter request UI's seller display name** echoes the
  seller's UUID when no `seller_profiles.display_name` is set
  (the projection mapper falls back to the seller id). A future
  slice can resolve seller display names properly via a
  `seller_profiles` join.

## References

- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B —
  founder-controlled provisioning)
- `docs/sql_templates/closed_alpha_profile_capabilities.sql`
  (per-tester provisioning template — TEMPLATE ONLY)
- `docs/corent_validation_bundle1_part3_publication_note.md`
  (Bundle 1 Part 3 — publication action)
- `docs/corent_validation_bundle1_part4_renter_request_note.md`
  (Bundle 1 Part 4 — request creation)
- `docs/corent_validation_bundle2_slice1_public_browse_bridge_note.md`
  (Slice 1 — public browse bridge)
- `docs/corent_validation_bundle2_slice2_renter_request_ui_note.md`
  (Slice 2 — renter request UI)
- `docs/corent_validation_bundle2_slice3_seller_request_visibility_note.md`
  (Slice 3 — seller request visibility, this slice's companion)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`
- `docs/agent_loop.md` (approval gates)
- `docs/env_vars_phase1.md`

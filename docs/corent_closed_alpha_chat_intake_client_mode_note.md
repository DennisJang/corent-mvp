# Closed-alpha chat intake client mode note (Slice A PR 5F)

PR 5F adds the **first controlled visible bridge** between the
visible browser chat intake card and the server-backed chat
intake path. The bridge is intentionally narrow: a single
server-side probe decides at mount whether the card's subsequent
calls go to the local same-browser demo or to the server actions.
Local demo behavior is the default; nothing about the visible UI
flips for users without a supabase-authenticated, founder-
provisioned seller session.

## Shape of the change

PR 5F replaces the static `SHARED_SERVER_MODE = false` constant
in `src/lib/client/chatIntakeClient.ts` with three things:

1. A new server action **probe** at
   [`src/server/intake/getChatIntakeMode.ts`](../src/server/intake/getChatIntakeMode.ts):

   ```ts
   export type ChatIntakeModeResult =
     | { mode: "local" }
     | { mode: "server"; capability: "seller" | "renter" };
   ```

   Read-only, server-only, no PII in the response. Decision tree:

   | `getBackendMode()` | resolver result | response |
   | --- | --- | --- |
   | not `"supabase"` | (not consulted) | `{ mode: "local" }` |
   | `"supabase"` | `null` (no auth, no profile, no capability) | `{ mode: "local" }` |
   | `"supabase"` | mock-sourced actor (defense in depth) | `{ mode: "local" }` |
   | `"supabase"` | admin actor | `{ mode: "local" }` |
   | `"supabase"` | supabase-sourced seller actor | `{ mode: "server", capability: "seller" }` |
   | `"supabase"` | supabase-sourced renter actor (borrower-only profile under `prefer: "seller"`) | `{ mode: "server", capability: "renter" }` |

2. A probe-driven **`activeMode`** in
   [`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts).
   Defaults to `"local"`. Single-flight `probeChatIntakeMode()`
   call sets it once. Subsequent calls return the cached result.
   Test seam `_resetChatIntakeModeForTests()` exists.

3. A reactive **transparency surface** in
   [`src/components/ChatToListingIntakeCard.tsx`](../src/components/ChatToListingIntakeCard.tsx)
   and [`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx):

   - Card badge: `로컬 도우미` (dashed border) in local mode;
     `서버 연결됨 · 베타` (solid outline) in server mode.
   - Card preflight: when `mode === "server"` and
     `capability === "renter"`, the card renders the line
     "이 계정은 빌리는 사람 권한만 있어요. 셀러 권한이 필요해요."
     and disables both the submit and the create-draft buttons.
   - Card success toast: "리스팅 초안을 서버에 저장했어요. 공개 전 사람 검수가 필요해요." in server mode (vs the existing local copy).
   - Card failure toast: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." for `internal` errors in server mode (the "서버에" prefix tells the user the request hit the server and did not silently save locally).
   - Dashboard listings disclaimer: when chat intake mode flips
     to server, the dashboard renders the calm caption-sized
     line "이 화면의 리스팅 목록은 아직 로컬 데모예요. 서버에 저장한 초안은 다음 단계에서 보여 드려요." above the listings table. The listings table itself is **not** externalized in PR 5F.

## No silent fallback

The single most important PR 5F invariant: **once the probe has
returned `mode: "server"`, no client-side fallback to localStorage
exists.** A typed failure or thrown server action surfaces a typed
`IntentResult` envelope; the user sees a Korean toast that
explicitly says the server attempt failed. The local
`chatListingIntakeService` is **not** called as a backup.

The one acceptable fallback semantic is the **probe failure**
itself: if `getChatIntakeModeAction()` throws (e.g., network
down at page load), the adapter stays in `"local"` mode. This
applies BEFORE any data is written, which is why it is safe.
After a successful probe + a server-action failure, the user is
told and nothing is saved.

This is enforced by tests in
[`src/lib/client/chatIntakeClient.test.ts`](../src/lib/client/chatIntakeClient.test.ts)
that pre-arm a typed failure / throw and assert the local
persistence remains empty.

## What PR 5F does NOT do

| Concern | Status |
| --- | --- |
| Externalize the seller dashboard listings table read path | **Not done.** Tracked as PR 5G or later. The dashboard renders a calm disclaimer when chat intake is in server mode so the seller knows the listings table is still local. |
| Add a `NEXT_PUBLIC_*` mode env var | **Not added.** The mode decision lives entirely server-side. |
| Add a `?mode=server` query string opt-in | **Not added.** |
| Add a client-minted mode cookie | **Not added.** |
| Auto-fall-back to local on server failure | **Forbidden.** The user sees the typed error; nothing is saved locally. |
| Public listing publication | **None.** Server-mode drafts stay at `status='draft'`; the public projection still requires `'approved'`. |
| RLS policy changes | **None.** Deny-by-default RLS continues. |
| Schema migrations | **None.** |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Closed-alpha provisioning stays manual (PR 5B). |
| Remote `corent-dev` apply | **Not run.** |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** PR 5F uses only existing `Badge` variants (`outline` for server, `dashed` for local) and existing utility classes. |
| Rental lifecycle, handoff, claim, trust events, notifications, admin actions, payment, deposit, escrow, refund, settlement, checkout | **None.** |

## Failure-mode behavior the user actually sees

| Scenario | What the card / dashboard renders |
| --- | --- |
| Default (mock backend, or supabase backend without seller capability) | Card badge `로컬 도우미`; existing local toast copy on success / failure; no dashboard disclaimer. |
| supabase backend + supabase seller actor | Card badge `서버 연결됨 · 베타`; submit + draft buttons enabled; success toast says "서버에 저장했어요"; dashboard renders disclaimer above listings table. |
| supabase backend + supabase renter actor (borrower-only profile) | Card badge `서버 연결됨 · 베타`; preflight line + disabled submit / draft button; user cannot submit. |
| Server-mode network failure (after a successful probe) | Card badge stays `서버 연결됨 · 베타`; failure toast says "서버에 연결하지 못했어요"; local persistence is **not** written. |
| Probe failure at page load | Card stays in `로컬 도우미` mode (the one acceptable fallback semantic); local demo continues normally. |

## What lands next

PR 5F completes the chat intake server-backed surface. The next
slice (PR 5G or later) externalizes the **seller dashboard
listings table read path** so a server-backed draft becomes
visible in "내 리스팅". After that, the chat intake →
listings round-trip is fully visible in server mode and PR 5F's
calm disclaimer can be removed (or re-targeted at a different
surface).

Out of scope for PR 5G: rental lifecycle, payment, handoff,
claim, trust, notifications, admin actions. Those each need
their own externalization slices and security-review sign-offs
per [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
and the pre-revenue beta plan.

## References

- `src/server/intake/getChatIntakeMode.ts` (probe action)
- `src/server/intake/getChatIntakeMode.test.ts`
- `src/lib/client/chatIntakeClient.ts` (`probeChatIntakeMode`,
  `activeMode`, per-mode dispatch, no-fallback policy)
- `src/lib/client/chatIntakeClient.test.ts` (single-flight cache,
  local-by-default, server-mode dispatch, no silent fallback)
- `src/components/ChatToListingIntakeCard.tsx` (reactive badge,
  renter preflight, mode-aware toasts)
- `src/components/SellerDashboard.tsx` (server-mode listings
  disclaimer; listings table read path unchanged)
- `src/server/admin/import-boundary.test.ts` (PR 5F boundary
  additions: default `activeMode`, no `@/server/backend/mode`
  import in client adapter, transparency copy present)
- `src/server/actors/closed-alpha-provisioning-docs.test.ts`
  (the PR 5B "runtime flip not flipped" assertion now matches
  the durable phrasing introduced by PR 5F)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B)
- `docs/corent_closed_alpha_user_auth_note.md` (PR 5C)
- `docs/corent_closed_alpha_intake_dispatch_smoke_note.md` (PR 5D)
- `docs/corent_closed_alpha_listing_draft_externalization_note.md` (PR 5E)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5
  prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_ux_system_v1.md` §"Beta honesty"

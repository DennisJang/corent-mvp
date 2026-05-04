# Closed-alpha dashboard listings externalization note (Slice A PR 5G)

PR 5G externalizes the **seller dashboard listings table read
path** so a server-backed listing draft created via chat intake
becomes visible in the seller's own surface. PR 5F's "이 화면의
리스팅 목록은 아직 로컬 데모예요…" disclaimer is removed and
replaced with two transparency captions tied to the actual server
read result.

This is the last bit of the chat-intake → listings round-trip
that was held over from PR 5F. After PR 5G the closed-alpha
seller can submit a chat draft in server mode and see the same
draft on the dashboard, all without local-mode fallback.

## Shape of the change

PR 5G adds three pieces:

1. A new server-only repository function in
   [`src/server/persistence/supabase/listingRepository.ts`](../src/server/persistence/supabase/listingRepository.ts):

   ```ts
   listListingsBySeller(sellerId: string, limit = 100): Promise<ListingIntent[]>
   ```

   - Validates the seller id as a uuid; returns `[]` on a
     malformed value or when the marketplace client is
     unavailable.
   - Filters by `seller_id` only; **no `status` filter** because
     the seller dashboard must see drafts, in-flight statuses,
     and rejected rows. Public projection still goes through
     [`publicListingService`](../src/lib/services/publicListingService.ts)
     and continues to require `status='approved'`.
   - Joins `listing_verifications` like the existing reads. Does
     **not** join `listing_secrets`; the existing
     `mapRowToIntent` mapper sets `privateSerialNumber` to
     `undefined`.
   - Bounded by `limit` (clamped to `[1, 200]`).

   Re-exported from
   [`src/server/persistence/supabase/index.ts`](../src/server/persistence/supabase/index.ts).

2. A new server action at
   [`src/server/listings/listSellerOwnedListings.ts`](../src/server/listings/listSellerOwnedListings.ts):

   ```ts
   export type SellerOwnedListingsResult =
     | { mode: "local" }
     | { mode: "server"; listings: SellerDashboardListing[] };

   export async function listSellerOwnedListingsAction()
     : Promise<IntentResult<SellerOwnedListingsResult>>;
   ```

   Decision tree (mirrors PR 5F's chat intake mode probe):

   | `getBackendMode()` | actor | response |
   | --- | --- | --- |
   | not `"supabase"` | (any) | `intentOk({ mode: "local" })` |
   | `"supabase"` | `null` | `intentErr("unauthenticated", …)` (via runner) |
   | `"supabase"` | mock-sourced (defense in depth) | `intentOk({ mode: "local" })` |
   | `"supabase"` | renter actor under `prefer: "seller"` | `intentErr("ownership", …)` |
   | `"supabase"` | supabase seller actor | `intentOk({ mode: "server", listings })` |

   Hard rules:

   - The payload is empty. The seller id is **never** read from
     the client. The runtime ignores any `sellerId` /
     `profileId` / `role` / `capability` field a forged caller
     attaches; the handler only reads `actor.sellerId`.
   - The DTO (`SellerDashboardListing`) is a tight allowlist of
     dashboard-rendered fields: `id`, `itemName`, `status`,
     `category`, `prices`, `createdAt`, `updatedAt`. It does
     **not** carry `rawSellerInput`, `verification.*`,
     `privateSerialNumber`, `humanReviewNotes`, internal review
     metadata, or any extraction internals.
   - DB throws map to `intentErr("internal", "list_seller_listings_failed")`
     via the runner; no table names, env values, SQL, row
     payloads, or service-role hints reach the client.

3. A client adapter at
   [`src/lib/client/sellerDashboardListingsClient.ts`](../src/lib/client/sellerDashboardListingsClient.ts):

   ```ts
   export type SellerOwnedListingsLoadResult =
     | { kind: "local" }
     | { kind: "server"; listings: SellerDashboardListing[] }
     | { kind: "error" };

   export async function loadSellerOwnedListings()
     : Promise<SellerOwnedListingsLoadResult>;
   ```

   The adapter normalizes the typed `IntentResult` into a tight
   three-state shape the component branches on directly. The
   component never inspects `IntentErrorCode` strings — every
   failure renders the same caption.

The component
[`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx)
uses the existing PR 5F `chatIntakeMode` signal to drive the
listings render block:

- `chatIntakeMode === "local"`: existing behavior — render local
  `listings` + the static `LISTED_ITEMS` fixture.
- `chatIntakeMode === "server"`: render only the server DTO list.
  The static `LISTED_ITEMS` and the local `listings` array are
  hidden. The PR 5F disclaimer is replaced with
  "서버에서 불러온 내 리스팅이에요."
- Server mode + read failure: render
  "서버 리스팅을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."
  and **no** rows. localStorage is **not** consulted as a
  backup.

## No silent fallback

The most important PR 5G invariant: **once the dashboard is in
server mode, no client-side fallback to local listings exists.**
A typed action failure or thrown server action surfaces a
`kind: "error"` envelope; the dashboard renders the failure
caption; the local `listings` array and the `LISTED_ITEMS`
fixture are NOT mixed in.

The static-text guard in
[`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts)
asserts the adapter does not import `getPersistence` / the local
`listingService` / the persistence adapters, so a future edit
cannot quietly re-introduce a fallback.

The pre-write probe-failure fallback is not relevant here: PR 5G
reuses the PR 5F probe outcome already plumbed via
`onModeChange`. If the probe stays in `local` (the one
acceptable PR 5F fallback semantic), the dashboard never even
calls the action.

## Privacy and public projection posture

| Concern | Status |
| --- | --- |
| Public listing publication | **Not added.** Drafts stay at `status='draft'`; `publicListingService` continues to require `'approved'`. PR 5G does not modify the projection layer. |
| `rawSellerInput` exposure | **Not exposed.** The DTO does not carry it. Repo mapper still returns it for server-side consumers, but the action's projection step strips it. |
| `privateSerialNumber` exposure | **Not exposed.** Mapper sets `undefined`; DTO does not carry it; `listing_secrets` is not joined. |
| `verification.*` / human review notes | **Not exposed.** DTO has no verification slot. |
| Cross-seller leakage | **Filtered server-side.** Repo `WHERE seller_id = $1` plus action handler that only reads `actor.sellerId`. Forged client payloads ignored. |
| RLS policies | **Unchanged.** Deny-by-default; the service-role client bypasses RLS. |

## What PR 5G does NOT do

| Concern | Status |
| --- | --- |
| Public listing publication | **Not added.** |
| Renter-facing DB browse | **Not added.** Renter surfaces continue to read static `PRODUCTS`. |
| RLS policy changes | **None.** |
| Schema migrations | **None.** |
| Remote `corent-dev` apply / seed | **Not run.** |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Manual provisioning per PR 5B. |
| Edits to server-backed listings via dashboard | **Not added.** A server-side `updateOwnListingDraft` analog is a later slice. |
| `listing_secrets` reads or writes | **None.** |
| Rental lifecycle, handoff, claim, trust events, notifications, admin actions, payment, deposit, escrow, refund, settlement, checkout | **None.** |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** PR 5G uses only existing utility classes and the existing dashed-border caption treatment. |
| Static `LISTED_ITEMS` removal | **Not removed.** Local-mode dashboards continue to show the demo fixture. |

## Failure-mode behavior the user actually sees

| Scenario | What the dashboard renders |
| --- | --- |
| Default (mock backend, or supabase backend without seller capability) | Existing behavior. Local listings + static `LISTED_ITEMS`. No transparency caption. |
| supabase backend + supabase seller actor | "서버에서 불러온 내 리스팅이에요." caption above the table; rows = server DTO only; static `LISTED_ITEMS` hidden. |
| supabase backend + supabase seller actor + zero rows | Same caption; "아직 서버에 저장된 리스팅이 없어요." note under the table. |
| Server mode + action failure | "서버 리스팅을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." caption; zero rows; **no** local fallback. |
| Probe failure at page load | Dashboard stays in local mode (existing PR 5F semantics); the listings table renders local rows + `LISTED_ITEMS`. |

## What lands next

PR 5G completes the chat-intake → listings round-trip in
server mode. The next slice is, in priority order:

1. **Public listing publication path** (sanitized projection +
   approval workflow + a security-review note before any
   `listings_public` grant). Approval gate + privacy contract
   already live in
   [`src/lib/services/publicListingService.ts`](../src/lib/services/publicListingService.ts);
   what is missing is the admin-side approval action and the
   conditional renter-facing DB browse.

2. **Carefully scoped follow-up** to PR 5G if needed —
   server-side `updateOwnListingDraft` analog so the seller can
   edit a server-backed draft from the dashboard. Today the
   `/sell` route + `listingService.updateOwnListingDraft` write
   to local persistence; in server mode the dashboard surfaces
   the row but cannot edit it.

Out of scope for the next slice regardless of which one lands:
rental lifecycle, handoff, claim, trust events, notifications,
admin actions, payment / deposit / escrow / refund / settlement,
checkout. Each requires its own externalization slice and
security-review sign-off per
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
and the pre-revenue beta plan.

## References

- `src/server/persistence/supabase/listingRepository.ts`
  (`listListingsBySeller`)
- `src/server/persistence/supabase/listingRepository.test.ts`
  (PR 5G repo tests)
- `src/server/listings/listSellerOwnedListings.ts` (server action)
- `src/server/listings/listSellerOwnedListings.test.ts`
- `src/lib/client/sellerDashboardListingsClient.ts` (client adapter)
- `src/components/SellerDashboard.tsx` (mode-gated render block;
  PR 5F disclaimer replaced with PR 5G captions)
- `src/server/admin/import-boundary.test.ts` (PR 5G transparency
  + boundary guards)
- `src/lib/services/publicListingService.ts` (privacy contract;
  unchanged — drafts still filtered out)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B)
- `docs/corent_closed_alpha_user_auth_note.md` (PR 5C)
- `docs/corent_closed_alpha_intake_dispatch_smoke_note.md` (PR 5D)
- `docs/corent_closed_alpha_listing_draft_externalization_note.md` (PR 5E)
- `docs/corent_closed_alpha_chat_intake_client_mode_note.md` (PR 5F)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5 prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`

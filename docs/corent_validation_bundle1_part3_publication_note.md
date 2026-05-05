# Validation Bundle 1, Part 3 — public listing publication path

Part 3 adds the smallest safe path for a founder/admin to **publish**
a server-owned listing draft into public availability. Drafts stay
private by default; the public listing projection remains
allowlist-only and continues to filter to `status='approved'`. This
is **not** the renter request DB path, **not** payment, and **not**
full marketplace launch.

## Shape of the change

Part 3 adds three pieces:

1. A new server-only repository function in
   [`src/server/persistence/supabase/listingRepository.ts`](../src/server/persistence/supabase/listingRepository.ts):

   ```ts
   setListingStatus(id: string, status: ListingStatus): Promise<SetListingStatusResult>
   ```

   Hard rules:

   - Validates `id` as a uuid AND `status` against the canonical
     `ListingStatus` enum BEFORE issuing the update. A forged
     caller cannot smuggle a non-listing-status string through.
   - Updates ONLY the `status` column. Never touches
     `raw_seller_input`, `seller_id`, pricing, or verification.
   - Never joins `listing_secrets`. The select clause names only
     `id`, so the round-tripped row carries no private fields.
   - Returns `{ ok: false }` on missing client / validator failure /
     DB error. Never throws.

   Re-exported from
   [`src/server/persistence/supabase/index.ts`](../src/server/persistence/supabase/index.ts).

2. A new server action at
   [`src/server/listings/publishListing.ts`](../src/server/listings/publishListing.ts):

   ```ts
   export type PublishListingPayload = { listingId: string };
   export type PublishListingResult = {
     id: string;
     status: "approved";
     alreadyApproved: boolean;
   };

   export async function publishListingAction(
     payload: PublishListingPayload,
   ): Promise<IntentResult<PublishListingResult>>;
   ```

   Decision tree:

   | `payload.listingId` shape | founder session | `getBackendMode()` | listing row | response |
   | --- | --- | --- | --- | --- |
   | non-uuid / empty | (any) | (any) | (any) | `intentErr("input", "listing_id_invalid")` |
   | uuid | none / non-allowlisted | (any) | (any) | `intentErr("unauthenticated", …)` |
   | uuid | allowlisted | not `"supabase"` | (any) | `intentErr("unsupported", …)` |
   | uuid | allowlisted | `"supabase"` | not found | `intentErr("not_found", …)` |
   | uuid | allowlisted | `"supabase"` | `status='approved'` | `intentOk({ id, status: "approved", alreadyApproved: true })` (no update) |
   | uuid | allowlisted | `"supabase"` | other status | `intentOk({ id, status: "approved", alreadyApproved: false })` (update issued) |

## Publication authority

- The action reuses
  [`requireFounderSession`](../src/server/admin/auth.ts) — the
  same gate used by the existing founder admin dashboard. The
  authorization signal is **only** the server-side
  `FOUNDER_ADMIN_EMAIL_ALLOWLIST` matched against the
  Supabase-validated session email. `user_metadata.role`,
  custom claims, and any client-supplied flag are ignored.
- Empty / missing allowlist fails closed (every publication request
  → `unauthenticated`). The `requireFounderSession` contract is
  unchanged — the existing fail-closed defaults apply.
- Normal sellers cannot self-publish. A Supabase-authenticated
  user whose email is **not** on the allowlist gets the same
  `unauthenticated` envelope as an anonymous caller. The owner of
  the listing has no special privilege through this action.

## Public / private projection posture

| Concern | Status |
| --- | --- |
| Public listing projection | **Allowlist-only.** [`mapApprovedListingIntentToPublicListing`](../src/lib/services/publicListingService.ts) continues to require `status='approved'` AND minimum-shape checks. Drafts and other non-approved statuses still return `null`. |
| `rawSellerInput` exposure | **Not exposed.** The action's response DTO does not carry it. The public projection has never carried it. |
| `privateSerialNumber` exposure | **Not exposed.** `listing_secrets` is not joined by `setListingStatus`, `getListingById`, or the public projection. |
| Verification internals / safety code / human review notes | **Not exposed.** Public projection has no slot; action DTO has no slot. |
| `sellerId` echoed to the publish response | **Not echoed.** The DTO returns only `{ id, status, alreadyApproved }`. The seller id stays server-side. |
| Pickup details | The public projection only carries `pickupArea` (coarse). Internal pickup hints live in `listing_secrets.pickup_area_internal` and are never joined. |
| RLS policies | **Unchanged.** Deny-by-default; the service-role client bypasses RLS. No public grant is added on `listings_public`. |
| Migrations | **None.** Part 3 ships no schema changes; the existing `20260430120000_phase2_marketplace_draft.sql` schema is sufficient. |

## What Part 3 does NOT do

| Concern | Status |
| --- | --- |
| Renter request DB path | **Not added.** Renter request creation continues to go through `rentalService.createRequestFromProductId` against static `PRODUCTS`. |
| Renter-facing DB browse | **Not added.** Public browse continues to project static `PRODUCTS` plus approved persisted listings via local persistence; no Supabase-mode public read path is introduced. |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** |
| Pickup / return / handoff lifecycle | **None.** |
| Claim / dispute / trust-event externalization | **None.** |
| Notification infrastructure | **None.** |
| Broad RLS policies / `listings_public` grant | **None.** Deny-by-default holds. |
| Schema migrations | **None.** |
| Remote `corent-dev` apply / seed | **Not run.** Local Supabase CLI was not invoked. The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Manual provisioning per [PR 5B](corent_closed_alpha_provisioning_workflow.md). |
| Founder UI surface | **Deferred.** A small founder-only affordance (e.g. publish button on the existing admin dashboard) is intentionally not part of Part 3 — the action + tests + docs land first; the UI is a follow-up slice. The action is callable today from a founder-only server component or route handler. |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** |

## Idempotency and audit

- The action is idempotent by construction: a second call against an
  already-approved listing returns `intentOk({ alreadyApproved: true })`
  WITHOUT issuing another `UPDATE`. This avoids spurious
  `updated_at` churn and the audit surface stays clean.
- Today there is no admin-actions write recorded for this slice —
  `admin_actions` externalization is its own future slice. The
  founder email is logged at the auth boundary by `requireFounderSession`'s
  caller, but the publication action itself does not append a
  separate audit row.

## Failure-mode behavior

| Scenario | What the caller sees |
| --- | --- |
| Anonymous / non-allowlisted caller | `intentErr("unauthenticated", "founder_session_required")` |
| Mock / default backend | `intentErr("unsupported", "publication_requires_server_backend")` |
| Unknown `listingId` | `intentErr("not_found", "listing_not_found")` |
| Repo throw (DB unavailable, SQL error, etc.) | `intentErr("internal", "publish_listing_failed")` — no SQL, env, table names, or row payloads leak. |
| Already-approved listing | `intentOk({ alreadyApproved: true })` — no DB write. |

## What lands next

Part 3 unblocks the smallest end-to-end "founder publishes a closed-alpha
seller's draft" path. The next slices, in priority order:

1. **Renter request DB path** — externalize rental intent creation
   so a renter can request an approved persisted listing via
   Supabase. Requires a separate security review note.
2. **Founder publish UI** — a tiny affordance on the existing
   admin dashboard that lists pending drafts and exposes a
   "공개로 승인" button bound to `publishListingAction`. The
   action is already callable; this slice is purely render +
   `useFormState` plumbing under the founder gate.
3. **`admin_actions` externalization** — append a row when a
   founder publishes / un-publishes a listing so the audit log
   matches the closed-alpha provisioning workflow.

Out of scope for the next slice regardless of which one lands:
payment, deposit, escrow, refund, settlement, checkout,
pickup/return/handoff lifecycle, claim / dispute / trust events,
notifications. Each requires its own externalization slice and
security-review sign-off per
[`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
and the pre-revenue beta plan.

## References

- `src/server/persistence/supabase/listingRepository.ts`
  (`setListingStatus`)
- `src/server/persistence/supabase/listingRepository.test.ts`
  (Part 3 repo tests)
- `src/server/listings/publishListing.ts` (server action)
- `src/server/listings/publishListing.test.ts`
- `src/lib/services/publicListingService.ts` (allowlist-only public
  projection — unchanged)
- `src/server/admin/auth.ts` (`requireFounderSession`)
- `supabase/migrations/20260430120000_phase2_marketplace_draft.sql`
  (no migration added; schema reused)
- `docs/corent_closed_alpha_dashboard_listings_externalization_note.md`
  (Slice A PR 5G — preceding slice)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`

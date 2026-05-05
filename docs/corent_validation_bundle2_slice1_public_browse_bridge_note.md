# Validation Bundle 2, Slice 1 — server-backed public listing browse bridge

Bundle 2, Slice 1 makes approved server-side listings visible on the
renter-facing browse surface (`/search`) through the existing
sanitized public projection. Drafts and other non-approved listings
remain invisible; the public projection stays allowlist-only; no
request creation UI is wired in this slice.

## Shape of the change

Slice 1 adds two new files and updates one component. No schema
change, no repository surface change, no design-token change.

### Server action

[`src/server/listings/listPublicListings.ts`](../src/server/listings/listPublicListings.ts)

```ts
export type PublicListingsReadResult =
  | { mode: "local" }
  | { mode: "server"; listings: PublicListing[] };

export async function listPublicListingsAction(): Promise<PublicListingsReadResult>;
```

Decision tree:

| `getBackendMode()` | Repo result | Response |
| --- | --- | --- |
| not `"supabase"` | (not called) | `{ mode: "local" }` — client falls back to its existing isomorphic path |
| `"supabase"` | repo throws | `{ mode: "server", listings: [] }` — calm degraded state, no SQL/env leak |
| `"supabase"` | empty | `{ mode: "server", listings: [] }` |
| `"supabase"` | rows | `{ mode: "server", listings: <projected via mapApprovedListingIntentToPublicListing> }` |

The action is **public** (no actor required) and **read-only**. It
does not use `runIntentCommand` because:
- public listing browse is unauthenticated by design;
- the safety boundary is the canonical `status === "approved"`
  check inside the projection mapper, not actor identity;
- the service-role client bypasses RLS, and the projection is what
  enforces the privacy allowlist.

### Client adapter

[`src/lib/client/publicListingsClient.ts`](../src/lib/client/publicListingsClient.ts)

```ts
export type PublicListingsLoadResult =
  | { kind: "local" }
  | { kind: "server"; listings: PublicListing[] }
  | { kind: "error" };

export async function loadPublicListings(): Promise<PublicListingsLoadResult>;
```

The adapter is the only path
[`src/components/SearchResults.tsx`](../src/components/SearchResults.tsx)
uses to reach the server action — the static-text guard in
[`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts)
forbids any component from importing `@/server/**` directly.

### Component wiring

`SearchResults.tsx` now branches on the adapter's three-state
envelope:

- `kind: "server"` → render the server-projected listings only. **Static `PRODUCTS` are NOT mixed in** because they have no `seller_profiles` row in `corent-dev` and would not be requestable via the server-mode renter request action; surfacing them in supabase mode would mislead the closed-alpha tester.
- `kind: "local"` → call the existing `publicListingService.listPublicListings()` (the only path that can read browser-localStorage-persisted approved listings).
- `kind: "error"` → keep the SSR initial paint (static `PRODUCTS` only). **No silent local fallback.** Local data is never substituted for failed server data.

## Local vs. server mode behavior

| Surface | Mock / default mode (existing) | Supabase mode (new) |
| --- | --- | --- |
| `/search` (browse) | Static `PRODUCTS` + any localStorage approved `ListingIntent` rows. | Server-approved listings only, projected through `mapApprovedListingIntentToPublicListing`. Static `PRODUCTS` not mixed in. |
| Static SSR initial paint | Static `PRODUCTS` (unchanged) | Static `PRODUCTS` (unchanged — replaced post-hydration) |
| Detail link from cards | `/items/<sourceId>` for static products | Static products: `/items/<sourceId>`. Server-approved: `detailHref` undefined → non-clickable. A public detail route is deferred. |
| `/sellers/[sellerId]` storefront | Unchanged (server component, statically generated). | **Unchanged in this slice.** Storefront page continues to read via the existing isomorphic `publicListingService.listPublicListingsForSeller`. Bridging it to supabase mode requires `force-dynamic` and is deferred. |
| `/items/[id]` detail | Unchanged (static product fixture only). | **Unchanged in this slice.** A public detail route for approved persisted listings is deferred. |
| `/` landing | Unchanged. Featured products are static fixtures. | Unchanged. |

## Public / private projection posture

| Concern | Status |
| --- | --- |
| Public projection allowlist | **Unchanged.** `mapApprovedListingIntentToPublicListing` is reused as-is; it requires `status='approved'` AND a minimum-shape gate (non-empty pickupArea, finite prices, valid category, etc.). Failing rows project to `null` and are dropped. |
| `rawSellerInput` exposure | **Not exposed.** The mapper has never copied it; the DTO has no slot. |
| `privateSerialNumber` exposure | **Not exposed.** Repo's `getListingById` / `listApprovedListings` do not join `listing_secrets`; the mapper has no slot. |
| Verification internals (`safetyCode`, `aiNotes`, `humanReviewNotes`) | **Not exposed.** No DTO slot. |
| Internal review notes | **Not exposed.** |
| Private pickup details | The DTO carries `pickupArea` (coarse area only) — never an exact address. `pickup_area_internal` from `listing_secrets` is never read. |
| `ListingIntent` directly to components | **Forbidden.** The action and the adapter only return `PublicListing` DTOs. Components never see `ListingIntent`. |
| Drafts / non-approved rows | **Invisible.** Repo filters with `WHERE status='approved'` AND the projection mapper returns `null` for any non-approved row (defense in depth). |
| RLS / migration / grant changes | **None.** Deny-by-default RLS holds; no `listings_public` view grant added. |

## What Slice 1 does NOT do

| Concern | Status |
| --- | --- |
| Renter request UI wiring | **Not added.** `ItemDetailClient` continues to use the local `rentalService.createRequestFromProductId` path. `createRentalRequestAction` (Bundle 1, Part 4) remains server-action-only. |
| Public detail route for server-approved listings | **Not added.** `detailHref` for approved persisted listings stays `undefined`; cards remain non-clickable in browse. |
| Storefront page (`/sellers/[sellerId]`) supabase-mode bridge | **Not added.** Storefront stays on the static-generated path. Adding `force-dynamic` + dispatch is a small follow-up. |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** |
| Pickup / return / handoff lifecycle | **None.** |
| Claim / dispute / trust-event externalization | **None.** |
| Notification infrastructure | **None.** |
| Broad RLS policies / public DB grants | **None.** Deny-by-default holds. |
| Schema migrations | **None.** |
| Remote `corent-dev` apply / seed | **Not run.** Local Supabase CLI was not invoked. The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** Slice 1 uses only existing utility classes; no design token change. |

## Test coverage (9 new cases + boundary regression)

`src/server/listings/listPublicListings.test.ts`:

- mock backend → `{ mode: "local" }`; the repo is NOT touched (when `CORENT_BACKEND_MODE` is unset; when it is explicitly `"mock"`)
- supabase backend + zero approved rows → empty server payload
- supabase backend + approved rows → projected via the allowlist mapper; DTO has correct prefix, source, sourceId, pricing, `isPersistedProjection: true`, `detailHref: undefined`
- supabase backend filters non-approved rows even if the repo accidentally returns them — defense in depth (the projection mapper is a second gate)
- rows that fail the projection mapper's minimum-shape gate (missing `pickupArea`, malformed prices) drop silently
- public DTO never carries `rawSellerInput`, `privateSerialNumber`, `verification.*`, `humanReviewNotes`, or any other private slot from the source intent (string scan + structural `in` check)
- repo throw → calm `{ mode: "server", listings: [] }`; no SQL / env / table / row / service-role hint leaks
- import-block scope guard: action does NOT import `rentalIntentRepository`, `rentalService`, `createRentalRequest`, payment/claim/trust/handoff/notification modules, `admin/auth`, or `listing_secrets`

The existing `publicListingService.test.ts` privacy tests still
pass unchanged. The static-text import-boundary test still passes;
`SearchResults.tsx` reaches the server action ONLY through
`@/lib/client/publicListingsClient` (the same hop pattern PR 5G's
`sellerDashboardListingsClient` uses).

## What lands next

Slice 1 closes the visibility loop for browse: an approved
server-side listing now shows up at `/search` in supabase mode.
The next slices, in priority order:

1. **Renter request UI wiring on `/items/[id]`** — bind
   `createRentalRequestAction` (Bundle 1, Part 4) to the live
   item-detail page through a probe-driven adapter, the same
   pattern the chat-intake mode probe uses. Static-product
   detail links continue to work in mock mode; a server-mode
   detail route for approved persisted listings is the
   precondition (so server-approved listings get a clickable card
   too).

2. **Server-mode storefront page** (`/sellers/[sellerId]`) —
   add `force-dynamic` + dispatch to surface server-approved
   listings on the seller's public page.

3. **Seller dashboard server-mode rental request read** — read
   DTO scoped to the seller's own `rental_intents` rows so the
   seller can see who has requested their listings.

Out of scope for the next slice regardless of which one lands:
payment, deposit, escrow, refund, settlement, checkout, pickup /
return / handoff lifecycle, claim / dispute / trust events,
notifications, broad RLS policies, remote `corent-dev`
operations.

## References

- `src/server/listings/listPublicListings.ts` (server action)
- `src/server/listings/listPublicListings.test.ts` (9 tests)
- `src/lib/client/publicListingsClient.ts` (client adapter)
- `src/components/SearchResults.tsx` (probe wiring)
- `src/lib/services/publicListingService.ts`
  (`mapApprovedListingIntentToPublicListing` — pure allowlist
  mapper, reused isomorphically; unchanged)
- `src/server/persistence/supabase/listingRepository.ts`
  (`listApprovedListings` — server-only repo read; unchanged)
- `src/server/backend/mode.ts` (backend mode dispatch)
- `src/server/admin/import-boundary.test.ts` (component import
  guard — still green)
- `docs/corent_validation_bundle1_part3_publication_note.md`
  (Bundle 1 Part 3 — publishes the listings this slice surfaces)
- `docs/corent_validation_bundle1_part4_renter_request_note.md`
  (Bundle 1 Part 4 — request creation; not wired by this slice)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`

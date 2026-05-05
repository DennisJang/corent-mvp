# Validation Bundle 1, Part 4 — renter request creation path

Part 4 adds the smallest safe server-backed renter request creation
path against approved/public server listings. This is **request
creation only** — not payment, not pickup/return lifecycle, not
claim/dispute/trust events, not notifications.

## Shape of the change

Part 4 adds one new server action plus a docs note. No schema
migration; no repository surface change; no UI wiring.

### Server action

[`src/server/rentals/createRentalRequest.ts`](../src/server/rentals/createRentalRequest.ts)

```ts
export type CreateRentalRequestPayload = {
  listingId: string;
  durationDays: 1 | 3 | 7;
};

export type CreateRentalRequestResult = {
  id: string;
  status: "requested";
  durationDays: DurationDays;
  rentalFee: number;
  safetyDeposit: number;
  borrowerTotal: number;
  productName: string;
  productCategory: CategoryId;
};

export async function createRentalRequestAction(
  payload: CreateRentalRequestPayload,
): Promise<IntentResult<CreateRentalRequestResult>>;
```

Decision tree:

| `getBackendMode()` | actor | listingId / durationDays | listing row | response |
| --- | --- | --- | --- | --- |
| not `"supabase"` | (any) | (any) | (any) | `intentErr("unsupported", "rental_request_requires_server_backend")` |
| `"supabase"` | `null` | (any) | (any) | `intentErr("unauthenticated", …)` (via runner) |
| `"supabase"` | mock-sourced (defense in depth) | (any) | (any) | `intentErr("unsupported", …)` |
| `"supabase"` | supabase seller actor under `prefer: "renter"` | (any) | (any) | `intentErr("ownership", …)` (capability mismatch) |
| `"supabase"` | supabase renter actor | non-uuid / empty | (any) | `intentErr("input", "listing_id_invalid")` |
| `"supabase"` | supabase renter actor | duration ∉ {1,3,7} | (any) | `intentErr("input", "duration_invalid")` |
| `"supabase"` | supabase renter actor | uuid + valid duration | not found | `intentErr("not_found", "listing_not_found")` |
| `"supabase"` | supabase renter actor | uuid + valid duration | `status !== 'approved'` | `intentErr("not_found", "listing_not_found")` (collapsed — no enumeration) |
| `"supabase"` | supabase renter actor | uuid + valid duration | `status='approved'` | `intentOk({ id, status: "requested", … })` |

### No schema change

The Phase 2 schema in
[`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql)
already defines `rental_intents` and `rental_events` with
deny-by-default RLS and the full set of CHECK constraints needed
for request creation. The existing
[`saveRentalIntent`](../src/server/persistence/supabase/rentalIntentRepository.ts)
+ [`appendRentalEvent`](../src/server/persistence/supabase/rentalIntentRepository.ts)
repository functions are reused as-is.

## Request authority posture

- The client may supply ONLY `listingId` and `durationDays`.
- All authority-bearing fields are derived server-side:
  - **canonical listing** is reloaded from `getListingById`; the
    payload is never trusted as a source of truth for product
    metadata, pricing, or seller identity;
  - **`sellerId`** comes from `listing.sellerId`;
  - **`productId` / `productName` / `productCategory`** come from
    the canonical listing;
  - **`rentalFee`** comes from `listing.pricing.{oneDay,threeDays,sevenDays}`
    keyed by the validated `durationDays`;
  - **`safetyDeposit` / `platformFee` / `sellerPayout` / `borrowerTotal`**
    come from `calculateRentalAmounts(rentalFee, listing.item.estimatedValue)`;
  - **`borrowerId`** comes from the resolved Supabase actor
    (`actor.borrowerId`); the resolver only mints a `kind: "renter"`
    actor when an authenticated Supabase user has a
    `borrower_profiles` row;
  - **`borrowerName`** comes from `actor.displayName`;
  - **`status`** is hardcoded to `"requested"`;
  - **`payment.{provider, status}`** are hardcoded to
    `{"mock", "not_started"}`;
  - **`pickup.status`** = `"not_scheduled"`,
    **`return.status`** = `"not_due"`,
    **`settlement.status`** = `"not_ready"`;
  - **`pickup.locationLabel`** comes from the canonical
    `listing.item.pickupArea` (coarse area only — never an
    exact address).

The payload type does NOT declare `sellerId`, `borrowerId`,
`price`, `amounts`, `status`, `payment`, `pickup`, `return`,
`settlement`, `adminId`, `role`, `capability`, `approval`,
`trustScore`, or `claimReview`. The runtime never reads them.
A forged caller passing extras via cast is silently ignored.

## Public / private boundary

| Concern | Status |
| --- | --- |
| Listing visibility gate | Listing must be `status='approved'`. Every other status (draft, ai_extracted, verification_incomplete, human_review_pending, rejected) collapses to `not_found` so a renter cannot enumerate non-public listings by id. |
| `publicListingService` projection | **Unchanged.** The action does not import or call it; the existing allowlist projection still requires `status='approved'` and continues to filter drafts. The existing privacy tests still pass. |
| Response DTO | Tight allowlist: `{ id, status, durationDays, rentalFee, safetyDeposit, borrowerTotal, productName, productCategory }`. No `sellerId`, `borrowerId`, `rawSellerInput`, `privateSerialNumber`, verification internals, internal review notes, payment session ids, settlement amounts, or any other private field. |
| `listing_secrets` exposure | Not joined. `getListingById` already excludes it; the action does not query secrets. |
| Cross-renter leakage | The action only writes a row owned by the resolved actor. Reads of other renters' rentals are out of scope for this slice. |
| RLS policies | **Unchanged.** Deny-by-default; the service-role client bypasses RLS. No new public grant added. |

## Failure-mode behavior

| Scenario | Caller sees |
| --- | --- |
| Mock backend or mock-sourced actor in supabase mode | `intentErr("unsupported", "rental_request_requires_server_backend")` |
| Anonymous (no Supabase session) | `intentErr("unauthenticated", "no actor resolved")` |
| Profile lacks borrower capability under `prefer: "renter"` | `intentErr("ownership", …)` (resolver returns seller actor → runner's kind check fails) |
| Bad `listingId` (non-uuid / empty) | `intentErr("input", "listing_id_invalid")` |
| Bad `durationDays` (∉ {1, 3, 7}) | `intentErr("input", "duration_invalid")` |
| Listing missing OR not approved | `intentErr("not_found", "listing_not_found")` (collapsed) |
| Repo throw / DB error | `intentErr("internal", "create_rental_request_failed")` — no SQL, env, table names, or row payloads leak. |

## What Part 4 does NOT do

| Concern | Status |
| --- | --- |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** `payment.status` defaults to `not_started`; no payment session is ever created or stored. |
| Pickup / return / handoff lifecycle | **None.** All lifecycle columns sit at safe defaults. |
| Claim / dispute / trust-event externalization | **None.** The action does not import `trustEventService` / `claimReviewService` / `handoffService`. The static-text guard in `createRentalRequest.test.ts` asserts these are not in the import block. |
| Notification infrastructure | **None.** |
| Broad RLS policies / public DB grants | **None.** Deny-by-default holds. |
| Schema migrations | **None.** |
| Remote `corent-dev` apply / seed | **Not run.** Local Supabase CLI was not invoked. The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Manual provisioning per [PR 5B](corent_closed_alpha_provisioning_workflow.md). |
| UI wiring | **Deferred.** `ItemDetailClient` continues to use the local `rentalService.createRequestFromProductId` path against static `PRODUCTS`. The server action is callable today from a renter-only server component or route handler; binding it to the live UI is a follow-up slice. The local demo flow is **not** broken by Part 4. |
| Seller dashboard request read | **Deferred.** Server request creation exists; seller dashboard server-mode rental request read is the next slice. |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** |

## Test coverage (24 cases)

- mock backend → `unsupported`
- supabase + null actor → `unauthenticated`
- supabase + mock-sourced renter (defense in depth) → `unsupported`
- supabase + seller actor under `prefer: "renter"` → `ownership`
- shape validation: bad `listingId` (non-uuid, empty) and bad
  `durationDays` (0, 2, 5, 14, 30, -1, 3.5) → `input`
- listing not found → `not_found`; every non-approved status
  (draft, ai_extracted, verification_incomplete,
  human_review_pending, rejected) collapses to `not_found`
- happy path: tight DTO, `safetyDeposit=30000` for
  `estimatedValue=200000`, `borrowerTotal = rentalFee + safetyDeposit`,
  `saveRentalIntent` + `appendRentalEvent` each called exactly once
- server-derived `sellerId` (canonical, not payload),
  `borrowerId` (actor, not payload), `productId` (canonical id)
- price derivation correct for each of 1 / 3 / 7 days
- persisted row carries `status='requested'`, `payment={mock,not_started}`,
  `pickup={direct,not_scheduled,locationLabel:listing.pickupArea}`,
  `return.status='not_due'`, `settlement.status='not_ready'`
- rental_event has `from=null`, `to=requested`, `actor=borrower`,
  `reason=rental_request_created`
- forged `sellerId` / `borrowerId` / `price` / `amounts` / `status` /
  `payment` / `pickup` / `return` / `settlement` / `adminId` /
  `role` / `capability` / `approval` / `trustScore` / `claimReview`
  on the payload are ignored at compile (`@ts-expect-error`) AND
  at runtime (assert canonical values reach the repo)
- response DTO does NOT carry `sellerId`, `borrowerId`,
  `rawSellerInput`, `privateSerialNumber`, internal notes,
  `safetyCode`, `sessionId`, `payment`, `settlement`
- `getListingById` throw / `saveRentalIntent` ok=false /
  `saveRentalIntent` throw / `appendRentalEvent` ok=false
  all map to typed `internal` without leaking SQL / env / stack
- import-block scan: action does NOT import
  `@/lib/services/rentalService`, `getPersistence`,
  `trustEventService`, `claimReviewService`, `handoffService`,
  `paymentAdapter`, or `notification` modules
- existing `publicListingService` privacy tests and existing
  local `rentalService` tests still pass unchanged

## What lands next

Part 4 unblocks the smallest end-to-end "authenticated renter
creates a request against an approved server listing" path in
supabase mode. The next slice is **either** of the following — but
**not** payment, **not** lifecycle, **not** trust/claim, **not**
notifications:

1. **Seller dashboard server-mode rental request read.** A tight
   DTO that surfaces the requesting borrower, duration, and
   amounts on the seller's existing dashboard. Read-only;
   filtered to the seller's own `rental_intents` rows.

2. **Renter UI wiring.** Bind the existing renter detail surface
   to `createRentalRequestAction` behind a server-mode signal,
   keeping the local demo path intact for mock mode.

Both are still gated by [`docs/corent_security_gate_note.md`](corent_security_gate_note.md)
and the pre-revenue beta plan: no payment, no deposit, no
settlement, no real photos, no exact pickup location, no
notification channel.

## References

- `src/server/rentals/createRentalRequest.ts` (server action)
- `src/server/rentals/createRentalRequest.test.ts` (24 tests)
- `src/server/persistence/supabase/listingRepository.ts`
  (`getListingById` — reused)
- `src/server/persistence/supabase/rentalIntentRepository.ts`
  (`saveRentalIntent`, `appendRentalEvent` — reused)
- `src/server/actors/resolveServerActor.ts` (renter resolver)
- `src/server/intents/intentCommand.ts` (runner)
- `src/lib/services/publicListingService.ts` (allowlist projection
  — unchanged)
- `src/lib/pricing.ts` (`calculateRentalAmounts` — pure math)
- `supabase/migrations/20260430120000_phase2_marketplace_draft.sql`
  (no migration added; schema reused)
- `docs/corent_validation_bundle1_part3_publication_note.md`
  (Part 3 — publishes listings that this action consumes)
- `docs/corent_closed_alpha_dashboard_listings_externalization_note.md`
  (Slice A PR 5G — preceding closed-alpha slice)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`

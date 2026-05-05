# Validation Bundle 2, Slice 2 — server listing detail + renter request UI

Bundle 2, Slice 2 closes the visible renter loop:

> server-approved listing appears in browse → renter opens
> sanitized server listing detail → renter selects duration →
> renter submits request → `createRentalRequestAction` writes
> the request

This is **request creation only**. No payment, no pickup/return
lifecycle, no claim/dispute, no notification, no seller-side
visibility.

## Shape of the change

Slice 2 adds one new route, two new client modules, and extends
the existing public-listing server action. No schema migration, no
RLS change, no design-token change.

### Route

[`src/app/listings/[listingId]/page.tsx`](../src/app/listings/[listingId]/page.tsx)
— server component. `dynamic = "force-dynamic"`. Calls
`getServerApprovedPublicListingAction(listingId)` and:

| Backend mode | Repo result | Page response |
| --- | --- | --- |
| not `"supabase"` | (not called) | `notFound()` (route is server-only by design) |
| `"supabase"` | malformed uuid | `notFound()` |
| `"supabase"` | row missing | `notFound()` |
| `"supabase"` | row with non-`approved` status (draft / ai_extracted / verification_incomplete / human_review_pending / rejected) | `notFound()` (no enumeration of private rows) |
| `"supabase"` | row fails projection mapper's minimum-shape gate | `notFound()` |
| `"supabase"` | repo throws | `notFound()` (calm degraded state) |
| `"supabase"` | approved row, projects cleanly | renders `<ServerListingDetailClient listing={publicDTO} />` |

`/items/[id]` is **unchanged** — it remains the static / local-MVP
demo path against the `PRODUCTS` fixture. The two routes are
disjoint by URL, by data source, and by code path.

### Server action — extended

[`src/server/listings/listPublicListings.ts`](../src/server/listings/listPublicListings.ts)

- `listPublicListingsAction()` (existing) — server-projected cards
  now carry `detailHref: /listings/<sourceId>`. The override is
  applied at the action layer (after the pure
  `mapApprovedListingIntentToPublicListing` returns); the shared
  mapper still produces `detailHref: undefined` for every
  approved listing intent. Mock-mode local projections (read via
  `publicListingService.listPublicListings()` from the browser)
  continue to render as non-clickable cards because they reach
  the renter through the mapper, not through this action.
- `getServerApprovedPublicListingAction(listingId)` (new) —
  single-row read. Validates uuid shape; mock mode returns
  `{ mode: "local" }`; supabase mode reads `getListingById`,
  collapses any non-approved status / missing row / repo throw to
  `{ mode: "server", listing: null }` so a renter cannot
  enumerate non-public rows.

### Client component

[`src/components/ServerListingDetailClient.tsx`](../src/components/ServerListingDetailClient.tsx)
— receives a sanitized `PublicListing` DTO via props, renders a
duration selector (1 / 3 / 7 days), the existing
`PriceBreakdown` component (reference-only amounts; explicit
beta posture), and a request button. The button calls
`submitRentalRequest` with **only** `{ listingId, durationDays }`.

UX copy (Korean):

- Pre-payment posture (always visible above the button):
  "아직 결제는 발생하지 않아요. 요청만 전송돼요."
- Success: "요청이 전송되었어요. 셀러의 응답을 기다리는
  중이에요." + "아직 대여가 확정된 것은 아니에요."
- Failure (per envelope kind, calm and non-secret):
  - `unauthenticated` → "요청을 보내려면 먼저 로그인해주세요." + sign-in link to `/login`.
  - `ownership` → "이 계정에는 빌리는 사람 권한이 아직 없어요."
  - `not_found` → "이 리스팅은 더 이상 공개되어 있지 않아요."
  - `input` → "요청을 처리할 수 없어요. 기간을 다시 선택해주세요."
  - `unsupported` → "데모 환경에서는 요청을 보낼 수 없어요."
  - `error` → "요청을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요."

The component does **not** import `getMockRenterSession`; the
server-mode renter identity comes only from the resolved Supabase
actor inside `createRentalRequestAction`. There is no silent
fallback to `rentalService.createRequestFromProductId`.

### Client adapter

[`src/lib/client/rentalRequestClient.ts`](../src/lib/client/rentalRequestClient.ts)
— wraps `createRentalRequestAction`. Forwards **only**
`{ listingId, durationDays }` (the input is destructured into a
fresh object so a forged caller passing extras via cast cannot
ride along to the server payload). Maps every `IntentResult` code
to a tight UI envelope (`ok` / `unauthenticated` / `ownership` /
`not_found` / `input` / `unsupported` / `error`).

Components in `src/components/**` cannot import `@/server/**`
directly (boundary test). The adapter is the only hop into the
server action.

## Request authority posture

| Authority field | Source |
| --- | --- |
| `listingId` | client payload — validated as uuid by the action; the canonical listing row is loaded server-side |
| `durationDays` | client payload — validated as 1 / 3 / 7 by the action |
| `sellerId` | derived from `listing.sellerId` (canonical) |
| `productId` / `productName` / `productCategory` | derived from canonical listing |
| `rentalFee` | derived from `listing.pricing[durationDays]` |
| `safetyDeposit` / `platformFee` / `sellerPayout` / `borrowerTotal` | derived from `calculateRentalAmounts(rentalFee, listing.item.estimatedValue)` |
| `borrowerId` | resolved Supabase actor (`actor.borrowerId`); the resolver only mints a `kind: "renter"` actor when an authenticated user has a `borrower_profiles` row |
| `borrowerName` | resolved Supabase actor's display name |
| `status` | hardcoded to `"requested"` |
| `payment` | hardcoded to `{ provider: "mock", status: "not_started" }` |
| `pickup` / `return` / `settlement` | hardcoded safe defaults |

A forged client payload with extra `sellerId`, `borrowerId`,
`price`, `amounts`, `status`, `payment`, `pickup`, `return`,
`settlement`, `adminId`, `role`, `capability`, `approval`,
`trustScore`, or `claimReview` keys is rejected at three layers:

1. The TypeScript signature only declares the two whitelisted
   keys — `@ts-expect-error` is required for the cast.
2. The client adapter destructures the input into a fresh
   `{ listingId, durationDays }` object before forwarding.
3. The server action's payload type is identical and the runtime
   never reads any other key.

## Public / private projection posture

| Concern | Status |
| --- | --- |
| Public projection allowlist | **Unchanged.** `mapApprovedListingIntentToPublicListing` still requires `status='approved'` AND the minimum-shape gate. |
| `rawSellerInput` exposure | **Not exposed.** The mapper does not copy it; the DTO has no slot. |
| `privateSerialNumber` exposure | **Not exposed.** Repo's `getListingById` does not join `listing_secrets`. |
| Verification internals (`safetyCode`, `aiNotes`, `humanReviewNotes`) | **Not exposed.** No DTO slot. |
| Internal review notes | **Not exposed.** |
| Private pickup / contact details | The DTO carries `pickupArea` (coarse area only) — never an exact address. `pickup_area_internal` from `listing_secrets` is never read. |
| Trust / admin / payment internals | **Not exposed.** No DTO slot. |
| `ListingIntent` directly to client | **Forbidden.** The route component projects via the mapper before passing the prop. The client component types its prop as `PublicListing`, never `ListingIntent`. |
| Drafts / non-approved rows | **Invisible.** Repo + projection mapper + page route all check `status === "approved"`; a non-approved id 404s, never renders. |
| RLS / migration / grant changes | **None.** Deny-by-default RLS holds; no `listings_public` view grant added. |

## Local vs. server mode behavior

| Surface | Mock / default mode | Supabase mode |
| --- | --- | --- |
| `/items/[id]` | Static `PRODUCTS` detail (existing). Local `rentalService.createRequestFromProductId` for requests against static fixtures. | Unchanged — still the static demo path. **No silent route to server-approved listings.** |
| `/listings/[listingId]` | **`notFound()`** (route is server-only by design). | Sanitized server detail; request button calls `createRentalRequestAction`. Renders `notFound()` when row missing / non-approved / malformed. |
| Browse cards | Static products → `/items/<id>`; persisted approved listings (rare in mock mode) carry `detailHref: undefined` and stay non-clickable. | Server-projected cards → `/listings/<uuid>` (clickable). Static `PRODUCTS` are not mixed in (Bundle 2 Slice 1 invariant). |
| Renter session | `getMockRenterSession()` for the `/items/[id]` path (existing). | Server actor resolution only. The new component never imports `mockSession`. |

## What Slice 2 does NOT do

| Concern | Status |
| --- | --- |
| Seller dashboard server-mode rental request read | **Deferred.** Sellers cannot yet see incoming server-side requests in their dashboard. |
| Seller approve / reject server request lifecycle | **Deferred.** Only `status='requested'` exists today; the seller cannot transition it via the server. |
| Renter cancel server request | **Deferred.** |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** UI copy is explicit: "아직 결제는 발생하지 않아요." |
| Pickup / return / handoff lifecycle | **None.** All lifecycle columns sit at safe defaults; the request DTO does not mention pickup or return. |
| Claim / dispute / trust-event externalization | **None.** |
| Notification infrastructure | **None.** |
| Broad RLS policies / public DB grants | **None.** Deny-by-default holds. |
| Schema migrations | **None.** |
| Remote `corent-dev` apply / seed | **Not run.** Local Supabase CLI was not invoked. The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** |
| Storefront page (`/sellers/[sellerId]`) supabase-mode bridge | **Still deferred** (carried over from Slice 1 — needs `force-dynamic` + dispatch). |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** Only existing utility classes and BW tokens (`var(--ink-*)`). No new colors, no third color, no gradients. |
| Provider-specific payment language (Toss, PG, etc.) | **None.** Architecture stays language-neutral and provider-neutral. |

## Test coverage

`src/server/listings/listPublicListings.test.ts` — extended from
9 → 18 cases:

- existing privacy / projection / minimum-shape / repo-throw cases still pass
- happy-path detailHref now asserted as `/listings/<sourceId>` for server projections
- new dedicated test: every server-projected row has `detailHref = /listings/<sourceId>` and never `/items/<sourceId>`
- new `getServerApprovedPublicListingAction` cases: mock-mode → `local`; bad uuid → `listing: null`; missing row → `null`; every non-approved status → `null`; approved happy-path → projected DTO with detailHref; private fields never echoed; minimum-shape gate; repo throw → `null` with no SQL/env leak

`src/lib/client/rentalRequestClient.test.ts` (new, 11 cases):

- payload forwarding: only `{ listingId, durationDays }` reaches the server action; 14 forged authority keys are explicitly excluded at runtime
- every `IntentResult` code (`ok` / `unauthenticated` / `ownership` / `not_found` / `input` / `unsupported` / `internal` / unknown) maps to a typed UI envelope
- `ok` envelope copies amounts verbatim from the server response
- thrown server action collapses to `{ kind: "error" }` with no underlying message leak
- import-block scope guard: adapter does not pull `rentalIntentRepository`, `rentalService`, payment / claim / trust / handoff / notification / `getMockRenterSession`

`src/components/ServerListingDetailClient.test.ts` (new, 11 cases):

- import boundary canary (no `@/server/**`); no `rentalService`, no `getMockRenterSession`, no payment / claim / trust / handoff / notification / lifecycle imports; `submitRentalRequest` adapter is the only server hop
- single `submitRentalRequest({...})` call site; only `listingId` + `durationDays` keys; 14 forbidden authority keys are checked
- pre-payment beta copy present ("아직 결제는 발생하지 않아요. 요청만 전송돼요.")
- success copy says "요청이 전송되었어요"; banned active phrases (결제 완료 / 대여 확정 / 보증금 청구 / 보험 / 보장 / 환불 / 정산 완료) are not present
- "아직 대여가 확정된 것은 아니에요" present
- every blocked-state reason has Korean copy; no SQL / env / table leak
- sign-in link present for `unauthenticated`
- design-system token discipline: no non-token color literals (only #000 / #fff allowed)

Existing `publicListingService` privacy tests, `createRentalRequest`
tests, `rentalService` tests, and `import-boundary` (29 cases)
still pass unchanged. **Total: 912 tests across 64 files.**

## What lands next

1. **Seller dashboard server-mode rental request read.** A
   read-only DTO scoped to the seller's own `rental_intents`
   rows so the seller can see who has requested their listings.
2. **Seller approve / reject server request action + UI.** The
   first lifecycle transition past `requested` (currently the
   only persisted status). Stays deliberately narrow: no
   payment, no pickup, no settlement.
3. **Storefront page (`/sellers/[sellerId]`) supabase-mode
   bridge.** Carry over from Slice 1.

Out of scope for the next slice regardless of which one lands:
payment / deposit / escrow / refund / settlement / checkout,
pickup / return / handoff lifecycle, claim / dispute / trust
events, notifications, broad RLS policies, remote `corent-dev`
operations.

## References

- `src/app/listings/[listingId]/page.tsx` (new route)
- `src/components/ServerListingDetailClient.tsx` (client component)
- `src/components/ServerListingDetailClient.test.ts` (static-text guards)
- `src/lib/client/rentalRequestClient.ts` (client adapter)
- `src/lib/client/rentalRequestClient.test.ts` (adapter tests)
- `src/server/listings/listPublicListings.ts` (extended action: detailHref + getServerApprovedPublicListingAction)
- `src/server/listings/listPublicListings.test.ts` (18 cases)
- `src/server/rentals/createRentalRequest.ts` (existing — Bundle 1 Part 4 — now wired to the UI)
- `src/lib/services/publicListingService.ts` (`mapApprovedListingIntentToPublicListing` — pure mapper, unchanged)
- `src/server/persistence/supabase/listingRepository.ts` (`getListingById`, `listApprovedListings` — server-only repo reads, unchanged)
- `src/server/admin/import-boundary.test.ts` (component boundary — still green)
- `docs/corent_validation_bundle2_slice1_public_browse_bridge_note.md` (Slice 1)
- `docs/corent_validation_bundle1_part4_renter_request_note.md` (Bundle 1 Part 4 — request creation action)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`

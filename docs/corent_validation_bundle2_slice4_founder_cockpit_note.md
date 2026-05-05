# Validation Bundle 2, Slice 4 — founder validation cockpit

Bundle 2, Slice 4 adds a narrow founder/admin-only validation
cockpit at `/admin/cockpit` that surfaces closed-alpha signals in
one place: recent feedback / wishlist submissions, recent server
listings across every status, recent renter requests, status
counts, and a founder-controlled publish affordance bound to the
existing `publishListingAction`.

This is **founder validation cockpit, not a broad admin console.**
It is read-mostly (one mutation: publish). No payment, no
lifecycle, no claim/dispute/trust scoring, no notification work.

## Shape of the change

Slice 4 adds two repository helpers, one orchestrator, one client
adapter, one client component, and one new admin route. No schema
migration, no RLS change, no design-token change.

### Repository helpers

[`src/server/persistence/supabase/feedbackRepository.ts`](../src/server/persistence/supabase/feedbackRepository.ts):

```ts
listRecentFeedbackSubmissions(limit = 50): Promise<RecentFeedbackSubmission[]>
```

The action layer (`founderCockpitData`) is the access-control gate
via `requireFounderSession()`; this module is row mapping +
bounded read only.

[`src/server/persistence/supabase/listingRepository.ts`](../src/server/persistence/supabase/listingRepository.ts):

```ts
listRecentListings(limit = 50): Promise<ListingIntent[]>
```

Distinct from `listApprovedListings` (which filters to
`status='approved'`); the cockpit needs to see drafts /
human_review_pending / approved / rejected so the founder can
triage incoming supply. Joins `listing_verifications`; does NOT
join `listing_secrets`.

Both helpers are server-only, validated, return `[]` on bad input
/ null client / DB error, and never throw.

### Orchestrator

[`src/server/admin/founderCockpitData.ts`](../src/server/admin/founderCockpitData.ts):

```ts
export type FounderCockpitResult =
  | { kind: "forbidden" }
  | { kind: "inactive"; founderEmail: string }
  | { kind: "ready"; data: FounderCockpitData };

export async function readFounderCockpitData(limit = 50): Promise<FounderCockpitResult>;
```

Decision tree:

| Auth | Backend | Response |
| --- | --- | --- |
| Non-founder / non-allowlisted / no session | (any) | `{ kind: "forbidden" }` (page → `notFound()`) |
| Founder | not `"supabase"` | `{ kind: "inactive", founderEmail }` (page renders calm "supabase backend not active" panel) |
| Founder | `"supabase"` | `{ kind: "ready", data }` with all four data sources populated and projected through tight DTOs |

In `ready` mode the orchestrator fetches in parallel: listings,
rental intents, feedback, marketplace aggregates. Each repo throw
collapses to an empty array (or `null` for aggregates) so a
single broken table degrades only its panel; no SQL / env / table
/ row payload leaks through the DTO surface.

### Cockpit DTOs (what is exposed vs hidden)

| DTO | Surfaced fields | Hidden fields |
| --- | --- | --- |
| `CockpitListingRow` | id, status, itemName, category, sellerId, pickupArea, prices (1d/3d/7d), estimatedValue, createdAt | rawSellerInput, privateSerialNumber, verification.* (safetyCode, aiNotes, humanReviewNotes), region_coarse, listing_secrets |
| `CockpitRequestRow` | id, listingId, productName, productCategory, sellerId, borrowerId, borrowerDisplayName, durationDays, status, rentalFee, borrowerTotal, pickupArea, createdAt | payment.sessionId, payment.failureReason, settlement.blockedReason, settlement.settledAt, sellerPayout, platformFee, safetyDeposit (cockpit shows borrowerTotal as the consolidated number), claim/trust slots |
| `CockpitFeedbackRow` | id, kind, status, message, itemName, category, contactEmail, profileId, sourcePage, createdAt | updated_at, internal review fields, any field not on the schema |

Notes:

- The cockpit DTO **intentionally surfaces** `contactEmail` from
  feedback (this is the only PII slot the cockpit echoes — the
  founder needs it to follow up with optionally-anonymous testers,
  which is the entire point of the intake form).
- The cockpit DTO **intentionally surfaces** `sellerId` /
  `borrowerId` (UUIDs only) from rentals so the founder can
  correlate rows with the provisioning template they ran.
- The cockpit DTO **deliberately omits** `safetyDeposit` and
  `platformFee` from rental projection because the cockpit's
  "참고용 합계" surface only shows `borrowerTotal`; the breakdown
  is not part of the founder validation signal at this slice.

### Client adapter

[`src/lib/client/publishListingClient.ts`](../src/lib/client/publishListingClient.ts):

```ts
export type PublishListingUiResult =
  | { kind: "ok"; id: string; alreadyApproved: boolean }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "input" }
  | { kind: "unsupported" }
  | { kind: "error" };

export async function publishListingFromCockpit(input: { listingId: string }): Promise<PublishListingUiResult>;
```

The adapter destructures the input into a fresh `{ listingId }`
object before forwarding to `publishListingAction`, so a forged
caller passing extras via cast cannot ride along. Maps every
`IntentResult` code to a tight UI envelope; thrown action →
`{ kind: "error" }` with no underlying message leak.

### Client component

[`src/components/PublishListingButton.tsx`](../src/components/PublishListingButton.tsx):

A small button taking only `listingId` via props. Renders
"공개로 승인" → "공개로 승인됨" on success, "이미 공개됨" on the
idempotent re-publish, calm Korean copy on each blocked state
(`unauthenticated` / `not_found` / `input` / `unsupported` /
`error`). The component never imports `@/server/**`, never reads
mock identity, never names payment / claim / trust / handoff /
notification modules.

### Page

[`src/app/admin/cockpit/page.tsx`](../src/app/admin/cockpit/page.tsx)

Server component, `dynamic = "force-dynamic"`. Calls
`readFounderCockpitData()` and:
- `forbidden` → `notFound()` (fail-closed 404, never 401);
- `inactive` → renders a calm "supabase backend not active" panel
  with the founder's email and instructions to set
  `CORENT_BACKEND_MODE=supabase`;
- `ready` → renders four sections (status counts + recent
  listings + recent requests + recent feedback). Each section has
  an explicit empty state. Each listing row has a publish button
  unless the row is already approved.

The page reuses the existing `requireFounderSession` gate (via
the orchestrator). It is **not linked from the existing
`/admin/dashboard`** in this slice — a separate slice can add
navigation; for now founders type the URL directly. This keeps
the existing dashboard untouched.

## Founder cockpit auth posture

| Concern | Status |
| --- | --- |
| Authority signal | `FOUNDER_ADMIN_EMAIL_ALLOWLIST` matched against the Supabase-validated session email, via `requireFounderSession()`. **Same gate as `/admin/dashboard`.** |
| Non-founder access | Returns 404 (not 401) so the cockpit's existence is not disclosed. Same fail-closed posture as the existing admin dashboard. |
| Empty / missing allowlist | Every cockpit request fails closed → 404. The orchestrator never reaches the repos. |
| Client-supplied role / capability / status / adminId | Never read. The orchestrator and the publish button forward only `listingId`. |
| Seller self-publish | **Not possible.** The publish action's gate is the founder allowlist; a seller-only Supabase user gets `unauthenticated`. The button only renders inside the founder cockpit page anyway. |

## Local vs server behavior

| Concern | Mock / default mode | Supabase mode |
| --- | --- | --- |
| Page render (founder) | Calm "supabase backend not active" panel | Full cockpit with four sections |
| Repo reads | Not invoked (orchestrator returns `inactive` before any repo call) | Invoked in parallel; each throw collapses to empty |
| localStorage | **Never read** by the cockpit. The cockpit's signals are server-only by design. | (n/a) |
| Mixing local mock data with server signals | **Forbidden.** The page does not import `getMockSellerSession`, `getMockRenterSession`, `@/lib/auth/mockSession`, or `@/lib/adapters/persistence`. | (n/a) |
| Publish button (mock mode) | The button itself only renders inside the cockpit, which is `inactive` in mock mode → button is unreachable in mock. Even if reached, the action returns `unsupported` (Bundle 1 Part 3 behavior). | Active; calls `publishListingAction`. |

## What Slice 4 does NOT do

| Concern | Status |
| --- | --- |
| Seller approve / reject server request | **Not added.** The cockpit's request panel is read-only; only the founder publish button is mutating, and it operates on listings (not requests). |
| Renter cancel server request | **Not added.** |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** Copy is explicit: "결제·정산은 아직 연결되어 있지 않아요." |
| Pickup / return / handoff lifecycle | **None.** |
| Claim / dispute / trust-event externalization | **None.** |
| Notification infrastructure | **None.** No email / SMS / push channel is touched. The cockpit shows `contactEmail` so the founder can follow up manually; CoRent does not auto-send. |
| Broad RLS policies / public DB grants | **None.** Deny-by-default holds; service-role client only. |
| Schema migrations | **None.** Reuses existing Phase 2 schema. |
| Remote `corent-dev` apply / seed | **Not run.** The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** |
| Admin dashboard redesign | **None.** `/admin/dashboard` is untouched; the cockpit is a new sibling route under `/admin/`. |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** Only existing utility classes + BW tokens; no third color. |
| Feedback workflow / status mutation | **None.** Feedback rows are read; the cockpit does not transition `new` → `reviewed` / `archived`. A future slice can add a tiny update-status action if needed. |
| Provider-specific payment language (Toss, PG, etc.) | **None.** Architecture stays language-neutral and provider-neutral. |

## Test coverage (44 new cases)

`src/server/persistence/supabase/feedbackRepository.test.ts`: **+4** cases
- new fail-closed default for `listRecentFeedbackSubmissions`
- repo error → `[]`
- happy path: orders by `created_at desc`, clamps limit to 200, DTO has bounded fields only
- clamps too-small limit to 1

`src/server/persistence/supabase/listingRepository.test.ts`: **+2** cases
- new fail-closed default for `listRecentListings`
- happy path: rows ordered by `created_at desc`, no `eq("status", ...)` filter, clamped limit, mapper returns `privateSerialNumber: undefined`, select clause never names `listing_secrets`
- repo error → `[]`

`src/server/admin/founderCockpitData.test.ts`: **9** new cases
- non-founder → `forbidden`; repos not touched
- mock backend + founder → `inactive`; repos not touched
- supabase + founder → `ready` with founder email and ISO `generatedAt`
- listings DTO never echoes `rawSellerInput`, `privateSerialNumber`, `safetyCode`, `humanReviewNotes`, `verification.*`
- requests DTO never echoes `payment.sessionId`, `payment.failureReason`, `settlement.blockedReason`, `settlement.settledAt`, `sellerPayout`, `platformFee`, `safetyDeposit`, claim/trust slots
- feedback DTO key set is exactly the documented 10 fields (no extras)
- per-source repo throws collapse to empty without leaking SQL / env / stack
- limit clamped to `[1, 200]` for every repo call
- import-block scope guard

`src/lib/client/publishListingClient.test.ts`: **10** new cases
- payload forwarding: only `{ listingId }` reaches the action; 7 forged authority keys excluded
- every IntentResult code mapped (`ok`, `unauthenticated`, `not_found`, `input`, `unsupported`, `internal/other` → `error`)
- thrown action → `{ kind: "error" }` with no leak
- import-block scope guard

`src/components/PublishListingButton.test.ts`: **8** new static-text invariants
- no `@/server/**` import; adapter hop only; no payment/claim/trust/handoff/notification/mock-session imports
- single `publishListingFromCockpit({...})` call site; only `listingId`; 9 forbidden authority keys
- copy uses 공개로 승인 / 이미 공개됨; never 결제 / 환불 / 정산 완료 / 보험 / 보장 in the runtime body (comments stripped before scan)
- calm Korean copy for every blocked-state reason
- design-system color discipline

`src/app/admin/cockpit/page.test.ts`: **11** new static-text invariants
- `forbidden` → `notFound()` (fail-closed 404)
- `inactive` panel renders explicit "서버 백엔드가 아직 활성화되지 않았어요" + `CORENT_BACKEND_MODE=supabase` hint
- `dynamic = "force-dynamic"` set
- imports orchestrator only via `@/server/admin/founderCockpitData`
- no `getMockSellerSession` / `getMockRenterSession` / `@/lib/auth/mockSession` import
- no `@/lib/adapters/persistence` / `getPersistence` import
- no payment / claim / trust / handoff / notification / lifecycle import
- pre-payment posture copy ("결제·정산은 아직 연결되어 있지 않아요" + "승인·거절·환불은")
- never 결제 완료 / 대여 확정 / 보증금 청구 / 보험 / 보장 / 정산 완료
- design-system color discipline

Existing 945 tests still pass. **Total: 989 tests across 71 files.**

## What lands next

Slice 4 closes the closed-alpha cockpit minimum surface.
Recommended next steps, in priority order:

1. **Remote smoke ops** — the founder runs the closed-alpha smoke
   plan ([`docs/corent_closed_alpha_smoke_test_plan.md`](corent_closed_alpha_smoke_test_plan.md))
   against `corent-dev`. This is a separate ops step performed
   only by the founder; agents do not run remote commands.

2. **Hardening pass (small)** — minor follow-ups that may surface
   from the smoke: seller display name resolution from
   `seller_profiles` (currently the projection mapper falls back
   to UUID), founder-publish UI nav link from `/admin/dashboard`
   to `/admin/cockpit`, optional feedback status workflow.

3. **Seller approve / reject server request lifecycle** — the
   first transition past `requested` (today's only persisted
   server status). Stays narrow: no payment, no pickup, no
   settlement.

Out of scope regardless of which slice lands next: payment /
deposit / escrow / refund / settlement / checkout, pickup /
return / handoff lifecycle, claim / dispute / trust events,
notifications.

## References

- `src/server/admin/founderCockpitData.ts` (orchestrator + DTOs)
- `src/server/admin/founderCockpitData.test.ts`
- `src/server/admin/auth.ts` (`requireFounderSession` — reused)
- `src/server/persistence/supabase/feedbackRepository.ts`
  (`listRecentFeedbackSubmissions`)
- `src/server/persistence/supabase/listingRepository.ts`
  (`listRecentListings`)
- `src/server/persistence/supabase/rentalIntentRepository.ts`
  (`listRentalIntents` — reused)
- `src/server/persistence/supabase/marketplaceAggregates.ts`
  (`readMarketplaceAggregates` — reused)
- `src/server/listings/publishListing.ts` (Bundle 1 Part 3 —
  publish action; founder gate is here)
- `src/lib/client/publishListingClient.ts` (client adapter)
- `src/components/PublishListingButton.tsx` (founder publish UI)
- `src/app/admin/cockpit/page.tsx` (the cockpit route)
- `docs/corent_validation_bundle1_part3_publication_note.md`
  (publication action — Bundle 1 Part 3)
- `docs/corent_validation_bundle2_slice3_seller_request_visibility_note.md`
  (Slice 3 — seller-side request visibility)
- `docs/corent_closed_alpha_smoke_test_plan.md` (the founder-only
  remote runbook the cockpit is the local companion to)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`

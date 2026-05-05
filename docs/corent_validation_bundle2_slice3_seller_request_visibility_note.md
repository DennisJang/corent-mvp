# Validation Bundle 2, Slice 3 — seller request visibility

Bundle 2, Slice 3 closes the minimum visible marketplace loop:

> seller supply (chat intake → server draft) → founder publish →
> renter request (server detail + UI) → **seller sees the
> incoming request on their dashboard.**

This is **read-only request visibility**. No approve / reject /
cancel / payment / lifecycle. The seller can SEE who has
requested their listings; transitioning a request out of
`requested` is a future slice.

## Shape of the change

Slice 3 adds one repository helper, one server action, one
client adapter, and a new dashboard block. It also gates the
existing local pending/active blocks to `chatIntakeMode === "local"`
so server mode never mixes local mock requests with server data.

### Repository

[`src/server/persistence/supabase/rentalIntentRepository.ts`](../src/server/persistence/supabase/rentalIntentRepository.ts)

```ts
listRentalIntentsBySeller(sellerId: string, limit = 100): Promise<RentalIntent[]>
```

- Validates the seller id as a uuid; returns `[]` on a malformed
  value or when the marketplace client is unavailable.
- Filters by `seller_id` server-side via the Postgres `eq`
  predicate; clamps the limit to `[1, 200]`.
- Does **not** filter by status — the dashboard surfaces every
  state today (only `requested` rows exist, but the function is
  forward-compatible with future statuses).
- Does **not** join `listing_secrets`; does not select payment
  session ids beyond what `rowToIntent` already maps; mapper is
  responsible for not exposing `borrower_id` on the action's DTO.

Re-exported from
[`src/server/persistence/supabase/index.ts`](../src/server/persistence/supabase/index.ts).

### Server action

[`src/server/rentals/listSellerRentalRequests.ts`](../src/server/rentals/listSellerRentalRequests.ts)

```ts
export type SellerDashboardRequest = {
  id: string;
  listingId: string;
  productName: string;
  productCategory: CategoryId;
  borrowerDisplayName: string | null;
  durationDays: 1 | 3 | 7;
  status: RentalIntentStatus;
  rentalFee: number;
  safetyDeposit: number;
  borrowerTotal: number;
  pickupArea: string | null;
  createdAt: string;
};

export type SellerRentalRequestsResult =
  | { mode: "local" }
  | { mode: "server"; requests: SellerDashboardRequest[] };

export async function listSellerRentalRequestsAction()
  : Promise<IntentResult<SellerRentalRequestsResult>>;
```

Decision tree (mirrors PR 5G's `listSellerOwnedListings`):

| `getBackendMode()` | actor | response |
| --- | --- | --- |
| not `"supabase"` | (any) | `intentOk({ mode: "local" })` |
| `"supabase"` | `null` | `intentErr("unauthenticated", …)` (via runner) |
| `"supabase"` | mock-sourced (defense in depth) | `intentOk({ mode: "local" })` |
| `"supabase"` | renter actor under `prefer: "seller"` | `intentErr("ownership", …)` |
| `"supabase"` | supabase seller actor | `intentOk({ mode: "server", requests })` |
| `"supabase"` | repo throws | `intentErr("internal", "list_seller_requests_failed")` |

Hard rules:

- The payload is empty. The seller id is **never** read from the
  client. The runtime ignores `sellerId` / `profileId` / `role` /
  `capability` / `status` / `borrowerId` / `adminId` field a
  forged caller attaches; the handler only reads `actor.sellerId`.
- The DTO is a tight allowlist. **Notably absent**: `borrowerId`
  (UUID), `seller_id` (the seller already knows their own id),
  `payment.sessionId`, `payment.failureReason`, `settlement.*`,
  `humanReviewNotes`, internal admin / trust / claim slots. The
  seller dashboard renders only this DTO.
- DB throws map to `intentErr("internal", …)` via the runner; no
  table names, env values, SQL, row payloads, or service-role
  hints reach the client.

### Client adapter

[`src/lib/client/sellerDashboardRequestsClient.ts`](../src/lib/client/sellerDashboardRequestsClient.ts)

```ts
export type SellerRequestsLoadResult =
  | { kind: "local" }
  | { kind: "server"; requests: SellerDashboardRequest[] }
  | { kind: "error" };

export async function loadSellerRequests()
  : Promise<SellerRequestsLoadResult>;
```

The adapter normalizes the typed `IntentResult` into the same
three-state shape PR 5G's `sellerDashboardListingsClient` uses.
**No silent fallback**: a server-mode failure surfaces as
`{ kind: "error" }`; the dashboard renders zero rows + the
failure caption, never local mock fixtures as substitutes.

### Dashboard wiring

[`src/components/SellerDashboard.tsx`](../src/components/SellerDashboard.tsx):

- Adds `serverRequestsState` state, loaded via `loadSellerRequests`
  on mount (when the chat intake mode probe reports `server`)
  and on every dashboard refresh.
- The existing local-mode pending+active section is now wrapped
  in `{chatIntakeMode === "local" ? … : <ServerRequestsBlock />}`
  so server mode never renders local mock requests.
- New `ServerRequestsBlock` component (read-only):
  - Empty: "아직 서버 요청이 없어요."
  - Error: "서버 요청을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요."
  - Loading: "서버 요청을 불러오는 중이에요."
  - Pre-payment caption: "베타: 요청만 표시돼요. 결제·정산은 아직 연결되어 있지 않아요."
  - Deferred-actions caption: "승인·거절·결제 단계는 아직 준비 중이에요. 지금은 요청 도착만 확인할 수 있어요."
  - Renders `productName · borrowerDisplayName · durationDays · borrowerTotal (참고용) · pickupArea? · statusLabel`. No buttons, no `onClick` handlers.

## Seller request visibility posture

| Concern | Status |
| --- | --- |
| Cross-seller leakage | **Filtered server-side.** Repo `WHERE seller_id = $1` plus action handler that only reads `actor.sellerId`. Forged client payloads ignored. |
| Borrower UUID exposure | **Not exposed.** DTO has no `borrowerId` slot — visibility is by handle (`borrowerDisplayName`) only. |
| Borrower email / phone / contact | **Not exposed.** None of these fields exist on `rental_intents` per the Phase 2 schema; the schema's PII guardrail forbids them. |
| Payment internals (`session_id`, `failure_reason`) | **Not exposed.** No DTO slot. The action's privacy test asserts these strings never appear on the response. |
| Settlement internals (`settled_at`, `blocked_reason`, `seller_payout`) | **Not exposed.** No DTO slot. |
| `listing_secrets` | **Not joined** anywhere on this path. |
| Internal admin review / trust / claim slots | **Not exposed.** No DTO slot. |
| Status mutation | **Not implemented.** The action and the block are read-only; no approve / decline / cancel / payment buttons are rendered. |

## Local vs. server mode behavior

| Surface | Mock / default mode (existing) | Supabase mode (new) |
| --- | --- | --- |
| Dashboard pending/active row | `PendingBlock` + `ActiveBlock` against `effectiveRentals` (local persistence + `MOCK_RENTAL_INTENTS` fallback) — **unchanged** | Hidden. Replaced with `ServerRequestsBlock`. No mixing. |
| Dashboard server requests block | Not rendered | Renders server DTO only. No local mock data substitution. |
| Listings table (PR 5G) | Local listings + `LISTED_ITEMS` fixture | Server listings only |
| Approve / decline buttons | Existing local-mode buttons (drive `rentalService.approveRequest` / `declineRequest`) | **Not rendered.** Read-only this slice. |
| Handoff / claim / failure / trust blocks | Existing local-mode behavior | **Unchanged in this slice.** Those sections only render when local rentals are in the relevant states; in supabase mode + closed alpha those rentals don't yet exist server-side, so the conditional sections won't appear anyway. A future slice will explicitly gate them. |

## What Slice 3 does NOT do

| Concern | Status |
| --- | --- |
| Seller approve / reject server request | **Not added.** Future slice. |
| Renter cancel server request | **Not added.** |
| Payment / deposit / escrow / refund / settlement / checkout | **None.** UI copy is explicit: "결제·정산은 아직 연결되어 있지 않아요." |
| Pickup / return / handoff lifecycle | **None.** All lifecycle columns sit at safe defaults. |
| Claim / dispute / trust-event externalization | **None.** |
| Notification infrastructure | **None.** |
| Broad RLS policies / public DB grants | **None.** Deny-by-default holds. |
| Schema migrations | **None.** Reuses existing `rental_intents` Phase 2 table. |
| Remote `corent-dev` apply / seed | **Not run.** The closed-alpha SQL template was not executed. |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** |
| Visible design changes (palette, line hierarchy, type scale, spacing scale, radius, motion) | **None.** Only existing utility classes + BW tokens; no third color. |

## Test coverage (33 new cases)

`src/server/persistence/supabase/rentalIntentRepository.test.ts` — **+5** cases:
- new fail-closed default for `listRentalIntentsBySeller`
- malformed seller id returns `[]` without touching the client
- empty / undefined seller id returns `[]`
- happy path: filters by `seller_id`, orders by `updated_at desc`, never filters by status
- repo errors collapse to `[]`

`src/server/rentals/listSellerRentalRequests.test.ts` — **11** cases:
- mock backend (default + explicit `"mock"`) → `local`; repo not touched
- supabase + null actor → `unauthenticated`
- supabase + mock-sourced actor → `local` (defense in depth)
- supabase + renter actor → `ownership`
- supabase + supabase seller actor → server DTO with correct shape (id / listingId / productName / borrowerDisplayName / durationDays / status / rentalFee / safetyDeposit / borrowerTotal / pickupArea / createdAt)
- DTO never echoes `PAYMENT_SESSION_DO_NOT_LEAK`, `PAYMENT_FAILURE_DO_NOT_LEAK`, `SETTLEMENT_BLOCKED_DO_NOT_LEAK`, `borrowerId` UUID, `sellerId`, `sessionId`, `payment`, `settlement`, `blockedReason`, `sellerPayout`, `platformFee`, `humanReviewNotes`, `trustScore`, `claimReview`
- forged payload (`sellerId` / `profileId` / `role` / `capability` / `status` / `borrowerId` / `adminId`) is ignored — repo called with the actor's id, not any forged value
- repo throw → typed `internal` with no SQL/env/stack leak
- resolver invoked with `prefer: "seller"`
- import-block scope guard (no rental service / payment / claim / trust / handoff / notification / `saveRentalIntent` / `appendRentalEvent`)

`src/lib/client/sellerDashboardRequestsClient.test.ts` — **7** cases:
- `ok+local` → `{ kind: "local" }`
- `ok+server` → `{ kind: "server", requests }` with verbatim DTO
- every typed failure code (`unauthenticated` / `ownership` / `input` / `not_found` / `conflict` / `unsupported` / `internal`) → `{ kind: "error" }`
- thrown action → `{ kind: "error" }` with no underlying message leak
- no silent local fallback on server-mode failure
- import-block scope guard

`src/components/SellerDashboard.test.ts` — **10** cases:
- imports `loadSellerRequests` + types from the established client adapter hop
- does NOT import `@/server/**` directly
- local pending/active section is wrapped behind `chatIntakeMode === "local"`
- `<ServerRequestsBlock state={serverRequestsState} />` is rendered in the server branch
- mode-flip effect calls `loadSellerRequests` in server mode and resets to null in local mode
- pre-payment beta caption present
- empty / failure / deferred-actions copy present
- banned active phrases (결제 완료 / 대여 확정 / 보증금 청구 / 보험 / 보장 / 환불 / 정산 완료) are not present inside the new block
- block is read-only: no `<Button …>`, no `onClick=`, no 승인하기 / 거절하기 / 취소하기 / 결제하기 copy

Existing 912 tests still pass. **Total: 945 tests across 67 files.**

## What lands next

1. **Seller approve / reject server request action + UI** — first
   lifecycle transition past `requested` (today's only persisted
   server status). Stays deliberately narrow: no payment, no
   pickup, no settlement.
2. **Renter request cancellation (server mode).**
3. **Storefront page (`/sellers/[sellerId]`) supabase-mode bridge**
   — carry-over from Bundle 2 Slice 1.

Out of scope for the next slice regardless of which one lands:
payment / deposit / escrow / refund / settlement / checkout,
pickup / return / handoff lifecycle, claim / dispute / trust
events, notifications.

## References

- `src/server/persistence/supabase/rentalIntentRepository.ts` (`listRentalIntentsBySeller`)
- `src/server/rentals/listSellerRentalRequests.ts` (server action)
- `src/lib/client/sellerDashboardRequestsClient.ts` (client adapter)
- `src/components/SellerDashboard.tsx` (mode-gated render block; `ServerRequestsBlock`)
- `docs/corent_validation_bundle1_part4_renter_request_note.md` (Bundle 1 Part 4 — request creation)
- `docs/corent_validation_bundle2_slice2_renter_request_ui_note.md` (Slice 2 — renter UI)
- `docs/corent_closed_alpha_smoke_test_plan.md` (Slice 3 companion — closed-alpha smoke runbook)
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_legal_trust_architecture_note.md`

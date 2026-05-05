"use server";

// Bundle 2, Slice 3 — server-side read of the authenticated seller's
// own incoming rental requests, scoped to the seller dashboard's
// server-mode requests block.
//
// This is READ-ONLY request visibility. No status mutation, no
// approve/reject, no payment, no lifecycle. Sellers can SEE who has
// requested their listings; transitioning a request out of
// `requested` is a future slice.
//
// Why this action mirrors `listSellerOwnedListingsAction` shape:
//
//   - The dashboard's existing PR 5G listings block already follows
//     the `{ mode: "local" } | { mode: "server", … }` envelope.
//     Reusing the shape lets the dashboard branch on the same
//     mode signal without growing a new state machine.
//
//   - Authorization runs entirely on the server-resolved actor.
//     The payload is empty; the seller id is NEVER read from the
//     client. Any `sellerId`, `profileId`, `role`, `capability`,
//     `status`, or admin/trust flag a forged caller attaches is
//     ignored — the type does not declare them and the runtime
//     never reads them.
//
// Hard rules:
//
//   - Mock / default backend mode → `intentOk({ mode: "local" })`.
//     The dashboard then renders its existing local-mock pending /
//     active blocks (which read from `getPersistence()`); we never
//     mix local mock requests with the server response.
//
//   - Defense in depth: even in supabase backend mode, a mock-
//     sourced actor (which the resolver should not mint, but a
//     future drift could) collapses to `{ mode: "local" }`. The
//     service-role read is gated to genuinely supabase-sourced
//     seller actors.
//
//   - Scoping is enforced at the repo via `WHERE seller_id = $1`.
//     The action layer is the authorization gate by reading
//     `actor.sellerId` — a forged payload `sellerId` field cannot
//     reach the repo because no payload key exists.
//
//   - The DTO is a tight allowlist of dashboard-rendered fields.
//     Notably absent: `borrowerId` (UUID; the seller does not need
//     it for visibility), `seller_id` (the seller already knows
//     their own id), `payment.sessionId`, `payment.failureReason`,
//     `settlement.*`, `pickup_method` beyond "direct" copy, any
//     internal admin/trust/claim slot.
//
//   - Errors are typed and non-secret. Repo throws map to
//     `intentErr("internal", "list_seller_requests_failed")`; SQL,
//     env values, table names, and row payloads never reach the
//     client.
//
// References:
//   - `src/server/listings/listSellerOwnedListings.ts` (PR 5G — the
//     analogous listings block; same envelope)
//   - `src/server/persistence/supabase/rentalIntentRepository.ts`
//     (`listRentalIntentsBySeller` — server-only seller-scoped read)
//   - `src/server/rentals/createRentalRequest.ts` (Bundle 1 Part 4 —
//     the only path that creates the rows this action surfaces)
//   - `docs/corent_validation_bundle2_slice3_seller_request_visibility_note.md`

import type { CategoryId } from "@/domain/categories";
import type { RentalIntent, RentalIntentStatus } from "@/domain/intents";
import { getBackendMode } from "@/server/backend/mode";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import { listRentalIntentsBySeller } from "@/server/persistence/supabase/rentalIntentRepository";

// Tight DTO — only the fields the seller dashboard's requests block
// actually renders. Adding a field here is a deliberate decision;
// growing the surface widens the privacy contract.
export type SellerDashboardRequest = {
  id: string;
  listingId: string;
  productName: string;
  productCategory: CategoryId;
  // Borrower's chosen handle. Bounded text (≤ 60 chars) at the DB
  // level. May be `null` when the rental row was inserted without a
  // display name (the schema permits null on `borrower_display_name`).
  // We deliberately do NOT echo `borrower_id` (UUID) — visibility is
  // by handle only.
  borrowerDisplayName: string | null;
  durationDays: 1 | 3 | 7;
  // Surfaces the canonical row status. `requested` today; future
  // slices may add `seller_approved` / `borrower_cancelled` etc.
  status: RentalIntentStatus;
  // Reference-only amounts. The client renders these with explicit
  // beta-posture copy; no real charge / hold / settlement happens.
  rentalFee: number;
  safetyDeposit: number;
  borrowerTotal: number;
  // Coarse pickup area only (≤ 60 chars at the DB level). Never an
  // exact address; `listing_secrets.pickup_area_internal` is never
  // joined.
  pickupArea: string | null;
  createdAt: string;
};

export type SellerRentalRequestsResult =
  | { mode: "local" }
  | { mode: "server"; requests: SellerDashboardRequest[] };

// Empty payload. The seller id is resolved server-side from the
// actor; any client-supplied field is ignored (and not declared
// here, so a `@ts-expect-error` cast is required to even attempt
// passing one).
export type ListSellerRentalRequestsPayload = Record<string, never>;

function projectForDashboard(intent: RentalIntent): SellerDashboardRequest {
  // The DB schema constrains `duration_days` to 1 / 3 / 7; the cast
  // narrows the runtime value to the canonical literal type. If a
  // future schema change widens the column, the cast will surface
  // the drift via type-check.
  const durationDays = intent.durationDays as 1 | 3 | 7;
  return {
    id: intent.id,
    listingId: intent.productId,
    productName: intent.productName,
    productCategory: intent.productCategory,
    borrowerDisplayName: intent.borrowerName ?? null,
    durationDays,
    status: intent.status,
    rentalFee: intent.amounts.rentalFee,
    safetyDeposit: intent.amounts.safetyDeposit,
    borrowerTotal: intent.amounts.borrowerTotal,
    pickupArea: intent.pickup.locationLabel ?? null,
    createdAt: intent.createdAt,
  };
}

export async function listSellerRentalRequestsAction(): Promise<
  IntentResult<SellerRentalRequestsResult>
> {
  return runIntentCommand<
    ListSellerRentalRequestsPayload,
    SellerRentalRequestsResult
  >(
    async ({ actor }) => {
      // Mock / default backend: never reach Supabase. The dashboard
      // continues to render local-mock pending/active blocks via
      // its existing local read path.
      if (getBackendMode() !== "supabase") {
        return intentOk({ mode: "local" });
      }
      // Defense in depth: the resolver does not mint a mock-
      // sourced actor in supabase mode, but we re-check before
      // issuing the service-role read so a future drift cannot
      // route a mock identity into a shared-DB query.
      if (actor.source !== "supabase") {
        return intentOk({ mode: "local" });
      }
      if (actor.kind !== "seller") {
        // The runner already enforces `expectedActorKind: "seller"`
        // and would have returned `ownership` upstream; this is the
        // belt for the suspenders.
        return intentErr("ownership", "only sellers can list own requests");
      }
      try {
        const rows = await listRentalIntentsBySeller(actor.sellerId);
        return intentOk({
          mode: "server",
          requests: rows.map(projectForDashboard),
        });
      } catch {
        return intentErr("internal", "list_seller_requests_failed");
      }
    },
    {} as ListSellerRentalRequestsPayload,
    { expectedActorKind: "seller", prefer: "seller" },
  );
}

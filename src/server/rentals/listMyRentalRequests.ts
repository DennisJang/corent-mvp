"use server";

// Bundle 3 Slice 2 — server-side read of the authenticated borrower's
// own outgoing rental requests, scoped to the `/requests` page.
//
// This is READ-ONLY request visibility from the borrower's side. No
// status mutation, no payment, no borrower-cancel action. Borrowers
// can SEE the status of every request they have sent; mutating those
// requests is a future slice.
//
// Mirrors `listSellerRentalRequestsAction` shape (Bundle 2 Slice 3) so
// the `/requests` page can branch on the same `local | server`
// envelope the dashboard uses. Authorization runs entirely on the
// server-resolved actor — `borrower_id` is NEVER read from the
// client.
//
// Hard rules:
//
//   - Mock / default backend mode → `intentOk({ mode: "local" })`.
//     The page renders a calm "this beta surface uses the server
//     backend; nothing to show in mock mode" copy.
//
//   - Defense in depth: even in supabase backend mode, a mock-
//     sourced actor (which the resolver should not mint, but a
//     future drift could) collapses to `{ mode: "local" }` so a
//     mock identity cannot route into a shared-DB query.
//
//   - Scoping is enforced at the repo via `WHERE borrower_id = $1`.
//     The action layer is the authorization gate by reading
//     `actor.borrowerId` — a forged payload `borrowerId` field
//     cannot reach the repo because no payload key exists.
//
//   - The DTO is a tight allowlist of fields the `/requests` page
//     renders. Notably absent: `borrowerId` (the viewer is
//     themselves), `seller_id` (UUID), `payment.sessionId`,
//     `payment.failureReason`, `payment.status`, `settlement.*`,
//     `platformFee`, `sellerPayout`, `safetyDeposit`, raw seller
//     input, listing secrets, admin notes, internal trust fields.
//
//   - Errors are typed and non-secret. Repo throws map to
//     `intentErr("internal", "list_my_requests_failed")`; SQL,
//     env values, table names, and row payloads never reach the
//     client.
//
// References:
//   - `src/server/rentals/listSellerRentalRequests.ts` (Bundle 2
//     Slice 3 — the analogous seller-scoped read)
//   - `src/server/persistence/supabase/rentalIntentRepository.ts`
//     (`listRentalIntentsByBorrower` — server-only borrower read)

import type { CategoryId } from "@/domain/categories";
import type { RentalIntent, RentalIntentStatus } from "@/domain/intents";
import { getBackendMode } from "@/server/backend/mode";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import { listRentalIntentsByBorrower } from "@/server/persistence/supabase/rentalIntentRepository";

// Tight DTO — only the fields the `/requests` page renders. Adding a
// field here is a deliberate decision; growing the surface widens the
// borrower-side privacy contract.
export type MyRentalRequest = {
  id: string;
  listingId: string;
  productName: string;
  productCategory: CategoryId;
  // Seller's chosen public handle. Bounded text (≤ 60 chars) at the
  // DB level. May be `null` when the rental row was inserted before
  // the seller set a display name. We deliberately do NOT echo
  // `seller_id` (UUID); visibility is by handle only.
  sellerDisplayName: string | null;
  durationDays: 1 | 3 | 7;
  // Surfaces the canonical row status. `requested` /
  // `seller_approved` / `seller_cancelled` today; future slices may
  // surface more states but the page caption stays beta-honest.
  status: RentalIntentStatus;
  // Reference-only amounts. The page renders `borrowerTotal` with
  // explicit beta-posture copy; no real charge / hold / settlement
  // happens in this beta window.
  rentalFee: number;
  borrowerTotal: number;
  // Coarse pickup area only (≤ 60 chars at the DB level). Never an
  // exact address; `listing_secrets.pickup_area_internal` is never
  // joined.
  pickupArea: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MyRentalRequestsResult =
  | { mode: "local" }
  | { mode: "server"; requests: MyRentalRequest[] };

// Empty payload. The borrower id is resolved server-side from the
// actor; any client-supplied field is ignored (and not declared
// here, so a `@ts-expect-error` cast is required to even attempt
// passing one).
export type ListMyRentalRequestsPayload = Record<string, never>;

function projectForBorrower(intent: RentalIntent): MyRentalRequest {
  // The DB schema constrains `duration_days` to 1 / 3 / 7; the cast
  // narrows the runtime value to the canonical literal type.
  const durationDays = intent.durationDays as 1 | 3 | 7;
  return {
    id: intent.id,
    listingId: intent.productId,
    productName: intent.productName,
    productCategory: intent.productCategory,
    sellerDisplayName: intent.sellerName.length > 0 ? intent.sellerName : null,
    durationDays,
    status: intent.status,
    rentalFee: intent.amounts.rentalFee,
    borrowerTotal: intent.amounts.borrowerTotal,
    pickupArea: intent.pickup.locationLabel ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export async function listMyRentalRequestsAction(): Promise<
  IntentResult<MyRentalRequestsResult>
> {
  return runIntentCommand<
    ListMyRentalRequestsPayload,
    MyRentalRequestsResult
  >(
    async ({ actor }) => {
      // Mock / default backend: never reach Supabase.
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
      if (actor.kind !== "renter") {
        // The runner already enforces `expectedActorKind: "renter"`
        // and would have returned `ownership` upstream; this is the
        // belt for the suspenders.
        return intentErr(
          "ownership",
          "only borrowers can list own requests",
        );
      }
      try {
        const rows = await listRentalIntentsByBorrower(actor.borrowerId);
        return intentOk({
          mode: "server",
          requests: rows.map(projectForBorrower),
        });
      } catch {
        return intentErr("internal", "list_my_requests_failed");
      }
    },
    {} as ListMyRentalRequestsPayload,
    { expectedActorKind: "renter", prefer: "renter" },
  );
}

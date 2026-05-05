"use server";

// Validation Bundle 1, Part 4 — server-backed renter request creation.
//
// Adds the smallest safe path for an authenticated renter to create
// a `rental_intents` row at status='requested' against an approved
// public listing. This is REQUEST CREATION ONLY — no payment, no
// pickup/return lifecycle, no claim/dispute/trust events, no
// notifications.
//
// Hard rules:
//
//   - The client may supply ONLY `listingId` and `durationDays`.
//     `sellerId`, `borrowerId`, `price`, `amounts`, `status`,
//     `payment`, `pickup`, `return`, `settlement`, `adminId`,
//     `role`, `capability`, and any trust/claim flag a forged
//     caller attaches are ignored — the type does not declare
//     them and the runtime never reads them.
//
//   - All authority-bearing fields are derived server-side:
//       - the canonical listing is reloaded from the marketplace
//         repository,
//       - the listing's `seller_id` becomes the rental's seller,
//       - the rental fee is read from `listing.pricing` keyed by
//         the validated duration,
//       - the safety-deposit / platform-fee / borrower-total math
//         runs through `calculateRentalAmounts`,
//       - the borrower id comes from the resolved Supabase actor,
//         never from the payload.
//
//   - The action runs ONLY in supabase backend mode AND only with
//     a Supabase-sourced renter actor. Mock backend or a
//     mock-sourced actor in supabase mode returns a typed
//     `unsupported` envelope so the local browser demo's
//     `rentalService.createRequestFromProductId` path stays
//     disjoint from this server path.
//
//   - The listing must exist AND be `status='approved'`. Any
//     other status (draft / ai_extracted / verification_incomplete /
//     human_review_pending / rejected) collapses to
//     `not_found` so a renter cannot enumerate non-public listings
//     by id.
//
//   - No payment / deposit / settlement money movement is
//     executed. `payment.status` defaults to `not_started`,
//     `pickup.status` to `not_scheduled`, `return.status` to
//     `not_due`, `settlement.status` to `not_ready`. The Phase 2
//     schema's CHECK constraints already enforce these enums.
//
//   - The response DTO is a tight allowlist (`{ id, status,
//     durationDays, rentalFee, safetyDeposit, borrowerTotal,
//     productName, productCategory }`). It does NOT echo
//     `sellerId`, `borrowerId`, `rawSellerInput`,
//     `privateSerialNumber`, verification internals, internal
//     review notes, payment session ids, or any other private
//     field.
//
//   - Errors are typed and non-secret. Repo / db throws map to
//     `intentErr("internal", "create_rental_request_failed")`;
//     SQL, env values, table names, and row payloads never
//     reach the client.
//
// References:
//   - `src/server/actors/resolveServerActor.ts` (renter resolver)
//   - `src/server/intents/intentCommand.ts` (runner)
//   - `src/server/persistence/supabase/listingRepository.ts`
//     (`getListingById`)
//   - `src/server/persistence/supabase/rentalIntentRepository.ts`
//     (`saveRentalIntent`, `appendRentalEvent`)
//   - `src/lib/services/publicListingService.ts` (allowlist
//     projection — drafts stay non-public; this action mirrors
//     the same status='approved' gate)
//   - `docs/corent_validation_bundle1_part4_renter_request_note.md`

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type { RentalIntent } from "@/domain/intents";
import { calculateRentalAmounts } from "@/lib/pricing";
import { getBackendMode } from "@/server/backend/mode";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import { getListingById } from "@/server/persistence/supabase/listingRepository";
import {
  appendRentalEvent,
  saveRentalIntent,
} from "@/server/persistence/supabase/rentalIntentRepository";
import { validateUuid } from "@/server/persistence/supabase/validators";

// Client-supplied payload. Notably absent: sellerId, borrowerId,
// price/amounts, status, payment/pickup/return/settlement, adminId,
// role, capability, approval. These would be forged authority signals;
// the action never reads them.
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

const ALLOWED_DURATIONS: ReadonlySet<number> = new Set([1, 3, 7]);

function priceForDuration(
  pricing: { oneDay: number; threeDays: number; sevenDays: number },
  d: DurationDays,
): number {
  return d === 1
    ? pricing.oneDay
    : d === 3
      ? pricing.threeDays
      : pricing.sevenDays;
}

export async function createRentalRequestAction(
  payload: CreateRentalRequestPayload,
): Promise<IntentResult<CreateRentalRequestResult>> {
  return runIntentCommand<
    CreateRentalRequestPayload,
    CreateRentalRequestResult
  >(
    async ({ actor, payload }) => {
      // Server-backed request creation runs only against the
      // Supabase backend. The local demo path
      // (`rentalService.createRequestFromProductId`) stays disjoint
      // — we never silently mix the two.
      if (getBackendMode() !== "supabase") {
        return intentErr(
          "unsupported",
          "rental_request_requires_server_backend",
        );
      }
      // Defense in depth: the resolver should not mint a mock-
      // sourced actor in supabase mode, but we re-check before
      // issuing the service-role write so a future drift cannot
      // route a mock identity into a shared-DB write.
      if (actor.source !== "supabase") {
        return intentErr(
          "unsupported",
          "rental_request_requires_server_backend",
        );
      }
      if (actor.kind !== "renter") {
        // The runner already enforces `expectedActorKind: "renter"`
        // and would have returned `ownership` upstream; this is
        // the belt for the suspenders.
        return intentErr(
          "ownership",
          "only renters can create rental requests",
        );
      }

      // Validate the only two client-supplied fields.
      const idRes = validateUuid(payload?.listingId);
      if (!idRes.ok) return intentErr("input", "listing_id_invalid");
      if (!ALLOWED_DURATIONS.has(payload?.durationDays as number)) {
        return intentErr("input", "duration_invalid");
      }
      const durationDays = payload.durationDays as DurationDays;

      let listing;
      try {
        listing = await getListingById(idRes.value);
      } catch {
        return intentErr("internal", "create_rental_request_failed");
      }
      // Collapse "missing" and "non-approved" to the same response —
      // a renter must not be able to enumerate draft / in-review /
      // rejected listings by trying ids.
      if (!listing || listing.status !== "approved") {
        return intentErr("not_found", "listing_not_found");
      }

      const rentalFee = priceForDuration(listing.pricing, durationDays);
      const amounts = calculateRentalAmounts(
        rentalFee,
        listing.item.estimatedValue,
      );

      const id = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const at = new Date().toISOString();

      // Build the rental intent entirely from canonical / actor /
      // computed values. The payload is no longer referenced past
      // this point.
      const intent: RentalIntent = {
        id,
        productId: listing.id,
        productName: listing.item.name,
        productCategory: listing.item.category,
        sellerId: listing.sellerId,
        sellerName: "",
        borrowerId: actor.borrowerId,
        borrowerName: actor.displayName,
        status: "requested",
        durationDays,
        amounts,
        payment: {
          provider: "mock",
          status: "not_started",
        },
        pickup: {
          method: "direct",
          status: "not_scheduled",
          locationLabel: listing.item.pickupArea,
        },
        return: { status: "not_due" },
        settlement: {
          status: "not_ready",
          sellerPayout: amounts.sellerPayout,
        },
        createdAt: at,
        updatedAt: at,
      };

      try {
        const saved = await saveRentalIntent(intent);
        if (!saved.ok) {
          return intentErr("internal", "create_rental_request_failed");
        }
        const appended = await appendRentalEvent({
          id: eventId,
          rentalIntentId: id,
          fromStatus: null,
          toStatus: "requested",
          at,
          actor: "borrower",
          reason: "rental_request_created",
        });
        if (!appended.ok) {
          return intentErr("internal", "create_rental_request_failed");
        }
      } catch {
        return intentErr("internal", "create_rental_request_failed");
      }

      return intentOk({
        id,
        status: "requested",
        durationDays,
        rentalFee: amounts.rentalFee,
        safetyDeposit: amounts.safetyDeposit,
        borrowerTotal: amounts.borrowerTotal,
        productName: listing.item.name,
        productCategory: listing.item.category,
      });
    },
    payload,
    { expectedActorKind: "renter", prefer: "renter" },
  );
}

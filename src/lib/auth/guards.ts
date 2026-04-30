// Ownership and party-of-rental guards. Small reusable assertions that
// throw a typed error on mismatch. Use them at the boundary of any flow
// that mutates a listing or rental on behalf of a specific user.
//
// CRITICAL — these guards are necessary but not sufficient.
//
//   - They check that an in-memory object's `sellerId` / `borrowerId`
//     matches the actor the caller claims to be. They DO NOT verify
//     that the actor's claim is itself authentic. Real authentication
//     (server-resolved session) is the upstream defense.
//
//   - In the current MVP every write goes through the user's own browser
//     and a hardcoded mock seller. These guards still help: AI-generated
//     code paths can't accidentally edit listings owned by a different
//     `sellerId` constant, and the asserts make the cross-user-write
//     mistake obvious in tests.
//
//   - Server-side, the Phase 2 Supabase adapter relies on RLS deny-all
//     plus server-only validators. These guards complement that by
//     making client-side ownership a first-class concept the AI cannot
//     forget.

import type { ListingIntent, RentalIntent } from "@/domain/intents";

export class OwnershipError extends Error {
  // `code` lets handlers branch without parsing strings.
  readonly code:
    | "listing_owner_mismatch"
    | "rental_seller_mismatch"
    | "rental_borrower_mismatch"
    | "rental_party_mismatch";
  constructor(
    code: OwnershipError["code"],
    message: string,
  ) {
    super(message);
    this.name = "OwnershipError";
    this.code = code;
  }
}

// Caller is the seller editing/saving the listing.
export function assertListingOwnedBy(
  listing: Pick<ListingIntent, "id" | "sellerId">,
  sellerId: string,
): void {
  if (!sellerId || listing.sellerId !== sellerId) {
    throw new OwnershipError(
      "listing_owner_mismatch",
      `Caller is not the owner of listing ${listing.id}.`,
    );
  }
}

// Caller is the seller acting on a rental (approve, confirm return, dispute).
export function assertRentalSellerIs(
  intent: Pick<RentalIntent, "id" | "sellerId">,
  sellerId: string,
): void {
  if (!sellerId || intent.sellerId !== sellerId) {
    throw new OwnershipError(
      "rental_seller_mismatch",
      `Caller is not the seller on rental ${intent.id}.`,
    );
  }
}

// Caller is the borrower acting on a rental (cancel, confirm pickup).
export function assertRentalBorrowerIs(
  intent: Pick<RentalIntent, "id" | "borrowerId">,
  borrowerId: string,
): void {
  if (!borrowerId || intent.borrowerId !== borrowerId) {
    throw new OwnershipError(
      "rental_borrower_mismatch",
      `Caller is not the borrower on rental ${intent.id}.`,
    );
  }
}

// Caller is either the seller or the borrower on a rental. Use this when
// a flow is shared by both parties (e.g. viewing pickup details).
export function assertRentalParty(
  intent: Pick<RentalIntent, "id" | "sellerId" | "borrowerId">,
  userId: string,
): void {
  if (!userId) {
    throw new OwnershipError(
      "rental_party_mismatch",
      `Caller has no userId on rental ${intent.id}.`,
    );
  }
  if (intent.sellerId !== userId && intent.borrowerId !== userId) {
    throw new OwnershipError(
      "rental_party_mismatch",
      `Caller is neither seller nor borrower on rental ${intent.id}.`,
    );
  }
}

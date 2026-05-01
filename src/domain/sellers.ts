export type Seller = {
  id: string;
  name: string;
  region: "seoul";
  trustScore: number;
  reviewCount: number;
  joinedAt: string;
  trustNote?: string;
};

// --------------------------------------------------------------
// SellerProfileOverride — the seller-owned, locally persisted, public
// profile copy override. Phase 1.9 of the manual seller editing
// skeleton.
//
// Design rules (enforced by `sellerProfileService` + tests):
//
//   - Keyed by `sellerId`. At most one override per seller.
//   - Only the two free-text public fields below are editable.
//     Everything else (trustScore, reviewCount, joinedAt, trust
//     summary, accountStanding, payment / settlement, admin status,
//     contact / private fields) is intentionally NOT modeled here so
//     a forged or AI-generated patch cannot smuggle a value through.
//   - The static `SELLERS` fixture is never mutated. Overrides live
//     entirely in the local persistence adapter.
//   - Overrides are only allowed for canonical sellers (sellers that
//     exist in `SELLERS`). Fallback / product-only sellers cannot
//     create a real override and therefore stay marked as fallback
//     on the public storefront.
// --------------------------------------------------------------

export type SellerProfileOverride = {
  sellerId: string;
  // Optional public display name override. Bounded short copy.
  displayName?: string;
  // Optional public intro / note. Bounded short copy. Replaces the
  // `trustNote` line on the public storefront when present.
  publicNote?: string;
  updatedAt: string;
};

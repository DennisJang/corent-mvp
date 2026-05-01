// Public listing read model (Phase 1.12).
//
// `PublicListing` is the single safe shape that public renter-facing
// surfaces (browse, search, storefront cards, item detail) read from.
// It is a PROJECTION over two distinct sources:
//
//   - `static_product` — the curated `PRODUCTS` fixture. These are
//     demo / fallback rentable items.
//   - `approved_listing_intent` — a persisted `ListingIntent` whose
//     CANONICAL status is `"approved"`. Other statuses (`draft`,
//     `ai_extracted`, `verification_incomplete`, `human_review_pending`,
//     `rejected`) NEVER project into a public listing.
//
// The projection layer enforces a strict allowlist:
//
//   - Private fields (`rawSellerInput`, `privateSerialNumber`,
//     internal `verification.checks`, `verification.status`,
//     `verification.aiNotes`, `verification.humanReviewNotes`) and
//     admin / payment / settlement fields are NEVER copied onto a
//     `PublicListing`. The shape below simply does not have a slot
//     for them.
//   - Source-aware ids prevent collision between a static product
//     id and a persisted listing id: `product:<id>` vs `listing:<id>`.
//   - `detailHref` is set ONLY for static products today, since
//     `/items/[id]` is the URL-compatible route for them. Approved
//     persisted listings carry `detailHref: undefined` and are
//     rendered as non-clickable cards on cards-only surfaces. A
//     future slice may add a public listing detail route.

import type { CategoryId } from "@/domain/categories";

export type PublicListingSource =
  | "static_product"
  | "approved_listing_intent";

export type PublicListingPrices = {
  // Same Record-keyed shape as `Product.prices` so existing card
  // components can read both without a separate adapter.
  "1d": number;
  "3d": number;
  "7d": number;
};

export type PublicListing = {
  // Source-prefixed id. Format: `product:<sourceId>` or
  // `listing:<sourceId>`. The prefix collision-protects the namespace.
  publicListingId: string;
  source: PublicListingSource;
  // Raw id from the source. For static products this is the
  // canonical product id used in the `/items/[id]` URL.
  sourceId: string;
  // Optional detail route. Set to `/items/<sourceId>` for static
  // products. `undefined` for approved persisted listings — they
  // appear on cards-only surfaces in this slice.
  detailHref?: string;
  sellerId: string;
  sellerName: string;
  title: string;
  category: CategoryId;
  summary: string;
  pickupArea: string;
  prices: PublicListingPrices;
  estimatedValue: number;
  hero: { initials: string };
  // Public, free-text condition copy (e.g. "사용감 적음"). The
  // ListingIntent enum (`new` / `like_new` / ...) is mapped into a
  // safe display string by the mapper, never copied raw.
  condition: string;
  // True when the listing was projected from a persisted
  // `ListingIntent`. Surfaces use this to mark the row, suppress a
  // clickable detail link, or render a "newly approved" hint.
  isPersistedProjection: boolean;
};

// Public listing projection service (Phase 1.12).
//
// Read-only single source of truth for renter-facing listing surfaces.
// Public surfaces (browse, search, storefront cards) MUST go through
// this service rather than reading `PRODUCTS` or `ListingIntent`
// directly.
//
// Hard rules enforced here:
//
//   - Static `PRODUCTS` are projected via `mapStaticProductToPublicListing`.
//   - Persisted `ListingIntent` rows are projected via
//     `mapApprovedListingIntentToPublicListing`, which returns `null`
//     unless the canonical status is `"approved"` AND the row passes
//     a minimum-shape check (non-empty name, valid category, finite
//     prices, non-empty pickupArea, non-empty sellerId/sellerName).
//   - The mapper uses an EXPLICIT allowlist of fields. It NEVER
//     copies `rawSellerInput`, `privateSerialNumber`, internal
//     `verification.*` data, admin review fields, or any payment /
//     settlement field. The output shape (`PublicListing`) does not
//     even have slots for those fields.
//   - Source-aware ids (`product:<id>` / `listing:<id>`) make a
//     collision between a static product and a persisted listing
//     impossible.
//   - Approved persisted listings DO NOT carry a `detailHref` in
//     this slice. They render on card surfaces as non-clickable. The
//     renter request flow continues to require a static product —
//     `rentalService.createRequestFromProductId` is unchanged.

import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { ListingIntent } from "@/domain/intents";
import type { PublicListing, PublicListingSource } from "@/domain/listings";
import type { Product } from "@/domain/products";
import { CURRENT_SELLER, getSellerById } from "@/data/mockSellers";
import { PRODUCTS } from "@/data/products";
import { getPersistence } from "@/lib/adapters/persistence";

const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set(
  CATEGORIES.map((c) => c.id),
);

// Map ListingIntent's `ItemCondition` enum to the same free-text
// condition copy the static `Product` fixture uses, so the public
// card surface reads consistently regardless of source.
const CONDITION_LABEL_BY_ENUM: Record<string, string> = {
  new: "새 제품",
  like_new: "거의 새것",
  lightly_used: "사용감 적음",
  used: "사용감 보통",
};

function publicId(source: PublicListingSource, sourceId: string): string {
  return source === "static_product"
    ? `product:${sourceId}`
    : `listing:${sourceId}`;
}

// Parse a `publicListingId` back into (source, sourceId). Returns
// null when the prefix is unknown or the value is malformed.
function parsePublicId(
  publicListingId: string,
): { source: PublicListingSource; sourceId: string } | null {
  if (typeof publicListingId !== "string") return null;
  const idx = publicListingId.indexOf(":");
  if (idx <= 0) return null;
  const prefix = publicListingId.slice(0, idx);
  const sourceId = publicListingId.slice(idx + 1);
  if (sourceId.length === 0) return null;
  if (prefix === "product") return { source: "static_product", sourceId };
  if (prefix === "listing")
    return { source: "approved_listing_intent", sourceId };
  return null;
}

// Static product → PublicListing. Pure, deterministic. Does not
// touch persistence.
export function mapStaticProductToPublicListing(
  product: Product,
): PublicListing {
  return {
    publicListingId: publicId("static_product", product.id),
    source: "static_product",
    sourceId: product.id,
    detailHref: `/items/${product.id}`,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    title: product.name,
    category: product.category,
    summary: product.summary,
    pickupArea: product.pickupArea,
    prices: {
      "1d": product.prices["1d"],
      "3d": product.prices["3d"],
      "7d": product.prices["7d"],
    },
    estimatedValue: product.estimatedValue,
    hero: { initials: product.hero.initials },
    condition: product.condition,
    isPersistedProjection: false,
  };
}

// Persisted approved ListingIntent → PublicListing. Returns null
// when:
//
//   - status is anything other than `"approved"` (drafts, in-review,
//     rejected, malformed),
//   - required fields are missing (name / category / pickupArea /
//     prices / sellerId / sellerName),
//   - prices are not finite non-negative numbers.
//
// The output is built field-by-field from an explicit allowlist —
// `rawSellerInput`, `privateSerialNumber`, `verification.*`, and any
// other private slot is never read by this function.
export function mapApprovedListingIntentToPublicListing(
  intent: ListingIntent,
): PublicListing | null {
  if (!intent || typeof intent !== "object") return null;
  if (intent.status !== "approved") return null;
  if (typeof intent.id !== "string" || intent.id.length === 0) return null;
  if (
    typeof intent.sellerId !== "string" ||
    intent.sellerId.length === 0
  ) {
    return null;
  }

  const item = intent.item;
  if (!item || typeof item !== "object") return null;
  if (typeof item.name !== "string" || item.name.length === 0) return null;
  if (!VALID_CATEGORY_IDS.has(item.category as CategoryId)) return null;
  if (
    typeof item.pickupArea !== "string" ||
    item.pickupArea.length === 0
  ) {
    return null;
  }
  if (
    typeof item.estimatedValue !== "number" ||
    !Number.isFinite(item.estimatedValue) ||
    item.estimatedValue < 0
  ) {
    return null;
  }

  const pricing = intent.pricing;
  if (!pricing || typeof pricing !== "object") return null;
  for (const v of [pricing.oneDay, pricing.threeDays, pricing.sevenDays]) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  }

  // Resolve the seller's display name. Prefer the canonical seller
  // record; fall back to the seller id as a last resort. Never copy
  // a seller name from the listing itself (it isn't on the type).
  const sellerRecord = getSellerById(intent.sellerId);
  const sellerName =
    sellerRecord?.name ??
    (intent.sellerId === CURRENT_SELLER.id
      ? CURRENT_SELLER.name
      : intent.sellerId);

  // Hero initials: first non-whitespace char of the title.
  const trimmed = item.name.trim();
  const initials = trimmed.length > 0 ? trimmed.slice(0, 2).toUpperCase() : "??";

  return {
    publicListingId: publicId("approved_listing_intent", intent.id),
    source: "approved_listing_intent",
    sourceId: intent.id,
    // No public detail route for persisted approved listings yet.
    detailHref: undefined,
    sellerId: intent.sellerId,
    sellerName,
    title: item.name,
    category: item.category,
    // Approved listings do not carry a long summary today; keep the
    // public copy short and generic.
    summary: item.defects ?? "",
    pickupArea: item.pickupArea,
    prices: {
      "1d": pricing.oneDay,
      "3d": pricing.threeDays,
      "7d": pricing.sevenDays,
    },
    estimatedValue: item.estimatedValue,
    hero: { initials },
    condition:
      CONDITION_LABEL_BY_ENUM[item.condition as string] ?? "사용감 보통",
    isPersistedProjection: true,
  };
}

export const publicListingService = {
  // List of every PublicListing safely projected today. Static
  // products always come first (stable order matches the `PRODUCTS`
  // array); approved persisted listings follow.
  async listPublicListings(): Promise<PublicListing[]> {
    const staticProjections = PRODUCTS.map(mapStaticProductToPublicListing);
    const persisted = await getPersistence().listListingIntents();
    const approvedProjections: PublicListing[] = [];
    for (const intent of persisted) {
      const projected = mapApprovedListingIntentToPublicListing(intent);
      if (projected) approvedProjections.push(projected);
    }
    return [...staticProjections, ...approvedProjections];
  },

  // Resolve a `publicListingId` (with prefix). Returns null when the
  // id is malformed, points at an unknown source, or references a
  // listing that fails the projection rules.
  async getPublicListingById(
    publicListingId: string,
  ): Promise<PublicListing | null> {
    const parsed = parsePublicId(publicListingId);
    if (!parsed) return null;
    if (parsed.source === "static_product") {
      const product = PRODUCTS.find((p) => p.id === parsed.sourceId);
      return product ? mapStaticProductToPublicListing(product) : null;
    }
    const intent = await getPersistence().getListingIntent(parsed.sourceId);
    return intent ? mapApprovedListingIntentToPublicListing(intent) : null;
  },

  // List public listings owned by a specific seller. Used by the
  // public storefront. Includes both static products and approved
  // persisted listings owned by that seller.
  async listPublicListingsForSeller(
    sellerId: string,
  ): Promise<PublicListing[]> {
    if (typeof sellerId !== "string" || sellerId.length === 0) return [];
    const all = await this.listPublicListings();
    return all.filter((l) => l.sellerId === sellerId);
  },

  // Test seam — let unit tests parse a public id without re-exporting
  // the internal helper.
  _parsePublicIdForTests(
    publicListingId: string,
  ): { source: PublicListingSource; sourceId: string } | null {
    return parsePublicId(publicListingId);
  },
};

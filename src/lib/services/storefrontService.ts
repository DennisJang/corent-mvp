// Public seller storefront — read-only composition layer.
//
// Phase 1.6 of the CoRent Return Trust Layer. The storefront is a
// SKELETON surface that lets a visitor see a seller's public presence
// without exposing any private dashboard data, mutations, payment,
// deposit, escrow, or claim/admin actions. Booking is not part of
// this layer; visitors can only follow the existing item link to the
// per-product detail page.
//
// Hard rules:
//
//   - Read-only. No service or surface that calls this helper may
//     mutate anything. The shape returned here is a snapshot.
//   - Mock-data-aware. Sellers referenced by mock products that do
//     NOT have a Seller record return a deliberately marked
//     `isFallback: true` view. The UI must surface that state so a
//     reviewer can never confuse a fallback with real persisted
//     seller data.
//   - No PII expansion. The view exposes only what is already public
//     elsewhere in the app — display name, region, the existing
//     `trustNote` short copy, and the seller's own listings. No
//     phone, email, address, or GPS.

import type { Product } from "@/domain/products";
import type { Seller } from "@/domain/sellers";
import { SELLERS, getSellerById } from "@/data/mockSellers";
import { PRODUCTS } from "@/data/products";

export type StorefrontView = {
  seller: Seller;
  // Products owned by this seller. May be empty — the storefront
  // surface renders an explicit empty state in that case.
  products: Product[];
  // True when no `Seller` record matched the id and the view was
  // synthesized from product seed data alone. The surface must
  // render a skeleton-marker so the fallback is not confused with
  // a real persisted profile.
  isFallback: boolean;
};

// Returns null when the id has neither a `Seller` record nor any
// products attributed to it. The route should `notFound()` on null.
export function getStorefrontView(sellerId: string): StorefrontView | null {
  if (typeof sellerId !== "string" || sellerId.length === 0) return null;

  const sellerProducts = PRODUCTS.filter((p) => p.sellerId === sellerId);
  const sellerRecord = getSellerById(sellerId);

  if (!sellerRecord && sellerProducts.length === 0) return null;

  if (sellerRecord) {
    return {
      seller: sellerRecord,
      products: sellerProducts,
      isFallback: false,
    };
  }

  // Fallback path: a product references this seller id but no
  // `Seller` row exists yet. Synthesize a minimal Seller-shaped view
  // from the product's denormalized fields. `trustScore` and
  // `reviewCount` are zeroed so the UI never claims aggregate signal
  // we have not actually computed.
  const seed = sellerProducts[0];
  const seller: Seller = {
    id: sellerId,
    name: seed.sellerName,
    region: "seoul",
    trustScore: 0,
    reviewCount: 0,
    joinedAt: "",
    trustNote: seed.sellerTrustNote,
  };
  return { seller, products: sellerProducts, isFallback: true };
}

// Stable list of every seller id that currently has a storefront —
// either via a `Seller` record or via at least one mock product. Used
// by `generateStaticParams` so the public route can pre-render all
// known storefronts without enumerating sellers in two places.
// Sellers in the SELLERS list with no products still get a storefront
// (renders an explicit empty-listings state) rather than 404.
export function listStorefrontSellerIds(): string[] {
  const ids = new Set<string>();
  for (const p of PRODUCTS) ids.add(p.sellerId);
  for (const s of SELLERS) ids.add(s.id);
  return Array.from(ids).sort();
}

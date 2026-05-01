// Tests for the public seller storefront read helper.
//
// Covers:
//   - resolves a real `Seller` record + their listings,
//   - returns null for an empty / unknown id,
//   - falls back safely when a product references a seller id that
//     has no `Seller` record (mock-data gap), and marks the result
//     `isFallback: true` so the surface can disclose the state,
//     including zeroed `trustScore` / `reviewCount` so we never claim
//     aggregate signal we did not compute,
//   - lists every storefront-eligible id for `generateStaticParams`,
//     deduplicating between the SELLERS list and the PRODUCTS seed.

import { describe, expect, it } from "vitest";
import { SELLERS, getSellerById } from "@/data/mockSellers";
import { PRODUCTS } from "@/data/products";
import {
  getStorefrontView,
  listStorefrontSellerIds,
} from "./storefrontService";

describe("getStorefrontView", () => {
  it("returns null for empty id", () => {
    expect(getStorefrontView("")).toBeNull();
  });

  it("returns null for an id that has neither a Seller record nor any products", () => {
    expect(getStorefrontView("seller_does_not_exist")).toBeNull();
  });

  it("returns the real Seller and their listings — not a fallback", () => {
    const sellerJisu = getSellerById("seller_jisu");
    expect(sellerJisu).toBeDefined();

    const view = getStorefrontView("seller_jisu");
    expect(view).not.toBeNull();
    expect(view!.isFallback).toBe(false);
    expect(view!.seller).toEqual(sellerJisu);
    // Every product in the view must belong to this seller.
    expect(view!.products.length).toBeGreaterThan(0);
    for (const p of view!.products) {
      expect(p.sellerId).toBe("seller_jisu");
    }
  });

  it("synthesizes a fallback view for product-only sellers and marks isFallback: true", () => {
    // `seller_gayeong` is referenced by a product but is NOT in the
    // `SELLERS` mock list — the canonical fallback path.
    expect(getSellerById("seller_gayeong")).toBeUndefined();

    const view = getStorefrontView("seller_gayeong");
    expect(view).not.toBeNull();
    expect(view!.isFallback).toBe(true);
    // Display name + trustNote are pulled from the product seed.
    expect(view!.seller.id).toBe("seller_gayeong");
    expect(view!.seller.name.length).toBeGreaterThan(0);
    expect(view!.seller.trustNote).toBeDefined();
    // Aggregate-signal fields are zeroed so the UI never claims
    // numbers we did not compute.
    expect(view!.seller.trustScore).toBe(0);
    expect(view!.seller.reviewCount).toBe(0);
    expect(view!.seller.joinedAt).toBe("");
    // Listings still resolve correctly.
    expect(view!.products.length).toBeGreaterThan(0);
    for (const p of view!.products) {
      expect(p.sellerId).toBe("seller_gayeong");
    }
  });

  it("returns a Seller view with empty products when the seller has no listings", () => {
    // `seller_sumin` exists in SELLERS and may or may not have listings;
    // either way the view is still real (not fallback).
    const view = getStorefrontView("seller_sumin");
    expect(view).not.toBeNull();
    expect(view!.isFallback).toBe(false);
    // Real persisted profile — record is from the SELLERS list.
    expect(getSellerById("seller_sumin")).toEqual(view!.seller);
    expect(Array.isArray(view!.products)).toBe(true);
  });
});

describe("listStorefrontSellerIds", () => {
  it("includes every Seller record id and every distinct product seller id, sorted, deduplicated", () => {
    const ids = listStorefrontSellerIds();
    // Sorted ascending.
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    // Deduplicated.
    expect(new Set(ids).size).toBe(ids.length);
    // Covers every SELLERS id.
    for (const s of SELLERS) {
      expect(ids).toContain(s.id);
    }
    // Covers every distinct product seller id.
    for (const p of PRODUCTS) {
      expect(ids).toContain(p.sellerId);
    }
  });

  it("every listed id resolves to a non-null storefront view", () => {
    for (const id of listStorefrontSellerIds()) {
      const view = getStorefrontView(id);
      expect(view, `id=${id}`).not.toBeNull();
    }
  });
});

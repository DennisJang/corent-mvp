// Local demo guide helper tests. The module is small and the
// invariants are mostly contractual — a dropped seller mapping or a
// missing role label would break the demo flow more than a logic bug.

import { describe, expect, it } from "vitest";
import { CURRENT_SELLER } from "@/data/mockSellers";
import { PRODUCTS } from "@/data/products";
import {
  DEMO_STEPS,
  LOCAL_DEMO_GUIDE_COPY,
  getCurrentDemoRoles,
  getRecommendedDemoProduct,
} from "@/lib/demo/localDemoGuide";

describe("getRecommendedDemoProduct", () => {
  it("returns a static product owned by the current mock seller", () => {
    const product = getRecommendedDemoProduct(CURRENT_SELLER.id);
    expect(product).not.toBeNull();
    expect(product?.sellerId).toBe(CURRENT_SELLER.id);
    // The recommended item must come from the trusted PRODUCTS source
    // — never from a ListingIntent draft. Check that the returned id
    // is one PRODUCTS knows about.
    expect(PRODUCTS.find((p) => p.id === product?.id)).toBeTruthy();
  });

  it("returns null when no static product is owned by the seller id", () => {
    expect(getRecommendedDemoProduct("seller_does_not_exist")).toBeNull();
    expect(getRecommendedDemoProduct("")).toBeNull();
  });
});

describe("getCurrentDemoRoles", () => {
  it("uses the mock session helpers for seller and renter ids", () => {
    const roles = getCurrentDemoRoles();
    expect(roles.seller.source).toBe("mock");
    expect(roles.renter.source).toBe("mock");
    expect(roles.seller.id).toBe(CURRENT_SELLER.id);
    expect(roles.seller.displayName).toBe(CURRENT_SELLER.name);
    expect(roles.renter.id).toBe("borrower_local_mvp");
    expect(roles.renter.displayName.length).toBeGreaterThan(0);
    // Admin is documented as founder-gated — the local demo never
    // forges an admin session.
    expect(roles.admin.label).toBe("관리자");
    expect(roles.admin.id).toMatch(/^founder_/);
  });
});

describe("DEMO_STEPS", () => {
  it("covers the documented 7-step flow with stable index ordering", () => {
    expect(DEMO_STEPS).toHaveLength(7);
    DEMO_STEPS.forEach((step, i) => {
      expect(step.index).toBe(i + 1);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(["seller", "renter", "admin"]).toContain(step.driver);
    });
  });

  it("guide copy stays beta-safe — no active payment / settlement promises", () => {
    const blob = JSON.stringify({
      copy: LOCAL_DEMO_GUIDE_COPY,
      steps: DEMO_STEPS,
    });
    // Sample of the forbidden-phrase list from copyGuardrails.test.ts.
    // The full scan still lives there; this is a fast sanity check.
    expect(blob).not.toContain("플랫폼 수수료");
    expect(blob).not.toContain("자동으로 정산");
    expect(blob).not.toContain("자동으로 환급");
    expect(blob).not.toContain("토스페이먼츠");
    expect(blob).not.toContain("안전거래");
    expect(blob).not.toContain("정산됩니다");
  });
});

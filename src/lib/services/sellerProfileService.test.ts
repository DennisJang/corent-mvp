// Tests for the manual seller-editing skeleton (Phase 1.9).
//
// Covers:
//   - canonical seller can edit own profile copy and the persisted
//     override is returned + read back from storage,
//   - foreign / unknown / fallback seller cannot create or mutate an
//     override (the static SELLERS fixture stays the only gate),
//   - the patch shape silently drops every non-editable field (forged
//     `trustScore`, `accountStanding`, `sellerId`, `updatedAt`,
//     `payment`, `admin*`),
//   - bounded-string violations throw `SellerProfileInputError`,
//   - `getStorefrontProfile` merges base + override correctly,
//   - storefront read for an unknown seller returns null,
//   - the static SELLERS fixture is never mutated.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SELLERS, getSellerById } from "@/data/mockSellers";
import { getPersistence } from "@/lib/adapters/persistence";
import {
  SellerProfileInputError,
  sellerProfileService,
} from "./sellerProfileService";

const SELLER_ID = "seller_jisu";
const STRANGER_ID = "stranger_x";
// `seller_gayeong` is referenced by a product in PRODUCTS but is NOT
// in the SELLERS fixture — the canonical fallback case the skeleton
// must reject.
const FALLBACK_SELLER_ID = "seller_gayeong";

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("sellerProfileService.updateOwnProfile", () => {
  it("seller can persist a displayName + publicNote override", async () => {
    const saved = await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "지수 (베타)",
      publicNote: "주말 픽업 위주로 운영해요.",
    });
    expect(saved.sellerId).toBe(SELLER_ID);
    expect(saved.displayName).toBe("지수 (베타)");
    expect(saved.publicNote).toBe("주말 픽업 위주로 운영해요.");
    expect(typeof saved.updatedAt).toBe("string");

    const reload =
      await sellerProfileService.getOverrideForSeller(SELLER_ID);
    expect(reload).toEqual(saved);
  });

  it("re-saving the same seller upserts (no duplicate rows)", async () => {
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "first",
    });
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "second",
    });
    const all = await sellerProfileService.listOverrides();
    expect(all).toHaveLength(1);
    expect(all[0]?.displayName).toBe("second");
  });

  it("trims whitespace before persisting", async () => {
    const saved = await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "   지수   ",
    });
    expect(saved.displayName).toBe("지수");
  });

  it("rejects an all-whitespace publicNote (trims to empty)", async () => {
    await expect(
      sellerProfileService.updateOwnProfile(SELLER_ID, {
        publicNote: "   ",
      }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
  });

  it("null displayName clears a previously-set override field", async () => {
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "지수",
      publicNote: "안녕하세요",
    });
    const cleared = await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: null,
    });
    expect(cleared.displayName).toBeUndefined();
    // publicNote was not in the patch, so it stays.
    expect(cleared.publicNote).toBe("안녕하세요");
  });

  it("rejects unknown / fallback seller ids", async () => {
    await expect(
      sellerProfileService.updateOwnProfile(STRANGER_ID, {
        displayName: "should not work",
      }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
    await expect(
      sellerProfileService.updateOwnProfile(FALLBACK_SELLER_ID, {
        displayName: "should not work",
      }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
    // Nothing was persisted.
    expect(await sellerProfileService.listOverrides()).toEqual([]);
  });

  it("rejects empty actor id", async () => {
    await expect(
      sellerProfileService.updateOwnProfile("", { displayName: "x" }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
  });

  it("rejects empty patch", async () => {
    await expect(
      sellerProfileService.updateOwnProfile(SELLER_ID, {}),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
  });

  it("rejects oversize displayName (>40 chars)", async () => {
    await expect(
      sellerProfileService.updateOwnProfile(SELLER_ID, {
        displayName: "a".repeat(41),
      }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
  });

  it("rejects oversize publicNote (>240 chars)", async () => {
    await expect(
      sellerProfileService.updateOwnProfile(SELLER_ID, {
        publicNote: "b".repeat(241),
      }),
    ).rejects.toBeInstanceOf(SellerProfileInputError);
  });

  it("silently drops forged trust/account/payment/admin fields", async () => {
    // The patch type only declares `displayName` + `publicNote`. A
    // caller-supplied object with extra fields is accepted at the
    // language level, but `projectPatch` picks only the two known
    // fields. The persisted override carries none of the forged keys.
    const forged = {
      displayName: "지수",
      // Forged fields below — must NOT make it into the override.
      sellerId: STRANGER_ID,
      trustScore: 99,
      reviewCount: 9999,
      joinedAt: "1970-01-01",
      accountStanding: "blocked",
      payment: { status: "paid" },
      adminApproved: true,
      updatedAt: "1970-01-01",
    } as unknown as Parameters<
      typeof sellerProfileService.updateOwnProfile
    >[1];
    const saved = await sellerProfileService.updateOwnProfile(
      SELLER_ID,
      forged,
    );
    expect(saved.sellerId).toBe(SELLER_ID); // forged sellerId ignored
    expect(saved.displayName).toBe("지수");
    expect(saved.publicNote).toBeUndefined();
    // The persisted shape has only the four documented fields.
    expect(Object.keys(saved).sort()).toEqual(
      ["displayName", "publicNote", "sellerId", "updatedAt"].sort(),
    );
  });

  it("does not mutate the static SELLERS fixture", async () => {
    const before = JSON.parse(JSON.stringify(getSellerById(SELLER_ID)));
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "지수 (overridden)",
      publicNote: "override note",
    });
    const after = getSellerById(SELLER_ID);
    expect(after).toEqual(before);
    // The full SELLERS array is also unchanged.
    expect(SELLERS.find((s) => s.id === SELLER_ID)).toEqual(before);
  });
});

describe("sellerProfileService.getStorefrontProfile", () => {
  it("returns the static seller + null override when none exists", async () => {
    const view = await sellerProfileService.getStorefrontProfile(SELLER_ID);
    expect(view).not.toBeNull();
    expect(view!.seller.id).toBe(SELLER_ID);
    expect(view!.override).toBeNull();
    expect(view!.effectiveName).toBe(view!.seller.name);
    expect(view!.effectiveIntro).toBe(view!.seller.trustNote ?? null);
  });

  it("merges the override fields when one exists", async () => {
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      displayName: "지수 (overridden)",
      publicNote: "override note",
    });
    const view = await sellerProfileService.getStorefrontProfile(SELLER_ID);
    expect(view!.override).not.toBeNull();
    expect(view!.effectiveName).toBe("지수 (overridden)");
    expect(view!.effectiveIntro).toBe("override note");
  });

  it("falls back to the static name/intro when the override clears a field", async () => {
    await sellerProfileService.updateOwnProfile(SELLER_ID, {
      publicNote: "only the note is set",
    });
    const view = await sellerProfileService.getStorefrontProfile(SELLER_ID);
    expect(view!.effectiveName).toBe(view!.seller.name);
    expect(view!.effectiveIntro).toBe("only the note is set");
  });

  it("returns null for an unknown / fallback seller", async () => {
    expect(
      await sellerProfileService.getStorefrontProfile(STRANGER_ID),
    ).toBeNull();
    expect(
      await sellerProfileService.getStorefrontProfile(FALLBACK_SELLER_ID),
    ).toBeNull();
  });
});

describe("sellerProfileService.isKnownSeller", () => {
  it("recognizes canonical seller ids", () => {
    expect(sellerProfileService.isKnownSeller(SELLER_ID)).toBe(true);
  });
  it("rejects unknown / fallback / empty ids", () => {
    expect(sellerProfileService.isKnownSeller(STRANGER_ID)).toBe(false);
    expect(sellerProfileService.isKnownSeller(FALLBACK_SELLER_ID)).toBe(
      false,
    );
    expect(sellerProfileService.isKnownSeller("")).toBe(false);
  });
});

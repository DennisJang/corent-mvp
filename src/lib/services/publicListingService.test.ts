// Tests for the public listing projection layer (Phase 1.12).
//
// Covers:
//   - static PRODUCTS project safely with `source: "static_product"`,
//   - public ids are source-prefixed and cannot collide with persisted
//     listing ids,
//   - approved persisted ListingIntent rows project via a strict
//     allowlist; private fields (rawSellerInput / privateSerialNumber /
//     verification.*) NEVER appear on the output,
//   - draft / ai_extracted / verification_incomplete /
//     human_review_pending / rejected / malformed listings are
//     filtered out,
//   - storefront-scoped reads return only listings owned by the
//     queried seller,
//   - getPublicListingById round-trips via the prefixed id.
//
// All tests run against the in-memory persistence adapter (the
// default in a Node/SSR environment), so no localStorage / network
// is touched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ListingIntent } from "@/domain/intents";
import { PRODUCTS } from "@/data/products";
import { getPersistence } from "@/lib/adapters/persistence";
import {
  mapApprovedListingIntentToPublicListing,
  mapStaticProductToPublicListing,
  publicListingService,
} from "./publicListingService";

const STATIC_PRODUCT = PRODUCTS[0]!;
const SELLER_ID = "seller_jisu";

function makeListingIntent(
  overrides: Partial<ListingIntent> = {},
  itemOverrides: Partial<ListingIntent["item"]> = {},
  pricingOverrides: Partial<ListingIntent["pricing"]> = {},
): ListingIntent {
  const base: ListingIntent = {
    id: "li_test",
    sellerId: SELLER_ID,
    status: "approved",
    rawSellerInput: "이건 절대 공개되면 안 되는 셀러 원본 메모",
    item: {
      name: "테스트 마사지건",
      category: "massage_gun",
      estimatedValue: 200000,
      condition: "lightly_used",
      components: ["본체", "어댑터"],
      defects: "외관 미세 흠집",
      privateSerialNumber: "SN-SECRET-12345",
      pickupArea: "서울 마포구",
      ...itemOverrides,
    },
    pricing: {
      oneDay: 8000,
      threeDays: 21000,
      sevenDays: 39000,
      ...pricingOverrides,
    },
    verification: {
      id: "vi_test",
      safetyCode: "B-123",
      status: "human_review_pending",
      checks: {
        frontPhoto: true,
        backPhoto: true,
        componentsPhoto: true,
        workingProof: true,
        safetyCodePhoto: true,
        privateSerialStored: true,
      },
      humanReviewNotes: ["내부 메모 — 외부 노출 금지"],
    },
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
  return base;
}

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("mapStaticProductToPublicListing", () => {
  it("projects every static product with a source-prefixed public id", () => {
    const projected = mapStaticProductToPublicListing(STATIC_PRODUCT);
    expect(projected.publicListingId).toBe(`product:${STATIC_PRODUCT.id}`);
    expect(projected.source).toBe("static_product");
    expect(projected.sourceId).toBe(STATIC_PRODUCT.id);
    expect(projected.detailHref).toBe(`/items/${STATIC_PRODUCT.id}`);
    expect(projected.title).toBe(STATIC_PRODUCT.name);
    expect(projected.sellerId).toBe(STATIC_PRODUCT.sellerId);
    expect(projected.sellerName).toBe(STATIC_PRODUCT.sellerName);
    expect(projected.category).toBe(STATIC_PRODUCT.category);
    expect(projected.prices["1d"]).toBe(STATIC_PRODUCT.prices["1d"]);
    expect(projected.prices["3d"]).toBe(STATIC_PRODUCT.prices["3d"]);
    expect(projected.prices["7d"]).toBe(STATIC_PRODUCT.prices["7d"]);
    expect(projected.estimatedValue).toBe(STATIC_PRODUCT.estimatedValue);
    expect(projected.condition).toBe(STATIC_PRODUCT.condition);
    expect(projected.pickupArea).toBe(STATIC_PRODUCT.pickupArea);
    expect(projected.hero.initials).toBe(STATIC_PRODUCT.hero.initials);
    expect(projected.isPersistedProjection).toBe(false);
  });
});

describe("mapApprovedListingIntentToPublicListing — projection safety", () => {
  const PUBLIC_LISTING_KEYS = [
    "category",
    "condition",
    "detailHref",
    "estimatedValue",
    "hero",
    "isPersistedProjection",
    "pickupArea",
    "prices",
    "publicListingId",
    "sellerId",
    "sellerName",
    "source",
    "sourceId",
    "summary",
    "title",
  ].sort();

  it("projects an approved listing through the safe allowlist", () => {
    const listing = makeListingIntent();
    const projected = mapApprovedListingIntentToPublicListing(listing);
    expect(projected).not.toBeNull();
    expect(projected!.publicListingId).toBe(`listing:${listing.id}`);
    expect(projected!.source).toBe("approved_listing_intent");
    expect(projected!.sourceId).toBe(listing.id);
    expect(projected!.detailHref).toBeUndefined();
    expect(projected!.sellerId).toBe(listing.sellerId);
    expect(projected!.title).toBe(listing.item.name);
    expect(projected!.category).toBe(listing.item.category);
    expect(projected!.pickupArea).toBe(listing.item.pickupArea);
    expect(projected!.prices).toEqual({
      "1d": listing.pricing.oneDay,
      "3d": listing.pricing.threeDays,
      "7d": listing.pricing.sevenDays,
    });
    expect(projected!.estimatedValue).toBe(listing.item.estimatedValue);
    expect(projected!.isPersistedProjection).toBe(true);
  });

  it("never copies private/internal fields (rawSellerInput / privateSerialNumber / verification.*)", () => {
    const listing = makeListingIntent();
    const projected = mapApprovedListingIntentToPublicListing(listing);
    expect(projected).not.toBeNull();
    const flat = JSON.stringify(projected);
    // Every secret string the fixture carries must NOT leak.
    expect(flat).not.toContain(listing.rawSellerInput!);
    expect(flat).not.toContain(listing.item.privateSerialNumber!);
    expect(flat).not.toContain("내부 메모 — 외부 노출 금지");
    expect(flat).not.toContain(listing.verification.safetyCode);
    // The shape itself does not have slots for these fields.
    expect("rawSellerInput" in (projected as object)).toBe(false);
    expect("verification" in (projected as object)).toBe(false);
    expect("privateSerialNumber" in (projected as object)).toBe(false);
  });

  it("does not expose linked intake/admin/trust/payment internals from expanded persisted rows", async () => {
    const persistence = getPersistence();
    const sessionId = "isn_projection_privacy";
    await persistence.saveIntakeSession({
      id: sessionId,
      sellerId: SELLER_ID,
      status: "draft_created",
      listingIntentId: "li_expanded_private",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    await persistence.appendIntakeMessage({
      id: "im_projection_privacy",
      sessionId,
      role: "seller",
      content: "RAW_CHAT_SECRET_DO_NOT_PROJECT",
      createdAt: "2026-04-29T00:00:00.000Z",
    });
    await persistence.saveIntakeExtraction({
      sessionId,
      itemName: "INTAKE_EXTRACTION_SECRET_NAME",
      category: "massage_gun",
      pickupArea: "INTAKE_EXTRACTION_SECRET_PICKUP",
      oneDayPrice: 12345,
      missingFields: ["defects"],
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    await persistence.saveListingIntent({
      ...makeListingIntent({ id: "li_expanded_private" }),
      intakeSessionId: sessionId,
      intakeMessages: [{ content: "INLINE_RAW_CHAT_SECRET" }],
      intakeExtraction: { promptTrace: "EXTRACTION_PROMPT_TRACE_SECRET" },
      adminReview: {
        notes: "ADMIN_NOTES_SECRET",
        reviewerId: "FOUNDER_REVIEWER_SECRET",
      },
      trustSummary: {
        hiddenRiskScore: 99,
        disputesOpened: 42,
      },
      accountStanding: "ACCOUNT_STANDING_SECRET",
      payment: { sessionId: "PAYMENT_SESSION_SECRET" },
      settlement: { sellerPayout: 123456 },
      contact: { phone: "010-SECRET-PHONE" },
    } as unknown as ListingIntent);

    const projection = await publicListingService.getPublicListingById(
      "listing:li_expanded_private",
    );

    expect(projection).not.toBeNull();
    expect(Object.keys(projection!).sort()).toEqual(PUBLIC_LISTING_KEYS);
    expect(Object.keys(projection!.prices).sort()).toEqual(["1d", "3d", "7d"]);
    expect(Object.keys(projection!.hero).sort()).toEqual(["initials"]);

    const flat = JSON.stringify(projection);
    for (const secret of [
      "RAW_CHAT_SECRET_DO_NOT_PROJECT",
      "INLINE_RAW_CHAT_SECRET",
      "INTAKE_EXTRACTION_SECRET_NAME",
      "INTAKE_EXTRACTION_SECRET_PICKUP",
      "EXTRACTION_PROMPT_TRACE_SECRET",
      "ADMIN_NOTES_SECRET",
      "FOUNDER_REVIEWER_SECRET",
      "hiddenRiskScore",
      "disputesOpened",
      "ACCOUNT_STANDING_SECRET",
      "PAYMENT_SESSION_SECRET",
      "010-SECRET-PHONE",
      sessionId,
    ]) {
      expect(flat).not.toContain(secret);
    }
  });

  it("returns null for every non-approved status", () => {
    for (const status of [
      "draft",
      "ai_extracted",
      "verification_incomplete",
      "human_review_pending",
      "rejected",
    ] as const) {
      const listing = makeListingIntent({ status });
      expect(mapApprovedListingIntentToPublicListing(listing)).toBeNull();
    }
  });

  it("returns null when required fields are missing or malformed", () => {
    expect(
      mapApprovedListingIntentToPublicListing(
        makeListingIntent({}, { name: "" }),
      ),
    ).toBeNull();
    expect(
      mapApprovedListingIntentToPublicListing(
        makeListingIntent({}, { pickupArea: undefined }),
      ),
    ).toBeNull();
    expect(
      mapApprovedListingIntentToPublicListing(
        makeListingIntent(
          {},
          {},
          {
            oneDay: Number.NaN,
          } as Partial<ListingIntent["pricing"]>,
        ),
      ),
    ).toBeNull();
    expect(
      mapApprovedListingIntentToPublicListing(
        makeListingIntent({ sellerId: "" }),
      ),
    ).toBeNull();
    expect(
      mapApprovedListingIntentToPublicListing(
        makeListingIntent(
          {},
          { category: "not_a_real_category" as ListingIntent["item"]["category"] },
        ),
      ),
    ).toBeNull();
  });

  it("returns null on null / non-object inputs", () => {
    expect(
      mapApprovedListingIntentToPublicListing(
        null as unknown as ListingIntent,
      ),
    ).toBeNull();
    expect(
      mapApprovedListingIntentToPublicListing(
        "nope" as unknown as ListingIntent,
      ),
    ).toBeNull();
  });
});

describe("publicListingService.listPublicListings", () => {
  it("returns every static product first, then approved persisted listings", async () => {
    // Seed an approved listing.
    await getPersistence().saveListingIntent(makeListingIntent());
    // Seed a draft that must NOT show up.
    await getPersistence().saveListingIntent(
      makeListingIntent({ id: "li_draft", status: "draft" }),
    );
    const all = await publicListingService.listPublicListings();
    const sources = all.map((l) => l.source);
    // Static products come first in the ordering.
    expect(sources.slice(0, PRODUCTS.length)).toEqual(
      Array(PRODUCTS.length).fill("static_product"),
    );
    // The approved persisted listing is appended.
    expect(all.length).toBe(PRODUCTS.length + 1);
    expect(all.at(-1)?.source).toBe("approved_listing_intent");
    expect(all.at(-1)?.sourceId).toBe("li_test");
    // The draft was filtered out.
    expect(all.find((l) => l.sourceId === "li_draft")).toBeUndefined();
  });

  it("filters out drafts / human_review_pending / rejected from the public list", async () => {
    for (const [id, status] of [
      ["li_draft", "draft"],
      ["li_ai", "ai_extracted"],
      ["li_review", "human_review_pending"],
      ["li_inc", "verification_incomplete"],
      ["li_rej", "rejected"],
    ] as const) {
      await getPersistence().saveListingIntent(
        makeListingIntent({ id, status }),
      );
    }
    const all = await publicListingService.listPublicListings();
    // None of the persisted ids appear in the public list.
    for (const id of ["li_draft", "li_ai", "li_review", "li_inc", "li_rej"]) {
      expect(all.find((l) => l.sourceId === id)).toBeUndefined();
    }
    // Only static product projections remain.
    expect(all).toHaveLength(PRODUCTS.length);
  });
});

describe("publicListingService.getPublicListingById — collision safety", () => {
  it("a static product id and a persisted listing id can share the same raw id without collision", async () => {
    // Construct an approved persisted listing whose raw id matches a
    // static product id. The source-prefixed public ids must keep
    // them separate.
    const collidingId = STATIC_PRODUCT.id;
    await getPersistence().saveListingIntent(
      makeListingIntent({ id: collidingId }),
    );

    const fromStatic = await publicListingService.getPublicListingById(
      `product:${collidingId}`,
    );
    const fromListing = await publicListingService.getPublicListingById(
      `listing:${collidingId}`,
    );

    expect(fromStatic).not.toBeNull();
    expect(fromListing).not.toBeNull();
    expect(fromStatic!.source).toBe("static_product");
    expect(fromListing!.source).toBe("approved_listing_intent");
    expect(fromStatic!.publicListingId).not.toBe(fromListing!.publicListingId);
  });

  it("returns null for malformed prefixes", async () => {
    expect(
      await publicListingService.getPublicListingById("badprefix:foo"),
    ).toBeNull();
    expect(await publicListingService.getPublicListingById(":bar")).toBeNull();
    expect(await publicListingService.getPublicListingById("product:")).toBeNull();
    expect(await publicListingService.getPublicListingById("")).toBeNull();
    expect(
      await publicListingService.getPublicListingById(
        "no-prefix-just-a-string",
      ),
    ).toBeNull();
  });

  it("returns null when the persisted listing exists but is unapproved", async () => {
    await getPersistence().saveListingIntent(
      makeListingIntent({ id: "li_draft", status: "draft" }),
    );
    expect(
      await publicListingService.getPublicListingById("listing:li_draft"),
    ).toBeNull();
  });

  it("returns null when the persisted listing id is unknown", async () => {
    expect(
      await publicListingService.getPublicListingById(
        "listing:does_not_exist",
      ),
    ).toBeNull();
  });
});

describe("publicListingService.listPublicListingsForSeller", () => {
  it("scopes to the supplied sellerId and includes approved persisted listings", async () => {
    await getPersistence().saveListingIntent(
      makeListingIntent({ id: "li_owned_by_jisu", sellerId: SELLER_ID }),
    );
    // A persisted listing owned by a different seller must NOT
    // appear in the queried seller's storefront.
    await getPersistence().saveListingIntent(
      makeListingIntent({
        id: "li_owned_by_minho",
        sellerId: "seller_minho",
      }),
    );
    const forJisu =
      await publicListingService.listPublicListingsForSeller(SELLER_ID);
    expect(forJisu.every((l) => l.sellerId === SELLER_ID)).toBe(true);
    expect(forJisu.find((l) => l.sourceId === "li_owned_by_jisu")).toBeDefined();
    expect(
      forJisu.find((l) => l.sourceId === "li_owned_by_minho"),
    ).toBeUndefined();
    // Static products owned by other sellers also stay scoped out.
    for (const l of forJisu) {
      expect(l.sellerId).toBe(SELLER_ID);
    }
  });

  it("returns [] for an empty / missing sellerId", async () => {
    expect(
      await publicListingService.listPublicListingsForSeller(""),
    ).toEqual([]);
  });

  it("seller edits to a draft do NOT change the public view (draft stays private)", async () => {
    await getPersistence().saveListingIntent(
      makeListingIntent({ id: "li_secret_draft", status: "draft" }),
    );
    const initial =
      await publicListingService.listPublicListingsForSeller(SELLER_ID);
    const initialIds = initial.map((l) => l.sourceId);
    // Now "edit" the draft (still draft).
    await getPersistence().saveListingIntent(
      makeListingIntent({
        id: "li_secret_draft",
        status: "draft",
      }),
    );
    const after =
      await publicListingService.listPublicListingsForSeller(SELLER_ID);
    expect(after.map((l) => l.sourceId)).toEqual(initialIds);
    expect(
      after.find((l) => l.sourceId === "li_secret_draft"),
    ).toBeUndefined();
  });
});

describe("rentalService.createRequestFromProductId still requires canonical static products", () => {
  it("rejects requests against an approved persisted listing's source id", async () => {
    const { rentalService } = await import("./rentalService");
    await getPersistence().saveListingIntent(makeListingIntent());
    // The persisted listing's id is `li_test` — it is NOT a valid
    // static product id and the canonical request helper must reject.
    await expect(
      rentalService.createRequestFromProductId({
        productId: "li_test",
        durationDays: 3,
      }),
    ).rejects.toThrow(/product_not_found/);
  });
});

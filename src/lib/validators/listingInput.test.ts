import { describe, expect, it } from "vitest";
import type { ListingIntent } from "@/domain/intents";
import { ListingInputError, validateListingDraft } from "./listingInput";

const baseValid: ListingIntent = {
  id: "li_test",
  sellerId: "seller_jisu",
  status: "draft",
  rawSellerInput: "DEMO 마사지건 거의 안 썼어. 3일만 빌려주고 싶어.",
  item: {
    name: "테라건 미니",
    category: "massage_gun",
    estimatedValue: 220000,
    condition: "lightly_used",
    components: ["본체", "케이블"],
    defects: undefined,
    pickupArea: "강남구",
  },
  pricing: { oneDay: 9000, threeDays: 21000, sevenDays: 39000 },
  verification: {
    id: "vi_test",
    safetyCode: "B-428",
    status: "pending",
    checks: {
      frontPhoto: false,
      backPhoto: false,
      componentsPhoto: false,
      workingProof: false,
      safetyCodePhoto: false,
      privateSerialStored: false,
    },
  },
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

function tryValidate(l: ListingIntent): ListingInputError | null {
  try {
    validateListingDraft(l);
    return null;
  } catch (e) {
    return e as ListingInputError;
  }
}

describe("validateListingDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(() => validateListingDraft(baseValid)).not.toThrow();
  });

  it("rejects empty id", () => {
    const err = tryValidate({ ...baseValid, id: "" });
    expect(err?.code).toBe("id_required");
  });

  it("rejects empty sellerId", () => {
    const err = tryValidate({ ...baseValid, sellerId: "" });
    expect(err?.code).toBe("seller_id_required");
  });

  it("rejects unknown status", () => {
    const err = tryValidate({
      ...baseValid,
      status: "admin" as unknown as ListingIntent["status"],
    });
    expect(err?.code).toBe("status_invalid");
  });

  it("rejects unknown category", () => {
    const err = tryValidate({
      ...baseValid,
      item: {
        ...baseValid.item,
        category: "electronics" as unknown as ListingIntent["item"]["category"],
      },
    });
    expect(err?.code).toBe("category_invalid");
  });

  it("rejects negative estimated value", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, estimatedValue: -1 },
    });
    expect(err?.code).toBe("estimated_value_invalid");
  });

  it("rejects estimated value above 100M KRW", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, estimatedValue: 100_000_001 },
    });
    expect(err?.code).toBe("estimated_value_invalid");
  });

  it("rejects unknown item condition", () => {
    const err = tryValidate({
      ...baseValid,
      item: {
        ...baseValid.item,
        condition:
          "excellent" as unknown as ListingIntent["item"]["condition"],
      },
    });
    expect(err?.code).toBe("condition_invalid");
  });

  it("rejects components array longer than 12", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, components: new Array(13).fill("x") },
    });
    expect(err?.code).toBe("components_invalid");
  });

  it("rejects component entry too long", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, components: ["a".repeat(61)] },
    });
    expect(err?.code).toBe("components_invalid");
  });

  it("rejects negative price", () => {
    const err = tryValidate({
      ...baseValid,
      pricing: { ...baseValid.pricing, threeDays: -1 },
    });
    expect(err?.code).toBe("price_invalid");
  });

  it("rejects price above 10M KRW", () => {
    const err = tryValidate({
      ...baseValid,
      pricing: { ...baseValid.pricing, oneDay: 10_000_001 },
    });
    expect(err?.code).toBe("price_invalid");
  });

  it("rejects oversize raw seller input", () => {
    const err = tryValidate({
      ...baseValid,
      rawSellerInput: "x".repeat(2001),
    });
    expect(err?.code).toBe("raw_input_too_long");
  });

  it("rejects oversize defects text", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, defects: "x".repeat(241) },
    });
    expect(err?.code).toBe("defects_too_long");
  });

  it("rejects oversize pickupArea", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, pickupArea: "x".repeat(61) },
    });
    expect(err?.code).toBe("pickup_area_too_long");
  });

  it("rejects oversize privateSerialNumber", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, privateSerialNumber: "x".repeat(81) },
    });
    expect(err?.code).toBe("private_serial_too_long");
  });

  it("rejects oversize item name", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, name: "x".repeat(121) },
    });
    expect(err?.code).toBe("item_name_invalid");
  });

  it("rejects empty item name", () => {
    const err = tryValidate({
      ...baseValid,
      item: { ...baseValid.item, name: "" },
    });
    expect(err?.code).toBe("item_name_invalid");
  });
});

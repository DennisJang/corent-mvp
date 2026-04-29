// Validator unit tests. The repos rely on these to reject any
// client-supplied id, status, amount, or text-shape that does not match
// the schema. The DB also catches drift via CHECK constraints, but the
// validators are the first line of defense and the tests should keep
// them honest.

import { describe, expect, it } from "vitest";
import {
  validateBoundedText,
  validateCategory,
  validateComponents,
  validateDurationDays,
  validateEstimatedValue,
  validateItemCondition,
  validateItemName,
  validateListingStatus,
  validateOptionalUuid,
  validatePickupArea,
  validatePrice,
  validateRentalStatus,
  validateRequiredText,
  validateSafetyCode,
  validateUuid,
  validateVerificationStatus,
} from "./validators";

describe("validateUuid", () => {
  it("accepts a canonical lowercase v4 uuid", () => {
    expect(validateUuid("11111111-2222-4333-8444-555555555555").ok).toBe(true);
  });
  it("accepts uppercase", () => {
    expect(validateUuid("11111111-2222-4333-8444-555555555555".toUpperCase()).ok).toBe(true);
  });
  it("rejects non-string", () => {
    expect(validateUuid(123 as unknown).ok).toBe(false);
    expect(validateUuid(null).ok).toBe(false);
    expect(validateUuid(undefined).ok).toBe(false);
  });
  it("rejects malformed", () => {
    expect(validateUuid("li_abc").ok).toBe(false);
    expect(validateUuid("not-a-uuid").ok).toBe(false);
    expect(validateUuid("1111").ok).toBe(false);
  });
});

describe("validateOptionalUuid", () => {
  it("accepts null/undefined as null", () => {
    const a = validateOptionalUuid(null);
    expect(a.ok && a.value === null).toBe(true);
    const b = validateOptionalUuid(undefined);
    expect(b.ok && b.value === null).toBe(true);
  });
  it("validates the string when present", () => {
    expect(validateOptionalUuid("nope").ok).toBe(false);
    expect(validateOptionalUuid("11111111-2222-4333-8444-555555555555").ok).toBe(true);
  });
});

describe("validateCategory", () => {
  it("accepts known category ids", () => {
    expect(validateCategory("massage_gun").ok).toBe(true);
    expect(validateCategory("home_care").ok).toBe(true);
    expect(validateCategory("exercise").ok).toBe(true);
  });
  it("rejects unknown ids and non-strings", () => {
    expect(validateCategory("electronics").ok).toBe(false);
    expect(validateCategory(42 as unknown).ok).toBe(false);
    expect(validateCategory(null).ok).toBe(false);
  });
});

describe("validateListingStatus", () => {
  it("accepts only known statuses", () => {
    expect(validateListingStatus("draft").ok).toBe(true);
    expect(validateListingStatus("approved").ok).toBe(true);
    expect(validateListingStatus("rejected").ok).toBe(true);
    expect(validateListingStatus("pending").ok).toBe(false);
  });
});

describe("validateVerificationStatus", () => {
  it("accepts only known statuses", () => {
    expect(validateVerificationStatus("verified").ok).toBe(true);
    expect(validateVerificationStatus("not_started").ok).toBe(true);
    expect(validateVerificationStatus("approved").ok).toBe(false);
  });
});

describe("validateRentalStatus", () => {
  it("accepts each documented happy-path and failure status", () => {
    for (const s of [
      "draft",
      "requested",
      "seller_approved",
      "payment_pending",
      "paid",
      "pickup_confirmed",
      "return_pending",
      "return_confirmed",
      "settlement_ready",
      "settled",
      "cancelled",
      "payment_failed",
      "seller_cancelled",
      "borrower_cancelled",
      "pickup_missed",
      "return_overdue",
      "damage_reported",
      "dispute_opened",
      "settlement_blocked",
    ]) {
      expect(validateRentalStatus(s).ok).toBe(true);
    }
  });
  it("rejects unknown statuses", () => {
    expect(validateRentalStatus("approved").ok).toBe(false);
    expect(validateRentalStatus("paid_in_full").ok).toBe(false);
    expect(validateRentalStatus("").ok).toBe(false);
  });
});

describe("validateDurationDays", () => {
  it("accepts only 1, 3, 7", () => {
    expect(validateDurationDays(1).ok).toBe(true);
    expect(validateDurationDays(3).ok).toBe(true);
    expect(validateDurationDays(7).ok).toBe(true);
  });
  it("rejects others", () => {
    expect(validateDurationDays(0).ok).toBe(false);
    expect(validateDurationDays(2).ok).toBe(false);
    expect(validateDurationDays(14).ok).toBe(false);
    expect(validateDurationDays("3" as unknown).ok).toBe(false);
  });
});

describe("validatePrice", () => {
  it("accepts non-negative integers within bounds", () => {
    expect(validatePrice(0, "x").ok).toBe(true);
    expect(validatePrice(1, "x").ok).toBe(true);
    expect(validatePrice(10_000_000, "x").ok).toBe(true);
  });
  it("rejects negative, non-finite, non-integer, or over-max values", () => {
    expect(validatePrice(-1, "x").ok).toBe(false);
    expect(validatePrice(1.5, "x").ok).toBe(false);
    expect(validatePrice(Number.NaN, "x").ok).toBe(false);
    expect(validatePrice(Number.POSITIVE_INFINITY, "x").ok).toBe(false);
    expect(validatePrice(10_000_001, "x").ok).toBe(false);
    expect(validatePrice("100" as unknown, "x").ok).toBe(false);
  });
});

describe("validateEstimatedValue", () => {
  it("allows up to 100,000,000 KRW", () => {
    expect(validateEstimatedValue(100_000_000).ok).toBe(true);
    expect(validateEstimatedValue(100_000_001).ok).toBe(false);
  });
});

describe("text validators", () => {
  it("validateItemName requires 1..80 chars", () => {
    expect(validateItemName("").ok).toBe(false);
    expect(validateItemName("a").ok).toBe(true);
    expect(validateItemName("a".repeat(80)).ok).toBe(true);
    expect(validateItemName("a".repeat(81)).ok).toBe(false);
    expect(validateItemName(null).ok).toBe(false);
  });
  it("validatePickupArea allows null, max 60 chars", () => {
    expect(validatePickupArea(null).ok).toBe(true);
    expect(validatePickupArea("a".repeat(60)).ok).toBe(true);
    expect(validatePickupArea("a".repeat(61)).ok).toBe(false);
  });
  it("validateRequiredText enforces required + max", () => {
    expect(validateRequiredText("", "x", 10).ok).toBe(false);
    expect(validateRequiredText(null, "x", 10).ok).toBe(false);
    expect(validateRequiredText("ok", "x", 10).ok).toBe(true);
    expect(validateRequiredText("aaaaaaaaaaa", "x", 10).ok).toBe(false);
  });
  it("validateBoundedText optional, accepts null", () => {
    expect(validateBoundedText(null, "x", 5, false).ok).toBe(true);
    const r = validateBoundedText("aa", "x", 5, false);
    expect(r.ok && r.value === "aa").toBe(true);
  });
});

describe("validateComponents", () => {
  it("accepts arrays of bounded strings up to size 12", () => {
    expect(validateComponents([]).ok).toBe(true);
    expect(validateComponents(["a", "b"]).ok).toBe(true);
    expect(validateComponents(new Array(12).fill("x")).ok).toBe(true);
    expect(validateComponents(new Array(13).fill("x")).ok).toBe(false);
  });
  it("rejects non-arrays and non-string entries", () => {
    expect(validateComponents("not array" as unknown).ok).toBe(false);
    expect(validateComponents([1, 2] as unknown[]).ok).toBe(false);
    expect(validateComponents(["a".repeat(61)]).ok).toBe(false);
  });
});

describe("validateSafetyCode", () => {
  it("accepts LETTER-DDD shape", () => {
    expect(validateSafetyCode("A-000").ok).toBe(true);
    expect(validateSafetyCode("Z-999").ok).toBe(true);
  });
  it("rejects malformed", () => {
    expect(validateSafetyCode("AA-100").ok).toBe(false);
    expect(validateSafetyCode("a-100").ok).toBe(false);
    expect(validateSafetyCode("A-12").ok).toBe(false);
    expect(validateSafetyCode("A-1234").ok).toBe(false);
  });
});

describe("validateItemCondition", () => {
  it("accepts only the four allowed values", () => {
    for (const c of ["new", "like_new", "lightly_used", "used"]) {
      expect(validateItemCondition(c).ok).toBe(true);
    }
    expect(validateItemCondition("excellent").ok).toBe(false);
    expect(validateItemCondition(null).ok).toBe(false);
  });
});

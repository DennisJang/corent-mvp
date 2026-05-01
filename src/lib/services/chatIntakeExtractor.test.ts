// Deterministic local extractor — unit tests.

import { describe, expect, it } from "vitest";
import {
  buildAssistantSummary,
  extractIntake,
} from "@/lib/services/chatIntakeExtractor";

const FIXED_AT = "2026-05-02T00:00:00.000Z";

describe("extractIntake", () => {
  it("recovers item name, pickup area, condition, and one-day price from a representative Korean sentence", () => {
    const result = extractIntake({
      sessionId: "isn_test",
      text: "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.",
      at: FIXED_AT,
    });
    expect(result.itemName).toBe("Theragun Mini");
    expect(result.category).toBe("massage_gun");
    expect(result.pickupArea).toBe("강남역 근처");
    expect(result.condition).toBe("lightly_used");
    expect(result.oneDayPrice).toBe(9000);
    expect(result.createdAt).toBe(FIXED_AT);
    expect(result.sessionId).toBe("isn_test");
    // estimatedValue / defects were not stated → marked as missing.
    expect(result.missingFields).toContain("estimatedValue");
    expect(result.missingFields).toContain("defects");
    expect(result.missingFields).not.toContain("itemName");
    expect(result.missingFields).not.toContain("pickupArea");
    expect(result.missingFields).not.toContain("oneDayPrice");
  });

  it("marks every field missing when the input is empty", () => {
    const result = extractIntake({
      sessionId: "isn_empty",
      text: "   ",
      at: FIXED_AT,
    });
    expect(result.itemName).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.pickupArea).toBeUndefined();
    expect(result.estimatedValue).toBeUndefined();
    expect(result.oneDayPrice).toBeUndefined();
    expect(result.missingFields).toEqual(
      expect.arrayContaining([
        "itemName",
        "category",
        "pickupArea",
        "estimatedValue",
        "condition",
        "defects",
        "oneDayPrice",
      ]),
    );
  });

  it("derives 3d/7d suggestions from estimatedValue when present, leaves them undefined otherwise", () => {
    const withValue = extractIntake({
      sessionId: "isn_a",
      text: "테라건 미니, 30만원짜리, 강남역 근처.",
      at: FIXED_AT,
    });
    expect(withValue.estimatedValue).toBe(300_000);
    expect(typeof withValue.threeDaysPrice).toBe("number");
    expect(typeof withValue.sevenDaysPrice).toBe("number");

    const withoutValue = extractIntake({
      sessionId: "isn_b",
      text: "테라건 미니. 강남역 근처.",
      at: FIXED_AT,
    });
    expect(withoutValue.estimatedValue).toBeUndefined();
    expect(withoutValue.threeDaysPrice).toBeUndefined();
    expect(withoutValue.sevenDaysPrice).toBeUndefined();
  });

  it("never invents a category when none of the keyword sets match", () => {
    const result = extractIntake({
      sessionId: "isn_unknown",
      text: "잘 모르는 물건, 그냥 빌려주고 싶어요.",
      at: FIXED_AT,
    });
    expect(result.category).toBeUndefined();
    expect(result.missingFields).toContain("category");
  });
});

describe("buildAssistantSummary", () => {
  it("references the seller-stated values and avoids active money-promise phrases", () => {
    const extraction = extractIntake({
      sessionId: "isn_copy",
      text: "테라건 미니, 강남역 근처, 하루 9000원.",
      at: FIXED_AT,
    });
    const summary = buildAssistantSummary(extraction);
    expect(summary).toContain("초안 미리보기");
    expect(summary).toContain("Theragun Mini");
    expect(summary).toContain("강남역 근처");
    expect(summary).toContain("9,000");
    // Beta-safe disclaimers — implicit, not active promises.
    expect(summary).toContain("자동 게시·실거래·실제");
    expect(summary).toContain("사람 검수");
    // Negative checks for forbidden active-promise phrases.
    expect(summary).not.toContain("자동으로 정산");
    expect(summary).not.toContain("자동으로 환급");
    expect(summary).not.toContain("플랫폼 수수료");
    expect(summary).not.toContain("토스페이먼츠");
    expect(summary).not.toContain("안전거래");
  });
});

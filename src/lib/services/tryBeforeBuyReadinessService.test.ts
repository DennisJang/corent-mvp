// Try-before-buy readiness service tests (Bundle 4 Slice 6).
//
// Coverage:
//   - deterministic: same input → byte-identical output
//   - category-specific points for every supported CategoryId
//   - fallback generic points only when the category is not in
//     the closed map (defense in depth — the map is total today)
//   - condition wear markers add the "사용감" component-check nudge
//   - pickup area echoed when present, generic copy otherwise
//   - responsibilityBasisLabel anchors on estimatedValue (KRW) and
//     falls back when value is missing / zero / non-finite
//   - non-payment caption + responsibility caption are always on
//   - banlist enforced on the entire output JSON: no "보증",
//     "보험", "보장", "결제 완료", "대여 확정", "환불", "정산 완료"
//   - provenance is always "deterministic"
//   - never echoes raw seller input / private fields (the input
//     shape forbids them; we still pin a literal-leak probe)

import { describe, expect, it } from "vitest";
import { CATEGORIES, type CategoryId } from "@/domain/categories";
import { deriveTryBeforeBuyReadiness } from "./tryBeforeBuyReadinessService";

const BASE_INPUT = {
  category: "massage_gun" as CategoryId,
  pickupArea: "마포구",
  condition: "사용감 적음",
  estimatedValue: 200_000,
};

describe("deriveTryBeforeBuyReadiness — deterministic", () => {
  it("is byte-stable for the same input", () => {
    const a = deriveTryBeforeBuyReadiness(BASE_INPUT);
    const b = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("carries provenance: 'deterministic' (never llm_candidate / human_reviewed in this slice)", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(r.provenance).toBe("deterministic");
  });
});

describe("deriveTryBeforeBuyReadiness — category-specific points", () => {
  it("returns massage-gun-specific points for category=massage_gun", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      category: "massage_gun",
    });
    expect(r.tryBeforeBuyPoints.some((p) => p.includes("진동"))).toBe(true);
    expect(r.tryBeforeBuyPoints.length).toBeGreaterThanOrEqual(2);
  });

  it("returns home-care-specific points for category=home_care", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      category: "home_care",
    });
    expect(r.tryBeforeBuyPoints.some((p) => p.includes("피부"))).toBe(true);
  });

  it("returns exercise-specific points for category=exercise", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      category: "exercise",
    });
    expect(
      r.tryBeforeBuyPoints.some(
        (p) => p.includes("반복") || p.includes("관절"),
      ),
    ).toBe(true);
  });

  it("returns camera-specific points for category=camera (disabled today, mapping reserved)", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      category: "camera",
    });
    expect(
      r.tryBeforeBuyPoints.some(
        (p) => p.includes("그립") || p.includes("셔터"),
      ),
    ).toBe(true);
  });

  it("returns camping-specific points for category=camping", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      category: "camping",
    });
    expect(
      r.tryBeforeBuyPoints.some(
        (p) => p.includes("설치") || p.includes("수납"),
      ),
    ).toBe(true);
  });

  it("emits at least one try-before-buy point for every CategoryId in the closed registry", () => {
    for (const cat of CATEGORIES) {
      const r = deriveTryBeforeBuyReadiness({
        ...BASE_INPUT,
        category: cat.id,
      });
      expect(r.tryBeforeBuyPoints.length).toBeGreaterThanOrEqual(1);
      for (const point of r.tryBeforeBuyPoints) {
        expect(point.length).toBeGreaterThan(0);
        expect(point.length).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe("deriveTryBeforeBuyReadiness — checkBeforeRequest content", () => {
  it("always includes the component / 동봉 자료 nudge", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(
      r.checkBeforeRequest.some((c) => c.includes("구성품")),
    ).toBe(true);
  });

  it("adds the wear-marker check when the condition copy hints at wear (사용감)", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      condition: "사용감 보통",
    });
    expect(
      r.checkBeforeRequest.some((c) => c.includes("사용감 정도")),
    ).toBe(true);
  });

  it("does NOT add the wear-marker check when condition reads 'new' / 'like new'", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      condition: "새 제품",
    });
    expect(
      r.checkBeforeRequest.some((c) => c.includes("사용감 정도")),
    ).toBe(false);
  });

  it("echoes the pickup area when present", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      pickupArea: "성동구",
    });
    expect(
      r.checkBeforeRequest.some(
        (c) => c.includes("성동구") && c.includes("이동 가능한지"),
      ),
    ).toBe(true);
  });

  it("falls back to generic pickup copy when pickupArea is empty / whitespace", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      pickupArea: "   ",
    });
    expect(
      r.checkBeforeRequest.some(
        (c) => c.includes("픽업 권역") && c.includes("일정"),
      ),
    ).toBe(true);
  });

  it("always includes the duration-choice nudge", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(
      r.checkBeforeRequest.some((c) => c.includes("1일") && c.includes("7일")),
    ).toBe(true);
  });
});

describe("deriveTryBeforeBuyReadiness — responsibility basis label", () => {
  it("anchors on estimatedValue when present (KRW formatted)", () => {
    const r = deriveTryBeforeBuyReadiness({
      ...BASE_INPUT,
      estimatedValue: 350_000,
    });
    expect(r.responsibilityBasisLabel).toContain("책임 기준");
    expect(r.responsibilityBasisLabel).toContain("350,000");
  });

  it("never uses '보증금' framing — always '책임 기준'", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(r.responsibilityBasisLabel).toContain("책임 기준");
    expect(r.responsibilityBasisLabel).not.toContain("보증금");
  });

  it("falls back to a 'no value' label when estimatedValue is missing / zero / non-finite", () => {
    for (const v of [0, NaN, Number.POSITIVE_INFINITY, -1]) {
      const r = deriveTryBeforeBuyReadiness({
        ...BASE_INPUT,
        estimatedValue: v as number,
      });
      expect(r.responsibilityBasisLabel).toContain("정보 없음");
    }
  });
});

describe("deriveTryBeforeBuyReadiness — always-on captions", () => {
  it("nonPaymentCaption states '결제·픽업·정산은 시작되지 않아요'", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(r.nonPaymentCaption).toContain("결제·픽업·정산은 시작되지 않아요");
    expect(r.nonPaymentCaption).toContain("책임 기준을 다시 확인");
  });

  it("responsibilityCaption stays calm and uses '책임 기준'", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    expect(r.responsibilityCaption).toContain("책임 기준");
    expect(r.responsibilityCaption).not.toContain("보증");
    expect(r.responsibilityCaption).not.toContain("보험");
    expect(r.responsibilityCaption).not.toContain("보장");
  });
});

describe("deriveTryBeforeBuyReadiness — banlist + leakage probe", () => {
  it("never emits regulated-language phrases anywhere in the card", () => {
    for (const cat of CATEGORIES) {
      const r = deriveTryBeforeBuyReadiness({
        category: cat.id,
        pickupArea: "마포구",
        condition: "사용감 보통",
        estimatedValue: 200_000,
      });
      const blob = JSON.stringify(r);
      for (const banned of [
        "보증",
        "보험",
        "보장",
        "결제 완료",
        "대여 확정",
        "환불",
        "정산 완료",
      ]) {
        expect(blob).not.toContain(banned);
      }
    }
  });

  it("does not echo raw seller-private literals — function shape forbids them", () => {
    // The input shape declares only safe fields. A caller that
    // tries to widen the input via cast cannot smuggle a private
    // field into the output because the function never reads
    // anything outside the documented input keys.
    const widened = {
      category: "massage_gun" as CategoryId,
      pickupArea: "마포구",
      condition: "사용감 적음",
      estimatedValue: 200_000,
      // Forged extra fields the runtime should never read.
      rawSellerInput: "RAW_SELLER_DO_NOT_LEAK",
      privateSerialNumber: "SERIAL_DO_NOT_LEAK",
      adminNotes: "ADMIN_DO_NOT_LEAK",
      paymentSessionId: "PAYMENT_DO_NOT_LEAK",
      humanReviewNotes: "REVIEW_DO_NOT_LEAK",
    } as Parameters<typeof deriveTryBeforeBuyReadiness>[0];
    const r = deriveTryBeforeBuyReadiness(widened);
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("RAW_SELLER_DO_NOT_LEAK");
    expect(blob).not.toContain("SERIAL_DO_NOT_LEAK");
    expect(blob).not.toContain("ADMIN_DO_NOT_LEAK");
    expect(blob).not.toContain("PAYMENT_DO_NOT_LEAK");
    expect(blob).not.toContain("REVIEW_DO_NOT_LEAK");
  });

  it("does not echo any field name that would imply authority over status / payment / settlement / verification", () => {
    const r = deriveTryBeforeBuyReadiness(BASE_INPUT);
    const blob = JSON.stringify(r);
    for (const banned of [
      "status",
      "sellerId",
      "borrowerId",
      "listingId",
      "payment",
      "settlement",
      "verification",
      "trustScore",
      "publication",
      "address",
      "contact",
      "rawSellerInput",
      "privateSerialNumber",
      "humanReviewNotes",
    ]) {
      expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
    }
  });
});

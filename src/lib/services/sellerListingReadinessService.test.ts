// Seller-side listing readiness service tests (Bundle 4 Slice 7).
//
// Coverage:
//   - deterministic: same input → byte-identical output
//   - empty listings → "no listings" caption + empty-friendly readyChecks
//   - all approved → "모든 리스팅이 공개되어 있어요" caption
//   - any pre-approved (draft / ai_extracted / verification_incomplete /
//     human_review_pending) → pending caption
//   - rejected count surfaces a calm separate line
//   - category-specific recommendations for every supported CategoryId
//   - universal recommendations always present
//   - recommendations are deduped + sorted (byte-stable output)
//   - banlist enforced on the entire output JSON: no "보증",
//     "보험", "보장", "결제 완료", "대여 확정", "환불", "정산 완료"
//   - never echoes raw / private / authority field names
//   - provenance is always "deterministic"

import { describe, expect, it } from "vitest";
import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { ListingStatus } from "@/domain/intents";
import { deriveSellerListingReadiness } from "./sellerListingReadinessService";

const ALL_STATUSES: ListingStatus[] = [
  "draft",
  "ai_extracted",
  "verification_incomplete",
  "human_review_pending",
  "approved",
  "rejected",
];

describe("deriveSellerListingReadiness — deterministic", () => {
  it("is byte-stable for the same input", () => {
    const input = {
      listings: [
        { category: "massage_gun" as CategoryId, status: "approved" as ListingStatus },
        { category: "exercise" as CategoryId, status: "draft" as ListingStatus },
      ],
    };
    const a = deriveSellerListingReadiness(input);
    const b = deriveSellerListingReadiness(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("carries provenance: 'deterministic'", () => {
    const r = deriveSellerListingReadiness({ listings: [] });
    expect(r.provenance).toBe("deterministic");
  });
});

describe("deriveSellerListingReadiness — empty listings", () => {
  it("returns empty-friendly readyChecks + empty caption", () => {
    const r = deriveSellerListingReadiness({ listings: [] });
    expect(r.readyChecks).toEqual(["아직 등록된 리스팅이 없어요."]);
    expect(r.publicationReadinessCaption).toContain(
      "리스팅을 1개 이상 등록",
    );
  });

  it("still includes all universal recommendations", () => {
    const r = deriveSellerListingReadiness({ listings: [] });
    expect(r.missingOrRecommendedChecks).toContain(
      "수령 권역을 역·동 단위로 명시해 주세요.",
    );
    expect(r.missingOrRecommendedChecks).toContain(
      "사용감과 눈에 띄는 흠집을 솔직히 적어 주세요.",
    );
    expect(r.missingOrRecommendedChecks).toContain(
      "사진은 정면·측면·구성품을 모두 포함하면 좋아요.",
    );
  });
});

describe("deriveSellerListingReadiness — readyChecks counts", () => {
  it("surfaces 'X개 중 Y개 공개됐어요' for any non-empty listings", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "massage_gun", status: "approved" },
        { category: "exercise", status: "draft" },
        { category: "home_care", status: "approved" },
      ],
    });
    expect(r.readyChecks[0]).toContain("3개 리스팅 중 2개가 공개됐어요.");
  });

  it("adds a separate rejected-listing line when any row is rejected", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "massage_gun", status: "approved" },
        { category: "exercise", status: "rejected" },
      ],
    });
    expect(r.readyChecks.some((c) => c.includes("보류됐어요"))).toBe(true);
  });

  it("does NOT add the rejected line when no row is rejected", () => {
    const r = deriveSellerListingReadiness({
      listings: [{ category: "massage_gun", status: "approved" }],
    });
    expect(r.readyChecks.some((c) => c.includes("보류됐어요"))).toBe(false);
  });
});

describe("deriveSellerListingReadiness — publicationReadinessCaption", () => {
  it("uses the pending caption when any pre-approved status appears", () => {
    for (const status of [
      "draft",
      "ai_extracted",
      "verification_incomplete",
      "human_review_pending",
    ] as const) {
      const r = deriveSellerListingReadiness({
        listings: [
          { category: "massage_gun", status: "approved" },
          { category: "exercise", status },
        ],
      });
      expect(r.publicationReadinessCaption).toContain("검토 중");
    }
  });

  it("uses the all-approved caption when every row is approved", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "massage_gun", status: "approved" },
        { category: "exercise", status: "approved" },
      ],
    });
    expect(r.publicationReadinessCaption).toContain(
      "모든 리스팅이 공개되어 있어요",
    );
  });

  it("treats a 'rejected' row alone (no pre-approved siblings) as 'all decided' (uses approved caption shape)", () => {
    // No pre-approved rows, so the caption falls through to the
    // approved branch even though the row was rejected. The
    // separate rejected line in `readyChecks` carries that signal.
    const r = deriveSellerListingReadiness({
      listings: [{ category: "massage_gun", status: "rejected" }],
    });
    expect(r.publicationReadinessCaption).toContain(
      "모든 리스팅이 공개되어 있어요",
    );
    expect(r.readyChecks.some((c) => c.includes("보류됐어요"))).toBe(true);
  });
});

describe("deriveSellerListingReadiness — category-specific recommendations", () => {
  it("emits the massage_gun recommendation when the seller has a massage_gun listing", () => {
    const r = deriveSellerListingReadiness({
      listings: [{ category: "massage_gun", status: "approved" }],
    });
    expect(r.missingOrRecommendedChecks.some((c) => c.includes("어댑터"))).toBe(
      true,
    );
  });

  it("emits the exercise recommendation when the seller has an exercise listing", () => {
    const r = deriveSellerListingReadiness({
      listings: [{ category: "exercise", status: "approved" }],
    });
    expect(r.missingOrRecommendedChecks.some((c) => c.includes("조립"))).toBe(
      true,
    );
  });

  it("emits the home_care recommendation when the seller has a home_care listing", () => {
    const r = deriveSellerListingReadiness({
      listings: [{ category: "home_care", status: "approved" }],
    });
    expect(
      r.missingOrRecommendedChecks.some((c) => c.includes("동봉")),
    ).toBe(true);
  });

  it("dedupes a recommendation across multiple listings of the same category", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "massage_gun", status: "approved" },
        { category: "massage_gun", status: "draft" },
        { category: "massage_gun", status: "human_review_pending" },
      ],
    });
    const adapterRecs = r.missingOrRecommendedChecks.filter((c) =>
      c.includes("어댑터"),
    );
    expect(adapterRecs).toHaveLength(1);
  });

  it("emits at least one category-specific recommendation for every supported CategoryId", () => {
    for (const cat of CATEGORIES) {
      const r = deriveSellerListingReadiness({
        listings: [{ category: cat.id, status: "approved" }],
      });
      // Universal recommendations are 3 entries; at least one
      // additional category-specific one must surface for every
      // category in the closed registry.
      expect(r.missingOrRecommendedChecks.length).toBeGreaterThan(3);
    }
  });
});

describe("deriveSellerListingReadiness — sort + dedup invariants", () => {
  it("missingOrRecommendedChecks is sorted alphabetically (byte-stable React keys)", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "exercise", status: "approved" },
        { category: "massage_gun", status: "approved" },
        { category: "home_care", status: "approved" },
      ],
    });
    expect(r.missingOrRecommendedChecks).toEqual(
      [...r.missingOrRecommendedChecks].sort(),
    );
    // No duplicates.
    expect(new Set(r.missingOrRecommendedChecks).size).toBe(
      r.missingOrRecommendedChecks.length,
    );
  });
});

describe("deriveSellerListingReadiness — banlist + leakage probe", () => {
  it("never emits regulated-language phrases for any category × status combination", () => {
    for (const cat of CATEGORIES) {
      for (const status of ALL_STATUSES) {
        const r = deriveSellerListingReadiness({
          listings: [{ category: cat.id, status }],
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
    }
  });

  it("does NOT echo private / raw / authority field names anywhere in the card", () => {
    const r = deriveSellerListingReadiness({
      listings: [
        { category: "massage_gun", status: "approved" },
        { category: "exercise", status: "draft" },
      ],
    });
    const blob = JSON.stringify(r);
    for (const banned of [
      "rawSellerInput",
      "privateSerialNumber",
      "humanReviewNotes",
      "verification",
      "trustScore",
      "payment",
      "settlement",
      "sellerPayout",
      "platformFee",
      "borrowerId",
      "borrowerTotal",
      "safetyDeposit",
      "rentalFee",
      "adminId",
      "adminNotes",
      "address",
      "contact",
      "publication",
      "role",
      "capability",
    ]) {
      expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
    }
  });

  it("uses '책임 기준' framing — never '보증금'", () => {
    const r = deriveSellerListingReadiness({
      listings: [{ category: "massage_gun", status: "approved" }],
    });
    expect(r.responsibilityBasisLabel).toContain("책임 기준");
    expect(r.responsibilityBasisLabel).not.toContain("보증금");
  });
});

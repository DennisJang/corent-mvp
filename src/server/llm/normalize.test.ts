// Candidate normalizer tests (Bundle 4 Slice 3).
//
// Coverage per task type:
//   - happy path → typed candidate with `provenance: "llm_candidate"`
//   - forbidden authority fields are dropped
//     (status / sellerId / borrowerId / listingId / price /
//      payment / settlement / verification / trustScore /
//      address / contact / safetyDeposit / sellerPayout /
//      platformFee / borrowerTotal / adminId / role / capability)
//   - closed enums are validated (CategoryId, ListingUseCaseTag);
//     unknown values are dropped, not coerced
//   - lengths are capped, arrays are deduped + sorted
//   - non-object / null / array input does not throw and yields a
//     conservative empty candidate
//   - provenance is ALWAYS "llm_candidate" regardless of what the
//     provider claimed

import { describe, expect, it } from "vitest";
import {
  normalizeListingExtractionCandidate,
  normalizeMatchExplanationCandidate,
  normalizeRenterIntentCandidate,
  normalizeSellerStoreCandidate,
} from "./normalize";

const FORBIDDEN_AUTHORITY_FIELDS = [
  "status",
  "sellerId",
  "borrowerId",
  "listingId",
  "price",
  "rentalFee",
  "borrowerTotal",
  "safetyDeposit",
  "sellerPayout",
  "platformFee",
  "payment",
  "settlement",
  "verification",
  "publication",
  "adminId",
  "role",
  "capability",
  "trustScore",
  "address",
  "contact",
] as const;

function expectNoForbiddenKeys(value: unknown) {
  const blob = JSON.stringify(value);
  for (const banned of FORBIDDEN_AUTHORITY_FIELDS) {
    expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
  }
}

describe("normalizeListingExtractionCandidate", () => {
  it("returns a typed candidate with provenance = 'llm_candidate' for valid input", () => {
    const out = normalizeListingExtractionCandidate({
      title: "테라건 mini",
      category: "massage_gun",
      pickupArea: "마포구",
      components: ["어댑터", "파우치"],
      defects: ["스크래치"],
    });
    expect(out.provenance).toBe("llm_candidate");
    expect(out.title).toBe("테라건 mini");
    expect(out.category).toBe("massage_gun");
    expect(out.pickupArea).toBe("마포구");
    expect(out.components).toEqual(["어댑터", "파우치"]);
    expect(out.defects).toEqual(["스크래치"]);
  });

  it("forces provenance to 'llm_candidate' regardless of what the input claimed", () => {
    const out = normalizeListingExtractionCandidate({
      title: "x",
      category: "massage_gun",
      provenance: "human_reviewed",
    });
    expect(out.provenance).toBe("llm_candidate");
  });

  it("drops every forbidden authority field from the input", () => {
    const out = normalizeListingExtractionCandidate({
      title: "x",
      category: "massage_gun",
      // The provider tries to widen the schema with authority
      // fields. The normalizer's allowlist must drop them all.
      status: "approved",
      sellerId: "FORGED_SELLER",
      borrowerId: "FORGED_BORROWER",
      listingId: "FORGED_LISTING",
      price: 999_999,
      rentalFee: 21_000,
      borrowerTotal: 51_000,
      safetyDeposit: 30_000,
      sellerPayout: 21_000,
      platformFee: 0,
      payment: { provider: "toss", sessionId: "LEAK" },
      settlement: { status: "settled" },
      verification: { status: "verified", aiNotes: "LEAK" },
      publication: "approved",
      adminId: "FORGED_ADMIN",
      role: "founder",
      capability: "founder",
      trustScore: 99,
      address: "서울시 마포구 OOO로 12-3",
      contact: "010-1234-5678",
    });
    expectNoForbiddenKeys(out);
  });

  it("drops a category that is not in the closed enum", () => {
    const out = normalizeListingExtractionCandidate({
      title: "x",
      category: "weapon",
    });
    expect(out.category).toBeNull();
  });

  it("caps title at 80 chars, pickupArea at 32 chars", () => {
    const longTitle = "가".repeat(120);
    const longArea = "권".repeat(60);
    const out = normalizeListingExtractionCandidate({
      title: longTitle,
      pickupArea: longArea,
    });
    expect(out.title?.length).toBeLessThanOrEqual(80);
    expect(out.pickupArea?.length).toBeLessThanOrEqual(32);
  });

  it("caps + dedupes + sorts components / defects", () => {
    const out = normalizeListingExtractionCandidate({
      components: [
        "어댑터",
        "어댑터", // dup
        "파우치",
        "USB",
        "케이스",
        "거치대",
        "x".repeat(80), // long entry capped to 40
        "여분",
        "여분2", // exceeds total cap of 6
      ],
      defects: ["스크래치", "스크래치"],
    });
    expect(new Set(out.components).size).toBe(out.components.length); // deduped
    expect(out.components.length).toBeLessThanOrEqual(6);
    expect(out.components).toEqual([...out.components].sort());
    expect(out.defects).toEqual(["스크래치"]);
  });

  it("returns a conservative empty candidate for null / array / number input", () => {
    for (const bad of [null, [], 42, "string", undefined]) {
      const out = normalizeListingExtractionCandidate(bad);
      expect(out.title).toBeNull();
      expect(out.category).toBeNull();
      expect(out.pickupArea).toBeNull();
      expect(out.components).toEqual([]);
      expect(out.defects).toEqual([]);
      expect(out.provenance).toBe("llm_candidate");
    }
  });
});

describe("normalizeSellerStoreCandidate", () => {
  it("accepts a calm Korean positioning sentence + bounded improvementNudges", () => {
    const out = normalizeSellerStoreCandidate({
      positioningSentence:
        "사기 전에 며칠 써보기를 돕는 셀러로 활동하고 있어요.",
      improvementNudges: ["구성품 사진을 확인해 주세요."],
    });
    expect(out.provenance).toBe("llm_candidate");
    expect(out.positioningSentence).toContain("사기 전에 며칠 써보기");
    expect(out.improvementNudges).toEqual(["구성품 사진을 확인해 주세요."]);
  });

  it("caps positioningSentence at 240 chars and improvementNudges at 3 entries", () => {
    const longSentence = "가".repeat(400);
    const tooManyNudges = [
      "1번 권장",
      "2번 권장",
      "3번 권장",
      "4번 권장",
      "5번 권장",
    ];
    const out = normalizeSellerStoreCandidate({
      positioningSentence: longSentence,
      improvementNudges: tooManyNudges,
    });
    expect(out.positioningSentence.length).toBeLessThanOrEqual(240);
    expect(out.improvementNudges.length).toBeLessThanOrEqual(3);
  });

  it("forces provenance and drops forbidden authority fields", () => {
    const out = normalizeSellerStoreCandidate({
      positioningSentence: "x",
      improvementNudges: [],
      provenance: "human_reviewed",
      status: "approved",
      sellerId: "FORGED",
      payment: { sessionId: "LEAK" },
      address: "FORGED",
    });
    expect(out.provenance).toBe("llm_candidate");
    expectNoForbiddenKeys(out);
  });

  it("returns conservative empty candidate for null / non-object input", () => {
    const out = normalizeSellerStoreCandidate(null);
    expect(out.positioningSentence).toBe("");
    expect(out.improvementNudges).toEqual([]);
    expect(out.provenance).toBe("llm_candidate");
  });
});

describe("normalizeRenterIntentCandidate", () => {
  it("keeps only tags inside the closed ListingUseCaseTag enum", () => {
    const out = normalizeRenterIntentCandidate({
      intentTags: [
        "try_before_buy",
        "home_recovery",
        "weapon", // unknown — must be dropped
        "verified", // unknown — must be dropped
      ],
    });
    expect(out.intentTags).toContain("try_before_buy");
    expect(out.intentTags).toContain("home_recovery");
    expect(out.intentTags).not.toContain("weapon" as never);
    expect(out.intentTags).not.toContain("verified" as never);
    expect(out.provenance).toBe("llm_candidate");
  });

  it("dedupes + sorts tags for byte-stable output", () => {
    const out = normalizeRenterIntentCandidate({
      intentTags: ["try_before_buy", "try_before_buy", "short_trial"],
    });
    expect(new Set(out.intentTags).size).toBe(out.intentTags.length);
    expect(out.intentTags).toEqual([...out.intentTags].sort());
  });

  it("returns empty intentTags for null / non-array input", () => {
    expect(normalizeRenterIntentCandidate(null).intentTags).toEqual([]);
    expect(normalizeRenterIntentCandidate({}).intentTags).toEqual([]);
    expect(normalizeRenterIntentCandidate({ intentTags: "nope" }).intentTags).toEqual([]);
  });
});

describe("normalizeMatchExplanationCandidate", () => {
  it("accepts string entries OR { label } objects, dedupes, sorts, caps", () => {
    const out = normalizeMatchExplanationCandidate({
      reasons: [
        "카테고리 일치",
        { label: "마포 픽업" },
        "카테고리 일치", // dup
        { label: "1일 체험에 적합" },
        { label: "구매 전 체험" },
        { label: "희망 가격 이내" },
        { label: "추가 1" }, // exceeds cap of 5
      ],
      cautions: [
        "결제·픽업 전 단계",
        { label: "구성품 확인 필요" },
        "확인 필요 추가", // exceeds cap of 2
      ],
    });
    expect(out.reasons.length).toBeLessThanOrEqual(5);
    expect(out.cautions.length).toBeLessThanOrEqual(2);
    expect(new Set(out.reasons.map((r) => r.label)).size).toBe(
      out.reasons.length,
    );
    // Sorted alphabetically.
    expect(out.reasons.map((r) => r.label)).toEqual(
      [...out.reasons.map((r) => r.label)].sort(),
    );
    // Provenance forced.
    for (const r of out.reasons) expect(r.provenance).toBe("llm_candidate");
    for (const c of out.cautions) expect(c.provenance).toBe("llm_candidate");
  });

  it("caps each label at 32 chars", () => {
    const out = normalizeMatchExplanationCandidate({
      reasons: ["가".repeat(80)],
      cautions: ["나".repeat(80)],
    });
    expect(out.reasons[0]?.label.length).toBeLessThanOrEqual(32);
    expect(out.cautions[0]?.label.length).toBeLessThanOrEqual(32);
  });

  it("drops entries that are not strings or { label }", () => {
    const out = normalizeMatchExplanationCandidate({
      reasons: [42, null, { label: 99 }, { notLabel: "x" }, "fine"],
      cautions: [],
    });
    expect(out.reasons.map((r) => r.label)).toEqual(["fine"]);
  });

  it("never re-emits a forbidden authority field", () => {
    const out = normalizeMatchExplanationCandidate({
      reasons: [{ label: "x", status: "approved" }],
      cautions: [{ label: "y", price: 1 }],
    });
    expectNoForbiddenKeys(out);
  });
});

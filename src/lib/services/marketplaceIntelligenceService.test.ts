// Marketplace intelligence generators (Bundle 4, Slice 1).
//
// Coverage:
//
//   - deterministic: same input → byte-identical output
//   - listing intelligence: maps category → bounded use-case tags,
//     echoes pickup area, never invents canonical facts
//   - seller store: scoping by sellerId, classification thresholds
//     (casual / repeat_light / micro_store), category focus order,
//     pickup-area dedup + cap
//   - renter intent: 1d → short_trial; 7d → weekly_trial; 3d →
//     no trial-length tag; rawInput is NOT scanned (LLM-future)
//   - match explanation:
//     - category match adds "카테고리 일치"
//     - pickup area echoes as "{area} 픽업"
//     - duration tags: "1일 체험에 적합" / "주 단위 체험에 적합"
//     - priceMax fit adds "희망 가격 이내" only when within budget
//     - always emits "구매 전 체험" + "결제·픽업 전 단계"
//     - banlist: never emits regulated-language phrases
//     - bounded: max 4 reasons, max 2 cautions
//   - leakage: generators do not see private fields by
//     construction (run only on safe DTOs); we assert the JSON
//     blob has zero forbidden tokens for a realistic input.

import { describe, expect, it } from "vitest";
import type { SearchIntent } from "@/domain/intents";
import type { PublicListing } from "@/domain/listings";
import {
  deriveListingIntelligenceSignal,
  deriveRenterIntentSignal,
  deriveSellerStoreIntelligenceSignal,
  deriveSellerStorePreview,
  explainMatch,
  storeTypeLabel,
  useCaseTagLabel,
} from "./marketplaceIntelligenceService";

function listingFixture(overrides: Partial<PublicListing> = {}): PublicListing {
  return {
    publicListingId: "product:demo-1",
    source: "static_product",
    sourceId: "demo-1",
    detailHref: "/items/demo-1",
    sellerId: "seller_demo",
    sellerName: "DEMO 셀러",
    title: "테스트 마사지건",
    category: "massage_gun",
    summary: "사용감 적음, 정상 작동",
    pickupArea: "마포구",
    prices: { "1d": 12000, "3d": 30000, "7d": 60000 },
    estimatedValue: 200_000,
    hero: { initials: "TM" },
    condition: "사용감 적음",
    isPersistedProjection: false,
    ...overrides,
  };
}

function intentFixture(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    id: "si_test",
    rawInput: "마사지건 1일 마포",
    category: "massage_gun",
    durationDays: 1,
    region: "seoul",
    priceMax: 20000,
    pickupMethod: "direct",
    createdAt: "2026-05-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveListingIntelligenceSignal — deterministic", () => {
  it("is byte-stable for the same input", () => {
    const a = deriveListingIntelligenceSignal(listingFixture());
    const b = deriveListingIntelligenceSignal(listingFixture());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("maps massage_gun category to ['home_recovery', 'try_before_buy'] (sorted)", () => {
    const sig = deriveListingIntelligenceSignal(listingFixture());
    expect(sig.useCases).toEqual(["home_recovery", "try_before_buy"]);
  });

  it("maps home_care category to ['home_care_routine', 'try_before_buy']", () => {
    const sig = deriveListingIntelligenceSignal(
      listingFixture({ category: "home_care" }),
    );
    expect(sig.useCases).toEqual(["home_care_routine", "try_before_buy"]);
  });

  it("maps exercise category to ['home_workout', 'try_before_buy']", () => {
    const sig = deriveListingIntelligenceSignal(
      listingFixture({ category: "exercise" }),
    );
    expect(sig.useCases).toEqual(["home_workout", "try_before_buy"]);
  });

  it("echoes the pickup area without re-deriving it", () => {
    const sig = deriveListingIntelligenceSignal(
      listingFixture({ pickupArea: "성동구" }),
    );
    expect(sig.pickupArea).toBe("성동구");
  });

  it("never claims status / payment / verification authority on the signal", () => {
    const sig = deriveListingIntelligenceSignal(listingFixture());
    const blob = JSON.stringify(sig);
    for (const banned of [
      "verified",
      "guaranteed",
      "approved",
      "verified_seller",
      "결제 완료",
      "대여 확정",
      "보증금 청구",
      "보험",
      "보장",
      "환불",
      "정산 완료",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("carries provenance = 'deterministic' (never llm_candidate / human_reviewed in this slice)", () => {
    const sig = deriveListingIntelligenceSignal(listingFixture());
    expect(sig.provenance).toBe("deterministic");
  });
});

describe("deriveSellerStoreIntelligenceSignal — classification", () => {
  it("classifies 0 listings as casual", () => {
    const sig = deriveSellerStoreIntelligenceSignal("seller_a", []);
    expect(sig.storeType).toBe("casual");
    expect(sig.publicListingCount).toBe(0);
    expect(sig.categoryFocus).toEqual([]);
    expect(sig.pickupAreas).toEqual([]);
  });

  it("classifies 1 listing as casual", () => {
    const sig = deriveSellerStoreIntelligenceSignal("seller_a", [
      listingFixture({ sellerId: "seller_a" }),
    ]);
    expect(sig.storeType).toBe("casual");
    expect(sig.publicListingCount).toBe(1);
  });

  it("classifies 2-3 listings as repeat_light", () => {
    const sig = deriveSellerStoreIntelligenceSignal("seller_a", [
      listingFixture({ sellerId: "seller_a", publicListingId: "a" }),
      listingFixture({ sellerId: "seller_a", publicListingId: "b" }),
    ]);
    expect(sig.storeType).toBe("repeat_light");
    expect(sig.publicListingCount).toBe(2);
  });

  it("classifies 4+ listings as micro_store", () => {
    const four = [1, 2, 3, 4].map((n) =>
      listingFixture({
        sellerId: "seller_a",
        publicListingId: `id-${n}`,
      }),
    );
    const sig = deriveSellerStoreIntelligenceSignal("seller_a", four);
    expect(sig.storeType).toBe("micro_store");
    expect(sig.publicListingCount).toBe(4);
  });
});

describe("deriveSellerStoreIntelligenceSignal — scoping by sellerId", () => {
  it("ignores listings owned by other sellers", () => {
    const sig = deriveSellerStoreIntelligenceSignal("seller_a", [
      listingFixture({ sellerId: "seller_a", publicListingId: "a-1" }),
      listingFixture({ sellerId: "seller_b", publicListingId: "b-1" }),
      listingFixture({ sellerId: "seller_b", publicListingId: "b-2" }),
    ]);
    expect(sig.publicListingCount).toBe(1);
    expect(sig.storeType).toBe("casual");
  });
});

describe("deriveSellerStoreIntelligenceSignal — categoryFocus + pickupAreas", () => {
  it("orders categoryFocus by frequency desc, alphabetical tie-break, capped at 3", () => {
    const listings = [
      // 3 massage_gun
      listingFixture({
        sellerId: "s",
        publicListingId: "1",
        category: "massage_gun",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "2",
        category: "massage_gun",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "3",
        category: "massage_gun",
      }),
      // 2 exercise
      listingFixture({
        sellerId: "s",
        publicListingId: "4",
        category: "exercise",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "5",
        category: "exercise",
      }),
      // 1 home_care
      listingFixture({
        sellerId: "s",
        publicListingId: "6",
        category: "home_care",
      }),
    ];
    const sig = deriveSellerStoreIntelligenceSignal("s", listings);
    expect(sig.categoryFocus).toEqual([
      "massage_gun",
      "exercise",
      "home_care",
    ]);
  });

  it("dedupes + sorts pickupAreas alphabetically, capped at 3", () => {
    const listings = [
      listingFixture({
        sellerId: "s",
        publicListingId: "1",
        pickupArea: "성동구",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "2",
        pickupArea: "마포구",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "3",
        pickupArea: "마포구",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "4",
        pickupArea: "강남구",
      }),
      listingFixture({
        sellerId: "s",
        publicListingId: "5",
        pickupArea: "은평구",
      }),
    ];
    const sig = deriveSellerStoreIntelligenceSignal("s", listings);
    // Korean strings sort by codepoint; expect alphabetical-by-
    // codepoint and length 3 (cap).
    expect(sig.pickupAreas).toHaveLength(3);
    expect(new Set(sig.pickupAreas).size).toBe(3);
    expect(sig.pickupAreas).toEqual([...sig.pickupAreas].sort());
  });
});

describe("deriveRenterIntentSignal — duration tag mapping", () => {
  it("always includes try_before_buy", () => {
    const sig = deriveRenterIntentSignal(intentFixture({ durationDays: 3 }));
    expect(sig.intentTags).toContain("try_before_buy");
  });

  it("adds short_trial only for durationDays=1", () => {
    expect(
      deriveRenterIntentSignal(intentFixture({ durationDays: 1 })).intentTags,
    ).toContain("short_trial");
    expect(
      deriveRenterIntentSignal(intentFixture({ durationDays: 3 })).intentTags,
    ).not.toContain("short_trial");
    expect(
      deriveRenterIntentSignal(intentFixture({ durationDays: 7 })).intentTags,
    ).not.toContain("short_trial");
  });

  it("adds weekly_trial only for durationDays=7", () => {
    expect(
      deriveRenterIntentSignal(intentFixture({ durationDays: 7 })).intentTags,
    ).toContain("weekly_trial");
    expect(
      deriveRenterIntentSignal(intentFixture({ durationDays: 1 })).intentTags,
    ).not.toContain("weekly_trial");
  });

  it("does not scan rawInput for free-text NLP heuristics (LLM-future)", () => {
    const sig = deriveRenterIntentSignal(
      intentFixture({
        durationDays: 3,
        rawInput: "주말에 1일만 빠르게 체험하고 싶어요",
      }),
    );
    // The rawInput contains "1일" and "체험" but the deterministic
    // generator must NOT widen the intent tags by reading the
    // sentence — that's the LLM channel's job. With durationDays=3,
    // neither short_trial nor weekly_trial should appear.
    expect(sig.intentTags).not.toContain("short_trial");
    expect(sig.intentTags).not.toContain("weekly_trial");
  });
});

describe("explainMatch — deterministic + bounded", () => {
  it("is byte-stable for the same input", () => {
    const a = explainMatch(intentFixture(), listingFixture());
    const b = explainMatch(intentFixture(), listingFixture());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("emits at most 5 reasons + 2 cautions", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    expect(r.reasons.length).toBeLessThanOrEqual(5);
    expect(r.cautions.length).toBeLessThanOrEqual(2);
  });

  it("every label is short Korean copy (<= 32 chars)", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    for (const reason of r.reasons) {
      expect(reason.label.length).toBeGreaterThan(0);
      expect(reason.label.length).toBeLessThanOrEqual(32);
    }
    for (const c of r.cautions) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.label.length).toBeLessThanOrEqual(32);
    }
  });

  it("every reason / caution carries provenance = 'deterministic'", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    for (const reason of r.reasons) expect(reason.provenance).toBe("deterministic");
    for (const c of r.cautions) expect(c.provenance).toBe("deterministic");
  });
});

describe("explainMatch — reason content", () => {
  it("adds '카테고리 일치' when intent.category matches the listing", () => {
    const r = explainMatch(
      intentFixture({ category: "massage_gun" }),
      listingFixture({ category: "massage_gun" }),
    );
    expect(r.reasons.some((x) => x.label === "카테고리 일치")).toBe(true);
  });

  it("does NOT add '카테고리 일치' when intent has no category", () => {
    const r = explainMatch(
      intentFixture({ category: undefined }),
      listingFixture({ category: "massage_gun" }),
    );
    expect(r.reasons.some((x) => x.label === "카테고리 일치")).toBe(false);
  });

  it("adds '{pickupArea} 픽업' when the listing has a pickup area", () => {
    const r = explainMatch(
      intentFixture(),
      listingFixture({ pickupArea: "성동구" }),
    );
    expect(r.reasons.some((x) => x.label === "성동구 픽업")).toBe(true);
  });

  it("adds '1일 체험에 적합' for durationDays=1", () => {
    const r = explainMatch(
      intentFixture({ durationDays: 1 }),
      listingFixture(),
    );
    expect(r.reasons.some((x) => x.label === "1일 체험에 적합")).toBe(true);
  });

  it("adds '주 단위 체험에 적합' for durationDays=7", () => {
    const r = explainMatch(
      intentFixture({ durationDays: 7 }),
      listingFixture(),
    );
    expect(r.reasons.some((x) => x.label === "주 단위 체험에 적합")).toBe(true);
  });

  it("adds '희망 가격 이내' when listing's selected-duration price is within priceMax", () => {
    const r = explainMatch(
      intentFixture({ durationDays: 1, priceMax: 20000 }),
      listingFixture({ prices: { "1d": 12000, "3d": 30000, "7d": 60000 } }),
    );
    expect(r.reasons.some((x) => x.label === "희망 가격 이내")).toBe(true);
  });

  it("does NOT add '희망 가격 이내' when listing's price exceeds priceMax", () => {
    const r = explainMatch(
      intentFixture({ durationDays: 1, priceMax: 5000 }),
      listingFixture({ prices: { "1d": 12000, "3d": 30000, "7d": 60000 } }),
    );
    expect(r.reasons.some((x) => x.label === "희망 가격 이내")).toBe(false);
  });

  it("does NOT add '희망 가격 이내' when priceMax is unset", () => {
    const r = explainMatch(
      intentFixture({ priceMax: undefined }),
      listingFixture(),
    );
    expect(r.reasons.some((x) => x.label === "희망 가격 이내")).toBe(false);
  });

  it("always includes '구매 전 체험' as a baseline reason", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    expect(r.reasons.some((x) => x.label === "구매 전 체험")).toBe(true);
  });
});

describe("explainMatch — caution content + banlist", () => {
  it("always includes '결제·픽업 전 단계' as a baseline caution", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    expect(r.cautions.some((c) => c.label === "결제·픽업 전 단계")).toBe(true);
  });

  it("adds '구성품 확인 필요' when condition implies wear", () => {
    const r = explainMatch(
      intentFixture(),
      listingFixture({ condition: "사용감 보통" }),
    );
    expect(r.cautions.some((c) => c.label === "구성품 확인 필요")).toBe(true);
  });

  it("never emits regulated-language phrases anywhere in reasons / cautions", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    const blob = JSON.stringify(r);
    for (const banned of [
      "결제 완료",
      "결제 처리",
      "대여 확정",
      "대여 완료",
      "보증금 청구",
      "보험",
      "보장",
      "환불",
      "정산 완료",
      "guaranteed",
      "verified_seller",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });
});

describe("useCaseTagLabel — closed mapping", () => {
  it("returns a Korean caption for every supported tag", () => {
    expect(useCaseTagLabel("try_before_buy")).toBe("구매 전 체험");
    expect(useCaseTagLabel("home_recovery")).toBe("홈 회복 케어");
    expect(useCaseTagLabel("home_workout")).toBe("홈 운동");
    expect(useCaseTagLabel("home_care_routine")).toBe("홈 케어 루틴");
    expect(useCaseTagLabel("short_trial")).toBe("1일 체험에 적합");
    expect(useCaseTagLabel("weekly_trial")).toBe("주 단위 체험에 적합");
  });
});

describe("deriveSellerStorePreview — deterministic + bounded", () => {
  it("is byte-stable for the same input", () => {
    const input = {
      listings: [{ category: "massage_gun" } as const],
      requests: [{ pickupArea: "마포구", status: "requested" } as const],
    };
    const a = deriveSellerStorePreview(input);
    const b = deriveSellerStorePreview(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("classifies an empty seller as casual + emits the 'register first listing' nudge", () => {
    const out = deriveSellerStorePreview({ listings: [] });
    expect(out.storeType).toBe("casual");
    expect(out.publicListingCount).toBe(0);
    expect(out.categoryFocus).toEqual([]);
    expect(out.pickupAreas).toEqual([]);
    expect(out.improvementNudges).toContain("리스팅을 1개 이상 등록해 보세요.");
  });

  it("classifies 2-3 listings as repeat_light", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }, { category: "exercise" }],
    });
    expect(out.storeType).toBe("repeat_light");
    expect(out.publicListingCount).toBe(2);
  });

  it("classifies 4+ listings as micro_store", () => {
    const out = deriveSellerStorePreview({
      listings: [
        { category: "massage_gun" },
        { category: "massage_gun" },
        { category: "exercise" },
        { category: "home_care" },
      ],
    });
    expect(out.storeType).toBe("micro_store");
    expect(out.publicListingCount).toBe(4);
  });

  it("orders categoryFocus by frequency desc with alphabetical tie-break, capped at 3", () => {
    const out = deriveSellerStorePreview({
      listings: [
        { category: "massage_gun" },
        { category: "massage_gun" },
        { category: "massage_gun" },
        { category: "exercise" },
        { category: "exercise" },
        { category: "home_care" },
      ],
    });
    expect(out.categoryFocus).toEqual([
      "massage_gun",
      "exercise",
      "home_care",
    ]);
  });

  it("dedupes pickup areas, sorts alphabetically, caps at 3", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "성동구", status: "requested" },
        { pickupArea: "마포구", status: "seller_approved" },
        { pickupArea: "마포구", status: "requested" },
        { pickupArea: "강남구", status: "seller_cancelled" },
        { pickupArea: "은평구", status: "requested" },
      ],
    });
    expect(out.pickupAreas).toHaveLength(3);
    expect(new Set(out.pickupAreas).size).toBe(3);
    expect(out.pickupAreas).toEqual([...out.pickupAreas].sort());
  });

  it("treats omitted requests array as empty (no pending-response nudge, no diversify nudge)", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
    });
    expect(out.pickupAreas).toEqual([]);
    expect(out.improvementNudges).not.toContain(
      "받은 요청에 먼저 응답해 주세요.",
    );
    expect(out.improvementNudges).not.toContain(
      "수령 권역을 한두 곳으로 정리해 보세요.",
    );
  });

  it("emits the 'respond first' nudge when at least one request is in 'requested' status", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "마포구", status: "seller_approved" },
        { pickupArea: "성동구", status: "requested" },
      ],
    });
    expect(out.improvementNudges).toContain(
      "받은 요청에 먼저 응답해 주세요.",
    );
  });

  it("does NOT emit the 'respond first' nudge when no request is in 'requested' status", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "마포구", status: "seller_approved" },
        { pickupArea: "성동구", status: "seller_cancelled" },
      ],
    });
    expect(out.improvementNudges).not.toContain(
      "받은 요청에 먼저 응답해 주세요.",
    );
  });

  it("emits the 'diversify pickup' nudge only when there are more than 2 distinct pickup areas", () => {
    const two = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "마포구", status: "requested" },
        { pickupArea: "성동구", status: "requested" },
      ],
    });
    expect(two.improvementNudges).not.toContain(
      "수령 권역을 한두 곳으로 정리해 보세요.",
    );

    const three = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "마포구", status: "requested" },
        { pickupArea: "성동구", status: "requested" },
        { pickupArea: "강남구", status: "requested" },
      ],
    });
    expect(three.improvementNudges).toContain(
      "수령 권역을 한두 곳으로 정리해 보세요.",
    );
  });

  it("always includes the 'check components' nudge so the panel never reads as empty advice", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
    });
    expect(out.improvementNudges).toContain(
      "구성품 사진과 설명을 확인해 주세요.",
    );
  });

  it("caps improvementNudges at 3", () => {
    const out = deriveSellerStorePreview({
      listings: [],
      requests: [
        { pickupArea: "마포구", status: "requested" },
        { pickupArea: "성동구", status: "requested" },
        { pickupArea: "강남구", status: "requested" },
      ],
    });
    expect(out.improvementNudges.length).toBeLessThanOrEqual(3);
  });

  it("positioningSentence opens with the CoRent try-before-buy framing", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
    });
    expect(out.positioningSentence).toContain("사기 전에 며칠 써보기");
  });

  it("positioningSentence references the top category for repeat_light / micro_store", () => {
    const repeat = deriveSellerStorePreview({
      listings: [
        { category: "massage_gun" },
        { category: "massage_gun" },
      ],
    });
    expect(repeat.positioningSentence).toContain("마사지건");

    const micro = deriveSellerStorePreview({
      listings: [
        { category: "exercise" },
        { category: "exercise" },
        { category: "exercise" },
        { category: "exercise" },
      ],
    });
    expect(micro.positioningSentence).toContain("소형 운동기구");
    expect(micro.positioningSentence).toContain("마이크로 스토어");
  });

  it("never emits regulated-language phrases anywhere in the preview", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [
        { pickupArea: "마포구", status: "requested" },
        { pickupArea: "성동구", status: "seller_approved" },
        { pickupArea: "강남구", status: "seller_approved" },
      ],
    });
    const blob = JSON.stringify(out);
    for (const banned of [
      "결제 완료",
      "결제 처리",
      "대여 확정",
      "대여 완료",
      "보증금 청구",
      "보험",
      "보장",
      "환불",
      "정산 완료",
      "guaranteed",
      "verified_seller",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("never echoes a borrower id, seller id, or payment session id (the input shape forbids them)", () => {
    // The preview function takes only `{ listings, requests }`
    // with allowlisted fields. Even if a caller forges a wider
    // object via cast, the runtime never reads `borrowerId` /
    // `sellerId` / `sessionId` / amounts. We assert it on a
    // realistic call.
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
      requests: [{ pickupArea: "마포구", status: "requested" }],
    });
    const blob = JSON.stringify(out);
    expect(blob).not.toMatch(/borrowerId/);
    expect(blob).not.toMatch(/sellerId/);
    expect(blob).not.toMatch(/sessionId/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
    expect(blob).not.toMatch(/safetyDeposit/);
    expect(blob).not.toMatch(/sellerPayout/);
    expect(blob).not.toMatch(/platformFee/);
  });

  it("carries provenance = 'deterministic' (never llm_candidate / human_reviewed in this slice)", () => {
    const out = deriveSellerStorePreview({
      listings: [{ category: "massage_gun" }],
    });
    expect(out.provenance).toBe("deterministic");
  });
});

describe("storeTypeLabel — Korean labels", () => {
  it("returns calm Korean copy for every store type", () => {
    expect(storeTypeLabel("casual")).toBe("가벼운 시도");
    expect(storeTypeLabel("repeat_light")).toBe("반복 시도");
    expect(storeTypeLabel("micro_store")).toBe("마이크로 스토어");
  });
});

describe("explainMatch — sort + dedup invariants", () => {
  it("output reasons are sorted by label (byte-stable React keys)", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    const labels = r.reasons.map((x) => x.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("output cautions are sorted by label", () => {
    const r = explainMatch(intentFixture(), listingFixture());
    const labels = r.cautions.map((x) => x.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

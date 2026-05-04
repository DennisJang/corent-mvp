import { describe, expect, it } from "vitest";
import type { RentalIntentStatus } from "@/domain/intents";
import {
  APPROVAL_COPY,
  CLAIM_REVIEW_COPY,
  CLAIM_WINDOW_COPY,
  HANDOFF_RITUAL_COPY,
  LISTING_CARD_COPY,
  STOREFRONT_COPY,
  TRUST_SUMMARY_COPY,
  formatFromOneDayPrice,
  formatHandoffProgress,
  formatPriceBreakdown,
  getReturnTrustStatusCopy,
} from "./returnTrust";

const ALL_STATUSES: RentalIntentStatus[] = [
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
];

// All forbidden tokens collected in one place so any drift across the
// copy module surfaces in a single test failure.
const FORBIDDEN_TOKENS = [
  "보험",
  "보장",
  "보상",
  "안전거래",
  "에스크로",
  "무조건 보호",
  "insurance",
  "guarantee",
  "coverage",
  "claim payout",
  "fully refunded",
  "fraud protection",
];

describe("getReturnTrustStatusCopy", () => {
  it("returns a non-empty string for every RentalIntentStatus", () => {
    for (const s of ALL_STATUSES) {
      const copy = getReturnTrustStatusCopy(s);
      expect(typeof copy).toBe("string");
      expect(copy.length).toBeGreaterThan(0);
    }
  });

  it("never uses forbidden regulated-language tokens for any status", () => {
    for (const s of ALL_STATUSES) {
      const copy = getReturnTrustStatusCopy(s);
      for (const t of FORBIDDEN_TOKENS) {
        expect(copy.toLowerCase().includes(t.toLowerCase())).toBe(false);
      }
    }
  });
});

describe("LISTING_CARD_COPY", () => {
  it("contains the documented strings", () => {
    expect(LISTING_CARD_COPY.tryBeforeBuy).toBe("사기 전 며칠 써보기");
    expect(LISTING_CARD_COPY.conditionCheck).toBe("픽업·반납 상태 확인");
    expect(LISTING_CARD_COPY.approvalRequired).toBe("요청 후 대여 가능 여부 확인");
  });

  it("avoids forbidden tokens", () => {
    const all = Object.values(LISTING_CARD_COPY).join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});

describe("formatFromOneDayPrice", () => {
  it("formats '1일 ₩8,000부터' shape", () => {
    expect(formatFromOneDayPrice(8000)).toBe("1일 ₩8,000부터");
  });
  it("uses ko-KR thousand separators", () => {
    expect(formatFromOneDayPrice(1234567)).toBe("1일 ₩1,234,567부터");
  });
});

describe("formatPriceBreakdown", () => {
  it("renders both durations side by side", () => {
    expect(
      formatPriceBreakdown({ threeDays: 21000, sevenDays: 39000 }),
    ).toBe("3일 ₩21,000 · 7일 ₩39,000");
  });
});

describe("HANDOFF_RITUAL_COPY + CLAIM_WINDOW_COPY", () => {
  it("uses safe process-language and avoids forbidden tokens", () => {
    const all = [
      ...Object.values(HANDOFF_RITUAL_COPY.pickup),
      ...Object.values(HANDOFF_RITUAL_COPY.return),
      ...Object.values(HANDOFF_RITUAL_COPY.checklist),
      HANDOFF_RITUAL_COPY.noUploadYet,
      HANDOFF_RITUAL_COPY.manualNoteHint,
      HANDOFF_RITUAL_COPY.conditionStatus,
      HANDOFF_RITUAL_COPY.returnConfirmed,
      HANDOFF_RITUAL_COPY.dashboardSectionTitle,
      HANDOFF_RITUAL_COPY.sellerConfirmAction,
      HANDOFF_RITUAL_COPY.sellerConfirmDone,
      HANDOFF_RITUAL_COPY.borrowerLater,
      formatHandoffProgress("pickup", 3),
      formatHandoffProgress("return", 5),
      ...Object.values(CLAIM_WINDOW_COPY),
    ].join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });

  it("checklist labels match the documented 5 items", () => {
    expect(HANDOFF_RITUAL_COPY.checklist.mainUnit).toBe("본체 확인");
    expect(HANDOFF_RITUAL_COPY.checklist.components).toBe("구성품 확인");
    expect(HANDOFF_RITUAL_COPY.checklist.working).toBe("작동 확인");
    expect(HANDOFF_RITUAL_COPY.checklist.appearance).toBe("외관 상태 확인");
    expect(HANDOFF_RITUAL_COPY.checklist.preexisting).toBe("기존 하자 확인");
  });

  it("explicitly states there is no upload yet and offers a manual note", () => {
    expect(HANDOFF_RITUAL_COPY.noUploadYet).toBe(
      "사진 업로드는 아직 구현되지 않았어요.",
    );
    expect(HANDOFF_RITUAL_COPY.manualNoteHint).toBe(
      "메모나 링크로 상태 기록을 남길 수 있어요.",
    );
  });

  it("dashboard surface labels match the documented strings", () => {
    expect(HANDOFF_RITUAL_COPY.dashboardSectionTitle).toBe("픽업·반납 체크");
    expect(HANDOFF_RITUAL_COPY.sellerConfirmAction).toBe("판매자 확인");
    expect(HANDOFF_RITUAL_COPY.sellerConfirmDone).toBe("판매자 확인 완료");
    expect(HANDOFF_RITUAL_COPY.borrowerLater).toBe(
      "대여자 확인은 실제 로그인 이후 연결됩니다.",
    );
  });
});

describe("formatHandoffProgress", () => {
  it("renders pickup and return progress with documented shape", () => {
    expect(formatHandoffProgress("pickup", 0)).toBe("픽업 체크 0/5");
    expect(formatHandoffProgress("pickup", 3)).toBe("픽업 체크 3/5");
    expect(formatHandoffProgress("return", 5)).toBe("반납 체크 5/5");
  });
  it("respects a custom total", () => {
    expect(formatHandoffProgress("pickup", 2, 10)).toBe("픽업 체크 2/10");
  });
});

describe("TRUST_SUMMARY_COPY", () => {
  it("contains the documented strings", () => {
    expect(TRUST_SUMMARY_COPY.sectionTitle).toBe("신뢰 이력");
    expect(TRUST_SUMMARY_COPY.successfulReturns).toBe("정상 반납 이력");
    expect(TRUST_SUMMARY_COPY.pickupConfirmedCount).toBe("픽업 체크 완료");
    expect(TRUST_SUMMARY_COPY.returnConfirmedCount).toBe("반납 체크 완료");
    expect(TRUST_SUMMARY_COPY.conditionCheckCompletedCount).toBe(
      "상태 확인 완료",
    );
    expect(TRUST_SUMMARY_COPY.accountStandingLabel).toBe("계정 상태");
    expect(TRUST_SUMMARY_COPY.accountStandingNormal).toBe("정상");
    expect(TRUST_SUMMARY_COPY.accountStandingLimited).toBe("제한");
    expect(TRUST_SUMMARY_COPY.accountStandingBlocked).toBe("차단");
  });

  it("avoids forbidden regulated-language tokens", () => {
    const all = Object.values(TRUST_SUMMARY_COPY).join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});

describe("CLAIM_WINDOW_COPY", () => {
  it("contains the documented action labels", () => {
    expect(CLAIM_WINDOW_COPY.closeNoClaimAction).toBe("정상 반납으로 마무리");
    expect(CLAIM_WINDOW_COPY.openClaimAction).toBe("상태 문제 보고");
    expect(CLAIM_WINDOW_COPY.sectionTitle).toBe("반납 후 상태 확인");
  });
  it("explicitly disclaims any payout/settlement coupling", () => {
    expect(CLAIM_WINDOW_COPY.noPayoutNote).toBe(
      "결제·정산 처리는 아직 연결되어 있지 않아요.",
    );
  });
});

describe("CLAIM_REVIEW_COPY", () => {
  it("contains the documented decision and status labels", () => {
    expect(CLAIM_REVIEW_COPY.pageTitle).toBe("관리자 검토 큐");
    expect(CLAIM_REVIEW_COPY.statusOpen).toBe("검토 대기");
    expect(CLAIM_REVIEW_COPY.statusApproved).toBe("승인");
    expect(CLAIM_REVIEW_COPY.statusRejected).toBe("반려");
    expect(CLAIM_REVIEW_COPY.statusNeedsReview).toBe("추가 검토 필요");
    expect(CLAIM_REVIEW_COPY.decisionApproveAction).toBe("승인");
    expect(CLAIM_REVIEW_COPY.decisionRejectAction).toBe("반려");
    expect(CLAIM_REVIEW_COPY.decisionNeedsReviewAction).toBe("추가 검토");
  });
  it("avoids forbidden regulated-language tokens", () => {
    const all = Object.values(CLAIM_REVIEW_COPY).join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});

describe("STOREFRONT_COPY", () => {
  it("contains the documented headings and read-only disclaimer", () => {
    expect(STOREFRONT_COPY.pageTag).toBe("Seller storefront");
    expect(STOREFRONT_COPY.introTitle).toBe("공개 프로필");
    expect(STOREFRONT_COPY.listingsHeading).toBe("이 셀러의 물건");
    expect(STOREFRONT_COPY.trustHeading).toBe("신뢰 이력");
    expect(STOREFRONT_COPY.readOnlyNote).toBe(
      "공개 정보만 표시돼요. 요청 흐름은 물건 페이지에서 확인해요.",
    );
    expect(STOREFRONT_COPY.fallbackTag).toBe("프로필 일부만 등록됨");
  });
  it("avoids forbidden regulated-language and payment-implementation tokens", () => {
    const all = Object.values(STOREFRONT_COPY).join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
    for (const t of ["토스페이먼츠", "stripe", "kakaopay", "payco"]) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});

describe("APPROVAL_COPY", () => {
  it("contains the documented strings", () => {
    expect(APPROVAL_COPY.notChargedYet).toBe("아직 결제되지 않았어요.");
    expect(APPROVAL_COPY.awaitingSellerApproval).toBe(
      "소유자가 대여 가능 여부를 확인하면 다음 단계로 진행됩니다.",
    );
    expect(APPROVAL_COPY.approveSuccess).toBe("대여 요청을 승인했어요.");
    expect(APPROVAL_COPY.declineSuccess).toBe("대여 요청을 거절했어요.");
  });

  it("documents the request-only renter strings (Phase 1.11)", () => {
    expect(APPROVAL_COPY.requestOnlyTitle).toBe("요청 단계 (베타)");
    expect(APPROVAL_COPY.requestCtaIdle).toBe("대여 요청 보내기");
    expect(APPROVAL_COPY.requestReceived).toBe("요청을 보냈어요");
    expect(APPROVAL_COPY.renterMutationsDeferred).toBe(
      "요청 이후 단계(취소, 결제, 픽업, 반납)는 베타에서 아직 열려 있지 않아요.",
    );
  });

  it("avoids forbidden regulated-language and payment-implementation claims", () => {
    const all = Object.values(APPROVAL_COPY).join(" ");
    for (const t of FORBIDDEN_TOKENS) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
    // No claim of integration with a real PG / payment provider.
    for (const t of ["토스페이먼츠", "stripe", "kakaopay", "payco"]) {
      expect(all.toLowerCase().includes(t.toLowerCase())).toBe(false);
    }
  });
});

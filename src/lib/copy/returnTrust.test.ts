import { describe, expect, it } from "vitest";
import type { RentalIntentStatus } from "@/domain/intents";
import {
  APPROVAL_COPY,
  CLAIM_WINDOW_COPY,
  HANDOFF_RITUAL_COPY,
  LISTING_CARD_COPY,
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
    expect(LISTING_CARD_COPY.tryBeforeBuy).toBe("사기 전 며칠만 써보기");
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

describe("APPROVAL_COPY", () => {
  it("contains the documented strings", () => {
    expect(APPROVAL_COPY.notChargedYet).toBe("아직 결제되지 않았어요.");
    expect(APPROVAL_COPY.awaitingSellerApproval).toBe(
      "소유자가 대여 가능 여부를 확인하면 다음 단계로 진행됩니다.",
    );
    expect(APPROVAL_COPY.approveSuccess).toBe("대여 요청을 승인했어요.");
    expect(APPROVAL_COPY.declineSuccess).toBe("대여 요청을 거절했어요.");
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

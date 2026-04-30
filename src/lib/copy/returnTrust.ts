// Shared safe Korean copy for the CoRent Return Trust Layer. Keep all
// trust-tone strings here so listing surfaces, dashboards, and future
// trust UIs use the same wording.
//
// Hard rules these strings respect (see
// docs/corent_return_trust_layer.md §7 and
// docs/corent_legal_trust_architecture_note.md):
//
//   - No regulated language: 보험 / 보장 / 보상 보장 / 파손 보장 /
//     전액 보상 / 안전거래 / 에스크로 / 무조건 보호 are forbidden.
//   - No "guarantee", "coverage", "insurance", "claim payout",
//     "fully refunded", "fraud protection" in English either.
//   - Process-trust framing only: "확인", "기록", "검토" — never
//     "보호", "보상", "보장".

import type { RentalIntentStatus } from "@/domain/intents";
import { formatKRW } from "@/lib/format";

// --------------------------------------------------------------
// LISTING_CARD_COPY — the four small lines that demote price from
// "first impression" to "alongside intent and trust" on a browse card.
// See docs/corent_return_trust_layer.md §3.
// --------------------------------------------------------------

export const LISTING_CARD_COPY = {
  // 1. Experience desire / try-before-buy framing.
  tryBeforeBuy: "사기 전 며칠만 써보기",
  // 3. Return trust signal.
  conditionCheck: "픽업·반납 상태 확인",
  // 5. Request / approval condition.
  approvalRequired: "요청 후 대여 가능 여부 확인",
} as const;

// "1일 ₩8,000부터" pattern. The card lead price line. Keeps the price
// visible without making it the visual peak.
export function formatFromOneDayPrice(amount: number): string {
  return `1일 ${formatKRW(amount)}부터`;
}

// "3일 ₩21,000 · 7일 ₩39,000" — secondary breakdown line. Always
// rendered at small / muted weight per the design system.
export function formatPriceBreakdown(prices: {
  threeDays: number;
  sevenDays: number;
}): string {
  return `3일 ${formatKRW(prices.threeDays)} · 7일 ${formatKRW(prices.sevenDays)}`;
}

// --------------------------------------------------------------
// RETURN_TRUST_STATUS_COPY — short borrower-facing status messages
// for each existing RentalIntentStatus. Used when a surface needs to
// say "where is this rental in the trust loop right now?" without
// inventing per-screen wording.
//
// All copy here is process language: "확인 중", "기록 중", "검토 중".
// No payout / coverage / insurance language.
// --------------------------------------------------------------

const STATUS_COPY: Record<RentalIntentStatus, string> = {
  draft: "임시 저장 중",
  requested: "소유자 확인 대기 중",
  seller_approved: "결제 단계로 안내했어요",
  payment_pending: "결제 진행 중",
  paid: "결제 완료 — 픽업 안내 대기",
  pickup_confirmed: "픽업 확인 완료 — 대여 중",
  return_pending: "반납 확인 대기 중",
  return_confirmed: "반납 확인 완료 — 상태 기록 중",
  settlement_ready: "정산 준비",
  settled: "정상 반납 완료",
  cancelled: "취소됨",
  payment_failed: "결제 실패 — 다시 시도할 수 있어요",
  seller_cancelled: "소유자가 요청을 취소했어요",
  borrower_cancelled: "요청이 취소되었어요",
  pickup_missed: "픽업 시점이 지났어요 — 일정 확인이 필요해요",
  return_overdue: "반납 예정일을 지났어요",
  damage_reported: "상태 문제 확인 중",
  dispute_opened: "관리자 검토 진행 중",
  settlement_blocked: "정산 보류 — 관리자 검토 중",
};

export function getReturnTrustStatusCopy(status: RentalIntentStatus): string {
  return STATUS_COPY[status];
}

// --------------------------------------------------------------
// HANDOFF_RITUAL_COPY — short labels for the future Return Ritual
// checklist. Surfaces are not built yet; the strings live here so the
// next PR can wire them in without a separate copy review.
// --------------------------------------------------------------

export const HANDOFF_RITUAL_COPY = {
  pickup: {
    sectionTitle: "픽업 체크",
    matchSameAsPhoto: "사진과 동일한 물건이에요",
    componentsPresent: "구성품이 모두 있어요",
    safetyCodeVisible: "안전 코드가 보여요",
  },
  return: {
    sectionTitle: "반납 체크",
    sameCondition: "픽업 때와 같은 상태로 돌아왔어요",
    issueNoted: "상태 문제가 있어요",
  },
} as const;

// --------------------------------------------------------------
// CLAIM_WINDOW_COPY — short labels for the post-return inspection
// window. Open / no claim / with claim only; no payout language.
// --------------------------------------------------------------

export const CLAIM_WINDOW_COPY = {
  open: "반납 후 상태 확인 기간",
  closedNoClaim: "정상 반납으로 마무리",
  closedWithClaim: "상태 문제 확인 — 관리자 검토 중",
} as const;

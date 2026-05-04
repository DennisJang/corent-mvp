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
  tryBeforeBuy: "사기 전 며칠 써보기",
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

// Beta posture: the four money-adjacent statuses carry "(베타)" so a
// borrower-facing surface never reads as "money was actually charged
// or paid out". The state-machine values are unchanged.
const STATUS_COPY: Record<RentalIntentStatus, string> = {
  draft: "임시 저장 중",
  requested: "소유자 확인 대기 중",
  seller_approved: "다음 단계로 안내했어요",
  payment_pending: "결제 단계 진행 (베타)",
  paid: "결제 단계 통과 (베타) — 픽업 안내 대기",
  pickup_confirmed: "픽업 확인 완료 — 대여 중",
  return_pending: "반납 확인 대기 중",
  return_confirmed: "반납 확인 완료 — 상태 기록 중",
  settlement_ready: "정산 단계 준비 (베타)",
  settled: "정상 반납 완료 (베타: 실지급 없음)",
  cancelled: "취소됨",
  payment_failed: "결제 단계 실패 (베타) — 다시 시도할 수 있어요",
  seller_cancelled: "소유자가 요청을 취소했어요",
  borrower_cancelled: "요청이 취소되었어요",
  pickup_missed: "픽업 시점이 지났어요 — 일정 확인이 필요해요",
  return_overdue: "반납 예정일을 지났어요",
  damage_reported: "상태 문제 확인 중",
  dispute_opened: "관리자 검토 진행 중",
  settlement_blocked: "정산 단계 보류 (베타) — 관리자 검토 중",
};

export function getReturnTrustStatusCopy(status: RentalIntentStatus): string {
  return STATUS_COPY[status];
}

// --------------------------------------------------------------
// APPROVAL_COPY — borrower- and seller-facing strings around the
// "seller approval before payment" flow. Avoids any payment language
// because real payment is not implemented yet.
// --------------------------------------------------------------

export const APPROVAL_COPY = {
  // Item detail / request-confirmed surface — borrower view.
  notChargedYet: "아직 결제되지 않았어요.",
  awaitingSellerApproval:
    "소유자가 대여 가능 여부를 확인하면 다음 단계로 진행됩니다.",
  paymentNotImplementedYet:
    "결제는 아직 구현되지 않았어요. 소유자 승인 이후 단계는 별도로 안내됩니다.",

  // Seller dashboard — toast-style confirmations.
  approveSuccess: "대여 요청을 승인했어요.",
  declineSuccess: "대여 요청을 거절했어요.",

  // Generic surface label.
  approvalRequired: "요청 후 대여 가능 여부를 확인해요.",

  // Phase 1.11 — request-only renter copy.
  requestOnlyTitle: "요청 단계 (베타)",
  requestOnlyBody:
    "이 단계는 소유자에게 대여 가능 여부를 묻는 요청 흐름이에요. 베타에서는 결제, 보증금, 환불, 정산, 배송이 연결되어 있지 않아요. 아래 표시 금액은 참고용이에요.",
  requestCtaIdle: "대여 요청 보내기",
  requestCtaSubmitting: "요청 보내는 중…",
  requestReceived: "요청을 보냈어요",
  // Renter follow-up mutations are deliberately out of scope for now.
  renterMutationsDeferred:
    "요청 이후 단계(취소, 결제, 픽업, 반납)는 베타에서 아직 열려 있지 않아요.",
} as const;

// --------------------------------------------------------------
// HANDOFF_RITUAL_COPY — short labels for the future Return Ritual
// checklist. Surfaces are not built yet; the strings live here so the
// next PR can wire them in without a separate copy review.
// --------------------------------------------------------------

export const HANDOFF_RITUAL_COPY = {
  pickup: {
    sectionTitle: "픽업 체크",
    intro: "픽업 때 상태를 함께 확인해요.",
    matchSameAsPhoto: "사진과 동일한 물건이에요",
    componentsPresent: "구성품이 모두 있어요",
    safetyCodeVisible: "안전 코드가 보여요",
  },
  return: {
    sectionTitle: "반납 체크",
    intro: "반납 때 구성품과 작동 여부를 다시 확인해요.",
    sameCondition: "픽업 때와 같은 상태로 돌아왔어요",
    issueNoted: "상태 문제가 있어요",
  },
  // 5-step checklist labels; keys mirror HandoffChecks 1:1.
  checklist: {
    mainUnit: "본체 확인",
    components: "구성품 확인",
    working: "작동 확인",
    appearance: "외관 상태 확인",
    preexisting: "기존 하자 확인",
  },
  // Static hints rendered next to the checklist. No upload claim, no
  // payment / regulated language.
  noUploadYet: "사진 업로드는 아직 구현되지 않았어요.",
  manualNoteHint: "메모나 링크로 상태 기록을 남길 수 있어요.",
  conditionStatus: "상태 확인",
  returnConfirmed: "반납 확인",
  // Phase 1.3 dashboard surface.
  dashboardSectionTitle: "픽업·반납 체크",
  sellerConfirmAction: "판매자 확인",
  sellerConfirmDone: "판매자 확인 완료",
  borrowerLater: "대여자 확인은 실제 로그인 이후 연결됩니다.",
} as const;

// "픽업 체크 3/5" / "반납 체크 5/5" — small progress label for the
// dashboard surface.
export function formatHandoffProgress(
  phase: "pickup" | "return",
  done: number,
  total = 5,
): string {
  const label = phase === "pickup" ? "픽업 체크" : "반납 체크";
  return `${label} ${done}/${total}`;
}

// --------------------------------------------------------------
// TRUST_SUMMARY_COPY — labels for the count-only trust history view
// surfaced on the seller dashboard. Process language only — no
// scoring, no badges, no payment / regulated terms.
// --------------------------------------------------------------

export const TRUST_SUMMARY_COPY = {
  sectionTitle: "신뢰 이력",
  successfulReturns: "정상 반납 이력",
  pickupConfirmedCount: "픽업 체크 완료",
  returnConfirmedCount: "반납 체크 완료",
  conditionCheckCompletedCount: "상태 확인 완료",
  accountStandingLabel: "계정 상태",
  // accountStanding values are mapped to safe display copy here.
  accountStandingNormal: "정상",
  accountStandingLimited: "제한",
  accountStandingBlocked: "차단",
} as const;

// --------------------------------------------------------------
// CLAIM_WINDOW_COPY — short labels for the post-return inspection
// window. Open / no claim / with claim only; no payout language.
// --------------------------------------------------------------

export const CLAIM_WINDOW_COPY = {
  sectionTitle: "반납 후 상태 확인",
  open: "반납 후 상태 확인 기간",
  closedNoClaim: "정상 반납으로 마무리",
  closedWithClaim: "상태 문제 확인 — 관리자 검토 중",
  closeNoClaimAction: "정상 반납으로 마무리",
  openClaimAction: "상태 문제 보고",
  reasonLabel: "상태 문제 메모 (선택)",
  reasonPlaceholder: "예: 본체에 새로운 흠집이 보여요.",
  intro: "반납 직후 상태를 한 번 더 확인하는 기간이에요.",
  noPayoutNote: "결제·정산 처리는 아직 연결되어 있지 않아요.",
} as const;

// --------------------------------------------------------------
// STOREFRONT_COPY — labels for the public seller storefront. The
// surface is read-only and never implies booking/payment/deposit;
// the visitor must follow an item link to interact with a listing.
// --------------------------------------------------------------

export const STOREFRONT_COPY = {
  pageTag: "Seller storefront",
  introTitle: "공개 프로필",
  // Default seller intro shown when no per-seller copy is on file.
  defaultIntro:
    "이 셀러는 사기 전 며칠 써보기 위한 물건을 함께 빌려줍니다.",
  listingsHeading: "이 셀러의 물건",
  emptyListings: "아직 등록된 물건이 없어요.",
  trustHeading: "신뢰 이력",
  // Visitor-facing fallback when a count summary cannot be computed.
  trustEmpty: "공개 신뢰 이력이 아직 모이지 않았어요.",
  // Read-only / no-action disclaimer that pairs with the claim window
  // copy elsewhere — this surface never books, never charges.
  readOnlyNote: "공개 정보만 표시돼요. 요청 흐름은 물건 페이지에서 확인해요.",
  // Fallback marker copy shown when `isFallback` is true (no Seller
  // record). The reviewer must be able to tell this is not real
  // persisted profile data.
  fallbackTag: "프로필 일부만 등록됨",
  fallbackHint:
    "공식 프로필이 아직 등록되지 않아 공개 카드 정보만 보이는 상태예요.",
} as const;

// --------------------------------------------------------------
// CLAIM_REVIEW_COPY — admin-side decision skeleton labels. No payout,
// deposit, refund, or insurance words. The three decisions are
// placeholder state — recording one does NOT trigger money movement.
// --------------------------------------------------------------

export const CLAIM_REVIEW_COPY = {
  pageTitle: "관리자 검토 큐",
  pageHint:
    "관리자 결정은 기록만 남기고 결제·정산을 자동으로 움직이지 않아요.",
  emptyQueue: "검토할 항목이 없어요.",
  statusOpen: "검토 대기",
  statusApproved: "승인",
  statusRejected: "반려",
  statusNeedsReview: "추가 검토 필요",
  decisionApproveAction: "승인",
  decisionRejectAction: "반려",
  decisionNeedsReviewAction: "추가 검토",
  decisionNotesLabel: "검토 메모 (선택)",
  decisionNotesPlaceholder: "예: 픽업 사진과 비교 결과 차이가 작아요.",
} as const;

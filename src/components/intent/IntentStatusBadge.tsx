// Renders a RentalIntent status as a BW badge. No color — confirmed states
// are filled black, pending dashed, failure states use a strong outline +
// plain text label so failures read clearly without warning colors.

import { Badge } from "@/components/Badge";
import {
  RENTAL_FAILURE_STATES,
  type RentalIntentStatus,
} from "@/domain/intents";

// State labels are surfaced as badges across the dashboard, item detail,
// and storefront. The four money-adjacent states (`payment_pending`,
// `paid`, `settlement_ready`, `settled`) plus their failure variants
// carry a "(베타)" suffix so a casual reader cannot mistake a state
// transition for an actual charge / payout. The state-machine values
// themselves are unchanged — only the user-visible label is.
const STATUS_LABEL: Record<RentalIntentStatus, string> = {
  draft: "임시 저장",
  requested: "요청 접수",
  seller_approved: "판매자 승인",
  payment_pending: "결제 단계 (베타)",
  paid: "결제 단계 완료 (베타)",
  pickup_confirmed: "수령 완료",
  return_pending: "반납 대기",
  return_confirmed: "반납 확인",
  settlement_ready: "정산 단계 준비 (베타)",
  settled: "정산 단계 완료 (베타)",
  cancelled: "취소됨",
  payment_failed: "결제 단계 실패 (베타)",
  seller_cancelled: "판매자 취소",
  borrower_cancelled: "대여자 취소",
  pickup_missed: "수령 미완료",
  return_overdue: "반납 지연",
  damage_reported: "파손 보고",
  dispute_opened: "분쟁 처리",
  settlement_blocked: "정산 단계 보류 (베타)",
};

const FILLED_STATES = new Set<RentalIntentStatus>([
  "paid",
  "pickup_confirmed",
  "return_confirmed",
  "settlement_ready",
  "settled",
]);

const DASHED_STATES = new Set<RentalIntentStatus>([
  "draft",
  "requested",
  "seller_approved",
  "payment_pending",
  "return_pending",
]);

export function statusLabel(status: RentalIntentStatus): string {
  return STATUS_LABEL[status];
}

export function IntentStatusBadge({ status }: { status: RentalIntentStatus }) {
  if (FILLED_STATES.has(status)) {
    return <Badge variant="filled">{statusLabel(status)}</Badge>;
  }
  if (RENTAL_FAILURE_STATES.includes(status)) {
    // Strong solid outline + plain label — visible without color.
    return <Badge variant="selected">{statusLabel(status)}</Badge>;
  }
  if (DASHED_STATES.has(status)) {
    return <Badge variant="dashed">{statusLabel(status)}</Badge>;
  }
  return <Badge variant="outline">{statusLabel(status)}</Badge>;
}

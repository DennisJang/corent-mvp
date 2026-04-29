// Renders a RentalIntent status as a BW badge. No color — confirmed states
// are filled black, pending dashed, failure states use a strong outline +
// plain text label so failures read clearly without warning colors.

import { Badge } from "@/components/Badge";
import {
  RENTAL_FAILURE_STATES,
  type RentalIntentStatus,
} from "@/domain/intents";

const STATUS_LABEL: Record<RentalIntentStatus, string> = {
  draft: "임시 저장",
  requested: "요청 접수",
  seller_approved: "판매자 승인",
  payment_pending: "결제 대기",
  paid: "결제 완료",
  pickup_confirmed: "수령 완료",
  return_pending: "반납 대기",
  return_confirmed: "반납 확인",
  settlement_ready: "정산 준비",
  settled: "정산 완료",
  cancelled: "취소됨",
  payment_failed: "결제 실패",
  seller_cancelled: "판매자 취소",
  borrower_cancelled: "대여자 취소",
  pickup_missed: "수령 미완료",
  return_overdue: "반납 지연",
  damage_reported: "파손 보고",
  dispute_opened: "분쟁 처리",
  settlement_blocked: "정산 보류",
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

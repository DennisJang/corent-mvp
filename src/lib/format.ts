// Display formatters. Keep formatting separate from domain math so the
// pricing module stays pure and currency-agnostic.

export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

// Existing call-sites still import these; delegate to the pricing module so
// there is exactly one source of truth.
export { COMMISSION_RATE, calculateSettlementAmount as calculateSettlement } from "@/lib/pricing";

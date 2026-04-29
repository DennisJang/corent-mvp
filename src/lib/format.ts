export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export const COMMISSION_RATE = 0.1;

export function calculateSettlement(rentalFee: number): number {
  return Math.round(rentalFee * (1 - COMMISSION_RATE));
}

// Dashboard derivations. Given a list of RentalIntents (and listings), turn
// them into the numbers and rows the dashboard renders. All pure — easy to
// test, easy to feed mock data through.

import type {
  ListingIntent,
  RentalIntent,
  RentalIntentStatus,
} from "@/domain/intents";
import { isFailureStatus } from "@/domain/intents";
import { calculateSellerPayout } from "@/lib/pricing";

export type DashboardSummary = {
  monthlyEarnings: number; // sum of seller payouts on settled rentals this month
  pendingSettlement: number; // settlement_ready (not yet settled)
  activeRentals: number;
  pendingRequests: number;
  listedItems: number;
  returnsDueSoon: number;
  failureCount: number;
};

// Statuses that should appear in the seller's "활성 대여" list. Includes
// every step of the lifecycle that still needs the seller's attention,
// from approval through to the final settle action. `requested` is excluded
// because pending requests get their own block; `settled` is excluded
// because it is terminal.
const ACTIVE_STATUSES: RentalIntentStatus[] = [
  "seller_approved",
  "payment_pending",
  "paid",
  "pickup_confirmed",
  "return_pending",
  "return_confirmed",
  "settlement_ready",
];

function isThisMonth(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

export function deriveDashboardSummary(
  rentals: RentalIntent[],
  listings: ListingIntent[],
  now = new Date(),
): DashboardSummary {
  let monthlyEarnings = 0;
  let pendingSettlement = 0;
  let activeRentals = 0;
  let pendingRequests = 0;
  let returnsDueSoon = 0;
  let failureCount = 0;

  for (const r of rentals) {
    if (r.status === "settled" && isThisMonth(r.updatedAt, now)) {
      monthlyEarnings += calculateSellerPayout(r.amounts.rentalFee);
    }
    if (r.status === "settlement_ready") {
      pendingSettlement += r.settlement.sellerPayout;
    }
    if (ACTIVE_STATUSES.includes(r.status)) activeRentals += 1;
    if (r.status === "requested") pendingRequests += 1;
    if (r.status === "return_pending" || r.status === "return_overdue")
      returnsDueSoon += 1;
    if (isFailureStatus(r.status)) failureCount += 1;
  }

  return {
    monthlyEarnings,
    pendingSettlement,
    activeRentals,
    pendingRequests,
    listedItems: listings.length,
    returnsDueSoon,
    failureCount,
  };
}

export function pendingRequestRows(rentals: RentalIntent[]): RentalIntent[] {
  return rentals
    .filter((r) => r.status === "requested")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activeRentalRows(rentals: RentalIntent[]): RentalIntent[] {
  return rentals
    .filter((r) => ACTIVE_STATUSES.includes(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function failureRows(rentals: RentalIntent[]): RentalIntent[] {
  return rentals
    .filter((r) => isFailureStatus(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso).getTime();
  const diff = now.getTime() - d;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.round(h / 24);
  return `${days}일 전`;
}

// Mock RentalIntents that seed the dashboard when no real local data
// exists yet. Each represents a different lifecycle state so the dashboard
// can render the full range without forcing the user to step through the
// whole state machine first.
//
// Pricing is derived from the source product via the canonical pricing
// formula — this file never hardcodes amounts, so changing the formula in
// `lib/pricing.ts` automatically updates these fixtures.

import type {
  PaymentStatus,
  RentalIntent,
  RentalIntentStatus,
  SettlementStatus,
} from "@/domain/intents";
import type { DurationDays, DurationKey } from "@/domain/durations";
import { calculateRentalAmounts } from "@/lib/pricing";
import { CURRENT_SELLER } from "./mockSellers";
import { getProductById, type Product } from "./products";

function durationKey(days: DurationDays): DurationKey {
  return days === 1 ? "1d" : days === 3 ? "3d" : "7d";
}

function pickupStatus(s: RentalIntentStatus): RentalIntent["pickup"]["status"] {
  switch (s) {
    case "pickup_confirmed":
    case "return_pending":
    case "return_confirmed":
    case "return_overdue":
    case "damage_reported":
    case "settlement_ready":
    case "settlement_blocked":
    case "dispute_opened":
    case "settled":
      return "confirmed";
    case "pickup_missed":
      return "missed";
    default:
      return "not_scheduled";
  }
}

function returnStatus(s: RentalIntentStatus): RentalIntent["return"]["status"] {
  switch (s) {
    case "return_pending":
      return "pending";
    case "return_confirmed":
    case "settlement_ready":
    case "settlement_blocked":
    case "settled":
      return "confirmed";
    case "return_overdue":
      return "overdue";
    case "damage_reported":
      return "damage_reported";
    default:
      return "not_due";
  }
}

function settlementStatus(s: RentalIntentStatus): SettlementStatus {
  switch (s) {
    case "settled":
      return "settled";
    case "settlement_ready":
      return "ready";
    case "settlement_blocked":
      return "blocked";
    default:
      return "not_ready";
  }
}

function paymentStatus(s: RentalIntentStatus): PaymentStatus {
  switch (s) {
    case "paid":
    case "pickup_confirmed":
    case "return_pending":
    case "return_confirmed":
    case "return_overdue":
    case "damage_reported":
    case "settlement_ready":
    case "settlement_blocked":
    case "dispute_opened":
    case "settled":
      return "paid";
    case "payment_failed":
      return "failed";
    case "payment_pending":
      return "pending";
    default:
      return "not_started";
  }
}

type MockSeed = {
  id: string;
  productId: string;
  durationDays: DurationDays;
  status: RentalIntentStatus;
  borrowerName: string;
  createdAt: string;
  updatedAt: string;
};

function buildMock(seed: MockSeed): RentalIntent {
  const product = getProductById(seed.productId) as Product;
  const rentalFee = product.prices[durationKey(seed.durationDays)];
  const amounts = calculateRentalAmounts(rentalFee, product.estimatedValue);

  return {
    id: seed.id,
    productId: seed.productId,
    productName: product.name,
    productCategory: product.category,
    // All mock rentals belong to the demo seller so they appear on the
    // current dashboard view, even when the product technically lists a
    // different seller in the catalog.
    sellerId: CURRENT_SELLER.id,
    sellerName: CURRENT_SELLER.name,
    borrowerName: seed.borrowerName,
    status: seed.status,
    durationDays: seed.durationDays,
    amounts,
    payment: {
      provider: "mock",
      status: paymentStatus(seed.status),
    },
    pickup: {
      method: "direct",
      status: pickupStatus(seed.status),
      locationLabel: product.pickupArea,
    },
    return: {
      status: returnStatus(seed.status),
    },
    settlement: {
      status: settlementStatus(seed.status),
      sellerPayout: amounts.sellerPayout,
    },
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
  };
}

// Statuses chosen to surface the full spectrum (happy path, return-due,
// settled, and one calm failure) without the demo running the dashboard
// out of room.
export const MOCK_RENTAL_INTENTS: RentalIntent[] = [
  buildMock({
    id: "ri_mock_001",
    productId: "theragun-mini-2",
    durationDays: 3,
    status: "pickup_confirmed",
    borrowerName: "민지",
    createdAt: "2026-04-26T09:00:00.000Z",
    updatedAt: "2026-04-27T10:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_002",
    productId: "hyperice-hypervolt",
    durationDays: 7,
    status: "paid",
    borrowerName: "재현",
    createdAt: "2026-04-28T14:00:00.000Z",
    updatedAt: "2026-04-28T15:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_003",
    productId: "tonal-band-set",
    durationDays: 7,
    status: "return_pending",
    borrowerName: "수아",
    createdAt: "2026-04-22T09:00:00.000Z",
    updatedAt: "2026-04-29T08:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_004",
    productId: "theragun-mini-2",
    durationDays: 3,
    status: "requested",
    borrowerName: "현우",
    createdAt: "2026-04-29T09:30:00.000Z",
    updatedAt: "2026-04-29T09:30:00.000Z",
  }),
  buildMock({
    id: "ri_mock_005",
    productId: "tonal-band-set",
    durationDays: 7,
    status: "requested",
    borrowerName: "지영",
    createdAt: "2026-04-29T07:00:00.000Z",
    updatedAt: "2026-04-29T07:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_006",
    productId: "theragun-mini-2",
    durationDays: 3,
    status: "settled",
    borrowerName: "도윤",
    createdAt: "2026-04-04T10:00:00.000Z",
    updatedAt: "2026-04-08T11:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_007",
    productId: "hyperice-hypervolt",
    durationDays: 3,
    status: "settled",
    borrowerName: "예나",
    createdAt: "2026-04-12T10:00:00.000Z",
    updatedAt: "2026-04-16T11:00:00.000Z",
  }),
  buildMock({
    id: "ri_mock_008",
    productId: "tonal-band-set",
    durationDays: 1,
    status: "settled",
    borrowerName: "유진",
    createdAt: "2026-04-18T09:00:00.000Z",
    updatedAt: "2026-04-19T10:00:00.000Z",
  }),
];

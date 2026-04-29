import { describe, expect, it } from "vitest";

import type {
  ListingIntent,
  RentalIntent,
  RentalIntentStatus,
} from "@/domain/intents";
import { RENTAL_FAILURE_STATES, isFailureStatus } from "@/domain/intents";
import { calculateSellerPayout } from "@/lib/pricing";
import {
  activeRentalRows,
  deriveDashboardSummary,
  failureRows,
  pendingRequestRows,
  relativeTime,
} from "@/lib/services/dashboardService";

const NOW = new Date("2026-04-30T12:00:00.000Z");

const baseRentalIntent: RentalIntent = {
  id: "ri_base",
  productId: "listing_base",
  productName: "Base massage gun",
  productCategory: "massage_gun",
  borrowerId: "borrower_base",
  borrowerName: "Base Borrower",
  sellerId: "seller_base",
  sellerName: "Base Seller",
  status: "requested",
  durationDays: 3,
  amounts: {
    rentalFee: 30_000,
    safetyDeposit: 100_000,
    platformFee: 3_000,
    sellerPayout: 27_000,
    borrowerTotal: 130_000,
  },
  payment: {
    provider: "mock",
    status: "not_started",
  },
  pickup: {
    method: "direct",
    status: "not_scheduled",
    locationLabel: "Gangnam",
  },
  return: {
    status: "not_due",
  },
  settlement: {
    status: "not_ready",
    sellerPayout: 27_000,
  },
  createdAt: "2026-04-30T08:00:00.000Z",
  updatedAt: "2026-04-30T08:00:00.000Z",
};

const baseListingIntent: ListingIntent = {
  id: "listing_base",
  sellerId: "seller_base",
  status: "approved",
  item: {
    name: "Base massage gun",
    category: "massage_gun",
    estimatedValue: 300_000,
    condition: "like_new",
    components: ["charger"],
    pickupArea: "Gangnam",
  },
  pricing: {
    oneDay: 10_000,
    threeDays: 25_000,
    sevenDays: 45_000,
  },
  verification: {
    id: "vi_base",
    safetyCode: "COR-BASE",
    status: "verified",
    checks: {
      frontPhoto: true,
      backPhoto: true,
      componentsPhoto: true,
      workingProof: true,
      safetyCodePhoto: true,
      privateSerialStored: false,
    },
  },
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

function makeRentalIntent(
  overrides: Partial<RentalIntent> = {},
): RentalIntent {
  return {
    ...baseRentalIntent,
    ...overrides,
    amounts: {
      ...baseRentalIntent.amounts,
      ...overrides.amounts,
    },
    payment: {
      ...baseRentalIntent.payment,
      ...overrides.payment,
    },
    pickup: {
      ...baseRentalIntent.pickup,
      ...overrides.pickup,
    },
    return: {
      ...baseRentalIntent.return,
      ...overrides.return,
    },
    settlement: {
      ...baseRentalIntent.settlement,
      ...overrides.settlement,
    },
  };
}

function makeListingIntent(
  overrides: Partial<ListingIntent> = {},
): ListingIntent {
  return {
    ...baseListingIntent,
    ...overrides,
    item: {
      ...baseListingIntent.item,
      ...overrides.item,
    },
    pricing: {
      ...baseListingIntent.pricing,
      ...overrides.pricing,
    },
    verification: {
      ...baseListingIntent.verification,
      ...overrides.verification,
      checks: {
        ...baseListingIntent.verification.checks,
        ...overrides.verification?.checks,
      },
    },
  };
}

const activeStatuses: RentalIntentStatus[] = [
  "seller_approved",
  "payment_pending",
  "paid",
  "pickup_confirmed",
  "return_pending",
  "return_confirmed",
  "settlement_ready",
];

describe("dashboardService", () => {
  describe("deriveDashboardSummary", () => {
    it("counts dashboard buckets and derives settlement totals", () => {
      const currentMonthSettledFee = 40_000;
      const rentals = [
        makeRentalIntent({ id: "ri_requested_1", status: "requested" }),
        makeRentalIntent({ id: "ri_requested_2", status: "requested" }),
        ...activeStatuses.map((status, index) =>
          makeRentalIntent({
            id: `ri_active_${status}`,
            status,
            settlement:
              status === "settlement_ready"
                ? { status: "ready", sellerPayout: 31_000 }
                : undefined,
            updatedAt: `2026-04-30T09:0${index}:00.000Z`,
          }),
        ),
        makeRentalIntent({
          id: "ri_settled_this_month",
          status: "settled",
          amounts: { rentalFee: currentMonthSettledFee },
          updatedAt: "2026-04-02T09:00:00.000Z",
        }),
        makeRentalIntent({
          id: "ri_settled_previous_month",
          status: "settled",
          amounts: { rentalFee: 90_000 },
          updatedAt: "2026-03-31T23:59:00.000Z",
        }),
        makeRentalIntent({
          id: "ri_return_overdue",
          status: "return_overdue",
          updatedAt: "2026-04-30T10:00:00.000Z",
        }),
        makeRentalIntent({
          id: "ri_payment_failed",
          status: "payment_failed",
          updatedAt: "2026-04-30T11:00:00.000Z",
        }),
      ];
      const listings = [
        makeListingIntent({ id: "listing_1" }),
        makeListingIntent({ id: "listing_2" }),
        makeListingIntent({ id: "listing_3" }),
      ];

      expect(deriveDashboardSummary(rentals, listings, NOW)).toEqual({
        monthlyEarnings: calculateSellerPayout(currentMonthSettledFee),
        pendingSettlement: 31_000,
        activeRentals: activeStatuses.length,
        pendingRequests: 2,
        listedItems: listings.length,
        returnsDueSoon: 2,
        failureCount: 2,
      });
    });
  });

  describe("pendingRequestRows", () => {
    it("returns requested rows with seller, listing, and borrower data intact", () => {
      const older = makeRentalIntent({
        id: "ri_requested_older",
        productId: "listing_older",
        productName: "Older listed item",
        borrowerId: "borrower_older",
        borrowerName: "Older Borrower",
        sellerId: "seller_older",
        sellerName: "Older Seller",
        status: "requested",
        createdAt: "2026-04-29T09:00:00.000Z",
      });
      const newer = makeRentalIntent({
        id: "ri_requested_newer",
        productId: "listing_newer",
        productName: "Newer listed item",
        borrowerId: "borrower_newer",
        borrowerName: "Newer Borrower",
        sellerId: "seller_newer",
        sellerName: "Newer Seller",
        status: "requested",
        createdAt: "2026-04-30T09:00:00.000Z",
      });
      const rows = pendingRequestRows([
        older,
        makeRentalIntent({ id: "ri_paid", status: "paid" }),
        newer,
      ]);

      expect(rows.map((row) => row.id)).toEqual([
        "ri_requested_newer",
        "ri_requested_older",
      ]);
      expect(rows[0]).toMatchObject({
        productId: "listing_newer",
        productName: "Newer listed item",
        borrowerId: "borrower_newer",
        borrowerName: "Newer Borrower",
        sellerId: "seller_newer",
        sellerName: "Newer Seller",
      });
    });
  });

  describe("activeRentalRows", () => {
    it("includes only active lifecycle statuses sorted by newest update", () => {
      const active = activeStatuses.map((status, index) =>
        makeRentalIntent({
          id: `ri_${status}`,
          status,
          updatedAt: `2026-04-30T09:0${index}:00.000Z`,
        }),
      );
      const inactiveStatuses: RentalIntentStatus[] = [
        "draft",
        "requested",
        "settled",
        ...RENTAL_FAILURE_STATES,
      ];
      const inactive = inactiveStatuses.map((status, index) =>
        makeRentalIntent({
          id: `ri_inactive_${status}`,
          status,
          updatedAt: `2026-04-30T10:${String(index).padStart(2, "0")}:00.000Z`,
        }),
      );

      expect(activeRentalRows([...inactive, ...active]).map((row) => row.id))
        .toEqual([
          "ri_settlement_ready",
          "ri_return_confirmed",
          "ri_return_pending",
          "ri_pickup_confirmed",
          "ri_paid",
          "ri_payment_pending",
          "ri_seller_approved",
        ]);
    });
  });

  describe("failureRows", () => {
    it("matches the domain failure statuses and sorts by newest update", () => {
      const failures = RENTAL_FAILURE_STATES.map((status, index) =>
        makeRentalIntent({
          id: `ri_${status}`,
          status,
          updatedAt: `2026-04-30T09:${String(index).padStart(2, "0")}:00.000Z`,
        }),
      );
      const nonFailureStatuses: RentalIntentStatus[] = [
        "draft",
        "requested",
        ...activeStatuses,
        "settled",
      ];
      const nonFailures = nonFailureStatuses.map((status) =>
        makeRentalIntent({ id: `ri_non_failure_${status}`, status }),
      );
      const rows = failureRows([...nonFailures, ...failures]);

      expect(rows.map((row) => row.status).every(isFailureStatus)).toBe(true);
      expect(rows.map((row) => row.status).sort()).toEqual(
        [...RENTAL_FAILURE_STATES].sort(),
      );
      expect(rows.map((row) => row.id)).toEqual(
        [...RENTAL_FAILURE_STATES]
          .reverse()
          .map((status) => `ri_${status}`),
      );
    });
  });

  describe("relativeTime", () => {
    it("formats recent and past timestamps against a fixed Date", () => {
      expect(relativeTime("2026-04-30T11:59:31.000Z", NOW)).toBe("방금 전");
      expect(relativeTime("2026-04-30T11:55:00.000Z", NOW)).toBe("5분 전");
      expect(relativeTime("2026-04-30T09:00:00.000Z", NOW)).toBe("3시간 전");
      expect(relativeTime("2026-04-27T12:00:00.000Z", NOW)).toBe("3일 전");
    });

    it("keeps minute, hour, and day boundary behavior stable", () => {
      expect(relativeTime("2026-04-30T11:59:30.000Z", NOW)).toBe("1분 전");
      expect(relativeTime("2026-04-30T11:00:00.000Z", NOW)).toBe("1시간 전");
      expect(relativeTime("2026-04-29T12:00:00.000Z", NOW)).toBe("1일 전");
    });
  });
});

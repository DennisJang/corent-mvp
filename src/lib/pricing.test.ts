import { describe, expect, it } from "vitest";

import { DURATIONS } from "@/domain/durations";
import { PRODUCTS } from "@/data/products";
import {
  calculateBorrowerTotal,
  calculatePlatformFee,
  calculateRecommendedPriceTable,
  calculateRecommendedRentalPrice,
  calculateRecommendedRentalPriceFromKey,
  calculateRentalAmounts,
  calculateSafetyDeposit,
  calculateSellerPayout,
  COMMISSION_RATE,
  HIGH_VALUE_THRESHOLD,
  isMvpEligibleValue,
  rentalFeeFor,
} from "@/lib/pricing";

function expectIntegerKrw(amount: number): void {
  expect(Number.isNaN(amount)).toBe(false);
  expect(Number.isInteger(amount)).toBe(true);
}

describe("pricing", () => {
  it("calculates internally consistent rental amounts", () => {
    const rentalFee = 22_300;
    const estimatedValue = 280_000;
    const amounts = calculateRentalAmounts(rentalFee, estimatedValue);

    expect(amounts.platformFee).toBe(calculatePlatformFee(rentalFee));
    expect(amounts.sellerPayout).toBe(calculateSellerPayout(rentalFee));
    expect(amounts.sellerPayout).toBe(rentalFee - amounts.platformFee);
    // Take-rate model: borrower pays the listed rentalFee plus the
    // refundable deposit. The 10% commission comes out of the seller's
    // payout, not on top of the borrower's bill.
    expect(amounts.borrowerTotal).toBe(
      amounts.rentalFee + amounts.safetyDeposit,
    );
    expect(amounts.borrowerTotal).toBe(
      calculateBorrowerTotal(amounts.rentalFee, amounts.safetyDeposit),
    );

    for (const amount of Object.values(amounts)) {
      expectIntegerKrw(amount);
    }
  });

  it("rounds platform fees consistently from the commission rate", () => {
    for (const rentalFee of [0, 1, 999, 1_005, 22_345]) {
      const fee = calculatePlatformFee(rentalFee);

      expect(fee).toBe(Math.round(rentalFee * COMMISSION_RATE));
      expectIntegerKrw(fee);
    }
  });

  it("returns integer, non-NaN monetary values for normal MVP inputs", () => {
    for (const estimatedValue of [50_000, 100_000, 280_000, 700_000]) {
      for (const duration of DURATIONS) {
        const rentalFee = calculateRecommendedRentalPrice(
          estimatedValue,
          duration.days,
        );
        const amounts = calculateRentalAmounts(rentalFee, estimatedValue);

        expectIntegerKrw(rentalFee);
        for (const amount of Object.values(amounts)) {
          expectIntegerKrw(amount);
        }
      }
    }
  });

  it("handles zero and very small estimated values without NaN", () => {
    for (const estimatedValue of [0, 1, 99]) {
      const priceTable = calculateRecommendedPriceTable(estimatedValue);

      for (const duration of DURATIONS) {
        const rentalFee = priceTable[duration.key];
        const amounts = calculateRentalAmounts(rentalFee, estimatedValue);

        expect(rentalFee).toBeGreaterThanOrEqual(0);
        expectIntegerKrw(rentalFee);
        for (const amount of Object.values(amounts)) {
          expectIntegerKrw(amount);
        }
      }
    }
  });

  it("keeps high-value eligibility and deposit threshold behavior consistent", () => {
    expect(isMvpEligibleValue(HIGH_VALUE_THRESHOLD)).toBe(true);
    expect(isMvpEligibleValue(HIGH_VALUE_THRESHOLD + 1)).toBe(false);
    expect(calculateSafetyDeposit(HIGH_VALUE_THRESHOLD)).toBe(70_000);
    expect(calculateSafetyDeposit(HIGH_VALUE_THRESHOLD + 1)).toBe(70_000);
  });

  it("derives product fixture prices from the shared pricing source", () => {
    expect(PRODUCTS.length).toBeGreaterThan(0);

    for (const product of PRODUCTS) {
      const expectedPrices = calculateRecommendedPriceTable(
        product.estimatedValue,
      );

      expect(product.prices).toEqual(expectedPrices);
      for (const duration of DURATIONS) {
        expect(rentalFeeFor(product, duration.key)).toBe(
          calculateRecommendedRentalPriceFromKey(
            product.estimatedValue,
            duration.key,
          ),
        );
      }
    }
  });

  it("keeps known product prices stable and monotonic across MVP durations", () => {
    expect(
      PRODUCTS.map((product) => ({
        id: product.id,
        prices: product.prices,
      })),
    ).toEqual([
      {
        id: "theragun-mini-2",
        prices: { "1d": 9_800, "3d": 22_400, "7d": 42_000 },
      },
      {
        id: "dyson-supersonic",
        prices: { "1d": 18_200, "3d": 41_600, "7d": 78_000 },
      },
      {
        id: "tonal-band-set",
        prices: { "1d": 3_900, "3d": 8_800, "7d": 16_500 },
      },
      {
        id: "hyperice-hypervolt",
        prices: { "1d": 8_400, "3d": 19_200, "7d": 36_000 },
      },
      {
        id: "lg-styler",
        prices: { "1d": 24_200, "3d": 55_200, "7d": 103_500 },
      },
      {
        id: "compact-rower",
        prices: { "1d": 11_200, "3d": 25_600, "7d": 48_000 },
      },
    ]);

    for (const product of PRODUCTS) {
      expect(product.prices["1d"]).toBeLessThan(product.prices["3d"]);
      expect(product.prices["3d"]).toBeLessThan(product.prices["7d"]);
    }
  });
});

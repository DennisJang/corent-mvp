// Pricing and settlement math. Pure functions, kept off of UI components so
// product detail, seller registration, dashboard, and a future payment flow
// share the same numbers.

import type { DurationDays, DurationKey } from "@/domain/durations";
import { keyToDays } from "@/domain/durations";
import type { RentalAmounts } from "@/domain/intents";

export const COMMISSION_RATE = 0.1;

// Approximate baseline rates from the product spec.
export const RATE_BY_DAYS: Record<DurationDays, number> = {
  1: 0.035,
  3: 0.08,
  7: 0.15,
};

// Round to the nearest ₩100 — keeps mocked numbers readable, matches how
// real price recommendations would be presented to a seller.
function roundFare(amount: number): number {
  return Math.round(amount / 100) * 100;
}

export function calculateRecommendedRentalPrice(
  estimatedValue: number,
  durationDays: DurationDays,
): number {
  const rate = RATE_BY_DAYS[durationDays];
  return roundFare(estimatedValue * rate);
}

export function calculateRecommendedPriceTable(
  estimatedValue: number,
): Record<DurationKey, number> {
  return {
    "1d": calculateRecommendedRentalPrice(estimatedValue, 1),
    "3d": calculateRecommendedRentalPrice(estimatedValue, 3),
    "7d": calculateRecommendedRentalPrice(estimatedValue, 7),
  };
}

// Tiered safety deposit. Items over ₩700,000 are excluded from the MVP.
export const SAFETY_DEPOSIT_TIERS = [
  { maxValue: 100_000, deposit: 0 },
  { maxValue: 300_000, deposit: 30_000 },
  { maxValue: 700_000, deposit: 70_000 },
];

export const HIGH_VALUE_THRESHOLD = 700_000;

export function isMvpEligibleValue(estimatedValue: number): boolean {
  return estimatedValue <= HIGH_VALUE_THRESHOLD;
}

export function calculateSafetyDeposit(estimatedValue: number): number {
  for (const tier of SAFETY_DEPOSIT_TIERS) {
    if (estimatedValue < tier.maxValue) return tier.deposit;
  }
  // Above MVP cap — keep highest tier as a safe default for display.
  return SAFETY_DEPOSIT_TIERS[SAFETY_DEPOSIT_TIERS.length - 1].deposit;
}

export function calculatePlatformFee(rentalFee: number): number {
  return Math.round(rentalFee * COMMISSION_RATE);
}

export function calculateSellerPayout(rentalFee: number): number {
  return rentalFee - calculatePlatformFee(rentalFee);
}

export function calculateBorrowerTotal(
  rentalFee: number,
  safetyDeposit: number,
): number {
  return rentalFee + safetyDeposit;
}

export function calculateRentalAmounts(
  rentalFee: number,
  estimatedValue: number,
): RentalAmounts {
  const safetyDeposit = calculateSafetyDeposit(estimatedValue);
  const platformFee = calculatePlatformFee(rentalFee);
  const sellerPayout = calculateSellerPayout(rentalFee);
  const borrowerTotal = calculateBorrowerTotal(rentalFee, safetyDeposit);
  return {
    rentalFee,
    safetyDeposit,
    platformFee,
    sellerPayout,
    borrowerTotal,
  };
}

export function rentalFeeFor(
  product: { prices: Record<DurationKey, number> },
  duration: DurationKey,
): number {
  return product.prices[duration];
}

// Convenience for dashboard summary — keeps "settled amount" math next to
// the rest of pricing instead of in `lib/format.ts`.
export function calculateSettlementAmount(rentalFee: number): number {
  return calculateSellerPayout(rentalFee);
}

// Re-export for any caller that wants to think in days rather than keys.
export function calculateRecommendedRentalPriceFromKey(
  estimatedValue: number,
  duration: DurationKey,
): number {
  return calculateRecommendedRentalPrice(estimatedValue, keyToDays(duration));
}

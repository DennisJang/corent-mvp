// Unit tests for the trust-summary visibility helper. Both the seller
// dashboard and the public storefront use `hasVisibleTrustHistory` to
// decide whether to render the count tiles. The rule must consider
// only the four visible-tile metrics — not hidden metrics like
// `disputesOpened` or `damageReportsAgainst` — so a visitor never sees
// an all-zero block driven by a hidden count.

import { describe, expect, it } from "vitest";
import {
  EMPTY_USER_TRUST_SUMMARY,
  hasVisibleTrustHistory,
  type UserTrustSummary,
} from "./trust";

function summary(
  overrides: Partial<UserTrustSummary> = {},
): UserTrustSummary {
  return {
    userId: "u_test",
    ...EMPTY_USER_TRUST_SUMMARY,
    ...overrides,
  };
}

describe("hasVisibleTrustHistory", () => {
  it("returns false when every visible tile is zero", () => {
    expect(hasVisibleTrustHistory(summary())).toBe(false);
  });

  it("returns true when any of the four visible tiles is non-zero", () => {
    expect(
      hasVisibleTrustHistory(summary({ successfulReturns: 1 })),
    ).toBe(true);
    expect(
      hasVisibleTrustHistory(summary({ pickupConfirmedCount: 1 })),
    ).toBe(true);
    expect(
      hasVisibleTrustHistory(summary({ returnConfirmedCount: 1 })),
    ).toBe(true);
    expect(
      hasVisibleTrustHistory(summary({ conditionCheckCompletedCount: 1 })),
    ).toBe(true);
  });

  it("does NOT return true when only hidden metrics are non-zero", () => {
    // disputesOpened and damageReportsAgainst are not surfaced as
    // tiles in the dashboard or storefront. Showing the section
    // because of these would render an all-zero visible block.
    expect(
      hasVisibleTrustHistory(summary({ disputesOpened: 5 })),
    ).toBe(false);
    expect(
      hasVisibleTrustHistory(summary({ damageReportsAgainst: 3 })),
    ).toBe(false);
    expect(
      hasVisibleTrustHistory(
        summary({ disputesOpened: 2, damageReportsAgainst: 4 }),
      ),
    ).toBe(false);
  });

  it("does NOT return true when only accountStanding is non-default", () => {
    expect(
      hasVisibleTrustHistory(summary({ accountStanding: "limited" })),
    ).toBe(false);
    expect(
      hasVisibleTrustHistory(summary({ accountStanding: "blocked" })),
    ).toBe(false);
  });
});

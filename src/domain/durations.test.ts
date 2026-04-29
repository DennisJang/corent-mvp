import { describe, expect, it } from "vitest";

import {
  DEFAULT_DURATION,
  DURATIONS,
  durationDaysToKey,
  keyToDays,
} from "@/domain/durations";

describe("durations", () => {
  it("exports the exact MVP rental windows as the shared source of truth", () => {
    expect(DURATIONS.map((duration) => duration.days)).toEqual([1, 3, 7]);
    expect(DURATIONS.map((duration) => duration.key)).toEqual([
      "1d",
      "3d",
      "7d",
    ]);
    expect(DEFAULT_DURATION).toBe("3d");
  });

  it("keeps day and key conversions stable", () => {
    for (const duration of DURATIONS) {
      expect(durationDaysToKey(duration.days)).toBe(duration.key);
      expect(keyToDays(duration.key)).toBe(duration.days);
    }

    expect(durationDaysToKey(2)).toBeUndefined();
  });
});

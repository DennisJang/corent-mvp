import { describe, expect, it } from "vitest";

import { formatKRW } from "@/lib/format";

describe("formatKRW", () => {
  it("returns readable Korean won strings", () => {
    expect(formatKRW(9_800)).toBe("₩9,800");
    expect(formatKRW(22_400)).toBe("₩22,400");
  });

  it("handles zero", () => {
    expect(formatKRW(0)).toBe("₩0");
  });

  it("handles large values", () => {
    expect(formatKRW(1_234_567_890)).toBe("₩1,234,567,890");
  });
});

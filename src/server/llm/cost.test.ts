// Cost estimator tests (Bundle 4 Slice 3).
//
// Coverage:
//   - deterministic: same input → byte-stable JSON
//   - clamps negative / non-integer token counts to safe values
//   - applies the documented mock rate table
//   - rounds USD to 4 decimals (no float noise)
//   - rounds KRW to whole won
//   - never reads or echoes a prompt body — the function signature
//     forbids it; we still assert no "input" or prompt-shaped
//     content survives in the resulting record
//   - approximateTokenCount returns 0 for empty / non-string and
//     ~length/4 otherwise; never echoes content

import { describe, expect, it } from "vitest";
import { approximateTokenCount, estimateCost } from "./cost";

describe("estimateCost — deterministic", () => {
  it("is byte-stable for the same input", () => {
    const a = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 1000,
      outputTokens: 500,
      fallbackUsed: false,
    });
    const b = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 1000,
      outputTokens: 500,
      fallbackUsed: false,
    });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("applies the mock rate table: $0.001/1k input + $0.003/1k output", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 1000,
      outputTokens: 1000,
      fallbackUsed: false,
    });
    // 1000 input * $0.001/1k = $0.001
    // 1000 output * $0.003/1k = $0.003
    // total $0.004
    expect(r.estimatedCostUsd).toBe(0.004);
  });

  it("rounds USD to 4 decimals (no float noise)", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "match_explanation",
      // Pick counts that, with naive arithmetic, would produce
      // floating-point noise like 0.0030000000000000005.
      inputTokens: 333,
      outputTokens: 999,
      fallbackUsed: false,
    });
    const stringified = r.estimatedCostUsd.toString();
    // No more than 4 decimal places.
    expect(stringified).toMatch(/^\d+(\.\d{1,4})?$/);
  });

  it("converts USD to KRW at the fixed mock rate (₩1380/$)", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 1000,
      outputTokens: 1000,
      fallbackUsed: false,
    });
    // $0.004 * 1380 ≈ ₩5.52 → rounded to 6.
    expect(r.estimatedCostKrw).toBe(Math.round(0.004 * 1380));
  });

  it("clamps negative / fractional token counts to safe non-negative integers", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "renter_intent",
      inputTokens: -50,
      outputTokens: 7.9,
      fallbackUsed: false,
    });
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(7);
  });

  it("preserves provider / model / taskType / fallbackUsed labels exactly as passed", () => {
    const r = estimateCost({
      provider: "future-provider",
      model: "future-model-v1",
      taskType: "seller_store",
      inputTokens: 100,
      outputTokens: 50,
      fallbackUsed: true,
    });
    expect(r.provider).toBe("future-provider");
    expect(r.model).toBe("future-model-v1");
    expect(r.taskType).toBe("seller_store");
    expect(r.fallbackUsed).toBe(true);
  });
});

describe("estimateCost — telemetry never echoes prompt body", () => {
  it("CostEstimate keys are exactly the documented set (no input/prompt/raw fields)", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 100,
      outputTokens: 50,
      fallbackUsed: false,
    });
    expect(Object.keys(r).sort()).toEqual(
      [
        "estimatedCostKrw",
        "estimatedCostUsd",
        "fallbackUsed",
        "inputTokens",
        "model",
        "outputTokens",
        "provider",
        "taskType",
      ].sort(),
    );
  });

  it("does NOT carry any field named input / prompt / body / rawInput / rawSellerInput", () => {
    const r = estimateCost({
      provider: "mock",
      model: "mock-corent-1",
      taskType: "listing_extraction",
      inputTokens: 100,
      outputTokens: 50,
      fallbackUsed: false,
    });
    const blob = JSON.stringify(r);
    for (const banned of [
      "prompt",
      "rawInput",
      "rawSellerInput",
      "body",
      "messages",
      "system",
    ]) {
      expect(blob).not.toMatch(new RegExp(`\\b${banned}\\b`, "i"));
    }
  });
});

describe("approximateTokenCount — never echoes content", () => {
  it("returns 0 for empty / non-string", () => {
    expect(approximateTokenCount("")).toBe(0);
    expect(approximateTokenCount(undefined as unknown as string)).toBe(0);
    expect(approximateTokenCount(null as unknown as string)).toBe(0);
    expect(approximateTokenCount(42 as unknown as string)).toBe(0);
  });

  it("returns ceil(length/4) with a floor of 1 for non-empty strings", () => {
    expect(approximateTokenCount("a")).toBe(1);
    expect(approximateTokenCount("abcd")).toBe(1);
    expect(approximateTokenCount("abcdef")).toBe(2);
    expect(approximateTokenCount("a".repeat(40))).toBe(10);
  });

  it("output is a number, never the source string itself", () => {
    const out = approximateTokenCount("DO NOT LEAK PROMPT");
    expect(typeof out).toBe("number");
    expect(JSON.stringify(out)).not.toContain("PROMPT");
  });
});

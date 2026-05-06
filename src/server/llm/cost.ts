// Provider-neutral cost estimator (Bundle 4 Slice 3).
//
// Pure function. No I/O, no env vars, no network. Given the
// task labels and token counts, returns a `CostEstimate`. Future
// slices may layer a provider-specific rate table behind the same
// signature; today the mock provider is the only source.
//
// Hard rules:
//
//   - The estimate carries ONLY counts and labels. The prompt
//     body is never read here. Callers must NOT pass raw input
//     into this function — only token counts they have already
//     measured.
//
//   - The function is deterministic. For the same input it
//     returns the same output (byte-stable JSON). Tests pin this.
//
//   - No secrets. No env vars. No keys, no endpoints, no FX
//     fetch. The conversion to KRW uses a fixed rate baked into
//     this file; a future slice may swap it once a real partner
//     is contracted.

import type { CostEstimate, LLMTaskType } from "./types";

// Fixed mock rate table. Values are deliberately small + round so
// expected costs are easy to read in test fixtures. Future
// providers should NOT re-use this table; they should ship their
// own rate table when their adapter lands.
const MOCK_RATE_USD_PER_1K_INPUT = 0.001;
const MOCK_RATE_USD_PER_1K_OUTPUT = 0.003;

// Fixed mock USD→KRW rate. No env var, no FX fetch. Future
// slices may inject a configured rate.
const MOCK_USD_TO_KRW = 1380;

// Round USD to 4 decimals to keep the JSON stable. Avoids
// floating-point noise like `0.0030000000000000005`.
function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export type EstimateCostInput = {
  provider: string;
  model: string;
  taskType: LLMTaskType;
  inputTokens: number;
  outputTokens: number;
  fallbackUsed: boolean;
};

export function estimateCost(input: EstimateCostInput): CostEstimate {
  const safeInputTokens = Math.max(0, Math.floor(input.inputTokens));
  const safeOutputTokens = Math.max(0, Math.floor(input.outputTokens));

  // For now every (provider, model) in this slice falls under the
  // mock rate. The conditional is here so the future provider
  // landing has a clear extension seam.
  const inputUsd = (safeInputTokens / 1000) * MOCK_RATE_USD_PER_1K_INPUT;
  const outputUsd = (safeOutputTokens / 1000) * MOCK_RATE_USD_PER_1K_OUTPUT;
  const estimatedCostUsd = roundUsd(inputUsd + outputUsd);

  // KRW rounds to whole won — fractional won never appears in
  // accounting copy.
  const estimatedCostKrw = Math.round(estimatedCostUsd * MOCK_USD_TO_KRW);

  return {
    provider: input.provider,
    model: input.model,
    taskType: input.taskType,
    inputTokens: safeInputTokens,
    outputTokens: safeOutputTokens,
    estimatedCostUsd,
    estimatedCostKrw,
    fallbackUsed: input.fallbackUsed,
  };
}

// Cheap, deterministic token-count estimator. Used by the mock
// adapter so callers can produce a `CostEstimate` without a real
// tokenizer. Counts roughly 1 token per 4 characters; never
// reads or echoes the content of the string.
export function approximateTokenCount(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

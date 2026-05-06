// Provider-neutral LLM adapter — mock implementation
// (Bundle 4 Slice 3).
//
// Deterministic, no-I/O stub. Satisfies `LLMAdapter` so the
// product code path can be unit-tested end-to-end before any real
// provider lands. Future providers (`openaiAdapter`,
// `anthropicAdapter`, etc.) implement the same interface.
//
// What this adapter intentionally does NOT do:
//
//   - It does not read or echo `request.input`. Cost estimation
//     reads only the approximate length of input via
//     `approximateTokenCount`, never its content. The candidate
//     returned is shape-only (mostly empty), with provenance
//     stamped to `llm_candidate`. A future real provider will
//     fill the candidate with content; the SHAPE stays.
//
//   - It does not read environment variables. There are no API
//     keys, endpoints, or rate-limit dials in this slice.
//
//   - It does not log prompts or responses. Future logging
//     should go through `src/server/logging/**`, but never carry
//     the raw input — only counts.
//
// What it DOES guarantee:
//
//   - Same `LLMRequest` → same `LLMResponse` (deterministic).
//   - `provenance: "llm_candidate"` on every candidate it returns.
//   - `provider: "mock"`, `model: "mock-corent-1"`, `fallbackUsed:
//     false`. The mock is the deterministic stub, not a fallback
//     — surfaces use `fallbackUsed` to mark a real-provider call
//     that downgraded.
//   - Output goes through the same normalizer real-provider
//     output will go through. That way the mock cannot drift
//     from the production candidate shape.

import { approximateTokenCount } from "./cost";
import {
  normalizeListingExtractionCandidate,
  normalizeMatchExplanationCandidate,
  normalizeRenterIntentCandidate,
  normalizeSellerStoreCandidate,
} from "./normalize";
import type {
  LLMAdapter,
  LLMCandidate,
  LLMRequest,
  LLMResponse,
  LLMUsage,
  ListingExtractionCandidate,
  MatchExplanationCandidate,
  RenterIntentCandidate,
  SellerStoreCandidate,
} from "./types";

const PROVIDER = "mock";
const MODEL = "mock-corent-1";

// Length probe — never reads content. Falls through to `0` for
// non-string / non-array / object inputs the caller may pass.
function probeInputLength(input: unknown): number {
  if (typeof input === "string") return input.length;
  if (Array.isArray(input)) return input.length;
  if (input && typeof input === "object") {
    return Object.keys(input as Record<string, unknown>).length;
  }
  return 0;
}

function mockUsage(input: unknown): LLMUsage {
  const lengthProbe = probeInputLength(input);
  const inputTokens = approximateTokenCount(
    typeof input === "string" ? input : "x".repeat(lengthProbe),
  );
  // Output token estimate is a small fixed budget per task — the
  // mock returns near-empty candidates so realistic output token
  // counts will be small. Real providers replace this with their
  // actual usage.
  const outputTokens = Math.max(8, Math.min(64, Math.floor(inputTokens / 4)));
  return { inputTokens, outputTokens };
}

// Each task type returns an empty-but-shape-correct candidate.
// The normalizer is invoked even on the mock so a future
// regression that widens this object (e.g. accidentally adding
// `status`) is silently dropped at the boundary.
function mockCandidateFor(taskType: LLMRequest["taskType"]): LLMCandidate {
  switch (taskType) {
    case "listing_extraction": {
      const c: ListingExtractionCandidate = normalizeListingExtractionCandidate({
        title: null,
        category: null,
        pickupArea: null,
        components: [],
        defects: [],
      });
      return c;
    }
    case "seller_store": {
      const c: SellerStoreCandidate = normalizeSellerStoreCandidate({
        positioningSentence: "",
        improvementNudges: [],
      });
      return c;
    }
    case "renter_intent": {
      const c: RenterIntentCandidate = normalizeRenterIntentCandidate({
        intentTags: [],
      });
      return c;
    }
    case "match_explanation": {
      const c: MatchExplanationCandidate = normalizeMatchExplanationCandidate({
        reasons: [],
        cautions: [],
      });
      return c;
    }
  }
}

export const mockLLMAdapter: LLMAdapter = {
  async generate<TCandidate extends LLMCandidate>(
    request: LLMRequest,
  ): Promise<LLMResponse<TCandidate>> {
    const candidate = mockCandidateFor(request.taskType) as TCandidate;
    const usage = mockUsage(request.input);
    return {
      candidate,
      usage,
      provider: PROVIDER,
      model: MODEL,
      fallbackUsed: false,
    };
  },
};

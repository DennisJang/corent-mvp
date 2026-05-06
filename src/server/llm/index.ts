// Public API barrel for the provider-neutral LLM adapter
// (Bundle 4 Slice 3). Server-only — never import from
// `src/components/**` or `src/lib/client/**`.
//
// Boundaries are enforced by static-text tests in
// `src/server/admin/import-boundary.test.ts`.

export type {
  CostEstimate,
  LLMAdapter,
  LLMCandidate,
  LLMCandidateProvenance,
  LLMRequest,
  LLMResponse,
  LLMTaskType,
  LLMUsage,
  ListingExtractionCandidate,
  MatchExplanationCandidate,
  RenterIntentCandidate,
  SellerStoreCandidate,
} from "./types";

export { approximateTokenCount, estimateCost } from "./cost";
export type { EstimateCostInput } from "./cost";

export {
  normalizeListingExtractionCandidate,
  normalizeMatchExplanationCandidate,
  normalizeRenterIntentCandidate,
  normalizeSellerStoreCandidate,
} from "./normalize";

export { mockLLMAdapter } from "./mockAdapter";

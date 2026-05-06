// Provider-neutral LLM adapter — types (Bundle 4 Slice 3).
//
// This module declares the SHAPE we want every future LLM provider
// (OpenAI, Anthropic, Gemini, locally-hosted, …) to fit behind.
// In this slice we ship only the shape + a deterministic mock; no
// provider SDKs, no network calls, no env vars.
//
// Why types-first:
//
//   - The MVP must compare models later without rewriting product
//     code. A typed `LLMAdapter` interface lets us swap the
//     `mockLLMAdapter` for a `tossedLLMAdapter` (or whichever) in
//     one place.
//
//   - LLM output must NEVER be confused with canonical data. Every
//     candidate type below carries `provenance: "llm_candidate"`,
//     and the candidate shapes deliberately have no slot for
//     authority-bearing fields (status, payment, sellerId,
//     verification, trust score, exact address). A surface that
//     wants to render LLM output reads it through these types only.
//
//   - Cost / accounting is decoupled from product surfaces. A
//     `CostEstimate` is a pure value derived from `LLMUsage` +
//     provider + model. Persistence, telemetry, and per-seller
//     budgeting can layer on top in later slices without touching
//     the adapter interface.
//
// Hard rules — encoded here, not just in docs:
//
//   - The adapter never receives or returns authoritative ids
//     beyond the input the caller already trusts (e.g. an actor
//     id the caller resolved server-side). Candidate output never
//     declares `sellerId`, `borrowerId`, `listingId-as-authority`,
//     `status`, `price-as-authority`, `payment`, `settlement`,
//     `verification`, `trustScore`, exact address, or contact
//     info. The TypeScript shapes simply do not have those slots.
//
//   - The adapter never persists or echoes the raw seller / renter
//     input. Telemetry (CostEstimate / LLMUsage) carries only
//     counts and provider/model labels — never prompt bodies.
//
//   - The interface is server-only. The static-text import
//     boundary in `src/server/admin/import-boundary.test.ts`
//     forbids `@/server/llm/**` imports from `src/components/**`
//     and `src/lib/client/**`.

import type { CategoryId } from "@/domain/categories";
import type { ListingUseCaseTag } from "@/domain/marketplaceIntelligence";

// The task names CoRent will eventually send to a provider. Adding
// a name here is a deliberate decision — surfaces and the
// normalizer key off this enum.
export type LLMTaskType =
  | "listing_extraction"
  | "seller_store"
  | "renter_intent"
  | "match_explanation";

// Generic request payload. The `input` field is intentionally
// `unknown` so the adapter does not advertise any guaranteed shape
// to its callers — every product call site is responsible for
// passing already-sanitized data and the adapter never echoes the
// input back into the response or telemetry.
export type LLMRequest = {
  taskType: LLMTaskType;
  // Server-side input the caller has already sanitized. The
  // adapter never logs this. Cost estimation reads only its
  // approximate length (for token counting), never its content.
  input: unknown;
};

// Provenance tag for every LLM-derived candidate. Reserved value
// only — surfaces gate copy strength on this string.
export type LLMCandidateProvenance = "llm_candidate";

// ---- Candidate shapes ------------------------------------------
//
// These align with the deterministic types in
// `src/domain/marketplaceIntelligence.ts`. They are intentionally
// narrower than the deterministic shapes — the LLM channel never
// supplies counts, ids, or anything that would be authoritative.

// Listing extraction — the LLM proposes fields a deterministic
// extractor could not recover. NEVER includes price authority
// (the deterministic `calculateRecommendedPriceTable` is the only
// price authority); NEVER includes status, sellerId, listingId,
// verification, publication, or admin slots.
export type ListingExtractionCandidate = {
  // Display title proposed by the LLM. Surfaces should treat this
  // as a draft only; a human-reviewed channel may promote it.
  title: string | null;
  // Category id, narrowed to the closed enum. The normalizer
  // rejects strings that aren't in `CategoryId`.
  category: CategoryId | null;
  // Coarse area only (e.g. "마포구", "강남역 근처"). The
  // normalizer enforces a length cap. NEVER an exact address.
  pickupArea: string | null;
  // Free-text observed components ("어댑터", "파우치", ...).
  // Length-capped, deduped, sorted by the normalizer.
  components: string[];
  // Free-text observed defects ("스크래치", ...). Same shape as
  // `components`. NEVER a verification verdict / status.
  defects: string[];
  provenance: LLMCandidateProvenance;
};

export type SellerStoreCandidate = {
  // Calm Korean positioning sentence. Bounded length.
  positioningSentence: string;
  // Up to a few short improvement nudges. Bounded length per
  // entry, deduped, sorted.
  improvementNudges: string[];
  provenance: LLMCandidateProvenance;
};

export type RenterIntentCandidate = {
  // Closed-vocabulary tags drawn from `ListingUseCaseTag`. The
  // normalizer drops any value not in the closed enum.
  intentTags: ListingUseCaseTag[];
  provenance: LLMCandidateProvenance;
};

export type MatchExplanationCandidate = {
  reasons: { label: string; provenance: LLMCandidateProvenance }[];
  cautions: { label: string; provenance: LLMCandidateProvenance }[];
};

export type LLMCandidate =
  | ListingExtractionCandidate
  | SellerStoreCandidate
  | RenterIntentCandidate
  | MatchExplanationCandidate;

// ---- Adapter interface -----------------------------------------
//
// Every future provider implements `LLMAdapter`. The mock in this
// slice satisfies the same shape so swap-in is non-breaking.

// Token usage. Counts only — never the prompt body.
export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LLMResponse<TCandidate extends LLMCandidate> = {
  candidate: TCandidate;
  usage: LLMUsage;
  // String label only. Future production providers may surface
  // "openai" / "anthropic" / "gemini" etc. The mock returns "mock".
  provider: string;
  // Model label only (no API key, no endpoint). Mock returns
  // "mock-corent-1".
  model: string;
  // True when the adapter could not deliver a real-provider
  // response and fell back to a deterministic stub. The mock
  // returns `false` (it IS the deterministic stub, not a fallback).
  fallbackUsed: boolean;
};

export interface LLMAdapter {
  // Single entry point. Future providers may add streaming /
  // batched APIs; we keep this minimal so the mock is trivial and
  // the interface is easy to satisfy.
  generate<TCandidate extends LLMCandidate>(
    request: LLMRequest,
  ): Promise<LLMResponse<TCandidate>>;
}

// ---- Cost / accounting -----------------------------------------
//
// Pure value type. Persistence and per-seller budgeting come
// later. The estimate carries ONLY counts and labels — never the
// prompt body. Tests pin this contract.

export type CostEstimate = {
  provider: string;
  model: string;
  taskType: LLMTaskType;
  inputTokens: number;
  outputTokens: number;
  // USD with up to 4 decimal places. Computed via a fixed mock
  // rate table in `cost.ts`; future providers will plug their own
  // rate tables behind the same function signature.
  estimatedCostUsd: number;
  // KRW rounded to whole number. Conversion is a fixed mock rate
  // (no FX network call, no env var). Future slices may wire a
  // configured FX once we have a partner.
  estimatedCostKrw: number;
  fallbackUsed: boolean;
};

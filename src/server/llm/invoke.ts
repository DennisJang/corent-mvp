// Provider-neutral LLM invocation orchestrator (Bundle 4 Slice 4).
//
// One server-side seam every LLM-backed product feature will go
// through. Responsibilities:
//
//   1. Call an injected `LLMAdapter` (defaults to `mockLLMAdapter`).
//   2. Normalize the candidate output via the per-task normalizer
//      so authority fields can never leak past this boundary.
//   3. Compute a `CostEstimate` from the adapter's reported usage
//      (or a length-based estimate on adapter throw).
//   4. On adapter throw, return a typed fallback envelope with a
//      non-secret reason — never re-throw the underlying error.
//
// What this module deliberately does NOT do:
//
//   - It does not include the prompt, the raw seller / renter
//     input, or any provider-side message body in the result.
//     `CostEstimate` carries only counts and labels; the candidate
//     carries only the normalized fields the per-task allowlist
//     permits. Tests pin this contract.
//
//   - It does not log. A future slice may layer telemetry
//     through `src/server/logging/**`, but only with
//     count-and-label payloads — never raw input.
//
//   - It does not persist anything. Per-seller budgeting and
//     accounting tables come later.
//
//   - It does not wire to any product surface in this slice.
//     /sell, /search, /dashboard, and every route remain
//     unchanged. The orchestrator is reachable only through unit
//     tests today.
//
// Hard rules — encoded in this file:
//
//   - The function's RESULT shape forbids authority fields by
//     virtue of the candidate shapes (see
//     `src/server/llm/types.ts`). The normalizer is the second
//     belt: even if a future provider returns an object widened
//     with `status` / `sellerId` / `payment`, the normalizer
//     drops it before reaching the caller.
//
//   - On adapter throw the orchestrator catches the error and
//     returns a fallback envelope with a typed `reason` —
//     `"adapter_threw"` only in this slice. It never re-throws
//     and never includes `error.message` / stack in the result.

import { approximateTokenCount, estimateCost } from "./cost";
import { mockLLMAdapter } from "./mockAdapter";
import {
  normalizeListingExtractionCandidate,
  normalizeMatchExplanationCandidate,
  normalizeRenterIntentCandidate,
  normalizeSellerStoreCandidate,
} from "./normalize";
import type {
  CostEstimate,
  LLMAdapter,
  LLMCandidate,
  LLMRequest,
  LLMResponse,
  LLMTaskType,
  ListingExtractionCandidate,
  MatchExplanationCandidate,
  RenterIntentCandidate,
  SellerStoreCandidate,
} from "./types";

// Map a task type to its candidate type. Used at compile-time so
// callers get the right candidate shape on the result; at runtime
// the normalizer dispatcher does the same job.
export type CandidateForTask<T extends LLMTaskType> =
  T extends "listing_extraction"
    ? ListingExtractionCandidate
    : T extends "seller_store"
      ? SellerStoreCandidate
      : T extends "renter_intent"
        ? RenterIntentCandidate
        : T extends "match_explanation"
          ? MatchExplanationCandidate
          : never;

// Non-secret reason for a fallback envelope. Surfaces never inspect
// this string for authority decisions — it's an enum for analytics
// and a calm copy switch.
export type LLMInvokeFallbackReason = "adapter_threw";

export type LLMInvokeOk<T extends LLMCandidate> = {
  kind: "ok";
  candidate: T;
  costEstimate: CostEstimate;
};

export type LLMInvokeFallback<T extends LLMCandidate> = {
  kind: "fallback";
  candidate: T;
  costEstimate: CostEstimate;
  reason: LLMInvokeFallbackReason;
};

export type LLMInvokeResult<T extends LLMCandidate> =
  | LLMInvokeOk<T>
  | LLMInvokeFallback<T>;

export type InvokeLLMTaskOptions<T extends LLMTaskType> = {
  taskType: T;
  // Sanitized input the caller has prepared. The orchestrator
  // never reads its content — only its approximate length when
  // computing a fallback cost estimate. Real provider adapters
  // are responsible for shaping `input` into provider-specific
  // payloads.
  input: unknown;
  // Optional injected adapter. Defaults to the deterministic
  // mock. Callers in unit tests inject a stub adapter to drive
  // the throw / malformed-candidate code paths.
  adapter?: LLMAdapter;
  // Optional explicit fallback. When omitted, the orchestrator
  // synthesizes a typed empty candidate via the per-task
  // normalizer over `null`.
  fallbackCandidate?: CandidateForTask<T>;
};

// Provider/model labels for the fallback cost estimate when the
// adapter throws before returning. We do not assume any specific
// provider here — a future production adapter that throws should
// surface its own labels, but we cannot read them from a thrown
// error. `"unknown"` is the safe default; tests pin this.
const UNKNOWN_PROVIDER = "unknown";
const UNKNOWN_MODEL = "unknown";

function normalizeFor(
  taskType: LLMTaskType,
  raw: unknown,
): LLMCandidate {
  switch (taskType) {
    case "listing_extraction":
      return normalizeListingExtractionCandidate(raw);
    case "seller_store":
      return normalizeSellerStoreCandidate(raw);
    case "renter_intent":
      return normalizeRenterIntentCandidate(raw);
    case "match_explanation":
      return normalizeMatchExplanationCandidate(raw);
  }
}

function emptyFallbackCandidate(taskType: LLMTaskType): LLMCandidate {
  // The normalizer returns a typed safe empty candidate for
  // `null`. We reuse it so the fallback shape is identical to
  // the success-path normalized shape — surfaces branch on
  // `kind`, never on shape differences.
  return normalizeFor(taskType, null);
}

// Length-based input-token estimate for the fallback path. Uses
// `approximateTokenCount` when the input is a string; for objects,
// stringify lazily for a length probe only — JSON.stringify is
// pure and we never log the result.
function fallbackInputTokens(input: unknown): number {
  if (typeof input === "string") return approximateTokenCount(input);
  try {
    const probe = JSON.stringify(input);
    return typeof probe === "string" ? approximateTokenCount(probe) : 0;
  } catch {
    // Circular references or non-serializable inputs collapse to
    // zero; we never throw out of cost estimation.
    return 0;
  }
}

export async function invokeLLMTask<T extends LLMTaskType>(
  options: InvokeLLMTaskOptions<T>,
): Promise<LLMInvokeResult<CandidateForTask<T>>> {
  const adapter = options.adapter ?? mockLLMAdapter;
  const request: LLMRequest = {
    taskType: options.taskType,
    input: options.input,
  };

  let response: LLMResponse<LLMCandidate>;
  try {
    response = await adapter.generate<LLMCandidate>(request);
  } catch {
    // Adapter threw. Synthesize a typed fallback envelope. We
    // never read or echo the underlying error's message, stack,
    // or cause — those can carry provider internals or even
    // pieces of the prompt body in some SDKs.
    const candidate =
      options.fallbackCandidate ??
      (emptyFallbackCandidate(options.taskType) as CandidateForTask<T>);
    const costEstimate = estimateCost({
      provider: UNKNOWN_PROVIDER,
      model: UNKNOWN_MODEL,
      taskType: options.taskType,
      inputTokens: fallbackInputTokens(options.input),
      outputTokens: 0,
      fallbackUsed: true,
    });
    return {
      kind: "fallback",
      candidate,
      costEstimate,
      reason: "adapter_threw",
    };
  }

  // Success path. Normalize the candidate even though the mock
  // adapter already does so — a future production adapter will
  // not, and the boundary contract must hold either way.
  const normalized = normalizeFor(
    options.taskType,
    response.candidate,
  ) as CandidateForTask<T>;

  const costEstimate = estimateCost({
    provider: response.provider,
    model: response.model,
    taskType: options.taskType,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    fallbackUsed: response.fallbackUsed,
  });

  return {
    kind: "ok",
    candidate: normalized,
    costEstimate,
  };
}

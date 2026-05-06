// Mock LLM adapter tests (Bundle 4 Slice 3).
//
// Coverage:
//   - returns provenance: "llm_candidate" on every task type
//   - returns provider: "mock", model: "mock-corent-1",
//     fallbackUsed: false
//   - candidate shapes match the typed candidate per task
//   - candidate never carries authority fields by construction
//     (verified at runtime via JSON scan)
//   - usage is deterministic for the same input
//   - the adapter NEVER echoes the raw input — neither in the
//     candidate nor in the usage / provider / model labels
//   - the adapter does not import any provider SDK package
//     (static-text scan)

import { describe, expect, it } from "vitest";
import { mockLLMAdapter } from "./mockAdapter";
import type {
  ListingExtractionCandidate,
  MatchExplanationCandidate,
  RenterIntentCandidate,
  SellerStoreCandidate,
} from "./types";

const FORBIDDEN_AUTHORITY_FIELDS = [
  "status",
  "sellerId",
  "borrowerId",
  "listingId",
  "price",
  "rentalFee",
  "borrowerTotal",
  "safetyDeposit",
  "sellerPayout",
  "platformFee",
  "payment",
  "settlement",
  "verification",
  "publication",
  "adminId",
  "role",
  "capability",
  "trustScore",
  "address",
  "contact",
] as const;

describe("mockLLMAdapter — listing_extraction", () => {
  it("returns a candidate with provenance: 'llm_candidate' and no forbidden fields", async () => {
    const r = await mockLLMAdapter.generate<ListingExtractionCandidate>({
      taskType: "listing_extraction",
      input: "DO NOT LEAK PROMPT — 마사지건 mini 마포구",
    });
    expect(r.candidate.provenance).toBe("llm_candidate");
    expect(r.provider).toBe("mock");
    expect(r.model).toBe("mock-corent-1");
    expect(r.fallbackUsed).toBe(false);
    const blob = JSON.stringify(r);
    for (const banned of FORBIDDEN_AUTHORITY_FIELDS) {
      expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
    }
  });

  it("never echoes the raw input string anywhere in the response", async () => {
    const r = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "RAW_PROMPT_DO_NOT_LEAK_42",
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("RAW_PROMPT_DO_NOT_LEAK_42");
  });
});

describe("mockLLMAdapter — seller_store / renter_intent / match_explanation", () => {
  it("returns shape-correct seller_store candidate", async () => {
    const r = await mockLLMAdapter.generate<SellerStoreCandidate>({
      taskType: "seller_store",
      input: { listings: 3 },
    });
    expect(r.candidate.provenance).toBe("llm_candidate");
    expect(r.candidate.positioningSentence).toBe("");
    expect(r.candidate.improvementNudges).toEqual([]);
  });

  it("returns shape-correct renter_intent candidate", async () => {
    const r = await mockLLMAdapter.generate<RenterIntentCandidate>({
      taskType: "renter_intent",
      input: { rawInput: "체험 1일" },
    });
    expect(r.candidate.provenance).toBe("llm_candidate");
    expect(r.candidate.intentTags).toEqual([]);
  });

  it("returns shape-correct match_explanation candidate", async () => {
    const r = await mockLLMAdapter.generate<MatchExplanationCandidate>({
      taskType: "match_explanation",
      input: { listingId: "x", searchIntentId: "si" },
    });
    // MatchExplanationCandidate intentionally has no top-level
    // `provenance` — each reason/caution is provenance-tagged.
    expect(r.candidate.reasons).toEqual([]);
    expect(r.candidate.cautions).toEqual([]);
  });
});

describe("mockLLMAdapter — deterministic", () => {
  it("returns byte-stable JSON for the same input", async () => {
    const a = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "마사지건 1일 마포구",
    });
    const b = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "마사지건 1일 마포구",
    });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("usage counts are non-negative integers", async () => {
    const r = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "x".repeat(40),
    });
    expect(Number.isInteger(r.usage.inputTokens)).toBe(true);
    expect(Number.isInteger(r.usage.outputTokens)).toBe(true);
    expect(r.usage.inputTokens).toBeGreaterThanOrEqual(0);
    expect(r.usage.outputTokens).toBeGreaterThanOrEqual(0);
  });

  it("usage scales with input length (sanity probe; no echo)", async () => {
    const small = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "x",
    });
    const big = await mockLLMAdapter.generate({
      taskType: "listing_extraction",
      input: "x".repeat(400),
    });
    expect(big.usage.inputTokens).toBeGreaterThan(small.usage.inputTokens);
    // Output token budget is bounded — no runaway scaling.
    expect(big.usage.outputTokens).toBeLessThanOrEqual(64);
  });
});

describe("mockLLMAdapter — no provider SDK / network / env", () => {
  it("does not import any provider SDK package", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "llm",
      "mockAdapter.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importBlob = (
      src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
    // Common LLM provider SDK package names — none must appear.
    for (const banned of [
      "openai",
      "@anthropic-ai/sdk",
      "anthropic",
      "@google/generative-ai",
      "@google-cloud/aiplatform",
      "cohere-ai",
      "node-fetch",
      "axios",
      "undici",
    ]) {
      expect(importBlob).not.toMatch(new RegExp(`["']${banned}["']`));
    }
  });

  it("does not read any environment variable", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of ["mockAdapter.ts", "cost.ts", "normalize.ts", "types.ts", "index.ts"]) {
      const file = path.join(process.cwd(), "src", "server", "llm", f);
      const src = fs.readFileSync(file, "utf-8");
      expect(src).not.toMatch(/process\.env\./);
    }
  });

  it("never references the literal word 'fetch' or 'XMLHttpRequest'", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of ["mockAdapter.ts", "cost.ts", "normalize.ts", "types.ts", "index.ts"]) {
      const file = path.join(process.cwd(), "src", "server", "llm", f);
      const src = fs.readFileSync(file, "utf-8");
      // Strip line comments / docstrings so the prose may still
      // describe "future fetch calls" without tripping the guard.
      const runtime = src.replace(/^\s*\/\/.*$/gm, "");
      expect(runtime).not.toMatch(/\bfetch\s*\(/);
      expect(runtime).not.toMatch(/\bXMLHttpRequest\b/);
    }
  });
});

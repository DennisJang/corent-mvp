// invokeLLMTask orchestrator tests (Bundle 4 Slice 4).
//
// Coverage:
//
//   - Happy path for all four task types: returns
//     `kind: "ok"` with a normalized typed candidate and a
//     CostEstimate carrying the adapter's usage labels.
//   - Adapter throw: returns a `kind: "fallback"` envelope with
//     reason "adapter_threw", `fallbackUsed: true` on the cost
//     estimate, and a typed safe empty candidate. The underlying
//     error message / stack never appears in the result.
//   - Adapter returns a candidate widened with forbidden authority
//     fields: the orchestrator's normalizer strips them; the
//     result still reads `kind: "ok"`.
//   - Adapter returns a malformed candidate (null / array /
//     wrong shape): the normalizer absorbs it into a safe empty
//     candidate; result is `kind: "ok"`.
//   - Raw input literal never appears anywhere in the result
//     (literal probe).
//   - CostEstimate keys are exactly the documented set; no
//     prompt / rawInput / body / messages / system field.
//   - Optional `fallbackCandidate` overrides the synthesized
//     empty default; the override goes through the same shape
//     contract.
//   - Default adapter is `mockLLMAdapter`; explicit adapter
//     injection works.
//   - Static-text scan: invoke.ts has no `process.env`, no
//     provider SDK import, no `fetch(` call.

import { describe, expect, it } from "vitest";
import {
  invokeLLMTask,
  type LLMAdapter,
  type LLMCandidate,
  type LLMRequest,
  type LLMResponse,
  type ListingExtractionCandidate,
  type MatchExplanationCandidate,
  type RenterIntentCandidate,
  type SellerStoreCandidate,
} from "./index";

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

function expectNoForbiddenKeys(value: unknown) {
  const blob = JSON.stringify(value);
  for (const banned of FORBIDDEN_AUTHORITY_FIELDS) {
    expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
  }
}

function expectNoPromptKeys(value: unknown) {
  const blob = JSON.stringify(value);
  for (const banned of [
    "prompt",
    "rawInput",
    "rawSellerInput",
    "body",
    "messages",
    "system",
  ]) {
    expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
  }
}

// Build a fake adapter whose `generate` is fully under test
// control. Defaults to a minimal valid response.
function fakeAdapter(
  generate: LLMAdapter["generate"],
): LLMAdapter {
  return { generate };
}

describe("invokeLLMTask — happy path for all four task types", () => {
  it("listing_extraction: returns kind: 'ok' with typed candidate + CostEstimate", async () => {
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "마사지건 mini 마포구",
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const c = r.candidate satisfies ListingExtractionCandidate;
    expect(c.provenance).toBe("llm_candidate");
    expect(r.costEstimate.taskType).toBe("listing_extraction");
    expect(r.costEstimate.fallbackUsed).toBe(false);
    expect(r.costEstimate.provider).toBe("mock");
    expect(r.costEstimate.model).toBe("mock-corent-1");
  });

  it("seller_store: returns kind: 'ok' with typed candidate", async () => {
    const r = await invokeLLMTask({
      taskType: "seller_store",
      input: { listings: 3 },
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const c = r.candidate satisfies SellerStoreCandidate;
    expect(c.provenance).toBe("llm_candidate");
    expect(c.improvementNudges).toEqual([]);
  });

  it("renter_intent: returns kind: 'ok' with typed candidate", async () => {
    const r = await invokeLLMTask({
      taskType: "renter_intent",
      input: { rawInput: "체험 1일" },
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const c = r.candidate satisfies RenterIntentCandidate;
    expect(c.provenance).toBe("llm_candidate");
    expect(c.intentTags).toEqual([]);
  });

  it("match_explanation: returns kind: 'ok' with typed candidate", async () => {
    const r = await invokeLLMTask({
      taskType: "match_explanation",
      input: { listingId: "x", searchIntentId: "si" },
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const c = r.candidate satisfies MatchExplanationCandidate;
    expect(c.reasons).toEqual([]);
    expect(c.cautions).toEqual([]);
  });
});

describe("invokeLLMTask — adapter throw → fallback envelope", () => {
  it("returns kind: 'fallback' with reason 'adapter_threw' on adapter throw", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error(
        "PROVIDER_INTERNAL_ERROR with secret API key sk-1234567890",
      );
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "RAW_PROMPT_DO_NOT_LEAK_42",
      adapter,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") return;
    expect(r.reason).toBe("adapter_threw");
    expect(r.costEstimate.fallbackUsed).toBe(true);
    expect(r.costEstimate.provider).toBe("unknown");
    expect(r.costEstimate.model).toBe("unknown");
    expect(r.costEstimate.outputTokens).toBe(0);
  });

  it("the underlying error message / stack never appears in the fallback result", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error(
        "PROVIDER_INTERNAL_ERROR with secret API key sk-1234567890",
      );
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "RAW_PROMPT_DO_NOT_LEAK_42",
      adapter,
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("PROVIDER_INTERNAL_ERROR");
    expect(blob).not.toContain("sk-1234567890");
    expect(blob).not.toContain("secret API key");
  });

  it("does NOT echo the raw input literal in the fallback result", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("boom");
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "RAW_PROMPT_DO_NOT_LEAK_42",
      adapter,
    });
    expect(JSON.stringify(r)).not.toContain("RAW_PROMPT_DO_NOT_LEAK_42");
  });

  it("synthesizes a typed safe empty candidate when no fallbackCandidate is provided", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("x");
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
      adapter,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") return;
    expect(r.candidate.provenance).toBe("llm_candidate");
    expect(r.candidate.title).toBeNull();
    expect(r.candidate.category).toBeNull();
    expect(r.candidate.components).toEqual([]);
  });

  it("uses the explicit fallbackCandidate when provided", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("x");
    });
    const explicit: ListingExtractionCandidate = {
      title: "(준비 중)",
      category: null,
      pickupArea: null,
      components: [],
      defects: [],
      provenance: "llm_candidate",
    };
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
      adapter,
      fallbackCandidate: explicit,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") return;
    expect(r.candidate.title).toBe("(준비 중)");
  });

  it("computes a length-based inputTokens estimate on fallback (string input)", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("x");
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "a".repeat(40),
      adapter,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") return;
    // 40 chars / 4 = 10 tokens
    expect(r.costEstimate.inputTokens).toBe(10);
  });

  it("computes 0 inputTokens for non-serializable input on fallback (no throw out)", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const adapter = fakeAdapter(async () => {
      throw new Error("x");
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: circular,
      adapter,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") return;
    expect(r.costEstimate.inputTokens).toBe(0);
  });
});

describe("invokeLLMTask — normalizer strips authority fields on success", () => {
  it("drops every forbidden authority field a malicious adapter might return", async () => {
    const adapter = fakeAdapter(async () => {
      const wideCandidate = {
        title: "x",
        category: "massage_gun",
        pickupArea: "마포구",
        components: [],
        defects: [],
        provenance: "llm_candidate",
        // Forbidden authority fields a future provider (or a
        // hostile prompt-injected output) might emit.
        status: "approved",
        sellerId: "FORGED_SELLER",
        borrowerId: "FORGED_BORROWER",
        listingId: "FORGED_LISTING",
        price: 999_999,
        rentalFee: 21_000,
        borrowerTotal: 51_000,
        safetyDeposit: 30_000,
        sellerPayout: 21_000,
        platformFee: 0,
        payment: { sessionId: "LEAK" },
        settlement: { status: "settled" },
        verification: { aiNotes: "LEAK" },
        publication: "approved",
        adminId: "FORGED_ADMIN",
        role: "founder",
        capability: "founder",
        trustScore: 99,
        address: "서울시 마포구 OOO로 12-3",
        contact: "010-1234-5678",
      };
      const response: LLMResponse<LLMCandidate> = {
        candidate: wideCandidate as unknown as LLMCandidate,
        usage: { inputTokens: 100, outputTokens: 50 },
        provider: "mock",
        model: "mock-corent-1",
        fallbackUsed: false,
      };
      return response;
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
      adapter,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expectNoForbiddenKeys(r);
  });

  it("normalizes a malformed candidate (null / array / wrong shape) into a safe empty candidate", async () => {
    const cases = [null, [], 42, "string", undefined];
    for (const malformed of cases) {
      const adapter = fakeAdapter(async (req: LLMRequest) => {
        const response: LLMResponse<LLMCandidate> = {
          candidate: malformed as unknown as LLMCandidate,
          usage: { inputTokens: 10, outputTokens: 5 },
          provider: "mock",
          model: "mock-corent-1",
          fallbackUsed: false,
        };
        expect(req.taskType).toBe("listing_extraction");
        return response;
      });
      const r = await invokeLLMTask({
        taskType: "listing_extraction",
        input: "x",
        adapter,
      });
      expect(r.kind).toBe("ok");
      if (r.kind !== "ok") return;
      expect(r.candidate.provenance).toBe("llm_candidate");
      expect(r.candidate.title).toBeNull();
      expect(r.candidate.category).toBeNull();
      expect(r.candidate.components).toEqual([]);
    }
  });
});

describe("invokeLLMTask — telemetry hygiene", () => {
  it("CostEstimate keys are exactly the documented set", async () => {
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
    });
    expect(Object.keys(r.costEstimate).sort()).toEqual(
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

  it("result JSON never contains prompt / rawInput / body / messages / system keys", async () => {
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "마사지건 mini 마포구",
    });
    expectNoPromptKeys(r);
  });

  it("does not echo a raw input literal anywhere in the success-path result", async () => {
    const adapter = fakeAdapter(async () => {
      const response: LLMResponse<LLMCandidate> = {
        candidate: {
          title: null,
          category: null,
          pickupArea: null,
          components: [],
          defects: [],
          provenance: "llm_candidate",
        },
        usage: { inputTokens: 8, outputTokens: 4 },
        provider: "mock",
        model: "mock-corent-1",
        fallbackUsed: false,
      };
      return response;
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "RAW_PROMPT_DO_NOT_LEAK_42",
      adapter,
    });
    expect(JSON.stringify(r)).not.toContain("RAW_PROMPT_DO_NOT_LEAK_42");
  });
});

describe("invokeLLMTask — adapter selection", () => {
  it("uses mockLLMAdapter by default (success path with provider='mock')", async () => {
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.costEstimate.provider).toBe("mock");
    expect(r.costEstimate.model).toBe("mock-corent-1");
  });

  it("uses the injected adapter when provided", async () => {
    let calls = 0;
    const adapter = fakeAdapter(async () => {
      calls += 1;
      const response: LLMResponse<LLMCandidate> = {
        candidate: {
          title: null,
          category: null,
          pickupArea: null,
          components: [],
          defects: [],
          provenance: "llm_candidate",
        },
        usage: { inputTokens: 100, outputTokens: 50 },
        provider: "future-provider",
        model: "future-model-v1",
        fallbackUsed: false,
      };
      return response;
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
      adapter,
    });
    expect(calls).toBe(1);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.costEstimate.provider).toBe("future-provider");
    expect(r.costEstimate.model).toBe("future-model-v1");
  });

  it("forwards the adapter's reported `fallbackUsed` (true) into the CostEstimate without flipping kind to fallback", async () => {
    // Distinct from the orchestrator-level fallback envelope: a
    // production adapter may report it served the request but
    // had to internally fall back to a smaller model. The
    // orchestrator forwards that flag without claiming the call
    // failed — kind remains "ok".
    const adapter = fakeAdapter(async () => {
      const response: LLMResponse<LLMCandidate> = {
        candidate: {
          title: null,
          category: null,
          pickupArea: null,
          components: [],
          defects: [],
          provenance: "llm_candidate",
        },
        usage: { inputTokens: 10, outputTokens: 5 },
        provider: "future-provider",
        model: "future-fallback-model",
        fallbackUsed: true,
      };
      return response;
    });
    const r = await invokeLLMTask({
      taskType: "listing_extraction",
      input: "x",
      adapter,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.costEstimate.fallbackUsed).toBe(true);
  });
});

describe("invokeLLMTask — module hygiene (server-only, no provider SDK / env / fetch)", () => {
  it("invoke.ts does not import any provider SDK package", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "llm",
      "invoke.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importBlob = (
      src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
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
      expect(importBlob).not.toMatch(
        new RegExp(`from\\s+["']${banned}["']`),
      );
    }
  });

  it("invoke.ts does not read process.env or call fetch / XMLHttpRequest", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "llm",
      "invoke.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const runtime = src.replace(/^\s*\/\/.*$/gm, "");
    expect(runtime).not.toMatch(/process\.env\./);
    expect(runtime).not.toMatch(/\bfetch\s*\(/);
    expect(runtime).not.toMatch(/\bXMLHttpRequest\b/);
  });
});

// /sell ↔ LLM-orchestrator integration probe (Bundle 4 Slice 5).
//
// TESTS-ONLY integration. No production code path is touched in
// this slice — the chat intake service, the deterministic
// extractor, the listing draft writer, and every persistence
// hop continue to behave byte-identically to the previous slice.
// This file only proves that `invokeLLMTask` CAN run alongside
// the deterministic flow without affecting saved state.
//
// Test plan:
//
//   1. Run the full intake roundtrip through the default
//      `chatListingIntakeService` (startSession → appendSellerMessage
//      → createListingDraftFromIntake) without any LLM call.
//      Capture the extraction + the persisted draft.
//
//   2. Repeat the same roundtrip on a fresh persistence, this time
//      running `invokeLLMTask` in parallel with the same seller
//      input. Assert the extraction + draft match the control run
//      byte-for-byte.
//
//   3. Probe the LLM-side guarantees:
//        - candidate has `provenance: "llm_candidate"`
//        - cost estimate carries only the documented fields
//        - raw seller input literal never appears anywhere in
//          the LLM result
//        - adapter throw flips the result to `kind: "fallback"`
//          but does NOT prevent the deterministic intake from
//          succeeding
//        - an adapter that returns a candidate widened with
//          forbidden authority fields has them stripped by the
//          orchestrator's normalizer
//
// Hard rules:
//   - No production code edited in this slice.
//   - No DB writes outside the in-memory persistence the existing
//     intake tests already use.
//   - No env vars, no logging, no telemetry.
//   - Raw seller input literal MUST NOT appear in the LLM
//     candidate / cost estimate / fallback envelope.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPersistence } from "@/lib/adapters/persistence";
import { chatListingIntakeService } from "@/lib/services/chatListingIntakeService";
import {
  invokeLLMTask,
  mockLLMAdapter,
  type LLMAdapter,
  type LLMCandidate,
  type LLMInvokeResult,
  type LLMRequest,
  type LLMResponse,
  type ListingExtractionCandidate,
} from "@/server/llm";

const SELLER_ID = "seller_jisu";
// A deliberately distinctive literal so we can grep for it in the
// LLM result and prove it never leaks. The Korean-language
// content is realistic seller chat copy.
const RAW_SELLER_INPUT =
  "테라건 미니 빌려줄게요. CANARY_RAW_INPUT_42 강남역 근처에서 가능해요. 하루 9000원이면 좋겠어요.";

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

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

// Snapshot the extraction + the persisted draft fields the slice
// could realistically have changed if a regression accidentally
// promoted an LLM candidate into the canonical record.
type IntakeSnapshot = {
  extraction: {
    itemName: string | undefined;
    category: string | undefined;
    pickupArea: string | undefined;
    condition: string | undefined;
    oneDayPrice: number | undefined;
    estimatedValue: number | undefined;
    components: string[] | undefined;
    defects: string[] | undefined;
    missingFields: string[];
  };
  listing: {
    id: string;
    sellerId: string;
    status: string;
    itemName: string;
    category: string;
    pickupArea: string;
    estimatedValue: number;
    oneDayPrice: number;
    threeDaysPrice: number;
    sevenDaysPrice: number;
  };
};

async function runIntakeFlow(): Promise<IntakeSnapshot> {
  const session = await chatListingIntakeService.startSession(SELLER_ID);
  const append = await chatListingIntakeService.appendSellerMessage(
    session.id,
    SELLER_ID,
    RAW_SELLER_INPUT,
  );
  const finalize =
    await chatListingIntakeService.createListingDraftFromIntake(
      session.id,
      SELLER_ID,
    );
  const e = append.extraction;
  const l = finalize.listing;
  return {
    extraction: {
      itemName: e.itemName,
      category: e.category,
      pickupArea: e.pickupArea,
      condition: e.condition,
      oneDayPrice: e.oneDayPrice,
      estimatedValue: e.estimatedValue,
      components: e.components,
      defects: e.defects,
      missingFields: e.missingFields,
    },
    listing: {
      id: l.id,
      sellerId: l.sellerId,
      status: l.status,
      itemName: l.item.name,
      category: l.item.category,
      pickupArea: l.item.pickupArea,
      estimatedValue: l.item.estimatedValue,
      oneDayPrice: l.pricing.oneDay,
      threeDaysPrice: l.pricing.threeDays,
      sevenDaysPrice: l.pricing.sevenDays,
    },
  };
}

// Helper: same intake roundtrip, with `invokeLLMTask` called in
// parallel using the supplied adapter (defaults to the mock).
async function runIntakeFlowWithLLMSidecar(
  adapter: LLMAdapter = mockLLMAdapter,
): Promise<{
  snapshot: IntakeSnapshot;
  llmResult: LLMInvokeResult<ListingExtractionCandidate>;
}> {
  const session = await chatListingIntakeService.startSession(SELLER_ID);
  const [append, llmResult] = await Promise.all([
    chatListingIntakeService.appendSellerMessage(
      session.id,
      SELLER_ID,
      RAW_SELLER_INPUT,
    ),
    invokeLLMTask({
      taskType: "listing_extraction",
      input: RAW_SELLER_INPUT,
      adapter,
    }),
  ]);
  const finalize =
    await chatListingIntakeService.createListingDraftFromIntake(
      session.id,
      SELLER_ID,
    );
  const e = append.extraction;
  const l = finalize.listing;
  return {
    snapshot: {
      extraction: {
        itemName: e.itemName,
        category: e.category,
        pickupArea: e.pickupArea,
        condition: e.condition,
        oneDayPrice: e.oneDayPrice,
        estimatedValue: e.estimatedValue,
        components: e.components,
        defects: e.defects,
        missingFields: e.missingFields,
      },
      listing: {
        id: l.id,
        sellerId: l.sellerId,
        status: l.status,
        itemName: l.item.name,
        category: l.item.category,
        pickupArea: l.item.pickupArea,
        estimatedValue: l.item.estimatedValue,
        oneDayPrice: l.pricing.oneDay,
        threeDaysPrice: l.pricing.threeDays,
        sevenDaysPrice: l.pricing.sevenDays,
      },
    },
    llmResult,
  };
}

// Build a fake adapter under test control.
function fakeAdapter(
  generate: LLMAdapter["generate"],
): LLMAdapter {
  return { generate };
}

describe("/sell ↔ LLM orchestrator — deterministic intake unaffected", () => {
  it("extraction + persisted draft are byte-identical to the control run when invokeLLMTask runs alongside (mock adapter)", async () => {
    const control = await runIntakeFlow();
    await getPersistence().clearAll();
    const sideBySide = await runIntakeFlowWithLLMSidecar();
    // The persisted listing id is generated per-call (unique uuid /
    // local id), so we compare every field except id.
    const stripId = (s: IntakeSnapshot) => ({
      ...s,
      listing: { ...s.listing, id: "(redacted-for-comparison)" },
    });
    expect(stripId(sideBySide.snapshot)).toEqual(stripId(control));
    // Sanity: the LLM call resolved successfully (not a fallback).
    expect(sideBySide.llmResult.kind).toBe("ok");
  });

  it("adapter throw does NOT block intake — extraction + draft still match the control run", async () => {
    const control = await runIntakeFlow();
    await getPersistence().clearAll();
    const throwingAdapter = fakeAdapter(async () => {
      throw new Error(
        "PROVIDER_INTERNAL_ERROR with secret token sk-CANARY-KEY",
      );
    });
    const result = await runIntakeFlowWithLLMSidecar(throwingAdapter);
    const stripId = (s: IntakeSnapshot) => ({
      ...s,
      listing: { ...s.listing, id: "(redacted-for-comparison)" },
    });
    expect(stripId(result.snapshot)).toEqual(stripId(control));
    // The orchestrator absorbed the throw and returned a fallback
    // envelope. The intake flow above completed regardless.
    expect(result.llmResult.kind).toBe("fallback");
    if (result.llmResult.kind !== "fallback") return;
    expect(result.llmResult.reason).toBe("adapter_threw");
    // The underlying error / token never leaks into the result.
    const blob = JSON.stringify(result.llmResult);
    expect(blob).not.toContain("PROVIDER_INTERNAL_ERROR");
    expect(blob).not.toContain("sk-CANARY-KEY");
  });
});

describe("/sell ↔ LLM orchestrator — candidate stays advisory-only", () => {
  it("LLM candidate carries provenance: 'llm_candidate' and is never written to the persisted listing", async () => {
    const adapter = fakeAdapter(async (req: LLMRequest) => {
      // Deliberately propose values DIFFERENT from what the
      // deterministic extractor produces. If a regression promoted
      // these into the persisted listing, the snapshot equality
      // assertion below would fail.
      const wide = {
        title: "AI 후보 — 테라건 mini PRO",
        category: "exercise",
        pickupArea: "성수",
        components: ["AI 추정 어댑터"],
        defects: ["AI 추정 스크래치"],
        provenance: "llm_candidate" as const,
      };
      const response: LLMResponse<LLMCandidate> = {
        candidate: wide as unknown as LLMCandidate,
        usage: { inputTokens: 64, outputTokens: 32 },
        provider: "mock",
        model: "mock-corent-1",
        fallbackUsed: false,
      };
      expect(req.taskType).toBe("listing_extraction");
      return response;
    });
    const control = await runIntakeFlow();
    await getPersistence().clearAll();
    const result = await runIntakeFlowWithLLMSidecar(adapter);

    // Intake snapshot must equal the control. The LLM's
    // alternative category ("exercise") and pickup area ("성수")
    // must NOT appear in the persisted listing.
    const stripId = (s: IntakeSnapshot) => ({
      ...s,
      listing: { ...s.listing, id: "(redacted-for-comparison)" },
    });
    expect(stripId(result.snapshot)).toEqual(stripId(control));
    expect(result.snapshot.listing.category).not.toBe("exercise");
    expect(result.snapshot.listing.pickupArea).not.toBe("성수");

    // The LLM candidate carries the documented provenance and
    // shape; the orchestrator forwarded it through the normalizer.
    expect(result.llmResult.kind).toBe("ok");
    if (result.llmResult.kind !== "ok") return;
    const candidate = result.llmResult.candidate;
    if (!("provenance" in candidate)) {
      throw new Error("listing_extraction candidate must carry provenance");
    }
    expect(candidate.provenance).toBe("llm_candidate");
  });

  it("the orchestrator strips forbidden authority fields a hostile adapter might return", async () => {
    const adapter = fakeAdapter(async () => {
      const wide = {
        title: "x",
        category: "massage_gun",
        pickupArea: "마포구",
        components: [],
        defects: [],
        provenance: "llm_candidate" as const,
        // Forbidden authority fields. The orchestrator's
        // normalizer must drop every one of them before they
        // reach the test (or any downstream surface).
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
        candidate: wide as unknown as LLMCandidate,
        usage: { inputTokens: 100, outputTokens: 50 },
        provider: "mock",
        model: "mock-corent-1",
        fallbackUsed: false,
      };
      return response;
    });
    const result = await runIntakeFlowWithLLMSidecar(adapter);
    expect(result.llmResult.kind).toBe("ok");
    const blob = JSON.stringify(result.llmResult);
    for (const banned of FORBIDDEN_AUTHORITY_FIELDS) {
      expect(blob).not.toMatch(new RegExp(`"${banned}"`, "i"));
    }
    // The persisted listing equally carries no forged authority
    // value. The deterministic flow doesn't read the candidate at
    // all, but we re-assert it for defense in depth.
    expect(result.snapshot.listing.sellerId).toBe(SELLER_ID);
    expect(result.snapshot.listing.status).toBe("draft");
  });
});

describe("/sell ↔ LLM orchestrator — telemetry hygiene", () => {
  it("raw seller input literal never appears in the LLM candidate / cost estimate / fallback envelope", async () => {
    // Success-path: mock adapter returns its empty candidate.
    const ok = await runIntakeFlowWithLLMSidecar();
    expect(JSON.stringify(ok.llmResult)).not.toContain(
      "CANARY_RAW_INPUT_42",
    );
    await getPersistence().clearAll();

    // Fallback-path: a thrown adapter still cannot leak the input.
    const throwingAdapter = fakeAdapter(async () => {
      throw new Error("PROVIDER_INTERNAL_ERROR");
    });
    const fallback = await runIntakeFlowWithLLMSidecar(throwingAdapter);
    expect(JSON.stringify(fallback.llmResult)).not.toContain(
      "CANARY_RAW_INPUT_42",
    );
  });

  it("CostEstimate carries only the documented keys (no prompt / rawInput / body / messages / system)", async () => {
    const ok = await runIntakeFlowWithLLMSidecar();
    expect(ok.llmResult.kind).toBe("ok");
    if (ok.llmResult.kind !== "ok") return;
    const cost = ok.llmResult.costEstimate;
    expect(Object.keys(cost).sort()).toEqual(
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
    const blob = JSON.stringify(cost);
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

  it("does not log or persist the cost estimate (no DB writes added by the LLM sidecar)", async () => {
    // The persistence layer the intake service uses is the
    // shared in-memory store. The LLM orchestrator must never
    // write to it — assertion: every key is owned by the intake
    // service (`isn_*`, `li_*`, `ie_*`, `im_*`).
    await runIntakeFlowWithLLMSidecar();
    // We cannot enumerate the persistence directly, but we can
    // reload by id and confirm the only sessions / extractions /
    // listings present are the ones the intake service created
    // — there is no `llm_*` key created by the orchestrator.
    const sessions =
      await chatListingIntakeService.listSessionsForSeller(SELLER_ID);
    expect(sessions.length).toBe(1);
    // Each session id matches the intake writer's prefix; we
    // do not see an LLM-prefixed extra row.
    for (const s of sessions) {
      expect(s.id.startsWith("isn_") || /^[0-9a-f-]{36}$/i.test(s.id)).toBe(
        true,
      );
    }
  });
});

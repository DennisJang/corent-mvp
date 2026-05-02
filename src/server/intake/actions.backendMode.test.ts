// Backend-mode safety gate tests for the chat intake server actions.
//
// These tests live in a dedicated file so the resolver mock (and its
// module-level `vi.mock`) does not leak into the broader action tests
// in `actions.test.ts`, which exercise the real
// `getMockSellerSession()`-backed resolver.
//
// What we verify:
//
//   1. Default behavior (no env stubbed → backend mode = "mock") is
//      unchanged. The actions proceed against local persistence.
//   2. With `CORENT_BACKEND_MODE=supabase` AND a mock-sourced actor
//      (the only kind today's resolver returns), every intake action
//      fails closed with `code: "unauthenticated"` and a non-secret
//      `supabase_mode_requires_auth_bound_actor` message.
//   3. With `CORENT_BACKEND_MODE=supabase` AND a synthesized
//      supabase-sourced actor (the future state once real auth lands),
//      every intake action fails closed with `code: "internal"` and
//      `supabase_runtime_not_yet_wired`. This branch is unreachable
//      from production today; the gate is in the right place for the
//      later PR that wires the dispatch to the Supabase repository.
//
// Production code is unaffected by the resolver mock — it only fires
// inside this test file.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_SELLER } from "@/data/mockSellers";
import { getPersistence } from "@/lib/adapters/persistence";

vi.mock("@/server/actors/resolveServerActor", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/actors/resolveServerActor")
  >("@/server/actors/resolveServerActor");
  return {
    ...actual,
    resolveServerActor: vi.fn(actual.resolveServerActor),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
} from "@/server/intake/actions";

const mockResolver = vi.mocked(resolveServerActor);

const REPRESENTATIVE_INPUT =
  "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.";

beforeEach(async () => {
  await getPersistence().clearAll();
  // Default: pass through to a mock-sourced seller actor — the same
  // shape the real resolver returns today.
  mockResolver.mockImplementation(async () => ({
    kind: "seller",
    sellerId: CURRENT_SELLER.id,
    displayName: CURRENT_SELLER.name,
    source: "mock",
  }));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockResolver.mockReset();
  await getPersistence().clearAll();
});

describe("intake server actions — default (mock) mode unchanged", () => {
  it("startIntakeSessionAction proceeds with mock actor when env is unset", async () => {
    // No env stubbed → getBackendMode() returns "mock".
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.session.sellerId).toBe(CURRENT_SELLER.id);
  });

  it("explicit CORENT_BACKEND_MODE=mock is treated identically to unset", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
  });

  it("garbage env value falls back to mock and proceeds", async () => {
    // Defense in depth: any unrecognized value becomes "mock".
    vi.stubEnv("CORENT_BACKEND_MODE", "totally-bogus");
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
  });
});

describe("intake server actions — supabase mode + mock actor fails closed", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("startIntakeSessionAction fails closed with unauthenticated", async () => {
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
  });

  it("appendIntakeSellerMessageAction fails closed with unauthenticated", async () => {
    // Set up a session under mock mode first so the gate has
    // something to potentially append against.
    vi.unstubAllEnvs();
    const start = await startIntakeSessionAction();
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    const r = await appendIntakeSellerMessageAction({
      sessionId: start.value.session.id,
      content: REPRESENTATIVE_INPUT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
  });

  it("createIntakeListingDraftAction fails closed with unauthenticated", async () => {
    vi.unstubAllEnvs();
    const start = await startIntakeSessionAction();
    if (!start.ok) return;
    await appendIntakeSellerMessageAction({
      sessionId: start.value.session.id,
      content: REPRESENTATIVE_INPUT,
    });

    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    const r = await createIntakeListingDraftAction({
      sessionId: start.value.session.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
  });

  it("the failure message is non-secret — no env values, no stack traces, no service role hints", async () => {
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toMatch(/SUPABASE_/);
      expect(r.message).not.toMatch(/SERVICE_ROLE/);
      expect(r.message).not.toMatch(/process\.env/);
      expect(r.message).not.toMatch(/at .+\(/); // no stack frame syntax
    }
  });
});

describe("intake server actions — supabase mode + supabase actor (future state)", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    // Synthesize the future state: a supabase-sourced actor (i.e. a
    // resolver that has returned an auth-bound identity).
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: CURRENT_SELLER.id,
      displayName: CURRENT_SELLER.name,
      source: "supabase",
    }));
  });

  it("startIntakeSessionAction fails closed with internal: supabase_runtime_not_yet_wired", async () => {
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("internal");
      expect(r.message).toBe("supabase_runtime_not_yet_wired");
    }
  });

  it("appendIntakeSellerMessageAction fails closed with internal: not yet wired", async () => {
    const r = await appendIntakeSellerMessageAction({
      sessionId: "11111111-2222-4333-8444-555555555555",
      content: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("internal");
      expect(r.message).toBe("supabase_runtime_not_yet_wired");
    }
  });

  it("createIntakeListingDraftAction fails closed with internal: not yet wired", async () => {
    const r = await createIntakeListingDraftAction({
      sessionId: "11111111-2222-4333-8444-555555555555",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("internal");
      expect(r.message).toBe("supabase_runtime_not_yet_wired");
    }
  });
});

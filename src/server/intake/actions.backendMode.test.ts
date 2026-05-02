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

// PR 4 dispatch verification: the supabase writer is replaced with
// a controllable mock so the supabase + supabase-actor branch
// tests can assert that dispatch reached the writer (not the local
// path) without standing up a real Supabase client. Each method is
// a vi.fn() and the test sets per-call return values.
vi.mock("@/server/intake/supabaseIntakeWriter", () => ({
  supabaseIntakeWriter: {
    saveIntakeSession: vi.fn(async () => {}),
    getIntakeSession: vi.fn(async () => null),
    listIntakeSessions: vi.fn(async () => []),
    appendIntakeMessage: vi.fn(async () => {}),
    listIntakeMessagesForSession: vi.fn(async () => []),
    saveIntakeExtraction: vi.fn(async () => {}),
    getIntakeExtractionForSession: vi.fn(async () => null),
  },
}));

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { supabaseIntakeWriter } from "@/server/intake/supabaseIntakeWriter";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
} from "@/server/intake/actions";

const mockResolver = vi.mocked(resolveServerActor);
const mockSupabaseWriter = vi.mocked(supabaseIntakeWriter);

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
  mockSupabaseWriter.saveIntakeSession.mockClear();
  mockSupabaseWriter.getIntakeSession.mockClear();
  mockSupabaseWriter.listIntakeSessions.mockClear();
  mockSupabaseWriter.appendIntakeMessage.mockClear();
  mockSupabaseWriter.listIntakeMessagesForSession.mockClear();
  mockSupabaseWriter.saveIntakeExtraction.mockClear();
  mockSupabaseWriter.getIntakeExtractionForSession.mockClear();
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

describe("intake server actions — supabase mode + supabase actor (PR 4 dispatch)", () => {
  // PR 4 wires the dispatcher: when a supabase-sourced actor resolves
  // in supabase mode, the action routes its persistence through
  // `supabaseIntakeWriter` instead of the local `getPersistence()`
  // path. The writer is mocked at the module level so these tests
  // verify the routing — no real Supabase client is required.
  //
  // The PR 3 `supabase_runtime_not_yet_wired` failure mode no longer
  // exists; the dispatcher returns the supabase writer for this
  // combination and the action proceeds. Production cannot reach
  // this branch today because `resolveServerActor` still returns a
  // mock-sourced actor (PR 5 prerequisite #3 in the phase2 doc).

  const SESSION_UUID = "11111111-2222-4333-8444-555555555555";

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

  it("startIntakeSessionAction dispatches to supabase writer (not local persistence)", async () => {
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The supabase writer's saveIntakeSession was called once.
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    // Local persistence was not touched — clearAll'd at start, no
    // session row landed there.
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
    // The session returned to the caller still carries the actor's
    // seller id; ownership is the resolver's, not the payload's.
    expect(r.value.session.sellerId).toBe(CURRENT_SELLER.id);
    expect(r.value.session.status).toBe("drafting");
  });

  it("appendIntakeSellerMessageAction dispatches reads/writes to the supabase writer", async () => {
    // Pre-set the mocked supabase writer to return a session for the
    // get and accept the appends. The action then succeeds end-to-end
    // without any real Supabase client.
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: CURRENT_SELLER.id,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });

    const r = await appendIntakeSellerMessageAction({
      sessionId: SESSION_UUID,
      content: "테라건 미니 빌려줄게요. 강남역 근처. 하루 9000원.",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The action read the session via the supabase writer …
    expect(mockSupabaseWriter.getIntakeSession).toHaveBeenCalledWith(
      SESSION_UUID,
    );
    // … and wrote two messages (seller + assistant) plus the
    // extraction plus the updated session.
    expect(mockSupabaseWriter.appendIntakeMessage).toHaveBeenCalledTimes(2);
    expect(mockSupabaseWriter.saveIntakeExtraction).toHaveBeenCalledTimes(1);
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    // Local persistence was untouched.
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
  });

  it("createIntakeListingDraftAction dispatches intake reads/writes to the supabase writer", async () => {
    // The supabase writer returns a fresh session that already has
    // a seller message saved. The action needs at least one seller
    // message to derive sellerText.
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: CURRENT_SELLER.id,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    mockSupabaseWriter.listIntakeMessagesForSession.mockResolvedValueOnce([
      {
        id: "msg_1",
        sessionId: SESSION_UUID,
        role: "seller",
        content: "테라건 미니, 강남역 근처, 하루 9000원.",
        createdAt: "2026-04-30T00:00:01.000Z",
      },
    ]);
    mockSupabaseWriter.getIntakeExtractionForSession.mockResolvedValueOnce(null);

    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Intake reads went to the supabase writer.
    expect(mockSupabaseWriter.getIntakeSession).toHaveBeenCalledWith(
      SESSION_UUID,
    );
    expect(
      mockSupabaseWriter.listIntakeMessagesForSession,
    ).toHaveBeenCalledWith(SESSION_UUID);
    expect(
      mockSupabaseWriter.getIntakeExtractionForSession,
    ).toHaveBeenCalledWith(SESSION_UUID);
    // Intake-side session update went through the supabase writer.
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    // Listing draft is owned by the resolved actor, never approved.
    expect(r.value.listing.sellerId).toBe(CURRENT_SELLER.id);
    expect(r.value.listing.status).toBe("draft");
    // Note: listing-side persistence (`getListingIntent` /
    // `listingService.saveDraft`) intentionally still uses
    // `getPersistence()` in PR 4 — extending the writer to listings
    // is a future slice. The test does not assert listing-side
    // routing because that boundary is not in PR 4's scope.
  });

  it("does NOT call the supabase writer when actor is mock-sourced (gate refuses earlier)", async () => {
    // Mock-sourced actor in supabase mode: the dispatcher returns
    // null and the action returns `unauthenticated` BEFORE
    // touching the supabase writer.
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: CURRENT_SELLER.id,
      displayName: CURRENT_SELLER.name,
      source: "mock",
    }));
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
    }
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
  });
});

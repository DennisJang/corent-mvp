// Tests for the chat-intake client adapter (Slice A PR 5F).
//
// What this file owns:
//   - default-local-mode invariant (pre-probe and probe-failure)
//   - probe caching (single-flight)
//   - per-mode dispatch: local mode calls `chatListingIntakeService`,
//     server mode calls the server actions, never the local service
//   - no silent fallback in server mode after a typed failure or a
//     thrown action
//
// All tests run in a Node/SSR test environment so `getPersistence()`
// returns the in-memory adapter. Server actions are mocked at the
// module level.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the probe + the three intake actions BEFORE the adapter is
// imported. Each is a controllable vi.fn() per test.
vi.mock("@/server/intake/getChatIntakeMode", () => ({
  getChatIntakeModeAction: vi.fn(async () => ({ mode: "local" })),
}));
vi.mock("@/server/intake/actions", () => ({
  startIntakeSessionAction: vi.fn(async () => ({
    ok: true,
    value: {
      session: { id: "isn_server", sellerId: "seller_x", status: "drafting" },
    },
  })),
  appendIntakeSellerMessageAction: vi.fn(async () => ({
    ok: true,
    value: {},
  })),
  createIntakeListingDraftAction: vi.fn(async () => ({ ok: true, value: {} })),
}));

import { getChatIntakeModeAction } from "@/server/intake/getChatIntakeMode";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
} from "@/server/intake/actions";
import {
  _resetChatIntakeModeForTests,
  appendSellerMessage,
  createListingDraft,
  probeChatIntakeMode,
  startIntakeSession,
} from "./chatIntakeClient";
import { chatListingIntakeService } from "@/lib/services/chatListingIntakeService";
import { getPersistence } from "@/lib/adapters/persistence";

const mockProbe = vi.mocked(getChatIntakeModeAction);
const mockStart = vi.mocked(startIntakeSessionAction);
const mockAppend = vi.mocked(appendIntakeSellerMessageAction);
const mockCreate = vi.mocked(createIntakeListingDraftAction);

beforeEach(async () => {
  _resetChatIntakeModeForTests();
  mockProbe.mockReset();
  mockProbe.mockResolvedValue({ mode: "local" });
  mockStart.mockReset();
  mockAppend.mockReset();
  mockCreate.mockReset();
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
  _resetChatIntakeModeForTests();
});

describe("probeChatIntakeMode — caching + single-flight", () => {
  it("calls the server probe once and caches the result", async () => {
    mockProbe.mockResolvedValue({ mode: "local" });
    await probeChatIntakeMode();
    await probeChatIntakeMode();
    await probeChatIntakeMode();
    expect(mockProbe).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share a single in-flight request", async () => {
    let resolve: ((v: { mode: "local" }) => void) | null = null;
    mockProbe.mockImplementation(
      () => new Promise((r) => (resolve = r as never)),
    );
    const a = probeChatIntakeMode();
    const b = probeChatIntakeMode();
    expect(mockProbe).toHaveBeenCalledTimes(1);
    resolve!({ mode: "local" });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual({ mode: "local" });
    expect(rb).toEqual({ mode: "local" });
  });

  it("returns the seller capability when probe says server/seller", async () => {
    mockProbe.mockResolvedValueOnce({ mode: "server", capability: "seller" });
    const r = await probeChatIntakeMode();
    expect(r).toEqual({ mode: "server", capability: "seller" });
  });

  it("returns mode: local on probe throw (no data has been written yet)", async () => {
    mockProbe.mockRejectedValueOnce(new Error("network"));
    const r = await probeChatIntakeMode();
    expect(r).toEqual({ mode: "local" });
  });
});

describe("default mode is local — pre-probe behavior", () => {
  it("startIntakeSession routes through local service before any probe call", async () => {
    // No probe call. The adapter must default to local — the local
    // service is reached, the server action is not.
    const r = await startIntakeSession();
    expect(r.ok).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("appendSellerMessage routes through local service before probe call", async () => {
    // Seed a local session first via the local service so the
    // append has something to bind to.
    const session = await chatListingIntakeService.startSession("seller_jisu");
    const r = await appendSellerMessage({
      sessionId: session.id,
      content: "테라건 미니",
    });
    expect(r.ok).toBe(true);
    expect(mockAppend).not.toHaveBeenCalled();
  });
});

describe("local mode — probe says local", () => {
  beforeEach(async () => {
    mockProbe.mockResolvedValue({ mode: "local" });
    await probeChatIntakeMode();
  });

  it("startIntakeSession uses local service, not the server action", async () => {
    const r = await startIntakeSession();
    expect(r.ok).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
    // A local session row landed in local persistence.
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toHaveLength(1);
  });

  it("appendSellerMessage uses local service", async () => {
    const start = await startIntakeSession();
    if (!start.ok) throw new Error("start failed");
    const r = await appendSellerMessage({
      sessionId: start.value.session.id,
      content: "테라건 미니",
    });
    expect(r.ok).toBe(true);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("createListingDraft uses local service", async () => {
    const start = await startIntakeSession();
    if (!start.ok) throw new Error("start failed");
    await appendSellerMessage({
      sessionId: start.value.session.id,
      content: "테라건 미니",
    });
    const r = await createListingDraft({ sessionId: start.value.session.id });
    expect(r.ok).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("server mode — probe says server", () => {
  beforeEach(async () => {
    mockProbe.mockResolvedValue({ mode: "server", capability: "seller" });
    await probeChatIntakeMode();
  });

  it("startIntakeSession calls the server action, not the local service", async () => {
    const r = await startIntakeSession();
    expect(r.ok).toBe(true);
    expect(mockStart).toHaveBeenCalledTimes(1);
    // Local persistence was not touched.
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toEqual([]);
  });

  it("appendSellerMessage calls the server action", async () => {
    const r = await appendSellerMessage({
      sessionId: "isn_server_uuid",
      content: "테라건 미니",
    });
    expect(r.ok).toBe(true);
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend).toHaveBeenCalledWith({
      sessionId: "isn_server_uuid",
      content: "테라건 미니",
    });
  });

  it("createListingDraft calls the server action", async () => {
    const r = await createListingDraft({ sessionId: "isn_server_uuid" });
    expect(r.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ sessionId: "isn_server_uuid" });
  });
});

describe("server mode — no silent fallback after server failure (PR 5F invariant)", () => {
  beforeEach(async () => {
    mockProbe.mockResolvedValue({ mode: "server", capability: "seller" });
    await probeChatIntakeMode();
  });

  it("a typed unauthenticated server response does NOT fall back to local", async () => {
    mockStart.mockResolvedValueOnce({
      ok: false,
      code: "unauthenticated",
      message: "supabase_mode_requires_auth_bound_actor",
    });
    const r = await startIntakeSession();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
    // Local persistence was not touched.
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toEqual([]);
  });

  it("a thrown server action surfaces a typed `internal` error and never calls the local service", async () => {
    mockStart.mockRejectedValueOnce(new Error("network exploded"));
    const r = await startIntakeSession();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("internal");
      // Generic non-secret message; no stack frames.
      expect(r.message).not.toMatch(/network exploded/);
      expect(r.message).not.toMatch(/at .+\(/);
    }
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toEqual([]);
  });

  it("a typed ownership server response is surfaced verbatim (renter actor on a seller route)", async () => {
    mockStart.mockResolvedValueOnce({
      ok: false,
      code: "ownership",
      message: "actor kind renter cannot run a seller command",
    });
    const r = await startIntakeSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ownership");
    // Critical invariant: no local-service fallback on capability
    // mismatch either.
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toEqual([]);
  });

  it("createListingDraft typed failure does not write a local listing", async () => {
    mockCreate.mockResolvedValueOnce({
      ok: false,
      code: "unauthenticated",
      message: "supabase_mode_requires_auth_bound_actor",
    });
    const r = await createListingDraft({ sessionId: "isn_server" });
    expect(r.ok).toBe(false);
    const listings = await getPersistence().listListingIntents();
    expect(listings).toEqual([]);
  });
});

describe("server mode after probe — input validation runs client-side and short-circuits", () => {
  beforeEach(async () => {
    mockProbe.mockResolvedValue({ mode: "server", capability: "seller" });
    await probeChatIntakeMode();
  });

  it("empty sessionId on append returns input error before any action call", async () => {
    const r = await appendSellerMessage({ sessionId: "", content: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("input");
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("non-string content on append returns input error before any action call", async () => {
    const r = await appendSellerMessage({
      sessionId: "isn",
      content: 42 as unknown as string,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("input");
    expect(mockAppend).not.toHaveBeenCalled();
  });
});

describe("probe failure — defaults to local before any data is written", () => {
  it("probe throw → activeMode stays local; subsequent calls reach the local service", async () => {
    mockProbe.mockRejectedValueOnce(new Error("network down"));
    const probe = await probeChatIntakeMode();
    expect(probe).toEqual({ mode: "local" });
    const r = await startIntakeSession();
    expect(r.ok).toBe(true);
    // The server action was never reached.
    expect(mockStart).not.toHaveBeenCalled();
    const sessions = await getPersistence().listIntakeSessions();
    expect(sessions).toHaveLength(1);
  });
});

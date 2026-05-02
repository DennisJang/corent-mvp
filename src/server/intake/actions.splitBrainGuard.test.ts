// Slice A PR 5D — split-brain guard tests for the chat intake
// server actions.
//
// Scope is the new PR 5D contract: in supabase backend mode, the
// `start` / `append` actions can dispatch to the Supabase intake
// writer for an authenticated seller actor (the smoke / dispatch
// path), but `createIntakeListingDraftAction` MUST fail closed
// because its underlying service writes the listing draft row
// through `getPersistence()` (local-only). Letting that path run
// in supabase mode would produce a hybrid where the intake
// session is in Supabase but the listing it points at exists
// only in localStorage.
//
// What this file owns:
//   - the start / append smoke dispatch assertions in supabase
//     mode (writer is reached, local persistence untouched);
//   - the createDraft fail-closed assertion in supabase mode
//     (writer NOT reached, local persistence untouched, typed
//     `unsupported` + non-secret message);
//   - default mock-mode behavior is preserved end-to-end
//     (start → append → createDraft all run against local
//     persistence, no Supabase writer call);
//   - forged authority fields cannot bypass the guard.
//
// `actions.backendMode.test.ts` continues to own the per-action
// dispatch decision-table tests (mock vs supabase; mock-actor
// fails closed). `actions.capability.test.ts` continues to own
// the capability-mismatch (renter-only) tests. This file is the
// single place the PR 5D split-brain invariant is asserted.

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
  type AppendIntakeSellerMessagePayload,
  type CreateIntakeListingDraftPayload,
} from "@/server/intake/actions";

const mockResolver = vi.mocked(resolveServerActor);
const mockSupabaseWriter = vi.mocked(supabaseIntakeWriter);

const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";
const SESSION_UUID = "22222222-3333-4444-8555-666666666666";
const REPRESENTATIVE_INPUT =
  "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.";

function clearAllSupabaseWriterMocks(): void {
  mockSupabaseWriter.saveIntakeSession.mockClear();
  mockSupabaseWriter.getIntakeSession.mockClear();
  mockSupabaseWriter.listIntakeSessions.mockClear();
  mockSupabaseWriter.appendIntakeMessage.mockClear();
  mockSupabaseWriter.listIntakeMessagesForSession.mockClear();
  mockSupabaseWriter.saveIntakeExtraction.mockClear();
  mockSupabaseWriter.getIntakeExtractionForSession.mockClear();
}

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockResolver.mockReset();
  clearAllSupabaseWriterMocks();
  await getPersistence().clearAll();
});

describe("PR 5D — supabase-mode + authenticated seller actor — start/append smoke dispatch", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "supabase",
    }));
  });

  it("startIntakeSessionAction reaches the supabase writer; no local persistence row created", async () => {
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Smoke: the supabase writer received the new session.
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    // The action returned the resolved actor's profile id as the
    // seller id; the supabase actor's id is the profile UUID, not
    // the legacy mock seller id.
    expect(r.value.session.sellerId).toBe(PROFILE_UUID);
    expect(r.value.session.sellerId).not.toBe(CURRENT_SELLER.id);
    // No local persistence side-effect.
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
  });

  it("appendIntakeSellerMessageAction reaches the supabase writer for reads + writes", async () => {
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: PROFILE_UUID,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    const r = await appendIntakeSellerMessageAction({
      sessionId: SESSION_UUID,
      content: REPRESENTATIVE_INPUT,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(mockSupabaseWriter.getIntakeSession).toHaveBeenCalledWith(
      SESSION_UUID,
    );
    // Two messages (seller + assistant) plus extraction plus the
    // updated session — same dispatch shape PR 4 documented.
    expect(mockSupabaseWriter.appendIntakeMessage).toHaveBeenCalledTimes(2);
    expect(mockSupabaseWriter.saveIntakeExtraction).toHaveBeenCalledTimes(1);
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    // No local persistence side-effect.
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
  });
});

describe("PR 5D — supabase-mode + authenticated seller actor — createDraft fails closed", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "supabase",
    }));
  });

  it("returns typed `unsupported` with `supabase_listing_draft_not_yet_wired`", async () => {
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unsupported");
      expect(r.message).toBe("supabase_listing_draft_not_yet_wired");
    }
  });

  it("does NOT reach the supabase writer (no partial Supabase state)", async () => {
    // Pre-arm the writer with successful responses; the guard must
    // fire before any of these are called.
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: PROFILE_UUID,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(false);
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
    expect(
      mockSupabaseWriter.listIntakeMessagesForSession,
    ).not.toHaveBeenCalled();
    expect(
      mockSupabaseWriter.getIntakeExtractionForSession,
    ).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.appendIntakeMessage).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.saveIntakeExtraction).not.toHaveBeenCalled();
  });

  it("does NOT create a listing draft in local persistence (no split-brain via local fallback)", async () => {
    await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
    const localListings = await getPersistence().listListingIntents();
    expect(localListings).toEqual([]);
  });

  it("forged authority fields cannot bypass the split-brain guard", async () => {
    // The action reads only `sessionId` from the typed payload.
    // Stuffing seller / source / capability / role flags must not
    // change the outcome.
    const forged = {
      sessionId: SESSION_UUID,
      profileId: PROFILE_UUID,
      sellerId: PROFILE_UUID,
      sellerProfileId: PROFILE_UUID,
      role: "seller",
      source: "local",
      capability: "seller",
      backendMode: "mock",
      bypass_split_brain: true,
    } as unknown as CreateIntakeListingDraftPayload;
    const r = await createIntakeListingDraftAction(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unsupported");
      expect(r.message).toBe("supabase_listing_draft_not_yet_wired");
    }
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
  });

  it("forged authority fields on append do not bypass capability/dispatch (still routes through guards)", async () => {
    // Sanity: the append action should still reach the supabase
    // writer for an authenticated seller, even when the payload
    // carries forged authority fields. This checks PR 5D did not
    // accidentally widen the guard.
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: PROFILE_UUID,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    const forged = {
      sessionId: SESSION_UUID,
      content: REPRESENTATIVE_INPUT,
      profileId: "00000000-0000-4000-8000-000000000000",
      sellerId: "00000000-0000-4000-8000-000000000000",
      role: "admin",
    } as unknown as AppendIntakeSellerMessagePayload;
    const r = await appendIntakeSellerMessageAction(forged);
    expect(r.ok).toBe(true);
    expect(mockSupabaseWriter.appendIntakeMessage).toHaveBeenCalledTimes(2);
  });
});

describe("PR 5D — supabase-mode + mock actor still fails closed (PR 3/4 contract preserved)", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: CURRENT_SELLER.id,
      displayName: CURRENT_SELLER.name,
      source: "mock",
    }));
  });

  it("createIntakeListingDraftAction returns `unauthenticated` (NOT `unsupported`)", async () => {
    // The unauthenticated gate fires BEFORE the split-brain guard,
    // so a mock actor in supabase mode keeps the existing
    // user-visible failure shape.
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
  });
});

describe("PR 5D — default mock mode behavior is unchanged end-to-end", () => {
  // No env stubbed → backend mode = "mock". Resolver passes
  // through to the real mock seller session helper.
  beforeEach(() => {
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: CURRENT_SELLER.id,
      displayName: CURRENT_SELLER.name,
      source: "mock",
    }));
  });

  it("start → append → createDraft all succeed against local persistence (no supabase writer touch)", async () => {
    const start = await startIntakeSessionAction();
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const sessionId = start.value.session.id;

    const append = await appendIntakeSellerMessageAction({
      sessionId,
      content: REPRESENTATIVE_INPUT,
    });
    expect(append.ok).toBe(true);

    const draft = await createIntakeListingDraftAction({ sessionId });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.listing.sellerId).toBe(CURRENT_SELLER.id);
    expect(draft.value.listing.status).toBe("draft");

    // The local-mode path must never touch the supabase writer.
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.appendIntakeMessage).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.saveIntakeExtraction).not.toHaveBeenCalled();
  });
});

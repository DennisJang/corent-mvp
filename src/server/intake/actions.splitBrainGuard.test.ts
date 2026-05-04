// Slice A PR 5E — full-dispatch tests for the chat intake server
// actions.
//
// PR 5D introduced a temporary `unsupported` guard for
// `createIntakeListingDraftAction` because the chat intake
// service still wrote the listing draft through `getPersistence()`
// (local-only). PR 5E externalized that path through
// `ListingDraftWriter` + `getListingDraftWriter(actor)`, so the
// guard is gone: in supabase mode + supabase actor, BOTH the
// intake side AND the listing-draft side route to Supabase
// writers in a single transaction-shape.
//
// What this file owns (PR 5E):
//   - the start / append smoke dispatch assertions in supabase
//     mode (writer is reached, local persistence untouched);
//   - the createDraft full-dispatch in supabase mode (both
//     supabase writers reached, no local persistence row created
//     on either side, listing id is uuid not `li_*`);
//   - the gate-ordering invariant: supabase mode + mock actor
//     still fails closed `unauthenticated` BEFORE either writer
//     is touched (the dispatcher decision is symmetric across
//     both writers);
//   - default mock-mode end-to-end behavior is unchanged
//     (start → append → createDraft all run against local
//     persistence with no supabase writer call);
//   - forged authority fields cannot redirect the dispatcher.
//
// `actions.backendMode.test.ts` continues to own the per-action
// dispatch decision-table tests. `actions.capability.test.ts`
// continues to own the capability-mismatch (renter-only) tests.

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

vi.mock("@/server/intake/supabaseListingDraftWriter", () => ({
  supabaseListingDraftWriter: {
    newDraftId: vi.fn(() => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    saveListingDraft: vi.fn(async () => {}),
    getListingIntent: vi.fn(async () => null),
  },
  ListingDraftWriteError: class ListingDraftWriteError extends Error {
    readonly code = "save_listing_draft_failed";
  },
}));

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { supabaseIntakeWriter } from "@/server/intake/supabaseIntakeWriter";
import { supabaseListingDraftWriter } from "@/server/intake/supabaseListingDraftWriter";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
  type AppendIntakeSellerMessagePayload,
  type CreateIntakeListingDraftPayload,
} from "@/server/intake/actions";

const mockResolver = vi.mocked(resolveServerActor);
const mockSupabaseWriter = vi.mocked(supabaseIntakeWriter);
const mockSupabaseDraftWriter = vi.mocked(supabaseListingDraftWriter);

const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";
const SESSION_UUID = "22222222-3333-4444-8555-666666666666";
const LISTING_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REPRESENTATIVE_INPUT =
  "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.";

// Reusable canonical-listing read-back the supabase listing draft
// writer returns after a successful save in these tests.
function makeReloadedDraft(opts: {
  id: string;
  sellerId: string;
}): import("@/domain/intents").ListingIntent {
  return {
    id: opts.id,
    sellerId: opts.sellerId,
    status: "draft",
    rawSellerInput: REPRESENTATIVE_INPUT,
    item: {
      name: "테라건 미니",
      category: "massage_gun",
      estimatedValue: 200000,
      condition: "lightly_used",
      components: [],
    },
    pricing: {
      oneDay: 9000,
      threeDays: 24000,
      sevenDays: 50000,
    },
    verification: {
      id: "vi_canonical",
      safetyCode: "A-001",
      status: "pending",
      checks: {
        frontPhoto: false,
        backPhoto: false,
        componentsPhoto: false,
        workingProof: false,
        safetyCodePhoto: false,
        privateSerialStored: false,
      },
    },
    createdAt: "2026-04-30T00:00:02.000Z",
    updatedAt: "2026-04-30T00:00:02.000Z",
  };
}

function clearAllSupabaseWriterMocks(): void {
  mockSupabaseWriter.saveIntakeSession.mockClear();
  mockSupabaseWriter.getIntakeSession.mockClear();
  mockSupabaseWriter.listIntakeSessions.mockClear();
  mockSupabaseWriter.appendIntakeMessage.mockClear();
  mockSupabaseWriter.listIntakeMessagesForSession.mockClear();
  mockSupabaseWriter.saveIntakeExtraction.mockClear();
  mockSupabaseWriter.getIntakeExtractionForSession.mockClear();
  mockSupabaseDraftWriter.newDraftId.mockClear();
  mockSupabaseDraftWriter.saveListingDraft.mockClear();
  mockSupabaseDraftWriter.getListingIntent.mockClear();
}

beforeEach(async () => {
  await getPersistence().clearAll();
  mockSupabaseDraftWriter.newDraftId.mockReturnValue(LISTING_UUID);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockResolver.mockReset();
  clearAllSupabaseWriterMocks();
  await getPersistence().clearAll();
});

describe("PR 5E — supabase-mode + authenticated seller actor — start/append smoke dispatch", () => {
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
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    expect(r.value.session.sellerId).toBe(PROFILE_UUID);
    expect(r.value.session.sellerId).not.toBe(CURRENT_SELLER.id);
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
    expect(mockSupabaseWriter.appendIntakeMessage).toHaveBeenCalledTimes(2);
    expect(mockSupabaseWriter.saveIntakeExtraction).toHaveBeenCalledTimes(1);
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
  });
});

describe("PR 5E — supabase-mode + authenticated seller actor — createDraft full dispatch", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "supabase",
    }));
    mockSupabaseWriter.getIntakeSession.mockResolvedValueOnce({
      id: SESSION_UUID,
      sellerId: PROFILE_UUID,
      status: "drafting",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    });
    mockSupabaseWriter.listIntakeMessagesForSession.mockResolvedValueOnce([
      {
        id: "msg_1",
        sessionId: SESSION_UUID,
        role: "seller",
        content: REPRESENTATIVE_INPUT,
        createdAt: "2026-04-30T00:00:01.000Z",
      },
    ]);
    mockSupabaseWriter.getIntakeExtractionForSession.mockResolvedValueOnce(null);
    mockSupabaseDraftWriter.getListingIntent.mockResolvedValueOnce(
      makeReloadedDraft({ id: LISTING_UUID, sellerId: PROFILE_UUID }),
    );
  });

  it("creates a draft routing through both supabase writers; no local persistence touch", async () => {
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Listing side dispatched to supabase listing draft writer.
    expect(mockSupabaseDraftWriter.newDraftId).toHaveBeenCalledTimes(1);
    expect(mockSupabaseDraftWriter.saveListingDraft).toHaveBeenCalledTimes(1);
    expect(mockSupabaseDraftWriter.getListingIntent).toHaveBeenCalledWith(
      LISTING_UUID,
    );

    // Intake side dispatched to supabase intake writer.
    expect(mockSupabaseWriter.getIntakeSession).toHaveBeenCalledWith(
      SESSION_UUID,
    );
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);

    // Listing values mirror what the supabase read-back returned.
    expect(r.value.listing.id).toBe(LISTING_UUID);
    expect(r.value.listing.status).toBe("draft");
    expect(r.value.listing.sellerId).toBe(PROFILE_UUID);
    // Session pointer matches the canonical id.
    expect(r.value.session.listingIntentId).toBe(LISTING_UUID);

    // No local persistence touch.
    const localSessions = await getPersistence().listIntakeSessions();
    expect(localSessions).toEqual([]);
    const localListings = await getPersistence().listListingIntents();
    expect(localListings).toEqual([]);
  });

  it("listing id is a well-formed uuid (not `li_*`) when the supabase writer is dispatched", async () => {
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.listing.id.startsWith("li_")).toBe(false);
    // Standard 8-4-4-4-12 hex shape — same regex the marketplace
    // validator enforces server-side.
    expect(r.value.listing.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("the persisted draft is `status: \"draft\"`, never `approved`, never publicly readable", async () => {
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.listing.status).toBe("draft");
    expect(r.value.listing.status).not.toBe("approved");
    // The writer was called with status "ai_extracted" (from
    // draftFromInput) or "draft" (from saveDraft transition).
    // Either way the supabase listing draft writer mirrors the
    // ai_extracted → draft transition explicitly, so the row that
    // would land in supabase is `'draft'`.
    const draftPersisted = mockSupabaseDraftWriter.saveListingDraft.mock
      .calls[0][0];
    expect(["ai_extracted", "draft"]).toContain(draftPersisted.status);
    expect(draftPersisted.status).not.toBe("approved");
    expect(draftPersisted.sellerId).toBe(PROFILE_UUID);
  });

  it("forged authority fields cannot bypass dispatcher / change writer destination", async () => {
    // The action reads only `sessionId` from the typed payload.
    // Stuffing seller / source / capability / role flags must
    // not change the outcome — and especially must not redirect
    // the listing-draft save away from the supabase writer.
    const forged = {
      sessionId: SESSION_UUID,
      profileId: PROFILE_UUID,
      sellerId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      sellerProfileId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      role: "seller",
      source: "local",
      capability: "seller",
      backendMode: "mock",
      forceLocalListing: true,
      bypass_split_brain: true,
      id: "li_attacker_local",
    } as unknown as CreateIntakeListingDraftPayload;
    const r = await createIntakeListingDraftAction(forged);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The listing was saved through the supabase listing writer
    // (NOT redirected by the forged `forceLocalListing` /
    // `backendMode: "mock"` fields).
    expect(mockSupabaseDraftWriter.saveListingDraft).toHaveBeenCalledTimes(1);
    // The seller id is the resolved actor's id, NOT the forged
    // payload value.
    expect(r.value.listing.sellerId).toBe(PROFILE_UUID);
    expect(r.value.listing.sellerId).not.toBe(
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    );
    // The id is the writer-generated uuid, NOT the forged
    // `li_attacker_local` value.
    expect(r.value.listing.id).toBe(LISTING_UUID);
    expect(r.value.listing.id).not.toBe("li_attacker_local");
  });

  it("forged authority fields on append do not bypass capability/dispatch (still routes through guards)", async () => {
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

describe("PR 5E — supabase-mode + mock actor still fails closed (gate-ordering preserved)", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: CURRENT_SELLER.id,
      displayName: CURRENT_SELLER.name,
      source: "mock",
    }));
  });

  it("createIntakeListingDraftAction returns `unauthenticated` BEFORE either writer is touched", async () => {
    const r = await createIntakeListingDraftAction({ sessionId: SESSION_UUID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unauthenticated");
      expect(r.message).toBe("supabase_mode_requires_auth_bound_actor");
    }
    // Both supabase writer dispatchers must short-circuit on the
    // mock-actor row.
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseDraftWriter.saveListingDraft).not.toHaveBeenCalled();
    expect(mockSupabaseDraftWriter.newDraftId).not.toHaveBeenCalled();
  });
});

describe("PR 5E — default mock mode behavior is unchanged end-to-end", () => {
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
    // Local mode keeps `li_<16hex>` ids; uuid format is for
    // supabase only.
    expect(draft.value.listing.id.startsWith("li_")).toBe(true);
    // Session pointer matches local id.
    expect(draft.value.session.listingIntentId).toBe(draft.value.listing.id);

    // No supabase writer call on either side in mock mode.
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.appendIntakeMessage).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.saveIntakeExtraction).not.toHaveBeenCalled();
    expect(mockSupabaseDraftWriter.saveListingDraft).not.toHaveBeenCalled();
    expect(mockSupabaseDraftWriter.newDraftId).not.toHaveBeenCalled();
    expect(mockSupabaseDraftWriter.getListingIntent).not.toHaveBeenCalled();
  });

  it("createDraft re-call is idempotent — no second listing row, same id returned", async () => {
    const start = await startIntakeSessionAction();
    if (!start.ok) return;
    const sessionId = start.value.session.id;
    await appendIntakeSellerMessageAction({
      sessionId,
      content: REPRESENTATIVE_INPUT,
    });
    const a = await createIntakeListingDraftAction({ sessionId });
    const b = await createIntakeListingDraftAction({ sessionId });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.listing.id).toBe(a.value.listing.id);
      expect(b.value.session.listingIntentId).toBe(a.value.listing.id);
    }
    // Only one persisted listing in local storage.
    const local = await getPersistence().listListingIntents();
    expect(local).toHaveLength(1);
  });
});

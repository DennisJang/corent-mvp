// Closed-alpha capability semantics for the chat intake server
// actions (Slice A PR 5A).
//
// Scope is narrower than `actions.backendMode.test.ts` — that file
// owns the supabase-mode dispatch / fail-closed shape against a
// mock-sourced actor. This file owns the *capability* rules that
// land in PR 5A:
//
//   - A supabase-sourced **seller** actor (seller_profiles row exists)
//     reaches the dispatcher and the action returns `ok: true`.
//   - A supabase-sourced **renter** actor (borrower_profiles only)
//     hits the action's `expectedActorKind: "seller"` gate and the
//     action returns a typed `ownership` error — the writer is never
//     called.
//   - A supabase-sourced seller actor representing a profile with
//     **both** capabilities still resolves as seller for seller
//     intake (the resolver's prefer="seller" branch is what produces
//     the seller actor here; the action just trusts the resolver's
//     output).
//   - Forged payload fields (`profileId`, `sellerProfileId`, `role`,
//     `source`, `capability`, …) cannot grant seller access. The
//     action reads only the typed payload keys it expects; the
//     resolver returns the actor regardless of what the caller
//     sent.
//
// The supabase writer is mocked at the module level so we can
// observe whether dispatch reached it without standing up a real
// Supabase client.

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
const OTHER_UUID = "99999999-8888-4777-8666-555555555555";
const REPRESENTATIVE_INPUT =
  "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.";

beforeEach(async () => {
  await getPersistence().clearAll();
  vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
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

describe("intake actions — closed-alpha capability resolution", () => {
  it("supabase-sourced seller actor (seller_profiles row exists) reaches the dispatcher and starts the session", async () => {
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "supabase",
    }));
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.session.sellerId).toBe(PROFILE_UUID);
    // sellerId on the persisted session is the profile UUID, not
    // the legacy `seller_jisu` mock id.
    expect(r.value.session.sellerId).not.toBe(CURRENT_SELLER.id);
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
  });

  it("supabase-sourced renter actor (borrower_profiles only) cannot perform seller intake — typed ownership", async () => {
    mockResolver.mockImplementation(async () => ({
      kind: "renter",
      borrowerId: PROFILE_UUID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    }));
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ownership");
    }
    // Writer never reached.
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
  });

  it("appendIntakeSellerMessageAction fails closed for a renter-capability actor", async () => {
    mockResolver.mockImplementation(async () => ({
      kind: "renter",
      borrowerId: PROFILE_UUID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    }));
    const r = await appendIntakeSellerMessageAction({
      sessionId: PROFILE_UUID,
      content: REPRESENTATIVE_INPUT,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ownership");
    }
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.appendIntakeMessage).not.toHaveBeenCalled();
  });

  it("createIntakeListingDraftAction fails closed for a renter-capability actor", async () => {
    mockResolver.mockImplementation(async () => ({
      kind: "renter",
      borrowerId: PROFILE_UUID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    }));
    const r = await createIntakeListingDraftAction({
      sessionId: PROFILE_UUID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ownership");
    }
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
  });

  it("dual-capability profile (resolver returns seller for prefer=seller) reaches the dispatcher", async () => {
    // The resolver's prefer="seller" branch already returned a
    // seller actor for the dual-capability case (covered in
    // `resolveServerActor.test.ts`). The action layer just trusts
    // that resolver output.
    mockResolver.mockImplementation(async () => ({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "셀러쪽",
      source: "supabase",
    }));
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.session.sellerId).toBe(PROFILE_UUID);
    expect(mockSupabaseWriter.saveIntakeSession).toHaveBeenCalledTimes(1);
  });
});

describe("intake actions — forged payload cannot grant seller access", () => {
  // The action reads only the typed payload keys (`sessionId`,
  // `content`). Any other field is ignored at the runtime call site;
  // the resolver's output is the only source of `sellerId` and
  // `source`. These tests synthesize a renter actor and verify that
  // even a payload stuffed with seller-claiming fields does NOT flip
  // the action's outcome.

  beforeEach(() => {
    mockResolver.mockImplementation(async () => ({
      kind: "renter",
      borrowerId: PROFILE_UUID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    }));
  });

  it("forged profileId / sellerId / sellerProfileId / role / source / capability fields do not grant access on append", async () => {
    const forged = {
      sessionId: PROFILE_UUID,
      content: REPRESENTATIVE_INPUT,
      profileId: OTHER_UUID,
      sellerId: OTHER_UUID,
      sellerProfileId: OTHER_UUID,
      role: "seller",
      source: "supabase",
      capability: "seller",
      hasSeller: true,
      kind: "seller",
    } as unknown as AppendIntakeSellerMessagePayload;
    const r = await appendIntakeSellerMessageAction(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ownership");
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
    expect(mockSupabaseWriter.appendIntakeMessage).not.toHaveBeenCalled();
  });

  it("forged authority fields do not grant access on createIntakeListingDraft", async () => {
    const forged = {
      sessionId: PROFILE_UUID,
      profileId: OTHER_UUID,
      sellerId: OTHER_UUID,
      sellerProfileId: OTHER_UUID,
      role: "seller",
      source: "supabase",
      capability: "seller",
    } as unknown as CreateIntakeListingDraftPayload;
    const r = await createIntakeListingDraftAction(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ownership");
    expect(mockSupabaseWriter.getIntakeSession).not.toHaveBeenCalled();
  });

  it("forged authority fields do not grant access on startIntakeSession (no payload field can flip the gate)", async () => {
    // startIntakeSessionAction takes no payload; we still confirm the
    // gate fires for completeness so the closed-alpha contract is
    // explicit at all three call sites.
    const r = await startIntakeSessionAction();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("ownership");
    expect(mockSupabaseWriter.saveIntakeSession).not.toHaveBeenCalled();
  });
});

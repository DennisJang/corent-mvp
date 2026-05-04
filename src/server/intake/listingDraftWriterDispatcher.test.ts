// Unit tests for the listing-draft writer dispatcher (Slice A
// PR 5E).
//
// Pure decision-table tests over `(getBackendMode(), actor.source)`.
// Mirrors `intakeWriterDispatcher.test.ts` cell-for-cell so a
// future drift between the two dispatchers is loud — they MUST
// remain symmetric to prevent re-introducing the split-brain hole
// PR 5D placeholdered.

import { afterEach, describe, expect, it, vi } from "vitest";

import { localListingDraftWriter } from "@/lib/intake/listingDraftWriter";
import type { ServerActor } from "@/server/actors/resolveServerActor";
import { getListingDraftWriter } from "@/server/intake/listingDraftWriterDispatcher";
import { supabaseListingDraftWriter } from "@/server/intake/supabaseListingDraftWriter";
import { getIntakeWriter } from "@/server/intake/intakeWriterDispatcher";

const SELLER_UUID = "11111111-2222-4333-8444-555555555555";
const BORROWER_UUID = "22222222-2222-4333-8444-555555555555";

function mockSeller(source: ServerActor["source"]): ServerActor {
  return {
    kind: "seller",
    sellerId: SELLER_UUID,
    displayName: "DEMO 셀러",
    source,
  };
}

function mockRenter(source: ServerActor["source"]): ServerActor {
  return {
    kind: "renter",
    borrowerId: BORROWER_UUID,
    displayName: "DEMO 빌리는사람",
    source,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getListingDraftWriter — mock / default mode", () => {
  it("returns localListingDraftWriter when CORENT_BACKEND_MODE is unset", () => {
    expect(getListingDraftWriter(mockSeller("mock"))).toBe(
      localListingDraftWriter,
    );
  });

  it("returns localListingDraftWriter when mode is explicitly 'mock'", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    expect(getListingDraftWriter(mockSeller("mock"))).toBe(
      localListingDraftWriter,
    );
  });

  it("returns localListingDraftWriter when mode is an unknown / garbage value", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "totally-bogus");
    expect(getListingDraftWriter(mockSeller("mock"))).toBe(
      localListingDraftWriter,
    );
  });

  it("returns localListingDraftWriter regardless of actor source in mock mode", () => {
    expect(getListingDraftWriter(mockSeller("supabase"))).toBe(
      localListingDraftWriter,
    );
    expect(getListingDraftWriter(mockRenter("supabase"))).toBe(
      localListingDraftWriter,
    );
  });
});

describe("getListingDraftWriter — supabase mode", () => {
  it("returns null for a mock-sourced actor (caller must fail closed)", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getListingDraftWriter(mockSeller("mock"))).toBeNull();
    expect(getListingDraftWriter(mockRenter("mock"))).toBeNull();
  });

  it("returns supabaseListingDraftWriter for a supabase-sourced actor", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getListingDraftWriter(mockSeller("supabase"))).toBe(
      supabaseListingDraftWriter,
    );
  });

  it("returns supabaseListingDraftWriter for a supabase-sourced renter as well (the dispatcher does not gate on kind)", () => {
    // Capability mismatch is enforced by the action layer's
    // `expectedActorKind: "seller"` gate, NOT by the dispatcher.
    // The dispatcher's only job is the (mode, source) decision.
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getListingDraftWriter(mockRenter("supabase"))).toBe(
      supabaseListingDraftWriter,
    );
  });
});

describe("getListingDraftWriter — symmetry with getIntakeWriter (PR 5E invariant)", () => {
  // The two dispatchers MUST be symmetric: a null on one side
  // must coincide with a null on the other, and vice versa. Any
  // drift would re-introduce a split-brain possibility (PR 5D).
  // The sample set here covers every cell in the joint table.

  it("mock-mode + mock-actor: both return their local writer (non-null)", () => {
    expect(getIntakeWriter(mockSeller("mock"))).not.toBeNull();
    expect(getListingDraftWriter(mockSeller("mock"))).not.toBeNull();
  });

  it("mock-mode + supabase-actor: both return their local writer (non-null)", () => {
    expect(getIntakeWriter(mockSeller("supabase"))).not.toBeNull();
    expect(getListingDraftWriter(mockSeller("supabase"))).not.toBeNull();
  });

  it("supabase-mode + mock-actor: both return null", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getIntakeWriter(mockSeller("mock"))).toBeNull();
    expect(getListingDraftWriter(mockSeller("mock"))).toBeNull();
  });

  it("supabase-mode + supabase-actor: both return their supabase writer (non-null)", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getIntakeWriter(mockSeller("supabase"))).not.toBeNull();
    expect(getListingDraftWriter(mockSeller("supabase"))).not.toBeNull();
  });
});

describe("getListingDraftWriter — identity invariants", () => {
  it("local and supabase writer are not the same object", () => {
    expect(localListingDraftWriter).not.toBe(supabaseListingDraftWriter);
  });

  it("dispatcher ignores forged actor fields beyond `kind` / `source`", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    const forged = {
      ...mockSeller("supabase"),
      forceLocalListing: true,
      backendMode: "mock",
      bypassDispatch: true,
    } as unknown as ServerActor;
    expect(getListingDraftWriter(forged)).toBe(supabaseListingDraftWriter);
  });
});

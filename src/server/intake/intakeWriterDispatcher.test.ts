// Unit tests for the chat intake writer dispatcher.
//
// The dispatcher is a pure function over `(getBackendMode(),
// actor.source)`. These tests cover every cell of its decision
// table without touching any persistence — neither `getPersistence()`
// nor the Supabase repository is exercised here. The test asserts
// identity-of-writer (which constant got returned) rather than
// behavior; behavior is covered by `actions.backendMode.test.ts`.

import { afterEach, describe, expect, it, vi } from "vitest";

import { localIntakeWriter } from "@/lib/intake/intakeWriter";
import type { ServerActor } from "@/server/actors/resolveServerActor";
import { getIntakeWriter } from "@/server/intake/intakeWriterDispatcher";
import { supabaseIntakeWriter } from "@/server/intake/supabaseIntakeWriter";

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

describe("getIntakeWriter — mock / default mode", () => {
  it("returns localIntakeWriter when CORENT_BACKEND_MODE is unset", () => {
    expect(getIntakeWriter(mockSeller("mock"))).toBe(localIntakeWriter);
  });

  it("returns localIntakeWriter when mode is explicitly 'mock'", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    expect(getIntakeWriter(mockSeller("mock"))).toBe(localIntakeWriter);
  });

  it("returns localIntakeWriter when mode is an unknown / garbage value", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "totally-bogus");
    expect(getIntakeWriter(mockSeller("mock"))).toBe(localIntakeWriter);
  });

  it("returns localIntakeWriter regardless of actor source in mock mode", () => {
    // The mock-mode + supabase-actor row is unreachable from
    // production today (resolver always returns mock), but the
    // dispatcher's contract still says: in mock mode, every actor
    // gets the local writer. Keeps the demo predictable.
    expect(getIntakeWriter(mockSeller("supabase"))).toBe(localIntakeWriter);
    expect(getIntakeWriter(mockRenter("supabase"))).toBe(localIntakeWriter);
  });
});

describe("getIntakeWriter — supabase mode", () => {
  it("returns null when actor is mock-sourced (the safety gate)", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getIntakeWriter(mockSeller("mock"))).toBeNull();
    expect(getIntakeWriter(mockRenter("mock"))).toBeNull();
  });

  it("returns supabaseIntakeWriter when actor is supabase-sourced", () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getIntakeWriter(mockSeller("supabase"))).toBe(supabaseIntakeWriter);
  });

  it("returns supabaseIntakeWriter for a supabase-sourced renter as well", () => {
    // The dispatcher does not narrow on actor.kind; that's the
    // action layer's concern. Keep the dispatcher thin.
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    expect(getIntakeWriter(mockRenter("supabase"))).toBe(supabaseIntakeWriter);
  });
});

describe("getIntakeWriter — invariants", () => {
  it("never returns the same writer for both safe and unsafe combinations", () => {
    // Sanity check: localIntakeWriter and supabaseIntakeWriter are
    // distinct identities. A future refactor that aliases them
    // would silently weaken every dispatcher decision; this test
    // catches that.
    expect(localIntakeWriter).not.toBe(supabaseIntakeWriter);
  });

  it("the dispatcher's only inputs are mode and actor.source — no payload field reads", () => {
    // Synthesize a "supabase actor" with extra payload-like fields
    // and confirm the dispatcher does not branch on them.
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    const forged = {
      ...mockSeller("supabase"),
      // Fields a forged caller might attach. The dispatcher's
      // signature does not read these, so they are runtime no-ops.
      adminId: "admin_attacker",
      role: "admin",
      trustScore: 9999,
    } as unknown as ServerActor;
    expect(getIntakeWriter(forged)).toBe(supabaseIntakeWriter);
  });
});

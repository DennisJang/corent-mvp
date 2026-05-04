// Tests for the chat-intake mode probe (Slice A PR 5F).
//
// The probe is a thin function over (`getBackendMode()`,
// `resolveServerActor({prefer:"seller"})`). We mock the resolver
// at the module level and stub `CORENT_BACKEND_MODE` via vi.stubEnv
// so the test does not require a real Supabase client.
//
// Coverage:
//   - mock backend mode → { mode: "local" } regardless of actor
//   - supabase backend mode + null actor → { mode: "local" }
//   - supabase backend mode + mock-sourced actor → { mode: "local" }
//     (defense in depth: the resolver should never mint a
//      mock-sourced actor in supabase mode, but the probe
//      re-checks)
//   - supabase backend mode + supabase seller actor → server/seller
//   - supabase backend mode + supabase renter actor → server/renter
//   - return value never carries PII (no email / id / source)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { getChatIntakeModeAction } from "./getChatIntakeMode";

const mockResolver = vi.mocked(resolveServerActor);

const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mockResolver.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getChatIntakeModeAction — mock / default backend mode", () => {
  it("returns mode: local when CORENT_BACKEND_MODE is unset", async () => {
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it("returns mode: local when mode is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it("returns mode: local for any unknown / garbage env value", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "totally-bogus");
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
    expect(mockResolver).not.toHaveBeenCalled();
  });
});

describe("getChatIntakeModeAction — supabase mode + non-supabase actor", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns mode: local when the resolver returns null (no auth, no profile, no capability)", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
  });

  it("returns mode: local when the resolver returns a mock-sourced actor (defense in depth)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
  });

  it("returns mode: local for an admin actor (not part of chat intake)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "admin",
      adminId: PROFILE_UUID,
      displayName: "founder",
      source: "supabase",
    });
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "local" });
  });
});

describe("getChatIntakeModeAction — supabase mode + supabase actor", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns server/seller for a supabase-sourced seller actor", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "server", capability: "seller" });
  });

  it("returns server/renter for a supabase-sourced renter actor (resolver under prefer=seller for borrower-only profile)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: PROFILE_UUID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    const r = await getChatIntakeModeAction();
    expect(r).toEqual({ mode: "server", capability: "renter" });
  });

  it("calls the resolver with prefer=seller (chat intake is seller-side)", async () => {
    mockResolver.mockResolvedValueOnce(null);
    await getChatIntakeModeAction();
    expect(mockResolver).toHaveBeenCalledWith({ prefer: "seller" });
  });
});

describe("getChatIntakeModeAction — return value carries no PII", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("the server/seller response shape contains only `mode` and `capability` keys", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: PROFILE_UUID,
      displayName: "personal name should not leak",
      source: "supabase",
    });
    const r = await getChatIntakeModeAction();
    expect(Object.keys(r).sort()).toEqual(["capability", "mode"]);
    const blob = JSON.stringify(r);
    expect(blob).not.toContain(PROFILE_UUID);
    expect(blob).not.toContain("personal name");
    expect(blob).not.toContain("supabase"); // no actor.source surfaced
  });

  it("the local response shape contains only the `mode` key", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await getChatIntakeModeAction();
    expect(Object.keys(r)).toEqual(["mode"]);
  });
});

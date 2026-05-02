// Tests for the closed-alpha actor resolver (Slice A PR 5A).
//
// Two branches:
//
//   - **Mock branch**: default behavior is unchanged from pre-PR-5A.
//     `getMockSellerSession()` is the source of truth and the actor's
//     `source` is `"mock"`. The browser demo continues to work without
//     auth. We assert this branch via the real implementation; no
//     mocks of the supabase modules are needed because `getBackendMode()`
//     short-circuits to "mock" when the env is absent.
//
//   - **Supabase branch**: kicks in when `CORENT_BACKEND_MODE=supabase`.
//     The resolver reads the SSR session via `createAdminAuthClient`
//     and looks up profile / capability rows via
//     `lookupProfileCapabilities`. Both modules are mocked at the
//     module level so the test runs without any real Supabase client.
//
// What we verify in the supabase branch:
//   - no SSR auth client → null (env missing)
//   - `auth.getUser()` error → null
//   - no auth user id → null
//   - no `profiles` row → null
//   - profile + no capability row → null (closed-alpha fail-closed)
//   - profile + seller_profiles → seller actor with `source: "supabase"`
//   - profile + borrower_profiles only → renter actor (so a
//     downstream `expectedActorKind: "seller"` cleanly maps to
//     ownership rather than unauthenticated)
//   - profile + both capabilities → seller actor when prefer="seller"
//     (default), renter actor when prefer="renter"
//   - prefer="renter" with seller-only profile → seller actor
//   - capability-row display name precedence over profile-level
//     display name; placeholder used when neither is set

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_SELLER } from "@/data/mockSellers";

// Mock the SSR auth client and the profile lookup BEFORE the
// resolver module is imported; vitest hoists `vi.mock` calls.
vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => null),
}));

vi.mock("@/server/actors/profileLookup", () => ({
  lookupProfileCapabilities: vi.fn(async () => null),
}));

import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { lookupProfileCapabilities } from "@/server/actors/profileLookup";
import { resolveServerActor } from "@/server/actors/resolveServerActor";

const mockCreateAdminAuthClient = vi.mocked(createAdminAuthClient);
const mockLookupProfileCapabilities = vi.mocked(lookupProfileCapabilities);

const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";

type FakeAuthUser = { id: string; email?: string };

function fakeAuthClient(opts: {
  user?: FakeAuthUser | null;
  error?: { message: string } | null;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.user ?? null },
        error: opts.error ?? null,
      })),
    },
  };
}

beforeEach(() => {
  mockCreateAdminAuthClient.mockReset();
  mockLookupProfileCapabilities.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveServerActor — mock branch (default)", () => {
  it("returns the mock seller session when CORENT_BACKEND_MODE is unset", async () => {
    const actor = await resolveServerActor();
    expect(actor).not.toBeNull();
    if (!actor) return;
    expect(actor.kind).toBe("seller");
    expect(actor.source).toBe("mock");
    if (actor.kind === "seller") {
      expect(actor.sellerId).toBe(CURRENT_SELLER.id);
      expect(actor.displayName).toBe(CURRENT_SELLER.name);
    }
    // Mock branch must not consult either supabase helper.
    expect(mockCreateAdminAuthClient).not.toHaveBeenCalled();
    expect(mockLookupProfileCapabilities).not.toHaveBeenCalled();
  });

  it("ignores the prefer option in mock branch (still seller)", async () => {
    const actor = await resolveServerActor({ prefer: "renter" });
    expect(actor?.kind).toBe("seller");
    expect(actor?.source).toBe("mock");
  });

  it("treats explicit CORENT_BACKEND_MODE=mock identically to unset", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const actor = await resolveServerActor();
    expect(actor?.source).toBe("mock");
    expect(mockCreateAdminAuthClient).not.toHaveBeenCalled();
  });

  it("garbage env value falls back to mock", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "totally-bogus");
    const actor = await resolveServerActor();
    expect(actor?.source).toBe("mock");
    expect(mockCreateAdminAuthClient).not.toHaveBeenCalled();
  });
});

describe("resolveServerActor — supabase branch fail-closed paths", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns null when the SSR auth client cannot be created (env missing)", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(null);
    const actor = await resolveServerActor();
    expect(actor).toBeNull();
    expect(mockLookupProfileCapabilities).not.toHaveBeenCalled();
  });

  it("returns null when auth.getUser errors", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(
      fakeAuthClient({
        user: null,
        error: { message: "jwt invalid" },
      }) as never,
    );
    const actor = await resolveServerActor();
    expect(actor).toBeNull();
    expect(mockLookupProfileCapabilities).not.toHaveBeenCalled();
  });

  it("returns null when there is no auth user", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(
      fakeAuthClient({ user: null }) as never,
    );
    const actor = await resolveServerActor();
    expect(actor).toBeNull();
    expect(mockLookupProfileCapabilities).not.toHaveBeenCalled();
  });

  it("returns null when the auth user has no profiles row (no auto-create)", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(
      fakeAuthClient({ user: { id: PROFILE_UUID } }) as never,
    );
    mockLookupProfileCapabilities.mockResolvedValueOnce(null);
    const actor = await resolveServerActor();
    expect(actor).toBeNull();
    expect(mockLookupProfileCapabilities).toHaveBeenCalledWith(PROFILE_UUID);
  });

  it("returns null when the profile has neither seller nor borrower capability under prefer=seller", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(
      fakeAuthClient({ user: { id: PROFILE_UUID } }) as never,
    );
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: false,
      hasBorrower: false,
      sellerDisplayName: null,
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor({ prefer: "seller" });
    expect(actor).toBeNull();
  });

  it("returns null when the profile has neither capability under prefer=renter", async () => {
    mockCreateAdminAuthClient.mockResolvedValueOnce(
      fakeAuthClient({ user: { id: PROFILE_UUID } }) as never,
    );
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: null,
      hasSeller: false,
      hasBorrower: false,
      sellerDisplayName: null,
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor({ prefer: "renter" });
    expect(actor).toBeNull();
  });
});

describe("resolveServerActor — supabase branch capability resolution", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockCreateAdminAuthClient.mockResolvedValue(
      fakeAuthClient({ user: { id: PROFILE_UUID } }) as never,
    );
  });

  it("seller capability under default prefer resolves to a seller actor with source=supabase", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: "DEMO 셀러",
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor();
    expect(actor).not.toBeNull();
    if (!actor) return;
    expect(actor.kind).toBe("seller");
    expect(actor.source).toBe("supabase");
    if (actor.kind === "seller") {
      expect(actor.sellerId).toBe(PROFILE_UUID);
      expect(actor.displayName).toBe("DEMO 셀러");
    }
  });

  it("borrower-only profile under prefer=seller resolves to a renter actor (downstream maps to ownership)", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: false,
      hasBorrower: true,
      sellerDisplayName: null,
      borrowerDisplayName: "DEMO 빌리는사람",
    });
    const actor = await resolveServerActor({ prefer: "seller" });
    expect(actor).not.toBeNull();
    if (!actor) return;
    expect(actor.kind).toBe("renter");
    expect(actor.source).toBe("supabase");
    if (actor.kind === "renter") {
      expect(actor.borrowerId).toBe(PROFILE_UUID);
      expect(actor.displayName).toBe("DEMO 빌리는사람");
    }
  });

  it("dual-capability profile resolves seller under prefer=seller", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: true,
      hasBorrower: true,
      sellerDisplayName: "셀러쪽",
      borrowerDisplayName: "빌리는쪽",
    });
    const actor = await resolveServerActor({ prefer: "seller" });
    expect(actor?.kind).toBe("seller");
    if (actor?.kind === "seller") {
      expect(actor.sellerId).toBe(PROFILE_UUID);
      expect(actor.displayName).toBe("셀러쪽");
    }
  });

  it("dual-capability profile resolves renter under prefer=renter", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: true,
      hasBorrower: true,
      sellerDisplayName: "셀러쪽",
      borrowerDisplayName: "빌리는쪽",
    });
    const actor = await resolveServerActor({ prefer: "renter" });
    expect(actor?.kind).toBe("renter");
    if (actor?.kind === "renter") {
      expect(actor.borrowerId).toBe(PROFILE_UUID);
      expect(actor.displayName).toBe("빌리는쪽");
    }
  });

  it("seller-only profile under prefer=renter falls back to seller actor", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: "셀러쪽",
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor({ prefer: "renter" });
    expect(actor?.kind).toBe("seller");
    if (actor?.kind === "seller") {
      expect(actor.sellerId).toBe(PROFILE_UUID);
    }
  });

  it("falls back to profile-level display name when capability row has no display_name", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "프로필이름",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: null,
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor({ prefer: "seller" });
    expect(actor?.displayName).toBe("프로필이름");
  });

  it("falls back to a stable Korean placeholder when both display names are null", async () => {
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: null,
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: null,
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor({ prefer: "seller" });
    expect(actor?.displayName).toBe("셀러");
  });

  it("the resolver never reads the auth user's email", async () => {
    const fake = fakeAuthClient({
      user: {
        id: PROFILE_UUID,
        email: "should-not-leak@example.com",
      },
    });
    mockCreateAdminAuthClient.mockResolvedValueOnce(fake as never);
    mockLookupProfileCapabilities.mockResolvedValueOnce({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: "셀러쪽",
      borrowerDisplayName: null,
    });
    const actor = await resolveServerActor();
    expect(JSON.stringify(actor)).not.toContain("should-not-leak");
  });
});

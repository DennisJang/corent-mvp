// Tests for the seller dashboard server-mode listings action
// (Slice A PR 5G).
//
// The action is a thin wrapper over `runIntentCommand` +
// `listListingsBySeller`. We mock the actor resolver and the repo
// at the module level so the test does not require Supabase env
// or a real DB. Coverage:
//
//   - mock backend mode → `{ mode: "local" }` regardless of actor
//   - supabase backend mode + null actor → `unauthenticated`
//   - supabase backend mode + mock-sourced seller actor → `{ mode: "local" }`
//     (defense in depth: the resolver should never mint a
//      mock-sourced actor in supabase mode, but the action
//      re-checks before issuing a service-role read)
//   - supabase backend mode + supabase renter actor → `ownership`
//   - supabase backend mode + supabase seller actor → `{ mode: "server", listings: [...] }`
//   - the repo is invoked with the SERVER actor's seller id, not a
//     forged `actorSellerId` field on the payload
//   - DTO is a tight allowlist (no rawSellerInput, no verification.*,
//     no privateSerialNumber)
//   - DB throw → typed `internal` (no stack / table names leak)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingIntent } from "@/domain/intents";

vi.mock("@/server/actors/resolveServerActor", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/actors/resolveServerActor")
  >("@/server/actors/resolveServerActor");
  return {
    ...actual,
    resolveServerActor: vi.fn(actual.resolveServerActor),
  };
});

vi.mock("@/server/persistence/supabase/listingRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/listingRepository")
  >("@/server/persistence/supabase/listingRepository");
  return {
    ...actual,
    listListingsBySeller: vi.fn(async () => []),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { listListingsBySeller } from "@/server/persistence/supabase/listingRepository";
import { listSellerOwnedListingsAction } from "./listSellerOwnedListings";

const mockResolver = vi.mocked(resolveServerActor);
const mockListBySeller = vi.mocked(listListingsBySeller);

const SELLER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_SELLER = "99999999-2222-4333-8444-555555555555";

function listingFixture(overrides: Partial<ListingIntent> = {}): ListingIntent {
  return {
    id: "44444444-2222-4333-8444-777777777777",
    sellerId: SELLER_ID,
    status: "draft",
    rawSellerInput: "DEMO 셀러 원본 메모 (절대 노출 금지)",
    item: {
      name: "테스트 마사지건",
      category: "massage_gun",
      estimatedValue: 200000,
      condition: "lightly_used",
      components: ["본체"],
      defects: undefined,
      privateSerialNumber: "SN-SECRET-12345",
      pickupArea: "마포구",
    },
    pricing: {
      oneDay: 8000,
      threeDays: 21000,
      sevenDays: 39000,
      sellerAdjusted: false,
    },
    verification: {
      id: "55555555-2222-4333-8444-888888888888",
      safetyCode: "B-123",
      status: "pending",
      checks: {
        frontPhoto: false,
        backPhoto: false,
        componentsPhoto: false,
        workingProof: false,
        safetyCodePhoto: false,
        privateSerialStored: false,
      },
      humanReviewNotes: ["내부 메모 — 외부 노출 금지"],
    },
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockResolver.mockReset();
  mockListBySeller.mockReset();
  mockListBySeller.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listSellerOwnedListingsAction — mock / default backend mode", () => {
  it("returns mode: local when CORENT_BACKEND_MODE is unset (regardless of actor)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListBySeller).not.toHaveBeenCalled();
  });

  it("returns mode: local when mode is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListBySeller).not.toHaveBeenCalled();
  });
});

describe("listSellerOwnedListingsAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns unauthenticated when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockListBySeller).not.toHaveBeenCalled();
  });

  it("returns mode: local for a mock-sourced seller actor (defense in depth)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListBySeller).not.toHaveBeenCalled();
  });

  it("returns ownership for a supabase-sourced renter actor under prefer=seller", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: SELLER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
    expect(mockListBySeller).not.toHaveBeenCalled();
  });

  it("returns mode: server with the seller's listings DTO for a supabase seller actor", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    mockListBySeller.mockResolvedValueOnce([
      listingFixture({ id: "44444444-2222-4333-8444-777777777777" }),
      listingFixture({
        id: "44444444-2222-4333-8444-aaaaaaaaaaaa",
        status: "human_review_pending",
      }),
    ]);
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.value.mode !== "server") {
      throw new Error(`expected mode=server, got ${r.value.mode}`);
    }
    expect(r.value.listings).toHaveLength(2);
    expect(r.value.listings[0]?.id).toBe(
      "44444444-2222-4333-8444-777777777777",
    );
    expect(r.value.listings[0]?.itemName).toBe("테스트 마사지건");
    expect(r.value.listings[0]?.status).toBe("draft");
    expect(r.value.listings[0]?.category).toBe("massage_gun");
    expect(r.value.listings[0]?.prices).toEqual({
      oneDay: 8000,
      threeDays: 21000,
      sevenDays: 39000,
    });
    expect(mockListBySeller).toHaveBeenCalledTimes(1);
    expect(mockListBySeller).toHaveBeenCalledWith(SELLER_ID);
  });

  it("DTO does not carry rawSellerInput / privateSerialNumber / verification internals", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    mockListBySeller.mockResolvedValueOnce([listingFixture()]);
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    const blob = JSON.stringify(r.value.listings);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/humanReviewNotes/);
  });

  it("ignores any client-supplied actor/sellerId/profileId/role on the payload (no payload type accepts them)", async () => {
    // The action signature takes no payload at all. A forged
    // caller cannot smuggle a sellerId because the runtime never
    // reads `payload.sellerId` — the handler only reads
    // `actor.sellerId`. We assert the typed signature (compile
    // time) and that the repo is called with the resolved
    // actor's id even when the resolver returns a different id
    // from the constants used elsewhere in this test file.
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: OTHER_SELLER,
      displayName: "DEMO 셀러2",
      source: "supabase",
    });
    mockListBySeller.mockResolvedValueOnce([
      listingFixture({ sellerId: OTHER_SELLER }),
    ]);
    // Cast-through-any to simulate a forged caller. The compile
    // signature is `(): Promise<...>`; the runtime never reads
    // the argument.
    const r = await (listSellerOwnedListingsAction as unknown as (
      payload: Record<string, unknown>,
    ) => ReturnType<typeof listSellerOwnedListingsAction>)({
      sellerId: SELLER_ID,
      profileId: SELLER_ID,
      role: "admin",
      capability: "seller",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    expect(mockListBySeller).toHaveBeenCalledWith(OTHER_SELLER);
  });

  it("maps a repo throw to a typed internal result without leaking stack traces", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    mockListBySeller.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; service role key SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await listSellerOwnedListingsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    // The stable error code itself (`list_seller_listings_failed`)
    // is not secret. We assert the original SQL / env / row
    // payload never reaches the client.
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toContain("does not exist");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("listSellerOwnedListingsAction — actor resolution preference", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("calls the resolver with prefer: 'seller'", async () => {
    mockResolver.mockResolvedValueOnce(null);
    await listSellerOwnedListingsAction();
    expect(mockResolver).toHaveBeenCalledWith({ prefer: "seller" });
  });
});

// Tests for the seller dashboard server-mode incoming requests
// action (Bundle 2, Slice 3).
//
// The action mirrors `listSellerOwnedListingsAction`'s shape: a thin
// wrapper over `runIntentCommand` + a server-only repo read scoped
// to the actor's seller id. We mock the actor resolver and the repo
// at the module level so tests run without env or DB.
//
// Coverage:
//
//   - mock backend mode → `{ mode: "local" }` regardless of actor
//   - supabase mode + null actor → `unauthenticated`
//   - supabase mode + mock-sourced seller actor → `{ mode: "local" }`
//     (defense in depth — the resolver should not mint a mock-
//     sourced actor in supabase mode, but the action re-checks
//     before issuing a service-role read)
//   - supabase mode + supabase renter actor → `ownership` (renter
//     cannot read a seller's incoming requests)
//   - supabase mode + supabase seller actor → `{ mode: "server",
//     requests: [...] }`
//   - the repo is invoked with the SERVER actor's seller id, NEVER
//     a forged `actorSellerId` / `sellerId` / `profileId` /
//     `role` / `capability` / `status` field on the payload (the
//     payload type forbids them; the runtime never reads them)
//   - DTO is a tight allowlist (no payment session ids, no
//     settlement internals, no borrower_id, no internal admin
//     review notes, no trust/claim slots)
//   - DTO surfaces only the fields the seller dashboard renders:
//     id, listingId, productName, productCategory,
//     borrowerDisplayName, durationDays, status, rentalFee,
//     safetyDeposit, borrowerTotal, pickupArea, createdAt
//   - DB throw → typed `internal` (no stack / SQL / env / table /
//     row payload leak)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalIntent } from "@/domain/intents";

vi.mock("@/server/actors/resolveServerActor", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/actors/resolveServerActor")
  >("@/server/actors/resolveServerActor");
  return {
    ...actual,
    resolveServerActor: vi.fn(actual.resolveServerActor),
  };
});

vi.mock("@/server/persistence/supabase/rentalIntentRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/rentalIntentRepository")
  >("@/server/persistence/supabase/rentalIntentRepository");
  return {
    ...actual,
    listRentalIntentsBySeller: vi.fn(async () => []),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { listRentalIntentsBySeller } from "@/server/persistence/supabase/rentalIntentRepository";
import { listSellerRentalRequestsAction } from "./listSellerRentalRequests";

const mockResolver = vi.mocked(resolveServerActor);
const mockListBySeller = vi.mocked(listRentalIntentsBySeller);

const SELLER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_SELLER = "99999999-2222-4333-8444-555555555555";
const BORROWER_ID = "33333333-2222-4333-8444-555555555555";

function intentFixture(
  overrides: Partial<RentalIntent> = {},
): RentalIntent {
  return {
    id: "66666666-2222-4333-8444-777777777777",
    productId: "22222222-2222-4333-8444-555555555555",
    productName: "테스트 마사지건",
    productCategory: "massage_gun",
    sellerId: SELLER_ID,
    sellerName: "",
    borrowerId: BORROWER_ID,
    borrowerName: "DEMO 빌리는사람",
    status: "requested",
    durationDays: 3,
    amounts: {
      rentalFee: 21000,
      safetyDeposit: 30000,
      platformFee: 0,
      sellerPayout: 21000,
      borrowerTotal: 51000,
    },
    payment: {
      provider: "mock",
      status: "not_started",
      sessionId: "PAYMENT_SESSION_DO_NOT_LEAK",
      failureReason: "PAYMENT_FAILURE_DO_NOT_LEAK",
    },
    pickup: {
      method: "direct",
      status: "not_scheduled",
      locationLabel: "마포구",
    },
    return: { status: "not_due" },
    settlement: {
      status: "not_ready",
      sellerPayout: 21000,
      blockedReason: "SETTLEMENT_BLOCKED_DO_NOT_LEAK",
    },
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
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

describe("listSellerRentalRequestsAction — mock / default backend mode", () => {
  it("returns mode: local when CORENT_BACKEND_MODE is unset (regardless of actor)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await listSellerRentalRequestsAction();
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
    const r = await listSellerRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListBySeller).not.toHaveBeenCalled();
  });
});

describe("listSellerRentalRequestsAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns unauthenticated when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await listSellerRentalRequestsAction();
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
    const r = await listSellerRentalRequestsAction();
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
    const r = await listSellerRentalRequestsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
    expect(mockListBySeller).not.toHaveBeenCalled();
  });

  it("returns mode: server with the seller's requests DTO for a supabase seller actor", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    mockListBySeller.mockResolvedValueOnce([
      intentFixture({ id: "66666666-2222-4333-8444-aaaaaaaaaaaa" }),
      intentFixture({
        id: "66666666-2222-4333-8444-bbbbbbbbbbbb",
        durationDays: 7,
        amounts: {
          rentalFee: 39000,
          safetyDeposit: 30000,
          platformFee: 0,
          sellerPayout: 39000,
          borrowerTotal: 69000,
        },
      }),
    ]);
    const r = await listSellerRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.value.mode !== "server") {
      throw new Error(`expected mode=server, got ${r.value.mode}`);
    }
    expect(r.value.requests).toHaveLength(2);
    expect(r.value.requests[0]?.id).toBe(
      "66666666-2222-4333-8444-aaaaaaaaaaaa",
    );
    expect(r.value.requests[0]?.productName).toBe("테스트 마사지건");
    expect(r.value.requests[0]?.productCategory).toBe("massage_gun");
    expect(r.value.requests[0]?.durationDays).toBe(3);
    expect(r.value.requests[0]?.status).toBe("requested");
    expect(r.value.requests[0]?.rentalFee).toBe(21000);
    expect(r.value.requests[0]?.safetyDeposit).toBe(30000);
    expect(r.value.requests[0]?.borrowerTotal).toBe(51000);
    expect(r.value.requests[0]?.borrowerDisplayName).toBe("DEMO 빌리는사람");
    expect(r.value.requests[0]?.pickupArea).toBe("마포구");
    expect(mockListBySeller).toHaveBeenCalledTimes(1);
    expect(mockListBySeller).toHaveBeenCalledWith(SELLER_ID);
  });

  it("DTO does NOT carry payment session ids / settlement internals / borrower_id / internal review notes / trust/claim slots", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    mockListBySeller.mockResolvedValueOnce([intentFixture()]);
    const r = await listSellerRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    const blob = JSON.stringify(r.value.requests);
    expect(blob).not.toContain("PAYMENT_SESSION_DO_NOT_LEAK");
    expect(blob).not.toContain("PAYMENT_FAILURE_DO_NOT_LEAK");
    expect(blob).not.toContain("SETTLEMENT_BLOCKED_DO_NOT_LEAK");
    expect(blob).not.toContain(BORROWER_ID); // never echo borrower UUID
    expect(blob).not.toMatch(/borrowerId/);
    expect(blob).not.toMatch(/sellerId/);
    expect(blob).not.toMatch(/sessionId/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
    expect(blob).not.toMatch(/blockedReason/);
    expect(blob).not.toMatch(/sellerPayout/);
    expect(blob).not.toMatch(/platformFee/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/trustScore/);
    expect(blob).not.toMatch(/claimReview/);
    // The fields the DTO IS allowed to carry.
    expect(blob).toMatch(/productName/);
    expect(blob).toMatch(/borrowerDisplayName/);
    expect(blob).toMatch(/rentalFee/);
    expect(blob).toMatch(/safetyDeposit/);
    expect(blob).toMatch(/borrowerTotal/);
    expect(blob).toMatch(/durationDays/);
    expect(blob).toMatch(/pickupArea/);
    expect(blob).toMatch(/status/);
  });

  it("ignores any client-supplied actor/sellerId/profileId/role/capability/status field on the payload (no payload type accepts them)", async () => {
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
      intentFixture({ sellerId: OTHER_SELLER }),
    ]);
    const r = await (listSellerRentalRequestsAction as unknown as (
      payload: Record<string, unknown>,
    ) => ReturnType<typeof listSellerRentalRequestsAction>)({
      sellerId: SELLER_ID,
      profileId: SELLER_ID,
      role: "admin",
      capability: "founder",
      status: "settled",
      borrowerId: SELLER_ID,
      adminId: "FORGED_ADMIN",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    expect(mockListBySeller).toHaveBeenCalledWith(OTHER_SELLER);
    expect(mockListBySeller).not.toHaveBeenCalledWith(SELLER_ID);
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
        'relation "rental_intents" does not exist; service role key SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await listSellerRentalRequestsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    // The stable error code itself (`list_seller_requests_failed`)
    // is not secret. We assert the original SQL / env / row
    // payload never reaches the client.
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toContain("does not exist");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("listSellerRentalRequestsAction — actor resolution preference", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("calls the resolver with prefer: 'seller'", async () => {
    mockResolver.mockResolvedValueOnce(null);
    await listSellerRentalRequestsAction();
    expect(mockResolver).toHaveBeenCalledWith({ prefer: "seller" });
  });
});

describe("listSellerRentalRequestsAction — scope guards", () => {
  it("does not import any payment / lifecycle / claim / trust / handoff / notification module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "rentals",
      "listSellerRentalRequests.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    // Grab every multi-line `import ... from "...";` statement so
    // multi-line symbol lists are not missed by a per-line filter.
    const importBlob = (src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? [])
      .join("\n");
    expect(importBlob).not.toMatch(/rentalService/);
    expect(importBlob).not.toMatch(/rentalIntentMachine/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/listing_secrets/);
    expect(importBlob).not.toMatch(/saveRentalIntent/);
    expect(importBlob).not.toMatch(/appendRentalEvent/);
  });
});

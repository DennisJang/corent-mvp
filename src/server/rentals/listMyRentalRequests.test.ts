// Tests for the borrower `/requests` page server-mode read action
// (Bundle 3, Slice 2). Mirrors `listSellerRentalRequests.test.ts`,
// inverted for the borrower side. We mock the actor resolver and the
// repo at the module level so tests run without env or DB.
//
// Coverage:
//
//   - mock backend mode → `{ mode: "local" }` regardless of actor
//   - supabase mode + null actor → `unauthenticated`
//   - supabase mode + mock-sourced renter actor → `{ mode: "local" }`
//     (defense in depth)
//   - supabase mode + supabase seller actor (under prefer=renter
//     when borrower row absent) → `ownership` (a seller-only
//     account cannot see a borrower's own requests)
//   - supabase mode + supabase renter actor → `{ mode: "server",
//     requests: [...] }`
//   - the repo is invoked with the SERVER actor's borrower id,
//     NEVER a forged `borrowerId` / `profileId` / `role` /
//     `capability` / `status` field on the payload (the payload
//     type forbids them; the runtime never reads them)
//   - DTO is a tight allowlist (no payment session ids, no
//     settlement internals, no borrower_id, no admin notes,
//     no platformFee / sellerPayout / safetyDeposit, no trust
//     slots, no listing-secrets fields)
//   - DTO surfaces only the fields `/requests` renders:
//     id, listingId, productName, productCategory,
//     sellerDisplayName, durationDays, status, rentalFee,
//     borrowerTotal, pickupArea, createdAt, updatedAt
//   - DB throw → typed `internal` (no stack / SQL / env / table
//     leak)

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
    listRentalIntentsByBorrower: vi.fn(async () => []),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { listRentalIntentsByBorrower } from "@/server/persistence/supabase/rentalIntentRepository";
import { listMyRentalRequestsAction } from "./listMyRentalRequests";

const mockResolver = vi.mocked(resolveServerActor);
const mockListByBorrower = vi.mocked(listRentalIntentsByBorrower);

const BORROWER_ID = "33333333-2222-4333-8444-555555555555";
const OTHER_BORROWER = "99999999-2222-4333-8444-555555555555";
const SELLER_ID = "11111111-2222-4333-8444-555555555555";

function intentFixture(
  overrides: Partial<RentalIntent> = {},
): RentalIntent {
  return {
    id: "66666666-2222-4333-8444-777777777777",
    productId: "22222222-2222-4333-8444-555555555555",
    productName: "테스트 마사지건",
    productCategory: "massage_gun",
    sellerId: SELLER_ID,
    sellerName: "DEMO 셀러",
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
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockResolver.mockReset();
  mockListByBorrower.mockReset();
  mockListByBorrower.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listMyRentalRequestsAction — mock / default backend mode", () => {
  it("returns mode: local when CORENT_BACKEND_MODE is unset", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListByBorrower).not.toHaveBeenCalled();
  });

  it("returns mode: local when mode is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListByBorrower).not.toHaveBeenCalled();
  });
});

describe("listMyRentalRequestsAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns unauthenticated when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockListByBorrower).not.toHaveBeenCalled();
  });

  it("returns mode: local for a mock-sourced renter actor (defense in depth)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ mode: "local" });
    expect(mockListByBorrower).not.toHaveBeenCalled();
  });

  it("returns ownership for a supabase-sourced seller actor under prefer=renter", async () => {
    // A profile with only seller capability resolves to a `seller`
    // actor even under `prefer: "renter"`; the runner returns
    // ownership because actor.kind !== expectedActorKind.
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
    expect(mockListByBorrower).not.toHaveBeenCalled();
  });

  it("returns mode: server with the borrower's requests DTO for a supabase renter actor", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    mockListByBorrower.mockResolvedValueOnce([
      intentFixture({ id: "66666666-2222-4333-8444-aaaaaaaaaaaa" }),
      intentFixture({
        id: "66666666-2222-4333-8444-bbbbbbbbbbbb",
        status: "seller_approved",
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
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.value.mode !== "server") {
      throw new Error(`expected mode=server, got ${r.value.mode}`);
    }
    expect(r.value.requests).toHaveLength(2);
    const first = r.value.requests[0];
    expect(first?.id).toBe("66666666-2222-4333-8444-aaaaaaaaaaaa");
    expect(first?.productName).toBe("테스트 마사지건");
    expect(first?.productCategory).toBe("massage_gun");
    expect(first?.durationDays).toBe(3);
    expect(first?.status).toBe("requested");
    expect(first?.rentalFee).toBe(21000);
    expect(first?.borrowerTotal).toBe(51000);
    expect(first?.sellerDisplayName).toBe("DEMO 셀러");
    expect(first?.pickupArea).toBe("마포구");
    expect(first?.createdAt).toBe("2026-04-30T00:00:00.000Z");
    expect(first?.updatedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(r.value.requests[1]?.status).toBe("seller_approved");
    expect(mockListByBorrower).toHaveBeenCalledTimes(1);
    expect(mockListByBorrower).toHaveBeenCalledWith(BORROWER_ID);
  });

  it("normalizes empty seller display name to null in the DTO", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    mockListByBorrower.mockResolvedValueOnce([
      intentFixture({ sellerName: "" }),
    ]);
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    expect(r.value.requests[0]?.sellerDisplayName).toBeNull();
  });

  it("DTO does NOT carry payment / settlement internals / borrower_id / seller_id / safety deposit / platform fee / seller payout / admin / trust slots", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    mockListByBorrower.mockResolvedValueOnce([intentFixture()]);
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    const blob = JSON.stringify(r.value.requests);
    // Forbidden raw values
    expect(blob).not.toContain("PAYMENT_SESSION_DO_NOT_LEAK");
    expect(blob).not.toContain("PAYMENT_FAILURE_DO_NOT_LEAK");
    expect(blob).not.toContain("SETTLEMENT_BLOCKED_DO_NOT_LEAK");
    expect(blob).not.toContain(BORROWER_ID); // never echo borrower UUID
    expect(blob).not.toContain(SELLER_ID); // never echo seller UUID
    // Forbidden field names
    expect(blob).not.toMatch(/borrowerId/);
    expect(blob).not.toMatch(/sellerId/);
    expect(blob).not.toMatch(/sessionId/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
    expect(blob).not.toMatch(/blockedReason/);
    expect(blob).not.toMatch(/sellerPayout/);
    expect(blob).not.toMatch(/platformFee/);
    expect(blob).not.toMatch(/safetyDeposit/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/trustScore/);
    expect(blob).not.toMatch(/claimReview/);
    expect(blob).not.toMatch(/adminId/);
    // Allowed fields
    expect(blob).toMatch(/productName/);
    expect(blob).toMatch(/sellerDisplayName/);
    expect(blob).toMatch(/rentalFee/);
    expect(blob).toMatch(/borrowerTotal/);
    expect(blob).toMatch(/durationDays/);
    expect(blob).toMatch(/pickupArea/);
    expect(blob).toMatch(/status/);
    expect(blob).toMatch(/createdAt/);
    expect(blob).toMatch(/updatedAt/);
  });

  it("ignores any client-supplied borrowerId / profileId / role / capability / status field on the payload (no payload type accepts them)", async () => {
    // The action signature takes no payload at all. A forged
    // caller cannot smuggle a borrowerId because the runtime never
    // reads `payload.borrowerId` — the handler only reads
    // `actor.borrowerId`. We assert the repo is called with the
    // resolved actor's id even when the resolver returns a
    // different id from the constants used elsewhere.
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: OTHER_BORROWER,
      displayName: "DEMO 빌리는사람2",
      source: "supabase",
    });
    mockListByBorrower.mockResolvedValueOnce([
      intentFixture({ borrowerId: OTHER_BORROWER }),
    ]);
    const r = await (listMyRentalRequestsAction as unknown as (
      payload: Record<string, unknown>,
    ) => ReturnType<typeof listMyRentalRequestsAction>)({
      borrowerId: BORROWER_ID,
      profileId: BORROWER_ID,
      role: "admin",
      capability: "founder",
      status: "settled",
      sellerId: SELLER_ID,
      adminId: "FORGED_ADMIN",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.mode !== "server") return;
    expect(mockListByBorrower).toHaveBeenCalledWith(OTHER_BORROWER);
    expect(mockListByBorrower).not.toHaveBeenCalledWith(BORROWER_ID);
  });

  it("maps a repo throw to a typed internal result without leaking stack traces", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    mockListByBorrower.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; service role key SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await listMyRentalRequestsAction();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toContain("does not exist");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("listMyRentalRequestsAction — actor resolution preference", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("calls the resolver with prefer: 'renter'", async () => {
    mockResolver.mockResolvedValueOnce(null);
    await listMyRentalRequestsAction();
    expect(mockResolver).toHaveBeenCalledWith({ prefer: "renter" });
  });
});

describe("listMyRentalRequestsAction — scope guards", () => {
  it("does not import any payment / lifecycle / claim / trust / handoff / notification / settlement module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "rentals",
      "listMyRentalRequests.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importBlob = (
      src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
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
    expect(importBlob).not.toMatch(/respondToRentalRequest/);
  });
});

// Tests for the renter request creation action (Validation Bundle 1,
// Part 4). Covers:
//
//   - mock backend mode → typed `unsupported` (no DB call)
//   - supabase backend mode + null actor → `unauthenticated`
//   - supabase backend mode + mock-sourced renter → `unsupported`
//     (defense in depth: resolver should not mint a mock-sourced
//      actor in supabase mode, but the action re-checks)
//   - supabase backend mode + supabase seller actor under
//     prefer=renter → `ownership` (capability mismatch)
//   - shape validation: bad listingId / bad durationDays → `input`
//   - listing not found → `not_found`
//   - listing exists but `status !== 'approved'` (draft, ai_extracted,
//     verification_incomplete, human_review_pending, rejected) →
//     `not_found` (no enumeration of non-public rows)
//   - approved listing happy path: saveRentalIntent + appendRentalEvent
//     are called with server-derived sellerId / price / amounts /
//     borrowerId / status='requested' / payment={mock,not_started}
//   - server derives price from canonical listing pricing for the
//     supplied duration (1 / 3 / 7)
//   - forged sellerId / borrowerId / price / status / payment / pickup /
//     return / settlement / adminId / role / capability are ignored
//     (compile + runtime); repo receives canonical values
//   - response DTO does NOT carry sellerId / borrowerId / private
//     fields / payment session ids / verification internals
//   - saveRentalIntent throw / appendRentalEvent throw → typed
//     `internal` without leaking SQL / env / stack
//   - existing local demo rental flow (`rentalService`) is NOT
//     touched — this action does not import or call it

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryId } from "@/domain/categories";
import type { ListingIntent, RentalIntent } from "@/domain/intents";

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
    getListingById: vi.fn(async () => null),
  };
});

vi.mock("@/server/persistence/supabase/rentalIntentRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/rentalIntentRepository")
  >("@/server/persistence/supabase/rentalIntentRepository");
  return {
    ...actual,
    saveRentalIntent: vi.fn(async () => ({ ok: true, id: "saved-id" })),
    appendRentalEvent: vi.fn(async () => ({ ok: true })),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { getListingById } from "@/server/persistence/supabase/listingRepository";
import {
  appendRentalEvent,
  saveRentalIntent,
} from "@/server/persistence/supabase/rentalIntentRepository";
import { createRentalRequestAction } from "./createRentalRequest";

const mockResolver = vi.mocked(resolveServerActor);
const mockGetListing = vi.mocked(getListingById);
const mockSaveRental = vi.mocked(saveRentalIntent);
const mockAppendEvent = vi.mocked(appendRentalEvent);

const LISTING_ID = "11111111-2222-4333-8444-555555555555";
const SELLER_ID = "22222222-2222-4333-8444-555555555555";
const BORROWER_ID = "33333333-2222-4333-8444-555555555555";

function listingFixture(
  overrides: Partial<ListingIntent> = {},
): ListingIntent {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "approved",
    rawSellerInput: "DEMO 셀러 원본 메모 (절대 노출 금지)",
    item: {
      name: "테스트 마사지건",
      category: "massage_gun" as CategoryId,
      estimatedValue: 200000,
      condition: "lightly_used",
      components: ["본체"],
      defects: undefined,
      privateSerialNumber: "SN-SECRET-12345",
      pickupArea: "마포구",
    },
    pricing: {
      oneDay: 9000,
      threeDays: 21000,
      sevenDays: 39000,
      sellerAdjusted: false,
    },
    verification: {
      id: "55555555-2222-4333-8444-888888888888",
      safetyCode: "B-123",
      status: "verified",
      checks: {
        frontPhoto: true,
        backPhoto: true,
        componentsPhoto: true,
        workingProof: true,
        safetyCodePhoto: true,
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
  mockGetListing.mockReset();
  mockGetListing.mockResolvedValue(null);
  mockSaveRental.mockReset();
  mockSaveRental.mockResolvedValue({ ok: true, id: "saved-id" });
  mockAppendEvent.mockReset();
  mockAppendEvent.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createRentalRequestAction — mock / default backend mode", () => {
  it("returns 'unsupported' when CORENT_BACKEND_MODE is unset (regardless of actor)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' when mode is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockSaveRental).not.toHaveBeenCalled();
  });
});

describe("createRentalRequestAction — supabase backend mode actor gates", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns 'unauthenticated' when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' for a mock-sourced renter actor (defense in depth)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "mock",
    });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
  });

  it("returns 'ownership' when a supabase profile lacks borrower capability (resolver returns seller actor under prefer=renter)", async () => {
    // The resolver's contract: when prefer="renter" but the
    // profile only has a seller_profiles row, it returns the
    // seller actor. The runner's `expectedActorKind: "renter"`
    // then maps that to a typed `ownership` error.
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
  });
});

describe("createRentalRequestAction — shape validation", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
  });

  it("rejects non-uuid listingId with code 'input' (no DB call)", async () => {
    const r = await createRentalRequestAction({
      listingId: "not-a-uuid",
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
  });

  it("rejects empty listingId with code 'input'", async () => {
    const r = await createRentalRequestAction({
      listingId: "",
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
  });

  it("rejects unsupported durationDays with code 'input'", async () => {
    for (const bad of [0, 2, 5, 14, 30, -1, 3.5]) {
      const r = await createRentalRequestAction({
        listingId: LISTING_ID,
        durationDays: bad as unknown as 1,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("input");
    }
    expect(mockGetListing).not.toHaveBeenCalled();
  });
});

describe("createRentalRequestAction — listing visibility gate", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
  });

  it("returns 'not_found' when the listing does not exist (no rental write)", async () => {
    mockGetListing.mockResolvedValueOnce(null);
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("not_found");
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("collapses every non-approved status to 'not_found' (no enumeration of private rows)", async () => {
    for (const status of [
      "draft",
      "ai_extracted",
      "verification_incomplete",
      "human_review_pending",
      "rejected",
    ] as const) {
      mockGetListing.mockResolvedValueOnce(listingFixture({ status }));
      const r = await createRentalRequestAction({
        listingId: LISTING_ID,
        durationDays: 3,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("not_found");
    }
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("createRentalRequestAction — happy path with mocked repos", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
  });

  it("creates a 'requested' rental against an approved listing and returns a tight DTO", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("requested");
    expect(r.value.durationDays).toBe(3);
    expect(r.value.rentalFee).toBe(21000);
    // 200000 estimated_value → safety deposit tier "30000".
    expect(r.value.safetyDeposit).toBe(30000);
    // borrowerTotal = rentalFee + safetyDeposit = 21000 + 30000 = 51000.
    expect(r.value.borrowerTotal).toBe(51000);
    expect(r.value.productName).toBe("테스트 마사지건");
    expect(r.value.productCategory).toBe("massage_gun");
    // Repo write reached.
    expect(mockSaveRental).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
  });

  it("derives sellerId from the canonical listing, not from the payload or actor", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 1,
    });
    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.sellerId).toBe(SELLER_ID);
    // The rental's productId equals the canonical listing id,
    // not anything the renter could have supplied differently.
    expect(persisted?.productId).toBe(LISTING_ID);
  });

  it("derives borrowerId from the resolved actor, never from a forged payload", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 1,
    });
    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.borrowerId).toBe(BORROWER_ID);
  });

  it("derives rental fee from listing.pricing keyed by durationDays (1 / 3 / 7)", async () => {
    for (const [days, expected] of [
      [1, 9000],
      [3, 21000],
      [7, 39000],
    ] as const) {
      mockSaveRental.mockClear();
      mockGetListing.mockResolvedValueOnce(
        listingFixture({ status: "approved" }),
      );
      const r = await createRentalRequestAction({
        listingId: LISTING_ID,
        durationDays: days,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.rentalFee).toBe(expected);
      const persisted = mockSaveRental.mock.calls[0]?.[0];
      expect(persisted?.amounts.rentalFee).toBe(expected);
      expect(persisted?.durationDays).toBe(days);
    }
  });

  it("persists status='requested' with payment={mock, not_started} and pickup/return/settlement at safe defaults", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.status).toBe("requested");
    expect(persisted?.payment).toEqual({
      provider: "mock",
      status: "not_started",
    });
    expect(persisted?.pickup).toEqual({
      method: "direct",
      status: "not_scheduled",
      locationLabel: "마포구",
    });
    expect(persisted?.return).toEqual({ status: "not_due" });
    expect(persisted?.settlement.status).toBe("not_ready");
  });

  it("appends a single rental_event with from=null, to=requested, actor=borrower", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const ev = mockAppendEvent.mock.calls[0]?.[0];
    expect(ev?.fromStatus).toBeNull();
    expect(ev?.toStatus).toBe("requested");
    expect(ev?.actor).toBe("borrower");
    expect(ev?.reason).toBe("rental_request_created");
  });

  it("ignores forged sellerId / borrowerId / price / status / payment / pickup / return / settlement / adminId / role / capability fields on the payload", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    // The payload type only allows `listingId` and `durationDays`.
    // A forged caller passing extra fields via cast must NOT
    // influence the persisted row.
    const FORGED_SELLER = "99999999-2222-4333-8444-555555555555";
    const FORGED_BORROWER = "88888888-2222-4333-8444-555555555555";
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
      // @ts-expect-error — forged extra field not in the payload type
      sellerId: FORGED_SELLER,
      // @ts-expect-error — forged extra field not in the payload type
      borrowerId: FORGED_BORROWER,
      // @ts-expect-error — forged extra field not in the payload type
      rentalFee: 1,
      // @ts-expect-error — forged extra field not in the payload type
      amounts: { rentalFee: 1, safetyDeposit: 0, platformFee: 0, sellerPayout: 1, borrowerTotal: 1 },
      // @ts-expect-error — forged extra field not in the payload type
      status: "settled",
      // @ts-expect-error — forged extra field not in the payload type
      payment: { provider: "toss", status: "paid", sessionId: "FORGED_SESSION" },
      // @ts-expect-error — forged extra field not in the payload type
      pickup: { status: "confirmed" },
      // @ts-expect-error — forged extra field not in the payload type
      return: { status: "confirmed" },
      // @ts-expect-error — forged extra field not in the payload type
      settlement: { status: "settled" },
      // @ts-expect-error — forged extra field not in the payload type
      adminId: "FORGED_ADMIN",
      // @ts-expect-error — forged extra field not in the payload type
      role: "admin",
      // @ts-expect-error — forged extra field not in the payload type
      capability: "founder",
      // @ts-expect-error — forged extra field not in the payload type
      approval: true,
      // @ts-expect-error — forged extra field not in the payload type
      trustScore: 999,
      // @ts-expect-error — forged extra field not in the payload type
      claimReview: { status: "approved" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const persisted = mockSaveRental.mock.calls[0]?.[0] as RentalIntent;
    expect(persisted.sellerId).toBe(SELLER_ID); // canonical, not FORGED_SELLER
    expect(persisted.sellerId).not.toBe(FORGED_SELLER);
    expect(persisted.borrowerId).toBe(BORROWER_ID); // actor, not FORGED_BORROWER
    expect(persisted.borrowerId).not.toBe(FORGED_BORROWER);
    expect(persisted.amounts.rentalFee).toBe(21000); // canonical 3-day price
    expect(persisted.amounts.rentalFee).not.toBe(1);
    expect(persisted.status).toBe("requested"); // not "settled"
    expect(persisted.payment).toEqual({
      provider: "mock",
      status: "not_started",
    });
    expect(persisted.payment.provider).not.toBe("toss");
    expect((persisted.payment as { sessionId?: string }).sessionId).toBeUndefined();
    expect(persisted.pickup.status).toBe("not_scheduled");
    expect(persisted.return.status).toBe("not_due");
    expect(persisted.settlement.status).toBe("not_ready");
  });

  it("response DTO does NOT carry sellerId / borrowerId / payment session id / verification internals / private fields", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const blob = JSON.stringify(r.value);
    expect(blob).not.toContain(SELLER_ID);
    expect(blob).not.toContain(BORROWER_ID);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/sellerId/);
    expect(blob).not.toMatch(/borrowerId/);
    expect(blob).not.toMatch(/sessionId/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
  });
});

describe("createRentalRequestAction — repo failure mapping", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
  });

  it("maps getListingById throw to typed 'internal' without leaking SQL / env / stack", async () => {
    mockGetListing.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(mockSaveRental).not.toHaveBeenCalled();
  });

  it("maps saveRentalIntent ok=false to typed 'internal' without leaking the underlying message", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    mockSaveRental.mockResolvedValueOnce({
      ok: false,
      error: 'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
    });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // The event was never appended because the rental write failed.
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("maps saveRentalIntent throw to typed 'internal'", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    mockSaveRental.mockRejectedValueOnce(new Error("boom"));
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
  });

  it("maps appendRentalEvent ok=false to typed 'internal'", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    mockAppendEvent.mockResolvedValueOnce({ ok: false, error: "boom" });
    const r = await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
  });
});

describe("createRentalRequestAction — scope guards", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "renter",
      borrowerId: BORROWER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
  });

  it("does not import or invoke the local rentalService (the local demo path stays disjoint)", async () => {
    // Static check — Part 4 must not pull the local rental service
    // module into the server-action code path. If a future edit
    // accidentally imports it, this test surfaces the regression
    // by failing the source scan below.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "rentals",
      "createRentalRequest.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    expect(src).not.toContain("@/lib/services/rentalService");
    expect(src).not.toContain("@/lib/adapters/persistence");
    expect(src).not.toContain("getPersistence");
  });

  it("does not write payment / claim / trust / handoff / notification rows on a successful request", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    await createRentalRequestAction({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    // Only saveRentalIntent + appendRentalEvent are called. No
    // other side-effect crosses the action's boundary.
    expect(mockSaveRental).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    // The action source must not import any of the out-of-scope
    // services. We scan only `import` lines so a comment that
    // mentions "no notifications" / "no claims" cannot give a
    // false positive.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "rentals",
      "createRentalRequest.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importLines = src
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l));
    const importBlob = importLines.join("\n");
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/claimReview/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/paymentAdapter/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/@\/lib\/services\/rentalService/);
  });
});

// Tests for the founder validation cockpit data orchestrator
// (Bundle 2, Slice 4).
//
// Coverage:
//
//   - non-founder caller → `{ kind: "forbidden" }`; the page maps
//     that to `notFound()`. The repos are NOT touched.
//   - mock backend mode + founder → `{ kind: "inactive", founderEmail }`.
//     Repos NOT touched; the page renders a calm "supabase backend
//     not active" panel.
//   - supabase backend mode + founder → `{ kind: "ready", data }`
//     with all four data sources populated and projected through
//     tight DTOs.
//   - DTOs strip private / internal fields:
//       - listings: no rawSellerInput, no privateSerialNumber, no
//         verification.* slot, no humanReviewNotes
//       - requests: no payment.sessionId / failureReason, no
//         settlement.* internals beyond the public status, no
//         claim/trust slots
//       - feedback: no internal status workflow, no extra slots
//   - per-source repo throws collapse to empty arrays without
//     leaking SQL / env / stack
//   - aggregates throw collapses to `null`

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/admin/auth")
  >("@/server/admin/auth");
  return {
    ...actual,
    requireFounderSession: vi.fn(actual.requireFounderSession),
  };
});

vi.mock("@/server/persistence/supabase/feedbackRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/feedbackRepository")
  >("@/server/persistence/supabase/feedbackRepository");
  return {
    ...actual,
    listRecentFeedbackSubmissions: vi.fn(async () => []),
  };
});

vi.mock("@/server/persistence/supabase/listingRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/listingRepository")
  >("@/server/persistence/supabase/listingRepository");
  return {
    ...actual,
    listRecentListings: vi.fn(async () => []),
  };
});

vi.mock("@/server/persistence/supabase/rentalIntentRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/rentalIntentRepository")
  >("@/server/persistence/supabase/rentalIntentRepository");
  return {
    ...actual,
    listRentalIntents: vi.fn(async () => []),
  };
});

vi.mock("@/server/persistence/supabase/marketplaceAggregates", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/marketplaceAggregates")
  >("@/server/persistence/supabase/marketplaceAggregates");
  return {
    ...actual,
    readMarketplaceAggregates: vi.fn(async () => null),
  };
});

import { requireFounderSession } from "@/server/admin/auth";
import { listRecentFeedbackSubmissions } from "@/server/persistence/supabase/feedbackRepository";
import { listRecentListings } from "@/server/persistence/supabase/listingRepository";
import { readMarketplaceAggregates } from "@/server/persistence/supabase/marketplaceAggregates";
import { listRentalIntents } from "@/server/persistence/supabase/rentalIntentRepository";
import type { ListingIntent, RentalIntent } from "@/domain/intents";
import { readFounderCockpitData } from "./founderCockpitData";

const mockRequireFounder = vi.mocked(requireFounderSession);
const mockListListings = vi.mocked(listRecentListings);
const mockListRentals = vi.mocked(listRentalIntents);
const mockListFeedback = vi.mocked(listRecentFeedbackSubmissions);
const mockReadAggregates = vi.mocked(readMarketplaceAggregates);

const FOUNDER_EMAIL = "founder@example.com";
const SELLER_ID = "11111111-2222-4333-8444-555555555555";
const BORROWER_ID = "33333333-2222-4333-8444-555555555555";

function listingFixture(
  overrides: Partial<ListingIntent> = {},
): ListingIntent {
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
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

function rentalFixture(
  overrides: Partial<RentalIntent> = {},
): RentalIntent {
  return {
    id: "66666666-2222-4333-8444-777777777777",
    productId: "44444444-2222-4333-8444-777777777777",
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
  mockRequireFounder.mockReset();
  mockListListings.mockReset();
  mockListListings.mockResolvedValue([]);
  mockListRentals.mockReset();
  mockListRentals.mockResolvedValue([]);
  mockListFeedback.mockReset();
  mockListFeedback.mockResolvedValue([]);
  mockReadAggregates.mockReset();
  mockReadAggregates.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readFounderCockpitData — auth gate", () => {
  it("returns { kind: 'forbidden' } for a non-founder caller without touching the repos", async () => {
    mockRequireFounder.mockResolvedValueOnce(null);
    const r = await readFounderCockpitData();
    expect(r).toEqual({ kind: "forbidden" });
    expect(mockListListings).not.toHaveBeenCalled();
    expect(mockListRentals).not.toHaveBeenCalled();
    expect(mockListFeedback).not.toHaveBeenCalled();
    expect(mockReadAggregates).not.toHaveBeenCalled();
  });
});

describe("readFounderCockpitData — mock / default backend", () => {
  it("returns { kind: 'inactive', founderEmail } in mock mode without touching the repos", async () => {
    mockRequireFounder.mockResolvedValueOnce({ email: FOUNDER_EMAIL });
    const r = await readFounderCockpitData();
    expect(r).toEqual({ kind: "inactive", founderEmail: FOUNDER_EMAIL });
    expect(mockListListings).not.toHaveBeenCalled();
    expect(mockListRentals).not.toHaveBeenCalled();
    expect(mockListFeedback).not.toHaveBeenCalled();
    expect(mockReadAggregates).not.toHaveBeenCalled();
  });
});

describe("readFounderCockpitData — supabase backend", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockRequireFounder.mockResolvedValue({ email: FOUNDER_EMAIL });
  });

  it("returns ready with the founder email and current generatedAt", async () => {
    const r = await readFounderCockpitData();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.data.founderEmail).toBe(FOUNDER_EMAIL);
    expect(typeof r.data.generatedAt).toBe("string");
    // Ensure it's an ISO-8601 string.
    expect(Number.isFinite(Date.parse(r.data.generatedAt))).toBe(true);
  });

  it("projects listings to a tight DTO that strips rawSellerInput, privateSerialNumber, verification internals, humanReviewNotes", async () => {
    mockListListings.mockResolvedValueOnce([listingFixture()]);
    const r = await readFounderCockpitData();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.data.listings).toHaveLength(1);
    const blob = JSON.stringify(r.data.listings);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/verification/);
    // The DTO surfaces the operational fields the cockpit needs.
    expect(r.data.listings[0]?.itemName).toBe("테스트 마사지건");
    expect(r.data.listings[0]?.status).toBe("draft");
    expect(r.data.listings[0]?.sellerId).toBe(SELLER_ID);
    expect(r.data.listings[0]?.pickupArea).toBe("마포구");
  });

  it("projects rentals to a tight DTO that strips payment session id, payment failure reason, settlement internals", async () => {
    mockListRentals.mockResolvedValueOnce([rentalFixture()]);
    const r = await readFounderCockpitData();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.data.requests).toHaveLength(1);
    const blob = JSON.stringify(r.data.requests);
    expect(blob).not.toContain("PAYMENT_SESSION_DO_NOT_LEAK");
    expect(blob).not.toContain("PAYMENT_FAILURE_DO_NOT_LEAK");
    expect(blob).not.toContain("SETTLEMENT_BLOCKED_DO_NOT_LEAK");
    expect(blob).not.toMatch(/sessionId/);
    expect(blob).not.toMatch(/failureReason/);
    expect(blob).not.toMatch(/blockedReason/);
    expect(blob).not.toMatch(/settledAt/);
    expect(blob).not.toMatch(/sellerPayout/);
    expect(blob).not.toMatch(/platformFee/);
    expect(blob).not.toMatch(/safetyDeposit/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
    expect(blob).not.toMatch(/claimReview/);
    expect(blob).not.toMatch(/trustScore/);
    // The DTO surfaces the operational fields the cockpit needs.
    expect(r.data.requests[0]?.status).toBe("requested");
    expect(r.data.requests[0]?.sellerId).toBe(SELLER_ID);
    expect(r.data.requests[0]?.borrowerId).toBe(BORROWER_ID);
    expect(r.data.requests[0]?.rentalFee).toBe(21000);
    expect(r.data.requests[0]?.borrowerTotal).toBe(51000);
  });

  it("projects feedback to a tight DTO; contactEmail is included for follow-up but no other PII", async () => {
    mockListFeedback.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000001",
        kind: "wanted_item",
        status: "new",
        message: "다이슨 빌려보고 싶어요",
        itemName: "다이슨 슈퍼소닉",
        category: "home_care",
        contactEmail: "tester@example.com",
        profileId: "00000000-0000-0000-0000-000000000099",
        sourcePage: "/",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
    const r = await readFounderCockpitData();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.data.feedback).toHaveLength(1);
    expect(r.data.feedback[0]?.contactEmail).toBe("tester@example.com");
    expect(r.data.feedback[0]?.kind).toBe("wanted_item");
    // No `updated_at`, no internal review fields, no extra slots.
    const dto = r.data.feedback[0] as Record<string, unknown>;
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "kind",
        "status",
        "message",
        "itemName",
        "category",
        "contactEmail",
        "profileId",
        "sourcePage",
        "createdAt",
      ].sort(),
    );
  });

  it("collapses each per-source repo throw to an empty result without leaking SQL / env / stack", async () => {
    mockListListings.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    mockListRentals.mockRejectedValueOnce(new Error("rental boom"));
    mockListFeedback.mockRejectedValueOnce(new Error("feedback boom"));
    mockReadAggregates.mockRejectedValueOnce(new Error("agg boom"));
    const r = await readFounderCockpitData();
    expect(r.kind).toBe("ready");
    if (r.kind !== "ready") return;
    expect(r.data.listings).toEqual([]);
    expect(r.data.requests).toEqual([]);
    expect(r.data.feedback).toEqual([]);
    expect(r.data.aggregates).toBeNull();
    const blob = JSON.stringify(r.data);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(blob).not.toContain("boom");
  });

  it("invokes each repo with the supplied limit (clamped to [1, 200])", async () => {
    await readFounderCockpitData(10_000);
    expect(mockListListings).toHaveBeenCalledWith(200);
    expect(mockListRentals).toHaveBeenCalledWith(200);
    expect(mockListFeedback).toHaveBeenCalledWith(200);
    mockListListings.mockClear();
    mockListRentals.mockClear();
    mockListFeedback.mockClear();
    await readFounderCockpitData(0);
    expect(mockListListings).toHaveBeenCalledWith(1);
    expect(mockListRentals).toHaveBeenCalledWith(1);
    expect(mockListFeedback).toHaveBeenCalledWith(1);
  });
});

describe("readFounderCockpitData — scope guard", () => {
  it("does not import any payment / lifecycle / claim / trust / handoff / notification module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "admin",
      "founderCockpitData.ts",
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
    // No write paths from the orchestrator.
    expect(importBlob).not.toMatch(/saveRentalIntent/);
    expect(importBlob).not.toMatch(/saveListing\b/);
    expect(importBlob).not.toMatch(/setListingStatus/);
    expect(importBlob).not.toMatch(/appendRentalEvent/);
  });
});

// Tests for the server-backed public listing read (Bundle 2,
// Slice 1). Covers:
//
//   - mock / default backend mode → `{ mode: "local" }` so the
//     client falls back to its existing isomorphic path; the repo
//     is NOT touched
//   - supabase backend mode + zero approved rows → empty server
//     listings
//   - supabase backend mode + approved rows → projected via the
//     existing allowlist mapper
//   - supabase backend mode filters out non-approved rows
//     (defense in depth — the repo already filters server-side,
//     and the projection mapper drops anything that's not
//     `status='approved'`)
//   - supabase backend mode drops rows that fail the projection
//     mapper's minimum-shape gate (missing pickupArea, malformed
//     prices, unknown category, etc.)
//   - public DTO never carries `rawSellerInput`,
//     `privateSerialNumber`, `verification.*`, internal review
//     notes, or any other private slot from the source intent
//   - repo throw → calm `{ mode: "server", listings: [] }`
//     (degraded empty state); no SQL / env / table / row /
//     service-role hint leaks through the action surface
//   - the action does NOT import or call any payment / claim /
//     trust / handoff / notification / rental module — public
//     browse is read-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryId } from "@/domain/categories";
import type { ListingIntent } from "@/domain/intents";

vi.mock("@/server/persistence/supabase/listingRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/listingRepository")
  >("@/server/persistence/supabase/listingRepository");
  return {
    ...actual,
    listApprovedListings: vi.fn(async () => []),
    getListingById: vi.fn(async () => null),
  };
});

import {
  getListingById,
  listApprovedListings,
} from "@/server/persistence/supabase/listingRepository";
import {
  getServerApprovedPublicListingAction,
  listPublicListingsAction,
} from "./listPublicListings";

const mockListApproved = vi.mocked(listApprovedListings);
const mockGetListing = vi.mocked(getListingById);

const SELLER_ID = "11111111-2222-4333-8444-555555555555";

function listingFixture(
  overrides: Partial<ListingIntent> = {},
): ListingIntent {
  return {
    id: "44444444-2222-4333-8444-777777777777",
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
  mockListApproved.mockReset();
  mockListApproved.mockResolvedValue([]);
  mockGetListing.mockReset();
  mockGetListing.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listPublicListingsAction — mock / default backend mode", () => {
  it("returns mode: local without touching the repo (no env)", async () => {
    const r = await listPublicListingsAction();
    expect(r).toEqual({ mode: "local" });
    expect(mockListApproved).not.toHaveBeenCalled();
  });

  it("returns mode: local when CORENT_BACKEND_MODE is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const r = await listPublicListingsAction();
    expect(r).toEqual({ mode: "local" });
    expect(mockListApproved).not.toHaveBeenCalled();
  });
});

describe("listPublicListingsAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns an empty server payload when no approved rows exist", async () => {
    mockListApproved.mockResolvedValueOnce([]);
    const r = await listPublicListingsAction();
    expect(r.mode).toBe("server");
    if (r.mode !== "server") return;
    expect(r.listings).toEqual([]);
    expect(mockListApproved).toHaveBeenCalledTimes(1);
  });

  it("projects approved server rows through the allowlist mapper", async () => {
    mockListApproved.mockResolvedValueOnce([listingFixture()]);
    const r = await listPublicListingsAction();
    expect(r.mode).toBe("server");
    if (r.mode !== "server") return;
    expect(r.listings).toHaveLength(1);
    const dto = r.listings[0]!;
    expect(dto.publicListingId).toBe(
      "listing:44444444-2222-4333-8444-777777777777",
    );
    expect(dto.source).toBe("approved_listing_intent");
    expect(dto.sourceId).toBe("44444444-2222-4333-8444-777777777777");
    expect(dto.title).toBe("테스트 마사지건");
    expect(dto.category).toBe("massage_gun");
    expect(dto.pickupArea).toBe("마포구");
    expect(dto.prices).toEqual({
      "1d": 9000,
      "3d": 21000,
      "7d": 39000,
    });
    expect(dto.estimatedValue).toBe(200000);
    expect(dto.isPersistedProjection).toBe(true);
    // Bundle 2, Slice 2 — server-projected listings get a clickable
    // detail href that points at the new `/listings/[listingId]`
    // route. Mock-mode local projections (read from the browser via
    // `publicListingService.listPublicListings()`) continue to render
    // as non-clickable cards because the pure mapper still returns
    // `detailHref: undefined` and only this action layer overlays the
    // server detail href.
    expect(dto.detailHref).toBe(
      "/listings/44444444-2222-4333-8444-777777777777",
    );
  });

  it("server-projected listings link to /listings/<sourceId> regardless of how many rows are returned", async () => {
    mockListApproved.mockResolvedValueOnce([
      listingFixture({
        id: "44444444-2222-4333-8444-777777777777",
        status: "approved",
      }),
      listingFixture({
        id: "44444444-2222-4333-8444-aaaaaaaaaaaa",
        status: "approved",
      }),
    ]);
    const r = await listPublicListingsAction();
    if (r.mode !== "server") throw new Error("expected server mode");
    expect(r.listings).toHaveLength(2);
    for (const dto of r.listings) {
      expect(dto.detailHref).toBe(`/listings/${dto.sourceId}`);
      // Must point at /listings, NOT /items — otherwise we'd be
      // routing a server-approved listing through the static-only
      // `/items/[id]` demo path.
      expect(dto.detailHref).not.toMatch(/^\/items\//);
    }
  });

  it("filters out non-approved rows even if the repo accidentally returns them (defense in depth)", async () => {
    // Today `listApprovedListings` server-side filters with
    // `WHERE status='approved'`. We assert the projection mapper is
    // a second gate: even if the repo is changed in a way that lets
    // a draft row leak through, the action drops it.
    mockListApproved.mockResolvedValueOnce([
      listingFixture({
        id: "44444444-2222-4333-8444-aaaaaaaaaaaa",
        status: "draft",
      }),
      listingFixture({
        id: "44444444-2222-4333-8444-bbbbbbbbbbbb",
        status: "human_review_pending",
      }),
      listingFixture({
        id: "44444444-2222-4333-8444-cccccccccccc",
        status: "rejected",
      }),
      listingFixture({
        id: "44444444-2222-4333-8444-777777777777",
        status: "approved",
      }),
    ]);
    const r = await listPublicListingsAction();
    if (r.mode !== "server") throw new Error("expected server mode");
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0]?.sourceId).toBe(
      "44444444-2222-4333-8444-777777777777",
    );
  });

  it("drops rows that fail the projection mapper's minimum-shape gate", async () => {
    mockListApproved.mockResolvedValueOnce([
      // Missing pickupArea — mapper returns null.
      listingFixture({
        id: "44444444-2222-4333-8444-dddddddddddd",
      }),
      {
        ...listingFixture({
          id: "44444444-2222-4333-8444-eeeeeeeeeeee",
        }),
        item: {
          ...listingFixture().item,
          pickupArea: undefined,
        },
      } as ListingIntent,
      // Malformed prices — mapper returns null.
      {
        ...listingFixture({
          id: "44444444-2222-4333-8444-ffffffffffff",
        }),
        pricing: {
          oneDay: Number.NaN,
          threeDays: 21000,
          sevenDays: 39000,
        },
      } as ListingIntent,
    ]);
    const r = await listPublicListingsAction();
    if (r.mode !== "server") throw new Error("expected server mode");
    // Only the well-formed fixture survives.
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0]?.sourceId).toBe(
      "44444444-2222-4333-8444-dddddddddddd",
    );
  });

  it("public DTO never carries rawSellerInput / privateSerialNumber / verification internals / human review notes", async () => {
    mockListApproved.mockResolvedValueOnce([listingFixture()]);
    const r = await listPublicListingsAction();
    if (r.mode !== "server") throw new Error("expected server mode");
    const blob = JSON.stringify(r.listings);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/verification/);
    // The DTO type has no slots for these fields, so a future
    // mapper edit that accidentally tried to copy them would fail
    // type-check. The runtime check above is belt-and-suspenders.
    for (const dto of r.listings) {
      expect("rawSellerInput" in (dto as object)).toBe(false);
      expect("verification" in (dto as object)).toBe(false);
      expect("privateSerialNumber" in (dto as object)).toBe(false);
    }
  });

  it("surfaces an empty server payload (calm degraded state) when the repo throws — no SQL/env/stack leaks", async () => {
    mockListApproved.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await listPublicListingsAction();
    expect(r.mode).toBe("server");
    if (r.mode !== "server") return;
    expect(r.listings).toEqual([]);
    // The action returns no error message — the surface that
    // could leak the underlying message simply does not exist.
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(blob).not.toContain("does not exist");
  });
});

describe("getServerApprovedPublicListingAction — mock / default mode", () => {
  it("returns mode: local without touching the repo", async () => {
    const r = await getServerApprovedPublicListingAction(
      "44444444-2222-4333-8444-777777777777",
    );
    expect(r).toEqual({ mode: "local" });
    expect(mockGetListing).not.toHaveBeenCalled();
  });
});

describe("getServerApprovedPublicListingAction — supabase mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  const VALID_ID = "44444444-2222-4333-8444-777777777777";

  it("rejects malformed listing id without touching the repo (collapse to listing=null)", async () => {
    const r = await getServerApprovedPublicListingAction("not-a-uuid");
    expect(r).toEqual({ mode: "server", listing: null });
    expect(mockGetListing).not.toHaveBeenCalled();
  });

  it("returns listing=null when the row does not exist", async () => {
    mockGetListing.mockResolvedValueOnce(null);
    const r = await getServerApprovedPublicListingAction(VALID_ID);
    expect(r).toEqual({ mode: "server", listing: null });
  });

  it("collapses every non-approved status to listing=null (no enumeration of private rows)", async () => {
    for (const status of [
      "draft",
      "ai_extracted",
      "verification_incomplete",
      "human_review_pending",
      "rejected",
    ] as const) {
      mockGetListing.mockResolvedValueOnce(listingFixture({ status }));
      const r = await getServerApprovedPublicListingAction(VALID_ID);
      expect(r.mode).toBe("server");
      if (r.mode !== "server") return;
      expect(r.listing).toBeNull();
    }
  });

  it("returns a sanitized DTO with detailHref=/listings/<id> for an approved row", async () => {
    mockGetListing.mockResolvedValueOnce(
      listingFixture({ id: VALID_ID, status: "approved" }),
    );
    const r = await getServerApprovedPublicListingAction(VALID_ID);
    expect(r.mode).toBe("server");
    if (r.mode !== "server" || !r.listing) {
      throw new Error("expected approved listing");
    }
    expect(r.listing.publicListingId).toBe(`listing:${VALID_ID}`);
    expect(r.listing.source).toBe("approved_listing_intent");
    expect(r.listing.sourceId).toBe(VALID_ID);
    expect(r.listing.detailHref).toBe(`/listings/${VALID_ID}`);
    expect(r.listing.title).toBe("테스트 마사지건");
    expect(r.listing.category).toBe("massage_gun");
    expect(r.listing.pickupArea).toBe("마포구");
    expect(r.listing.prices).toEqual({
      "1d": 9000,
      "3d": 21000,
      "7d": 39000,
    });
    expect(r.listing.estimatedValue).toBe(200000);
    expect(r.listing.isPersistedProjection).toBe(true);
  });

  it("DTO never carries rawSellerInput / privateSerialNumber / verification internals / human review notes", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "approved" }));
    const r = await getServerApprovedPublicListingAction(VALID_ID);
    if (r.mode !== "server" || !r.listing) {
      throw new Error("expected approved listing");
    }
    const blob = JSON.stringify(r.listing);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/verification/);
  });

  it("repo throw collapses to listing=null without leaking SQL/env/stack", async () => {
    mockGetListing.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await getServerApprovedPublicListingAction(VALID_ID);
    expect(r).toEqual({ mode: "server", listing: null });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("DTO drops rows that fail the projection mapper's minimum-shape gate", async () => {
    mockGetListing.mockResolvedValueOnce({
      ...listingFixture({ status: "approved" }),
      item: {
        ...listingFixture().item,
        pickupArea: undefined,
      },
    } as ListingIntent);
    const r = await getServerApprovedPublicListingAction(VALID_ID);
    expect(r).toEqual({ mode: "server", listing: null });
  });
});

describe("listPublicListingsAction — scope guards", () => {
  it("does not import any rental / payment / claim / trust / handoff / notification module", async () => {
    // Static-text scan over `import` lines only so a comment that
    // mentions "no notifications" cannot give a false positive.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "listings",
      "listPublicListings.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importLines = src
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l));
    const importBlob = importLines.join("\n");
    expect(importBlob).not.toMatch(/rentalIntentRepository/);
    expect(importBlob).not.toMatch(/rentalService/i);
    expect(importBlob).not.toMatch(/createRentalRequest/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/admin\/auth/);
    expect(importBlob).not.toMatch(/listing_secrets/);
  });
});

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
  };
});

import { listApprovedListings } from "@/server/persistence/supabase/listingRepository";
import { listPublicListingsAction } from "./listPublicListings";

const mockListApproved = vi.mocked(listApprovedListings);

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
    // Approved persisted listings render as non-clickable cards in
    // this slice; a public detail route is deferred.
    expect(dto.detailHref).toBeUndefined();
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

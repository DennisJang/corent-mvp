// Listing repository tests. We mock the marketplace client so the test
// runs without any network or env. The point is to assert the validator
// boundary (every untrusted input rejected) and the row→domain mapping.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countListingsByStatus,
  getListingById,
  listApprovedListings,
  saveListing,
} from "./listingRepository";
import { _resetMarketplaceClientForTests } from "./client";
import type { ListingIntent } from "@/domain/intents";

type Capture = { table: string; method: string; args: unknown[] };

function makeFakeClient(
  responders: {
    select?: () => { data: unknown; error: unknown };
    upsert?: () => { data: unknown; error: unknown };
    insert?: () => { data: unknown; error: unknown };
  },
  capture: Capture[],
) {
  // Builder that records every call and returns itself so chained
  // .eq/.order/.limit/.maybeSingle/.select all flow.
  function builder(table: string) {
    return {
      select(cols?: string, opts?: unknown) {
        capture.push({ table, method: "select", args: [cols, opts] });
        return this;
      },
      eq(col: string, val: unknown) {
        capture.push({ table, method: "eq", args: [col, val] });
        return this;
      },
      order(col: string, opts?: unknown) {
        capture.push({ table, method: "order", args: [col, opts] });
        return this;
      },
      limit(n: number) {
        capture.push({ table, method: "limit", args: [n] });
        return this;
      },
      maybeSingle() {
        capture.push({ table, method: "maybeSingle", args: [] });
        return Promise.resolve(responders.select ? responders.select() : { data: null, error: null });
      },
      then(...args: Parameters<Promise<unknown>["then"]>) {
        capture.push({ table, method: "then", args: [] });
        const result = responders.select ? responders.select() : { data: [], error: null };
        return Promise.resolve(result).then(...args);
      },
      upsert(payload: unknown, opts?: unknown) {
        capture.push({ table, method: "upsert", args: [payload, opts] });
        const r = responders.upsert ? responders.upsert() : { data: { id: "ok" }, error: null };
        const chained = {
          select() {
            return {
              maybeSingle() {
                return Promise.resolve(r);
              },
            };
          },
          // For the verification upsert we don't chain .select.
          then(...args: Parameters<Promise<unknown>["then"]>) {
            return Promise.resolve(r).then(...args);
          },
        };
        return chained;
      },
      insert(payload: unknown) {
        capture.push({ table, method: "insert", args: [payload] });
        const r = responders.insert ? responders.insert() : { data: null, error: null };
        return {
          select() {
            return {
              maybeSingle() {
                return Promise.resolve(r);
              },
            };
          },
          then(...args: Parameters<Promise<unknown>["then"]>) {
            return Promise.resolve(r).then(...args);
          },
        };
      },
    };
  }

  return {
    from(table: string) {
      return builder(table);
    },
  };
}

vi.mock("./client", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("./client");
  return {
    ...mod,
    getMarketplaceClient: vi.fn(() => null),
    _resetMarketplaceClientForTests: () => {},
  };
});

import { getMarketplaceClient } from "./client";

const baseValidIntent: ListingIntent = {
  id: "11111111-2222-4333-8444-555555555555",
  sellerId: "22222222-2222-4333-8444-555555555555",
  status: "approved",
  rawSellerInput: "DEMO input",
  item: {
    name: "DEMO 마사지건",
    category: "massage_gun",
    estimatedValue: 220000,
    condition: "lightly_used",
    components: ["본체", "케이블"],
    defects: undefined,
    pickupArea: "DEMO 권역",
  },
  pricing: {
    oneDay: 9000,
    threeDays: 21000,
    sevenDays: 39000,
    sellerAdjusted: false,
  },
  verification: {
    id: "33333333-2222-4333-8444-555555555555",
    safetyCode: "B-428",
    status: "verified",
    checks: {
      frontPhoto: true,
      backPhoto: true,
      componentsPhoto: true,
      workingProof: true,
      safetyCodePhoto: true,
      privateSerialStored: false,
    },
  },
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

beforeEach(() => {
  _resetMarketplaceClientForTests();
});

afterEach(() => {
  vi.mocked(getMarketplaceClient).mockReturnValue(null);
});

describe("listing repository — client unavailable (default safe path)", () => {
  it("returns null for getListingById when client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await getListingById("11111111-2222-4333-8444-555555555555")).toBeNull();
  });

  it("returns [] for listApprovedListings when client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await listApprovedListings()).toEqual([]);
  });

  it("returns {} for countListingsByStatus when client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await countListingsByStatus()).toEqual({});
  });

  it("saveListing fails closed with 'supabase client unavailable'", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await saveListing({ intent: baseValidIntent });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unavailable/);
  });
});

describe("listing repository — input validation rejects untrusted shapes", () => {
  beforeEach(() => {
    // When validation fails, the client should never be reached. Keep
    // it null and assert the error fires before any DB call.
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
  });

  it("rejects non-uuid id", async () => {
    const r = await saveListing({ intent: { ...baseValidIntent, id: "li_abc" } });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown listing status (untrusted client could send 'admin' etc)", async () => {
    const r = await saveListing({
      intent: { ...baseValidIntent, status: "admin" as unknown as ListingIntent["status"] },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects negative price", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        pricing: { ...baseValidIntent.pricing, threeDays: -1 },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects absurdly large estimated value", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        item: { ...baseValidIntent.item, estimatedValue: 100_000_001 },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed safety code", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        verification: { ...baseValidIntent.verification, safetyCode: "BAD" },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown category", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        item: {
          ...baseValidIntent.item,
          category: "electronics" as unknown as ListingIntent["item"]["category"],
        },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown condition", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        item: {
          ...baseValidIntent.item,
          condition: "excellent" as unknown as ListingIntent["item"]["condition"],
        },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects oversize components array", async () => {
    const r = await saveListing({
      intent: {
        ...baseValidIntent,
        item: {
          ...baseValidIntent.item,
          components: new Array(13).fill("x"),
        },
      },
    });
    expect(r.ok).toBe(false);
  });
});

describe("listing repository — happy path with mocked client", () => {
  it("upserts both listings and listing_verifications and returns the id", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        upsert: () => ({ data: { id: "11111111-2222-4333-8444-555555555555" }, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await saveListing({ intent: baseValidIntent });
    expect(r.ok).toBe(true);

    const tables = captured.map((c) => c.table);
    expect(tables).toContain("listings");
    expect(tables).toContain("listing_verifications");

    // No listing payload should leak the private serial number.
    const listingsUpsert = captured.find(
      (c) => c.table === "listings" && c.method === "upsert",
    );
    expect(listingsUpsert).toBeTruthy();
    expect(JSON.stringify(listingsUpsert?.args?.[0])).not.toMatch(/private_serial/);
  });
});

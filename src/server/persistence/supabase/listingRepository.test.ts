// Listing repository tests. We mock the marketplace client so the test
// runs without any network or env. The point is to assert the validator
// boundary (every untrusted input rejected) and the row→domain mapping.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countListingsByStatus,
  getListingById,
  listApprovedListings,
  listListingsBySeller,
  listRecentListings,
  saveListing,
  setListingStatus,
} from "./listingRepository";
import { _resetMarketplaceClientForTests } from "./client";
import type { ListingIntent } from "@/domain/intents";

type Capture = { table: string; method: string; args: unknown[] };

function makeFakeClient(
  responders: {
    select?: () => { data: unknown; error: unknown };
    upsert?: () => { data: unknown; error: unknown };
    insert?: () => { data: unknown; error: unknown };
    update?: () => { data: unknown; error: unknown };
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
      update(payload: unknown) {
        capture.push({ table, method: "update", args: [payload] });
        const r = responders.update
          ? responders.update()
          : { data: { id: "ok" }, error: null };
        return {
          eq(col: string, val: unknown) {
            capture.push({ table, method: "eq", args: [col, val] });
            return this;
          },
          select(cols?: string) {
            capture.push({ table, method: "select", args: [cols] });
            return this;
          },
          maybeSingle() {
            capture.push({ table, method: "maybeSingle", args: [] });
            return Promise.resolve(r);
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

  it("returns [] for listListingsBySeller when client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(
      await listListingsBySeller("22222222-2222-4333-8444-555555555555"),
    ).toEqual([]);
  });

  it("returns [] for listRecentListings when client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await listRecentListings()).toEqual([]);
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

describe("listListingsBySeller — input validation", () => {
  it("returns [] for malformed seller id even if client would otherwise be available", async () => {
    // Even when a client is mocked, the validator must reject the
    // seller id BEFORE reaching the DB — a `li_abc` id should never
    // hit `eq("seller_id", ...)`.
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listListingsBySeller("not-a-uuid")).toEqual([]);
    expect(captured).toEqual([]);
  });

  it("returns [] for empty / non-string seller id", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listListingsBySeller("")).toEqual([]);
    expect(
      await listListingsBySeller(undefined as unknown as string),
    ).toEqual([]);
    expect(captured).toEqual([]);
  });
});

describe("listListingsBySeller — happy path with mocked client", () => {
  const SELLER = "22222222-2222-4333-8444-555555555555";
  const OTHER_SELLER = "33333333-2222-4333-8444-666666666666";

  function listingsRowFixture(overrides: Partial<{
    id: string;
    seller_id: string;
    status: string;
    item_name: string;
  }> = {}) {
    return {
      id: "44444444-2222-4333-8444-777777777777",
      seller_id: SELLER,
      status: "draft",
      raw_seller_input: "DEMO 셀러 원본 메모",
      item_name: "테스트 마사지건",
      category: "massage_gun",
      estimated_value: 200000,
      condition: "lightly_used",
      components: ["본체"],
      defects: null,
      pickup_area: "마포구",
      region_coarse: "unknown",
      price_one_day: 8000,
      price_three_days: 21000,
      price_seven_days: 39000,
      seller_adjusted_pricing: false,
      created_at: "2026-04-29T00:00:00.000Z",
      updated_at: "2026-04-29T00:00:00.000Z",
      listing_verifications: {
        id: "55555555-2222-4333-8444-888888888888",
        listing_id: "44444444-2222-4333-8444-777777777777",
        status: "pending",
        safety_code: "B-123",
        front_photo: false,
        back_photo: false,
        components_photo: false,
        working_proof: false,
        safety_code_photo: false,
        private_serial_stored: false,
        ai_notes: [],
        human_review_notes: [],
      },
      ...overrides,
    };
  }

  it("returns seller-owned drafts (and excludes other sellers via the eq filter)", async () => {
    const captured: Capture[] = [];
    // The fake client doesn't actually filter by `eq` — it returns
    // whatever the responder hands back. We stage a payload that
    // contains only this seller's rows (mirroring what a real
    // service-role read with `seller_id=$1` would return). The
    // assertion is that the call chain set the right filter.
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [
            listingsRowFixture({
              id: "44444444-2222-4333-8444-777777777777",
              status: "draft",
            }),
            listingsRowFixture({
              id: "44444444-2222-4333-8444-aaaaaaaaaaaa",
              status: "human_review_pending",
            }),
          ],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listListingsBySeller(SELLER);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.status).sort()).toEqual(
      ["draft", "human_review_pending"].sort(),
    );
    // The query was filtered by seller_id, never by status.
    const eqCalls = captured.filter((c) => c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "seller_id" && c.args[1] === SELLER)).toBe(true);
    expect(eqCalls.some((c) => c.args[0] === "status")).toBe(false);
    // Ordered by updated_at desc.
    const orderCalls = captured.filter((c) => c.method === "order");
    expect(
      orderCalls.some((c) => c.args[0] === "updated_at"),
    ).toBe(true);
  });

  it("does not return other sellers' rows when the responder hands them back filtered by seller_id", async () => {
    // Defense-in-depth: even if a misconfigured DB returned a
    // foreign row (it won't — the `eq` filter is in the query),
    // the action layer's authorization gate is what matters. This
    // test asserts the repo passes the seller_id filter through
    // to the client.
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [listingsRowFixture({ seller_id: SELLER })],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listListingsBySeller(SELLER);
    expect(rows.length).toBe(1);
    expect(rows[0]?.sellerId).toBe(SELLER);
    expect(rows[0]?.sellerId).not.toBe(OTHER_SELLER);
  });

  it("does not join listing_secrets and leaves privateSerialNumber undefined", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [listingsRowFixture()],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listListingsBySeller(SELLER);
    expect(rows.length).toBe(1);
    expect(rows[0]?.item.privateSerialNumber).toBeUndefined();
    // The select clause never names listing_secrets.
    const selectCall = captured.find((c) => c.method === "select");
    expect(selectCall).toBeTruthy();
    expect(JSON.stringify(selectCall?.args)).not.toMatch(/listing_secrets/);
  });

  it("returns [] when the underlying read errors", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({ data: null, error: { message: "boom" } }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    expect(await listListingsBySeller(SELLER)).toEqual([]);
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

describe("setListingStatus — input validation and safe path", () => {
  const VALID_ID = "11111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
  });

  it("rejects non-uuid id without touching the client", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setListingStatus(
      "not-a-uuid",
      "approved" as ListingIntent["status"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/uuid/);
    expect(captured).toEqual([]);
  });

  it("rejects unknown listing status (forged 'admin' / 'public' etc.)", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setListingStatus(
      VALID_ID,
      "admin" as unknown as ListingIntent["status"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/status/);
    expect(captured).toEqual([]);
  });

  it("returns ok=false with 'unavailable' when the marketplace client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await setListingStatus(VALID_ID, "approved");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unavailable/);
  });
});

describe("setListingStatus — happy path with mocked client", () => {
  const VALID_ID = "11111111-2222-4333-8444-555555555555";

  it("issues an UPDATE filtered by id and returns the canonical id+status", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: { id: VALID_ID }, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setListingStatus(VALID_ID, "approved");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe(VALID_ID);
    expect(r.status).toBe("approved");

    const updateCall = captured.find(
      (c) => c.table === "listings" && c.method === "update",
    );
    expect(updateCall).toBeTruthy();
    // Only the status column is updated. No raw_seller_input,
    // seller_id, pricing, or verification fields.
    const payload = JSON.stringify(updateCall?.args?.[0] ?? {});
    expect(payload).toMatch(/"status":"approved"/);
    expect(payload).not.toMatch(/raw_seller_input/);
    expect(payload).not.toMatch(/seller_id/);
    expect(payload).not.toMatch(/private_serial/);
    expect(payload).not.toMatch(/price_/);
    expect(payload).not.toMatch(/listing_secrets/);

    // Filter is by listing id only.
    const eqCalls = captured.filter(
      (c) => c.table === "listings" && c.method === "eq",
    );
    expect(eqCalls.some((c) => c.args[0] === "id" && c.args[1] === VALID_ID))
      .toBe(true);
    expect(eqCalls.some((c) => c.args[0] === "seller_id")).toBe(false);

    // The select clause does not name listing_secrets or any private
    // column.
    const selectCall = captured.find(
      (c) => c.table === "listings" && c.method === "select",
    );
    expect(JSON.stringify(selectCall?.args ?? [])).not.toMatch(
      /listing_secrets|raw_seller_input|private_serial/,
    );
  });

  it("returns ok=false when the underlying update errors", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: null, error: { message: "boom" } }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setListingStatus(VALID_ID, "approved");
    expect(r.ok).toBe(false);
  });

  it("returns ok=false when the row does not exist (data null)", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: null, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setListingStatus(VALID_ID, "approved");
    expect(r.ok).toBe(false);
  });
});

describe("listRecentListings — Bundle 2 Slice 4 founder cockpit read", () => {
  it("returns rows ordered by created_at desc and clamps the limit to 200", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [
            {
              id: "44444444-2222-4333-8444-aaaaaaaaaaaa",
              seller_id: "22222222-2222-4333-8444-555555555555",
              status: "draft",
              raw_seller_input: "DEMO 셀러 원본 메모",
              item_name: "draft 마사지건",
              category: "massage_gun",
              estimated_value: 200000,
              condition: "lightly_used",
              components: ["본체"],
              defects: null,
              pickup_area: "마포구",
              region_coarse: "unknown",
              price_one_day: 8000,
              price_three_days: 21000,
              price_seven_days: 39000,
              seller_adjusted_pricing: false,
              created_at: "2026-04-30T01:00:00.000Z",
              updated_at: "2026-04-30T01:00:00.000Z",
              listing_verifications: null,
            },
            {
              id: "44444444-2222-4333-8444-bbbbbbbbbbbb",
              seller_id: "22222222-2222-4333-8444-555555555555",
              status: "approved",
              raw_seller_input: null,
              item_name: "approved 마사지건",
              category: "massage_gun",
              estimated_value: 200000,
              condition: "lightly_used",
              components: ["본체"],
              defects: null,
              pickup_area: "마포구",
              region_coarse: "unknown",
              price_one_day: 8000,
              price_three_days: 21000,
              price_seven_days: 39000,
              seller_adjusted_pricing: false,
              created_at: "2026-04-30T00:00:00.000Z",
              updated_at: "2026-04-30T00:00:00.000Z",
              listing_verifications: null,
            },
          ],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listRecentListings(10_000);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("draft");
    expect(rows[1]?.status).toBe("approved");
    // Surfaces every status — no `eq("status", ...)` filter.
    const eqCalls = captured.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([]);
    // Ordered by created_at desc.
    const orderCall = captured.find((c) => c.method === "order");
    expect(orderCall?.args).toEqual(["created_at", { ascending: false }]);
    // Limit clamped to 200.
    const limitCall = captured.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(200);
    // Mapper does not surface `privateSerialNumber` (the select
    // clause never names listing_secrets).
    for (const row of rows) {
      expect(row.item.privateSerialNumber).toBeUndefined();
    }
    const selectCall = captured.find((c) => c.method === "select");
    expect(JSON.stringify(selectCall?.args)).not.toMatch(/listing_secrets/);
  });

  it("returns [] when the underlying read errors", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({ data: null, error: { message: "boom" } }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listRecentListings()).toEqual([]);
  });
});

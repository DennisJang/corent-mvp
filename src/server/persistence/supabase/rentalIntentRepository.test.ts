// Rental intent repository tests. Same pattern as the listing repo:
// mock the client and assert that validators reject anything the
// adapter cannot trust.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRentalEvent,
  countRentalIntentsByStatus,
  listRentalIntents,
  listRentalIntentsBySeller,
  saveRentalIntent,
} from "./rentalIntentRepository";
import { _resetMarketplaceClientForTests } from "./client";
import type { RentalEvent, RentalIntent } from "@/domain/intents";

vi.mock("./client", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("./client");
  return {
    ...mod,
    getMarketplaceClient: vi.fn(() => null),
    _resetMarketplaceClientForTests: () => {},
  };
});

import { getMarketplaceClient } from "./client";

const validIntent: RentalIntent = {
  id: "11111111-2222-4333-8444-555555555555",
  productId: "22222222-2222-4333-8444-555555555555",
  productName: "DEMO 마사지건",
  productCategory: "massage_gun",
  borrowerId: "33333333-2222-4333-8444-555555555555",
  borrowerName: "DEMO 빌리는사람",
  sellerId: "44444444-2222-4333-8444-555555555555",
  sellerName: "DEMO 셀러",
  status: "requested",
  durationDays: 3,
  amounts: {
    rentalFee: 21000,
    safetyDeposit: 100000,
    platformFee: 0,
    sellerPayout: 21000,
    borrowerTotal: 121000,
  },
  payment: {
    provider: "mock",
    status: "not_started",
  },
  pickup: {
    method: "direct",
    status: "not_scheduled",
    locationLabel: "DEMO 권역",
  },
  return: { status: "not_due" },
  settlement: { status: "not_ready", sellerPayout: 21000 },
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

const validEvent: RentalEvent = {
  id: "55555555-2222-4333-8444-555555555555",
  rentalIntentId: validIntent.id,
  fromStatus: null,
  toStatus: "requested",
  at: "2026-04-30T00:01:00.000Z",
  reason: "demo seed",
  actor: "system",
  metadata: { source: "test" },
};

beforeEach(() => {
  _resetMarketplaceClientForTests();
});

afterEach(() => {
  vi.mocked(getMarketplaceClient).mockReturnValue(null);
});

describe("rental intent repository — fail closed when client unavailable", () => {
  it("listRentalIntents returns []", async () => {
    expect(await listRentalIntents()).toEqual([]);
  });
  it("listRentalIntentsBySeller returns []", async () => {
    expect(
      await listRentalIntentsBySeller(
        "44444444-2222-4333-8444-555555555555",
      ),
    ).toEqual([]);
  });
  it("countRentalIntentsByStatus returns {}", async () => {
    expect(await countRentalIntentsByStatus()).toEqual({});
  });
  it("saveRentalIntent fails with 'supabase client unavailable'", async () => {
    const r = await saveRentalIntent(validIntent);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unavailable/);
  });
  it("appendRentalEvent fails with 'supabase client unavailable'", async () => {
    const r = await appendRentalEvent(validEvent);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unavailable/);
  });
});

describe("rental intent repository — input validation rejects untrusted shapes", () => {
  it("rejects non-uuid id", async () => {
    const r = await saveRentalIntent({ ...validIntent, id: "ri_abc" });
    expect(r.ok).toBe(false);
  });

  it("rejects status outside the allowed enum", async () => {
    const r = await saveRentalIntent({
      ...validIntent,
      status: "admin_grant" as unknown as RentalIntent["status"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects duration outside [1, 3, 7]", async () => {
    const r = await saveRentalIntent({
      ...validIntent,
      durationDays: 30 as unknown as RentalIntent["durationDays"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects negative amounts (no client-trust)", async () => {
    const r = await saveRentalIntent({
      ...validIntent,
      amounts: { ...validIntent.amounts, rentalFee: -1 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects amounts above the documented bound", async () => {
    const r = await saveRentalIntent({
      ...validIntent,
      amounts: { ...validIntent.amounts, borrowerTotal: 100_000_001 },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown actor on event", async () => {
    const r = await appendRentalEvent({
      ...validEvent,
      actor: "anon" as unknown as RentalEvent["actor"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects oversize metadata key/string", async () => {
    const longKey = "k".repeat(61);
    const r1 = await appendRentalEvent({
      ...validEvent,
      metadata: { [longKey]: "v" },
    });
    expect(r1.ok).toBe(false);

    const longVal = "v".repeat(241);
    const r2 = await appendRentalEvent({
      ...validEvent,
      metadata: { ok: longVal },
    });
    expect(r2.ok).toBe(false);
  });

  it("rejects metadata that is an array", async () => {
    const r = await appendRentalEvent({
      ...validEvent,
      metadata: ["not", "an", "object"] as unknown as RentalEvent["metadata"],
    });
    expect(r.ok).toBe(false);
  });
});

// Bundle 2 Slice 3 — listRentalIntentsBySeller scoping checks.
type Capture = { table: string; method: string; args: unknown[] };

function makeFakeClient(
  responders: { select?: () => { data: unknown; error: unknown } },
  capture: Capture[],
) {
  function builder(table: string) {
    return {
      select(cols?: string) {
        capture.push({ table, method: "select", args: [cols] });
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
        const r = responders.select
          ? responders.select()
          : { data: [], error: null };
        return Promise.resolve(r);
      },
      then(...args: Parameters<Promise<unknown>["then"]>) {
        const r = responders.select
          ? responders.select()
          : { data: [], error: null };
        return Promise.resolve(r).then(...args);
      },
    };
  }
  return {
    from(table: string) {
      return builder(table);
    },
  };
}

const SELLER = "44444444-2222-4333-8444-555555555555";
const OTHER_SELLER = "55555555-2222-4333-8444-555555555555";

function rentalRowFixture(
  overrides: Partial<{
    id: string;
    seller_id: string;
    borrower_id: string;
    status: string;
    product_name: string;
  }> = {},
) {
  return {
    id: "66666666-2222-4333-8444-777777777777",
    listing_id: "22222222-2222-4333-8444-555555555555",
    seller_id: SELLER,
    borrower_id: "33333333-2222-4333-8444-555555555555",
    borrower_display_name: "DEMO 빌리는사람",
    seller_display_name: null,
    product_name: "DEMO 마사지건",
    product_category: "massage_gun",
    status: "requested",
    duration_days: 3,
    rental_fee: 21000,
    safety_deposit: 30000,
    platform_fee: 0,
    seller_payout: 21000,
    borrower_total: 51000,
    payment_provider: "mock",
    payment_session_id: null,
    payment_status: "not_started",
    payment_failure_reason: null,
    pickup_method: "direct",
    pickup_status: "not_scheduled",
    pickup_location_label: "마포구",
    return_status: "not_due",
    return_due_at: null,
    return_confirmed_at: null,
    settlement_status: "not_ready",
    settlement_blocked_reason: null,
    settlement_settled_at: null,
    created_at: "2026-04-30T00:00:00.000Z",
    updated_at: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("listRentalIntentsBySeller — input validation", () => {
  it("returns [] for malformed seller id without touching the client", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listRentalIntentsBySeller("not-a-uuid")).toEqual([]);
    expect(captured).toEqual([]);
  });

  it("returns [] for empty / non-string seller id", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listRentalIntentsBySeller("")).toEqual([]);
    expect(
      await listRentalIntentsBySeller(undefined as unknown as string),
    ).toEqual([]);
    expect(captured).toEqual([]);
  });
});

describe("listRentalIntentsBySeller — happy path with mocked client", () => {
  it("filters by seller_id and orders by updated_at desc; never filters by status", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [
            rentalRowFixture({
              id: "66666666-2222-4333-8444-aaaaaaaaaaaa",
              status: "requested",
            }),
            rentalRowFixture({
              id: "66666666-2222-4333-8444-bbbbbbbbbbbb",
              status: "requested",
            }),
          ],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listRentalIntentsBySeller(SELLER);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sellerId === SELLER)).toBe(true);

    const eqCalls = captured.filter((c) => c.method === "eq");
    expect(
      eqCalls.some((c) => c.args[0] === "seller_id" && c.args[1] === SELLER),
    ).toBe(true);
    // Status filter must NOT be applied at the repo layer — the
    // dashboard surfaces every state.
    expect(eqCalls.some((c) => c.args[0] === "status")).toBe(false);

    const orderCalls = captured.filter((c) => c.method === "order");
    expect(orderCalls.some((c) => c.args[0] === "updated_at")).toBe(true);
  });

  it("does not include cross-seller rows when the responder hands them back filtered by seller_id", async () => {
    // Defense-in-depth: the eq filter is in the query; this test
    // asserts the repo passes the seller_id filter through.
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [rentalRowFixture({ seller_id: SELLER })],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listRentalIntentsBySeller(SELLER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sellerId).toBe(SELLER);
    expect(rows[0]?.sellerId).not.toBe(OTHER_SELLER);
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

    expect(await listRentalIntentsBySeller(SELLER)).toEqual([]);
  });
});

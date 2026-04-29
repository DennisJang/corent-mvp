// Rental intent repository tests. Same pattern as the listing repo:
// mock the client and assert that validators reject anything the
// adapter cannot trust.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRentalEvent,
  countRentalIntentsByStatus,
  listRentalIntents,
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

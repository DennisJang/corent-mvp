// Tests for the rental request client adapter (Bundle 2, Slice 2).
//
// Covers:
//
//   - The adapter forwards ONLY `{ listingId, durationDays }` to
//     the server action. Any extra key a forged caller smuggles in
//     via cast does NOT reach the server payload.
//   - Every IntentResult code is mapped to a typed `kind` envelope.
//   - The success envelope's amounts are SERVER-DERIVED (the
//     adapter copies `result.value.*` verbatim — the component
//     never reuses a stale client-computed amount).
//   - A thrown server action call collapses to `{ kind: "error" }`;
//     the original error message never reaches the client.
//   - The adapter does not import any module outside the
//     `createRentalRequestAction` boundary.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/rentals/createRentalRequest", () => ({
  createRentalRequestAction: vi.fn(),
}));

import { createRentalRequestAction } from "@/server/rentals/createRentalRequest";
import { submitRentalRequest } from "./rentalRequestClient";

const mockAction = vi.mocked(createRentalRequestAction);

const LISTING_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mockAction.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("submitRentalRequest — payload forwarding", () => {
  it("forwards only listingId + durationDays to the server action", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "00000000-0000-0000-0000-000000000001",
        status: "requested",
        durationDays: 3,
        rentalFee: 21000,
        safetyDeposit: 30000,
        borrowerTotal: 51000,
        productName: "테스트 마사지건",
        productCategory: "massage_gun",
      },
    });
    await submitRentalRequest({ listingId: LISTING_ID, durationDays: 3 });
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith({
      listingId: LISTING_ID,
      durationDays: 3,
    });
  });

  it("ignores any forged sellerId / borrowerId / price / status / payment / pickup / return / settlement / adminId / role / capability / approval / trustScore / claimReview keys on the input", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "00000000-0000-0000-0000-000000000002",
        status: "requested",
        durationDays: 1,
        rentalFee: 9000,
        safetyDeposit: 30000,
        borrowerTotal: 39000,
        productName: "테스트 마사지건",
        productCategory: "massage_gun",
      },
    });
    // The TS signature only allows listingId + durationDays. A
    // forged caller passing extras via `as` cast must not reach
    // the server payload.
    await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 1,
      // @ts-expect-error — forged extra
      sellerId: "FORGED_SELLER",
      // @ts-expect-error — forged extra
      borrowerId: "FORGED_BORROWER",
      // @ts-expect-error — forged extra
      rentalFee: 1,
      // @ts-expect-error — forged extra
      amounts: { rentalFee: 1, safetyDeposit: 0, borrowerTotal: 1 },
      // @ts-expect-error — forged extra
      status: "settled",
      // @ts-expect-error — forged extra
      payment: { provider: "toss", status: "paid", sessionId: "FORGED" },
      // @ts-expect-error — forged extra
      pickup: { status: "confirmed" },
      // @ts-expect-error — forged extra
      return: { status: "confirmed" },
      // @ts-expect-error — forged extra
      settlement: { status: "settled" },
      // @ts-expect-error — forged extra
      adminId: "FORGED_ADMIN",
      // @ts-expect-error — forged extra
      role: "admin",
      // @ts-expect-error — forged extra
      capability: "founder",
      // @ts-expect-error — forged extra
      approval: true,
      // @ts-expect-error — forged extra
      trustScore: 999,
      // @ts-expect-error — forged extra
      claimReview: { status: "approved" },
    });
    const sent = mockAction.mock.calls[0]?.[0];
    expect(sent).toEqual({ listingId: LISTING_ID, durationDays: 1 });
    // Belt-and-suspenders: assert that no forged key reached the
    // server action payload, even though the contract says the
    // adapter copies only the two whitelisted fields.
    const sentRecord = sent as unknown as Record<string, unknown>;
    for (const k of [
      "sellerId",
      "borrowerId",
      "rentalFee",
      "amounts",
      "status",
      "payment",
      "pickup",
      "return",
      "settlement",
      "adminId",
      "role",
      "capability",
      "approval",
      "trustScore",
      "claimReview",
    ]) {
      expect(sentRecord[k]).toBeUndefined();
    }
  });
});

describe("submitRentalRequest — IntentResult → UI kind mapping", () => {
  it("maps ok → { kind: 'ok' } with server-derived amounts (verbatim)", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "00000000-0000-0000-0000-000000000003",
        status: "requested",
        durationDays: 7,
        rentalFee: 39000,
        safetyDeposit: 30000,
        borrowerTotal: 69000,
        productName: "테스트 마사지건",
        productCategory: "massage_gun",
      },
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 7,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.request).toEqual({
      id: "00000000-0000-0000-0000-000000000003",
      durationDays: 7,
      rentalFee: 39000,
      safetyDeposit: 30000,
      borrowerTotal: 69000,
      productName: "테스트 마사지건",
      productCategory: "massage_gun",
    });
  });

  it("maps unauthenticated", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unauthenticated",
      message: "no actor resolved",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "unauthenticated" });
  });

  it("maps ownership", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "ownership",
      message: "actor kind seller cannot run a renter command",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "ownership" });
  });

  it("maps not_found", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "not_found",
      message: "listing_not_found",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "not_found" });
  });

  it("maps input", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "input",
      message: "duration_invalid",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "input" });
  });

  it("maps unsupported", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unsupported",
      message: "rental_request_requires_server_backend",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "unsupported" });
  });

  it("maps internal / unknown codes to { kind: 'error' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "create_rental_request_failed",
    });
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "error" });

    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "conflict",
      message: "unhandled",
    });
    const r2 = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r2).toEqual({ kind: "error" });
  });

  it("maps a thrown server action to { kind: 'error' } without leaking the underlying message", async () => {
    mockAction.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await submitRentalRequest({
      listingId: LISTING_ID,
      durationDays: 3,
    });
    expect(r).toEqual({ kind: "error" });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("submitRentalRequest — scope guard", () => {
  it("does not import any rental / payment / claim / trust / handoff / notification module beyond the createRentalRequest action", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "lib",
      "client",
      "rentalRequestClient.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importLines = src
      .split(/\r?\n/)
      .filter((l) => /^\s*import\b/.test(l));
    const importBlob = importLines.join("\n");
    expect(importBlob).not.toMatch(/rentalIntentRepository/);
    expect(importBlob).not.toMatch(/rentalService/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/listing_secrets/);
    // `getMockRenterSession` must not be used to derive identity
    // for the server-mode path.
    expect(importBlob).not.toMatch(/getMockRenterSession/);
    // Allowed import: the server action.
    expect(importBlob).toMatch(/createRentalRequestAction/);
  });
});

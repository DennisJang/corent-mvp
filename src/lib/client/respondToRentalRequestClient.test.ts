// Tests for the seller approve / decline client adapter.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/rentals/respondToRentalRequest", () => ({
  approveRentalRequestAction: vi.fn(),
  declineRentalRequestAction: vi.fn(),
}));

import {
  approveRentalRequestAction,
  declineRentalRequestAction,
} from "@/server/rentals/respondToRentalRequest";
import {
  approveRequest,
  declineRequest,
} from "./respondToRentalRequestClient";

const mockApprove = vi.mocked(approveRentalRequestAction);
const mockDecline = vi.mocked(declineRentalRequestAction);

const RENTAL_ID = "66666666-2222-4333-8444-777777777777";

beforeEach(() => {
  mockApprove.mockReset();
  mockDecline.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("approveRequest — payload + mapping", () => {
  it("forwards only rentalIntentId to the server action", async () => {
    mockApprove.mockResolvedValueOnce({
      ok: true,
      value: {
        id: RENTAL_ID,
        status: "seller_approved",
        alreadyResponded: false,
      },
    });
    await approveRequest({ rentalIntentId: RENTAL_ID });
    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove).toHaveBeenCalledWith({ rentalIntentId: RENTAL_ID });
  });

  it("ignores any forged sellerId / borrowerId / status / amounts / adminId / role / capability fields", async () => {
    mockApprove.mockResolvedValueOnce({
      ok: true,
      value: {
        id: RENTAL_ID,
        status: "seller_approved",
        alreadyResponded: false,
      },
    });
    await approveRequest({
      rentalIntentId: RENTAL_ID,
      // @ts-expect-error — forged extra
      sellerId: "FORGED_SELLER",
      // @ts-expect-error — forged extra
      borrowerId: "FORGED_BORROWER",
      // @ts-expect-error — forged extra
      status: "settled",
      // @ts-expect-error — forged extra
      amounts: { rentalFee: 1, safetyDeposit: 0, borrowerTotal: 1 },
      // @ts-expect-error — forged extra
      adminId: "FORGED_ADMIN",
      // @ts-expect-error — forged extra
      role: "admin",
      // @ts-expect-error — forged extra
      capability: "founder",
    });
    const sent = mockApprove.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ rentalIntentId: RENTAL_ID });
    for (const k of [
      "sellerId",
      "borrowerId",
      "status",
      "amounts",
      "adminId",
      "role",
      "capability",
    ]) {
      expect(sent[k]).toBeUndefined();
    }
  });

  it("maps ok → { kind: 'ok', result }", async () => {
    mockApprove.mockResolvedValueOnce({
      ok: true,
      value: {
        id: RENTAL_ID,
        status: "seller_approved",
        alreadyResponded: true,
      },
    });
    const r = await approveRequest({ rentalIntentId: RENTAL_ID });
    expect(r).toEqual({
      kind: "ok",
      result: {
        id: RENTAL_ID,
        status: "seller_approved",
        alreadyResponded: true,
      },
    });
  });

  it("maps every IntentResult code to a typed envelope", async () => {
    for (const [code, expected] of [
      ["unauthenticated", "unauthenticated"],
      ["ownership", "ownership"],
      ["not_found", "not_found"],
      ["input", "input"],
      ["conflict", "conflict"],
      ["unsupported", "unsupported"],
      ["internal", "error"],
    ] as const) {
      mockApprove.mockResolvedValueOnce({
        ok: false,
        code: code as never,
        message: "synthetic",
      });
      const r = await approveRequest({ rentalIntentId: RENTAL_ID });
      expect(r).toEqual({ kind: expected });
    }
  });

  it("maps a thrown server action to { kind: 'error' } without leaking the underlying message", async () => {
    mockApprove.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await approveRequest({ rentalIntentId: RENTAL_ID });
    expect(r).toEqual({ kind: "error" });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("declineRequest — payload + mapping", () => {
  it("forwards only rentalIntentId to the decline action", async () => {
    mockDecline.mockResolvedValueOnce({
      ok: true,
      value: {
        id: RENTAL_ID,
        status: "seller_cancelled",
        alreadyResponded: false,
      },
    });
    await declineRequest({ rentalIntentId: RENTAL_ID });
    expect(mockDecline).toHaveBeenCalledTimes(1);
    expect(mockDecline).toHaveBeenCalledWith({ rentalIntentId: RENTAL_ID });
  });

  it("ignores forged extra payload fields", async () => {
    mockDecline.mockResolvedValueOnce({
      ok: true,
      value: {
        id: RENTAL_ID,
        status: "seller_cancelled",
        alreadyResponded: false,
      },
    });
    await declineRequest({
      rentalIntentId: RENTAL_ID,
      // @ts-expect-error — forged extra
      sellerId: "FORGED",
      // @ts-expect-error — forged extra
      reason: "FORGED_REASON",
    });
    const sent = mockDecline.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ rentalIntentId: RENTAL_ID });
    expect(sent.sellerId).toBeUndefined();
    expect(sent.reason).toBeUndefined();
  });

  it("maps conflict (e.g. seller_approved → seller_cancelled denied) to typed envelope", async () => {
    mockDecline.mockResolvedValueOnce({
      ok: false,
      code: "conflict",
      message: "invalid_transition_from_seller_approved_to_seller_cancelled",
    });
    const r = await declineRequest({ rentalIntentId: RENTAL_ID });
    expect(r).toEqual({ kind: "conflict" });
  });
});

describe("scope guard", () => {
  it("imports only the two server actions (no rental service / payment / claim / trust / handoff / notification / mockSession)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "lib",
      "client",
      "respondToRentalRequestClient.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    // Strip line comments first so doc text (e.g. the docstring
    // listing forbidden authority fields by name) does not poison
    // the lazy regex that matches `import … from "…"` blocks.
    const codeOnly = src.replace(/^\s*\/\/.*$/gm, "");
    const importBlob = (
      codeOnly.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
    expect(importBlob).not.toMatch(/rentalService/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/getMockSellerSession/);
    expect(importBlob).not.toMatch(/getMockRenterSession/);
    expect(importBlob).not.toMatch(/@\/lib\/auth\/mockSession/);
    expect(importBlob).toMatch(/approveRentalRequestAction/);
    expect(importBlob).toMatch(/declineRentalRequestAction/);
  });
});

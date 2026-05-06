// Tests for the borrower `/requests` page server-mode client adapter
// (Bundle 3, Slice 2). Mirrors `sellerDashboardRequestsClient.test.ts`
// pattern.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/rentals/listMyRentalRequests", () => ({
  listMyRentalRequestsAction: vi.fn(),
}));

import { listMyRentalRequestsAction } from "@/server/rentals/listMyRentalRequests";
import { loadMyRequests } from "./myRequestsClient";

const mockAction = vi.mocked(listMyRentalRequestsAction);

beforeEach(() => {
  mockAction.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadMyRequests — IntentResult → UI envelope mapping", () => {
  it("maps ok+local → { kind: 'local' }", async () => {
    mockAction.mockResolvedValueOnce({ ok: true, value: { mode: "local" } });
    const r = await loadMyRequests();
    expect(r).toEqual({ kind: "local" });
  });

  it("maps ok+server → { kind: 'server', requests }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        mode: "server",
        requests: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            listingId: "00000000-0000-0000-0000-000000000099",
            productName: "테스트 마사지건",
            productCategory: "massage_gun",
            sellerDisplayName: "DEMO 셀러",
            durationDays: 3,
            status: "requested",
            rentalFee: 21000,
            borrowerTotal: 51000,
            pickupArea: "마포구",
            createdAt: "2026-04-30T00:00:00.000Z",
            updatedAt: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    });
    const r = await loadMyRequests();
    expect(r.kind).toBe("server");
    if (r.kind !== "server") return;
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]?.productName).toBe("테스트 마사지건");
    expect(r.requests[0]?.sellerDisplayName).toBe("DEMO 셀러");
  });

  it("maps every typed failure code to { kind: 'error' }", async () => {
    for (const code of [
      "unauthenticated",
      "ownership",
      "input",
      "not_found",
      "conflict",
      "unsupported",
      "internal",
    ] as const) {
      mockAction.mockResolvedValueOnce({
        ok: false,
        code,
        message: "synthetic",
      });
      const r = await loadMyRequests();
      expect(r).toEqual({ kind: "error" });
    }
  });

  it("maps a thrown server action to { kind: 'error' } without leaking the underlying message", async () => {
    mockAction.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await loadMyRequests();
    expect(r).toEqual({ kind: "error" });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("does not silently fall back to local data on a server-mode failure", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "list_my_requests_failed",
    });
    const r = await loadMyRequests();
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect((r as Record<string, unknown>).requests).toBeUndefined();
  });
});

describe("loadMyRequests — scope guard", () => {
  it("does not import any payment / lifecycle / claim / trust / handoff / notification module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "lib",
      "client",
      "myRequestsClient.ts",
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
    expect(importBlob).not.toMatch(/getMockSellerSession/);
    expect(importBlob).not.toMatch(/getMockRenterSession/);
    expect(importBlob).not.toMatch(/respondToRentalRequest/);
    // Allowed: the action only.
    expect(importBlob).toMatch(/listMyRentalRequestsAction/);
  });
});

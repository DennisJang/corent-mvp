// Tests for the seller dashboard server-mode requests client
// adapter (Bundle 2, Slice 3). Mirrors the
// `sellerDashboardListingsClient` pattern from PR 5G.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/rentals/listSellerRentalRequests", () => ({
  listSellerRentalRequestsAction: vi.fn(),
}));

import { listSellerRentalRequestsAction } from "@/server/rentals/listSellerRentalRequests";
import { loadSellerRequests } from "./sellerDashboardRequestsClient";

const mockAction = vi.mocked(listSellerRentalRequestsAction);

beforeEach(() => {
  mockAction.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadSellerRequests — IntentResult → UI envelope mapping", () => {
  it("maps ok+local → { kind: 'local' }", async () => {
    mockAction.mockResolvedValueOnce({ ok: true, value: { mode: "local" } });
    const r = await loadSellerRequests();
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
            borrowerDisplayName: "DEMO 빌리는사람",
            durationDays: 3,
            status: "requested",
            rentalFee: 21000,
            safetyDeposit: 30000,
            borrowerTotal: 51000,
            pickupArea: "마포구",
            createdAt: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    });
    const r = await loadSellerRequests();
    expect(r.kind).toBe("server");
    if (r.kind !== "server") return;
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]?.productName).toBe("테스트 마사지건");
    expect(r.requests[0]?.borrowerDisplayName).toBe("DEMO 빌리는사람");
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
      const r = await loadSellerRequests();
      expect(r).toEqual({ kind: "error" });
    }
  });

  it("maps a thrown server action to { kind: 'error' } without leaking the underlying message", async () => {
    mockAction.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await loadSellerRequests();
    expect(r).toEqual({ kind: "error" });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("does not silently fall back to local data on a server-mode failure", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "list_seller_requests_failed",
    });
    const r = await loadSellerRequests();
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    // No `requests` payload on error envelopes — the dashboard
    // renders zero rows (and the failure caption), never local
    // mock fixtures as substitutes.
    expect((r as Record<string, unknown>).requests).toBeUndefined();
  });
});

describe("loadSellerRequests — scope guard", () => {
  it("does not import any payment / lifecycle / claim / trust / handoff / notification module", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "lib",
      "client",
      "sellerDashboardRequestsClient.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    // Grab every multi-line `import ... from "...";` statement, not
    // just the lines starting with `import` — multi-line imports
    // wrap the symbol list across several lines.
    const importBlob = (src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? [])
      .join("\n");
    expect(importBlob).not.toMatch(/rentalService/);
    expect(importBlob).not.toMatch(/rentalIntentMachine/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/getMockSellerSession/);
    expect(importBlob).not.toMatch(/getMockRenterSession/);
    // Allowed: the action only.
    expect(importBlob).toMatch(/listSellerRentalRequestsAction/);
  });
});

// Tests for the founder publish action client adapter (Bundle 2,
// Slice 4 — wires Bundle 1 Part 3's `publishListingAction` into
// the cockpit UI).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/listings/publishListing", () => ({
  publishListingAction: vi.fn(),
}));

import { publishListingAction } from "@/server/listings/publishListing";
import { publishListingFromCockpit } from "./publishListingClient";

const mockAction = vi.mocked(publishListingAction);

const LISTING_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mockAction.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publishListingFromCockpit — payload forwarding", () => {
  it("forwards only listingId to the server action", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: LISTING_ID,
        status: "approved",
        alreadyApproved: false,
      },
    });
    await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith({ listingId: LISTING_ID });
  });

  it("ignores any forged sellerId / status / adminId / role / capability / approval keys (compile + runtime)", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: LISTING_ID,
        status: "approved",
        alreadyApproved: false,
      },
    });
    await publishListingFromCockpit({
      listingId: LISTING_ID,
      // @ts-expect-error — forged extra
      sellerId: "FORGED_SELLER",
      // @ts-expect-error — forged extra
      status: "approved",
      // @ts-expect-error — forged extra
      adminId: "FORGED_ADMIN",
      // @ts-expect-error — forged extra
      role: "founder",
      // @ts-expect-error — forged extra
      capability: "admin",
      // @ts-expect-error — forged extra
      approval: true,
      // @ts-expect-error — forged extra
      trustScore: 999,
    });
    const sent = mockAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ listingId: LISTING_ID });
    for (const k of [
      "sellerId",
      "status",
      "adminId",
      "role",
      "capability",
      "approval",
      "trustScore",
    ]) {
      expect(sent[k]).toBeUndefined();
    }
  });
});

describe("publishListingFromCockpit — IntentResult → UI mapping", () => {
  it("maps ok → { kind: 'ok' } with id + alreadyApproved", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: {
        id: LISTING_ID,
        status: "approved",
        alreadyApproved: true,
      },
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "ok", id: LISTING_ID, alreadyApproved: true });
  });

  it("maps unauthenticated", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unauthenticated",
      message: "founder_session_required",
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "unauthenticated" });
  });

  it("maps not_found", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "not_found",
      message: "listing_not_found",
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "not_found" });
  });

  it("maps input", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "input",
      message: "listing_id_invalid",
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "input" });
  });

  it("maps unsupported", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unsupported",
      message: "publication_requires_server_backend",
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "unsupported" });
  });

  it("maps internal / other codes to { kind: 'error' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "publish_listing_failed",
    });
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "error" });
  });

  it("maps a thrown server action to { kind: 'error' } without leaking the underlying message", async () => {
    mockAction.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await publishListingFromCockpit({ listingId: LISTING_ID });
    expect(r).toEqual({ kind: "error" });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("relation");
    expect(blob).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("publishListingFromCockpit — scope guard", () => {
  it("imports only publishListingAction from @/server/**", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "lib",
      "client",
      "publishListingClient.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    const importBlob = (
      src.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
    expect(importBlob).not.toMatch(/rentalService/);
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/getMockSellerSession/);
    expect(importBlob).not.toMatch(/getMockRenterSession/);
    // The only allowed @/server/** import is the publish action.
    expect(importBlob).toMatch(/publishListingAction/);
  });
});

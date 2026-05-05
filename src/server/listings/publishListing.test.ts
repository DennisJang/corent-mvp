// Tests for the founder-controlled public listing publication
// action (Validation Bundle 1, Part 3). Covers:
//
//   - shape validation (non-uuid listingId rejected before auth probe)
//   - founder gate (no session → unauthenticated, no DB call)
//   - mock backend mode → typed `unsupported` (no DB call)
//   - supabase backend mode + missing listing → `not_found`
//   - supabase backend mode + draft listing → repo update issued,
//     ok envelope with `alreadyApproved=false`
//   - supabase backend mode + already-approved listing → ok envelope
//     with `alreadyApproved=true`, NO repo update issued
//   - normal seller without founder allowlist cannot self-publish
//   - forged payload `sellerId` / `status` / `role` / `capability` /
//     `adminId` / `approval` is ignored (compile + runtime)
//   - repo throw maps to typed `internal` (no SQL/env/stack leakage)
//   - response DTO does NOT carry rawSellerInput / privateSerialNumber
//     / verification internals / sellerId
//
// We mock the repo and the founder session reader so the test runs
// without env or DB.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingIntent } from "@/domain/intents";

vi.mock("@/server/persistence/supabase/listingRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/listingRepository")
  >("@/server/persistence/supabase/listingRepository");
  return {
    ...actual,
    getListingById: vi.fn(async () => null),
    setListingStatus: vi.fn(async () => ({ ok: true, id: "ok", status: "approved" })),
  };
});

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => null),
}));

import {
  getListingById,
  setListingStatus,
} from "@/server/persistence/supabase/listingRepository";
import {
  _resetSessionReaderForTests,
  _setSessionReaderForTests,
} from "@/server/admin/auth";
import { publishListingAction } from "./publishListing";

const mockGetListing = vi.mocked(getListingById);
const mockSetStatus = vi.mocked(setListingStatus);

const LISTING_ID = "11111111-2222-4333-8444-555555555555";
const SELLER_ID = "22222222-2222-4333-8444-555555555555";
const FOUNDER_EMAIL = "founder@example.com";

function listingFixture(overrides: Partial<ListingIntent> = {}): ListingIntent {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    status: "draft",
    rawSellerInput: "DEMO 셀러 원본 메모 (절대 노출 금지)",
    item: {
      name: "테스트 마사지건",
      category: "massage_gun",
      estimatedValue: 200000,
      condition: "lightly_used",
      components: ["본체"],
      defects: undefined,
      privateSerialNumber: "SN-SECRET-12345",
      pickupArea: "마포구",
    },
    pricing: {
      oneDay: 8000,
      threeDays: 21000,
      sevenDays: 39000,
      sellerAdjusted: false,
    },
    verification: {
      id: "55555555-2222-4333-8444-888888888888",
      safetyCode: "B-123",
      status: "pending",
      checks: {
        frontPhoto: false,
        backPhoto: false,
        componentsPhoto: false,
        workingProof: false,
        safetyCodePhoto: false,
        privateSerialStored: false,
      },
      humanReviewNotes: ["내부 메모 — 외부 노출 금지"],
    },
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

function asFounder() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => ({ email: FOUNDER_EMAIL }));
}

function asNonFounder() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => ({ email: "attacker@example.com" }));
}

function asAnonymous() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => null);
}

beforeEach(() => {
  mockGetListing.mockReset();
  mockGetListing.mockResolvedValue(null);
  mockSetStatus.mockReset();
  mockSetStatus.mockResolvedValue({
    ok: true,
    id: LISTING_ID,
    status: "approved",
  });
});

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
  _resetSessionReaderForTests();
  vi.unstubAllEnvs();
});

describe("publishListingAction — shape validation", () => {
  beforeEach(() => {
    asFounder();
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("rejects non-uuid listingId with code 'input' (no auth or DB call needed)", async () => {
    const r = await publishListingAction({ listingId: "not-a-uuid" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("rejects empty listingId with code 'input'", async () => {
    const r = await publishListingAction({ listingId: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
  });

  it("rejects missing listingId with code 'input'", async () => {
    const r = await publishListingAction(
      {} as unknown as { listingId: string },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
  });
});

describe("publishListingAction — founder authority gate", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns 'unauthenticated' when no session is present", async () => {
    asAnonymous();
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unauthenticated' for a non-allowlisted Supabase user (normal seller cannot self-publish)", async () => {
    asNonFounder();
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unauthenticated' when the allowlist env var is missing entirely", async () => {
    _setSessionReaderForTests(async () => ({ email: FOUNDER_EMAIL }));
    // Note: no FOUNDER_ADMIN_EMAIL_ALLOWLIST set → fail closed.
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});

describe("publishListingAction — mock / default backend mode", () => {
  beforeEach(() => {
    asFounder();
  });

  it("returns 'unsupported' when backend is not supabase (no DB call)", async () => {
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockGetListing).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' when CORENT_BACKEND_MODE is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
  });
});

describe("publishListingAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    asFounder();
  });

  it("returns 'not_found' when the listing does not exist (no update issued)", async () => {
    mockGetListing.mockResolvedValueOnce(null);
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("not_found");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("publishes a draft listing and returns the ok envelope with alreadyApproved=false", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "draft" }));
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: LISTING_ID,
      status: "approved",
      alreadyApproved: false,
    });
    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(LISTING_ID, "approved");
  });

  it("publishes a human_review_pending listing the same way (any non-approved → approved)", async () => {
    mockGetListing.mockResolvedValueOnce(
      listingFixture({ status: "human_review_pending" }),
    );
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.alreadyApproved).toBe(false);
    expect(mockSetStatus).toHaveBeenCalledWith(LISTING_ID, "approved");
  });

  it("is idempotent: an already-approved listing returns ok with alreadyApproved=true (no update issued)", async () => {
    mockGetListing.mockResolvedValueOnce(
      listingFixture({ status: "approved" }),
    );
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: LISTING_ID,
      status: "approved",
      alreadyApproved: true,
    });
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("response DTO does NOT carry rawSellerInput / privateSerialNumber / verification internals / sellerId", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "draft" }));
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const blob = JSON.stringify(r.value);
    expect(blob).not.toContain("DEMO 셀러 원본 메모");
    expect(blob).not.toContain("SN-SECRET-12345");
    expect(blob).not.toContain("내부 메모");
    expect(blob).not.toContain(SELLER_ID);
    expect(blob).not.toMatch(/safetyCode/);
    expect(blob).not.toMatch(/rawSellerInput/);
    expect(blob).not.toMatch(/privateSerialNumber/);
    expect(blob).not.toMatch(/humanReviewNotes/);
    expect(blob).not.toMatch(/sellerId/);
  });

  it("ignores any client-supplied sellerId / status / role / capability / adminId / approval (compile + runtime)", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "draft" }));
    // The payload type only allows `listingId`. A forged caller
    // passing extra fields via cast must NOT influence the
    // outcome — the action only reads `payload.listingId` and
    // resolves authority via `requireFounderSession`.
    const r = await publishListingAction({
      listingId: LISTING_ID,
      // @ts-expect-error — forged extra field not in the payload type
      sellerId: "forged-seller-id",
      // @ts-expect-error — forged extra field not in the payload type
      status: "approved",
      // @ts-expect-error — forged extra field not in the payload type
      role: "admin",
      // @ts-expect-error — forged extra field not in the payload type
      capability: "founder",
      // @ts-expect-error — forged extra field not in the payload type
      adminId: "forged-admin-id",
      // @ts-expect-error — forged extra field not in the payload type
      approval: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The repo update was called with the canonical id, not any
    // forged seller id from the payload.
    expect(mockSetStatus).toHaveBeenCalledWith(LISTING_ID, "approved");
  });

  it("forged status='approved' from a non-founder caller is still rejected (allowlist is the only signal)", async () => {
    asNonFounder();
    const r = await publishListingAction({
      listingId: LISTING_ID,
      // @ts-expect-error — forged extra field not in the payload type
      status: "approved",
      // @ts-expect-error — forged extra field not in the payload type
      role: "founder",
      // @ts-expect-error — forged extra field not in the payload type
      capability: "admin",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("maps repo getListingById throw to typed 'internal' without leaking SQL / env / stack", async () => {
    mockGetListing.mockRejectedValueOnce(
      new Error(
        'relation "listings" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toContain("does not exist");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("maps repo setListingStatus result error to typed 'internal' without leaking the underlying message", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "draft" }));
    mockSetStatus.mockResolvedValueOnce({
      ok: false,
      error: 'relation does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
    });
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("maps repo setListingStatus throw to typed 'internal'", async () => {
    mockGetListing.mockResolvedValueOnce(listingFixture({ status: "draft" }));
    mockSetStatus.mockRejectedValueOnce(new Error("boom"));
    const r = await publishListingAction({ listingId: LISTING_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
  });
});

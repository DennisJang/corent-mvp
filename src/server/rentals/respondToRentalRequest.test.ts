// Tests for the seller approve / decline rental request actions.
//
// Coverage matrix:
//
//   - mock backend mode → `unsupported` (no DB call)
//   - supabase mode + null actor → `unauthenticated` (via runner)
//   - supabase mode + mock-sourced actor → `unsupported`
//     (defense in depth)
//   - supabase mode + renter actor → `ownership` (kind mismatch)
//   - shape validation: bad rentalIntentId → `input`
//   - rental missing → `not_found`
//   - rental belongs to different seller → `ownership`
//   - happy approve from `requested` → `seller_approved`,
//     saveRentalIntent + appendRentalEvent each called once,
//     event id is a fresh uuid (not the state-machine
//     `evt_<16hex>` form)
//   - idempotent approve while already `seller_approved` →
//     `alreadyResponded: true`, NO save / append
//   - approve while `seller_cancelled` / `paid` / `settled` →
//     `conflict`
//   - happy decline from `requested` → `seller_cancelled`
//   - idempotent decline while already `seller_cancelled` →
//     `alreadyResponded: true`, NO save / append
//   - decline while `seller_approved` → `conflict` (ALLOWED
//     does not include `seller_approved → seller_cancelled`)
//   - forged sellerId / borrowerId / status / amounts /
//     payment / pickup / return / settlement / adminId / role
//     / capability ignored at runtime
//   - DTO does NOT echo borrowerId, amounts, payment internals,
//     settlement internals, sellerName
//   - repo throw → typed `internal` with no SQL / env / stack
//     leak
//   - import-block scope guard

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalIntent, RentalIntentStatus } from "@/domain/intents";

vi.mock("@/server/actors/resolveServerActor", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/actors/resolveServerActor")
  >("@/server/actors/resolveServerActor");
  return {
    ...actual,
    resolveServerActor: vi.fn(actual.resolveServerActor),
  };
});

vi.mock("@/server/persistence/supabase/rentalIntentRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/rentalIntentRepository")
  >("@/server/persistence/supabase/rentalIntentRepository");
  return {
    ...actual,
    getRentalIntentById: vi.fn(async () => null),
    saveRentalIntent: vi.fn(async () => ({ ok: true, id: "saved-id" })),
    appendRentalEvent: vi.fn(async () => ({ ok: true })),
  };
});

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import {
  appendRentalEvent,
  getRentalIntentById,
  saveRentalIntent,
} from "@/server/persistence/supabase/rentalIntentRepository";
import {
  approveRentalRequestAction,
  declineRentalRequestAction,
} from "./respondToRentalRequest";

const mockResolver = vi.mocked(resolveServerActor);
const mockGetRental = vi.mocked(getRentalIntentById);
const mockSaveRental = vi.mocked(saveRentalIntent);
const mockAppendEvent = vi.mocked(appendRentalEvent);

const RENTAL_ID = "66666666-2222-4333-8444-777777777777";
const SELLER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_SELLER = "22222222-2222-4333-8444-555555555555";
const BORROWER_ID = "33333333-2222-4333-8444-555555555555";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rentalFixture(
  overrides: Partial<RentalIntent> = {},
): RentalIntent {
  return {
    id: RENTAL_ID,
    productId: "44444444-2222-4333-8444-777777777777",
    productName: "테스트 마사지건",
    productCategory: "massage_gun",
    sellerId: SELLER_ID,
    sellerName: "DEMO 셀러",
    borrowerId: BORROWER_ID,
    borrowerName: "DEMO 빌리는사람",
    status: "requested",
    durationDays: 3,
    amounts: {
      rentalFee: 21000,
      safetyDeposit: 30000,
      platformFee: 0,
      sellerPayout: 21000,
      borrowerTotal: 51000,
    },
    payment: {
      provider: "mock",
      status: "not_started",
      sessionId: "PAYMENT_SESSION_DO_NOT_LEAK",
    },
    pickup: {
      method: "direct",
      status: "not_scheduled",
      locationLabel: "마포구",
    },
    return: { status: "not_due" },
    settlement: {
      status: "not_ready",
      sellerPayout: 21000,
      blockedReason: "SETTLEMENT_BLOCKED_DO_NOT_LEAK",
    },
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockResolver.mockReset();
  mockGetRental.mockReset();
  mockGetRental.mockResolvedValue(null);
  mockSaveRental.mockReset();
  mockSaveRental.mockResolvedValue({ ok: true, id: RENTAL_ID });
  mockAppendEvent.mockReset();
  mockAppendEvent.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("approveRentalRequestAction — mock / default backend", () => {
  it("returns unsupported when CORENT_BACKEND_MODE is unset", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockGetRental).not.toHaveBeenCalled();
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("approveRentalRequestAction — supabase backend actor gates", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns unauthenticated when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockGetRental).not.toHaveBeenCalled();
  });

  it("returns unsupported for a mock-sourced seller actor (defense in depth)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "mock",
    });
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockGetRental).not.toHaveBeenCalled();
  });

  it("returns ownership for a renter actor under prefer=seller", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: SELLER_ID,
      displayName: "DEMO 빌리는사람",
      source: "supabase",
    });
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
  });
});

describe("approveRentalRequestAction — input + ownership", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
  });

  it("rejects non-uuid rentalIntentId with code input (no DB call)", async () => {
    const r = await approveRentalRequestAction({
      rentalIntentId: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockGetRental).not.toHaveBeenCalled();
  });

  it("returns not_found when the rental row is missing", async () => {
    mockGetRental.mockResolvedValueOnce(null);
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("not_found");
    expect(mockSaveRental).not.toHaveBeenCalled();
  });

  it("returns ownership when the rental belongs to a different seller", async () => {
    mockGetRental.mockResolvedValueOnce(
      rentalFixture({ sellerId: OTHER_SELLER }),
    );
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("ownership");
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("approveRentalRequestAction — happy path + idempotency + transitions", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
  });

  it("approves a requested rental, persists status seller_approved, appends event with uuid id", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: RENTAL_ID,
      status: "seller_approved",
      alreadyResponded: false,
    });
    expect(mockSaveRental).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);

    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.status).toBe("seller_approved");
    // Status is the only field that changed; sellerId / borrowerId
    // / amounts / payment / pickup / return / settlement remain
    // their canonical values from the requested state.
    expect(persisted?.sellerId).toBe(SELLER_ID);
    expect(persisted?.borrowerId).toBe(BORROWER_ID);
    expect(persisted?.payment.status).toBe("not_started");
    expect(persisted?.pickup.status).toBe("not_scheduled");
    expect(persisted?.return.status).toBe("not_due");
    expect(persisted?.settlement.status).toBe("not_ready");

    const event = mockAppendEvent.mock.calls[0]?.[0];
    expect(event?.id).toMatch(UUID_RE);
    expect(event?.id).not.toMatch(/^evt_/); // not the state-machine prefix
    expect(event?.rentalIntentId).toBe(RENTAL_ID);
    expect(event?.fromStatus).toBe("requested");
    expect(event?.toStatus).toBe("seller_approved");
    expect(event?.actor).toBe("seller");
  });

  it("is idempotent on a second approve while already seller_approved (no save / append)", async () => {
    mockGetRental.mockResolvedValueOnce(
      rentalFixture({ status: "seller_approved" }),
    );
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: RENTAL_ID,
      status: "seller_approved",
      alreadyResponded: true,
    });
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("returns conflict for approve while in a non-requested non-target status", async () => {
    for (const status of [
      "seller_cancelled",
      "borrower_cancelled",
      "paid",
      "settled",
      "pickup_confirmed",
    ] as const satisfies readonly RentalIntentStatus[]) {
      mockGetRental.mockResolvedValueOnce(rentalFixture({ status }));
      const r = await approveRentalRequestAction({
        rentalIntentId: RENTAL_ID,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("conflict");
    }
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("declineRentalRequestAction — happy path + idempotency + transitions", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
  });

  it("declines a requested rental, persists status seller_cancelled, appends event", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    const r = await declineRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: RENTAL_ID,
      status: "seller_cancelled",
      alreadyResponded: false,
    });
    expect(mockSaveRental).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.status).toBe("seller_cancelled");
    const event = mockAppendEvent.mock.calls[0]?.[0];
    expect(event?.id).toMatch(UUID_RE);
    expect(event?.fromStatus).toBe("requested");
    expect(event?.toStatus).toBe("seller_cancelled");
    expect(event?.actor).toBe("seller");
  });

  it("is idempotent on a second decline while already seller_cancelled (no save / append)", async () => {
    mockGetRental.mockResolvedValueOnce(
      rentalFixture({ status: "seller_cancelled" }),
    );
    const r = await declineRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      id: RENTAL_ID,
      status: "seller_cancelled",
      alreadyResponded: true,
    });
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("returns conflict for decline while seller_approved (no backwards transition)", async () => {
    mockGetRental.mockResolvedValueOnce(
      rentalFixture({ status: "seller_approved" }),
    );
    const r = await declineRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("conflict");
    expect(mockSaveRental).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });
});

describe("respond actions — forged payload fields and DTO privacy", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
  });

  it("ignores forged sellerId / borrowerId / status / amounts / payment / pickup / return / settlement / adminId / role / capability fields on the payload", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    const r = await approveRentalRequestAction({
      rentalIntentId: RENTAL_ID,
      // @ts-expect-error — forged extra
      sellerId: OTHER_SELLER,
      // @ts-expect-error — forged extra
      borrowerId: "FORGED_BORROWER",
      // @ts-expect-error — forged extra
      status: "settled",
      // @ts-expect-error — forged extra
      amounts: { rentalFee: 1, safetyDeposit: 0, platformFee: 0, sellerPayout: 1, borrowerTotal: 1 },
      // @ts-expect-error — forged extra
      payment: { provider: "toss", status: "paid", sessionId: "FORGED_SESSION" },
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
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const persisted = mockSaveRental.mock.calls[0]?.[0];
    expect(persisted?.sellerId).toBe(SELLER_ID);
    expect(persisted?.sellerId).not.toBe(OTHER_SELLER);
    expect(persisted?.borrowerId).toBe(BORROWER_ID);
    expect(persisted?.amounts.rentalFee).toBe(21000); // canonical
    expect(persisted?.payment.provider).toBe("mock");
    expect(persisted?.payment.status).toBe("not_started");
    expect(persisted?.status).toBe("seller_approved"); // not "settled"
  });

  it("response DTO does NOT echo borrowerId / amounts / sellerName / payment internals / settlement internals", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const blob = JSON.stringify(r.value);
    expect(blob).not.toContain(BORROWER_ID);
    expect(blob).not.toContain("DEMO 빌리는사람");
    expect(blob).not.toContain("DEMO 셀러");
    expect(blob).not.toContain("PAYMENT_SESSION_DO_NOT_LEAK");
    expect(blob).not.toContain("SETTLEMENT_BLOCKED_DO_NOT_LEAK");
    expect(blob).not.toMatch(/borrowerId/);
    expect(blob).not.toMatch(/amounts/);
    expect(blob).not.toMatch(/sellerName/);
    expect(blob).not.toMatch(/payment/);
    expect(blob).not.toMatch(/settlement/);
    expect(blob).not.toMatch(/sellerPayout/);
    expect(blob).not.toMatch(/platformFee/);
    expect(blob).not.toMatch(/safetyDeposit/);
    expect(blob).not.toMatch(/rentalFee/);
  });
});

describe("respond actions — repo throw mapping", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    mockResolver.mockResolvedValue({
      kind: "seller",
      sellerId: SELLER_ID,
      displayName: "DEMO 셀러",
      source: "supabase",
    });
  });

  it("maps getRentalIntentById throw to typed internal without leaking SQL/env/stack", async () => {
    mockGetRental.mockRejectedValueOnce(
      new Error(
        'relation "rental_intents" does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx',
      ),
    );
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("maps saveRentalIntent ok=false to typed internal", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    mockSaveRental.mockResolvedValueOnce({
      ok: false,
      error: 'relation "rental_intents" boom',
    });
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("maps appendRentalEvent ok=false to typed internal (after save succeeded)", async () => {
    mockGetRental.mockResolvedValueOnce(rentalFixture({ status: "requested" }));
    mockAppendEvent.mockResolvedValueOnce({ ok: false, error: "boom" });
    const r = await approveRentalRequestAction({ rentalIntentId: RENTAL_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
  });
});

describe("respond actions — scope guard", () => {
  it("does not import any payment / claim / trust / handoff / notification / lifecycle module beyond the rental intent repo + state machine", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.join(
      process.cwd(),
      "src",
      "server",
      "rentals",
      "respondToRentalRequest.ts",
    );
    const src = fs.readFileSync(file, "utf-8");
    // Strip line comments first so the action's docstring (which
    // intentionally lists forbidden authority fields by name) does
    // not poison the lazy `import … from "…"` regex.
    const codeOnly = src.replace(/^\s*\/\/.*$/gm, "");
    const importBlob = (
      codeOnly.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
    ).join("\n");
    expect(importBlob).not.toMatch(/payment/i);
    expect(importBlob).not.toMatch(/claim/i);
    expect(importBlob).not.toMatch(/trustEvent/i);
    expect(importBlob).not.toMatch(/handoff/i);
    expect(importBlob).not.toMatch(/notification/i);
    expect(importBlob).not.toMatch(/listing_secrets/);
    // No write paths to listings, intake, or feedback.
    expect(importBlob).not.toMatch(/listingRepository/);
    expect(importBlob).not.toMatch(/intakeRepository/);
    expect(importBlob).not.toMatch(/feedbackRepository/);
    // The allowed @/server/persistence imports are only the rental
    // intent repo.
    expect(importBlob).toMatch(/rentalIntentRepository/);
    // The state machine helpers are reused (no duplication).
    expect(importBlob).toMatch(/rentalIntentMachine/);
  });
});

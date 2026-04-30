// Tests for the seller-approval-before-payment service path. Verifies
// that the actor-aware `approveRequest` / `declineRequest` /
// `cancelByBorrower` methods reject foreign actors via OwnershipError
// and reject invalid status moves with a structured error string —
// before any persistence write happens.
//
// These tests run against the in-memory persistence adapter (the
// default in a Node/SSR environment), so no localStorage / network is
// touched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RentalIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { rentalService } from "./rentalService";

const SELLER_ID = "seller_jisu";
const BORROWER_ID = "borrower_minho";
const STRANGER_ID = "stranger_x";

async function makeRequestedRental(): Promise<RentalIntent> {
  return rentalService.create({
    productId: "p_test",
    productName: "DEMO 마사지건",
    productCategory: "massage_gun",
    durationDays: 3,
    rentalFee: 21000,
    estimatedValue: 220000,
    sellerId: SELLER_ID,
    sellerName: "DEMO 셀러",
    borrowerId: BORROWER_ID,
    borrowerName: "DEMO 빌리는사람",
    pickupLocationLabel: "DEMO 권역",
  });
}

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("rentalService.approveRequest — seller approval before payment", () => {
  it("seller can approve their own request and it moves to seller_approved", async () => {
    const r = await makeRequestedRental();
    expect(r.status).toBe("requested");
    const approved = await rentalService.approveRequest(r, SELLER_ID);
    expect(approved.status).toBe("seller_approved");
    // Persistence reflects the new status.
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("seller_approved");
  });

  it("non-seller (borrower) cannot approve — throws OwnershipError", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.approveRequest(r, BORROWER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    // Status must not have changed.
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("requested");
  });

  it("non-seller (random stranger) cannot approve — throws OwnershipError", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.approveRequest(r, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("requested");
  });

  it("empty actorUserId is rejected as OwnershipError", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.approveRequest(r, ""),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("approving an already-approved rental is rejected as invalid_transition", async () => {
    const r = await makeRequestedRental();
    const approved = await rentalService.approveRequest(r, SELLER_ID);
    await expect(
      rentalService.approveRequest(approved, SELLER_ID),
    ).rejects.toThrow(/invalid_transition/);
  });
});

describe("rentalService.declineRequest — seller decline before payment", () => {
  it("seller can decline their own request and it moves to seller_cancelled", async () => {
    const r = await makeRequestedRental();
    const declined = await rentalService.declineRequest(r, SELLER_ID);
    // Per docs/corent_return_trust_layer.md §5, decline maps to seller_cancelled.
    expect(declined.status).toBe("seller_cancelled");
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("seller_cancelled");
  });

  it("non-seller cannot decline — throws OwnershipError", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.declineRequest(r, BORROWER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("requested");
  });

  it("declining a terminal-state rental is rejected as invalid_transition", async () => {
    const r = await makeRequestedRental();
    const declined = await rentalService.declineRequest(r, SELLER_ID);
    await expect(
      rentalService.declineRequest(declined, SELLER_ID),
    ).rejects.toThrow(/invalid_transition/);
  });
});

describe("rentalService.cancelByBorrower — borrower cancels own request", () => {
  it("borrower can cancel their own request", async () => {
    const r = await makeRequestedRental();
    const cancelled = await rentalService.cancelByBorrower(r, BORROWER_ID);
    expect(cancelled.status).toBe("borrower_cancelled");
  });

  it("seller cannot cancel as borrower — throws OwnershipError", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.cancelByBorrower(r, SELLER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("requested");
  });
});

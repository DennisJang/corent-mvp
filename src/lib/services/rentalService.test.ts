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
const ADMIN_ID = "admin_dev_ops";
const TRUST_CONTRACT_HANDOFF_PATCH = {
  checks: {
    mainUnit: true,
    components: true,
    working: true,
    appearance: true,
    preexisting: true,
  },
};

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

// Walks a fresh rental forward to a status that the seller-side
// handoff write path accepts for the pickup phase (`paid` or
// `pickup_confirmed`). Tests that exercise the pickup-handoff
// surface need the rental to actually be picked up.
async function makePaidRental(): Promise<RentalIntent> {
  let r = await makeRequestedRental();
  r = await rentalService.approveRequest(r, SELLER_ID);
  r = await rentalService.startPayment(r, SELLER_ID);
  r = await rentalService.confirmPayment(r, SELLER_ID);
  return r;
}

// Walks the rental further to `return_pending` so a return-phase
// handoff is allowed.
async function makeReturnPendingRental(): Promise<RentalIntent> {
  let r = await makePaidRental();
  r = await rentalService.confirmPickup(r, SELLER_ID);
  r = await rentalService.startReturn(r, SELLER_ID);
  return r;
}

async function makeReturnConfirmedRental(): Promise<RentalIntent> {
  let r = await makeReturnPendingRental();
  r = await rentalService.confirmReturn(r, SELLER_ID);
  return r;
}

async function makeSettlementReadyRental(): Promise<RentalIntent> {
  const { claimReviewService } = await import("./claimReviewService");
  const r = await makeReturnConfirmedRental();
  await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
  return rentalService.readySettlement(r, SELLER_ID);
}

async function trustEventContractFor(
  rentalIntentId: string,
): Promise<string[]> {
  const events = await getPersistence().listTrustEventsForRental(
    rentalIntentId,
  );
  return events.map((e) =>
    [e.type, e.actor, e.handoffPhase ?? "none"].join(":"),
  );
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

describe("rentalService.recordSellerHandoff — handoff persistence orchestration", () => {
  const FULL_PICKUP_PATCH = {
    checks: {
      mainUnit: true,
      components: true,
      working: true,
      appearance: true,
      preexisting: true,
    },
  };

  it("seller can record + persist a fresh pickup handoff", async () => {
    const r = await makePaidRental();
    const rec = await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      FULL_PICKUP_PATCH,
    );
    expect(rec.rentalIntentId).toBe(r.id);
    expect(rec.phase).toBe("pickup");
    expect(rec.confirmedBySeller).toBe(true);
    expect(rec.checks.mainUnit).toBe(true);

    // Persistence round-trip via the read helpers.
    const reload = await rentalService.getHandoffRecord(r.id, "pickup");
    expect(reload).toEqual(rec);
    const all = await rentalService.listHandoffRecords(r.id);
    expect(all).toHaveLength(1);
  });

  it("upserts the same (rental, phase) — does not duplicate", async () => {
    const r = await makePaidRental();
    const a = await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      { checks: { mainUnit: true } },
    );
    const b = await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      { checks: { components: true } },
    );
    expect(a.id).toBe(b.id);
    expect(b.checks.mainUnit).toBe(true);
    expect(b.checks.components).toBe(true);
    const all = await rentalService.listHandoffRecords(r.id);
    expect(all).toHaveLength(1);
  });

  it("non-seller (borrower) cannot record — throws OwnershipError, no persisted record", async () => {
    const r = await makePaidRental();
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "pickup",
        BORROWER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await rentalService.getHandoffRecord(r.id, "pickup")).toBeNull();
  });

  it("non-seller (stranger) cannot record — no persisted record", async () => {
    const r = await makePaidRental();
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "pickup",
        STRANGER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await rentalService.getHandoffRecord(r.id, "pickup")).toBeNull();
  });

  it("empty actorUserId is rejected", async () => {
    const r = await makePaidRental();
    await expect(
      rentalService.recordSellerHandoff(r.id, "pickup", "", FULL_PICKUP_PATCH),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await rentalService.getHandoffRecord(r.id, "pickup")).toBeNull();
  });

  it("rejects when rental does not exist — does not write a record", async () => {
    await expect(
      rentalService.recordSellerHandoff(
        "ri_does_not_exist",
        "pickup",
        SELLER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toThrow(/rental_not_found/);
    expect(
      await rentalService.getHandoffRecord("ri_does_not_exist", "pickup"),
    ).toBeNull();
  });

  it("pickup and return phases are kept independent", async () => {
    // Record pickup at `paid`, then walk forward and record return at
    // `return_pending`. The two phases must not collide.
    let r = await makePaidRental();
    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      FULL_PICKUP_PATCH,
    );
    r = await rentalService.confirmPickup(r, SELLER_ID);
    r = await rentalService.startReturn(r, SELLER_ID);
    await rentalService.recordSellerHandoff(
      r.id,
      "return",
      SELLER_ID,
      { checks: { mainUnit: true } },
      false,
    );
    const pickup = await rentalService.getHandoffRecord(r.id, "pickup");
    const ret = await rentalService.getHandoffRecord(r.id, "return");
    expect(pickup?.confirmedBySeller).toBe(true);
    expect(ret?.confirmedBySeller).toBe(false);
    expect(pickup?.phase).toBe("pickup");
    expect(ret?.phase).toBe("return");
  });

  it("emits exactly one TrustEvent on the seller-confirm transition (pickup)", async () => {
    const r = await makePaidRental();
    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      FULL_PICKUP_PATCH,
    );
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("pickup_evidence_recorded");
    expect(events[0]?.actor).toBe("seller");
    expect(events[0]?.handoffPhase).toBe("pickup");
  });

  it("does NOT re-emit on a subsequent seller-confirm save", async () => {
    const r = await makePaidRental();
    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      FULL_PICKUP_PATCH,
    );
    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      { checks: { mainUnit: true } },
    );
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(events).toHaveLength(1);
  });

  it("does NOT emit when confirm=false", async () => {
    const r = await makePaidRental();
    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      FULL_PICKUP_PATCH,
      false,
    );
    expect(await getPersistence().listTrustEventsForRental(r.id)).toEqual([]);
  });

  it("emits return_evidence_recorded for the return phase", async () => {
    const r = await makeReturnPendingRental();
    await rentalService.recordSellerHandoff(
      r.id,
      "return",
      SELLER_ID,
      FULL_PICKUP_PATCH,
    );
    const events = await getPersistence().listTrustEventsForRental(r.id);
    // A return-phase handoff at `return_pending` only emits the
    // return-evidence event; the pickup-phase event was never
    // recorded for this rental.
    expect(
      events.filter((e) => e.type === "return_evidence_recorded"),
    ).toHaveLength(1);
    expect(
      events.find((e) => e.type === "return_evidence_recorded")?.handoffPhase,
    ).toBe("return");
  });

  it("does NOT emit when ownership is rejected", async () => {
    const r = await makePaidRental();
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "pickup",
        BORROWER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await getPersistence().listTrustEventsForRental(r.id)).toEqual([]);
  });

  // ----------------------------------------------------------------
  // Phase-rule hardening (Phase 1.7).
  // ----------------------------------------------------------------

  it("rejects pickup handoff while rental is still in `requested`", async () => {
    const r = await makeRequestedRental();
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "pickup",
        SELLER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toThrow(/handoff_phase_not_allowed_for_status/);
    expect(await rentalService.getHandoffRecord(r.id, "pickup")).toBeNull();
    expect(await getPersistence().listTrustEventsForRental(r.id)).toEqual([]);
  });

  it("rejects return handoff before the rental reaches a return phase", async () => {
    const r = await makePaidRental();
    expect(r.status).toBe("paid");
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "return",
        SELLER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toThrow(/handoff_phase_not_allowed_for_status/);
    expect(await rentalService.getHandoffRecord(r.id, "return")).toBeNull();
  });

  it("rejects pickup handoff once the rental has moved past pickup_confirmed", async () => {
    const r = await makeReturnPendingRental();
    expect(r.status).toBe("return_pending");
    await expect(
      rentalService.recordSellerHandoff(
        r.id,
        "pickup",
        SELLER_ID,
        FULL_PICKUP_PATCH,
      ),
    ).rejects.toThrow(/handoff_phase_not_allowed_for_status/);
  });
});

// --------------------------------------------------------------
// Canonical-write hardening (Phase 1.7).
//
// The actor-aware writes accept a caller-supplied `RentalIntent`
// shape for ergonomic reasons, but the service must reload the
// canonical rental by id before any authorization or status check.
// A forged or stale object cannot:
//   - overwrite newer persisted state with old fields,
//   - claim a different `sellerId` to bypass the ownership guard,
//   - rewind / fast-forward the canonical status by lying about it.
// --------------------------------------------------------------

describe("rentalService — canonical writes ignore caller-supplied intent fields", () => {
  it("forged sellerId on the caller-supplied intent does NOT bypass ownership", async () => {
    const r = await makeRequestedRental();
    // Construct a forged shape that pretends the stranger is the seller.
    const forged = { ...r, sellerId: STRANGER_ID };
    await expect(
      rentalService.approveRequest(forged, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    // Canonical record is untouched.
    const stored = await rentalService.get(r.id);
    expect(stored?.sellerId).toBe(SELLER_ID);
    expect(stored?.status).toBe("requested");
  });

  it("stale caller-supplied intent does NOT overwrite newer persisted state", async () => {
    const r = await makeRequestedRental();
    // Snapshot a stale copy at status `requested`.
    const stale = { ...r };
    // Advance the canonical record out-of-band.
    const approved = await rentalService.approveRequest(r, SELLER_ID);
    expect(approved.status).toBe("seller_approved");
    // Re-approving with the stale copy should NOT silently succeed
    // (the canonical record is no longer at `requested`, so the
    // state-machine transition rejects).
    await expect(
      rentalService.approveRequest(stale, SELLER_ID),
    ).rejects.toThrow(/invalid_transition/);
    // Canonical status is still the post-approve value, not rewound.
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("seller_approved");
  });

  it("startPayment ignores forged payment.status on the caller-supplied intent", async () => {
    const r = await makeRequestedRental();
    const approved = await rentalService.approveRequest(r, SELLER_ID);
    // Forged shape claims the rental is already at `paid`. The canonical
    // record is at `seller_approved`; the transition must succeed using
    // the canonical status.
    const forged = { ...approved, status: "paid" as const };
    const next = await rentalService.startPayment(forged, SELLER_ID);
    expect(next.status).toBe("payment_pending");
  });

  it("operating on an unknown id throws rental_not_found", async () => {
    const r = await makeRequestedRental();
    const forgedId = { ...r, id: "ri_does_not_exist" };
    await expect(
      rentalService.approveRequest(forgedId, SELLER_ID),
    ).rejects.toThrow(/rental_not_found/);
  });

  it("recordSellerHandoff ignores forged sellerId — uses the canonical seller", async () => {
    const r = await makePaidRental();
    const forgedRentalId = r.id; // The id is canonical; seller forging happens in the actor arg.
    await expect(
      rentalService.recordSellerHandoff(
        forgedRentalId,
        "pickup",
        STRANGER_ID,
        { checks: { mainUnit: true } },
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await rentalService.getHandoffRecord(r.id, "pickup")).toBeNull();
  });
});

// --------------------------------------------------------------
// Rental lifecycle actor-awareness.
//
// Remaining happy-path lifecycle writes are shared local-MVP actions:
// either rental party may drive them, while strangers / empty actors
// are rejected against the canonical persisted rental. Chaos/admin
// helpers require an explicit dev-ops id and reject normal rental
// parties so UI actors cannot accidentally use them.
// --------------------------------------------------------------

describe("rentalService — actor-aware happy-path lifecycle transitions", () => {
  it("seller party can complete the full local happy path with explicit actor ids", async () => {
    let r = await makeRequestedRental();
    r = await rentalService.approveRequest(r, SELLER_ID);
    r = await rentalService.startPayment(r, SELLER_ID);
    expect(r.status).toBe("payment_pending");
    r = await rentalService.confirmPayment(r, SELLER_ID);
    expect(r.status).toBe("paid");
    r = await rentalService.confirmPickup(r, SELLER_ID);
    expect(r.status).toBe("pickup_confirmed");
    r = await rentalService.startReturn(r, SELLER_ID);
    expect(r.status).toBe("return_pending");
    r = await rentalService.confirmReturn(r, SELLER_ID);
    expect(r.status).toBe("return_confirmed");

    const { claimReviewService } = await import("./claimReviewService");
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);

    r = await rentalService.readySettlement(r, SELLER_ID);
    expect(r.status).toBe("settlement_ready");
    r = await rentalService.settle(r, SELLER_ID);
    expect(r.status).toBe("settled");
  });

  it("borrower party can drive party-allowed lifecycle transitions after seller approval", async () => {
    let r = await makeRequestedRental();
    r = await rentalService.approveRequest(r, SELLER_ID);
    r = await rentalService.startPayment(r, BORROWER_ID);
    r = await rentalService.confirmPayment(r, BORROWER_ID);
    r = await rentalService.confirmPickup(r, BORROWER_ID);
    r = await rentalService.startReturn(r, BORROWER_ID);
    r = await rentalService.confirmReturn(r, BORROWER_ID);

    const { claimReviewService } = await import("./claimReviewService");
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);

    r = await rentalService.readySettlement(r, BORROWER_ID);
    r = await rentalService.settle(r, BORROWER_ID);
    expect(r.status).toBe("settled");
  });

  it("rejects stranger and empty actors before lifecycle writes persist", async () => {
    const r = await makeRequestedRental();
    const approved = await rentalService.approveRequest(r, SELLER_ID);
    await expect(
      rentalService.startPayment(approved, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      rentalService.startPayment(approved, ""),
    ).rejects.toBeInstanceOf(OwnershipError);

    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("seller_approved");
  });
});

describe("rentalService — admin/dev-ops lifecycle helpers", () => {
  it("failPayment requires explicit admin/dev-ops actor id", async () => {
    let r = await makeRequestedRental();
    r = await rentalService.approveRequest(r, SELLER_ID);
    r = await rentalService.startPayment(r, SELLER_ID);

    await expect(
      rentalService.failPayment(r, SELLER_ID, "seller_try"),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(
      rentalService.failPayment(r, BORROWER_ID, "borrower_try"),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(rentalService.failPayment(r, "")).rejects.toThrow(
      /admin_actor_required/,
    );

    const failed = await rentalService.failPayment(r, ADMIN_ID, "card_declined");
    expect(failed.status).toBe("payment_failed");
  });

  it("missPickup / overdue / block are admin/dev-ops only", async () => {
    const paid = await makePaidRental();
    await expect(
      rentalService.missPickup(paid, SELLER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(rentalService.missPickup(paid, "")).rejects.toThrow(
      /admin_actor_required/,
    );
    const missed = await rentalService.missPickup(paid, ADMIN_ID);
    expect(missed.status).toBe("pickup_missed");

    const returnPending = await makeReturnPendingRental();
    await expect(
      rentalService.overdue(returnPending, BORROWER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    const overdue = await rentalService.overdue(returnPending, ADMIN_ID);
    expect(overdue.status).toBe("return_overdue");

    const settlementReady = await makeSettlementReadyRental();
    await expect(
      rentalService.block(settlementReady, SELLER_ID, "seller_try"),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(rentalService.block(settlementReady, "")).rejects.toThrow(
      /admin_actor_required/,
    );
    const blocked = await rentalService.block(
      settlementReady,
      ADMIN_ID,
      "manual_admin_hold",
    );
    expect(blocked.status).toBe("settlement_blocked");
  });
});

describe("rentalService — damage / dispute actor awareness", () => {
  it("damage accepts seller or borrower and rejects stranger", async () => {
    let sellerCase = await makeReturnPendingRental();
    sellerCase = await rentalService.damage(sellerCase, SELLER_ID);
    expect(sellerCase.status).toBe("damage_reported");

    let borrowerCase = await makeReturnPendingRental();
    borrowerCase = await rentalService.damage(borrowerCase, BORROWER_ID);
    expect(borrowerCase.status).toBe("damage_reported");
    const borrowerEvents = await getPersistence().listTrustEventsForRental(
      borrowerCase.id,
    );
    expect(
      borrowerEvents.find((e) => e.type === "condition_issue_reported")?.actor,
    ).toBe("borrower");

    const strangerCase = await makeReturnPendingRental();
    await expect(
      rentalService.damage(strangerCase, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("dispute accepts seller or borrower and rejects stranger", async () => {
    let sellerCase = await makeSettlementReadyRental();
    sellerCase = await rentalService.dispute(
      sellerCase,
      SELLER_ID,
      "seller_dispute",
    );
    expect(sellerCase.status).toBe("dispute_opened");

    let borrowerCase = await makeSettlementReadyRental();
    borrowerCase = await rentalService.dispute(
      borrowerCase,
      BORROWER_ID,
      "borrower_dispute",
    );
    expect(borrowerCase.status).toBe("dispute_opened");

    const strangerCase = await makeSettlementReadyRental();
    await expect(
      rentalService.dispute(strangerCase, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

// --------------------------------------------------------------
// TrustEvent consistency contract.
//
// DB/auth migration will need to persist RentalIntent transitions,
// RentalEvents, TrustEvents, and later NotificationEvents together.
// This test documents the current local-MVP boundary: most lifecycle
// status moves write RentalEvents only; trust signals are emitted by
// seller handoff evidence, claim-window/review actions, clean returns,
// and direct damage reports.
// --------------------------------------------------------------

describe("rentalService — trust event consistency contract", () => {
  it("maps key lifecycle writes to their current trust-event emissions", async () => {
    let r = await makeRequestedRental();
    expect(await trustEventContractFor(r.id)).toEqual([]);

    r = await rentalService.approveRequest(r, SELLER_ID);
    expect(await trustEventContractFor(r.id)).toEqual([]);

    r = await rentalService.startPayment(r, BORROWER_ID);
    r = await rentalService.confirmPayment(r, BORROWER_ID);
    expect(await trustEventContractFor(r.id)).toEqual([]);

    await rentalService.recordSellerHandoff(
      r.id,
      "pickup",
      SELLER_ID,
      TRUST_CONTRACT_HANDOFF_PATCH,
    );
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
    ]);

    r = await rentalService.confirmPickup(r, BORROWER_ID);
    r = await rentalService.startReturn(r, BORROWER_ID);
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
    ]);

    await rentalService.recordSellerHandoff(
      r.id,
      "return",
      SELLER_ID,
      TRUST_CONTRACT_HANDOFF_PATCH,
    );
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
      "return_evidence_recorded:seller:return",
    ]);

    r = await rentalService.confirmReturn(r, BORROWER_ID);
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
      "return_evidence_recorded:seller:return",
      "claim_window_opened:system:none",
    ]);

    const { claimReviewService } = await import("./claimReviewService");
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
      "return_evidence_recorded:seller:return",
      "claim_window_opened:system:none",
      "claim_window_closed:seller:none",
      "return_confirmed_by_seller:seller:none",
      "condition_match_recorded:seller:return",
    ]);

    r = await rentalService.readySettlement(r, SELLER_ID);
    r = await rentalService.settle(r, SELLER_ID);
    expect(r.status).toBe("settled");
    expect(await trustEventContractFor(r.id)).toEqual([
      "pickup_evidence_recorded:seller:pickup",
      "return_evidence_recorded:seller:return",
      "claim_window_opened:system:none",
      "claim_window_closed:seller:none",
      "return_confirmed_by_seller:seller:none",
      "condition_match_recorded:seller:return",
    ]);
  });

  it("documents direct damage attribution and dispute non-emission", async () => {
    let damaged = await makeReturnPendingRental();
    damaged = await rentalService.damage(damaged, BORROWER_ID);
    expect(damaged.status).toBe("damage_reported");
    expect(await trustEventContractFor(damaged.id)).toEqual([
      "condition_issue_reported:borrower:return",
    ]);

    let disputed = await makeSettlementReadyRental();
    const beforeDispute = await trustEventContractFor(disputed.id);
    disputed = await rentalService.dispute(
      disputed,
      BORROWER_ID,
      "borrower_dispute",
    );
    expect(disputed.status).toBe("dispute_opened");
    expect(await trustEventContractFor(disputed.id)).toEqual(beforeDispute);
  });
});

// --------------------------------------------------------------
// Settlement gating (Phase 1.7).
//
// `confirmReturn` opens the post-return claim window automatically.
// Settlement (`readySettlement` / `settle`) must be blocked while
// the window is open or its review is unresolved, and must only
// succeed after a clean close (no claim) or a final admin decision.
// --------------------------------------------------------------

describe("rentalService — settlement is gated by the claim window", () => {
  async function makeReturnConfirmedRental(): Promise<RentalIntent> {
    let r = await makeReturnPendingRental();
    r = await rentalService.confirmReturn(r, SELLER_ID);
    return r;
  }

  it("readySettlement is BLOCKED while the claim window is open", async () => {
    const r = await makeReturnConfirmedRental();
    expect(r.status).toBe("return_confirmed");
    await expect(rentalService.readySettlement(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_window_open/,
    );
    const stored = await rentalService.get(r.id);
    expect(stored?.status).toBe("return_confirmed");
  });

  it("settle is BLOCKED directly even if readySettlement is skipped", async () => {
    const r = await makeReturnConfirmedRental();
    await expect(rentalService.settle(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_window_open/,
    );
  });

  it("readySettlement is ALLOWED after a clean (no-claim) window close", async () => {
    const { claimReviewService } = await import("./claimReviewService");
    const r = await makeReturnConfirmedRental();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    const ready = await rentalService.readySettlement(r, SELLER_ID);
    expect(ready.status).toBe("settlement_ready");
  });

  it("readySettlement is BLOCKED while a claim is open and the review is unresolved", async () => {
    const { claimReviewService } = await import("./claimReviewService");
    const r = await makeReturnConfirmedRental();
    await claimReviewService.openClaim(r.id, SELLER_ID, "흠집 1건");
    await expect(rentalService.readySettlement(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_review_unresolved/,
    );
  });

  it("readySettlement stays BLOCKED while review is in needs_review", async () => {
    const { claimReviewService } = await import("./claimReviewService");
    const r = await makeReturnConfirmedRental();
    const { review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "흠집 1건",
    );
    await claimReviewService.recordAdminDecision(
      review.id,
      "needs_review",
      "founder@example.com",
    );
    await expect(rentalService.readySettlement(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_review_unresolved/,
    );
  });

  it("readySettlement is ALLOWED once the review is rejected (final outcome)", async () => {
    const { claimReviewService } = await import("./claimReviewService");
    const r = await makeReturnConfirmedRental();
    const { review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "흠집 1건",
    );
    await claimReviewService.recordAdminDecision(
      review.id,
      "rejected",
      "founder@example.com",
    );
    const ready = await rentalService.readySettlement(r, SELLER_ID);
    expect(ready.status).toBe("settlement_ready");
  });

  it("readySettlement is ALLOWED once the review is approved (final outcome)", async () => {
    const { claimReviewService } = await import("./claimReviewService");
    const r = await makeReturnConfirmedRental();
    const { review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "흠집 1건",
    );
    await claimReviewService.recordAdminDecision(
      review.id,
      "approved",
      "founder@example.com",
    );
    const ready = await rentalService.readySettlement(r, SELLER_ID);
    expect(ready.status).toBe("settlement_ready");
  });

  it("settlementBlockReason mirrors the gate state", async () => {
    const r = await makeReturnConfirmedRental();
    expect(await rentalService.settlementBlockReason(r.id)).toBe(
      "claim_window_open",
    );
    const { claimReviewService } = await import("./claimReviewService");
    await claimReviewService.openClaim(r.id, SELLER_ID, "흠집");
    expect(await rentalService.settlementBlockReason(r.id)).toBe(
      "claim_review_unresolved",
    );
    const reviews = await claimReviewService.listClaimReviewsForRental(r.id);
    await claimReviewService.recordAdminDecision(
      reviews[0]!.id,
      "approved",
      "founder@example.com",
    );
    expect(await rentalService.settlementBlockReason(r.id)).toBeNull();
  });

  // --------------------------------------------------------------
  // Phase 1.8 fail-closed guard. A `closed_with_claim` window with no
  // persisted review row (partial-persist scenario) must NOT let
  // settlement proceed silently.
  // --------------------------------------------------------------

  it("readySettlement is BLOCKED when window is closed_with_claim but no review exists", async () => {
    const r = await makeReturnConfirmedRental();
    const persistence = getPersistence();
    // Simulate a partial persist: the claim window closed with claim,
    // but the review row never landed in storage.
    const window = await persistence.getClaimWindowForRental(r.id);
    expect(window?.status).toBe("open");
    await persistence.saveClaimWindow({
      ...window!,
      status: "closed_with_claim",
      closedAt: "2026-04-29T01:00:00.000Z",
      closeReason: "partial",
    });
    const reasonBefore = await rentalService.settlementBlockReason(r.id);
    expect(reasonBefore).toBe("claim_review_missing");
    await expect(rentalService.readySettlement(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_review_missing/,
    );
  });

  it("settle is BLOCKED for closed_with_claim with no review, even if readySettlement is skipped", async () => {
    const r = await makeReturnConfirmedRental();
    const persistence = getPersistence();
    const window = await persistence.getClaimWindowForRental(r.id);
    await persistence.saveClaimWindow({
      ...window!,
      status: "closed_with_claim",
      closedAt: "2026-04-29T01:00:00.000Z",
    });
    await expect(rentalService.settle(r, SELLER_ID)).rejects.toThrow(
      /settlement_blocked: claim_review_missing/,
    );
  });
});

// --------------------------------------------------------------
// Phase 1.8 — issue signals from the damage helper. The chaos
// `rentalService.damage` helper now also emits a
// `condition_issue_reported` trust event so the trust summary's
// `damageReportsAgainst` counter cannot stay at zero when the rental
// has actually moved into `damage_reported`.
// --------------------------------------------------------------

describe("rentalService.damage emits condition_issue_reported", () => {
  it("increments damageReportsAgainst on the seller summary", async () => {
    let r = await makeReturnPendingRental();
    r = await rentalService.damage(r, SELLER_ID);
    expect(r.status).toBe("damage_reported");
    const { trustEventService } = await import("./trustEvents");
    const summary = await trustEventService.summarizeUserTrust(SELLER_ID);
    expect(summary.damageReportsAgainst).toBe(1);
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "condition_issue_reported"),
    ).toHaveLength(1);
  });
});

// --------------------------------------------------------------
// Phase 1.11 — canonical request creation from product id.
//
// The renter-facing item detail page only sends `(productId,
// durationDays, actorBorrowerId?)`. Every other field — seller name,
// product name, category, rental fee, estimated value, status,
// payment, settlement — is resolved from the trusted static
// `PRODUCTS` source. Forged caller-supplied seller / product / price /
// status / payment / amount fields cannot reach persistence because
// the helper does not accept those fields at all.
// --------------------------------------------------------------

describe("rentalService.createRequestFromProductId", () => {
  it("creates a requested rental using ONLY canonical product fields", async () => {
    const { PRODUCTS } = await import("@/data/products");
    const product = PRODUCTS[0]!;
    const renter = "borrower_renter_test";
    const created = await rentalService.createRequestFromProductId({
      productId: product.id,
      durationDays: 3,
      actorBorrowerId: renter,
      actorBorrowerName: "테스터",
    });
    expect(created.status).toBe("requested");
    // Every canonical field comes from the trusted product source.
    expect(created.productId).toBe(product.id);
    expect(created.productName).toBe(product.name);
    expect(created.productCategory).toBe(product.category);
    expect(created.sellerId).toBe(product.sellerId);
    expect(created.sellerName).toBe(product.sellerName);
    expect(created.amounts.rentalFee).toBe(product.prices["3d"]);
    expect(created.borrowerId).toBe(renter);
    expect(created.borrowerName).toBe("테스터");
    expect(created.durationDays).toBe(3);
    expect(created.payment.status).toBe("not_started");
    expect(created.settlement.status).toBe("not_ready");
  });

  it("rejects unknown product ids", async () => {
    await expect(
      rentalService.createRequestFromProductId({
        productId: "p_does_not_exist",
        durationDays: 3,
        actorBorrowerId: "borrower_test",
      }),
    ).rejects.toThrow(/product_not_found/);
    expect(await rentalService.list()).toEqual([]);
  });

  it("rejects empty productId", async () => {
    await expect(
      rentalService.createRequestFromProductId({
        productId: "",
        durationDays: 3,
      }),
    ).rejects.toThrow(/product_not_found/);
  });

  it("rejects unsupported durations", async () => {
    const { PRODUCTS } = await import("@/data/products");
    const product = PRODUCTS[0]!;
    await expect(
      rentalService.createRequestFromProductId({
        productId: product.id,
        durationDays: 5 as unknown as 3,
      }),
    ).rejects.toThrow(/duration_invalid/);
  });

  it("forged caller-supplied seller / product / price / status fields cannot reach persistence", async () => {
    const { PRODUCTS } = await import("@/data/products");
    const product = PRODUCTS[0]!;
    // The signature only declares {productId, durationDays,
    // actorBorrowerId?, actorBorrowerName?}. A typed-coerced payload
    // with extra fields must be silently dropped by the destructure
    // — none of them can land on the persisted record.
    const forged = {
      productId: product.id,
      durationDays: 1,
      actorBorrowerId: "borrower_test",
      // Forged below: must not reach persistence.
      sellerId: "seller_evil",
      sellerName: "EVIL",
      productName: "REWRITTEN",
      productCategory: "exercise",
      rentalFee: 1,
      estimatedValue: 1,
      status: "settled",
      payment: { status: "paid" },
      settlement: { status: "settled" },
    } as unknown as Parameters<
      typeof rentalService.createRequestFromProductId
    >[0];
    const created = await rentalService.createRequestFromProductId(forged);
    expect(created.status).toBe("requested");
    expect(created.sellerId).toBe(product.sellerId); // not "seller_evil"
    expect(created.sellerName).toBe(product.sellerName); // not "EVIL"
    expect(created.productName).toBe(product.name);
    expect(created.productCategory).toBe(product.category);
    expect(created.amounts.rentalFee).toBe(product.prices["1d"]); // not 1
    expect(created.payment.status).toBe("not_started");
    expect(created.settlement.status).toBe("not_ready");
  });

  it("does not record a borrower id when none is supplied", async () => {
    const { PRODUCTS } = await import("@/data/products");
    const product = PRODUCTS[0]!;
    const created = await rentalService.createRequestFromProductId({
      productId: product.id,
      durationDays: 1,
    });
    expect(created.borrowerId).toBeUndefined();
    expect(created.borrowerName).toBeUndefined();
  });
});

describe("rentalService.listMyRequestsForProduct", () => {
  it("scopes by (productId, borrowerId)", async () => {
    const { PRODUCTS } = await import("@/data/products");
    const product = PRODUCTS[0]!;
    const otherProduct = PRODUCTS[1]!;
    const meId = "borrower_me";
    const youId = "borrower_you";
    await rentalService.createRequestFromProductId({
      productId: product.id,
      durationDays: 3,
      actorBorrowerId: meId,
    });
    await rentalService.createRequestFromProductId({
      productId: product.id,
      durationDays: 1,
      actorBorrowerId: youId,
    });
    await rentalService.createRequestFromProductId({
      productId: otherProduct.id,
      durationDays: 7,
      actorBorrowerId: meId,
    });
    const mine = await rentalService.listMyRequestsForProduct(
      product.id,
      meId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.borrowerId).toBe(meId);
    expect(mine[0]?.productId).toBe(product.id);
    // Empty when scoping by an empty borrower id (no leak across
    // visitors sharing a browser).
    expect(
      await rentalService.listMyRequestsForProduct(product.id, ""),
    ).toEqual([]);
  });
});

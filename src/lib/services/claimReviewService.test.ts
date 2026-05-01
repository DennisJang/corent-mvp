// Tests for the claim window + admin review skeleton.
//
// Verifies that:
//   - opening a claim window is gated by a real, persisted rental at a
//     post-return status,
//   - opening is idempotent (re-calls return the same window),
//   - closing-as-no-claim and opening a claim are seller-only and run
//     `assertRentalSellerIs` BEFORE any persistence write,
//   - opening a claim creates a `ClaimReview` row in `open` status,
//   - admin decisions move the review to a closed status and emit a
//     trust event,
//   - re-deciding a closed review is rejected,
//   - calling `confirmReturn` from `rentalService` opens a window
//     automatically (no caller wiring needed).
//
// All tests run against the in-memory persistence adapter via
// `getPersistence().clearAll()` between cases.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RentalIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { rentalService } from "./rentalService";
import {
  ClaimReviewInputError,
  claimReviewService,
} from "./claimReviewService";

const SELLER_ID = "seller_jisu";
const BORROWER_ID = "borrower_minho";
const STRANGER_ID = "stranger_x";
const ADMIN_ID = "founder@example.com";

async function makeRentalAtReturnConfirmed(): Promise<RentalIntent> {
  // Walk a fresh rental through every happy-path state up to
  // `return_confirmed`. This lets the claim-window opener accept it.
  let r = await rentalService.create({
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
  });
  r = await rentalService.approveRequest(r, SELLER_ID);
  r = await rentalService.startPayment(r);
  r = await rentalService.confirmPayment(r);
  r = await rentalService.confirmPickup(r);
  r = await rentalService.startReturn(r);
  r = await rentalService.confirmReturn(r);
  return r;
}

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("claimReviewService.openClaimWindow", () => {
  it("opens a window with status 'open' and emits claim_window_opened", async () => {
    const r = await makeRentalAtReturnConfirmed();
    // confirmReturn already opened one — re-opening returns the same.
    const w = await claimReviewService.openClaimWindow(r.id);
    expect(w.status).toBe("open");
    expect(w.rentalIntentId).toBe(r.id);
    expect(w.id.startsWith("cw_")).toBe(true);
    expect(typeof w.openedAt).toBe("string");
    expect(typeof w.closesAt).toBe("string");

    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "claim_window_opened"),
    ).toHaveLength(1);
  });

  it("is idempotent — re-call returns the existing window", async () => {
    const r = await makeRentalAtReturnConfirmed();
    const a = await claimReviewService.openClaimWindow(r.id);
    const b = await claimReviewService.openClaimWindow(r.id);
    expect(b.id).toBe(a.id);

    const events = await getPersistence().listTrustEventsForRental(r.id);
    // confirmReturn fired one + openClaimWindow no-ops on existing.
    expect(
      events.filter((e) => e.type === "claim_window_opened"),
    ).toHaveLength(1);
  });

  it("rejects an unknown rental id", async () => {
    await expect(
      claimReviewService.openClaimWindow("ri_does_not_exist"),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });

  it("rejects opening from a pre-return status", async () => {
    const r = await rentalService.create({
      productId: "p_test",
      productName: "DEMO",
      productCategory: "massage_gun",
      durationDays: 3,
      rentalFee: 21000,
      estimatedValue: 220000,
      sellerId: SELLER_ID,
      sellerName: "DEMO 셀러",
      borrowerId: BORROWER_ID,
      borrowerName: "DEMO 빌리는사람",
    });
    expect(r.status).toBe("requested");
    await expect(
      claimReviewService.openClaimWindow(r.id),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });
});

describe("claimReviewService.closeClaimWindowAsNoClaim", () => {
  it("seller closes the window cleanly and emits claim_window_closed", async () => {
    const r = await makeRentalAtReturnConfirmed();
    const closed = await claimReviewService.closeClaimWindowAsNoClaim(
      r.id,
      SELLER_ID,
    );
    expect(closed.status).toBe("closed_no_claim");
    expect(typeof closed.closedAt).toBe("string");

    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "claim_window_closed"),
    ).toHaveLength(1);
    // No review created on a clean close.
    expect(await claimReviewService.listClaimReviewsForRental(r.id)).toEqual(
      [],
    );
  });

  it("non-seller cannot close — throws OwnershipError, window unchanged", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await expect(
      claimReviewService.closeClaimWindowAsNoClaim(r.id, BORROWER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    const w = await claimReviewService.getClaimWindowForRental(r.id);
    expect(w?.status).toBe("open");
  });

  it("stranger cannot close — throws OwnershipError", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await expect(
      claimReviewService.closeClaimWindowAsNoClaim(r.id, STRANGER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("re-closing a closed window is rejected", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    await expect(
      claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });
});

describe("claimReviewService.openClaim", () => {
  it("seller can open a claim — closes window with claim and creates review", async () => {
    const r = await makeRentalAtReturnConfirmed();
    const { window: w, review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "본체에 새로운 흠집이 보여요",
    );
    expect(w.status).toBe("closed_with_claim");
    expect(w.closeReason).toBe("본체에 새로운 흠집이 보여요");
    expect(review.status).toBe("open");
    expect(review.rentalIntentId).toBe(r.id);
    expect(review.claimWindowId).toBe(w.id);
    expect(review.openedReason).toBe("본체에 새로운 흠집이 보여요");

    const events = await getPersistence().listTrustEventsForRental(r.id);
    const types = events.map((e) => e.type);
    expect(types).toContain("claim_window_closed");
    expect(types).toContain("admin_review_started");
  });

  it("non-seller cannot open a claim", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await expect(
      claimReviewService.openClaim(r.id, BORROWER_ID),
    ).rejects.toBeInstanceOf(OwnershipError);
    expect(await claimReviewService.listClaimReviewsForRental(r.id)).toEqual(
      [],
    );
  });

  it("rejects an oversize reason (>240 chars)", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await expect(
      claimReviewService.openClaim(r.id, SELLER_ID, "a".repeat(241)),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });
});

describe("claimReviewService.recordAdminDecision", () => {
  async function setupOpenReview() {
    const r = await makeRentalAtReturnConfirmed();
    const { review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "사진과 차이가 있어요",
    );
    return { rental: r, review };
  }

  it("records 'approved' and emits admin_decision_recorded", async () => {
    const { rental, review } = await setupOpenReview();
    const decided = await claimReviewService.recordAdminDecision(
      review.id,
      "approved",
      ADMIN_ID,
    );
    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe(ADMIN_ID);
    expect(typeof decided.decidedAt).toBe("string");

    const events = await getPersistence().listTrustEventsForRental(rental.id);
    expect(
      events.filter((e) => e.type === "admin_decision_recorded"),
    ).toHaveLength(1);
  });

  it("records 'rejected' with optional notes", async () => {
    const { review } = await setupOpenReview();
    const decided = await claimReviewService.recordAdminDecision(
      review.id,
      "rejected",
      ADMIN_ID,
      "픽업 사진과 비교 결과 차이가 작아요",
    );
    expect(decided.status).toBe("rejected");
    expect(decided.decisionNotes).toBe("픽업 사진과 비교 결과 차이가 작아요");
  });

  it("'needs_review' keeps the review eligible for a follow-up decision", async () => {
    const { review } = await setupOpenReview();
    const a = await claimReviewService.recordAdminDecision(
      review.id,
      "needs_review",
      ADMIN_ID,
    );
    expect(a.status).toBe("needs_review");
    // A follow-up admin decision is still allowed.
    const b = await claimReviewService.recordAdminDecision(
      review.id,
      "approved",
      ADMIN_ID,
    );
    expect(b.status).toBe("approved");
  });

  it("rejects re-deciding an already approved/rejected review", async () => {
    const { review } = await setupOpenReview();
    await claimReviewService.recordAdminDecision(
      review.id,
      "approved",
      ADMIN_ID,
    );
    await expect(
      claimReviewService.recordAdminDecision(review.id, "rejected", ADMIN_ID),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });

  it("rejects empty admin id", async () => {
    const { review } = await setupOpenReview();
    await expect(
      claimReviewService.recordAdminDecision(review.id, "approved", ""),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });

  it("rejects unknown decision values", async () => {
    const { review } = await setupOpenReview();
    await expect(
      claimReviewService.recordAdminDecision(
        review.id,
        "weird" as unknown as "approved",
        ADMIN_ID,
      ),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });

  it("rejects unknown review id", async () => {
    await expect(
      claimReviewService.recordAdminDecision(
        "crv_does_not_exist",
        "approved",
        ADMIN_ID,
      ),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
  });
});

describe("rentalService.confirmReturn integration", () => {
  it("opens the post-return claim window automatically", async () => {
    const r = await makeRentalAtReturnConfirmed();
    const w = await claimReviewService.getClaimWindowForRental(r.id);
    expect(w?.status).toBe("open");
  });
});

// --------------------------------------------------------------
// Trust-summary alignment (Phase 1.8).
// --------------------------------------------------------------

describe("clean no-claim close emits successful-return + condition-match events", () => {
  it("increments visible summary counts on a clean close", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    const { trustEventService } = await import("./trustEvents");
    const summary = await trustEventService.summarizeUserTrust(SELLER_ID);
    expect(summary.successfulReturns).toBe(1);
    expect(summary.conditionCheckCompletedCount).toBe(1);
  });

  it("emits exactly one return_confirmed_by_seller and one condition_match_recorded", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "return_confirmed_by_seller"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === "condition_match_recorded"),
    ).toHaveLength(1);
  });

  it("does NOT emit clean-return events while the window is still open", async () => {
    const r = await makeRentalAtReturnConfirmed();
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "return_confirmed_by_seller"),
    ).toHaveLength(0);
    expect(
      events.filter((e) => e.type === "condition_match_recorded"),
    ).toHaveLength(0);
  });

  it("re-closing a closed window does NOT duplicate clean-return events", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    await expect(
      claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
    const events = await getPersistence().listTrustEventsForRental(r.id);
    expect(
      events.filter((e) => e.type === "return_confirmed_by_seller"),
    ).toHaveLength(1);
    expect(
      events.filter((e) => e.type === "condition_match_recorded"),
    ).toHaveLength(1);
  });
});

describe("openClaim emits condition_issue_reported alongside admin_review_started", () => {
  it("increments damageReportsAgainst (seller) and disputesOpened", async () => {
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.openClaim(r.id, SELLER_ID, "흠집");
    const { trustEventService } = await import("./trustEvents");
    const summary = await trustEventService.summarizeUserTrust(SELLER_ID);
    expect(summary.damageReportsAgainst).toBe(1);
    expect(summary.disputesOpened).toBe(1);
    // The clean-return counts must NOT increment when a claim is filed.
    expect(summary.successfulReturns).toBe(0);
    expect(summary.conditionCheckCompletedCount).toBe(0);
  });
});

// --------------------------------------------------------------
// Phase 1.10 — admin_decision_recorded carries reconciliation metadata.
// --------------------------------------------------------------

describe("recordAdminDecision emits structured metadata", () => {
  async function setupOpenReview() {
    const r = await makeRentalAtReturnConfirmed();
    const { review } = await claimReviewService.openClaim(
      r.id,
      SELLER_ID,
      "흠집",
    );
    return { rental: r, review };
  }

  it("admin_decision_recorded includes claimReviewId + decision + decidedBy", async () => {
    const { review } = await setupOpenReview();
    await claimReviewService.recordAdminDecision(
      review.id,
      "approved",
      ADMIN_ID,
      "픽업 사진과 거의 동일",
    );
    const events = await getPersistence().listTrustEventsForRental(
      review.rentalIntentId,
    );
    const decision = events.find((e) => e.type === "admin_decision_recorded");
    expect(decision).toBeDefined();
    expect(decision?.metadata).toEqual({
      claimReviewId: review.id,
      decision: "approved",
      decidedBy: ADMIN_ID,
    });
  });

  it("repeated needs_review decisions emit distinct events with metadata", async () => {
    const { review } = await setupOpenReview();
    await claimReviewService.recordAdminDecision(
      review.id,
      "needs_review",
      ADMIN_ID,
      "1차",
    );
    await claimReviewService.recordAdminDecision(
      review.id,
      "needs_review",
      ADMIN_ID,
      "2차",
    );
    const events = await getPersistence().listTrustEventsForRental(
      review.rentalIntentId,
    );
    const decisions = events.filter(
      (e) => e.type === "admin_decision_recorded",
    );
    expect(decisions).toHaveLength(2);
    // Distinct event ids (append-only).
    expect(new Set(decisions.map((e) => e.id)).size).toBe(2);
    // Metadata captures both decisions.
    expect(decisions.every((e) => e.metadata?.decision === "needs_review")).toBe(
      true,
    );
  });
});

// --------------------------------------------------------------
// Phase 1.10 — terminal-state guard. A `settled` rental cannot have a
// brand-new claim window opened. Existing windows stay readable.
// --------------------------------------------------------------

describe("openClaimWindow terminal-state guard", () => {
  it("rejects opening a window for a settled rental that has no existing window", async () => {
    // Construct a settled rental fixture directly via persistence so
    // no auto-opened window exists.
    const persistence = getPersistence();
    const settledRental = {
      id: "ri_settled_test",
      productId: "p_test",
      productName: "DEMO",
      productCategory: "massage_gun" as const,
      borrowerId: BORROWER_ID,
      borrowerName: "B",
      sellerId: SELLER_ID,
      sellerName: "S",
      status: "settled" as const,
      durationDays: 3 as const,
      amounts: {
        rentalFee: 21000,
        safetyDeposit: 0,
        platformFee: 2100,
        sellerPayout: 18900,
        borrowerTotal: 21000,
      },
      payment: { provider: "mock" as const, status: "paid" as const },
      pickup: { method: "direct" as const, status: "confirmed" as const },
      return: { status: "confirmed" as const },
      settlement: {
        status: "settled" as const,
        sellerPayout: 18900,
      },
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T01:00:00.000Z",
    };
    await persistence.saveRentalIntent(settledRental);
    await expect(
      claimReviewService.openClaimWindow(settledRental.id),
    ).rejects.toBeInstanceOf(ClaimReviewInputError);
    expect(
      await claimReviewService.getClaimWindowForRental(settledRental.id),
    ).toBeNull();
  });

  it("returns the existing window idempotently even when status is now settled", async () => {
    // The idempotent path runs BEFORE the openable-status check, so a
    // settled rental that already has a window (e.g. one opened at
    // return_confirmed and carried forward) is still readable via
    // openClaimWindow without throwing.
    const r = await makeRentalAtReturnConfirmed();
    await claimReviewService.closeClaimWindowAsNoClaim(r.id, SELLER_ID);
    const ready = await rentalService.readySettlement(r);
    await rentalService.settle(ready);
    // Calling openClaimWindow on the settled rental returns the
    // existing window (now closed_no_claim) without trying to open a
    // new one.
    const w = await claimReviewService.openClaimWindow(r.id);
    expect(w.status).toBe("closed_no_claim");
  });
});

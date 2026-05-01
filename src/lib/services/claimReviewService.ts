// Claim window + admin review skeleton.
//
// Phase 1.5 of the CoRent Return Trust Layer. This module is a
// SKELETON and intentionally avoids:
//   - any payment, deposit forfeiture, refund, escrow, or PG call;
//   - any automatic dispute routing, automatic damage judgment, or
//     legal adjudication;
//   - any state-machine change to `RentalIntent` (the existing
//     `rentalIntentMachine` is untouched).
//
// What it does:
//   - opens a `ClaimWindow` after a return is confirmed;
//   - lets the seller close the window as `closed_no_claim` (normal
//     finish) or open a claim with `closed_with_claim`;
//   - opens a `ClaimReview` row when a claim is filed so an admin can
//     record a placeholder decision (approve / reject / needs_review);
//   - emits the existing trust-event vocabulary (`claim_window_opened`,
//     `claim_window_closed`, `admin_review_started`,
//     `admin_decision_recorded`).
//
// Every seller-side write goes through `assertRentalSellerIs` BEFORE
// any persistence write or trust-event emission. Admin-side writes
// require a non-empty caller-supplied admin id; the actual admin
// authentication boundary stays at `requireFounderSession()` in the
// page route.

import type { RentalIntent } from "@/domain/intents";
import type {
  ClaimReview,
  ClaimReviewStatus,
  ClaimWindow,
  ClaimWindowStatus,
} from "@/domain/trust";
import { assertRentalSellerIs } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";
import { trustEventService } from "@/lib/services/trustEvents";

const REASON_MAX = 240;
const NOTES_MAX = 240;

// Phase 1 default: 24h window. Tier-dependent windows are documented
// in docs/corent_return_trust_layer.md §2.4 and are out of scope here.
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

const ALLOWED_DECISIONS = new Set<ClaimReviewStatus>([
  "approved",
  "rejected",
  "needs_review",
]);

export class ClaimReviewInputError extends Error {
  readonly code:
    | "rental_id_required"
    | "rental_not_found"
    | "rental_status_invalid"
    | "window_already_closed"
    | "window_not_open"
    | "review_not_found"
    | "review_already_decided"
    | "decision_invalid"
    | "admin_id_required"
    | "reason_too_long"
    | "notes_too_long";
  constructor(code: ClaimReviewInputError["code"], message: string) {
    super(message);
    this.name = "ClaimReviewInputError";
    this.code = code;
  }
}

function validateBoundedString(
  value: string | undefined,
  max: number,
  code: "reason_too_long" | "notes_too_long",
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length > max) {
    throw new ClaimReviewInputError(
      code,
      `string must be <= ${max} chars`,
    );
  }
}

// A return must be confirmed (or further along the post-return
// statuses) before a claim window has anything to inspect. Earlier
// statuses cannot open a window; later admin-routed statuses are
// allowed because a window may already exist by then.
const CLAIM_WINDOW_OPENABLE_STATUSES = new Set<RentalIntent["status"]>([
  "return_confirmed",
  "settlement_ready",
  "damage_reported",
  "dispute_opened",
  "settlement_blocked",
  "settled",
]);

export const claimReviewService = {
  // Idempotent: returns the existing window if one already exists for
  // the rental. Only opens a window when the rental status indicates a
  // return has been confirmed (or moved past it). Emits a
  // `claim_window_opened` TrustEvent on first open. The system actor
  // performs the open; the seller dashboard calls this on
  // `return_confirmed` and the admin queue tolerates re-calls safely.
  async openClaimWindow(rentalIntentId: string): Promise<ClaimWindow> {
    if (
      typeof rentalIntentId !== "string" ||
      rentalIntentId.length === 0
    ) {
      throw new ClaimReviewInputError(
        "rental_id_required",
        "rentalIntentId is required",
      );
    }
    const persistence = getPersistence();
    const intent = await persistence.getRentalIntent(rentalIntentId);
    if (!intent) {
      throw new ClaimReviewInputError(
        "rental_not_found",
        `rental ${rentalIntentId} is not persisted`,
      );
    }
    const existing = await persistence.getClaimWindowForRental(rentalIntentId);
    if (existing) return existing;

    if (!CLAIM_WINDOW_OPENABLE_STATUSES.has(intent.status)) {
      throw new ClaimReviewInputError(
        "rental_status_invalid",
        `cannot open claim window from status ${intent.status}`,
      );
    }

    const openedAt = nowIso();
    const closesAt = new Date(
      Date.parse(openedAt) + DEFAULT_WINDOW_MS,
    ).toISOString();
    const window: ClaimWindow = {
      id: generateId("cw"),
      rentalIntentId,
      status: "open",
      openedAt,
      closesAt,
    };
    await persistence.saveClaimWindow(window);
    await trustEventService.recordTrustEvent({
      rentalIntentId,
      type: "claim_window_opened",
      actor: "system",
    });
    return window;
  },

  async getClaimWindowForRental(
    rentalIntentId: string,
  ): Promise<ClaimWindow | null> {
    return getPersistence().getClaimWindowForRental(rentalIntentId);
  },

  async listClaimWindows(): Promise<ClaimWindow[]> {
    return getPersistence().listClaimWindows();
  },

  // Seller closes the window as a clean "no claim" finish. Verifies
  // the actor is the rental's seller via `assertRentalSellerIs`
  // BEFORE any persistence write. Idempotent: a re-call on an
  // already-closed window throws `window_already_closed` so the UI
  // can surface a clear message rather than silently succeeding.
  async closeClaimWindowAsNoClaim(
    rentalIntentId: string,
    actorUserId: string,
  ): Promise<ClaimWindow> {
    return finalizeWindow(rentalIntentId, actorUserId, "closed_no_claim");
  },

  // Seller opens a claim. Closes the window as `closed_with_claim`,
  // creates a `ClaimReview` row in `open` status, and emits a pair of
  // TrustEvents (`claim_window_closed`, `admin_review_started`).
  // The reason text is bounded; it is stored only — never auto-routed
  // into a notification, ticket, or external system.
  async openClaim(
    rentalIntentId: string,
    actorUserId: string,
    reason?: string,
  ): Promise<{ window: ClaimWindow; review: ClaimReview }> {
    validateBoundedString(reason, REASON_MAX, "reason_too_long");
    const window = await finalizeWindow(
      rentalIntentId,
      actorUserId,
      "closed_with_claim",
      reason,
    );
    const persistence = getPersistence();
    const review: ClaimReview = {
      id: generateId("crv"),
      rentalIntentId,
      claimWindowId: window.id,
      status: "open",
      openedAt: nowIso(),
      openedReason: reason,
    };
    await persistence.saveClaimReview(review);
    await trustEventService.recordTrustEvent({
      rentalIntentId,
      type: "admin_review_started",
      actor: "seller",
      notes: reason,
    });
    return { window, review };
  },

  async getClaimReview(id: string): Promise<ClaimReview | null> {
    return getPersistence().getClaimReview(id);
  },

  async listClaimReviewsForRental(
    rentalIntentId: string,
  ): Promise<ClaimReview[]> {
    return getPersistence().listClaimReviewsForRental(rentalIntentId);
  },

  async listClaimReviews(): Promise<ClaimReview[]> {
    return getPersistence().listClaimReviews();
  },

  // Admin records a placeholder decision. `decidedBy` is the admin's
  // identifier (the founder email today; a server-resolved admin id
  // later). `decision` must be one of the three closed states. Stores
  // the decision and emits an `admin_decision_recorded` TrustEvent.
  // Does NOT trigger payment, deposit, refund, escrow, or any
  // automatic enforcement.
  async recordAdminDecision(
    reviewId: string,
    decision: ClaimReviewStatus,
    decidedBy: string,
    notes?: string,
  ): Promise<ClaimReview> {
    if (typeof reviewId !== "string" || reviewId.length === 0) {
      throw new ClaimReviewInputError(
        "review_not_found",
        "reviewId is required",
      );
    }
    if (typeof decidedBy !== "string" || decidedBy.length === 0) {
      throw new ClaimReviewInputError(
        "admin_id_required",
        "decidedBy is required",
      );
    }
    if (!ALLOWED_DECISIONS.has(decision)) {
      throw new ClaimReviewInputError(
        "decision_invalid",
        `decision must be one of approved | rejected | needs_review`,
      );
    }
    validateBoundedString(notes, NOTES_MAX, "notes_too_long");

    const persistence = getPersistence();
    const existing = await persistence.getClaimReview(reviewId);
    if (!existing) {
      throw new ClaimReviewInputError(
        "review_not_found",
        `review ${reviewId} is not persisted`,
      );
    }
    if (existing.status !== "open" && existing.status !== "needs_review") {
      throw new ClaimReviewInputError(
        "review_already_decided",
        `review ${reviewId} already has a final decision`,
      );
    }
    const next: ClaimReview = {
      ...existing,
      status: decision,
      decidedBy,
      decidedAt: nowIso(),
      decisionNotes: notes,
    };
    await persistence.saveClaimReview(next);
    await trustEventService.recordTrustEvent({
      rentalIntentId: next.rentalIntentId,
      type: "admin_decision_recorded",
      actor: "admin",
      notes,
    });
    return next;
  },
};

async function finalizeWindow(
  rentalIntentId: string,
  actorUserId: string,
  toStatus: Extract<
    ClaimWindowStatus,
    "closed_no_claim" | "closed_with_claim"
  >,
  closeReason?: string,
): Promise<ClaimWindow> {
  if (typeof rentalIntentId !== "string" || rentalIntentId.length === 0) {
    throw new ClaimReviewInputError(
      "rental_id_required",
      "rentalIntentId is required",
    );
  }
  validateBoundedString(closeReason, REASON_MAX, "reason_too_long");
  const persistence = getPersistence();
  const intent = await persistence.getRentalIntent(rentalIntentId);
  if (!intent) {
    throw new ClaimReviewInputError(
      "rental_not_found",
      `rental ${rentalIntentId} is not persisted`,
    );
  }
  // Seller-only write — guard runs BEFORE we read or mutate the window.
  assertRentalSellerIs(intent, actorUserId);

  const existing = await persistence.getClaimWindowForRental(rentalIntentId);
  if (!existing) {
    throw new ClaimReviewInputError(
      "window_not_open",
      `no claim window exists for rental ${rentalIntentId}`,
    );
  }
  if (existing.status !== "open") {
    throw new ClaimReviewInputError(
      "window_already_closed",
      `claim window for rental ${rentalIntentId} is already closed`,
    );
  }
  const next: ClaimWindow = {
    ...existing,
    status: toStatus,
    closedAt: nowIso(),
    closeReason,
  };
  await persistence.saveClaimWindow(next);
  await trustEventService.recordTrustEvent({
    rentalIntentId,
    type: "claim_window_closed",
    actor: "seller",
    notes: closeReason,
  });
  return next;
}

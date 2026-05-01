// Application service for RentalIntent. Coordinates the state machine,
// payment adapter, and persistence. UI components should call this — never
// the adapters or state machine directly.
//
// Trust-flow hardening (Phase 1.7):
//
//   - Every lifecycle write reloads the canonical rental by id BEFORE
//     authorization or status checks. The caller-supplied
//     `RentalIntent` shape is treated as a hint only — its fields are
//     never trusted for `sellerId`, `borrowerId`, or `status`. A
//     forged or stale object still fails ownership / transition
//     validation against the canonical persisted record.
//   - `recordSellerHandoff` enforces that the canonical rental is in
//     the right phase for the supplied `phase` (pickup vs return).
//     Recording a pickup handoff against a freshly-requested rental
//     is rejected.
//   - `readySettlement` and `settle` are gated on the post-return
//     claim window: a window in `open` status, or a window
//     `closed_with_claim` whose review has not reached a final
//     decision (`approved` or `rejected`), blocks settlement.
//
// Seller approval / decline:
//   `approveRequest(intent, actorUserId)` and
//   `declineRequest(intent, actorUserId, reason?)` are the canonical
//   entry points for the seller-approval-before-payment flow. They
//   reload by id, run `assertRentalSellerIs` against the canonical
//   record, and only then run the state machine transition. A
//   foreign actor cannot mutate the rental even if they reach this
//   code path with a forged object.
//
//   The legacy `approve(intent)` and `cancel(intent, by)` methods stay
//   for back-compat with older callers but now also reload canonical
//   so a stale caller cannot overwrite newer persisted state. New
//   code MUST use the actor-aware variants. See
//   docs/mvp_security_guardrails.md §6 and
//   docs/corent_return_trust_layer.md §10 for migration rules.

import type { DurationDays } from "@/domain/durations";
import type { RentalEvent, RentalIntent, RentalIntentStatus } from "@/domain/intents";
import type { HandoffPhase, HandoffRecord } from "@/domain/trust";
import { getProductById } from "@/data/products";
import {
  assertRentalBorrowerIs,
  assertRentalSellerIs,
} from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { mockPaymentAdapter } from "@/lib/adapters/payment/mockPaymentAdapter";
import {
  type HandoffPatch,
  createHandoffRecord,
  handoffService,
} from "@/lib/services/handoffService";
import { claimReviewService } from "@/lib/services/claimReviewService";
import { trustEventService } from "@/lib/services/trustEvents";
import {
  approveRentalIntent,
  blockSettlement,
  cancelRentalIntent,
  confirmPickup,
  confirmReturn,
  createRentalIntent,
  type CreateRentalIntentInput,
  markPaymentFailed,
  markPaymentPending,
  markPickupMissed,
  markReturnOverdue,
  markReturnPending,
  markSettlementReady,
  mockConfirmPayment,
  mockSettle,
  openDispute,
  reportDamage,
} from "@/lib/stateMachines/rentalIntentMachine";

// Caller-supplied input shapes for hardened writes. The signature
// keeps `RentalIntent` for back-compat with existing callers, but the
// implementation only reads `id` and ignores every other field.
type IntentLike = string | { id: string };

function intentId(input: IntentLike): string {
  return typeof input === "string" ? input : input.id;
}

async function loadCanonical(input: IntentLike): Promise<RentalIntent> {
  const id = intentId(input);
  if (!id) throw new Error("rental_not_found");
  const stored = await getPersistence().getRentalIntent(id);
  if (!stored) throw new Error("rental_not_found");
  return stored;
}

async function persistAndEmit<R extends { intent: RentalIntent; event: RentalEvent }>(
  result: R,
): Promise<RentalIntent> {
  const store = getPersistence();
  await store.saveRentalIntent(result.intent);
  await store.appendRentalEvent(result.event);
  return result.intent;
}

// Phase rules for seller-side handoff records. The canonical rental
// status decides whether a pickup or return checklist is meaningful.
// Mirrors the `handoffPhaseForStatus` rule on the dashboard: the
// dashboard never renders a row outside these statuses, and the
// service must reject writes that bypass the UI.
const PICKUP_PHASE_STATUSES: ReadonlySet<RentalIntentStatus> = new Set<RentalIntentStatus>([
  "paid",
  "pickup_confirmed",
]);
const RETURN_PHASE_STATUSES: ReadonlySet<RentalIntentStatus> = new Set<RentalIntentStatus>([
  "return_pending",
  "return_confirmed",
]);

function assertHandoffPhaseAllowed(
  status: RentalIntentStatus,
  phase: HandoffPhase,
): void {
  const allowed =
    phase === "pickup" ? PICKUP_PHASE_STATUSES : RETURN_PHASE_STATUSES;
  if (!allowed.has(status)) {
    throw new Error(
      `handoff_phase_not_allowed_for_status: cannot record ${phase} handoff while rental is ${status}`,
    );
  }
}

// Settlement gate. Returns null if settlement may proceed; throws
// otherwise. Settlement is blocked while:
//   - the post-return claim window is still `open`, or
//   - the window is `closed_with_claim` and NO `ClaimReview` exists
//     yet (partial-persist guard — fail closed), or
//   - the window is `closed_with_claim` and at least one review is
//     `open` or `needs_review`. Only when EVERY review on the rental
//     has reached a final decision (`approved` or `rejected`) does
//     settlement become available.
//
// A rental that has no claim window at all (legacy / unusual paths)
// is allowed to proceed — the gate exists to prevent settlement from
// silently bypassing an opened window, not to require a window to
// exist for every rental.
async function assertSettlementNotBlockedByClaim(
  rentalIntentId: string,
): Promise<void> {
  const reason = await computeSettlementBlockReason(rentalIntentId);
  if (reason) throw new Error(`settlement_blocked: ${reason}`);
}

type SettlementBlockReason =
  | "claim_window_open"
  | "claim_review_missing"
  | "claim_review_unresolved";

async function computeSettlementBlockReason(
  rentalIntentId: string,
): Promise<SettlementBlockReason | null> {
  const window = await claimReviewService.getClaimWindowForRental(
    rentalIntentId,
  );
  if (!window) return null;
  if (window.status === "open") return "claim_window_open";
  if (window.status === "closed_no_claim") return null;
  // closed_with_claim → require a persisted, finalized review.
  const reviews =
    await claimReviewService.listClaimReviewsForRental(rentalIntentId);
  if (reviews.length === 0) {
    // The window says a claim was filed but no review row exists —
    // fail closed so a partial persist on `openClaim` cannot let
    // settlement slip through.
    return "claim_review_missing";
  }
  const unresolved = reviews.find(
    (r) => r.status === "open" || r.status === "needs_review",
  );
  if (unresolved) return "claim_review_unresolved";
  return null;
}

export const rentalService = {
  // Legacy: trusts the caller to supply seller / product / amount fields.
  // Phase 1.11 routes the renter UI through `createRequestFromProductId`
  // instead, which derives every canonical field from the trusted
  // PRODUCTS source. The legacy helper stays for tests and back-compat
  // with non-renter call sites (seeded mock data, dev tools).
  async create(input: CreateRentalIntentInput): Promise<RentalIntent> {
    const result = createRentalIntent(input);
    return persistAndEmit(result);
  },

  // Phase 1.11 — canonical request creation boundary for the
  // renter-facing item detail flow.
  //
  // The caller may supply only `(productId, durationDays, actorBorrowerId?)`.
  // Every other field — `productName`, `productCategory`, `sellerId`,
  // `sellerName`, `rentalFee`, `estimatedValue`, `pickupLocationLabel`
  // — is resolved from the trusted static `PRODUCTS` source. A forged
  // caller-supplied seller / product / price / status / payment field
  // therefore cannot reach persistence, because the helper does not
  // accept those fields at all.
  //
  // Throws `Error("product_not_found")` for unknown product ids,
  // `Error("duration_invalid")` for an unsupported duration. Returns
  // the persisted `requested` rental.
  async createRequestFromProductId(input: {
    productId: string;
    durationDays: DurationDays;
    actorBorrowerId?: string;
    actorBorrowerName?: string;
  }): Promise<RentalIntent> {
    if (typeof input.productId !== "string" || input.productId.length === 0) {
      throw new Error("product_not_found");
    }
    if (![1, 3, 7].includes(input.durationDays)) {
      throw new Error("duration_invalid");
    }
    const product = getProductById(input.productId);
    if (!product) throw new Error("product_not_found");

    // The duration → price map on the canonical product is the only
    // source of truth for the rental fee. The caller cannot inject
    // a price.
    const rentalFee =
      input.durationDays === 1
        ? product.prices["1d"]
        : input.durationDays === 3
          ? product.prices["3d"]
          : product.prices["7d"];

    const result = createRentalIntent({
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      durationDays: input.durationDays,
      rentalFee,
      estimatedValue: product.estimatedValue,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      borrowerId: input.actorBorrowerId,
      borrowerName: input.actorBorrowerName,
      pickupLocationLabel: product.pickupArea,
    });
    return persistAndEmit(result);
  },

  // Restore the most recent rental request a given borrower has sent
  // for a specific product. Used by the renter item detail surface
  // to keep "you already requested this" continuity. Scoping by
  // `(productId, borrowerId)` (Phase 1.11) prevents one local user
  // from seeing another local user's request when sharing a browser.
  async listMyRequestsForProduct(
    productId: string,
    actorBorrowerId: string,
  ): Promise<RentalIntent[]> {
    if (
      !productId ||
      typeof actorBorrowerId !== "string" ||
      actorBorrowerId.length === 0
    ) {
      return [];
    }
    const all = await getPersistence().listRentalIntents();
    return all.filter(
      (r) => r.productId === productId && r.borrowerId === actorBorrowerId,
    );
  },

  async list(): Promise<RentalIntent[]> {
    return getPersistence().listRentalIntents();
  },

  async get(id: string): Promise<RentalIntent | null> {
    return getPersistence().getRentalIntent(id);
  },

  // Legacy: trusts the caller. New code must use `approveRequest`.
  // Hardened to reload canonical so stale callers cannot overwrite
  // newer persisted state.
  async approve(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = approveRentalIntent(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Seller approves a pending request. Reloads the canonical rental
  // by id, runs `assertRentalSellerIs` against the canonical
  // `sellerId`, and only then runs the state machine transition.
  // The caller-supplied `intent` is a hint — its `sellerId`, `status`,
  // and other fields are NEVER read for authorization or branching.
  //
  // Throws `Error("rental_not_found")` if the id has no persisted record.
  // Throws `OwnershipError` when actorUserId is not the canonical seller.
  // Throws `Error("invalid_transition: …")` when the rental is not in a
  // status from which it can be approved.
  async approveRequest(
    intent: IntentLike,
    actorUserId: string,
  ): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    assertRentalSellerIs(canonical, actorUserId);
    const r = approveRentalIntent(canonical);
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  // Seller declines a pending request. Today's lifecycle does not have
  // a separate `seller_declined` status; per
  // `docs/corent_return_trust_layer.md §5`, decline maps to
  // `seller_cancelled`.
  //
  // Reloads canonical before authorization and transition checks.
  async declineRequest(
    intent: IntentLike,
    actorUserId: string,
  ): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    assertRentalSellerIs(canonical, actorUserId);
    const r = cancelRentalIntent(canonical, "seller");
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  // Borrower cancels their own pending / pre-pickup request. Reloads
  // canonical before authorization and transition checks.
  async cancelByBorrower(
    intent: IntentLike,
    actorUserId: string,
  ): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    assertRentalBorrowerIs(canonical, actorUserId);
    const r = cancelRentalIntent(canonical, "borrower");
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  // Reads the handoff record for a (rental, phase). Returns null when
  // no record exists yet — the caller decides whether to render an
  // empty checklist or skip the row.
  async getHandoffRecord(
    rentalIntentId: string,
    phase: HandoffPhase,
  ): Promise<HandoffRecord | null> {
    return getPersistence().getHandoffRecord(rentalIntentId, phase);
  },

  // Lists every handoff record for a rental (both phases). Useful for
  // the seller dashboard's compact handoff surface.
  async listHandoffRecords(
    rentalIntentId: string,
  ): Promise<HandoffRecord[]> {
    return getPersistence().listHandoffRecordsForRental(rentalIntentId);
  },

  // Seller-side handoff write path. Loads the canonical rental,
  // enforces that the rental is in the right phase for the supplied
  // `phase` (pickup vs return), runs handoffService.confirmAsSeller —
  // which calls `assertRentalSellerIs` against the canonical
  // `sellerId` BEFORE building the new record — and persists the
  // result.
  //
  // Phase rules:
  //   - `pickup`: rental status must be `paid` or `pickup_confirmed`.
  //   - `return`: rental status must be `return_pending` or
  //     `return_confirmed`.
  //
  // Throws:
  //   - Error("rental_not_found") when the rental id has no persisted intent.
  //   - Error("handoff_phase_not_allowed_for_status: ...") when the
  //     canonical rental status is not in the allowed set for `phase`.
  //   - OwnershipError when actorUserId is not the canonical seller.
  //   - HandoffInputError on bounded-shape violations (note, url, checks).
  async recordSellerHandoff(
    rentalIntentId: string,
    phase: HandoffPhase,
    actorUserId: string,
    patch: HandoffPatch = {},
    confirm = true,
  ): Promise<HandoffRecord> {
    const canonical = await loadCanonical(rentalIntentId);
    assertHandoffPhaseAllowed(canonical.status, phase);
    const existing = await getPersistence().getHandoffRecord(
      canonical.id,
      phase,
    );
    const record = existing ?? createHandoffRecord(canonical.id, phase);
    const next = handoffService.confirmAsSeller(
      canonical,
      record,
      actorUserId,
      patch,
      confirm,
    );
    await getPersistence().saveHandoffRecord(next);

    // Phase 1.4 integration: when seller-side confirmation flips
    // from false to true, emit one TrustEvent. Re-saves of an
    // already-confirmed record do NOT emit again. Borrower-side and
    // failure paths emit their own events in future PRs.
    const sellerJustConfirmed =
      next.confirmedBySeller && existing?.confirmedBySeller !== true;
    if (sellerJustConfirmed) {
      await trustEventService.recordTrustEvent({
        rentalIntentId: next.rentalIntentId,
        type:
          phase === "pickup"
            ? "pickup_evidence_recorded"
            : "return_evidence_recorded",
        actor: "seller",
        handoffPhase: phase,
      });
    }

    return next;
  },

  async startPayment(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const session = await mockPaymentAdapter.createSession(canonical);
    const r = markPaymentPending(canonical, session.sessionId);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmPayment(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    if (canonical.payment.sessionId) {
      const result = await mockPaymentAdapter.confirmPayment(
        canonical.payment.sessionId,
      );
      if (!result.ok) {
        const failed = markPaymentFailed(canonical, result.failureReason);
        if (!failed.ok) throw new Error(failed.message);
        return persistAndEmit(failed);
      }
    }
    const r = mockConfirmPayment(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmPickup(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = confirmPickup(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async startReturn(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = markReturnPending(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmReturn(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = confirmReturn(canonical);
    if (!r.ok) throw new Error(r.message);
    const next = await persistAndEmit(r);
    // Phase 1.5 integration: opening the post-return claim window is
    // idempotent at the service layer, so re-confirming the return
    // (or transitioning out of damage_reported back into
    // return_confirmed in a future flow) is safe.
    await claimReviewService.openClaimWindow(next.id);
    return next;
  },

  // Settlement gate (Phase 1.7): blocks while a claim window is open
  // or its review is unresolved. See `assertSettlementNotBlockedByClaim`.
  async readySettlement(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    await assertSettlementNotBlockedByClaim(canonical.id);
    const r = markSettlementReady(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Settlement gate also applies here so the gate cannot be bypassed
  // by skipping `readySettlement`.
  async settle(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    await assertSettlementNotBlockedByClaim(canonical.id);
    const r = mockSettle(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Read-only helper for surfaces that need to know whether the
  // settlement gate would currently allow advancement. Returns a
  // typed reason string when blocked, or null when settlement may
  // proceed. UI surfaces use this to disable the "next step" button
  // without trying-and-catching the actual transition.
  async settlementBlockReason(
    rentalIntentId: string,
  ): Promise<SettlementBlockReason | null> {
    return computeSettlementBlockReason(rentalIntentId);
  },

  // Legacy: trusts the caller. New code must use `declineRequest`
  // (seller-side decline) or `cancelByBorrower` (borrower-side cancel)
  // — both verify the actor. Hardened to reload canonical.
  async cancel(
    intent: IntentLike,
    by: "borrower" | "seller" = "borrower",
  ): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = cancelRentalIntent(canonical, by);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Failure helpers (used by chaos/dev tools). All reload canonical
  // so a stale caller cannot resurrect old state.
  async failPayment(
    intent: IntentLike,
    reason?: string,
  ): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = markPaymentFailed(canonical, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async missPickup(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = markPickupMissed(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async overdue(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = markReturnOverdue(canonical);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async damage(intent: IntentLike): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = reportDamage(canonical);
    if (!r.ok) throw new Error(r.message);
    const next = await persistAndEmit(r);
    // Phase 1.8: align the damage-state transition with the
    // `condition_issue_reported` trust event so `damageReportsAgainst`
    // reflects flows that bypass the claim window (chaos/dev tools or
    // a future direct damage report path).
    await trustEventService.recordTrustEvent({
      rentalIntentId: next.id,
      type: "condition_issue_reported",
      actor: "seller",
      handoffPhase: "return",
    });
    return next;
  },
  async dispute(intent: IntentLike, reason?: string): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = openDispute(canonical, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async block(intent: IntentLike, reason?: string): Promise<RentalIntent> {
    const canonical = await loadCanonical(intent);
    const r = blockSettlement(canonical, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
};

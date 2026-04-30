// Application service for RentalIntent. Coordinates the state machine,
// payment adapter, and persistence. UI components should call this — never
// the adapters or state machine directly.
//
// Seller approval / decline:
//   `approveRequest(intent, actorUserId)` and
//   `declineRequest(intent, actorUserId, reason?)` are the canonical
//   entry points for the seller-approval-before-payment flow. They run
//   `assertRentalSellerIs` from `src/lib/auth/guards.ts` BEFORE the state
//   machine transition, so a non-seller actor cannot mutate the rental
//   even if the UI is bypassed.
//
//   The legacy `approve(intent)` and `cancel(intent, by)` methods stay
//   for back-compat with older callers. New code MUST use the
//   actor-aware variants. See docs/mvp_security_guardrails.md §6 and
//   docs/corent_return_trust_layer.md §10 for migration rules.

import type { RentalIntent } from "@/domain/intents";
import {
  assertRentalBorrowerIs,
  assertRentalSellerIs,
} from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { mockPaymentAdapter } from "@/lib/adapters/payment/mockPaymentAdapter";
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

async function persistAndEmit<R extends { intent: RentalIntent; event: { id: string; rentalIntentId: string; fromStatus: string | null; toStatus: string; at: string } }>(
  result: R,
): Promise<RentalIntent> {
  const store = getPersistence();
  await store.saveRentalIntent(result.intent);
  await store.appendRentalEvent(result.event as Parameters<typeof store.appendRentalEvent>[0]);
  return result.intent;
}

export const rentalService = {
  async create(input: CreateRentalIntentInput): Promise<RentalIntent> {
    const result = createRentalIntent(input);
    return persistAndEmit(result);
  },

  async list(): Promise<RentalIntent[]> {
    return getPersistence().listRentalIntents();
  },

  async get(id: string): Promise<RentalIntent | null> {
    return getPersistence().getRentalIntent(id);
  },

  // Legacy: trusts the caller to be the seller. New code must use
  // `approveRequest(intent, actorUserId)` instead.
  async approve(intent: RentalIntent): Promise<RentalIntent> {
    const r = approveRentalIntent(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Seller approves a pending request. Verifies the actor is the
  // rental's seller via `assertRentalSellerIs` BEFORE the state
  // machine transition, so a foreign actor cannot mutate the rental
  // even if they reach this code path.
  //
  // Throws OwnershipError when actorUserId is not the rental's seller.
  // Throws Error("invalid_transition: …") when the rental is not in a
  // status from which it can be approved (the state machine's
  // `ALLOWED_TRANSITIONS` decides; today this is `requested`).
  async approveRequest(
    intent: RentalIntent,
    actorUserId: string,
  ): Promise<RentalIntent> {
    assertRentalSellerIs(intent, actorUserId);
    const r = approveRentalIntent(intent);
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  // Seller declines a pending request. Today's lifecycle does not have
  // a separate `seller_declined` status; per
  // `docs/corent_return_trust_layer.md §5`, decline maps to
  // `seller_cancelled`.
  //
  // Throws OwnershipError when actorUserId is not the rental's seller.
  // Throws Error("invalid_transition: …") on a status that cannot move
  // to `seller_cancelled`.
  //
  // Migration point: a future PR can add a `reason` parameter and
  // plumb it through to the emitted RentalEvent. That requires
  // extending `cancelRentalIntent` in
  // `src/lib/stateMachines/rentalIntentMachine.ts` to accept an
  // optional reason, which is intentionally out of scope for this PR.
  async declineRequest(
    intent: RentalIntent,
    actorUserId: string,
  ): Promise<RentalIntent> {
    assertRentalSellerIs(intent, actorUserId);
    const r = cancelRentalIntent(intent, "seller");
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  // Borrower cancels their own pending / pre-pickup request. Verifies
  // the actor is the rental's borrower. Throws OwnershipError or
  // invalid_transition on mismatch.
  async cancelByBorrower(
    intent: RentalIntent,
    actorUserId: string,
  ): Promise<RentalIntent> {
    assertRentalBorrowerIs(intent, actorUserId);
    const r = cancelRentalIntent(intent, "borrower");
    if (!r.ok) throw new Error(`invalid_transition: ${r.message}`);
    return persistAndEmit(r);
  },

  async startPayment(intent: RentalIntent): Promise<RentalIntent> {
    const session = await mockPaymentAdapter.createSession(intent);
    const r = markPaymentPending(intent, session.sessionId);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmPayment(intent: RentalIntent): Promise<RentalIntent> {
    if (intent.payment.sessionId) {
      const result = await mockPaymentAdapter.confirmPayment(
        intent.payment.sessionId,
      );
      if (!result.ok) {
        const failed = markPaymentFailed(intent, result.failureReason);
        if (!failed.ok) throw new Error(failed.message);
        return persistAndEmit(failed);
      }
    }
    const r = mockConfirmPayment(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmPickup(intent: RentalIntent): Promise<RentalIntent> {
    const r = confirmPickup(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async startReturn(intent: RentalIntent): Promise<RentalIntent> {
    const r = markReturnPending(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async confirmReturn(intent: RentalIntent): Promise<RentalIntent> {
    const r = confirmReturn(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async readySettlement(intent: RentalIntent): Promise<RentalIntent> {
    const r = markSettlementReady(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  async settle(intent: RentalIntent): Promise<RentalIntent> {
    const r = mockSettle(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Legacy: trusts the caller. New code must use `declineRequest`
  // (seller-side decline) or `cancelByBorrower` (borrower-side cancel)
  // — both verify the actor.
  async cancel(
    intent: RentalIntent,
    by: "borrower" | "seller" = "borrower",
  ): Promise<RentalIntent> {
    const r = cancelRentalIntent(intent, by);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },

  // Failure helpers (used by chaos/dev tools)
  async failPayment(
    intent: RentalIntent,
    reason?: string,
  ): Promise<RentalIntent> {
    const r = markPaymentFailed(intent, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async missPickup(intent: RentalIntent): Promise<RentalIntent> {
    const r = markPickupMissed(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async overdue(intent: RentalIntent): Promise<RentalIntent> {
    const r = markReturnOverdue(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async damage(intent: RentalIntent): Promise<RentalIntent> {
    const r = reportDamage(intent);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async dispute(intent: RentalIntent, reason?: string): Promise<RentalIntent> {
    const r = openDispute(intent, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
  async block(intent: RentalIntent, reason?: string): Promise<RentalIntent> {
    const r = blockSettlement(intent, reason);
    if (!r.ok) throw new Error(r.message);
    return persistAndEmit(r);
  },
};

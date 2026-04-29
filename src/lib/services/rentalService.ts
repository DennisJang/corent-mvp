// Application service for RentalIntent. Coordinates the state machine,
// payment adapter, and persistence. UI components should call this — never
// the adapters or state machine directly.

import type { RentalIntent } from "@/domain/intents";
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

  async approve(intent: RentalIntent): Promise<RentalIntent> {
    const r = approveRentalIntent(intent);
    if (!r.ok) throw new Error(r.message);
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

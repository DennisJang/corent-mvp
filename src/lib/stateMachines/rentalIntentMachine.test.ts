import { describe, expect, it } from "vitest";

import type {
  RentalEvent,
  RentalIntent,
  RentalIntentStatus,
} from "@/domain/intents";
import {
  approveRentalIntent,
  blockSettlement,
  cancelRentalIntent,
  confirmPickup,
  confirmReturn,
  markPaymentFailed,
  markPaymentPending,
  markReturnOverdue,
  markReturnPending,
  markSettlementReady,
  mockConfirmPayment,
  mockSettle,
  openDispute,
  reportDamage,
  requestRentalIntent,
  type TransitionResult,
} from "@/lib/stateMachines/rentalIntentMachine";

const baseIntent = (status: RentalIntentStatus = "draft"): RentalIntent => ({
  id: "ri_test",
  productId: "product_test",
  productName: "Test massage gun",
  productCategory: "massage_gun",
  borrowerId: "borrower_test",
  borrowerName: "Borrower",
  sellerId: "seller_test",
  sellerName: "Seller",
  status,
  durationDays: 3,
  amounts: {
    rentalFee: 30000,
    safetyDeposit: 100000,
    platformFee: 3000,
    sellerPayout: 27000,
    borrowerTotal: 130000,
  },
  payment: {
    provider: "mock",
    status: "not_started",
  },
  pickup: {
    method: "direct",
    status: "not_scheduled",
    locationLabel: "Gangnam",
  },
  return: {
    status: "not_due",
  },
  settlement: {
    status: "not_ready",
    sellerPayout: 27000,
  },
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z",
});

const existingEvent: RentalEvent = {
  id: "evt_existing",
  rentalIntentId: "ri_test",
  fromStatus: null,
  toStatus: "draft",
  at: "2026-04-29T00:00:00.000Z",
  reason: "seed",
  actor: "system",
};

type TransitionFn = (intent: RentalIntent) => TransitionResult;

function expectSuccess(
  result: TransitionResult,
): Extract<TransitionResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

function expectFailure(result: TransitionResult): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBe("invalid_transition");
  }
}

function applySuccessfulTransition(
  intent: RentalIntent,
  events: RentalEvent[],
  transition: TransitionFn,
): { intent: RentalIntent; events: RentalEvent[] } {
  const beforeEvents = events;
  const result = expectSuccess(transition(intent));
  const nextEvents = [...events, result.event];

  expect(nextEvents).toHaveLength(beforeEvents.length + 1);
  expect(nextEvents.slice(0, beforeEvents.length)).toEqual(beforeEvents);
  expect(result.event.rentalIntentId).toBe(intent.id);
  expect(result.event.fromStatus).toBe(intent.status);
  expect(result.event.toStatus).toBe(result.intent.status);
  expect(result.event.at).toEqual(expect.any(String));
  expect(Date.parse(result.event.at)).not.toBeNaN();

  return { intent: result.intent, events: nextEvents };
}

function expectFailedTransitionDoesNotAppend(
  intent: RentalIntent,
  events: RentalEvent[],
  transition: TransitionFn,
): void {
  const result = transition(intent);

  expectFailure(result);
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual(existingEvent);
}

const happyPathTransitions: Array<[RentalIntentStatus, TransitionFn]> = [
  ["requested", requestRentalIntent],
  ["seller_approved", approveRentalIntent],
  ["payment_pending", markPaymentPending],
  ["paid", mockConfirmPayment],
  ["pickup_confirmed", confirmPickup],
  ["return_pending", markReturnPending],
  ["return_confirmed", confirmReturn],
  ["settlement_ready", markSettlementReady],
  ["settled", mockSettle],
];

const advancingTransitions: TransitionFn[] = [
  requestRentalIntent,
  approveRentalIntent,
  markPaymentPending,
  mockConfirmPayment,
  confirmPickup,
  markReturnPending,
  confirmReturn,
  markSettlementReady,
  mockSettle,
  markPaymentFailed,
  markReturnOverdue,
  reportDamage,
  openDispute,
  blockSettlement,
  (intent) => cancelRentalIntent(intent, "borrower"),
  (intent) => cancelRentalIntent(intent, "seller"),
];

function advanceThroughHappyPath(
  targetStatus: RentalIntentStatus,
): RentalIntent {
  let intent = baseIntent("draft");

  for (const [status, transition] of happyPathTransitions) {
    intent = expectSuccess(transition(intent)).intent;
    if (status === targetStatus) {
      return intent;
    }
  }

  throw new Error(`Happy path did not reach ${targetStatus}.`);
}

function expectTerminalStateCannotAdvance(status: RentalIntentStatus): void {
  for (const transition of advancingTransitions) {
    expectFailure(transition(baseIntent(status)));
  }
}

describe("rentalIntentMachine", () => {
  it("moves through the full happy path and emits one event per transition", () => {
    let intent = baseIntent("draft");
    let events = [existingEvent];

    for (const [expectedStatus, transition] of happyPathTransitions) {
      ({ intent, events } = applySuccessfulTransition(
        intent,
        events,
        transition,
      ));
      expect(intent.status).toBe(expectedStatus);
      expect(events.at(-1)?.toStatus).toBe(expectedStatus);
    }

    expect(events).toHaveLength(happyPathTransitions.length + 1);
    expect(events[0]).toEqual(existingEvent);
  });

  it("rejects invalid transitions without appending events", () => {
    const events = [existingEvent];
    const requested = advanceThroughHappyPath("requested");
    const paymentPending = advanceThroughHappyPath("payment_pending");
    const settled = advanceThroughHappyPath("settled");

    expectFailedTransitionDoesNotAppend(baseIntent("draft"), events, mockConfirmPayment);
    expectFailedTransitionDoesNotAppend(requested, events, mockConfirmPayment);
    expectFailedTransitionDoesNotAppend(paymentPending, events, confirmPickup);
    for (const transition of advancingTransitions) {
      expectFailedTransitionDoesNotAppend(settled, events, transition);
    }
  });

  it("allows recovery transitions", () => {
    const requested = expectSuccess(requestRentalIntent(baseIntent("draft"))).intent;
    const approved = expectSuccess(approveRentalIntent(requested)).intent;
    const paymentPending = expectSuccess(markPaymentPending(approved)).intent;
    const paymentFailed = expectSuccess(markPaymentFailed(paymentPending)).intent;
    expectSuccess(markPaymentPending(paymentFailed));

    const returnPending = expectSuccess(
      markReturnPending(
        expectSuccess(confirmPickup(expectSuccess(mockConfirmPayment(paymentPending)).intent))
          .intent,
      ),
    ).intent;
    const returnOverdue = expectSuccess(markReturnOverdue(returnPending)).intent;
    expectSuccess(markReturnPending(returnOverdue));
    expectSuccess(openDispute(returnOverdue));

    const damageReported = expectSuccess(reportDamage(returnPending)).intent;
    const disputeOpened = expectSuccess(openDispute(damageReported)).intent;
    expectSuccess(blockSettlement(disputeOpened));
    expectSuccess(markSettlementReady(disputeOpened));

    const settlementBlocked = expectSuccess(blockSettlement(disputeOpened)).intent;
    expectSuccess(markSettlementReady(settlementBlocked));
  });

  it("enforces cancel paths and terminal states", () => {
    const requested = expectSuccess(requestRentalIntent(baseIntent("draft"))).intent;
    const sellerApproved = expectSuccess(approveRentalIntent(requested)).intent;
    const paymentPending = expectSuccess(markPaymentPending(sellerApproved)).intent;
    const paid = expectSuccess(mockConfirmPayment(paymentPending)).intent;

    expectSuccess(cancelRentalIntent(requested, "borrower"));
    expectSuccess(cancelRentalIntent(requested, "seller"));
    expectSuccess(cancelRentalIntent(sellerApproved, "borrower"));
    expectSuccess(cancelRentalIntent(paymentPending, "borrower"));

    expectFailure(cancelRentalIntent(paid, "borrower"));

    const borrowerCancelled = expectSuccess(
      cancelRentalIntent(requested, "borrower"),
    ).intent;
    const sellerCancelled = expectSuccess(cancelRentalIntent(requested, "seller"))
      .intent;

    expectFailure(approveRentalIntent(borrowerCancelled));
    expectFailure(markPaymentPending(sellerCancelled));
    expectTerminalStateCannotAdvance("borrower_cancelled");
    expectTerminalStateCannotAdvance("seller_cancelled");
    expectTerminalStateCannotAdvance("cancelled");
    expectTerminalStateCannotAdvance("settled");
  });
});

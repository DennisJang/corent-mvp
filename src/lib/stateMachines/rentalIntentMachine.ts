// RentalIntent state machine. Pure transition functions — they validate the
// move, return either a new RentalIntent or a clear error, and never mutate
// the input. Every successful transition emits a RentalEvent.

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type {
  PaymentStatus,
  RentalEvent,
  RentalIntent,
  RentalIntentStatus,
} from "@/domain/intents";
import { generateId, nowIso } from "@/lib/ids";
import {
  calculatePlatformFee,
  calculateRentalAmounts,
  calculateSellerPayout,
} from "@/lib/pricing";

export type TransitionError = {
  ok: false;
  error: "invalid_transition" | "missing_data";
  from: RentalIntentStatus;
  to?: RentalIntentStatus;
  message: string;
};

export type TransitionResult =
  | { ok: true; intent: RentalIntent; event: RentalEvent }
  | TransitionError;

// Each entry lists the statuses reachable from the key. Anything not listed
// is rejected by `transition()` with a structured `invalid_transition`
// error. Terminal states (settled, cancelled, *_cancelled) keep an empty
// array so they can never advance accidentally.
const ALLOWED_TRANSITIONS: Record<RentalIntentStatus, RentalIntentStatus[]> = {
  // Happy path
  draft: ["requested", "borrower_cancelled"],
  requested: ["seller_approved", "seller_cancelled", "borrower_cancelled"],
  seller_approved: ["payment_pending", "borrower_cancelled"],
  payment_pending: ["paid", "payment_failed", "borrower_cancelled"],
  paid: ["pickup_confirmed", "pickup_missed"],
  pickup_confirmed: ["return_pending"],
  return_pending: ["return_confirmed", "return_overdue", "damage_reported"],
  return_confirmed: ["settlement_ready", "damage_reported"],
  settlement_ready: ["settled", "settlement_blocked", "dispute_opened"],

  // Terminal states — must never advance.
  settled: [],
  cancelled: [],
  seller_cancelled: [],
  borrower_cancelled: [],

  // Failure states with explicit recovery paths.
  payment_failed: ["payment_pending", "borrower_cancelled"],
  pickup_missed: ["seller_cancelled", "borrower_cancelled"],
  return_overdue: [
    "return_pending",
    "return_confirmed",
    "damage_reported",
    "dispute_opened",
  ],
  damage_reported: ["dispute_opened", "settlement_ready"],
  dispute_opened: ["settlement_ready", "settlement_blocked"],
  settlement_blocked: ["settlement_ready", "settled", "dispute_opened"],
};

export function canTransition(
  from: RentalIntentStatus,
  to: RentalIntentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function transition(
  intent: RentalIntent,
  to: RentalIntentStatus,
  patch: Partial<RentalIntent>,
  reason?: string,
  actor?: RentalEvent["actor"],
): TransitionResult {
  if (!canTransition(intent.status, to)) {
    return {
      ok: false,
      error: "invalid_transition",
      from: intent.status,
      to,
      message: `Cannot move RentalIntent from ${intent.status} to ${to}.`,
    };
  }
  const at = nowIso();
  const next: RentalIntent = {
    ...intent,
    ...patch,
    status: to,
    updatedAt: at,
  };
  const event: RentalEvent = {
    id: generateId("evt"),
    rentalIntentId: intent.id,
    fromStatus: intent.status,
    toStatus: to,
    at,
    reason,
    actor,
  };
  return { ok: true, intent: next, event };
}

// --------------------------------------------------------------
// Constructors
// --------------------------------------------------------------

export type CreateRentalIntentInput = {
  productId: string;
  productName: string;
  productCategory: CategoryId;
  durationDays: DurationDays;
  rentalFee: number;
  estimatedValue: number;
  sellerId: string;
  sellerName: string;
  borrowerId?: string;
  borrowerName?: string;
  pickupLocationLabel?: string;
};

export function createRentalIntent(
  input: CreateRentalIntentInput,
): { intent: RentalIntent; event: RentalEvent } {
  const id = generateId("ri");
  const at = nowIso();
  const amounts = calculateRentalAmounts(input.rentalFee, input.estimatedValue);

  const intent: RentalIntent = {
    id,
    productId: input.productId,
    productName: input.productName,
    productCategory: input.productCategory,
    borrowerId: input.borrowerId,
    borrowerName: input.borrowerName,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    status: "requested",
    durationDays: input.durationDays,
    amounts,
    payment: {
      provider: "mock",
      status: "not_started",
    },
    pickup: {
      method: "direct",
      status: "not_scheduled",
      locationLabel: input.pickupLocationLabel,
    },
    return: { status: "not_due" },
    settlement: {
      status: "not_ready",
      sellerPayout: amounts.sellerPayout,
    },
    createdAt: at,
    updatedAt: at,
  };

  const event: RentalEvent = {
    id: generateId("evt"),
    rentalIntentId: id,
    fromStatus: null,
    toStatus: "requested",
    at,
    actor: "borrower",
    reason: "rental_request_created",
  };

  return { intent, event };
}

// --------------------------------------------------------------
// Happy-path transitions
// --------------------------------------------------------------

export function approveRentalIntent(intent: RentalIntent): TransitionResult {
  return transition(intent, "seller_approved", {}, "seller_approved", "seller");
}

export function markPaymentPending(
  intent: RentalIntent,
  sessionId?: string,
): TransitionResult {
  return transition(
    intent,
    "payment_pending",
    {
      payment: { ...intent.payment, status: "pending", sessionId },
    },
    "payment_pending",
    "system",
  );
}

export function mockConfirmPayment(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "paid",
    {
      payment: { ...intent.payment, status: "paid" satisfies PaymentStatus },
    },
    "payment_confirmed",
    "system",
  );
}

export function confirmPickup(
  intent: RentalIntent,
  locationLabel?: string,
): TransitionResult {
  return transition(
    intent,
    "pickup_confirmed",
    {
      pickup: {
        ...intent.pickup,
        status: "confirmed",
        locationLabel: locationLabel ?? intent.pickup.locationLabel,
      },
    },
    "pickup_confirmed",
    "borrower",
  );
}

export function markReturnPending(
  intent: RentalIntent,
  dueAt?: string,
): TransitionResult {
  return transition(
    intent,
    "return_pending",
    { return: { ...intent.return, status: "pending", dueAt } },
    "return_pending",
    "system",
  );
}

export function confirmReturn(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "return_confirmed",
    {
      return: {
        ...intent.return,
        status: "confirmed",
        confirmedAt: nowIso(),
      },
    },
    "return_confirmed",
    "seller",
  );
}

export function markSettlementReady(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "settlement_ready",
    {
      settlement: {
        ...intent.settlement,
        status: "ready",
        sellerPayout: calculateSellerPayout(intent.amounts.rentalFee),
      },
    },
    "settlement_ready",
    "system",
  );
}

export function mockSettle(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "settled",
    {
      settlement: {
        ...intent.settlement,
        status: "settled",
        settledAt: nowIso(),
      },
    },
    "settlement_completed",
    "system",
  );
}

// --------------------------------------------------------------
// Failure transitions
// --------------------------------------------------------------

export function markPaymentFailed(
  intent: RentalIntent,
  reason: string = "card_declined",
): TransitionResult {
  return transition(
    intent,
    "payment_failed",
    {
      payment: {
        ...intent.payment,
        status: "failed",
        failureReason: reason,
      },
    },
    reason,
    "system",
  );
}

export function markPickupMissed(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "pickup_missed",
    { pickup: { ...intent.pickup, status: "missed" } },
    "pickup_missed",
    "system",
  );
}

export function markReturnOverdue(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "return_overdue",
    { return: { ...intent.return, status: "overdue" } },
    "return_overdue",
    "system",
  );
}

export function reportDamage(intent: RentalIntent): TransitionResult {
  return transition(
    intent,
    "damage_reported",
    { return: { ...intent.return, status: "damage_reported" } },
    "damage_reported",
    "seller",
  );
}

export function openDispute(
  intent: RentalIntent,
  reason: string = "dispute_opened",
): TransitionResult {
  return transition(intent, "dispute_opened", {}, reason, "seller");
}

export function blockSettlement(
  intent: RentalIntent,
  reason: string = "settlement_blocked",
): TransitionResult {
  return transition(
    intent,
    "settlement_blocked",
    {
      settlement: {
        ...intent.settlement,
        status: "blocked",
        blockedReason: reason,
      },
    },
    reason,
    "admin",
  );
}

export function cancelRentalIntent(
  intent: RentalIntent,
  by: "borrower" | "seller" = "borrower",
): TransitionResult {
  const target: RentalIntentStatus =
    by === "seller" ? "seller_cancelled" : "borrower_cancelled";
  return transition(intent, target, {}, `${target}`, by);
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

export function recomputePlatformFee(intent: RentalIntent): RentalIntent {
  const platformFee = calculatePlatformFee(intent.amounts.rentalFee);
  const sellerPayout = calculateSellerPayout(intent.amounts.rentalFee);
  return {
    ...intent,
    amounts: { ...intent.amounts, platformFee, sellerPayout },
    settlement: { ...intent.settlement, sellerPayout },
  };
}

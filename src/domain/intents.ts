// Stripe-style Intent model. These are the durable, transition-driven
// objects the rest of the app revolves around. Each is shaped to map cleanly
// to a future relational table (see docs/corent_database_schema_draft.md).

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type { ItemCondition } from "@/domain/products";

// --------------------------------------------------------------
// SearchIntent
// --------------------------------------------------------------

export type SearchIntent = {
  id: string;
  rawInput: string;
  category?: CategoryId;
  durationDays?: DurationDays;
  region?: "seoul";
  priceMax?: number;
  pickupMethod: "direct";
  trustPreference?: "verified_first" | "low_deposit" | "closest";
  createdAt: string;
};

// --------------------------------------------------------------
// VerificationIntent
// --------------------------------------------------------------

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "submitted"
  | "ai_checked"
  | "human_review_pending"
  | "verified"
  | "rejected";

export type VerificationChecks = {
  frontPhoto: boolean;
  backPhoto: boolean;
  componentsPhoto: boolean;
  workingProof: boolean;
  safetyCodePhoto: boolean;
  privateSerialStored: boolean;
};

export type VerificationIntent = {
  id: string;
  safetyCode: string;
  status: VerificationStatus;
  checks: VerificationChecks;
  aiNotes?: string[];
  humanReviewNotes?: string[];
};

export const EMPTY_VERIFICATION_CHECKS: VerificationChecks = {
  frontPhoto: false,
  backPhoto: false,
  componentsPhoto: false,
  workingProof: false,
  safetyCodePhoto: false,
  privateSerialStored: false,
};

// --------------------------------------------------------------
// ListingIntent
// --------------------------------------------------------------

export type ListingStatus =
  | "draft"
  | "ai_extracted"
  | "verification_incomplete"
  | "human_review_pending"
  | "approved"
  | "rejected";

export type ListingIntent = {
  id: string;
  sellerId: string;
  status: ListingStatus;

  rawSellerInput?: string;

  item: {
    name: string;
    category: CategoryId;
    estimatedValue: number;
    condition: ItemCondition;
    components: string[];
    defects?: string;
    privateSerialNumber?: string;
    pickupArea?: string;
  };

  pricing: {
    oneDay: number;
    threeDays: number;
    sevenDays: number;
    sellerAdjusted?: boolean;
  };

  verification: VerificationIntent;

  createdAt: string;
  updatedAt: string;
};

// --------------------------------------------------------------
// Payment / Settlement
// --------------------------------------------------------------

export type PaymentProvider = "mock" | "toss";

export type PaymentStatus =
  | "not_started"
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded";

export type PaymentSession = {
  sessionId: string;
  provider: PaymentProvider;
  rentalIntentId: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  authorizedAt?: string;
  paidAt?: string;
  failureReason?: string;
};

export type SettlementStatus = "not_ready" | "ready" | "blocked" | "settled";

export type SettlementState = {
  status: SettlementStatus;
  sellerPayout: number;
  blockedReason?: string;
  settledAt?: string;
};

// --------------------------------------------------------------
// RentalIntent — the central transactional object
// --------------------------------------------------------------

export type RentalIntentStatus =
  | "draft"
  | "requested"
  | "seller_approved"
  | "payment_pending"
  | "paid"
  | "pickup_confirmed"
  | "return_pending"
  | "return_confirmed"
  | "settlement_ready"
  | "settled"
  | "cancelled"
  | "payment_failed"
  | "seller_cancelled"
  | "borrower_cancelled"
  | "pickup_missed"
  | "return_overdue"
  | "damage_reported"
  | "dispute_opened"
  | "settlement_blocked";

export const RENTAL_HAPPY_PATH = [
  "draft",
  "requested",
  "seller_approved",
  "payment_pending",
  "paid",
  "pickup_confirmed",
  "return_pending",
  "return_confirmed",
  "settlement_ready",
  "settled",
] as const satisfies readonly RentalIntentStatus[];

export type HappyPathStatus = (typeof RENTAL_HAPPY_PATH)[number];

export const RENTAL_FAILURE_STATES: RentalIntentStatus[] = [
  "cancelled",
  "payment_failed",
  "seller_cancelled",
  "borrower_cancelled",
  "pickup_missed",
  "return_overdue",
  "damage_reported",
  "dispute_opened",
  "settlement_blocked",
];

export function isFailureStatus(s: RentalIntentStatus): boolean {
  return RENTAL_FAILURE_STATES.includes(s);
}

export type RentalAmounts = {
  rentalFee: number;
  safetyDeposit: number;
  platformFee: number;
  sellerPayout: number;
  borrowerTotal: number;
};

export type PickupState = {
  method: "direct";
  status: "not_scheduled" | "scheduled" | "confirmed" | "missed";
  locationLabel?: string;
};

export type ReturnState = {
  status: "not_due" | "pending" | "confirmed" | "overdue" | "damage_reported";
  dueAt?: string;
  confirmedAt?: string;
};

export type RentalIntent = {
  id: string;
  productId: string;
  productName: string;
  productCategory: CategoryId;
  borrowerId?: string;
  borrowerName?: string;
  sellerId: string;
  sellerName: string;

  status: RentalIntentStatus;
  durationDays: DurationDays;

  amounts: RentalAmounts;

  payment: {
    provider: PaymentProvider;
    sessionId?: string;
    status: PaymentStatus;
    failureReason?: string;
  };

  pickup: PickupState;
  return: ReturnState;
  settlement: SettlementState;

  createdAt: string;
  updatedAt: string;
};

// --------------------------------------------------------------
// RentalEvent — append-only lifecycle log (future rental_events table)
// --------------------------------------------------------------

export type RentalEvent = {
  id: string;
  rentalIntentId: string;
  fromStatus: RentalIntentStatus | null;
  toStatus: RentalIntentStatus;
  at: string;
  reason?: string;
  actor?: "system" | "seller" | "borrower" | "admin";
  metadata?: Record<string, string | number | boolean | null>;
};

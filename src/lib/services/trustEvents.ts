// TrustEvent factory. Phase 1.3 ships only the typed factory — no
// persistence, no service integration, no automatic firing from the
// handoff flow. Surfaces that want to emit a trust event today
// construct one and discard it; a future PR will add persistence and
// wire the factory into the handoff orchestrator + admin surfaces.
//
// The factory exists now so the call shape is stable across PRs and
// tests can pin the event-type vocabulary early.

import type { RentalIntent } from "@/domain/intents";
import {
  EMPTY_USER_TRUST_SUMMARY,
  type HandoffPhase,
  type TrustEvent,
  type TrustEventActor,
  type TrustEventType,
  type UserTrustSummary,
} from "@/domain/trust";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";

export type CreateTrustEventInput = {
  rentalIntentId: string;
  type: TrustEventType;
  actor: TrustEventActor;
  handoffPhase?: HandoffPhase;
  evidenceRefs?: string[];
  notes?: string;
  // Override `at` for SSR / deterministic test runs. Defaults to nowIso().
  at?: string;
};

const NOTE_MAX = 240;

export class TrustEventInputError extends Error {
  readonly code:
    | "rental_id_required"
    | "type_invalid"
    | "actor_invalid"
    | "handoff_phase_invalid"
    | "notes_too_long"
    | "evidence_refs_invalid";
  constructor(code: TrustEventInputError["code"], message: string) {
    super(message);
    this.name = "TrustEventInputError";
    this.code = code;
  }
}

const ALLOWED_TYPES: ReadonlySet<TrustEventType> = new Set<TrustEventType>([
  "seller_approved_request",
  "borrower_acknowledged_pickup",
  "pickup_evidence_recorded",
  "return_evidence_recorded",
  "return_confirmed_by_seller",
  "condition_match_recorded",
  "condition_issue_reported",
  "admin_review_started",
  "admin_decision_recorded",
  "claim_window_opened",
  "claim_window_closed",
]);

const ALLOWED_ACTORS: ReadonlySet<TrustEventActor> = new Set<TrustEventActor>([
  "seller",
  "borrower",
  "admin",
  "system",
]);

const ALLOWED_PHASES: ReadonlySet<HandoffPhase> = new Set<HandoffPhase>([
  "pickup",
  "return",
]);

export function createTrustEvent(input: CreateTrustEventInput): TrustEvent {
  if (
    typeof input.rentalIntentId !== "string" ||
    input.rentalIntentId.length === 0
  ) {
    throw new TrustEventInputError(
      "rental_id_required",
      "rentalIntentId is required",
    );
  }
  if (!ALLOWED_TYPES.has(input.type)) {
    throw new TrustEventInputError(
      "type_invalid",
      `unknown trust event type: ${String(input.type)}`,
    );
  }
  if (!ALLOWED_ACTORS.has(input.actor)) {
    throw new TrustEventInputError(
      "actor_invalid",
      `unknown trust event actor: ${String(input.actor)}`,
    );
  }
  if (
    input.handoffPhase !== undefined &&
    !ALLOWED_PHASES.has(input.handoffPhase)
  ) {
    throw new TrustEventInputError(
      "handoff_phase_invalid",
      `handoff phase must be 'pickup' or 'return'`,
    );
  }
  if (input.notes !== undefined) {
    if (typeof input.notes !== "string" || input.notes.length > NOTE_MAX) {
      throw new TrustEventInputError(
        "notes_too_long",
        `notes must be a string <= ${NOTE_MAX} chars`,
      );
    }
  }
  if (input.evidenceRefs !== undefined) {
    if (!Array.isArray(input.evidenceRefs)) {
      throw new TrustEventInputError(
        "evidence_refs_invalid",
        "evidenceRefs must be an array of strings",
      );
    }
    for (const r of input.evidenceRefs) {
      if (typeof r !== "string") {
        throw new TrustEventInputError(
          "evidence_refs_invalid",
          "every evidenceRef must be a string",
        );
      }
    }
  }

  return {
    id: generateId("tev"),
    rentalIntentId: input.rentalIntentId,
    type: input.type,
    at: input.at ?? nowIso(),
    actor: input.actor,
    handoffPhase: input.handoffPhase,
    evidenceRefs: input.evidenceRefs,
    notes: input.notes,
  };
}

// --------------------------------------------------------------
// summarizeTrustEvents — pure count-based summary. Scoped to events
// whose rental has the given userId as seller OR borrower. Does NOT
// implement scoring, tier upgrades, unlock-level inference, or any
// automatic account-standing change. The standing always defaults
// to "normal"; only an admin-driven future PR can move a user out
// of it.
//
// `damageReportsAgainst` only counts events tied to rentals where
// the user is the SELLER — the issue was reported about them.
// --------------------------------------------------------------

export function summarizeTrustEvents(
  events: TrustEvent[],
  rentalById: Map<string, RentalIntent>,
  userId: string,
): UserTrustSummary {
  const summary: UserTrustSummary = {
    userId,
    ...EMPTY_USER_TRUST_SUMMARY,
  };
  if (!userId) return summary;
  for (const e of events) {
    const rental = rentalById.get(e.rentalIntentId);
    if (!rental) continue;
    const isSeller = rental.sellerId === userId;
    const isBorrower = rental.borrowerId === userId;
    if (!isSeller && !isBorrower) continue;
    switch (e.type) {
      case "pickup_evidence_recorded":
        summary.pickupConfirmedCount += 1;
        break;
      case "return_evidence_recorded":
        summary.returnConfirmedCount += 1;
        break;
      case "return_confirmed_by_seller":
        summary.successfulReturns += 1;
        break;
      case "condition_match_recorded":
        summary.conditionCheckCompletedCount += 1;
        break;
      case "admin_review_started":
        summary.disputesOpened += 1;
        break;
      case "condition_issue_reported":
        if (isSeller) summary.damageReportsAgainst += 1;
        break;
      // Other event types contribute nothing to the MVP summary.
      default:
        break;
    }
  }
  return summary;
}

// --------------------------------------------------------------
// trustEventService — persistence-aware orchestration. Reads/writes
// go through `getPersistence()`. The seller dashboard and any future
// trust surface should call these methods rather than touching the
// persistence adapter directly.
// --------------------------------------------------------------

export const trustEventService = {
  // Validates input (via createTrustEvent), persists, and returns the
  // newly-created event so callers can reference it. Idempotent
  // re-saves on the same id are safe at the adapter layer.
  async recordTrustEvent(input: CreateTrustEventInput): Promise<TrustEvent> {
    const event = createTrustEvent(input);
    await getPersistence().saveTrustEvent(event);
    return event;
  },

  async listTrustEventsForRental(
    rentalIntentId: string,
  ): Promise<TrustEvent[]> {
    return getPersistence().listTrustEventsForRental(rentalIntentId);
  },

  // List every event tied to a rental where the user is seller or
  // borrower. Does a single full read of events + rentals; this is
  // fine at MVP scale and trivially replaceable by a real query in
  // a future PR.
  async listTrustEventsForUser(userId: string): Promise<TrustEvent[]> {
    if (!userId) return [];
    const persistence = getPersistence();
    const [rentals, events] = await Promise.all([
      persistence.listRentalIntents(),
      persistence.listTrustEvents(),
    ]);
    const myRentalIds = new Set<string>();
    for (const r of rentals) {
      if (r.sellerId === userId || r.borrowerId === userId) {
        myRentalIds.add(r.id);
      }
    }
    return events.filter((e) => myRentalIds.has(e.rentalIntentId));
  },

  // Convenience that loads everything and returns the count-based
  // summary. Surfaces that need both the full event list and the
  // summary should call listTrustEventsForUser + summarizeTrustEvents
  // explicitly to avoid the double read.
  async summarizeUserTrust(userId: string): Promise<UserTrustSummary> {
    if (!userId) {
      return { userId: "", ...EMPTY_USER_TRUST_SUMMARY };
    }
    const persistence = getPersistence();
    const [rentals, events] = await Promise.all([
      persistence.listRentalIntents(),
      persistence.listTrustEvents(),
    ]);
    const map = new Map<string, RentalIntent>();
    for (const r of rentals) map.set(r.id, r);
    return summarizeTrustEvents(events, map, userId);
  },
};

// TrustEvent factory. Phase 1.3 ships only the typed factory — no
// persistence, no service integration, no automatic firing from the
// handoff flow. Surfaces that want to emit a trust event today
// construct one and discard it; a future PR will add persistence and
// wire the factory into the handoff orchestrator + admin surfaces.
//
// The factory exists now so the call shape is stable across PRs and
// tests can pin the event-type vocabulary early.

import type {
  HandoffPhase,
  TrustEvent,
  TrustEventActor,
  TrustEventType,
} from "@/domain/trust";
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

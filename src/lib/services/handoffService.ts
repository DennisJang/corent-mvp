// Handoff / Return Ritual skeleton — pure helpers.
//
// Phase 1.2 of the CoRent Return Trust Layer (see
// docs/corent_return_trust_layer.md §4 "Phase 1.2"). This module
// produces and updates `HandoffRecord` values in memory only — no
// persistence, no network, no upload. The seller dashboard does not
// yet wire these helpers into a click flow; surfacing an interactive
// checklist UI is intentionally deferred so this PR stays scoped to
// types + service helpers + copy.
//
// Hard rules (kept in lockstep with docs/mvp_security_guardrails.md
// §6 and the constraints in the trust-layer doc):
//
//   - Every actor-side mutation runs `assertRentalSellerIs` /
//     `assertRentalBorrowerIs` from `src/lib/auth/guards.ts` before
//     touching the record. A foreign actor receives `OwnershipError`
//     and the record is returned unchanged at the caller's site —
//     because the exception fires before the new record is built.
//   - Every text input is bounded; the URL slot is shape-checked but
//     never fetched, parsed, or rendered as a clickable href by this
//     module. Surfaces decide how to render it.
//   - There is no upload, no media storage, no PG, no escrow, no
//     deposit, no automatic damage judgment, and no claim window
//     enforcement here.

import type { RentalIntent } from "@/domain/intents";
import {
  EMPTY_HANDOFF_CHECKS,
  HANDOFF_CHECKLIST_KEYS,
  type HandoffChecklistKey,
  type HandoffChecks,
  type HandoffPhase,
  type HandoffRecord,
} from "@/domain/trust";
import {
  assertRentalBorrowerIs,
  assertRentalSellerIs,
} from "@/lib/auth/guards";
import { generateId, nowIso } from "@/lib/ids";

const NOTE_MAX = 240;
const URL_MAX = 500;
const ALLOWED_PHASES: ReadonlySet<HandoffPhase> = new Set([
  "pickup",
  "return",
]);

const CHECKLIST_KEY_SET: ReadonlySet<string> = new Set(HANDOFF_CHECKLIST_KEYS);

export class HandoffInputError extends Error {
  readonly code:
    | "phase_invalid"
    | "rental_id_required"
    | "record_rental_mismatch"
    | "checklist_key_invalid"
    | "checklist_value_invalid"
    | "note_invalid"
    | "url_invalid"
    | "url_not_http";
  constructor(code: HandoffInputError["code"], message: string) {
    super(message);
    this.name = "HandoffInputError";
    this.code = code;
  }
}

// Caller-supplied patch. Each field is optional and validated.
// Passing `null` for `note` / `manualEvidenceUrl` clears the field.
export type HandoffPatch = {
  checks?: Partial<HandoffChecks>;
  note?: string | null;
  manualEvidenceUrl?: string | null;
};

function validatePhase(phase: unknown): asserts phase is HandoffPhase {
  if (typeof phase !== "string" || !ALLOWED_PHASES.has(phase as HandoffPhase)) {
    throw new HandoffInputError(
      "phase_invalid",
      `phase must be 'pickup' or 'return'`,
    );
  }
}

function validatePatch(patch: HandoffPatch): void {
  if (patch.checks !== undefined) {
    if (
      typeof patch.checks !== "object" ||
      patch.checks === null ||
      Array.isArray(patch.checks)
    ) {
      throw new HandoffInputError(
        "checklist_value_invalid",
        "checks must be a plain object",
      );
    }
    for (const [k, v] of Object.entries(patch.checks)) {
      if (!CHECKLIST_KEY_SET.has(k)) {
        throw new HandoffInputError(
          "checklist_key_invalid",
          `unknown checklist key: ${k}`,
        );
      }
      if (typeof v !== "boolean") {
        throw new HandoffInputError(
          "checklist_value_invalid",
          `checklist value for ${k} must be boolean`,
        );
      }
    }
  }

  if (patch.note !== undefined && patch.note !== null) {
    if (typeof patch.note !== "string") {
      throw new HandoffInputError("note_invalid", "note must be a string");
    }
    if (patch.note.length > NOTE_MAX) {
      throw new HandoffInputError(
        "note_invalid",
        `note must be <= ${NOTE_MAX} chars`,
      );
    }
  }

  if (
    patch.manualEvidenceUrl !== undefined &&
    patch.manualEvidenceUrl !== null
  ) {
    const u = patch.manualEvidenceUrl;
    if (typeof u !== "string") {
      throw new HandoffInputError("url_invalid", "url must be a string");
    }
    if (u.length > URL_MAX) {
      throw new HandoffInputError(
        "url_invalid",
        `url must be <= ${URL_MAX} chars`,
      );
    }
    if (u.length > 0 && !/^https?:\/\//.test(u)) {
      throw new HandoffInputError(
        "url_not_http",
        "url must start with http:// or https://",
      );
    }
  }
}

// Pure factory. Creates a fresh empty HandoffRecord for the given
// rental + phase. The caller decides where to keep the record;
// persistence is deferred to a later PR.
export function createHandoffRecord(
  rentalIntentId: string,
  phase: HandoffPhase,
): HandoffRecord {
  if (typeof rentalIntentId !== "string" || rentalIntentId.length === 0) {
    throw new HandoffInputError(
      "rental_id_required",
      "rentalIntentId is required",
    );
  }
  validatePhase(phase);
  const at = nowIso();
  return {
    id: generateId("ho"),
    rentalIntentId,
    phase,
    checks: { ...EMPTY_HANDOFF_CHECKS },
    confirmedBySeller: false,
    confirmedByBorrower: false,
    createdAt: at,
    updatedAt: at,
  };
}

function applyPatch(
  record: HandoffRecord,
  patch: HandoffPatch,
): Pick<HandoffRecord, "checks" | "note" | "manualEvidenceUrl"> {
  return {
    checks: patch.checks
      ? { ...record.checks, ...(patch.checks as Partial<HandoffChecks>) }
      : record.checks,
    note:
      patch.note === null
        ? undefined
        : patch.note !== undefined
          ? patch.note
          : record.note,
    manualEvidenceUrl:
      patch.manualEvidenceUrl === null
        ? undefined
        : patch.manualEvidenceUrl !== undefined
          ? patch.manualEvidenceUrl
          : record.manualEvidenceUrl,
  };
}

function assertSameRental(
  record: HandoffRecord,
  rentalId: string,
): void {
  if (record.rentalIntentId !== rentalId) {
    throw new HandoffInputError(
      "record_rental_mismatch",
      "handoff record does not belong to this rental",
    );
  }
}

export const handoffService = {
  createHandoffRecord,

  // Seller-side update. Verifies the actor is the rental's seller via
  // `assertRentalSellerIs` BEFORE building the new record. When
  // `confirm` is true (default), flips `confirmedBySeller` to true.
  // Throws OwnershipError on actor mismatch, HandoffInputError on
  // bad shape.
  confirmAsSeller(
    intent: Pick<RentalIntent, "id" | "sellerId">,
    record: HandoffRecord,
    actorUserId: string,
    patch: HandoffPatch = {},
    confirm = true,
  ): HandoffRecord {
    assertRentalSellerIs(intent, actorUserId);
    assertSameRental(record, intent.id);
    validatePatch(patch);
    return {
      ...record,
      ...applyPatch(record, patch),
      confirmedBySeller: confirm ? true : record.confirmedBySeller,
      updatedAt: nowIso(),
    };
  },

  // Borrower-side update. Real auth is not in place yet; the borrower
  // path requires that the rental already carries a `borrowerId`,
  // because `assertRentalBorrowerIs` would otherwise pass when both
  // sides are empty (an empty actorUserId is rejected by the guard
  // either way). Throws HandoffInputError("phase_invalid") if the
  // rental has no borrower identity recorded yet.
  confirmAsBorrower(
    intent: Pick<RentalIntent, "id" | "borrowerId">,
    record: HandoffRecord,
    actorUserId: string,
    patch: HandoffPatch = {},
    confirm = true,
  ): HandoffRecord {
    if (!intent.borrowerId) {
      throw new HandoffInputError(
        "phase_invalid",
        "borrower identity not yet recorded on rental",
      );
    }
    assertRentalBorrowerIs(intent, actorUserId);
    assertSameRental(record, intent.id);
    validatePatch(patch);
    return {
      ...record,
      ...applyPatch(record, patch),
      confirmedByBorrower: confirm ? true : record.confirmedByBorrower,
      updatedAt: nowIso(),
    };
  },

  // True when every checklist item is true and both parties have
  // confirmed. Pure read, no validation needed.
  isComplete(record: HandoffRecord): boolean {
    const c = record.checks;
    return (
      c.mainUnit &&
      c.components &&
      c.working &&
      c.appearance &&
      c.preexisting &&
      record.confirmedBySeller &&
      record.confirmedByBorrower
    );
  },

  // Number of checklist items currently marked true (0..5). Used by
  // future surfaces to render "픽업 체크 3/5" style hints.
  completedCount(record: HandoffRecord): number {
    const c = record.checks;
    let n = 0;
    for (const k of HANDOFF_CHECKLIST_KEYS) {
      if (c[k as HandoffChecklistKey]) n += 1;
    }
    return n;
  },
};

// CoRent Interactive Experience — InteractionIntent primitive v1.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — InteractionIntent is the future
//     billing/analytics unit, the typed lifecycle wrapper for a
//     visitor's goal on a website).
//   docs/interaction_safety_standard_v0.md (§5 risk tier model,
//     §10 InteractionIntent safety rules — forward-design lock,
//     §11 AuditEvent rules, §14 pre-work decision checklist).
//   docs/corent_interactive_experience_architecture.md (§4.2
//     Orchestrator, §6 Allowed block types, §7 Tool
//     orchestration).
//
// Purpose:
//
//   InteractionIntent models the lifecycle of "the visitor wants
//   to accomplish X here." It is the seam through which the
//   deterministic planner, the future LLM-candidate planner, the
//   action dispatcher, the human-review workflow, the analytics
//   event taxonomy, and (eventually) per-intent billing all
//   anchor on a single typed object.
//
//   This module is data + pure functions only. No I/O, no env,
//   no network, no Supabase, no LLM, no DB, no UI. The
//   primitive's safety properties live in its types and its
//   validators, not in a runtime guard somewhere downstream.
//
// Hard rules pinned in this file:
//
//   - Closed vocabularies. Kind / Status / RiskTier / Source /
//     Provenance / Event types are `as const` arrays whose
//     members type-narrow at the boundary.
//   - DTO discipline. The shape has NO slot for rawPrompt /
//     messages / body / system / contactEmail / phone /
//     profileId / borrowerId / sellerId / userId / exactAddress /
//     payment / settlement / trustScore / secret / token /
//     providerPayload. The validator also runtime-sweeps for
//     forged forbidden keys.
//   - Result-typed. Functions return `{ ok: true; ... } | { ok:
//     false; code; ... }` rather than throwing for expected
//     validation failures. Throws are reserved for impossible
//     paths (the closed-vocab union being violated at the type
//     level).
//   - Risk-tier rules from ISS-0:
//       * T0–T2 may reach `executed` (always after `confirmed`).
//       * T3/T4/T5 cannot transition to `executed` in v1; they
//         must end in `handoff`, `resolved` (read-only success),
//         `abandoned`, or `blocked`.
//   - Terminal statuses (`resolved`, `abandoned`, `blocked`)
//     cannot transition further.
//   - Provenance on create is `"deterministic"` only. Promotion
//     to `"llm_candidate"` / `"human_reviewed"` is a future
//     slice with its own audit event.
//
// What this module is NOT:
//
//   - Not wired into any UI surface yet.
//   - Not persisted yet. No DB table, no migration. The shape
//     deliberately precedes the storage decision.
//   - Not a billing implementation. The billing/analytics-unit
//     framing is a forward-design lock — the unit of account
//     is fixed so future code does not retrofit.

import {
  CIE_ALLOWED_BLOCKS,
  CIE_RELATED_ACTIONS,
  type CIEAllowedBlock,
  type CIERelatedAction,
} from "./knowledgeRegistry";

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const INTERACTION_INTENT_KINDS = [
  "learn",
  "compare",
  "choose",
  "request",
  "book",
  "apply",
  "troubleshoot",
  "contact",
  "buy",
  "try_before_buy",
  "unknown",
] as const;
export type InteractionIntentKind =
  (typeof INTERACTION_INTENT_KINDS)[number];

export const INTERACTION_INTENT_STATUSES = [
  "created",
  "clarifying",
  "planned",
  "shown",
  "action_proposed",
  "confirmed",
  "executed",
  "handoff",
  "resolved",
  "abandoned",
  "blocked",
] as const;
export type InteractionIntentStatus =
  (typeof INTERACTION_INTENT_STATUSES)[number];

export const INTERACTION_INTENT_RISK_TIERS = [
  "T0",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
] as const;
export type InteractionIntentRiskTier =
  (typeof INTERACTION_INTENT_RISK_TIERS)[number];

export const INTERACTION_INTENT_SOURCES = [
  "home",
  "search",
  "listing_detail",
  "dashboard",
  "admin_cockpit",
  "embedded_site",
  "api",
  "test",
] as const;
export type InteractionIntentSource =
  (typeof INTERACTION_INTENT_SOURCES)[number];

export const INTERACTION_INTENT_PROVENANCES = [
  "deterministic",
  "llm_candidate",
  "human_reviewed",
] as const;
export type InteractionIntentProvenance =
  (typeof INTERACTION_INTENT_PROVENANCES)[number];

export const INTERACTION_INTENT_EVENT_TYPES = [
  "created",
  "clarification_requested",
  "plan_attached",
  "block_shown",
  "action_proposed",
  "user_confirmed",
  "action_executed",
  "human_handoff",
  "resolved",
  "abandoned",
  "blocked",
] as const;
export type InteractionIntentEventType =
  (typeof INTERACTION_INTENT_EVENT_TYPES)[number];

// Terminal lifecycle endpoints — no further transition allowed.
const TERMINAL_STATUSES: ReadonlySet<InteractionIntentStatus> = new Set<
  InteractionIntentStatus
>(["resolved", "abandoned", "blocked"]);

// Risk tiers blocked from `executed` in v1 — ISS-0 §5 / §13.
const TIERS_BLOCKED_FROM_EXECUTED: ReadonlySet<InteractionIntentRiskTier> =
  new Set<InteractionIntentRiskTier>(["T3", "T4", "T5"]);

// Allowed transitions per status. Terminal statuses map to `[]`.
// `abandoned` and `blocked` are reachable from every non-terminal
// status; encoded explicitly here so the validator stays simple
// to read.
const ALLOWED_TRANSITIONS: Readonly<
  Record<InteractionIntentStatus, ReadonlyArray<InteractionIntentStatus>>
> = {
  created: ["clarifying", "planned", "abandoned", "blocked"],
  clarifying: ["planned", "abandoned", "blocked"],
  planned: ["shown", "abandoned", "blocked"],
  shown: ["action_proposed", "resolved", "abandoned", "blocked"],
  action_proposed: ["confirmed", "abandoned", "blocked"],
  confirmed: ["executed", "handoff", "resolved", "abandoned", "blocked"],
  executed: ["resolved", "handoff", "abandoned", "blocked"],
  handoff: ["resolved", "abandoned", "blocked"],
  resolved: [],
  abandoned: [],
  blocked: [],
};

// Mapping of next-status → audited event type. Used by
// `transitionInteractionIntent` to emit a consistent event.
const TRANSITION_EVENT_TYPES: Readonly<
  Record<InteractionIntentStatus, InteractionIntentEventType | null>
> = {
  created: "created",
  clarifying: "clarification_requested",
  planned: "plan_attached",
  shown: "block_shown",
  action_proposed: "action_proposed",
  confirmed: "user_confirmed",
  executed: "action_executed",
  handoff: "human_handoff",
  resolved: "resolved",
  abandoned: "abandoned",
  blocked: "blocked",
};

// ---------------------------------------------------------------
// Field caps
// ---------------------------------------------------------------

export const INTERACTION_INTENT_TITLE_MAX = 120;
export const INTERACTION_INTENT_SUMMARY_MAX = 480;
export const INTERACTION_INTENT_EVENT_LABEL_MAX = 120;

// ---------------------------------------------------------------
// Forbidden slot list (DTO discipline)
// ---------------------------------------------------------------

const FORBIDDEN_INTENT_SLOTS: ReadonlyArray<string> = [
  "rawPrompt",
  "prompt",
  "messages",
  "body",
  "rawBody",
  "system",
  "contactEmail",
  "contact_email",
  "phone",
  "profileId",
  "profile_id",
  "borrowerId",
  "borrower_id",
  "sellerId",
  "seller_id",
  "userId",
  "user_id",
  "exactAddress",
  "exact_address",
  "address",
  "payment",
  "settlement",
  "trustScore",
  "trust_score",
  "secret",
  "token",
  "providerPayload",
  "provider_payload",
];

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type InteractionIntentEvent = {
  id: string;
  type: InteractionIntentEventType;
  at: string;
  label: string;
  statusAfter: InteractionIntentStatus;
};

export type InteractionIntent = {
  id: string;
  kind: InteractionIntentKind;
  status: InteractionIntentStatus;
  riskTier: InteractionIntentRiskTier;
  source: InteractionIntentSource;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  provenance: InteractionIntentProvenance;
  relatedBlockTypes: ReadonlyArray<CIEAllowedBlock>;
  relatedActionIds: ReadonlyArray<CIERelatedAction>;
  events: ReadonlyArray<InteractionIntentEvent>;
};

// ---------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------

export type InteractionIntentResult =
  | { ok: true; intent: InteractionIntent }
  | { ok: false; code: InteractionIntentErrorCode; message: string };

export type InteractionIntentErrorCode =
  | "validation"
  | "invalid_transition"
  | "terminal_status"
  | "blocked_by_risk_tier";

function ok(intent: InteractionIntent): InteractionIntentResult {
  return { ok: true, intent };
}

function err(
  code: InteractionIntentErrorCode,
  message: string,
): InteractionIntentResult {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isISO(s: string): boolean {
  if (typeof s !== "string") return false;
  if (!ISO_RE.test(s)) return false;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed);
}

function trimAndCap(value: unknown, cap: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, Math.max(1, cap - 1))}…`;
}

function isInVocab<T extends string>(
  value: unknown,
  vocab: ReadonlyArray<T>,
): value is T {
  return typeof value === "string" && (vocab as ReadonlyArray<string>).includes(value);
}

function dedupeAndSortBlocks(
  ids: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<CIEAllowedBlock> {
  if (!ids || !Array.isArray(ids)) return [];
  const set = new Set<CIEAllowedBlock>();
  for (const id of ids) {
    if (isInVocab(id, CIE_ALLOWED_BLOCKS)) set.add(id);
  }
  return [...set].sort();
}

function dedupeAndSortActions(
  ids: ReadonlyArray<unknown> | undefined,
): ReadonlyArray<CIERelatedAction> {
  if (!ids || !Array.isArray(ids)) return [];
  const set = new Set<CIERelatedAction>();
  for (const id of ids) {
    if (isInVocab(id, CIE_RELATED_ACTIONS)) set.add(id);
  }
  return [...set].sort();
}

function nextEventId(intentId: string, events: ReadonlyArray<unknown>): string {
  // Deterministic, byte-stable sequencing keyed off the intent id
  // and the event index. No randomness, no Date.now(), no
  // crypto.randomUUID — those make tests flaky and obscure the
  // event order.
  return `${intentId}_evt_${String(events.length + 1).padStart(4, "0")}`;
}

function makeEvent(
  intentId: string,
  events: ReadonlyArray<InteractionIntentEvent>,
  type: InteractionIntentEventType,
  label: string,
  statusAfter: InteractionIntentStatus,
  at: string,
): InteractionIntentEvent {
  return {
    id: nextEventId(intentId, events),
    type,
    at,
    label: trimAndCap(label, INTERACTION_INTENT_EVENT_LABEL_MAX),
    statusAfter,
  };
}

// ---------------------------------------------------------------
// createInteractionIntent
// ---------------------------------------------------------------

export type CreateInteractionIntentInput = {
  kind: InteractionIntentKind;
  riskTier: InteractionIntentRiskTier;
  source: InteractionIntentSource;
  title: string;
  summary: string;
  relatedBlockTypes?: ReadonlyArray<CIEAllowedBlock>;
  relatedActionIds?: ReadonlyArray<CIERelatedAction>;
  // Override hooks — useful for deterministic tests / test
  // fixtures and for callers that already have an id (e.g. an
  // adapter that mints ids elsewhere).
  now?: string;
  id?: string;
};

export type CreateInteractionIntentResult =
  | { ok: true; intent: InteractionIntent }
  | { ok: false; code: "validation"; errors: ReadonlyArray<string> };

export function createInteractionIntent(
  input: CreateInteractionIntentInput,
): CreateInteractionIntentResult {
  const errors: string[] = [];

  if (!isInVocab(input.kind, INTERACTION_INTENT_KINDS)) {
    errors.push(`kind '${String(input.kind)}' is not allowed`);
  }
  if (!isInVocab(input.riskTier, INTERACTION_INTENT_RISK_TIERS)) {
    errors.push(`riskTier '${String(input.riskTier)}' is not allowed`);
  }
  if (!isInVocab(input.source, INTERACTION_INTENT_SOURCES)) {
    errors.push(`source '${String(input.source)}' is not allowed`);
  }

  const title = trimAndCap(input.title, INTERACTION_INTENT_TITLE_MAX);
  const summary = trimAndCap(input.summary, INTERACTION_INTENT_SUMMARY_MAX);
  if (title.length === 0) errors.push("title is empty");
  if (summary.length === 0) errors.push("summary is empty");

  if (input.now !== undefined && !isISO(input.now)) {
    errors.push("now must be an ISO timestamp");
  }

  if (errors.length > 0) {
    return { ok: false, code: "validation", errors };
  }

  const id =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : `intent_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const at =
    typeof input.now === "string" && input.now.length > 0
      ? input.now
      : new Date().toISOString();

  const relatedBlockTypes = dedupeAndSortBlocks(input.relatedBlockTypes);
  const relatedActionIds = dedupeAndSortActions(input.relatedActionIds);

  const initialEvent = makeEvent(
    id,
    [],
    "created",
    "intent created",
    "created",
    at,
  );

  const intent: InteractionIntent = {
    id,
    kind: input.kind,
    status: "created",
    riskTier: input.riskTier,
    source: input.source,
    title,
    summary,
    createdAt: at,
    updatedAt: at,
    // Create-time provenance is always deterministic. Promotion
    // to `llm_candidate` / `human_reviewed` is a future slice
    // with its own audit event; v1 never branches the create
    // path on provenance.
    provenance: "deterministic",
    relatedBlockTypes,
    relatedActionIds,
    events: [initialEvent],
  };

  return { ok: true, intent };
}

// ---------------------------------------------------------------
// transitionInteractionIntent
// ---------------------------------------------------------------

export type TransitionInteractionIntentOptions = {
  // Optional human-readable label for the emitted event. Default
  // is a closed-vocabulary stub bound to the next status.
  label?: string;
  now?: string;
};

export function transitionInteractionIntent(
  intent: InteractionIntent,
  nextStatus: InteractionIntentStatus,
  options: TransitionInteractionIntentOptions = {},
): InteractionIntentResult {
  if (!isInVocab(nextStatus, INTERACTION_INTENT_STATUSES)) {
    return err(
      "validation",
      `nextStatus '${String(nextStatus)}' is not allowed`,
    );
  }

  if (TERMINAL_STATUSES.has(intent.status)) {
    return err(
      "terminal_status",
      `cannot transition out of terminal status '${intent.status}'`,
    );
  }

  const allowed = ALLOWED_TRANSITIONS[intent.status];
  if (!allowed.includes(nextStatus)) {
    return err(
      "invalid_transition",
      `'${intent.status}' → '${nextStatus}' is not an allowed transition`,
    );
  }

  if (
    nextStatus === "executed" &&
    TIERS_BLOCKED_FROM_EXECUTED.has(intent.riskTier)
  ) {
    return err(
      "blocked_by_risk_tier",
      `riskTier '${intent.riskTier}' cannot reach 'executed' in v1; route via 'handoff' or terminal status`,
    );
  }

  const at =
    typeof options.now === "string" && options.now.length > 0
      ? options.now
      : new Date().toISOString();
  if (!isISO(at)) {
    return err("validation", "now must be an ISO timestamp");
  }

  const eventType = TRANSITION_EVENT_TYPES[nextStatus];
  if (!eventType) {
    return err(
      "validation",
      `no event type registered for status '${nextStatus}'`,
    );
  }

  const label = trimAndCap(
    options.label ?? `transition to ${nextStatus}`,
    INTERACTION_INTENT_EVENT_LABEL_MAX,
  );
  const safeLabel = label.length > 0 ? label : `transition to ${nextStatus}`;

  const event = makeEvent(
    intent.id,
    intent.events,
    eventType,
    safeLabel,
    nextStatus,
    at,
  );

  const next: InteractionIntent = {
    ...intent,
    status: nextStatus,
    updatedAt: at,
    events: [...intent.events, event],
  };
  return ok(next);
}

// ---------------------------------------------------------------
// appendInteractionIntentEvent
// ---------------------------------------------------------------

export type InteractionIntentEventInput = {
  type: InteractionIntentEventType;
  label: string;
  statusAfter: InteractionIntentStatus;
  now?: string;
};

export function appendInteractionIntentEvent(
  intent: InteractionIntent,
  input: InteractionIntentEventInput,
): InteractionIntentResult {
  if (!isInVocab(input.type, INTERACTION_INTENT_EVENT_TYPES)) {
    return err("validation", `event type '${String(input.type)}' is not allowed`);
  }
  if (!isInVocab(input.statusAfter, INTERACTION_INTENT_STATUSES)) {
    return err(
      "validation",
      `event statusAfter '${String(input.statusAfter)}' is not allowed`,
    );
  }
  // Defense in depth — even if the caller casts past the type,
  // the runtime filters extra keys out by destructuring into a
  // fresh object before append.
  const fresh: InteractionIntentEventInput = {
    type: input.type,
    label: input.label,
    statusAfter: input.statusAfter,
    now: input.now,
  };
  for (const slot of FORBIDDEN_INTENT_SLOTS) {
    if (
      Object.prototype.hasOwnProperty.call(input as unknown as object, slot)
    ) {
      return err(
        "validation",
        `event input contains forbidden slot '${slot}'`,
      );
    }
  }

  const at =
    typeof fresh.now === "string" && fresh.now.length > 0
      ? fresh.now
      : new Date().toISOString();
  if (!isISO(at)) {
    return err("validation", "now must be an ISO timestamp");
  }

  const label = trimAndCap(fresh.label, INTERACTION_INTENT_EVENT_LABEL_MAX);
  if (label.length === 0) {
    return err("validation", "event label is empty");
  }

  const event = makeEvent(
    intent.id,
    intent.events,
    fresh.type,
    label,
    fresh.statusAfter,
    at,
  );
  const next: InteractionIntent = {
    ...intent,
    updatedAt: at,
    events: [...intent.events, event],
  };
  return ok(next);
}

// ---------------------------------------------------------------
// validateInteractionIntent
// ---------------------------------------------------------------

export type InteractionIntentValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function validateInteractionIntent(
  intent: InteractionIntent,
): InteractionIntentValidationResult {
  const errors: string[] = [];

  if (!intent.id || typeof intent.id !== "string") {
    errors.push("id is empty/invalid");
  }
  if (!isInVocab(intent.kind, INTERACTION_INTENT_KINDS)) {
    errors.push(`kind '${String(intent.kind)}' is not allowed`);
  }
  if (!isInVocab(intent.status, INTERACTION_INTENT_STATUSES)) {
    errors.push(`status '${String(intent.status)}' is not allowed`);
  }
  if (!isInVocab(intent.riskTier, INTERACTION_INTENT_RISK_TIERS)) {
    errors.push(`riskTier '${String(intent.riskTier)}' is not allowed`);
  }
  if (!isInVocab(intent.source, INTERACTION_INTENT_SOURCES)) {
    errors.push(`source '${String(intent.source)}' is not allowed`);
  }
  if (!isInVocab(intent.provenance, INTERACTION_INTENT_PROVENANCES)) {
    errors.push(`provenance '${String(intent.provenance)}' is not allowed`);
  }
  if (!intent.title || intent.title.trim().length === 0) {
    errors.push("title is empty");
  } else if (intent.title.length > INTERACTION_INTENT_TITLE_MAX) {
    errors.push(`title exceeds cap ${INTERACTION_INTENT_TITLE_MAX}`);
  }
  if (!intent.summary || intent.summary.trim().length === 0) {
    errors.push("summary is empty");
  } else if (intent.summary.length > INTERACTION_INTENT_SUMMARY_MAX) {
    errors.push(`summary exceeds cap ${INTERACTION_INTENT_SUMMARY_MAX}`);
  }
  if (!isISO(intent.createdAt)) {
    errors.push("createdAt must be ISO");
  }
  if (!isISO(intent.updatedAt)) {
    errors.push("updatedAt must be ISO");
  }

  if (!Array.isArray(intent.relatedBlockTypes)) {
    errors.push("relatedBlockTypes must be an array");
  } else {
    for (const b of intent.relatedBlockTypes) {
      if (!isInVocab(b, CIE_ALLOWED_BLOCKS)) {
        errors.push(`relatedBlockType '${String(b)}' is not allowed`);
      }
    }
  }
  if (!Array.isArray(intent.relatedActionIds)) {
    errors.push("relatedActionIds must be an array");
  } else {
    for (const a of intent.relatedActionIds) {
      if (!isInVocab(a, CIE_RELATED_ACTIONS)) {
        errors.push(`relatedActionId '${String(a)}' is not allowed`);
      }
    }
  }

  if (!Array.isArray(intent.events) || intent.events.length === 0) {
    errors.push("events must be a non-empty array");
  } else {
    let last: InteractionIntentEvent | null = null;
    for (let i = 0; i < intent.events.length; i++) {
      const e = intent.events[i]!;
      if (!e.id) errors.push(`events[${i}].id is empty`);
      if (!isInVocab(e.type, INTERACTION_INTENT_EVENT_TYPES)) {
        errors.push(`events[${i}].type '${String(e.type)}' is not allowed`);
      }
      if (!isInVocab(e.statusAfter, INTERACTION_INTENT_STATUSES)) {
        errors.push(
          `events[${i}].statusAfter '${String(e.statusAfter)}' is not allowed`,
        );
      }
      if (!isISO(e.at)) errors.push(`events[${i}].at must be ISO`);
      if (!e.label || e.label.trim().length === 0) {
        errors.push(`events[${i}].label is empty`);
      }
      if (last && Date.parse(last.at) > Date.parse(e.at)) {
        errors.push(`events[${i}].at is older than the previous event`);
      }
      last = e;
    }
    const finalEvent = intent.events[intent.events.length - 1]!;
    if (
      isInVocab(finalEvent.statusAfter, INTERACTION_INTENT_STATUSES) &&
      finalEvent.statusAfter !== intent.status
    ) {
      errors.push(
        `final event.statusAfter '${finalEvent.statusAfter}' does not match intent.status '${intent.status}'`,
      );
    }
  }

  // Forbidden-slot sweep — defense against forged casts.
  const record = intent as unknown as Record<string, unknown>;
  for (const slot of FORBIDDEN_INTENT_SLOTS) {
    if (Object.prototype.hasOwnProperty.call(record, slot)) {
      errors.push(`forbidden slot '${slot}' present on intent`);
    }
  }
  if (Array.isArray(intent.events)) {
    for (let i = 0; i < intent.events.length; i++) {
      const eventRecord = intent.events[i] as unknown as Record<
        string,
        unknown
      >;
      for (const slot of FORBIDDEN_INTENT_SLOTS) {
        if (Object.prototype.hasOwnProperty.call(eventRecord, slot)) {
          errors.push(`forbidden slot '${slot}' present on events[${i}]`);
        }
      }
    }
  }

  // Risk-tier rule: T3/T4/T5 must not have ever reached
  // `executed` (in v1).
  if (
    isInVocab(intent.riskTier, INTERACTION_INTENT_RISK_TIERS) &&
    TIERS_BLOCKED_FROM_EXECUTED.has(intent.riskTier)
  ) {
    if (intent.status === "executed") {
      errors.push(
        `riskTier '${intent.riskTier}' cannot have status 'executed' in v1`,
      );
    }
    if (Array.isArray(intent.events)) {
      for (let i = 0; i < intent.events.length; i++) {
        const e = intent.events[i]!;
        if (e.statusAfter === "executed" || e.type === "action_executed") {
          errors.push(
            `riskTier '${intent.riskTier}' has an executed event at events[${i}]`,
          );
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------
// isTerminalInteractionIntentStatus
// ---------------------------------------------------------------

export function isTerminalInteractionIntentStatus(
  status: InteractionIntentStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------
// deriveInteractionIntentMetrics
// ---------------------------------------------------------------

export type InteractionIntentMetrics = {
  id: string;
  kind: InteractionIntentKind;
  status: InteractionIntentStatus;
  riskTier: InteractionIntentRiskTier;
  source: InteractionIntentSource;
  eventCount: number;
  isTerminal: boolean;
  hasActionProposal: boolean;
  hasHumanHandoff: boolean;
  hasResolution: boolean;
  durationMs: number | null;
};

export function deriveInteractionIntentMetrics(
  intent: InteractionIntent,
): InteractionIntentMetrics {
  let hasActionProposal = false;
  let hasHumanHandoff = false;
  let hasResolution = false;
  for (const e of intent.events) {
    if (e.type === "action_proposed" || e.statusAfter === "action_proposed") {
      hasActionProposal = true;
    }
    if (e.type === "human_handoff" || e.statusAfter === "handoff") {
      hasHumanHandoff = true;
    }
    if (e.type === "resolved" || e.statusAfter === "resolved") {
      hasResolution = true;
    }
  }

  let durationMs: number | null = null;
  const created = Date.parse(intent.createdAt);
  const updated = Date.parse(intent.updatedAt);
  if (Number.isFinite(created) && Number.isFinite(updated) && updated >= created) {
    durationMs = updated - created;
  }

  return {
    id: intent.id,
    kind: intent.kind,
    status: intent.status,
    riskTier: intent.riskTier,
    source: intent.source,
    eventCount: intent.events.length,
    isTerminal: isTerminalInteractionIntentStatus(intent.status),
    hasActionProposal,
    hasHumanHandoff,
    hasResolution,
    durationMs,
  };
}

// ---------------------------------------------------------------
// Banlist scan helper
// ---------------------------------------------------------------

// Scans every user-facing string slot on the intent + every event
// label for literal banned phrases. The banlist is passed in by
// the caller (test layer / future runtime self-check) so this
// module never embeds banlist data — separation of concerns.
export function assertNoBannedClaimsInInteractionIntent(
  bannedPhrases: ReadonlyArray<string>,
  intent: InteractionIntent,
): void {
  const hits: string[] = [];
  const fields: ReadonlyArray<{ label: string; value: string }> = [
    { label: "title", value: intent.title },
    { label: "summary", value: intent.summary },
    ...intent.events.map((e, i) => ({
      label: `events[${i}].label`,
      value: e.label,
    })),
  ];
  for (const f of fields) {
    for (const phrase of bannedPhrases) {
      if (f.value.includes(phrase)) {
        hits.push(`${f.label} contains banned phrase: ${phrase}`);
      }
    }
  }
  if (hits.length > 0) {
    throw new Error(
      `InteractionIntent contains banned phrases:\n  - ${hits.join(
        "\n  - ",
      )}`,
    );
  }
}

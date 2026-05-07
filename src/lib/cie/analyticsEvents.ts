// CoRent Interactive Experience — AnalyticsEvent taxonomy v1.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — AnalyticsEvent measures whether
//     interactions help visitors complete tasks, not vanity
//     metrics).
//   docs/interaction_safety_standard_v0.md (§5 risk tier model,
//     §9 sensitive fields, §10 fallback behavior, §11 audit
//     logging).
//   docs/platform_pivot_note_2026-05-07.md §9 (next build
//     target after GuardrailPolicy v1).
//
// Purpose:
//
//   Pure-data, type-only manifest of the platform's analytics
//   event vocabulary. Declares which events the platform may
//   later emit, what payload fields each event carries, what
//   sensitivity / retention class each falls under, and which
//   ComponentBlock / Action / GuardrailTrigger entities each
//   event relates to. **It does not emit anything.** No
//   tracker, no SDK, no ingest, no dashboard. The event-emit
//   seam lands in a later, separately-gated slice.
//
// Hard rules pinned in this file:
//
//   - Pure data + pure functions. No I/O, no env, no network,
//     no Supabase, no LLM, no React, no DOM, no cookies, no
//     localStorage / sessionStorage, no fingerprinting.
//   - Closed vocabularies for event name, category, actor,
//     risk tier, payload sensitivity, retention class, payload
//     field type. The validator refuses out-of-vocab values.
//   - **PII discipline.** Payload schema keys may not name
//     personal-name / email / phone / address / SSN / passport
//     / government-id / credit-card / bank / IBAN / medical /
//     immigration / legal-claim / insurance / deposit / escrow
//     / payment / refund / settlement fields. Token-level match
//     so legitimate identifiers like `event_name` (which
//     carries the literal word "name" as a separate token only
//     when paired with other tokens) are not falsely flagged
//     when they are not a personal name token.
//   - **Browser-tracking discipline.** No event may declare a
//     context, payload, or redact key naming cookies, local /
//     session storage, fingerprints, IP / device / user-agent
//     identifiers.
//   - **Required context floor.** Every event must declare
//     `session_id`, `interaction_id`, `site_id`, `timestamp`,
//     and `event_name` in `requiredContextKeys`. Per-event
//     additions are allowed; removals are not.
//   - **Payload field discipline.** Every sensitive payload
//     field must appear in `redactPayloadKeys`; redact keys
//     must be a subset of payload schema keys; enum fields
//     must declare a non-empty `allowedValues`; `maxChars`
//     must be a positive finite integer.
//   - **Per-event contracts.** `interaction_completed` may not
//     assert purchase / payment / booking / reservation /
//     legal decision / guaranteed conversion. `action_prepared`
//     may not assert execution. `action_confirmed` may not
//     assert irreversible execution. `knowledge_source_used`
//     may not declare a payload key holding full source
//     content. `guardrail_decision` may not declare a payload
//     key holding raw unsafe input. `feedback_submitted`'s
//     free-form string fields must be sensitive, redacted, and
//     capped at <= 500 chars.
//   - **Related-entity discipline.** `relatedComponentBlockIds`
//     ⊆ `COMPONENT_BLOCK_IDS`; `relatedActionIds` ⊆
//     `ACTION_IDS`; `relatedGuardrailTriggerKinds` ⊆
//     `GUARDRAIL_TRIGGER_KINDS`.
//
// What this module is NOT:
//
//   - Not an emitter, tracker, or batcher. There is no
//     `emit()` / `track()` / `flush()` in this slice.
//   - Not a persistence layer. No Supabase, no analytics
//     vendor, no fetch.
//   - Not a UI surface, not a dashboard, not a chart.
//   - Not a runtime planner — events do not classify
//     interactions; they describe what classifications produce.

import { ACTION_IDS } from "./actionRegistry";
import { COMPONENT_BLOCK_IDS } from "./componentBlocks";
import { GUARDRAIL_TRIGGER_KINDS } from "./guardrailPolicy";

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const ANALYTICS_EVENT_NAMES = [
  "interaction_started",
  "intent_detected",
  "intent_clarification_requested",
  "knowledge_source_used",
  "knowledge_gap_detected",
  "component_block_presented",
  "action_presented",
  "action_confirmed",
  "action_prepared",
  "action_not_executed",
  "human_review_requested",
  "guardrail_decision",
  "fallback_presented",
  "interaction_completed",
  "interaction_abandoned",
  "feedback_submitted",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_EVENT_CATEGORIES = [
  "interaction",
  "intent",
  "knowledge",
  "component",
  "action",
  "guardrail",
  "review",
  "fallback",
  "feedback",
] as const;
export type AnalyticsEventCategory = (typeof ANALYTICS_EVENT_CATEGORIES)[number];

export const ANALYTICS_EVENT_RISK_TIERS = [
  "T0",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
] as const;
export type AnalyticsEventRiskTier = (typeof ANALYTICS_EVENT_RISK_TIERS)[number];

export const ANALYTICS_ACTORS = [
  "visitor",
  "system",
  "human_reviewer",
] as const;
export type AnalyticsActor = (typeof ANALYTICS_ACTORS)[number];

export const ANALYTICS_PAYLOAD_SENSITIVITIES = [
  "public",
  "internal",
  "sensitive_redacted",
] as const;
export type AnalyticsPayloadSensitivity = (typeof ANALYTICS_PAYLOAD_SENSITIVITIES)[number];

export const ANALYTICS_RETENTION_CLASSES = [
  "short_lived",
  "operational",
  "audit_required",
] as const;
export type AnalyticsRetentionClass = (typeof ANALYTICS_RETENTION_CLASSES)[number];

export const ANALYTICS_PAYLOAD_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "enum",
] as const;
export type AnalyticsPayloadFieldType = (typeof ANALYTICS_PAYLOAD_FIELD_TYPES)[number];

// Required context-key floor — every event must include these.
export const REQUIRED_CONTEXT_KEYS: ReadonlyArray<string> = [
  "session_id",
  "interaction_id",
  "site_id",
  "timestamp",
  "event_name",
];

// ---------------------------------------------------------------
// Length budgets
// ---------------------------------------------------------------

const MAX_PURPOSE_CHARS = 240;
const MAX_NOTE_CHARS = 240;
const MAX_KEY_CHARS = 80;
const MAX_FREEFORM_FEEDBACK_CHARS = 500;
const DEFAULT_MAX_FIELD_CHARS = 2000;

// ---------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------

export type AnalyticsPayloadFieldSchema = {
  type: AnalyticsPayloadFieldType;
  required?: boolean;
  maxChars?: number;
  allowedValues?: ReadonlyArray<string>;
  sensitive?: boolean;
};

export type AnalyticsEventDefinition = {
  name: AnalyticsEventName;
  category: AnalyticsEventCategory;
  actor: AnalyticsActor;
  purpose: string;
  riskTier: AnalyticsEventRiskTier;
  payloadSensitivity: AnalyticsPayloadSensitivity;
  retentionClass: AnalyticsRetentionClass;
  requiredContextKeys: ReadonlyArray<string>;
  optionalContextKeys: ReadonlyArray<string>;
  payloadSchema: Readonly<Record<string, AnalyticsPayloadFieldSchema>>;
  redactPayloadKeys: ReadonlyArray<string>;
  relatedComponentBlockIds: ReadonlyArray<string>;
  relatedActionIds: ReadonlyArray<string>;
  relatedGuardrailTriggerKinds: ReadonlyArray<string>;
  safetyNotes: ReadonlyArray<string>;
};

// ---------------------------------------------------------------
// Banlists used by the validator
// ---------------------------------------------------------------

// Visual-implementation banlist (purpose / notes only).
const VISUAL_IMPLEMENTATION_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  {
    label: "hex color",
    pattern: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/,
  },
  {
    label: "css unit (px/rem/em/vh/vw/pt/ms)",
    pattern: /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|pt|ms)\b/i,
  },
  {
    label: "rgb()/hsl() color function",
    pattern: /\b(?:rgb|rgba|hsl|hsla)\s*\(/i,
  },
  {
    label: "common font-family name",
    pattern:
      /\b(?:helvetica|arial|roboto|inter|verdana|georgia|tahoma|palatino|courier|times new roman|sans-serif|serif|monospace)\b/i,
  },
  {
    label: "dotted CSS class name",
    pattern: /(?:^|\s)\.[a-z][a-zA-Z0-9_-]{2,}\b/,
  },
  {
    label: "tailwind-style utility class",
    pattern:
      /\b(?:bg|text|flex|grid|font|border|rounded|shadow|animate|transition|p[xytrbl]?|m[xytrbl]?|w|h)-[a-z0-9]+(?:-[a-z0-9]+)*\b/,
  },
  {
    label: "inline class= or style= attribute",
    pattern: /(?:^|\s)(?:class|style)\s*=\s*["']/i,
  },
];

// Raw HTML / template fragment banlist (purpose / notes only).
const RAW_TEMPLATE_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "HTML opening tag", pattern: /<[a-zA-Z][^>]*>/ },
  { label: "HTML closing tag", pattern: /<\/[a-zA-Z]+>/ },
  { label: "mustache template", pattern: /\{\{[\s\S]*?\}\}/ },
  { label: "ejs/erb template", pattern: /<%[\s\S]*?%>/ },
  {
    label: "template-literal interpolation",
    pattern: /\$\{[\s\S]*?\}/,
  },
  { label: "markdown link", pattern: /\[[^\]\n]+\]\([^)\n]+\)/ },
  { label: "markdown heading", pattern: /^#{1,6}\s/m },
  { label: "markdown code fence", pattern: /```/ },
];

// PII tokens applied to payload-schema keys. Single-token terms
// match exact tokens (`_`-separated). Multi-token terms use
// substring containment.
const PII_SINGLE_TOKEN_TERMS: ReadonlyArray<string> = [
  "name",
  "email",
  "phone",
  "address",
  "ssn",
  "passport",
  "cvv",
  "iban",
  "diagnosis",
  "medical",
  "prescription",
  "visa",
  "immigration",
  "insurance",
  "deposit",
  "escrow",
  "payment",
  "refund",
  "settlement",
];

const PII_MULTI_TOKEN_TERMS: ReadonlyArray<string> = [
  "social_security",
  "government_id",
  "national_id",
  "resident_registration_number",
  "credit_card",
  "card_number",
  "bank_account",
  "routing_number",
  "legal_claim",
];

// Browser-tracking ban list — applied to every key (context,
// payload, redact). These are never legitimate in v1.
const BROWSER_TRACKING_TOKENS: ReadonlyArray<string> = [
  "cookie",
  "cookies",
  "localstorage",
  "local_storage",
  "sessionstorage",
  "session_storage",
  "fingerprint",
  "device_fingerprint",
  "useragent",
  "user_agent",
  "ip_address",
  "ipaddress",
  "ipaddr",
  "device_id",
  "deviceid",
  "geolocation",
  "lat_lng",
  "latitude",
  "longitude",
];

// Per-event forbidden assertive phrases scanned against the
// event's `purpose` field only. `safetyNotes` are exempt
// because they are allowed to negate.
const PER_EVENT_ASSERTIVE_BANLIST: Readonly<
  Record<string, ReadonlyArray<string>>
> = {
  interaction_completed: [
    "purchase confirmed",
    "purchase complete",
    "purchase completed",
    "booking confirmed",
    "booking complete",
    "booking completed",
    "reservation confirmed",
    "reservation complete",
    "payment received",
    "payment complete",
    "payment processed",
    "guaranteed conversion",
    "sale complete",
    "sale closed",
    "deal closed",
    "legal decision",
  ],
  action_prepared: [
    "action executed",
    "action ran",
    "action delivered",
    "action sent",
    "action completed",
    "completed successfully",
    "executed successfully",
  ],
  action_confirmed: [
    "action executed",
    "action ran",
    "action delivered",
    "action sent",
    "action completed",
    "irreversibly completed",
    "irreversible completion",
    "executed successfully",
  ],
};

// Payload schema keys forbidden in specific events.
const PER_EVENT_FORBIDDEN_PAYLOAD_KEY_PATTERNS: Readonly<
  Record<string, ReadonlyArray<{ pattern: RegExp; reason: string }>>
> = {
  knowledge_source_used: [
    {
      pattern: /^(content|full_content|raw_content|source_text|document_text|body|source_body)$/i,
      reason: "knowledge_source_used must not store full source content",
    },
  ],
  guardrail_decision: [
    {
      pattern:
        /^(raw_input|raw_text|user_text|user_input|prompt|prompt_text|original_text|injected_text)$/i,
      reason: "guardrail_decision must not store raw unsafe input verbatim",
    },
  ],
};

// ---------------------------------------------------------------
// Helper sets
// ---------------------------------------------------------------

const ALLOWED_NAME_SET = new Set<AnalyticsEventName>(ANALYTICS_EVENT_NAMES);
const ALLOWED_CATEGORY_SET = new Set<AnalyticsEventCategory>(
  ANALYTICS_EVENT_CATEGORIES,
);
const ALLOWED_RISK_TIER_SET = new Set<AnalyticsEventRiskTier>(
  ANALYTICS_EVENT_RISK_TIERS,
);
const ALLOWED_ACTOR_SET = new Set<AnalyticsActor>(ANALYTICS_ACTORS);
const ALLOWED_PAYLOAD_SENSITIVITY_SET = new Set<AnalyticsPayloadSensitivity>(
  ANALYTICS_PAYLOAD_SENSITIVITIES,
);
const ALLOWED_RETENTION_CLASS_SET = new Set<AnalyticsRetentionClass>(
  ANALYTICS_RETENTION_CLASSES,
);
const ALLOWED_FIELD_TYPE_SET = new Set<AnalyticsPayloadFieldType>(
  ANALYTICS_PAYLOAD_FIELD_TYPES,
);
const ALLOWED_COMPONENT_BLOCK_ID_SET = new Set<string>(COMPONENT_BLOCK_IDS);
const ALLOWED_ACTION_ID_SET = new Set<string>(ACTION_IDS);
const ALLOWED_GUARDRAIL_TRIGGER_KIND_SET = new Set<string>(
  GUARDRAIL_TRIGGER_KINDS,
);

// ---------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findVisualImplHit(value: string): { label: string } | null {
  for (const { label, pattern } of VISUAL_IMPLEMENTATION_PATTERNS) {
    if (pattern.test(value)) return { label };
  }
  return null;
}

function findRawTemplateHit(value: string): { label: string } | null {
  for (const { label, pattern } of RAW_TEMPLATE_PATTERNS) {
    if (pattern.test(value)) return { label };
  }
  return null;
}

function pushTextChecks(
  errors: string[],
  fieldLabel: string,
  value: string | undefined,
  options: { maxChars: number },
): void {
  if (typeof value !== "string") {
    errors.push(`${fieldLabel}: must be a string`);
    return;
  }
  if (value.trim().length === 0) {
    errors.push(`${fieldLabel}: must be a non-empty string`);
    return;
  }
  if (value.length > options.maxChars) {
    errors.push(
      `${fieldLabel}: exceeds ${options.maxChars} chars (got ${value.length})`,
    );
  }
  const visualHit = findVisualImplHit(value);
  if (visualHit) {
    errors.push(
      `${fieldLabel}: contains a visual-implementation token (${visualHit.label})`,
    );
  }
  const rawHit = findRawTemplateHit(value);
  if (rawHit) {
    errors.push(
      `${fieldLabel}: contains a raw HTML / CSS / JSX / markdown / template fragment (${rawHit.label})`,
    );
  }
}

function findPIIHit(key: string): { term: string } | null {
  const lower = key.toLowerCase();
  const tokens = lower.split("_").filter((t) => t.length > 0);
  for (const term of PII_SINGLE_TOKEN_TERMS) {
    if (tokens.includes(term)) return { term };
  }
  for (const term of PII_MULTI_TOKEN_TERMS) {
    if (lower.includes(term)) return { term };
  }
  return null;
}

function findBrowserTrackingHit(key: string): { token: string } | null {
  const lower = key.toLowerCase();
  for (const token of BROWSER_TRACKING_TOKENS) {
    if (lower.includes(token)) return { token };
  }
  return null;
}

function lowercaseIncludesAny(
  value: string,
  needles: ReadonlyArray<string>,
): string | null {
  const lower = value.toLowerCase();
  for (const needle of needles) {
    if (lower.includes(needle.toLowerCase())) return needle;
  }
  return null;
}

// ---------------------------------------------------------------
// v1 taxonomy entries
// ---------------------------------------------------------------

const REQUIRED_CONTEXT_FLOOR: ReadonlyArray<string> = REQUIRED_CONTEXT_KEYS;

const TAXONOMY: ReadonlyArray<AnalyticsEventDefinition> = [
  {
    name: "interaction_started",
    category: "interaction",
    actor: "system",
    purpose:
      "The system received the visitor's first input and a new interaction was opened.",
    riskTier: "T0",
    payloadSensitivity: "public",
    retentionClass: "short_lived",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      entry_path: { type: "string", maxChars: 120 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "No personal identifiers are stored; only the entry path is recorded.",
    ],
  },
  {
    name: "intent_detected",
    category: "intent",
    actor: "system",
    purpose:
      "The system classified the visitor's intent kind and confidence band.",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      intent_kind: { type: "string", required: true, maxChars: 80 },
      confidence_band: {
        type: "enum",
        required: true,
        allowedValues: ["low", "medium", "high"],
        maxChars: 16,
      },
      intent_risk_tier: {
        type: "enum",
        required: true,
        allowedValues: ["T0", "T1", "T2", "T3", "T4", "T5"],
        maxChars: 4,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Stores intent kind and a confidence band only; the visitor's raw input is never persisted in the event.",
    ],
  },
  {
    name: "intent_clarification_requested",
    category: "intent",
    actor: "system",
    purpose:
      "The system asked the visitor a clarifying question to narrow the intent.",
    riskTier: "T0",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      intent_kind: { type: "string", required: true, maxChars: 80 },
      clarifying_question_block_id: {
        type: "string",
        required: true,
        maxChars: 80,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: ["clarifying_question"],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records that a clarifying question block was shown; never stores the visitor's draft answer.",
    ],
  },
  {
    name: "knowledge_source_used",
    category: "knowledge",
    actor: "system",
    purpose:
      "The system referenced a registered knowledge source to ground its surface text.",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      source_id: { type: "string", required: true, maxChars: 120 },
      source_kind: { type: "string", required: true, maxChars: 80 },
      match_quality_band: {
        type: "enum",
        required: true,
        allowedValues: ["low", "medium", "high"],
        maxChars: 16,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: ["faq_answer", "source_citation"],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records the source id and a match-quality band only; the source's full text is never persisted in the event.",
    ],
  },
  {
    name: "knowledge_gap_detected",
    category: "knowledge",
    actor: "system",
    purpose:
      "The system detected that no registered knowledge can support a safe answer.",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      intent_kind: { type: "string", required: true, maxChars: 80 },
      gap_kind: {
        type: "enum",
        required: true,
        allowedValues: ["no_match", "partial_match", "conflicting_sources"],
        maxChars: 32,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: ["fallback_message", "unmet_intent_capture"],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: ["missing_registered_knowledge"],
    safetyNotes: [
      "Records the intent kind and gap kind only; the visitor's raw query text is never stored.",
    ],
  },
  {
    name: "component_block_presented",
    category: "component",
    actor: "system",
    purpose: "The system showed a component block to the visitor.",
    riskTier: "T0",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      component_block_id: { type: "string", required: true, maxChars: 80 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [...COMPONENT_BLOCK_IDS],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records the block identifier only; slot text is never stored in the event.",
    ],
  },
  {
    name: "action_presented",
    category: "action",
    actor: "system",
    purpose:
      "The system surfaced an action for the visitor to review and confirm.",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      action_id: { type: "string", required: true, maxChars: 80 },
      risk_tier: {
        type: "enum",
        required: true,
        allowedValues: ["T0", "T1", "T2", "T3", "T4", "T5"],
        maxChars: 4,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [...ACTION_IDS],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records that the action surface was shown; the action has not been confirmed or prepared.",
    ],
  },
  {
    name: "action_confirmed",
    category: "action",
    actor: "visitor",
    purpose:
      "The visitor confirmed the proposed action; preparation may follow.",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      action_id: { type: "string", required: true, maxChars: 80 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [...ACTION_IDS],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Confirmation only — never asserts the action ran or that anything irreversible happened.",
    ],
  },
  {
    name: "action_prepared",
    category: "action",
    actor: "system",
    purpose:
      "The system prepared the action surface for the visitor (navigation or staged record only).",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      action_id: { type: "string", required: true, maxChars: 80 },
      preparation_kind: {
        type: "enum",
        required: true,
        allowedValues: [
          "client_prepare",
          "server_prepare",
          "external_navigation",
        ],
        maxChars: 32,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [...ACTION_IDS],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records preparation or navigation only — never asserts the action was executed.",
    ],
  },
  {
    name: "action_not_executed",
    category: "action",
    actor: "system",
    purpose:
      "The system did not run the action; the reason code records why (blocked, review-required, aborted, unsupported).",
    riskTier: "T1",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      action_id: { type: "string", required: true, maxChars: 80 },
      reason_code: {
        type: "enum",
        required: true,
        allowedValues: [
          "blocked",
          "review_required",
          "visitor_aborted",
          "unsupported",
        ],
        maxChars: 32,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [...ACTION_IDS],
    relatedGuardrailTriggerKinds: [
      "disallowed_action",
      "high_risk_tier",
      "irreversible_or_binding_action",
      "autonomous_action",
    ],
    safetyNotes: [
      "Records why an action was not run; v1 actions are never run autonomously.",
    ],
  },
  {
    name: "human_review_requested",
    category: "review",
    actor: "system",
    purpose:
      "The system queued the interaction for a host operator to review.",
    riskTier: "T2",
    payloadSensitivity: "internal",
    retentionClass: "audit_required",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      reason_label: {
        type: "enum",
        required: true,
        allowedValues: [
          "ambiguous_intent",
          "missing_source",
          "policy_constraint",
          "high_risk_path",
          "operator_followup",
        ],
        maxChars: 32,
      },
      interaction_intent_id_present: { type: "boolean", required: true },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: ["human_review_notice", "handoff_notice"],
    relatedActionIds: ["request_human_review"],
    relatedGuardrailTriggerKinds: [
      "high_risk_tier",
      "unsupported_claim",
      "external_integration",
    ],
    safetyNotes: [
      "No personal identifiers are stored; the queue lookup is performed via the interaction id at review time.",
    ],
  },
  {
    name: "guardrail_decision",
    category: "guardrail",
    actor: "system",
    purpose: "The guardrail layer decided how to handle a trigger.",
    riskTier: "T2",
    payloadSensitivity: "internal",
    retentionClass: "audit_required",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      trigger_kind: { type: "string", required: true, maxChars: 80 },
      decision: { type: "string", required: true, maxChars: 32 },
      fallback_style: { type: "string", required: true, maxChars: 32 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [...GUARDRAIL_TRIGGER_KINDS],
    safetyNotes: [
      "Records the trigger kind, decision, and fallback style only; raw or injected input is never persisted.",
    ],
  },
  {
    name: "fallback_presented",
    category: "fallback",
    actor: "system",
    purpose: "The system showed a calm fallback when no safe block applied.",
    riskTier: "T0",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      fallback_kind: {
        type: "enum",
        required: true,
        allowedValues: [
          "brief_boundary",
          "source_gap_explanation",
          "human_review_redirect",
          "safe_alternative",
        ],
        maxChars: 32,
      },
      component_block_id: { type: "string", required: true, maxChars: 80 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: ["fallback_message"],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: ["unknown_intent"],
    safetyNotes: [
      "Records the fallback kind only; never asserts that the visitor's task was resolved.",
    ],
  },
  {
    name: "interaction_completed",
    category: "interaction",
    actor: "system",
    purpose:
      "The interaction reached a safe terminal state and was closed.",
    riskTier: "T0",
    payloadSensitivity: "internal",
    retentionClass: "operational",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      terminal_state: {
        type: "enum",
        required: true,
        allowedValues: [
          "handed_off",
          "resolved_locally",
          "abandoned_safely",
        ],
        maxChars: 32,
      },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Terminal state of the interaction; never asserts a sale, a confirmed booking, a money transfer, or a legal outcome.",
    ],
  },
  {
    name: "interaction_abandoned",
    category: "interaction",
    actor: "system",
    purpose:
      "The interaction ended without a terminal state — the visitor left.",
    riskTier: "T0",
    payloadSensitivity: "internal",
    retentionClass: "short_lived",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      last_block_id: { type: "string", maxChars: 80 },
      last_action_id: { type: "string", maxChars: 80 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Records the last block / action id only; no fingerprinting, no device tracking, no session beacons.",
    ],
  },
  {
    name: "feedback_submitted",
    category: "feedback",
    actor: "visitor",
    purpose: "The visitor submitted feedback about the interaction.",
    riskTier: "T1",
    payloadSensitivity: "sensitive_redacted",
    retentionClass: "audit_required",
    requiredContextKeys: REQUIRED_CONTEXT_FLOOR,
    optionalContextKeys: [],
    payloadSchema: {
      rating_band: {
        type: "enum",
        required: true,
        allowedValues: ["positive", "neutral", "negative"],
        maxChars: 16,
      },
      feedback_text: {
        type: "string",
        maxChars: MAX_FREEFORM_FEEDBACK_CHARS,
        sensitive: true,
      },
    },
    redactPayloadKeys: ["feedback_text"],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: [
      "Free-form feedback text is redacted from logs and capped to keep retention bounded.",
    ],
  },
];

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

export function listAnalyticsEventDefinitions(): ReadonlyArray<AnalyticsEventDefinition> {
  return TAXONOMY;
}

export function getAnalyticsEventDefinition(
  name: string,
): AnalyticsEventDefinition | null {
  if (typeof name !== "string" || name.length === 0) return null;
  return TAXONOMY.find((d) => d.name === name) ?? null;
}

export function getEventsByCategory(
  category: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof category !== "string") return [];
  if (!ALLOWED_CATEGORY_SET.has(category as AnalyticsEventCategory)) return [];
  return TAXONOMY.filter((d) => d.category === category);
}

export function getEventsByActor(
  actor: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof actor !== "string") return [];
  if (!ALLOWED_ACTOR_SET.has(actor as AnalyticsActor)) return [];
  return TAXONOMY.filter((d) => d.actor === actor);
}

export function getEventsByRiskTier(
  riskTier: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof riskTier !== "string") return [];
  if (!ALLOWED_RISK_TIER_SET.has(riskTier as AnalyticsEventRiskTier)) return [];
  return TAXONOMY.filter((d) => d.riskTier === riskTier);
}

export function getEventsWithSensitivePayload(): ReadonlyArray<AnalyticsEventDefinition> {
  return TAXONOMY.filter((d) =>
    Object.values(d.payloadSchema).some((s) => s.sensitive === true),
  );
}

export function getEventsRequiringRedaction(): ReadonlyArray<AnalyticsEventDefinition> {
  return TAXONOMY.filter((d) => d.redactPayloadKeys.length > 0);
}

export function getEventsRelatedToComponentBlock(
  blockId: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof blockId !== "string" || blockId.length === 0) return [];
  return TAXONOMY.filter((d) => d.relatedComponentBlockIds.includes(blockId));
}

export function getEventsRelatedToAction(
  actionId: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof actionId !== "string" || actionId.length === 0) return [];
  return TAXONOMY.filter((d) => d.relatedActionIds.includes(actionId));
}

export function getEventsRelatedToGuardrailTrigger(
  kind: string,
): ReadonlyArray<AnalyticsEventDefinition> {
  if (typeof kind !== "string" || kind.length === 0) return [];
  return TAXONOMY.filter((d) =>
    d.relatedGuardrailTriggerKinds.includes(kind),
  );
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

export type AnalyticsTaxonomyValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function assertValidAnalyticsEventDefinition(
  def: AnalyticsEventDefinition,
): void {
  const errors = validateAnalyticsEventDefinition(def);
  if (errors.length > 0) {
    throw new Error(
      `Invalid AnalyticsEventDefinition '${String(def?.name ?? "<unknown>")}':\n  - ${errors.join(
        "\n  - ",
      )}`,
    );
  }
}

export function validateAnalyticsEventTaxonomy(
  taxonomy: ReadonlyArray<AnalyticsEventDefinition> = TAXONOMY,
): AnalyticsTaxonomyValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of taxonomy) {
    if (def && typeof def.name === "string") {
      if (seen.has(def.name)) {
        errors.push(`duplicate analytics event name: ${def.name}`);
      }
      seen.add(def.name);
    }
    for (const e of validateAnalyticsEventDefinition(def)) errors.push(e);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateAnalyticsEventDefinition(
  def: AnalyticsEventDefinition,
): ReadonlyArray<string> {
  const errors: string[] = [];
  const id = isNonEmptyString(def?.name) ? def.name : "<missing name>";

  // Closed-vocab membership.
  if (!ALLOWED_NAME_SET.has(def?.name as AnalyticsEventName)) {
    errors.push(`${id}: name '${String(def?.name)}' is not in ANALYTICS_EVENT_NAMES`);
  }
  if (!ALLOWED_CATEGORY_SET.has(def?.category as AnalyticsEventCategory)) {
    errors.push(`${id}: category '${String(def?.category)}' is not in ANALYTICS_EVENT_CATEGORIES`);
  }
  if (!ALLOWED_ACTOR_SET.has(def?.actor as AnalyticsActor)) {
    errors.push(`${id}: actor '${String(def?.actor)}' is not in ANALYTICS_ACTORS`);
  }
  if (!ALLOWED_RISK_TIER_SET.has(def?.riskTier as AnalyticsEventRiskTier)) {
    errors.push(`${id}: riskTier '${String(def?.riskTier)}' is not in ANALYTICS_EVENT_RISK_TIERS`);
  }
  if (
    !ALLOWED_PAYLOAD_SENSITIVITY_SET.has(
      def?.payloadSensitivity as AnalyticsPayloadSensitivity,
    )
  ) {
    errors.push(
      `${id}: payloadSensitivity '${String(def?.payloadSensitivity)}' is not in ANALYTICS_PAYLOAD_SENSITIVITIES`,
    );
  }
  if (
    !ALLOWED_RETENTION_CLASS_SET.has(
      def?.retentionClass as AnalyticsRetentionClass,
    )
  ) {
    errors.push(
      `${id}: retentionClass '${String(def?.retentionClass)}' is not in ANALYTICS_RETENTION_CLASSES`,
    );
  }

  pushTextChecks(errors, `${id}.purpose`, def?.purpose, {
    maxChars: MAX_PURPOSE_CHARS,
  });

  if (!Array.isArray(def?.safetyNotes)) {
    errors.push(`${id}.safetyNotes: must be an array`);
  } else {
    if (def.safetyNotes.length === 0) {
      errors.push(`${id}.safetyNotes: must declare at least one note`);
    }
    for (let i = 0; i < def.safetyNotes.length; i++) {
      pushTextChecks(errors, `${id}.safetyNotes[${i}]`, def.safetyNotes[i], {
        maxChars: MAX_NOTE_CHARS,
      });
    }
  }

  // Required context floor + overlap + tracking scan.
  const requiredCtx = Array.isArray(def?.requiredContextKeys)
    ? def.requiredContextKeys
    : [];
  const optionalCtx = Array.isArray(def?.optionalContextKeys)
    ? def.optionalContextKeys
    : [];
  if (!Array.isArray(def?.requiredContextKeys)) {
    errors.push(`${id}.requiredContextKeys: must be an array`);
  }
  if (!Array.isArray(def?.optionalContextKeys)) {
    errors.push(`${id}.optionalContextKeys: must be an array`);
  }
  const requiredCtxSet = new Set<string>(requiredCtx);
  for (const required of REQUIRED_CONTEXT_KEYS) {
    if (!requiredCtxSet.has(required)) {
      errors.push(
        `${id}.requiredContextKeys: missing required context key '${required}'`,
      );
    }
  }
  for (const k of optionalCtx) {
    if (requiredCtxSet.has(k)) {
      errors.push(
        `${id}: context key '${k}' appears in BOTH requiredContextKeys and optionalContextKeys`,
      );
    }
  }
  for (const k of [...requiredCtx, ...optionalCtx]) {
    if (typeof k !== "string" || k.trim().length === 0) {
      errors.push(
        `${id}: context key '${String(k)}' must be a non-empty string`,
      );
      continue;
    }
    if (k.length > MAX_KEY_CHARS) {
      errors.push(`${id}: context key '${k}' exceeds ${MAX_KEY_CHARS} chars`);
    }
    const trackingHit = findBrowserTrackingHit(k);
    if (trackingHit) {
      errors.push(
        `${id}: context key '${k}' matches a forbidden browser-tracking token '${trackingHit.token}'`,
      );
    }
  }

  // Payload schema.
  const schema = def?.payloadSchema ?? {};
  if (typeof def?.payloadSchema !== "object" || def.payloadSchema === null) {
    errors.push(`${id}.payloadSchema: must be an object`);
  }
  const schemaKeys = Object.keys(schema);
  const schemaKeySet = new Set<string>(schemaKeys);
  for (const k of schemaKeys) {
    const arg = schema[k]!;
    const argLabel = `${id}.payloadSchema['${k}']`;

    if (k.length === 0) {
      errors.push(`${id}: payload key must be a non-empty string`);
    }
    if (k.length > MAX_KEY_CHARS) {
      errors.push(`${argLabel}: key exceeds ${MAX_KEY_CHARS} chars`);
    }

    if (!ALLOWED_FIELD_TYPE_SET.has(arg?.type as AnalyticsPayloadFieldType)) {
      errors.push(
        `${argLabel}: type '${String(arg?.type)}' is not in ANALYTICS_PAYLOAD_FIELD_TYPES`,
      );
    }
    if (arg?.maxChars !== undefined) {
      if (
        typeof arg.maxChars !== "number" ||
        !Number.isFinite(arg.maxChars) ||
        arg.maxChars <= 0 ||
        !Number.isInteger(arg.maxChars) ||
        arg.maxChars > DEFAULT_MAX_FIELD_CHARS
      ) {
        errors.push(
          `${argLabel}: maxChars must be a finite positive integer <= ${DEFAULT_MAX_FIELD_CHARS}`,
        );
      }
    }
    if (arg?.type === "enum") {
      if (
        !Array.isArray(arg.allowedValues) ||
        arg.allowedValues.length === 0 ||
        !arg.allowedValues.every((v) => isNonEmptyString(v))
      ) {
        errors.push(
          `${argLabel}: enum field must declare a non-empty allowedValues array`,
        );
      }
    }
    // PII scan on payload key.
    const piiHit = findPIIHit(k);
    if (piiHit) {
      errors.push(
        `${id}: payload key '${k}' matches a forbidden PII token '${piiHit.term}' — v1 does not collect PII fields`,
      );
    }
    // Browser-tracking scan on payload key.
    const trackingHit = findBrowserTrackingHit(k);
    if (trackingHit) {
      errors.push(
        `${id}: payload key '${k}' matches a forbidden browser-tracking token '${trackingHit.token}'`,
      );
    }
  }

  // redactPayloadKeys: subset of schema keys; sensitive keys must be in redact.
  const redactKeys = Array.isArray(def?.redactPayloadKeys)
    ? def.redactPayloadKeys
    : [];
  if (!Array.isArray(def?.redactPayloadKeys)) {
    errors.push(`${id}.redactPayloadKeys: must be an array`);
  }
  const redactKeySet = new Set<string>(redactKeys);
  for (const k of redactKeys) {
    if (!schemaKeySet.has(k)) {
      errors.push(
        `${id}.redactPayloadKeys: '${k}' is not in payloadSchema`,
      );
    }
    const trackingHit = findBrowserTrackingHit(k);
    if (trackingHit) {
      errors.push(
        `${id}.redactPayloadKeys: '${k}' matches a forbidden browser-tracking token '${trackingHit.token}'`,
      );
    }
  }
  for (const [k, arg] of Object.entries(schema)) {
    if (arg?.sensitive === true && !redactKeySet.has(k)) {
      errors.push(
        `${id}: sensitive payload field '${k}' must appear in redactPayloadKeys`,
      );
    }
  }

  // Related entity ids.
  const relatedBlocks = Array.isArray(def?.relatedComponentBlockIds)
    ? def.relatedComponentBlockIds
    : [];
  if (!Array.isArray(def?.relatedComponentBlockIds)) {
    errors.push(`${id}.relatedComponentBlockIds: must be an array`);
  }
  for (const b of relatedBlocks) {
    if (!ALLOWED_COMPONENT_BLOCK_ID_SET.has(b)) {
      errors.push(
        `${id}.relatedComponentBlockIds: '${b}' is not a known ComponentBlock id`,
      );
    }
  }

  const relatedActions = Array.isArray(def?.relatedActionIds)
    ? def.relatedActionIds
    : [];
  if (!Array.isArray(def?.relatedActionIds)) {
    errors.push(`${id}.relatedActionIds: must be an array`);
  }
  for (const a of relatedActions) {
    if (!ALLOWED_ACTION_ID_SET.has(a)) {
      errors.push(
        `${id}.relatedActionIds: '${a}' is not a known Action registry id`,
      );
    }
  }

  const relatedTriggers = Array.isArray(def?.relatedGuardrailTriggerKinds)
    ? def.relatedGuardrailTriggerKinds
    : [];
  if (!Array.isArray(def?.relatedGuardrailTriggerKinds)) {
    errors.push(`${id}.relatedGuardrailTriggerKinds: must be an array`);
  }
  for (const t of relatedTriggers) {
    if (!ALLOWED_GUARDRAIL_TRIGGER_KIND_SET.has(t)) {
      errors.push(
        `${id}.relatedGuardrailTriggerKinds: '${t}' is not a known guardrail trigger kind`,
      );
    }
  }

  // Per-event assertive-phrase scan (purpose only).
  const banPhrases = PER_EVENT_ASSERTIVE_BANLIST[def?.name ?? ""];
  if (banPhrases && typeof def?.purpose === "string") {
    const hit = lowercaseIncludesAny(def.purpose, banPhrases);
    if (hit) {
      const reason =
        def.name === "interaction_completed"
          ? "must not assert purchase / payment / booking / reservation / legal decision / guaranteed conversion"
          : def.name === "action_prepared"
            ? "must not assert action execution"
            : "must not assert irreversible execution";
      errors.push(
        `${id}.purpose: ${reason} (matched '${hit}')`,
      );
    }
  }

  // Per-event forbidden payload keys.
  const forbidden = PER_EVENT_FORBIDDEN_PAYLOAD_KEY_PATTERNS[def?.name ?? ""];
  if (forbidden) {
    for (const k of schemaKeys) {
      for (const { pattern, reason } of forbidden) {
        if (pattern.test(k)) {
          errors.push(`${id}: payload key '${k}': ${reason}`);
        }
      }
    }
  }

  // feedback_submitted: free-form string fields must be sensitive +
  // redacted + capped at MAX_FREEFORM_FEEDBACK_CHARS.
  if (def?.name === "feedback_submitted") {
    for (const [k, arg] of Object.entries(schema)) {
      if (arg?.type === "string") {
        if (arg.sensitive !== true) {
          errors.push(
            `${id}: free-form string '${k}' must be sensitive: true (feedback text must be marked sensitive)`,
          );
        }
        if (!redactKeySet.has(k)) {
          errors.push(
            `${id}: free-form string '${k}' must appear in redactPayloadKeys`,
          );
        }
        if (
          typeof arg.maxChars !== "number" ||
          arg.maxChars > MAX_FREEFORM_FEEDBACK_CHARS
        ) {
          errors.push(
            `${id}: free-form string '${k}' must cap maxChars at <= ${MAX_FREEFORM_FEEDBACK_CHARS}`,
          );
        }
      }
    }
  }

  return errors;
}

// CoRent Interactive Experience — Action registry v1.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — Action).
//   docs/interaction_safety_standard_v0.md (§4.2 No arbitrary
//     action, §7 Action safety rules, §5 risk tier model).
//   docs/platform_pivot_note_2026-05-07.md §9 (next build
//     target after ComponentBlock registry v1).
//   docs/platform_repositioning_audit_2026-05-07.md §11.
//
// Purpose:
//
//   Type-only / pure-data registry of website actions the
//   interaction layer is allowed to request or prepare. The
//   registry declares each action's risk tier, argument
//   schema, confirmation policy, reversibility, execution
//   mode, source requirement, logging contract, and human-
//   review behavior. **It does not execute anything.**
//
//   ComponentBlock defines what can be SHOWN. Action defines
//   what can be REQUESTED / PREPARED. Together they bound the
//   interaction layer's surface — there is no "anything else."
//
// Hard rules pinned in this file:
//
//   - Pure data + pure functions. No I/O, no env, no network,
//     no Supabase, no LLM, no React, no DOM. Importing this
//     module is free.
//   - Closed vocabularies. Every action's id, kind, risk tier,
//     confirmation policy, reversibility, execution mode, and
//     source requirement is in an `as const` array; the
//     validator refuses any out-of-vocab value at the boundary.
//   - DTO discipline. Argument keys and `dataFieldAllowlist`
//     entries are scanned against a 24-pattern sensitive-field
//     banlist (password / SSN / passport / credit-card / bank /
//     IBAN / medical / visa / immigration / legal-claim /
//     insurance / deposit / escrow / payment / refund /
//     settlement, etc.). The validator refuses on hit.
//   - Logging discipline. Every action declares a snake-case
//     stable `eventName`, a per-key include list, and a
//     per-key redact list. Any argument marked `sensitive:
//     true` MUST appear in `redactArgumentKeys` and MUST NOT
//     appear in `includeArgumentKeys`. The two lists are
//     mutually exclusive.
//   - Risk-tier rule from ISS-0 §5: T3/T4/T5 actions must be
//     `executionMode: "blocked"` or `requiresHumanReview:
//     true`. v1 ships no T3+ actions.
//   - Reversibility rule: irreversible actions must be
//     `executionMode: "blocked"` in v1.
//   - Per-id contract rules: `request_human_review` requires
//     human review; `start_booking_request` may not assert a
//     confirmed booking; `start_email_draft` may not assert an
//     email was sent; `open_external_link` and
//     `download_resource` require registered knowledge;
//     `open_external_link` may not assert task completion;
//     `executionMode === "blocked"` actions must be
//     `confirmationPolicy === "blocked"` and have a
//     `disabledReason`; `executionMode === "human_review_queue"`
//     actions must require human review.
//
// What this module is NOT:
//
//   - Not an executor. There is no "dispatch" function in this
//     slice; the planner reads the registry to decide which
//     actions it may *propose* to a confirmation block. The
//     actual server action / HumanReview write seam lands in a
//     later, separately-gated slice.
//   - Not a Phase 3 LLM orchestrator.
//   - Not wired into any UI surface yet.

import {
  COMPONENT_BLOCK_IDS,
  SOURCE_REQUIREMENTS,
  type ComponentBlockId,
  type SourceRequirement,
} from "./componentBlocks";
import {
  INTERACTION_INTENT_RISK_TIERS,
  type InteractionIntentRiskTier,
} from "./interactionIntent";

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const ACTION_IDS = [
  "open_external_link",
  "create_lead",
  "create_contact_request",
  "create_unmet_intent_capture",
  "request_human_review",
  "download_resource",
  "copy_contact_info",
  "start_email_draft",
  "start_booking_request",
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const ACTION_KINDS = [
  "navigation",
  "capture",
  "handoff",
  "resource",
  "communication",
  "request",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// Re-exports the InteractionIntent risk tier vocabulary so the
// Action registry's risk model stays aligned with ISS-0.
export const ACTION_RISK_TIERS = INTERACTION_INTENT_RISK_TIERS;
export type ActionRiskTier = InteractionIntentRiskTier;

export const CONFIRMATION_POLICIES = [
  "none",
  "soft_confirm",
  "explicit_confirm",
  "human_review_required",
  "blocked",
] as const;
export type ConfirmationPolicy = (typeof CONFIRMATION_POLICIES)[number];

export const REVERSIBILITIES = [
  "reversible",
  "partially_reversible",
  "irreversible",
  "not_applicable",
] as const;
export type Reversibility = (typeof REVERSIBILITIES)[number];

export const EXECUTION_MODES = [
  "client_prepare_only",
  "server_prepare_only",
  "human_review_queue",
  "external_navigation_only",
  "blocked",
] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const ARGUMENT_TYPES = [
  "string",
  "email",
  "phone",
  "url",
  "enum",
  "boolean",
] as const;
export type ArgumentType = (typeof ARGUMENT_TYPES)[number];

// Re-export the SourceRequirement vocabulary from
// componentBlocks so action and block share the exact same set.
export { SOURCE_REQUIREMENTS };
export type { SourceRequirement };

// ---------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------

export type ActionArgumentSchema = {
  type: ArgumentType;
  required?: boolean;
  maxChars?: number;
  allowedValues?: ReadonlyArray<string>;
  sensitive?: boolean;
};

export type ActionLoggingPolicy = {
  // Whether each dispatch must emit an audit event. v1 actions
  // all log; the slot exists so a future T0 read-only action
  // could opt out under explicit founder review.
  required: boolean;
  // Stable snake_case event name. The validator pins this.
  eventName: string;
  // Argument keys whose values may appear in the audit event.
  // Subset of the action's `argumentSchema` keys.
  includeArgumentKeys: ReadonlyArray<string>;
  // Argument keys whose values must be redacted before they
  // reach the audit event. Every `sensitive: true` arg must be
  // here.
  redactArgumentKeys: ReadonlyArray<string>;
};

export type ActionDefinition = {
  id: ActionId;
  kind: ActionKind;
  // Short human-readable label used internally — never as
  // user-facing copy without a renderer mapping.
  label: string;
  // One-sentence statement of what the action prepares and what
  // it does not assert.
  purpose: string;
  riskTier: ActionRiskTier;
  confirmationPolicy: ConfirmationPolicy;
  reversibility: Reversibility;
  executionMode: ExecutionMode;
  sourceRequirement: SourceRequirement;
  // Argument keys that callers must supply. Each must have
  // `argumentSchema[key].required === true`.
  requiredArgumentKeys: ReadonlyArray<string>;
  // Argument keys that callers may supply. Each must NOT be
  // marked `required: true` in `argumentSchema`.
  optionalArgumentKeys: ReadonlyArray<string>;
  // Per-argument schema. Keys must be the union of
  // `requiredArgumentKeys` ∪ `optionalArgumentKeys` exactly —
  // no extras allowed.
  argumentSchema: Readonly<Record<string, ActionArgumentSchema>>;
  // Allowed data-field names this action may write into the
  // audit / preparation record. Forbidden regulated patterns
  // are refused by the validator.
  dataFieldAllowlist: ReadonlyArray<string>;
  // Block ids this action is allowed to be proposed from.
  // Subset of `COMPONENT_BLOCK_IDS`.
  compatibleComponentBlockIds: ReadonlyArray<ComponentBlockId>;
  logging: ActionLoggingPolicy;
  requiresHumanReview: boolean;
  // Required when `executionMode === "blocked"`. The validator
  // pins this.
  disabledReason?: string;
  // Non-empty plain-text safety notes. The validator refuses
  // any note containing raw HTML / CSS / JSX / markdown /
  // template fragments.
  safetyNotes: ReadonlyArray<string>;
};

// ---------------------------------------------------------------
// Banlists used by the validator
// ---------------------------------------------------------------

// 24-pattern sensitive regulated field banlist. Argument keys
// and `dataFieldAllowlist` entries are matched case-insensitively
// by substring.
const SENSITIVE_FIELD_PATTERNS: ReadonlyArray<string> = [
  "password",
  "ssn",
  "social_security",
  "social-security",
  "passport",
  "government_id",
  "government-id",
  "national_id",
  "national-id",
  "resident_registration_number",
  "resident-registration-number",
  "credit_card",
  "credit-card",
  "card_number",
  "card-number",
  "cvv",
  "bank_account",
  "bank-account",
  "iban",
  "routing_number",
  "routing-number",
  "diagnosis",
  "medical",
  "prescription",
  "visa",
  "immigration",
  "legal_claim",
  "legal-claim",
  "insurance",
  "deposit",
  "escrow",
  "payment",
  "refund",
  "settlement",
];

// Phrases an `open_external_link` action may not state in its
// label / purpose, because clicking through never equals task
// completion (ISS-0 §10.4). Safety notes that NEGATE these
// phrases are fine — only the assertive label / purpose
// strings are scanned.
const TASK_COMPLETION_CLAIM_PHRASES: ReadonlyArray<string> = [
  "task is complete",
  "task is completed",
  "task complete",
  "task completed",
  "task done",
  "marked complete",
  "marked completed",
  "fully complete",
];

// Phrases a `start_booking_request` action may not assert in
// its label / purpose. Booking confirmation is a HumanReview
// outcome, never an action's claim.
const BOOKING_CONFIRMED_CLAIM_PHRASES: ReadonlyArray<string> = [
  "booking confirmed",
  "booking is confirmed",
  "booking complete",
  "booking completed",
  "booking is complete",
  "appointment confirmed",
  "appointment is confirmed",
  "reservation confirmed",
  "reservation is confirmed",
];

// Phrases a `start_email_draft` action may not assert in its
// label / purpose. The action prepares a draft for the visitor
// to review and send manually.
const EMAIL_SENT_CLAIM_PHRASES: ReadonlyArray<string> = [
  "email sent",
  "email is sent",
  "email was sent",
  "email delivered",
  "email completed",
  "email submitted",
  "message sent",
];

// Patterns that indicate raw HTML / CSS / JSX / markdown /
// template-string content. Any string-bearing field that
// matches fails validation.
const RAW_TEMPLATE_PATTERNS: ReadonlyArray<RegExp> = [
  /<[a-zA-Z][^>]*>/, // any HTML-like opening tag
  /<\/[a-zA-Z]+>/, // any HTML-like closing tag
  /style\s*=\s*["']/i, // inline style attribute
  /\{\{[\s\S]*?\}\}/, // mustache template
  /<%[\s\S]*?%>/, // ejs / erb template
  /\$\{[\s\S]*?\}/, // template-literal interpolation in raw strings
  /\[[^\]\n]+\]\([^)\n]+\)/, // markdown link
  /^#{1,6}\s/m, // markdown heading
  /```/, // markdown code fence
];

// Type-name hints applied to argument keys: an argument whose
// key carries one of these segments must declare the matching
// argument type.
const ARGUMENT_TYPE_HINTS: ReadonlyArray<{
  pattern: RegExp;
  expectedType: ArgumentType;
  label: string;
}> = [
  { pattern: /(^|_)email(_|$)/i, expectedType: "email", label: "email" },
  { pattern: /(^|_)phone(_|$)/i, expectedType: "phone", label: "phone" },
  { pattern: /(^|_)url(_|$)/i, expectedType: "url", label: "url" },
];

const RISK_TIER_ORDINAL: Readonly<Record<ActionRiskTier, number>> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  T5: 5,
};

const TIERS_REQUIRING_BLOCK_OR_REVIEW: ReadonlySet<ActionRiskTier> = new Set<
  ActionRiskTier
>(["T3", "T4", "T5"]);

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------
// Helper sets
// ---------------------------------------------------------------

const ALLOWED_ACTION_ID_SET = new Set<ActionId>(ACTION_IDS);
const ALLOWED_KIND_SET = new Set<ActionKind>(ACTION_KINDS);
const ALLOWED_RISK_TIER_SET = new Set<ActionRiskTier>(ACTION_RISK_TIERS);
const ALLOWED_CONFIRMATION_SET = new Set<ConfirmationPolicy>(
  CONFIRMATION_POLICIES,
);
const ALLOWED_REVERSIBILITY_SET = new Set<Reversibility>(REVERSIBILITIES);
const ALLOWED_EXECUTION_MODE_SET = new Set<ExecutionMode>(EXECUTION_MODES);
const ALLOWED_SOURCE_REQUIREMENT_SET = new Set<SourceRequirement>(
  SOURCE_REQUIREMENTS,
);
const ALLOWED_ARGUMENT_TYPE_SET = new Set<ArgumentType>(ARGUMENT_TYPES);
const ALLOWED_BLOCK_ID_SET = new Set<ComponentBlockId>(COMPONENT_BLOCK_IDS);

// ---------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function matchesAny(
  value: string,
  patterns: ReadonlyArray<RegExp>,
): RegExp | null {
  for (const pattern of patterns) {
    if (pattern.test(value)) return pattern;
  }
  return null;
}

function collectStringSlots(
  def: ActionDefinition,
): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: "label", value: def.label },
    { label: "purpose", value: def.purpose },
    ...def.safetyNotes.map((note, i) => ({
      label: `safetyNotes[${i}]`,
      value: note,
    })),
  ];
}

// ---------------------------------------------------------------
// v1 registry entries
// ---------------------------------------------------------------

const REGISTRY: ReadonlyArray<ActionDefinition> = [
  {
    id: "open_external_link",
    kind: "navigation",
    label: "Open external link",
    purpose:
      "Send the visitor to a registered host-managed URL — never autonomously navigate.",
    riskTier: "T1",
    confirmationPolicy: "soft_confirm",
    reversibility: "not_applicable",
    executionMode: "external_navigation_only",
    sourceRequirement: "registered_knowledge_required",
    requiredArgumentKeys: ["url", "label"],
    optionalArgumentKeys: ["context_help"],
    argumentSchema: {
      url: { type: "url", required: true, maxChars: 2048 },
      label: { type: "string", required: true, maxChars: 60 },
      context_help: { type: "string", maxChars: 240 },
    },
    dataFieldAllowlist: ["url", "label", "context_help"],
    compatibleComponentBlockIds: ["external_link_cta"],
    logging: {
      required: true,
      eventName: "action_open_external_link",
      includeArgumentKeys: ["label"],
      redactArgumentKeys: [],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Never asserts the visitor's task is finished; navigation hands the visitor over to the host site.",
      "URL must resolve to a registered KnowledgeSource entry, never arbitrary input.",
    ],
  },
  {
    id: "create_lead",
    kind: "capture",
    label: "Create low-risk lead",
    purpose:
      "Prepare a contact-only lead record for a host operator to follow up — never autonomously dispatched.",
    riskTier: "T1",
    confirmationPolicy: "explicit_confirm",
    reversibility: "reversible",
    executionMode: "server_prepare_only",
    sourceRequirement: "none",
    requiredArgumentKeys: ["name", "email"],
    optionalArgumentKeys: [
      "phone",
      "company",
      "role",
      "message",
      "preferred_contact_method",
    ],
    argumentSchema: {
      name: { type: "string", required: true, maxChars: 80, sensitive: true },
      email: { type: "email", required: true, maxChars: 254, sensitive: true },
      phone: { type: "phone", maxChars: 32, sensitive: true },
      company: { type: "string", maxChars: 120 },
      role: { type: "string", maxChars: 80 },
      message: { type: "string", maxChars: 1000, sensitive: true },
      preferred_contact_method: {
        type: "enum",
        allowedValues: ["email", "phone"],
        maxChars: 16,
      },
    },
    dataFieldAllowlist: [
      "name",
      "email",
      "phone",
      "company",
      "role",
      "message",
      "preferred_contact_method",
    ],
    compatibleComponentBlockIds: ["lead_capture"],
    logging: {
      required: true,
      eventName: "action_create_lead",
      includeArgumentKeys: ["preferred_contact_method"],
      redactArgumentKeys: ["name", "email", "phone", "message"],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Never auto-dispatched; the action prepares a lead row for the host operator.",
      "Never collects regulated fields (no health, finance, legal, immigration, or government-issued identifiers).",
      "Sensitive arguments (name / email / phone / message) are redacted from logs.",
    ],
  },
  {
    id: "create_contact_request",
    kind: "request",
    label: "Create general contact request",
    purpose:
      "Prepare a generic contact request so a human operator can respond — never asserts a service outcome.",
    riskTier: "T1",
    confirmationPolicy: "explicit_confirm",
    reversibility: "reversible",
    executionMode: "server_prepare_only",
    sourceRequirement: "none",
    requiredArgumentKeys: ["name", "email", "topic", "message"],
    optionalArgumentKeys: [
      "phone",
      "preferred_contact_method",
      "requested_time_window",
    ],
    argumentSchema: {
      name: { type: "string", required: true, maxChars: 80, sensitive: true },
      email: { type: "email", required: true, maxChars: 254, sensitive: true },
      topic: { type: "string", required: true, maxChars: 120 },
      message: {
        type: "string",
        required: true,
        maxChars: 1000,
        sensitive: true,
      },
      phone: { type: "phone", maxChars: 32, sensitive: true },
      preferred_contact_method: {
        type: "enum",
        allowedValues: ["email", "phone"],
        maxChars: 16,
      },
      requested_time_window: { type: "string", maxChars: 120 },
    },
    dataFieldAllowlist: [
      "name",
      "email",
      "topic",
      "message",
      "phone",
      "preferred_contact_method",
      "requested_time_window",
    ],
    compatibleComponentBlockIds: ["lead_capture", "handoff_notice"],
    logging: {
      required: true,
      eventName: "action_create_contact_request",
      includeArgumentKeys: ["preferred_contact_method"],
      redactArgumentKeys: ["name", "email", "phone", "message"],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Never asserts a service outcome was confirmed; the action only prepares a contact request.",
      "Sensitive arguments (name / email / phone / message) are redacted from logs.",
    ],
  },
  {
    id: "create_unmet_intent_capture",
    kind: "capture",
    label: "Capture unmet visitor intent",
    purpose:
      "Record what the visitor wanted to accomplish when no current path can satisfy it, for later human follow-up.",
    riskTier: "T1",
    confirmationPolicy: "soft_confirm",
    reversibility: "reversible",
    executionMode: "server_prepare_only",
    sourceRequirement: "none",
    requiredArgumentKeys: ["raw_intent_text"],
    optionalArgumentKeys: ["category_hint", "email", "preferred_contact_method"],
    argumentSchema: {
      raw_intent_text: {
        type: "string",
        required: true,
        maxChars: 2000,
        sensitive: true,
      },
      category_hint: { type: "string", maxChars: 80 },
      email: { type: "email", maxChars: 254, sensitive: true },
      preferred_contact_method: {
        type: "enum",
        allowedValues: ["email", "phone"],
        maxChars: 16,
      },
    },
    dataFieldAllowlist: [
      "raw_intent_text",
      "category_hint",
      "email",
      "preferred_contact_method",
    ],
    compatibleComponentBlockIds: ["unmet_intent_capture", "lead_capture"],
    logging: {
      required: true,
      eventName: "action_create_unmet_intent_capture",
      includeArgumentKeys: ["category_hint", "preferred_contact_method"],
      redactArgumentKeys: ["raw_intent_text", "email"],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Never promises a match or callback within a guaranteed window.",
      "Raw intent text and email are redacted from logs.",
    ],
  },
  {
    id: "request_human_review",
    kind: "handoff",
    label: "Request human review",
    purpose:
      "Queue the current InteractionIntent for a host operator to review before any action runs.",
    riskTier: "T2",
    confirmationPolicy: "human_review_required",
    reversibility: "reversible",
    executionMode: "human_review_queue",
    sourceRequirement: "human_review_required",
    requiredArgumentKeys: ["intent_id", "reason_label"],
    optionalArgumentKeys: ["context_summary"],
    argumentSchema: {
      intent_id: { type: "string", required: true, maxChars: 80 },
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
      context_summary: { type: "string", maxChars: 480, sensitive: true },
    },
    dataFieldAllowlist: ["intent_id", "reason_label", "context_summary"],
    compatibleComponentBlockIds: ["human_review_notice", "handoff_notice"],
    logging: {
      required: true,
      eventName: "action_request_human_review",
      includeArgumentKeys: ["intent_id", "reason_label"],
      redactArgumentKeys: ["context_summary"],
    },
    requiresHumanReview: true,
    safetyNotes: [
      "Never asserts a decision has been made; the review state is owned by the HumanReview workflow.",
      "Required for ambiguous and higher-risk visitor flows.",
    ],
  },
  {
    id: "download_resource",
    kind: "resource",
    label: "Download host resource",
    purpose:
      "Open or download a registered host-authored resource — never autonomously fetches arbitrary content.",
    riskTier: "T1",
    confirmationPolicy: "soft_confirm",
    reversibility: "not_applicable",
    executionMode: "external_navigation_only",
    sourceRequirement: "registered_knowledge_required",
    requiredArgumentKeys: ["resource_id", "title"],
    optionalArgumentKeys: ["mime_label", "size_label"],
    argumentSchema: {
      resource_id: { type: "string", required: true, maxChars: 120 },
      title: { type: "string", required: true, maxChars: 160 },
      mime_label: { type: "string", maxChars: 80 },
      size_label: { type: "string", maxChars: 40 },
    },
    dataFieldAllowlist: ["resource_id", "title", "mime_label", "size_label"],
    compatibleComponentBlockIds: ["external_link_cta", "source_citation"],
    logging: {
      required: true,
      eventName: "action_download_resource",
      includeArgumentKeys: ["resource_id"],
      redactArgumentKeys: [],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Resource must resolve to a registered KnowledgeSource entry; never fetches arbitrary URLs.",
      "Surface text never asserts the visitor's task is finished after download.",
    ],
  },
  {
    id: "copy_contact_info",
    kind: "communication",
    label: "Copy host contact info",
    purpose:
      "Provide host-published contact info that the visitor can copy on their own.",
    riskTier: "T0",
    confirmationPolicy: "none",
    reversibility: "not_applicable",
    executionMode: "client_prepare_only",
    sourceRequirement: "registered_knowledge_required",
    requiredArgumentKeys: ["channel", "value"],
    optionalArgumentKeys: ["label"],
    argumentSchema: {
      channel: {
        type: "enum",
        required: true,
        allowedValues: ["email", "phone", "url"],
        maxChars: 16,
      },
      value: { type: "string", required: true, maxChars: 254, sensitive: true },
      label: { type: "string", maxChars: 80 },
    },
    dataFieldAllowlist: ["channel", "value", "label"],
    compatibleComponentBlockIds: ["faq_answer", "source_citation"],
    logging: {
      required: true,
      eventName: "action_copy_contact_info",
      includeArgumentKeys: ["channel"],
      redactArgumentKeys: ["value"],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Value must come from a registered KnowledgeSource entry — never synthesized at render time.",
      "No outbound action; the visitor copies on their own device.",
    ],
  },
  {
    id: "start_email_draft",
    kind: "communication",
    label: "Start email draft",
    purpose:
      "Prepare a pre-filled email draft for the visitor to review and send manually.",
    riskTier: "T2",
    confirmationPolicy: "explicit_confirm",
    reversibility: "reversible",
    executionMode: "client_prepare_only",
    sourceRequirement: "none",
    requiredArgumentKeys: ["to", "subject_label"],
    optionalArgumentKeys: ["body_label"],
    argumentSchema: {
      to: { type: "email", required: true, maxChars: 254, sensitive: true },
      subject_label: {
        type: "string",
        required: true,
        maxChars: 200,
        sensitive: true,
      },
      body_label: { type: "string", maxChars: 2000, sensitive: true },
    },
    dataFieldAllowlist: ["to", "subject_label", "body_label"],
    compatibleComponentBlockIds: ["lead_capture", "handoff_notice"],
    logging: {
      required: true,
      eventName: "action_start_email_draft",
      includeArgumentKeys: [],
      redactArgumentKeys: ["to", "subject_label", "body_label"],
    },
    requiresHumanReview: false,
    safetyNotes: [
      "Never asserts an email was delivered; the action only opens a draft for the visitor to review and submit on their own.",
      "Sensitive draft content (recipient / subject / body) is redacted from logs.",
    ],
  },
  {
    id: "start_booking_request",
    kind: "request",
    label: "Start booking request",
    purpose:
      "Prepare a booking request that a human operator must review — never asserts a confirmed booking.",
    riskTier: "T2",
    confirmationPolicy: "explicit_confirm",
    reversibility: "reversible",
    executionMode: "human_review_queue",
    sourceRequirement: "human_review_required",
    requiredArgumentKeys: [
      "service_label",
      "name",
      "email",
      "requested_time_window",
    ],
    optionalArgumentKeys: ["phone", "notes"],
    argumentSchema: {
      service_label: { type: "string", required: true, maxChars: 120 },
      name: { type: "string", required: true, maxChars: 80, sensitive: true },
      email: { type: "email", required: true, maxChars: 254, sensitive: true },
      requested_time_window: { type: "string", required: true, maxChars: 120 },
      phone: { type: "phone", maxChars: 32, sensitive: true },
      notes: { type: "string", maxChars: 1000, sensitive: true },
    },
    dataFieldAllowlist: [
      "service_label",
      "name",
      "email",
      "requested_time_window",
      "phone",
      "notes",
    ],
    compatibleComponentBlockIds: [
      "lead_capture",
      "pre_action_checklist",
      "handoff_notice",
    ],
    logging: {
      required: true,
      eventName: "action_start_booking_request",
      includeArgumentKeys: ["service_label", "requested_time_window"],
      redactArgumentKeys: ["name", "email", "phone", "notes"],
    },
    requiresHumanReview: true,
    safetyNotes: [
      "Never asserts a booking was confirmed; the request must be reviewed by a human operator first.",
      "Sensitive arguments (name / email / phone / notes) are redacted from logs.",
    ],
  },
];

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

export function listActionDefinitions(): ReadonlyArray<ActionDefinition> {
  return REGISTRY;
}

export function getActionDefinition(id: string): ActionDefinition | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return REGISTRY.find((d) => d.id === id) ?? null;
}

export function isActionAllowedForRisk(
  def: ActionDefinition,
  riskTier: ActionRiskTier,
): boolean {
  if (!ALLOWED_RISK_TIER_SET.has(riskTier)) return false;
  // The action's tier must not exceed the host's current
  // ceiling. Mirrors the ComponentBlock semantics: an action
  // whose tier is X can be surfaced when the host's allowed
  // ceiling is X or higher.
  return RISK_TIER_ORDINAL[def.riskTier] <= RISK_TIER_ORDINAL[riskTier];
}

export type GetActionsForComponentBlockOptions = {
  riskTier?: ActionRiskTier;
  requiresHumanReview?: boolean;
  executionMode?: ExecutionMode;
};

export function getActionsForComponentBlock(
  blockId: string,
  options: GetActionsForComponentBlockOptions = {},
): ReadonlyArray<ActionDefinition> {
  if (!ALLOWED_BLOCK_ID_SET.has(blockId as ComponentBlockId)) return [];
  return REGISTRY.filter((def) => {
    if (!def.compatibleComponentBlockIds.includes(blockId as ComponentBlockId)) {
      return false;
    }
    if (
      options.riskTier &&
      !isActionAllowedForRisk(def, options.riskTier)
    ) {
      return false;
    }
    if (
      typeof options.requiresHumanReview === "boolean" &&
      def.requiresHumanReview !== options.requiresHumanReview
    ) {
      return false;
    }
    if (options.executionMode && def.executionMode !== options.executionMode) {
      return false;
    }
    return true;
  });
}

export function getActionsRequiringHumanReview(): ReadonlyArray<ActionDefinition> {
  return REGISTRY.filter((def) => def.requiresHumanReview === true);
}

export function getActionsRequiringSource(): ReadonlyArray<ActionDefinition> {
  return REGISTRY.filter((def) => def.sourceRequirement !== "none");
}

export function getBlockedActions(): ReadonlyArray<ActionDefinition> {
  return REGISTRY.filter(
    (def) =>
      def.executionMode === "blocked" || def.confirmationPolicy === "blocked",
  );
}

// "Executable" in v1 means the planner is allowed to surface
// the action with a confirmation block — *not* that the action
// runs autonomously. Actions whose `executionMode` is
// `"blocked"` or `"human_review_queue"` are excluded; the
// human-review queue is owned by HumanReview, not by the
// planner.
export function getExecutableActions(): ReadonlyArray<ActionDefinition> {
  const EXECUTABLE_MODES: ReadonlySet<ExecutionMode> = new Set<ExecutionMode>([
    "client_prepare_only",
    "server_prepare_only",
    "external_navigation_only",
  ]);
  return REGISTRY.filter((def) => EXECUTABLE_MODES.has(def.executionMode));
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

export type ActionRegistryValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function assertValidActionDefinition(def: ActionDefinition): void {
  const errors = validateActionDefinition(def);
  if (errors.length > 0) {
    throw new Error(
      `Invalid ActionDefinition '${String(def?.id ?? "<unknown>")}':\n  - ${errors.join(
        "\n  - ",
      )}`,
    );
  }
}

export function validateActionRegistry(
  registry: ReadonlyArray<ActionDefinition> = REGISTRY,
): ActionRegistryValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const def of registry) {
    if (def && typeof def.id === "string") {
      if (seenIds.has(def.id)) {
        errors.push(`duplicate action id: ${def.id}`);
      }
      seenIds.add(def.id);
    }
    const perDefErrors = validateActionDefinition(def);
    for (const e of perDefErrors) errors.push(e);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateActionDefinition(
  def: ActionDefinition,
): ReadonlyArray<string> {
  const errors: string[] = [];
  const id = def?.id ?? "<missing id>";

  // Closed-vocab membership.
  if (!ALLOWED_ACTION_ID_SET.has(def?.id as ActionId)) {
    errors.push(`${id}: id '${String(def?.id)}' is not in ACTION_IDS`);
  }
  if (!ALLOWED_KIND_SET.has(def?.kind as ActionKind)) {
    errors.push(`${id}: kind '${String(def?.kind)}' is not in ACTION_KINDS`);
  }
  if (!ALLOWED_RISK_TIER_SET.has(def?.riskTier as ActionRiskTier)) {
    errors.push(`${id}: riskTier '${String(def?.riskTier)}' is not in ACTION_RISK_TIERS`);
  }
  if (
    !ALLOWED_CONFIRMATION_SET.has(def?.confirmationPolicy as ConfirmationPolicy)
  ) {
    errors.push(
      `${id}: confirmationPolicy '${String(def?.confirmationPolicy)}' is not allowed`,
    );
  }
  if (!ALLOWED_REVERSIBILITY_SET.has(def?.reversibility as Reversibility)) {
    errors.push(`${id}: reversibility '${String(def?.reversibility)}' is not allowed`);
  }
  if (!ALLOWED_EXECUTION_MODE_SET.has(def?.executionMode as ExecutionMode)) {
    errors.push(`${id}: executionMode '${String(def?.executionMode)}' is not allowed`);
  }
  if (
    !ALLOWED_SOURCE_REQUIREMENT_SET.has(def?.sourceRequirement as SourceRequirement)
  ) {
    errors.push(
      `${id}: sourceRequirement '${String(def?.sourceRequirement)}' is not allowed`,
    );
  }

  // Non-empty strings.
  if (!isNonEmptyString(def?.label)) {
    errors.push(`${id}: label must be a non-empty string`);
  }
  if (!isNonEmptyString(def?.purpose)) {
    errors.push(`${id}: purpose must be a non-empty string`);
  }
  if (!Array.isArray(def?.safetyNotes) || def.safetyNotes.length === 0) {
    errors.push(`${id}: safetyNotes must be a non-empty array`);
  } else {
    for (let i = 0; i < def.safetyNotes.length; i++) {
      if (!isNonEmptyString(def.safetyNotes[i]!)) {
        errors.push(`${id}: safetyNotes[${i}] is empty`);
      }
    }
  }

  // Argument schema integrity.
  const requiredKeys = Array.isArray(def?.requiredArgumentKeys)
    ? def.requiredArgumentKeys
    : [];
  const optionalKeys = Array.isArray(def?.optionalArgumentKeys)
    ? def.optionalArgumentKeys
    : [];
  const schema = def?.argumentSchema ?? {};
  const schemaKeys = Object.keys(schema);
  const schemaKeySet = new Set<string>(schemaKeys);
  const requiredKeySet = new Set<string>(requiredKeys);
  const optionalKeySet = new Set<string>(optionalKeys);

  if (!Array.isArray(def?.requiredArgumentKeys)) {
    errors.push(`${id}: requiredArgumentKeys must be an array`);
  }
  if (!Array.isArray(def?.optionalArgumentKeys)) {
    errors.push(`${id}: optionalArgumentKeys must be an array`);
  }

  for (const r of requiredKeys) {
    if (!schemaKeySet.has(r)) {
      errors.push(`${id}: requiredArgumentKey '${r}' is not in argumentSchema`);
    } else if (schema[r]?.required !== true) {
      errors.push(
        `${id}: requiredArgumentKey '${r}' must have argumentSchema['${r}'].required === true`,
      );
    }
  }
  for (const o of optionalKeys) {
    if (!schemaKeySet.has(o)) {
      errors.push(`${id}: optionalArgumentKey '${o}' is not in argumentSchema`);
    } else if (schema[o]?.required === true) {
      errors.push(
        `${id}: optionalArgumentKey '${o}' must NOT have argumentSchema['${o}'].required === true`,
      );
    }
    if (requiredKeySet.has(o)) {
      errors.push(
        `${id}: argument '${o}' is in both requiredArgumentKeys and optionalArgumentKeys`,
      );
    }
  }
  for (const k of schemaKeys) {
    if (!requiredKeySet.has(k) && !optionalKeySet.has(k)) {
      errors.push(
        `${id}: argumentSchema key '${k}' must appear in requiredArgumentKeys or optionalArgumentKeys`,
      );
    }
    const arg = schema[k]!;
    if (!ALLOWED_ARGUMENT_TYPE_SET.has(arg.type as ArgumentType)) {
      errors.push(`${id}: argument '${k}' has out-of-vocab type '${String(arg.type)}'`);
    }
    if (arg.maxChars !== undefined) {
      if (
        typeof arg.maxChars !== "number" ||
        !Number.isFinite(arg.maxChars) ||
        arg.maxChars <= 0 ||
        !Number.isInteger(arg.maxChars)
      ) {
        errors.push(
          `${id}: argument '${k}' maxChars must be a finite positive integer`,
        );
      }
    }
    if (arg.type === "enum") {
      if (
        !Array.isArray(arg.allowedValues) ||
        arg.allowedValues.length === 0 ||
        !arg.allowedValues.every((v) => isNonEmptyString(v))
      ) {
        errors.push(
          `${id}: argument '${k}' (type 'enum') must declare a non-empty allowedValues array`,
        );
      }
    }
    // Type-name hints — keys whose name implies email / phone /
    // url must use the matching type.
    for (const hint of ARGUMENT_TYPE_HINTS) {
      if (hint.pattern.test(k) && arg.type !== hint.expectedType) {
        errors.push(
          `${id}: argument '${k}' implies type '${hint.label}' by its name; declared type '${arg.type}' must be '${hint.expectedType}'`,
        );
      }
    }
    // Sensitive-field banlist — argument keys.
    const sensitiveHit = lowercaseIncludesAny(k, SENSITIVE_FIELD_PATTERNS);
    if (sensitiveHit) {
      errors.push(
        `${id}: argument key '${k}' matches a forbidden sensitive-field pattern '${sensitiveHit}'`,
      );
    }
  }

  // dataFieldAllowlist sensitive-field scan.
  if (!Array.isArray(def?.dataFieldAllowlist)) {
    errors.push(`${id}: dataFieldAllowlist must be an array`);
  } else {
    for (const field of def.dataFieldAllowlist) {
      const hit = lowercaseIncludesAny(field, SENSITIVE_FIELD_PATTERNS);
      if (hit) {
        errors.push(
          `${id}: dataFieldAllowlist must not include the sensitive field '${field}' (matched '${hit}')`,
        );
      }
    }
  }

  // compatibleComponentBlockIds membership.
  if (!Array.isArray(def?.compatibleComponentBlockIds)) {
    errors.push(`${id}: compatibleComponentBlockIds must be an array`);
  } else {
    for (const b of def.compatibleComponentBlockIds) {
      if (!ALLOWED_BLOCK_ID_SET.has(b as ComponentBlockId)) {
        errors.push(
          `${id}: compatibleComponentBlockIds includes unknown block id '${String(b)}'`,
        );
      }
    }
  }

  // requiresHumanReview type.
  if (typeof def?.requiresHumanReview !== "boolean") {
    errors.push(`${id}: requiresHumanReview must be a boolean`);
  }

  // Logging policy integrity.
  const logging = def?.logging;
  if (!logging || typeof logging !== "object") {
    errors.push(`${id}: logging must be an object`);
  } else {
    if (typeof logging.required !== "boolean") {
      errors.push(`${id}: logging.required must be a boolean`);
    }
    if (!isNonEmptyString(logging.eventName)) {
      errors.push(`${id}: logging.eventName must be a non-empty string`);
    } else if (!SNAKE_CASE_RE.test(logging.eventName)) {
      errors.push(
        `${id}: logging.eventName '${logging.eventName}' must match /^[a-z][a-z0-9_]*$/`,
      );
    }
    const includeKeys = Array.isArray(logging.includeArgumentKeys)
      ? logging.includeArgumentKeys
      : [];
    const redactKeys = Array.isArray(logging.redactArgumentKeys)
      ? logging.redactArgumentKeys
      : [];
    if (!Array.isArray(logging.includeArgumentKeys)) {
      errors.push(`${id}: logging.includeArgumentKeys must be an array`);
    }
    if (!Array.isArray(logging.redactArgumentKeys)) {
      errors.push(`${id}: logging.redactArgumentKeys must be an array`);
    }
    const includeSet = new Set<string>(includeKeys);
    const redactSet = new Set<string>(redactKeys);
    for (const k of includeKeys) {
      if (!schemaKeySet.has(k)) {
        errors.push(
          `${id}: logging.includeArgumentKeys '${k}' is not in argumentSchema`,
        );
      }
      if (redactSet.has(k)) {
        errors.push(
          `${id}: argument '${k}' appears in BOTH includeArgumentKeys and redactArgumentKeys`,
        );
      }
    }
    for (const k of redactKeys) {
      if (!schemaKeySet.has(k)) {
        errors.push(
          `${id}: logging.redactArgumentKeys '${k}' is not in argumentSchema`,
        );
      }
    }
    // Sensitive arguments must be redacted from logs.
    for (const [k, arg] of Object.entries(schema)) {
      if (arg?.sensitive === true) {
        if (!redactSet.has(k)) {
          errors.push(
            `${id}: sensitive argument '${k}' must appear in logging.redactArgumentKeys`,
          );
        }
        if (includeSet.has(k)) {
          errors.push(
            `${id}: sensitive argument '${k}' must NOT appear in logging.includeArgumentKeys`,
          );
        }
      }
    }
  }

  // Risk-tier rule (ISS-0 §5).
  if (
    ALLOWED_RISK_TIER_SET.has(def?.riskTier as ActionRiskTier) &&
    TIERS_REQUIRING_BLOCK_OR_REVIEW.has(def.riskTier)
  ) {
    const isBlocked = def.executionMode === "blocked";
    if (!isBlocked && def.requiresHumanReview !== true) {
      errors.push(
        `${id}: riskTier '${def.riskTier}' must be either executionMode 'blocked' or requiresHumanReview === true in v1`,
      );
    }
  }

  // Reversibility rule.
  if (
    def?.reversibility === "irreversible" &&
    def.executionMode !== "blocked"
  ) {
    errors.push(
      `${id}: irreversible action must have executionMode 'blocked' in v1`,
    );
  }

  // executionMode === "blocked" → confirmationPolicy "blocked"
  // + disabledReason present.
  if (def?.executionMode === "blocked") {
    if (def.confirmationPolicy !== "blocked") {
      errors.push(
        `${id}: executionMode 'blocked' requires confirmationPolicy 'blocked'`,
      );
    }
    if (!isNonEmptyString(def.disabledReason)) {
      errors.push(
        `${id}: executionMode 'blocked' requires a non-empty disabledReason`,
      );
    }
  } else {
    // Non-blocked actions should not declare a disabledReason.
    if (def?.disabledReason !== undefined) {
      errors.push(
        `${id}: disabledReason is only valid when executionMode === 'blocked'`,
      );
    }
  }

  // executionMode === "human_review_queue" → requiresHumanReview true.
  if (
    def?.executionMode === "human_review_queue" &&
    def.requiresHumanReview !== true
  ) {
    errors.push(
      `${id}: executionMode 'human_review_queue' requires requiresHumanReview === true`,
    );
  }

  // Per-id contract rules.
  if (def?.id === "request_human_review" && def.requiresHumanReview !== true) {
    errors.push(`${id}: requiresHumanReview must be true`);
  }
  if (def?.id === "open_external_link") {
    if (def.sourceRequirement !== "registered_knowledge_required") {
      errors.push(
        `${id}: sourceRequirement must be 'registered_knowledge_required'`,
      );
    }
    for (const slot of [def.label, def.purpose]) {
      const hit = lowercaseIncludesAny(slot, TASK_COMPLETION_CLAIM_PHRASES);
      if (hit) {
        errors.push(
          `${id}: ${
            slot === def.label ? "label" : "purpose"
          } must not assert task completion (matched '${hit}')`,
        );
      }
    }
  }
  if (
    def?.id === "download_resource" &&
    def.sourceRequirement !== "registered_knowledge_required"
  ) {
    errors.push(
      `${id}: sourceRequirement must be 'registered_knowledge_required'`,
    );
  }
  if (def?.id === "start_booking_request") {
    for (const slot of [def.label, def.purpose]) {
      const hit = lowercaseIncludesAny(slot, BOOKING_CONFIRMED_CLAIM_PHRASES);
      if (hit) {
        errors.push(
          `${id}: ${
            slot === def.label ? "label" : "purpose"
          } must not assert a confirmed booking (matched '${hit}')`,
        );
      }
    }
  }
  if (def?.id === "start_email_draft") {
    for (const slot of [def.label, def.purpose]) {
      const hit = lowercaseIncludesAny(slot, EMAIL_SENT_CLAIM_PHRASES);
      if (hit) {
        errors.push(
          `${id}: ${
            slot === def.label ? "label" : "purpose"
          } must not assert an email was sent (matched '${hit}')`,
        );
      }
    }
  }

  // Raw HTML / CSS / JSX / markdown / template scan over all
  // string-bearing fields surfaced to the renderer or planner.
  for (const slot of collectStringSlots(def ?? ({} as ActionDefinition))) {
    if (typeof slot.value !== "string") continue;
    const hit = matchesAny(slot.value, RAW_TEMPLATE_PATTERNS);
    if (hit) {
      errors.push(
        `${id}: ${slot.label} contains a raw HTML / CSS / JSX / markdown / template fragment matching ${hit}`,
      );
    }
  }

  return errors;
}

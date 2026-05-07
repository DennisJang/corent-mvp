// CoRent Interactive Experience — ComponentBlock registry v1.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — ComponentBlock).
//   docs/interaction_safety_standard_v0.md (§4.1 No arbitrary
//     UI, §6 ComponentBlock safety rules, §5 risk tier model).
//   docs/platform_pivot_note_2026-05-07.md §9 (next build
//     target: ComponentBlock registry v1).
//   docs/platform_repositioning_audit_2026-05-07.md §11.
//
// Purpose:
//
//   Type-only / pure-data registry of UI block definitions the
//   deterministic planner is allowed to recommend. The registry
//   declares what each block renders (slot manifest, length
//   caps, required source-backing) and which interaction intents
//   and risk tiers it is compatible with. It does not render
//   anything; renderers live with the host.
//
//   ComponentBlock is the platform's defense against arbitrary
//   AI-generated UI: every block is registered, every slot is
//   declared, every text field is length-capped, and every
//   high-risk block must be source-backed and/or human-reviewed.
//
//   ComponentBlock is NOT a customer-facing menu. Customers
//   express purpose, brand judgment, canonical facts, and
//   forbidden claims; the platform converts those into this
//   internal vocabulary.
//
// Hard rules pinned in this file:
//
//   - Pure data + pure functions. No I/O, no env, no network,
//     no Supabase, no LLM, no React, no DOM. Importing this
//     module is free.
//   - Closed vocabularies. Block id, kind, source requirement,
//     and risk tier are `as const` arrays whose members
//     type-narrow at the boundary.
//   - DTO discipline. The shape has no slot for raw HTML, CSS,
//     JSX, markdown rendering, or raw prompt templates. The
//     validator runtime-scans every string field for those
//     patterns and refuses on hit.
//   - Sensitive-field discipline. `lead_capture` blocks must
//     never list a regulated field in `dataFieldAllowlist`.
//     The validator pins the rule.
//   - Risk-tier rule from ISS-0 §5: T3/T4/T5 blocks are not
//     enabled in this v1 registry unless `requiresHumanReview`
//     is `true`.
//   - Action compatibility uses opaque string ids until the
//     Action registry slice lands. Future Action registry will
//     narrow `compatibleActionTypes: string[]` into a typed
//     union without changing the validator's contract.
//
// What this module is NOT:
//
//   - Not a renderer.
//   - Not wired into any UI surface.
//   - Not a Phase 3 LLM orchestrator. It is the static source
//     of truth the planner reads to decide which block recipes
//     it may emit.

import {
  INTERACTION_INTENT_KINDS,
  INTERACTION_INTENT_RISK_TIERS,
  type InteractionIntentKind,
  type InteractionIntentRiskTier,
} from "./interactionIntent";

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const COMPONENT_BLOCK_IDS = [
  "intent_summary",
  "clarifying_question",
  "faq_answer",
  "source_citation",
  "pre_action_checklist",
  "lead_capture",
  "handoff_notice",
  "external_link_cta",
  "unmet_intent_capture",
  "human_review_notice",
  "fallback_message",
] as const;
export type ComponentBlockId = (typeof COMPONENT_BLOCK_IDS)[number];

export const COMPONENT_BLOCK_KINDS = [
  "guidance",
  "question",
  "answer",
  "capture",
  "action_prompt",
  "review",
  "fallback",
] as const;
export type ComponentBlockKind = (typeof COMPONENT_BLOCK_KINDS)[number];

// Re-exports the InteractionIntent risk tier vocabulary so
// callers don't have to know the deeper module boundary.
export const COMPONENT_BLOCK_RISK_TIERS = INTERACTION_INTENT_RISK_TIERS;
export type ComponentBlockRiskTier = InteractionIntentRiskTier;

export const SOURCE_REQUIREMENTS = [
  "none",
  "registered_knowledge_required",
  "registered_knowledge_or_human_review_required",
  "human_review_required",
] as const;
export type SourceRequirement = (typeof SOURCE_REQUIREMENTS)[number];

// ---------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------

export type ComponentBlockSlotLimit = {
  // Maximum character count for a single string slot.
  maxChars?: number;
  // Maximum item count for a list slot.
  maxItems?: number;
  // Whether the slot must be present at render time.
  required?: boolean;
};

export type ComponentBlockDefinition = {
  id: ComponentBlockId;
  kind: ComponentBlockKind;
  // Short human-readable label. Used internally — never as
  // user-facing copy without a renderer mapping.
  label: string;
  // One-sentence statement of what the block does and what it
  // does not. Used by the planner / future LLM to choose blocks.
  purpose: string;
  // Which interaction intents the block is compatible with.
  // Closed vocabulary inherited from
  // `INTERACTION_INTENT_KINDS`.
  allowedIntentTypes: ReadonlyArray<InteractionIntentKind>;
  // The highest ISS-0 risk tier this block may be used at. The
  // deterministic planner refuses to attach a block whose tier
  // cap is below the intent's risk tier.
  maxRiskTier: ComponentBlockRiskTier;
  // Whether the block's content must be backed by a registered
  // KnowledgeSource entry, by a HumanReview decision, or both.
  // `none` is reserved for blocks that carry no claim about the
  // host's knowledge (e.g. intent echo, clarifying question).
  sourceRequirement: SourceRequirement;
  // Slot keys the block exposes to the renderer.
  allowedSlotKeys: ReadonlyArray<string>;
  // Subset of `allowedSlotKeys` that must be present at render
  // time. Each required key has `slotLimits[key].required ===
  // true`.
  requiredSlotKeys: ReadonlyArray<string>;
  // Per-slot limits. Keys must be a subset of
  // `allowedSlotKeys`.
  slotLimits: Readonly<Record<string, ComponentBlockSlotLimit>>;
  // Allowed data field names the block may collect (lead
  // capture / unmet intent capture). Sensitive regulated fields
  // are forbidden by the validator.
  dataFieldAllowlist: ReadonlyArray<string>;
  // Action ids the block is compatible with. Opaque strings
  // until the Action registry slice lands. The planner refuses
  // to attach an Action whose id is not in this list.
  compatibleActionTypes: ReadonlyArray<string>;
  // Whether the block forces a HumanReview step.
  requiresHumanReview: boolean;
  // Non-empty list of plain-text safety notes. The validator
  // refuses any note that contains raw HTML / CSS / JSX /
  // markdown / template fragments.
  safetyNotes: ReadonlyArray<string>;
};

// ---------------------------------------------------------------
// Banlists used by the validator
// ---------------------------------------------------------------

// Sensitive regulated fields that must NEVER appear on a
// `lead_capture` `dataFieldAllowlist`. Snake / camel / hyphen
// variants are detected by lowercase substring match below.
const SENSITIVE_DATA_FIELDS: ReadonlyArray<string> = [
  "ssn",
  "social_security",
  "social-security",
  "passport",
  "government_id",
  "government-id",
  "national_id",
  "national-id",
  "id_number",
  "id-number",
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
  "deposit",
  "escrow",
  "settlement",
  "insurance",
  "policy_number",
  "policy-number",
  "medical",
  "diagnosis",
  "prescription",
  "health_condition",
  "health-condition",
  "citizenship",
  "visa_number",
  "visa-number",
];

// Phrases an `external_link_cta` block may not state in its
// label / purpose, because clicking through does not equal
// task completion (ISS-0 §10.4 task-completion measurement).
// Safety notes that NEGATE these phrases ("never claims …") are
// fine — only the assertive label / purpose strings are
// scanned.
const COMPLETION_CLAIM_PHRASES: ReadonlyArray<string> = [
  "task is complete",
  "task is completed",
  "task complete",
  "task completed",
  "task done",
  "marked complete",
  "marked completed",
  "fully complete",
];

// Patterns that indicate raw HTML / CSS / JSX / markdown /
// template-string content. Any block string field that matches
// fails validation.
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

// Risk-tier ordinal map used by `isComponentBlockAllowedForRisk`.
const RISK_TIER_ORDINAL: Readonly<
  Record<ComponentBlockRiskTier, number>
> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4, T5: 5 };

const TIERS_REQUIRING_HUMAN_REVIEW: ReadonlySet<ComponentBlockRiskTier> =
  new Set<ComponentBlockRiskTier>(["T3", "T4", "T5"]);

// ---------------------------------------------------------------
// Helpers shared with the validator
// ---------------------------------------------------------------

const ALLOWED_INTENT_KIND_SET = new Set<InteractionIntentKind>(
  INTERACTION_INTENT_KINDS,
);
const ALLOWED_RISK_TIER_SET = new Set<ComponentBlockRiskTier>(
  COMPONENT_BLOCK_RISK_TIERS,
);
const ALLOWED_BLOCK_KIND_SET = new Set<ComponentBlockKind>(
  COMPONENT_BLOCK_KINDS,
);
const ALLOWED_SOURCE_REQUIREMENT_SET = new Set<SourceRequirement>(
  SOURCE_REQUIREMENTS,
);
const ALLOWED_BLOCK_ID_SET = new Set<ComponentBlockId>(COMPONENT_BLOCK_IDS);

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
  def: ComponentBlockDefinition,
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

// All eleven InteractionIntent kinds — used by blocks that apply
// to every visitor purpose (e.g. fallback / unmet intent capture).
const ALL_INTENT_KINDS: ReadonlyArray<InteractionIntentKind> = [
  ...INTERACTION_INTENT_KINDS,
];

const REGISTRY: ReadonlyArray<ComponentBlockDefinition> = [
  {
    id: "intent_summary",
    kind: "guidance",
    label: "Recognized intent summary",
    purpose:
      "Echo the visitor's recognized purpose so they can confirm or correct it before any action runs.",
    allowedIntentTypes: ALL_INTENT_KINDS,
    maxRiskTier: "T1",
    sourceRequirement: "none",
    allowedSlotKeys: ["title", "summary", "intent_type_label"],
    requiredSlotKeys: ["title", "summary"],
    slotLimits: {
      title: { maxChars: 120, required: true },
      summary: { maxChars: 480, required: true },
      intent_type_label: { maxChars: 60 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Echoes recognized intent only — never adds details the visitor did not state.",
      "Carries no action; never marks any visitor task as completed.",
    ],
  },
  {
    id: "clarifying_question",
    kind: "question",
    label: "Constrained clarifying question",
    purpose:
      "Ask one bounded follow-up question when the planner needs missing intent details.",
    allowedIntentTypes: ALL_INTENT_KINDS,
    maxRiskTier: "T1",
    sourceRequirement: "none",
    allowedSlotKeys: ["question", "options", "help_text"],
    requiredSlotKeys: ["question"],
    slotLimits: {
      question: { maxChars: 240, required: true },
      options: { maxItems: 6 },
      help_text: { maxChars: 240 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Question is bounded — never an open-ended reasoning prompt shown to the visitor.",
      "No action runs from this block; it only collects a clarifying choice.",
    ],
  },
  {
    id: "faq_answer",
    kind: "answer",
    label: "Source-backed FAQ answer",
    purpose:
      "Answer a visitor question using registered, host-authored knowledge — never invented content.",
    allowedIntentTypes: ["learn", "compare", "troubleshoot", "contact", "unknown"],
    maxRiskTier: "T1",
    sourceRequirement: "registered_knowledge_required",
    allowedSlotKeys: ["question_label", "answer", "source_card_id"],
    requiredSlotKeys: ["answer", "source_card_id"],
    slotLimits: {
      question_label: { maxChars: 120 },
      answer: { maxChars: 800, required: true },
      source_card_id: { maxChars: 80, required: true },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Every answer cites a registered KnowledgeSource via source_card_id.",
      "Never asserts content that is not derivable from the cited source.",
    ],
  },
  {
    id: "source_citation",
    kind: "guidance",
    label: "Source-backed citation reference",
    purpose:
      "Display a small citation that links back to a registered source for transparency.",
    allowedIntentTypes: [
      "learn",
      "compare",
      "choose",
      "troubleshoot",
      "contact",
      "buy",
      "try_before_buy",
      "unknown",
    ],
    maxRiskTier: "T2",
    sourceRequirement: "registered_knowledge_required",
    allowedSlotKeys: ["title", "publisher", "url_label", "last_reviewed_at"],
    requiredSlotKeys: ["title", "publisher"],
    slotLimits: {
      title: { maxChars: 160, required: true },
      publisher: { maxChars: 80, required: true },
      url_label: { maxChars: 80 },
      last_reviewed_at: { maxChars: 40 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Source must resolve to a registered KnowledgeSource entry via source_card_id elsewhere in the recipe context.",
      "URL label is plain text in the recipe; the renderer decides whether and how to make it clickable.",
    ],
  },
  {
    id: "pre_action_checklist",
    kind: "guidance",
    label: "Pre-action visitor checklist",
    purpose:
      "List items the visitor should validate before submitting a request or taking a CTA.",
    allowedIntentTypes: [
      "choose",
      "request",
      "book",
      "apply",
      "contact",
      "buy",
      "try_before_buy",
    ],
    maxRiskTier: "T2",
    sourceRequirement: "registered_knowledge_or_human_review_required",
    allowedSlotKeys: ["heading", "items", "footnote"],
    requiredSlotKeys: ["heading", "items"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      items: { maxItems: 6, required: true },
      footnote: { maxChars: 240 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Items are sourced from a deterministic readiness layer or a human-reviewed checklist; never invented at render time.",
      "Never carries payment, legal, medical, financial, or immigration decisioning copy.",
    ],
  },
  {
    id: "lead_capture",
    kind: "capture",
    label: "Low-risk visitor lead capture",
    purpose:
      "Collect minimum bounded contact details so a human can follow up.",
    allowedIntentTypes: ["contact", "request", "apply", "unknown"],
    maxRiskTier: "T1",
    sourceRequirement: "none",
    allowedSlotKeys: ["heading", "consent_help_text", "submit_label", "fields"],
    requiredSlotKeys: ["heading", "consent_help_text", "submit_label"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      consent_help_text: { maxChars: 240, required: true },
      submit_label: { maxChars: 60, required: true },
      fields: { maxItems: 8 },
    },
    dataFieldAllowlist: [
      "name",
      "email",
      "phone",
      "company",
      "role",
      "message",
      "preferred_contact_method",
      "requested_time_window",
    ],
    compatibleActionTypes: ["create_lead", "create_unmet_intent_capture"],
    requiresHumanReview: false,
    safetyNotes: [
      "Requires a visible consent_help_text slot before submission.",
      "Never collects regulated fields (no health, finance, legal, immigration, or government-issued identifiers).",
      "Form submission is dispatched via a registered Action only.",
    ],
  },
  {
    id: "handoff_notice",
    kind: "review",
    label: "Human handoff notice",
    purpose:
      "Tell the visitor that a human will respond — never imply approval, acceptance, or booking confirmation.",
    allowedIntentTypes: [
      "request",
      "book",
      "apply",
      "contact",
      "troubleshoot",
      "unknown",
    ],
    maxRiskTier: "T2",
    sourceRequirement: "none",
    allowedSlotKeys: ["heading", "body", "expected_response_window"],
    requiredSlotKeys: ["heading", "body"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      body: { maxChars: 480, required: true },
      expected_response_window: { maxChars: 60 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: true,
    safetyNotes: [
      "Never asserts a request was approved, accepted, confirmed, scheduled, or fulfilled.",
      "Pairs with a HumanReview workflow downstream; this block only signals.",
    ],
  },
  {
    id: "external_link_cta",
    kind: "action_prompt",
    label: "External-link call-to-action",
    purpose:
      "Point the visitor at an existing host-managed URL or CTA — never autonomously execute the link.",
    allowedIntentTypes: [
      "learn",
      "compare",
      "choose",
      "request",
      "book",
      "apply",
      "troubleshoot",
      "contact",
      "buy",
    ],
    maxRiskTier: "T2",
    sourceRequirement: "registered_knowledge_required",
    allowedSlotKeys: ["heading", "label", "destination_label", "context_help"],
    requiredSlotKeys: ["label", "destination_label"],
    slotLimits: {
      heading: { maxChars: 120 },
      label: { maxChars: 60, required: true },
      destination_label: { maxChars: 120, required: true },
      context_help: { maxChars: 240 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Never asserts the visitor's task is finished; the visitor must click through and the host decides next.",
      "Destination is a registered, host-approved URL — the recipe carries label metadata, not arbitrary URLs.",
    ],
  },
  {
    id: "unmet_intent_capture",
    kind: "capture",
    label: "Unmet intent capture",
    purpose:
      "Capture what the visitor wanted to accomplish when no current path can satisfy it, so a human can follow up later.",
    allowedIntentTypes: ALL_INTENT_KINDS,
    maxRiskTier: "T1",
    sourceRequirement: "none",
    allowedSlotKeys: ["heading", "summary", "consent_help_text", "submit_label"],
    requiredSlotKeys: ["heading", "consent_help_text", "submit_label"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      summary: { maxChars: 480 },
      consent_help_text: { maxChars: 240, required: true },
      submit_label: { maxChars: 60, required: true },
    },
    dataFieldAllowlist: [
      "raw_intent_text",
      "category_hint",
      "preferred_contact_method",
      "email",
    ],
    compatibleActionTypes: ["create_unmet_intent_capture"],
    requiresHumanReview: false,
    safetyNotes: [
      "Block never promises a match or callback within a guaranteed window.",
      "Submission is dispatched via a registered Action; no autonomous outbound action.",
    ],
  },
  {
    id: "human_review_notice",
    kind: "review",
    label: "Human review required notice",
    purpose:
      "Tell the visitor that the current request needs human review before any action can run.",
    allowedIntentTypes: [
      "choose",
      "request",
      "book",
      "apply",
      "contact",
      "buy",
      "try_before_buy",
      "unknown",
    ],
    maxRiskTier: "T2",
    sourceRequirement: "human_review_required",
    allowedSlotKeys: ["heading", "body", "review_status_label"],
    requiredSlotKeys: ["heading", "body"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      body: { maxChars: 480, required: true },
      review_status_label: { maxChars: 60 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: true,
    safetyNotes: [
      "Required for ambiguous and higher-risk flows where a deterministic source cannot answer alone.",
      "Never implies a decision has been made; the review state is owned by the HumanReview workflow.",
    ],
  },
  {
    id: "fallback_message",
    kind: "fallback",
    label: "Safe fallback message",
    purpose:
      "Explain that the platform cannot answer or act under current source / policy / risk constraints.",
    allowedIntentTypes: ALL_INTENT_KINDS,
    maxRiskTier: "T0",
    sourceRequirement: "none",
    allowedSlotKeys: ["heading", "body", "next_step_label"],
    requiredSlotKeys: ["heading", "body"],
    slotLimits: {
      heading: { maxChars: 120, required: true },
      body: { maxChars: 480, required: true },
      next_step_label: { maxChars: 60 },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: [
      "Never invents an answer or fabricates a source.",
      "Always offers a calm next step (refine question, request human review, come back later).",
    ],
  },
];

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

export function listComponentBlockDefinitions(): ReadonlyArray<ComponentBlockDefinition> {
  return REGISTRY;
}

export function getComponentBlockDefinition(
  id: string,
): ComponentBlockDefinition | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return REGISTRY.find((d) => d.id === id) ?? null;
}

export function isComponentBlockAllowedForIntent(
  def: ComponentBlockDefinition,
  intentType: InteractionIntentKind,
): boolean {
  if (!ALLOWED_INTENT_KIND_SET.has(intentType)) return false;
  return def.allowedIntentTypes.includes(intentType);
}

export function isComponentBlockAllowedForRisk(
  def: ComponentBlockDefinition,
  riskTier: ComponentBlockRiskTier,
): boolean {
  if (!ALLOWED_RISK_TIER_SET.has(riskTier)) return false;
  return RISK_TIER_ORDINAL[riskTier] <= RISK_TIER_ORDINAL[def.maxRiskTier];
}

export type GetComponentBlocksForIntentOptions = {
  riskTier?: ComponentBlockRiskTier;
  requiresHumanReview?: boolean;
  sourceRequirement?: SourceRequirement;
};

export function getComponentBlocksForIntent(
  intentType: InteractionIntentKind,
  options: GetComponentBlocksForIntentOptions = {},
): ReadonlyArray<ComponentBlockDefinition> {
  return REGISTRY.filter((def) => {
    if (!isComponentBlockAllowedForIntent(def, intentType)) return false;
    if (options.riskTier && !isComponentBlockAllowedForRisk(def, options.riskTier))
      return false;
    if (
      typeof options.requiresHumanReview === "boolean" &&
      def.requiresHumanReview !== options.requiresHumanReview
    ) {
      return false;
    }
    if (
      options.sourceRequirement &&
      def.sourceRequirement !== options.sourceRequirement
    ) {
      return false;
    }
    return true;
  });
}

export function getComponentBlocksRequiringSource(): ReadonlyArray<ComponentBlockDefinition> {
  return REGISTRY.filter((def) => def.sourceRequirement !== "none");
}

export function getComponentBlocksRequiringHumanReview(): ReadonlyArray<ComponentBlockDefinition> {
  return REGISTRY.filter((def) => def.requiresHumanReview === true);
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

export type ComponentBlockRegistryValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

// Throws on the first invariant a single definition violates.
// The `validateComponentBlockRegistry` aggregator collects all
// errors via per-definition validation; tests rely on both.
export function assertValidComponentBlockDefinition(
  def: ComponentBlockDefinition,
): void {
  const errors = validateComponentBlockDefinition(def);
  if (errors.length > 0) {
    throw new Error(
      `Invalid ComponentBlockDefinition '${String(def?.id ?? "<unknown>")}':\n  - ${errors.join(
        "\n  - ",
      )}`,
    );
  }
}

export function validateComponentBlockRegistry(
  registry: ReadonlyArray<ComponentBlockDefinition> = REGISTRY,
): ComponentBlockRegistryValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const def of registry) {
    if (def && typeof def.id === "string") {
      if (seenIds.has(def.id)) {
        errors.push(`duplicate block id: ${def.id}`);
      }
      seenIds.add(def.id);
    }
    const perDefErrors = validateComponentBlockDefinition(def);
    for (const e of perDefErrors) errors.push(e);
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateComponentBlockDefinition(
  def: ComponentBlockDefinition,
): ReadonlyArray<string> {
  const errors: string[] = [];
  const id = def?.id ?? "<missing id>";

  if (!ALLOWED_BLOCK_ID_SET.has(def?.id as ComponentBlockId)) {
    errors.push(`${id}: id '${String(def?.id)}' is not in COMPONENT_BLOCK_IDS`);
  }
  if (!ALLOWED_BLOCK_KIND_SET.has(def?.kind as ComponentBlockKind)) {
    errors.push(`${id}: kind '${String(def?.kind)}' is not in COMPONENT_BLOCK_KINDS`);
  }
  if (!isNonEmptyString(def?.label)) {
    errors.push(`${id}: label must be a non-empty string`);
  }
  if (!isNonEmptyString(def?.purpose)) {
    errors.push(`${id}: purpose must be a non-empty string`);
  }
  if (!Array.isArray(def?.allowedIntentTypes) || def.allowedIntentTypes.length === 0) {
    errors.push(`${id}: allowedIntentTypes must be a non-empty array`);
  } else {
    for (const k of def.allowedIntentTypes) {
      if (!ALLOWED_INTENT_KIND_SET.has(k)) {
        errors.push(`${id}: allowedIntentType '${String(k)}' is not allowed`);
      }
    }
  }
  if (!ALLOWED_RISK_TIER_SET.has(def?.maxRiskTier as ComponentBlockRiskTier)) {
    errors.push(`${id}: maxRiskTier '${String(def?.maxRiskTier)}' is not allowed`);
  }
  if (!ALLOWED_SOURCE_REQUIREMENT_SET.has(def?.sourceRequirement as SourceRequirement)) {
    errors.push(
      `${id}: sourceRequirement '${String(def?.sourceRequirement)}' is not allowed`,
    );
  }
  if (!Array.isArray(def?.allowedSlotKeys) || def.allowedSlotKeys.length === 0) {
    errors.push(`${id}: allowedSlotKeys must be a non-empty array`);
  }
  if (!Array.isArray(def?.requiredSlotKeys)) {
    errors.push(`${id}: requiredSlotKeys must be an array`);
  } else {
    const allowedSlotSet = new Set<string>(def.allowedSlotKeys ?? []);
    for (const r of def.requiredSlotKeys) {
      if (!allowedSlotSet.has(r)) {
        errors.push(
          `${id}: requiredSlotKey '${String(r)}' is not in allowedSlotKeys`,
        );
      }
    }
  }
  if (!def?.slotLimits || typeof def.slotLimits !== "object") {
    errors.push(`${id}: slotLimits must be an object`);
  } else {
    const allowedSlotSet = new Set<string>(def.allowedSlotKeys ?? []);
    for (const key of Object.keys(def.slotLimits)) {
      if (!allowedSlotSet.has(key)) {
        errors.push(
          `${id}: slotLimits key '${key}' is not in allowedSlotKeys`,
        );
      }
    }
    // Each requiredSlotKey must have `required: true` in slotLimits.
    if (Array.isArray(def.requiredSlotKeys)) {
      for (const r of def.requiredSlotKeys) {
        const limit = def.slotLimits[r];
        if (!limit || limit.required !== true) {
          errors.push(
            `${id}: requiredSlotKey '${r}' must have slotLimits[${r}].required === true`,
          );
        }
      }
    }
  }
  if (!Array.isArray(def?.dataFieldAllowlist)) {
    errors.push(`${id}: dataFieldAllowlist must be an array`);
  } else if (def.id === "lead_capture") {
    for (const field of def.dataFieldAllowlist) {
      const hit = lowercaseIncludesAny(field, SENSITIVE_DATA_FIELDS);
      if (hit) {
        errors.push(
          `${id}: dataFieldAllowlist must not include the sensitive field '${field}' (matched '${hit}')`,
        );
      }
    }
  }
  if (!Array.isArray(def?.compatibleActionTypes)) {
    errors.push(`${id}: compatibleActionTypes must be an array`);
  }
  if (typeof def?.requiresHumanReview !== "boolean") {
    errors.push(`${id}: requiresHumanReview must be a boolean`);
  }
  if (!Array.isArray(def?.safetyNotes) || def.safetyNotes.length === 0) {
    errors.push(`${id}: safetyNotes must be a non-empty array`);
  } else {
    for (let i = 0; i < def.safetyNotes.length; i++) {
      const note = def.safetyNotes[i]!;
      if (!isNonEmptyString(note)) {
        errors.push(`${id}: safetyNotes[${i}] is empty`);
      }
    }
  }

  // Per-block-id rules.
  if (def?.id === "faq_answer" && def.sourceRequirement !== "registered_knowledge_required") {
    errors.push(
      `${id}: sourceRequirement must be 'registered_knowledge_required'`,
    );
  }
  if (def?.id === "source_citation" && def.sourceRequirement !== "registered_knowledge_required") {
    errors.push(
      `${id}: sourceRequirement must be 'registered_knowledge_required'`,
    );
  }
  if (def?.id === "human_review_notice" && def.requiresHumanReview !== true) {
    errors.push(`${id}: requiresHumanReview must be true`);
  }
  if (def?.id === "fallback_message" && Array.isArray(def.compatibleActionTypes)) {
    if (def.compatibleActionTypes.length > 0) {
      errors.push(`${id}: compatibleActionTypes must be empty`);
    }
  }
  if (def?.id === "external_link_cta") {
    for (const slot of [def.label, def.purpose]) {
      const hit = lowercaseIncludesAny(slot, COMPLETION_CLAIM_PHRASES);
      if (hit) {
        errors.push(
          `${id}: ${
            slot === def.label ? "label" : "purpose"
          } must not claim task completion (matched '${hit}')`,
        );
      }
    }
  }

  // Risk-tier rule from ISS-0 §5.
  if (
    ALLOWED_RISK_TIER_SET.has(def?.maxRiskTier as ComponentBlockRiskTier) &&
    TIERS_REQUIRING_HUMAN_REVIEW.has(def.maxRiskTier) &&
    def.requiresHumanReview !== true
  ) {
    errors.push(
      `${id}: maxRiskTier '${def.maxRiskTier}' is not enabled in v1 unless requiresHumanReview === true`,
    );
  }

  // Raw HTML / CSS / JSX / markdown / template scan over all
  // string-bearing fields surfaced to the renderer or the
  // planner.
  for (const slot of collectStringSlots(def ?? ({} as ComponentBlockDefinition))) {
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

// Tests for the Action registry v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTION_IDS,
  ACTION_KINDS,
  ACTION_RISK_TIERS,
  ARGUMENT_TYPES,
  CONFIRMATION_POLICIES,
  EXECUTION_MODES,
  REVERSIBILITIES,
  SOURCE_REQUIREMENTS,
  assertValidActionDefinition,
  getActionDefinition,
  getActionsForComponentBlock,
  getActionsRequiringHumanReview,
  getActionsRequiringSource,
  getBlockedActions,
  getExecutableActions,
  isActionAllowedForRisk,
  listActionDefinitions,
  validateActionRegistry,
  type ActionDefinition,
  type ActionId,
} from "./actionRegistry";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(process.cwd(), "src", "lib", "cie", "actionRegistry.ts");
const SRC = readFileSync(FILE, "utf-8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

// CoRent marketplace terms that must NOT appear in any action's
// id / label / purpose / dataFieldAllowlist / safetyNotes after
// the 2026-05-07 platform pivot.
const CORENT_MARKETPLACE_TERMS: ReadonlyArray<string> = [
  "rental",
  "deposit",
  "seller store",
  "borrower",
  "return",
  "claim",
  "dispute",
  "logistics",
  "escrow",
  "insurance",
];

function buildValidDef(
  overrides: Partial<ActionDefinition> = {},
): ActionDefinition {
  const base: ActionDefinition = {
    id: "create_lead",
    kind: "capture",
    label: "fixture label",
    purpose: "fixture purpose for testing only",
    riskTier: "T1",
    confirmationPolicy: "explicit_confirm",
    reversibility: "reversible",
    executionMode: "server_prepare_only",
    sourceRequirement: "none",
    requiredArgumentKeys: ["topic"],
    optionalArgumentKeys: [],
    argumentSchema: {
      topic: { type: "string", required: true, maxChars: 80 },
    },
    dataFieldAllowlist: ["topic"],
    compatibleComponentBlockIds: ["lead_capture"],
    logging: {
      required: true,
      eventName: "fixture_action_event",
      includeArgumentKeys: ["topic"],
      redactArgumentKeys: [],
    },
    requiresHumanReview: false,
    safetyNotes: ["fixture safety note"],
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("Action registry — closed vocabularies", () => {
  it("ACTION_IDS lists the 9 expected v1 ids", () => {
    expect([...ACTION_IDS].sort()).toEqual(
      [
        "open_external_link",
        "create_lead",
        "create_contact_request",
        "create_unmet_intent_capture",
        "request_human_review",
        "download_resource",
        "copy_contact_info",
        "start_email_draft",
        "start_booking_request",
      ].sort(),
    );
  });

  it("ACTION_KINDS lists the 6 expected kinds", () => {
    expect([...ACTION_KINDS].sort()).toEqual(
      [
        "navigation",
        "capture",
        "handoff",
        "resource",
        "communication",
        "request",
      ].sort(),
    );
  });

  it("ACTION_RISK_TIERS aligns with ISS-0 (T0–T5)", () => {
    expect([...ACTION_RISK_TIERS]).toEqual(["T0", "T1", "T2", "T3", "T4", "T5"]);
  });

  it("CONFIRMATION_POLICIES is the 5 expected values", () => {
    expect([...CONFIRMATION_POLICIES].sort()).toEqual(
      [
        "none",
        "soft_confirm",
        "explicit_confirm",
        "human_review_required",
        "blocked",
      ].sort(),
    );
  });

  it("REVERSIBILITIES is the 4 expected values", () => {
    expect([...REVERSIBILITIES].sort()).toEqual(
      ["reversible", "partially_reversible", "irreversible", "not_applicable"].sort(),
    );
  });

  it("EXECUTION_MODES is the 5 expected values", () => {
    expect([...EXECUTION_MODES].sort()).toEqual(
      [
        "client_prepare_only",
        "server_prepare_only",
        "human_review_queue",
        "external_navigation_only",
        "blocked",
      ].sort(),
    );
  });

  it("ARGUMENT_TYPES is the 6 expected values", () => {
    expect([...ARGUMENT_TYPES].sort()).toEqual(
      ["string", "email", "phone", "url", "enum", "boolean"].sort(),
    );
  });

  it("SOURCE_REQUIREMENTS is the 4 expected values (re-exported from componentBlocks)", () => {
    expect([...SOURCE_REQUIREMENTS].sort()).toEqual(
      [
        "human_review_required",
        "none",
        "registered_knowledge_or_human_review_required",
        "registered_knowledge_required",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------
// Production registry passes validation
// ---------------------------------------------------------------

describe("listActionDefinitions — production registry", () => {
  it("returns a non-empty array of length 9", () => {
    const defs = listActionDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBe(9);
  });

  it("includes the 9 v1 ids required by the task", () => {
    const ids = listActionDefinitions().map((d) => d.id).sort();
    expect(ids).toEqual([...ACTION_IDS].sort());
  });

  it("validateActionRegistry returns ok:true for the production registry", () => {
    const r = validateActionRegistry();
    expect(r.ok).toBe(true);
  });

  it("ids are unique", () => {
    const ids = listActionDefinitions().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every action has a non-empty label / purpose / safetyNotes", () => {
    for (const def of listActionDefinitions()) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.purpose.trim().length).toBeGreaterThan(0);
      expect(def.safetyNotes.length).toBeGreaterThan(0);
      for (const note of def.safetyNotes) {
        expect(note.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every requiredArgumentKey appears in argumentSchema with required:true", () => {
    for (const def of listActionDefinitions()) {
      for (const r of def.requiredArgumentKeys) {
        expect(def.argumentSchema[r]).toBeTruthy();
        expect(def.argumentSchema[r]?.required).toBe(true);
      }
    }
  });

  it("optionalArgumentKey is never marked required:true in argumentSchema", () => {
    for (const def of listActionDefinitions()) {
      for (const o of def.optionalArgumentKeys) {
        expect(def.argumentSchema[o]?.required).not.toBe(true);
      }
    }
  });

  it("argumentSchema keys are exactly the union of required and optional keys", () => {
    for (const def of listActionDefinitions()) {
      const union = new Set<string>([
        ...def.requiredArgumentKeys,
        ...def.optionalArgumentKeys,
      ]);
      const schemaKeys = new Set<string>(Object.keys(def.argumentSchema));
      expect([...schemaKeys].sort()).toEqual([...union].sort());
    }
  });

  it("every sensitive argument appears in logging.redactArgumentKeys and not in includeArgumentKeys", () => {
    for (const def of listActionDefinitions()) {
      const include = new Set<string>(def.logging.includeArgumentKeys);
      const redact = new Set<string>(def.logging.redactArgumentKeys);
      for (const [k, arg] of Object.entries(def.argumentSchema)) {
        if (arg.sensitive === true) {
          expect(redact.has(k)).toBe(true);
          expect(include.has(k)).toBe(false);
        }
      }
    }
  });

  it("every logging.eventName is snake_case", () => {
    for (const def of listActionDefinitions()) {
      expect(def.logging.eventName).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("every compatibleComponentBlockIds entry is a known block id", () => {
    const KNOWN = new Set<string>([
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
    ]);
    for (const def of listActionDefinitions()) {
      for (const b of def.compatibleComponentBlockIds) {
        expect(KNOWN.has(b)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------
// Per-action-id required posture
// ---------------------------------------------------------------

describe("Action registry — per-action invariants", () => {
  it("request_human_review requires human review", () => {
    const def = getActionDefinition("request_human_review");
    expect(def?.requiresHumanReview).toBe(true);
    expect(def?.executionMode).toBe("human_review_queue");
  });

  it("open_external_link requires registered knowledge and uses external_navigation_only", () => {
    const def = getActionDefinition("open_external_link");
    expect(def?.sourceRequirement).toBe("registered_knowledge_required");
    expect(def?.executionMode).toBe("external_navigation_only");
  });

  it("open_external_link does not assert task completion in label or purpose", () => {
    const def = getActionDefinition("open_external_link");
    expect(def).toBeTruthy();
    if (!def) return;
    const COMPLETION_PHRASES = [
      "task is complete",
      "task is completed",
      "task complete",
      "task completed",
      "task done",
      "marked complete",
      "marked completed",
      "fully complete",
    ];
    for (const phrase of COMPLETION_PHRASES) {
      expect(def.label.toLowerCase().includes(phrase)).toBe(false);
      expect(def.purpose.toLowerCase().includes(phrase)).toBe(false);
    }
  });

  it("download_resource requires registered knowledge", () => {
    const def = getActionDefinition("download_resource");
    expect(def?.sourceRequirement).toBe("registered_knowledge_required");
  });

  it("start_booking_request does not assert a confirmed booking in label or purpose", () => {
    const def = getActionDefinition("start_booking_request");
    expect(def).toBeTruthy();
    if (!def) return;
    const BOOKING_CONFIRMED = [
      "booking confirmed",
      "booking is confirmed",
      "booking complete",
      "booking completed",
      "appointment confirmed",
      "reservation confirmed",
    ];
    for (const phrase of BOOKING_CONFIRMED) {
      expect(def.label.toLowerCase().includes(phrase)).toBe(false);
      expect(def.purpose.toLowerCase().includes(phrase)).toBe(false);
    }
  });

  it("start_booking_request routes through human review queue", () => {
    const def = getActionDefinition("start_booking_request");
    expect(def?.executionMode).toBe("human_review_queue");
    expect(def?.requiresHumanReview).toBe(true);
  });

  it("start_email_draft does not assert an email was sent", () => {
    const def = getActionDefinition("start_email_draft");
    expect(def).toBeTruthy();
    if (!def) return;
    const EMAIL_SENT = [
      "email sent",
      "email is sent",
      "email was sent",
      "email delivered",
      "message sent",
    ];
    for (const phrase of EMAIL_SENT) {
      expect(def.label.toLowerCase().includes(phrase)).toBe(false);
      expect(def.purpose.toLowerCase().includes(phrase)).toBe(false);
    }
  });

  it("create_lead's argumentSchema and dataFieldAllowlist exclude regulated sensitive fields", () => {
    const def = getActionDefinition("create_lead");
    expect(def).toBeTruthy();
    if (!def) return;
    const FORBIDDEN = [
      "ssn",
      "social_security",
      "passport",
      "government_id",
      "national_id",
      "credit_card",
      "card_number",
      "cvv",
      "bank_account",
      "iban",
      "routing_number",
      "deposit",
      "escrow",
      "settlement",
      "insurance",
      "medical",
      "diagnosis",
      "prescription",
      "visa",
      "immigration",
    ];
    for (const key of Object.keys(def.argumentSchema)) {
      const lower = key.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(lower.includes(term)).toBe(false);
      }
    }
    for (const field of def.dataFieldAllowlist) {
      const lower = field.toLowerCase();
      for (const term of FORBIDDEN) {
        expect(lower.includes(term)).toBe(false);
      }
    }
  });

  it("create_lead exposes the bounded contact-only schema and uses explicit confirmation", () => {
    const def = getActionDefinition("create_lead");
    expect(def?.confirmationPolicy).toBe("explicit_confirm");
    expect(def?.executionMode).toBe("server_prepare_only");
    expect(Object.keys(def?.argumentSchema ?? {}).sort()).toEqual(
      [
        "name",
        "email",
        "phone",
        "company",
        "role",
        "message",
        "preferred_contact_method",
      ].sort(),
    );
  });

  it("copy_contact_info is T0 with no autonomous I/O", () => {
    const def = getActionDefinition("copy_contact_info");
    expect(def?.riskTier).toBe("T0");
    expect(def?.executionMode).toBe("client_prepare_only");
    expect(def?.confirmationPolicy).toBe("none");
  });

  it("no v1 action sits at T3, T4, or T5", () => {
    for (const def of listActionDefinitions()) {
      expect(["T3", "T4", "T5"]).not.toContain(def.riskTier);
    }
  });

  it("no v1 action declares executionMode 'blocked'", () => {
    for (const def of listActionDefinitions()) {
      expect(def.executionMode).not.toBe("blocked");
    }
  });
});

// ---------------------------------------------------------------
// validateActionRegistry — drift detection
// ---------------------------------------------------------------

describe("validateActionRegistry — drift detection", () => {
  it("flags duplicate ids", () => {
    const a = buildValidDef();
    const b = buildValidDef();
    const r = validateActionRegistry([a, b]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /duplicate action id: create_lead/.test(e))).toBe(true);
  });

  it("flags an out-of-vocab id / kind / risk tier / confirmation / reversibility / executionMode / sourceRequirement", () => {
    const def = buildValidDef({
      id: "evil_action" as unknown as ActionId,
      kind: "evil_kind" as never,
      riskTier: "T9" as never,
      confirmationPolicy: "evil_confirm" as never,
      reversibility: "evil_reversibility" as never,
      executionMode: "evil_mode" as never,
      sourceRequirement: "evil_source" as never,
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /id 'evil_action'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /kind 'evil_kind'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /riskTier 'T9'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /confirmationPolicy 'evil_confirm'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /reversibility 'evil_reversibility'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /executionMode 'evil_mode'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /sourceRequirement 'evil_source'/.test(e))).toBe(true);
  });

  it("flags a requiredArgumentKey that is not in argumentSchema", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic", "phantom"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /requiredArgumentKey 'phantom' is not in argumentSchema/.test(e)),
    ).toBe(true);
  });

  it("flags a requiredArgumentKey whose schema entry is missing required:true", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "string", maxChars: 80 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /requiredArgumentKey 'topic' must have argumentSchema\['topic'\]\.required === true/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags an optionalArgumentKey that has required:true in schema", () => {
    const def = buildValidDef({
      requiredArgumentKeys: [],
      optionalArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /optionalArgumentKey 'topic' must NOT have argumentSchema\['topic'\]\.required === true/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags an argumentSchema key that is in neither required nor optional", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      optionalArgumentKeys: [],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80 },
        phantom: { type: "string", maxChars: 80 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argumentSchema key 'phantom' must appear in requiredArgumentKeys or optionalArgumentKeys/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags an argument whose key implies a type the declaration mismatches (email)", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["email"],
      argumentSchema: {
        email: { type: "string", required: true, maxChars: 254 },
      },
      logging: {
        required: true,
        eventName: "fixture_action_event",
        includeArgumentKeys: [],
        redactArgumentKeys: [],
      },
      dataFieldAllowlist: ["email"],
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argument 'email' implies type 'email' by its name; declared type 'string' must be 'email'/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags an enum argument with no allowedValues", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "enum", required: true, maxChars: 32 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argument 'topic' \(type 'enum'\) must declare a non-empty allowedValues array/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a non-positive maxChars", () => {
    const def = buildValidDef({
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: -1 },
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argument 'topic' maxChars must be a finite positive integer/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive-field pattern in an argument key", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic", "ssn"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80 },
        ssn: { type: "string", required: true, maxChars: 16 },
      },
      dataFieldAllowlist: ["topic", "ssn"],
      logging: {
        required: true,
        eventName: "fixture_action_event",
        includeArgumentKeys: ["topic"],
        redactArgumentKeys: ["ssn"],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argument key 'ssn' matches a forbidden sensitive-field pattern/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive-field pattern in dataFieldAllowlist", () => {
    const def = buildValidDef({
      dataFieldAllowlist: ["topic", "credit_card"],
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /dataFieldAllowlist must not include the sensitive field 'credit_card'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a T3+ action that is neither blocked nor under human review", () => {
    const def = buildValidDef({
      riskTier: "T3",
      requiresHumanReview: false,
      executionMode: "server_prepare_only",
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /riskTier 'T3' must be either executionMode 'blocked' or requiresHumanReview === true/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it("flags an irreversible action that is not blocked", () => {
    const def = buildValidDef({
      reversibility: "irreversible",
      executionMode: "server_prepare_only",
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /irreversible action must have executionMode 'blocked' in v1/.test(e),
      ),
    ).toBe(true);
  });

  it("flags executionMode 'blocked' without confirmationPolicy 'blocked'", () => {
    const def = buildValidDef({
      executionMode: "blocked",
      confirmationPolicy: "explicit_confirm",
      disabledReason: "Disabled in v1.",
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /executionMode 'blocked' requires confirmationPolicy 'blocked'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags executionMode 'blocked' without a disabledReason", () => {
    const def = buildValidDef({
      executionMode: "blocked",
      confirmationPolicy: "blocked",
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /executionMode 'blocked' requires a non-empty disabledReason/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a non-blocked action that declares disabledReason", () => {
    const def = buildValidDef({
      executionMode: "server_prepare_only",
      disabledReason: "Should not be set on a non-blocked action.",
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /disabledReason is only valid when executionMode === 'blocked'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags executionMode 'human_review_queue' without requiresHumanReview === true", () => {
    const def = buildValidDef({
      executionMode: "human_review_queue",
      requiresHumanReview: false,
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /executionMode 'human_review_queue' requires requiresHumanReview === true/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive argument that is missing from logging.redactArgumentKeys", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80, sensitive: true },
      },
      logging: {
        required: true,
        eventName: "fixture_action_event",
        includeArgumentKeys: [],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitive argument 'topic' must appear in logging\.redactArgumentKeys/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive argument that is in logging.includeArgumentKeys", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80, sensitive: true },
      },
      logging: {
        required: true,
        eventName: "fixture_action_event",
        includeArgumentKeys: ["topic"],
        redactArgumentKeys: ["topic"],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitive argument 'topic' must NOT appear in logging\.includeArgumentKeys/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an argument that appears in BOTH includeArgumentKeys and redactArgumentKeys", () => {
    const def = buildValidDef({
      requiredArgumentKeys: ["topic"],
      argumentSchema: {
        topic: { type: "string", required: true, maxChars: 80 },
      },
      logging: {
        required: true,
        eventName: "fixture_action_event",
        includeArgumentKeys: ["topic"],
        redactArgumentKeys: ["topic"],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /argument 'topic' appears in BOTH includeArgumentKeys and redactArgumentKeys/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a logging.eventName that violates snake_case", () => {
    const def = buildValidDef({
      logging: {
        required: true,
        eventName: "FixtureActionEvent",
        includeArgumentKeys: ["topic"],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /logging\.eventName 'FixtureActionEvent' must match \/\^\[a-z\]\[a-z0-9_\]\*\$\//.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown compatibleComponentBlockId", () => {
    const def = buildValidDef({
      compatibleComponentBlockIds: ["evil_block"] as never,
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /compatibleComponentBlockIds includes unknown block id 'evil_block'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags raw HTML / template fragments in label / purpose / safetyNotes", () => {
    const html = buildValidDef({ purpose: "Visit <b>here</b> for help" });
    const tmpl = buildValidDef({ purpose: "Hello {{name}}, welcome" });
    const md = buildValidDef({
      safetyNotes: ["See [docs](https://example.com) for details"],
    });
    const cssAttr = buildValidDef({ label: 'Heading style="color:red"' });

    for (const tainted of [html, tmpl, md, cssAttr]) {
      const r = validateActionRegistry([tainted]);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(
        r.errors.some((e) =>
          /raw HTML \/ CSS \/ JSX \/ markdown \/ template fragment/.test(e),
        ),
      ).toBe(true);
    }
  });

  it("flags request_human_review variants whose requiresHumanReview is false", () => {
    const def = buildValidDef({
      id: "request_human_review",
      kind: "handoff",
      riskTier: "T2",
      confirmationPolicy: "human_review_required",
      executionMode: "client_prepare_only",
      sourceRequirement: "human_review_required",
      requiresHumanReview: false,
      compatibleComponentBlockIds: ["human_review_notice"],
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /request_human_review: requiresHumanReview must be true/.test(e),
      ),
    ).toBe(true);
  });

  it("flags open_external_link variants with the wrong source requirement", () => {
    const def = buildValidDef({
      id: "open_external_link",
      kind: "navigation",
      confirmationPolicy: "soft_confirm",
      reversibility: "not_applicable",
      executionMode: "external_navigation_only",
      sourceRequirement: "none",
      requiredArgumentKeys: ["url", "label"],
      optionalArgumentKeys: [],
      argumentSchema: {
        url: { type: "url", required: true, maxChars: 2048 },
        label: { type: "string", required: true, maxChars: 60 },
      },
      dataFieldAllowlist: ["url", "label"],
      compatibleComponentBlockIds: ["external_link_cta"],
      logging: {
        required: true,
        eventName: "action_open_external_link",
        includeArgumentKeys: ["label"],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /open_external_link: sourceRequirement must be 'registered_knowledge_required'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags open_external_link variants whose label or purpose claims task completion", () => {
    const def = buildValidDef({
      id: "open_external_link",
      kind: "navigation",
      label: "Open and task completed",
      purpose: "Marked completed externally so the visitor is finished.",
      confirmationPolicy: "soft_confirm",
      reversibility: "not_applicable",
      executionMode: "external_navigation_only",
      sourceRequirement: "registered_knowledge_required",
      requiredArgumentKeys: ["url", "label"],
      optionalArgumentKeys: [],
      argumentSchema: {
        url: { type: "url", required: true, maxChars: 2048 },
        label: { type: "string", required: true, maxChars: 60 },
      },
      dataFieldAllowlist: ["url", "label"],
      compatibleComponentBlockIds: ["external_link_cta"],
      logging: {
        required: true,
        eventName: "action_open_external_link",
        includeArgumentKeys: ["label"],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /open_external_link:.*must not assert task completion/.test(e),
      ),
    ).toBe(true);
  });

  it("flags download_resource variants with the wrong source requirement", () => {
    const def = buildValidDef({
      id: "download_resource",
      kind: "resource",
      confirmationPolicy: "soft_confirm",
      reversibility: "not_applicable",
      executionMode: "external_navigation_only",
      sourceRequirement: "none",
      requiredArgumentKeys: ["resource_id", "title"],
      optionalArgumentKeys: [],
      argumentSchema: {
        resource_id: { type: "string", required: true, maxChars: 120 },
        title: { type: "string", required: true, maxChars: 160 },
      },
      dataFieldAllowlist: ["resource_id", "title"],
      compatibleComponentBlockIds: ["external_link_cta"],
      logging: {
        required: true,
        eventName: "action_download_resource",
        includeArgumentKeys: ["resource_id"],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /download_resource: sourceRequirement must be 'registered_knowledge_required'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags start_booking_request variants whose label or purpose claims a confirmed booking", () => {
    const def = buildValidDef({
      id: "start_booking_request",
      kind: "request",
      label: "Booking confirmed",
      purpose: "Send a booking request and reservation confirmed.",
      riskTier: "T2",
      confirmationPolicy: "explicit_confirm",
      reversibility: "reversible",
      executionMode: "human_review_queue",
      sourceRequirement: "human_review_required",
      requiresHumanReview: true,
      requiredArgumentKeys: ["service_label"],
      optionalArgumentKeys: [],
      argumentSchema: {
        service_label: { type: "string", required: true, maxChars: 120 },
      },
      dataFieldAllowlist: ["service_label"],
      compatibleComponentBlockIds: ["lead_capture"],
      logging: {
        required: true,
        eventName: "action_start_booking_request",
        includeArgumentKeys: ["service_label"],
        redactArgumentKeys: [],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /start_booking_request:.*must not assert a confirmed booking/.test(e),
      ),
    ).toBe(true);
  });

  it("flags start_email_draft variants whose label or purpose claims an email was sent", () => {
    const def = buildValidDef({
      id: "start_email_draft",
      kind: "communication",
      label: "Email sent",
      purpose: "Email was sent to the recipient on behalf of the visitor.",
      riskTier: "T2",
      confirmationPolicy: "explicit_confirm",
      executionMode: "client_prepare_only",
      sourceRequirement: "none",
      requiredArgumentKeys: ["to"],
      optionalArgumentKeys: [],
      argumentSchema: {
        to: { type: "email", required: true, maxChars: 254, sensitive: true },
      },
      dataFieldAllowlist: ["to"],
      compatibleComponentBlockIds: ["lead_capture"],
      logging: {
        required: true,
        eventName: "action_start_email_draft",
        includeArgumentKeys: [],
        redactArgumentKeys: ["to"],
      },
    });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /start_email_draft:.*must not assert an email was sent/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty safetyNotes array", () => {
    const def = buildValidDef({ safetyNotes: [] });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /safetyNotes must be a non-empty array/.test(e)),
    ).toBe(true);
  });

  it("flags an empty label / purpose", () => {
    const def = buildValidDef({ label: "  ", purpose: "" });
    const r = validateActionRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /label must be a non-empty string/.test(e))).toBe(true);
    expect(r.errors.some((e) => /purpose must be a non-empty string/.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------
// assertValidActionDefinition (throwing variant)
// ---------------------------------------------------------------

describe("assertValidActionDefinition", () => {
  it("does not throw for a valid definition", () => {
    expect(() => assertValidActionDefinition(buildValidDef())).not.toThrow();
  });

  it("throws for a definition with an empty label", () => {
    expect(() =>
      assertValidActionDefinition(buildValidDef({ label: "" })),
    ).toThrow(/label must be a non-empty string/);
  });

  it("throws for a sensitive argument missing from redactArgumentKeys", () => {
    expect(() =>
      assertValidActionDefinition(
        buildValidDef({
          requiredArgumentKeys: ["topic"],
          argumentSchema: {
            topic: {
              type: "string",
              required: true,
              maxChars: 80,
              sensitive: true,
            },
          },
          logging: {
            required: true,
            eventName: "fixture_action_event",
            includeArgumentKeys: [],
            redactArgumentKeys: [],
          },
        }),
      ),
    ).toThrow(/sensitive argument 'topic' must appear in logging\.redactArgumentKeys/);
  });
});

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

describe("getActionDefinition", () => {
  it("returns the definition by id", () => {
    const def = getActionDefinition("create_lead");
    expect(def?.id).toBe("create_lead");
  });

  it("returns null for an unknown id", () => {
    expect(getActionDefinition("nope")).toBeNull();
  });

  it("returns null for empty / non-string id", () => {
    expect(getActionDefinition("")).toBeNull();
    expect(getActionDefinition(undefined as unknown as string)).toBeNull();
    expect(getActionDefinition(null as unknown as string)).toBeNull();
    expect(getActionDefinition(123 as unknown as string)).toBeNull();
  });
});

describe("isActionAllowedForRisk", () => {
  it("returns true when the action's tier is at or below the host ceiling", () => {
    const lead = getActionDefinition("create_lead")!;
    // create_lead is T1.
    expect(isActionAllowedForRisk(lead, "T1")).toBe(true);
    expect(isActionAllowedForRisk(lead, "T2")).toBe(true);
    expect(isActionAllowedForRisk(lead, "T5")).toBe(true);
  });

  it("returns false when the action's tier exceeds the host ceiling", () => {
    const booking = getActionDefinition("start_booking_request")!;
    // start_booking_request is T2.
    expect(isActionAllowedForRisk(booking, "T0")).toBe(false);
    expect(isActionAllowedForRisk(booking, "T1")).toBe(false);
    expect(isActionAllowedForRisk(booking, "T2")).toBe(true);
  });

  it("returns false for an out-of-vocab risk tier", () => {
    const lead = getActionDefinition("create_lead")!;
    expect(isActionAllowedForRisk(lead, "T9" as never)).toBe(false);
  });
});

describe("getActionsForComponentBlock", () => {
  it("returns only actions whose compatibleComponentBlockIds include the block", () => {
    const matches = getActionsForComponentBlock("lead_capture");
    expect(matches.length).toBeGreaterThan(0);
    for (const def of matches) {
      expect(def.compatibleComponentBlockIds.includes("lead_capture")).toBe(true);
    }
    const ids = matches.map((d) => d.id);
    expect(ids).toContain("create_lead");
  });

  it("returns [] for an unknown block id", () => {
    expect(getActionsForComponentBlock("nope")).toEqual([]);
  });

  it("filters by riskTier (only actions whose riskTier ≤ the requested ceiling)", () => {
    // riskTier: "T1" excludes T2 actions like start_booking_request.
    const t1 = getActionsForComponentBlock("lead_capture", { riskTier: "T1" });
    for (const def of t1) {
      expect(isActionAllowedForRisk(def, "T1")).toBe(true);
    }
    expect(t1.map((d) => d.id)).toContain("create_lead");
    expect(t1.map((d) => d.id)).not.toContain("start_booking_request");
    expect(t1.map((d) => d.id)).not.toContain("start_email_draft");
  });

  it("filters by requiresHumanReview", () => {
    const reviewers = getActionsForComponentBlock("lead_capture", {
      requiresHumanReview: true,
    });
    for (const def of reviewers) {
      expect(def.requiresHumanReview).toBe(true);
    }
    expect(reviewers.map((d) => d.id)).toContain("start_booking_request");
  });

  it("filters by executionMode", () => {
    const queued = getActionsForComponentBlock("lead_capture", {
      executionMode: "human_review_queue",
    });
    for (const def of queued) {
      expect(def.executionMode).toBe("human_review_queue");
    }
    expect(queued.map((d) => d.id)).toContain("start_booking_request");
  });
});

describe("getActionsRequiringHumanReview", () => {
  it("returns only actions whose requiresHumanReview is true", () => {
    const actions = getActionsRequiringHumanReview();
    expect(actions.length).toBeGreaterThan(0);
    for (const def of actions) {
      expect(def.requiresHumanReview).toBe(true);
    }
    const ids = actions.map((d) => d.id).sort();
    expect(ids).toEqual(["request_human_review", "start_booking_request"].sort());
  });
});

describe("getActionsRequiringSource", () => {
  it("returns only actions whose sourceRequirement is not 'none'", () => {
    const actions = getActionsRequiringSource();
    expect(actions.length).toBeGreaterThan(0);
    for (const def of actions) {
      expect(def.sourceRequirement).not.toBe("none");
    }
    const ids = actions.map((d) => d.id);
    expect(ids).toContain("open_external_link");
    expect(ids).toContain("download_resource");
    expect(ids).toContain("copy_contact_info");
    expect(ids).toContain("request_human_review");
    expect(ids).toContain("start_booking_request");
  });
});

describe("getBlockedActions", () => {
  it("returns [] for the v1 production registry (no blocked actions)", () => {
    expect(getBlockedActions()).toEqual([]);
  });
});

describe("getExecutableActions", () => {
  it("returns only actions whose executionMode is client/server-prepare or external-navigation", () => {
    const actions = getExecutableActions();
    expect(actions.length).toBeGreaterThan(0);
    const EXECUTABLE = new Set([
      "client_prepare_only",
      "server_prepare_only",
      "external_navigation_only",
    ]);
    for (const def of actions) {
      expect(EXECUTABLE.has(def.executionMode)).toBe(true);
    }
    const ids = actions.map((d) => d.id);
    expect(ids).not.toContain("request_human_review");
    expect(ids).not.toContain("start_booking_request");
    expect(ids).toContain("create_lead");
    expect(ids).toContain("open_external_link");
    expect(ids).toContain("copy_contact_info");
  });
});

// ---------------------------------------------------------------
// Platform terminology + CoRent residue scan
// ---------------------------------------------------------------

describe("Action registry — platform terminology + no CoRent residue", () => {
  it("no action id / label / purpose / safetyNotes mention CoRent marketplace terms", () => {
    for (const def of listActionDefinitions()) {
      const surfaces: ReadonlyArray<{ label: string; value: string }> = [
        { label: "id", value: def.id },
        { label: "label", value: def.label },
        { label: "purpose", value: def.purpose },
        ...def.safetyNotes.map((note, i) => ({
          label: `safetyNotes[${i}]`,
          value: note,
        })),
      ];
      for (const surface of surfaces) {
        const lower = surface.value.toLowerCase();
        for (const term of CORENT_MARKETPLACE_TERMS) {
          if (lower.includes(term)) {
            throw new Error(
              `${def.id}.${surface.label} mentions CoRent marketplace term '${term}': ${surface.value}`,
            );
          }
        }
      }
    }
  });

  it("no action dataFieldAllowlist mentions CoRent marketplace terms", () => {
    for (const def of listActionDefinitions()) {
      for (const field of def.dataFieldAllowlist) {
        const lower = field.toLowerCase();
        for (const term of CORENT_MARKETPLACE_TERMS) {
          expect(lower.includes(term)).toBe(false);
        }
      }
    }
  });

  it("no action argumentSchema key mentions CoRent marketplace terms", () => {
    for (const def of listActionDefinitions()) {
      for (const key of Object.keys(def.argumentSchema)) {
        const lower = key.toLowerCase();
        for (const term of CORENT_MARKETPLACE_TERMS) {
          expect(lower.includes(term)).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------
// Import boundary + I/O surface
// ---------------------------------------------------------------

describe("Action registry — import boundary", () => {
  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import any LLM provider / runtime / mock invoker", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai/i);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
    expect(IMPORT_BLOB).not.toMatch(/llmAdapter/);
    expect(IMPORT_BLOB).not.toMatch(/\binvoke\b/);
    expect(IMPORT_BLOB).not.toMatch(/mockAdapter/);
  });

  it("does NOT import any Supabase client / SSR / persistence module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does NOT import payment / claim / trust / handoff-service / notification / feedback / wanted-write modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["'][^"']*\/handoff(?:Service|\/)/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
  });

  it("does NOT import React (this is a pure data primitive, not UI)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react["']/);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react\//);
    expect(IMPORT_BLOB).not.toMatch(/jsx-runtime/);
  });

  it("does NOT call any I/O surface (process.env / fetch / XMLHttpRequest / fs)", () => {
    expect(RUNTIME_SRC).not.toMatch(/process\.env/);
    expect(RUNTIME_SRC).not.toMatch(/\bfetch\(/);
    expect(RUNTIME_SRC).not.toMatch(/\bXMLHttpRequest\b/);
    expect(RUNTIME_SRC).not.toMatch(/readFile|writeFile|require\(/);
  });

  it("imports only from ./componentBlocks and ./interactionIntent", () => {
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/componentBlocks["']/);
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/interactionIntent["']/);
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(2);
  });
});

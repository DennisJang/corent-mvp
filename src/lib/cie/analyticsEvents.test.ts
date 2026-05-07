// Tests for the AnalyticsEvent taxonomy v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTION_IDS } from "./actionRegistry";
import { COMPONENT_BLOCK_IDS } from "./componentBlocks";
import { GUARDRAIL_TRIGGER_KINDS } from "./guardrailPolicy";
import {
  ANALYTICS_ACTORS,
  ANALYTICS_EVENT_CATEGORIES,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENT_RISK_TIERS,
  ANALYTICS_PAYLOAD_FIELD_TYPES,
  ANALYTICS_PAYLOAD_SENSITIVITIES,
  ANALYTICS_RETENTION_CLASSES,
  REQUIRED_CONTEXT_KEYS,
  assertValidAnalyticsEventDefinition,
  getAnalyticsEventDefinition,
  getEventsByActor,
  getEventsByCategory,
  getEventsByRiskTier,
  getEventsRelatedToAction,
  getEventsRelatedToComponentBlock,
  getEventsRelatedToGuardrailTrigger,
  getEventsRequiringRedaction,
  getEventsWithSensitivePayload,
  listAnalyticsEventDefinitions,
  validateAnalyticsEventTaxonomy,
  type AnalyticsEventDefinition,
  type AnalyticsEventName,
} from "./analyticsEvents";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(process.cwd(), "src", "lib", "cie", "analyticsEvents.ts");
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

// CoRent marketplace terms that must NOT appear anywhere in the
// taxonomy except in fields that intentionally hold blocked /
// risk-policy substrings (the validator's PII banlist itself).
const STRICT_CORENT_TERMS: ReadonlyArray<string> = [
  "rental",
  "seller store",
  "borrower",
  "logistics",
  "return",
  "claim",
  "dispute",
  "corent",
];

function buildValidDef(
  overrides: Partial<AnalyticsEventDefinition> = {},
): AnalyticsEventDefinition {
  const base: AnalyticsEventDefinition = {
    name: "interaction_started",
    category: "interaction",
    actor: "system",
    purpose: "Fixture purpose for analytics event tests.",
    riskTier: "T0",
    payloadSensitivity: "public",
    retentionClass: "short_lived",
    requiredContextKeys: [...REQUIRED_CONTEXT_KEYS],
    optionalContextKeys: [],
    payloadSchema: {
      entry_path: { type: "string", maxChars: 120 },
    },
    redactPayloadKeys: [],
    relatedComponentBlockIds: [],
    relatedActionIds: [],
    relatedGuardrailTriggerKinds: [],
    safetyNotes: ["fixture safety note"],
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("AnalyticsEvent taxonomy — closed vocabularies", () => {
  it("ANALYTICS_EVENT_NAMES lists the 16 expected event names", () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("ANALYTICS_EVENT_CATEGORIES lists the 9 expected values", () => {
    expect([...ANALYTICS_EVENT_CATEGORIES].sort()).toEqual(
      [
        "interaction",
        "intent",
        "knowledge",
        "component",
        "action",
        "guardrail",
        "review",
        "fallback",
        "feedback",
      ].sort(),
    );
  });

  it("ANALYTICS_EVENT_RISK_TIERS aligns with T0..T5", () => {
    expect([...ANALYTICS_EVENT_RISK_TIERS]).toEqual([
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
    ]);
  });

  it("ANALYTICS_ACTORS lists visitor / system / human_reviewer", () => {
    expect([...ANALYTICS_ACTORS].sort()).toEqual(
      ["visitor", "system", "human_reviewer"].sort(),
    );
  });

  it("ANALYTICS_PAYLOAD_SENSITIVITIES lists the 3 expected values", () => {
    expect([...ANALYTICS_PAYLOAD_SENSITIVITIES].sort()).toEqual(
      ["public", "internal", "sensitive_redacted"].sort(),
    );
  });

  it("ANALYTICS_RETENTION_CLASSES lists the 3 expected values", () => {
    expect([...ANALYTICS_RETENTION_CLASSES].sort()).toEqual(
      ["short_lived", "operational", "audit_required"].sort(),
    );
  });

  it("ANALYTICS_PAYLOAD_FIELD_TYPES lists the 4 expected values", () => {
    expect([...ANALYTICS_PAYLOAD_FIELD_TYPES].sort()).toEqual(
      ["string", "number", "boolean", "enum"].sort(),
    );
  });

  it("REQUIRED_CONTEXT_KEYS lists the 5 platform-required keys", () => {
    expect([...REQUIRED_CONTEXT_KEYS].sort()).toEqual(
      ["session_id", "interaction_id", "site_id", "timestamp", "event_name"].sort(),
    );
  });
});

// ---------------------------------------------------------------
// Production taxonomy passes validation
// ---------------------------------------------------------------

describe("listAnalyticsEventDefinitions — production taxonomy", () => {
  it("returns the 16 v1 event definitions", () => {
    const defs = listAnalyticsEventDefinitions();
    expect(defs.length).toBe(16);
    expect(defs.map((d) => d.name).sort()).toEqual(
      [...ANALYTICS_EVENT_NAMES].sort(),
    );
  });

  it("validateAnalyticsEventTaxonomy returns ok:true", () => {
    expect(validateAnalyticsEventTaxonomy().ok).toBe(true);
  });

  it("event names are unique", () => {
    const names = listAnalyticsEventDefinitions().map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every event includes the 5 platform-required context keys", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      const ctx = new Set(def.requiredContextKeys);
      for (const k of REQUIRED_CONTEXT_KEYS) {
        expect(ctx.has(k)).toBe(true);
      }
    }
  });

  it("required and optional context keys never overlap", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      const required = new Set(def.requiredContextKeys);
      for (const k of def.optionalContextKeys) {
        expect(required.has(k)).toBe(false);
      }
    }
  });

  it("every sensitive payload field is in redactPayloadKeys", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      const redact = new Set(def.redactPayloadKeys);
      for (const [k, schema] of Object.entries(def.payloadSchema)) {
        if (schema.sensitive === true) {
          expect(redact.has(k)).toBe(true);
        }
      }
    }
  });

  it("redactPayloadKeys is always a subset of payloadSchema keys", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      const schemaKeys = new Set(Object.keys(def.payloadSchema));
      for (const k of def.redactPayloadKeys) {
        expect(schemaKeys.has(k)).toBe(true);
      }
    }
  });

  it("relatedComponentBlockIds always reference known ComponentBlock ids", () => {
    const known = new Set<string>(COMPONENT_BLOCK_IDS);
    for (const def of listAnalyticsEventDefinitions()) {
      for (const b of def.relatedComponentBlockIds) {
        expect(known.has(b)).toBe(true);
      }
    }
  });

  it("relatedActionIds always reference known Action ids", () => {
    const known = new Set<string>(ACTION_IDS);
    for (const def of listAnalyticsEventDefinitions()) {
      for (const a of def.relatedActionIds) {
        expect(known.has(a)).toBe(true);
      }
    }
  });

  it("relatedGuardrailTriggerKinds always reference known guardrail trigger kinds", () => {
    const known = new Set<string>(GUARDRAIL_TRIGGER_KINDS);
    for (const def of listAnalyticsEventDefinitions()) {
      for (const t of def.relatedGuardrailTriggerKinds) {
        expect(known.has(t)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------
// Per-event posture
// ---------------------------------------------------------------

describe("AnalyticsEvent taxonomy — per-event posture", () => {
  it("interaction_started is T0 / public / short_lived", () => {
    const def = getAnalyticsEventDefinition("interaction_started");
    expect(def?.riskTier).toBe("T0");
    expect(def?.payloadSensitivity).toBe("public");
    expect(def?.retentionClass).toBe("short_lived");
  });

  it("guardrail_decision is T2 with audit-required retention and the full trigger-kind link", () => {
    const def = getAnalyticsEventDefinition("guardrail_decision");
    expect(def?.riskTier).toBe("T2");
    expect(def?.retentionClass).toBe("audit_required");
    expect(def?.relatedGuardrailTriggerKinds.length).toBe(GUARDRAIL_TRIGGER_KINDS.length);
  });

  it("human_review_requested is T2 with audit-required retention", () => {
    const def = getAnalyticsEventDefinition("human_review_requested");
    expect(def?.riskTier).toBe("T2");
    expect(def?.retentionClass).toBe("audit_required");
  });

  it("component_block_presented links to every known block id", () => {
    const def = getAnalyticsEventDefinition("component_block_presented");
    expect(def?.relatedComponentBlockIds.length).toBe(COMPONENT_BLOCK_IDS.length);
  });

  it("action_presented links to every known action id", () => {
    const def = getAnalyticsEventDefinition("action_presented");
    expect(def?.relatedActionIds.length).toBe(ACTION_IDS.length);
  });

  it("feedback_submitted is sensitive_redacted with feedback_text in redactPayloadKeys", () => {
    const def = getAnalyticsEventDefinition("feedback_submitted");
    expect(def?.payloadSensitivity).toBe("sensitive_redacted");
    expect(def?.redactPayloadKeys).toContain("feedback_text");
    expect(def?.payloadSchema["feedback_text"]?.sensitive).toBe(true);
    expect(def?.payloadSchema["feedback_text"]?.maxChars).toBeLessThanOrEqual(500);
  });

  it("knowledge_source_used does not declare any full-content payload key", () => {
    const def = getAnalyticsEventDefinition("knowledge_source_used");
    const keys = Object.keys(def?.payloadSchema ?? {});
    for (const banned of [
      "content",
      "full_content",
      "raw_content",
      "source_text",
      "document_text",
      "body",
    ]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("guardrail_decision does not declare any raw-input payload key", () => {
    const def = getAnalyticsEventDefinition("guardrail_decision");
    const keys = Object.keys(def?.payloadSchema ?? {});
    for (const banned of [
      "raw_input",
      "raw_text",
      "user_text",
      "user_input",
      "prompt",
      "prompt_text",
      "original_text",
    ]) {
      expect(keys).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------

describe("validateAnalyticsEventTaxonomy — drift detection", () => {
  it("flags duplicate event names", () => {
    const a = buildValidDef();
    const b = buildValidDef();
    const r = validateAnalyticsEventTaxonomy([a, b]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /duplicate analytics event name: interaction_started/.test(e)),
    ).toBe(true);
  });

  it("flags out-of-vocab name / category / actor / risk tier / sensitivity / retention", () => {
    const def = buildValidDef({
      name: "evil_event" as AnalyticsEventName,
      category: "evil_category" as never,
      actor: "evil_actor" as never,
      riskTier: "T9" as never,
      payloadSensitivity: "evil_sensitivity" as never,
      retentionClass: "evil_retention" as never,
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /name 'evil_event'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /category 'evil_category'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /actor 'evil_actor'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /riskTier 'T9'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /payloadSensitivity 'evil_sensitivity'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /retentionClass 'evil_retention'/.test(e))).toBe(true);
  });

  it("flags a missing required context key", () => {
    const def = buildValidDef({
      requiredContextKeys: ["session_id", "interaction_id", "site_id", "timestamp"],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /missing required context key 'event_name'/.test(e)),
    ).toBe(true);
  });

  it("flags overlap between requiredContextKeys and optionalContextKeys", () => {
    const def = buildValidDef({
      optionalContextKeys: ["session_id"],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /context key 'session_id' appears in BOTH requiredContextKeys and optionalContextKeys/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive payload field missing from redactPayloadKeys", () => {
    const def = buildValidDef({
      payloadSchema: {
        entry_path: {
          type: "string",
          maxChars: 120,
          sensitive: true,
        },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitive payload field 'entry_path' must appear in redactPayloadKeys/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a redactPayloadKey that is not in payloadSchema", () => {
    const def = buildValidDef({
      redactPayloadKeys: ["ghost_field"],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /redactPayloadKeys: 'ghost_field' is not in payloadSchema/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a PII payload key (token-level)", () => {
    const def = buildValidDef({
      payloadSchema: {
        entry_path: { type: "string", maxChars: 120 },
        email: { type: "string", maxChars: 254 },
      },
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /payload key 'email' matches a forbidden PII token 'email'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a multi-token PII payload key like 'credit_card'", () => {
    const def = buildValidDef({
      payloadSchema: {
        entry_path: { type: "string", maxChars: 120 },
        credit_card: { type: "string", maxChars: 32 },
      },
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /payload key 'credit_card' matches a forbidden PII token 'credit_card'/.test(e),
      ),
    ).toBe(true);
  });

  it("does NOT false-positive on the legitimate context key 'event_name'", () => {
    const r = validateAnalyticsEventTaxonomy();
    expect(r.ok).toBe(true);
  });

  it("flags a browser-tracking payload key (cookie / fingerprint / user_agent)", () => {
    const def = buildValidDef({
      payloadSchema: {
        cookie_id: { type: "string", maxChars: 80 },
      },
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /payload key 'cookie_id' matches a forbidden browser-tracking token 'cookie'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an enum payload field with no allowedValues", () => {
    const def = buildValidDef({
      payloadSchema: {
        entry_path: { type: "string", maxChars: 120 },
        rating: { type: "enum", maxChars: 16 },
      },
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /payloadSchema\['rating'\]: enum field must declare a non-empty allowedValues array/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a non-positive maxChars on a payload field", () => {
    const def = buildValidDef({
      payloadSchema: {
        entry_path: { type: "string", maxChars: -1 },
      },
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /maxChars must be a finite positive integer/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown relatedComponentBlockId / relatedActionId / relatedGuardrailTriggerKind", () => {
    const def = buildValidDef({
      relatedComponentBlockIds: ["evil_block"],
      relatedActionIds: ["evil_action"],
      relatedGuardrailTriggerKinds: ["evil_kind"],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /relatedComponentBlockIds: 'evil_block' is not a known ComponentBlock id/.test(e),
      ),
    ).toBe(true);
    expect(
      r.errors.some((e) =>
        /relatedActionIds: 'evil_action' is not a known Action registry id/.test(e),
      ),
    ).toBe(true);
    expect(
      r.errors.some((e) =>
        /relatedGuardrailTriggerKinds: 'evil_kind' is not a known guardrail trigger kind/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty safetyNotes array", () => {
    const def = buildValidDef({ safetyNotes: [] });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /safetyNotes: must declare at least one note/.test(e)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Per-event contracts
// ---------------------------------------------------------------

describe("validateAnalyticsEventTaxonomy — per-event contracts", () => {
  it("flags interaction_completed asserting purchase / payment / booking / legal in purpose", () => {
    for (const phrase of [
      "Purchase confirmed and the visitor was charged.",
      "Booking confirmed for the requested time slot.",
      "Payment received and the deal closed successfully.",
      "Legal decision was rendered by the platform.",
      "Guaranteed conversion via the platform.",
    ]) {
      const def = buildValidDef({
        name: "interaction_completed",
        category: "interaction",
        purpose: phrase,
        payloadSchema: {
          terminal_state: {
            type: "enum",
            required: true,
            allowedValues: ["handed_off"],
            maxChars: 32,
          },
        },
        redactPayloadKeys: [],
      });
      const r = validateAnalyticsEventTaxonomy([def]);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(
        r.errors.some((e) =>
          /interaction_completed\.purpose: must not assert purchase \/ payment \/ booking \/ reservation \/ legal decision \/ guaranteed conversion/.test(e),
        ),
      ).toBe(true);
    }
  });

  it("flags action_prepared asserting execution in purpose", () => {
    const def = buildValidDef({
      name: "action_prepared",
      category: "action",
      purpose: "The action executed successfully on behalf of the visitor.",
      payloadSchema: {
        action_id: { type: "string", required: true, maxChars: 80 },
        preparation_kind: {
          type: "enum",
          required: true,
          allowedValues: ["client_prepare"],
          maxChars: 32,
        },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /action_prepared\.purpose: must not assert action execution/.test(e),
      ),
    ).toBe(true);
  });

  it("flags action_confirmed asserting irreversible execution in purpose", () => {
    const def = buildValidDef({
      name: "action_confirmed",
      category: "action",
      actor: "visitor",
      purpose: "The action was irreversibly completed when the visitor clicked confirm.",
      payloadSchema: {
        action_id: { type: "string", required: true, maxChars: 80 },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /action_confirmed\.purpose: must not assert irreversible execution/.test(e),
      ),
    ).toBe(true);
  });

  it("flags knowledge_source_used declaring a 'content' payload key", () => {
    const def = buildValidDef({
      name: "knowledge_source_used",
      category: "knowledge",
      payloadSchema: {
        source_id: { type: "string", required: true, maxChars: 120 },
        content: { type: "string", maxChars: 2000 },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /knowledge_source_used: payload key 'content': knowledge_source_used must not store full source content/.test(e),
      ),
    ).toBe(true);
  });

  it("flags guardrail_decision declaring a 'raw_input' payload key", () => {
    const def = buildValidDef({
      name: "guardrail_decision",
      category: "guardrail",
      payloadSchema: {
        trigger_kind: { type: "string", required: true, maxChars: 80 },
        raw_input: { type: "string", maxChars: 2000 },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /guardrail_decision: payload key 'raw_input': guardrail_decision must not store raw unsafe input verbatim/.test(e),
      ),
    ).toBe(true);
  });

  it("flags feedback_submitted with a non-sensitive free-form text field", () => {
    const def = buildValidDef({
      name: "feedback_submitted",
      category: "feedback",
      actor: "visitor",
      payloadSensitivity: "sensitive_redacted",
      retentionClass: "audit_required",
      payloadSchema: {
        rating_band: {
          type: "enum",
          required: true,
          allowedValues: ["positive", "neutral", "negative"],
          maxChars: 16,
        },
        feedback_text: { type: "string", maxChars: 500 },
      },
      redactPayloadKeys: [],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /feedback_submitted: free-form string 'feedback_text' must be sensitive: true/.test(e),
      ),
    ).toBe(true);
  });

  it("flags feedback_submitted with feedback_text exceeding the 500-char cap", () => {
    const def = buildValidDef({
      name: "feedback_submitted",
      category: "feedback",
      actor: "visitor",
      payloadSensitivity: "sensitive_redacted",
      retentionClass: "audit_required",
      payloadSchema: {
        rating_band: {
          type: "enum",
          required: true,
          allowedValues: ["positive", "neutral", "negative"],
          maxChars: 16,
        },
        feedback_text: { type: "string", sensitive: true, maxChars: 1000 },
      },
      redactPayloadKeys: ["feedback_text"],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /feedback_submitted: free-form string 'feedback_text' must cap maxChars at <= 500/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Visual-implementation banlist + raw template fragments
// ---------------------------------------------------------------

describe("validateAnalyticsEventTaxonomy — visual / template banlists", () => {
  it("rejects a hex color in an event purpose", () => {
    const def = buildValidDef({
      purpose: "Render brand color #ff5733 here.",
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(hex color\)/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects px / rem / ms units in safety notes", () => {
    const def = buildValidDef({
      safetyNotes: ["Animation duration 300ms is fine."],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(css unit/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a font-family name in event purpose", () => {
    const def = buildValidDef({
      purpose: "Render in Helvetica throughout the page.",
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(common font-family name\)/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects raw HTML / template fragments in safety notes", () => {
    const def = buildValidDef({
      safetyNotes: ["See <b>here</b> for details."],
    });
    const r = validateAnalyticsEventTaxonomy([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /raw HTML \/ CSS \/ JSX \/ markdown \/ template fragment/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// assertValidAnalyticsEventDefinition (throwing variant)
// ---------------------------------------------------------------

describe("assertValidAnalyticsEventDefinition", () => {
  it("does not throw for a valid fixture", () => {
    expect(() => assertValidAnalyticsEventDefinition(buildValidDef())).not.toThrow();
  });

  it("throws for a definition with an empty purpose", () => {
    expect(() =>
      assertValidAnalyticsEventDefinition(buildValidDef({ purpose: "" })),
    ).toThrow(/purpose:.*non-empty/);
  });

  it("throws for a PII payload key", () => {
    expect(() =>
      assertValidAnalyticsEventDefinition(
        buildValidDef({
          payloadSchema: {
            entry_path: { type: "string", maxChars: 120 },
            phone: { type: "string", maxChars: 32 },
          },
        }),
      ),
    ).toThrow(/payload key 'phone' matches a forbidden PII token/);
  });
});

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

describe("getAnalyticsEventDefinition", () => {
  it("returns the definition by name", () => {
    expect(getAnalyticsEventDefinition("intent_detected")?.name).toBe(
      "intent_detected",
    );
  });

  it("returns null for unknown / non-string", () => {
    expect(getAnalyticsEventDefinition("nope")).toBeNull();
    expect(getAnalyticsEventDefinition("")).toBeNull();
    expect(getAnalyticsEventDefinition(undefined as unknown as string)).toBeNull();
  });
});

describe("getEventsByCategory", () => {
  it("returns only events whose category matches", () => {
    const action = getEventsByCategory("action");
    expect(action.length).toBeGreaterThan(0);
    for (const e of action) {
      expect(e.category).toBe("action");
    }
    expect(action.map((e) => e.name)).toContain("action_presented");
    expect(action.map((e) => e.name)).toContain("action_confirmed");
  });

  it("returns [] for an out-of-vocab category", () => {
    expect(getEventsByCategory("ghost")).toEqual([]);
  });
});

describe("getEventsByActor", () => {
  it("returns events for the visitor actor", () => {
    const visitor = getEventsByActor("visitor");
    for (const e of visitor) {
      expect(e.actor).toBe("visitor");
    }
    expect(visitor.map((e) => e.name)).toContain("action_confirmed");
    expect(visitor.map((e) => e.name)).toContain("feedback_submitted");
  });

  it("returns [] for an out-of-vocab actor", () => {
    expect(getEventsByActor("ghost")).toEqual([]);
  });
});

describe("getEventsByRiskTier", () => {
  it("returns events at a specific risk tier", () => {
    const t2 = getEventsByRiskTier("T2");
    for (const e of t2) {
      expect(e.riskTier).toBe("T2");
    }
    expect(t2.map((e) => e.name)).toContain("guardrail_decision");
    expect(t2.map((e) => e.name)).toContain("human_review_requested");
  });

  it("returns [] for an out-of-vocab tier", () => {
    expect(getEventsByRiskTier("T9")).toEqual([]);
  });
});

describe("getEventsWithSensitivePayload / getEventsRequiringRedaction", () => {
  it("getEventsWithSensitivePayload includes feedback_submitted (the only v1 event with a sensitive field)", () => {
    const sensitive = getEventsWithSensitivePayload();
    expect(sensitive.map((e) => e.name)).toContain("feedback_submitted");
    for (const e of sensitive) {
      const hasSensitive = Object.values(e.payloadSchema).some(
        (s) => s.sensitive === true,
      );
      expect(hasSensitive).toBe(true);
    }
  });

  it("getEventsRequiringRedaction includes feedback_submitted", () => {
    const redaction = getEventsRequiringRedaction();
    expect(redaction.map((e) => e.name)).toContain("feedback_submitted");
    for (const e of redaction) {
      expect(e.redactPayloadKeys.length).toBeGreaterThan(0);
    }
  });
});

describe("getEventsRelatedToComponentBlock / Action / GuardrailTrigger", () => {
  it("returns events related to the fallback_message block", () => {
    const events = getEventsRelatedToComponentBlock("fallback_message");
    expect(events.map((e) => e.name)).toContain("fallback_presented");
  });

  it("returns events related to the request_human_review action", () => {
    const events = getEventsRelatedToAction("request_human_review");
    expect(events.map((e) => e.name)).toContain("human_review_requested");
  });

  it("returns events related to the missing_registered_knowledge guardrail trigger", () => {
    const events = getEventsRelatedToGuardrailTrigger(
      "missing_registered_knowledge",
    );
    expect(events.map((e) => e.name)).toContain("knowledge_gap_detected");
  });

  it("returns [] for unknown / empty input", () => {
    expect(getEventsRelatedToComponentBlock("ghost")).toEqual([]);
    expect(getEventsRelatedToAction("")).toEqual([]);
    expect(getEventsRelatedToGuardrailTrigger("ghost")).toEqual([]);
  });
});

// ---------------------------------------------------------------
// Platform terminology + CoRent residue scan
// ---------------------------------------------------------------

describe("AnalyticsEvent taxonomy — platform terminology + no CoRent residue", () => {
  function expectClean(location: string, value: string) {
    const lower = value.toLowerCase();
    for (const term of STRICT_CORENT_TERMS) {
      if (lower.includes(term)) {
        throw new Error(
          `${location} mentions strict-banned CoRent term '${term}': ${value}`,
        );
      }
    }
  }

  it("event names contain no strict-banned CoRent terms", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      expectClean(`name`, def.name);
    }
  });

  it("event purposes contain no strict-banned CoRent terms", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      expectClean(`${def.name}.purpose`, def.purpose);
    }
  });

  it("event safetyNotes contain no strict-banned CoRent terms", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      for (let i = 0; i < def.safetyNotes.length; i++) {
        expectClean(`${def.name}.safetyNotes[${i}]`, def.safetyNotes[i]!);
      }
    }
  });

  it("payload schema keys contain no strict-banned CoRent terms", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      for (const key of Object.keys(def.payloadSchema)) {
        expectClean(`${def.name}.payloadSchema['${key}']`, key);
      }
    }
  });
});

// ---------------------------------------------------------------
// Browser-tracking guard (taxonomy-level)
// ---------------------------------------------------------------

describe("AnalyticsEvent taxonomy — no browser-tracking fields", () => {
  const banned: ReadonlyArray<string> = [
    "cookie",
    "localstorage",
    "sessionstorage",
    "fingerprint",
    "useragent",
    "user_agent",
    "ip_address",
    "device_id",
    "geolocation",
  ];

  it("no payload key contains a browser-tracking token", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      for (const key of Object.keys(def.payloadSchema)) {
        const lower = key.toLowerCase();
        for (const term of banned) {
          expect(lower.includes(term)).toBe(false);
        }
      }
    }
  });

  it("no required or optional context key contains a browser-tracking token", () => {
    for (const def of listAnalyticsEventDefinitions()) {
      for (const k of [...def.requiredContextKeys, ...def.optionalContextKeys]) {
        const lower = k.toLowerCase();
        for (const term of banned) {
          expect(lower.includes(term)).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------
// Import boundary + I/O surface
// ---------------------------------------------------------------

describe("AnalyticsEvent taxonomy — import boundary", () => {
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
    expect(IMPORT_BLOB).not.toMatch(/from\s+["'][^"']*\/feedback/i);
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

  it("does NOT touch cookies, localStorage, sessionStorage, or document/window globals", () => {
    expect(RUNTIME_SRC).not.toMatch(/\bdocument\./);
    expect(RUNTIME_SRC).not.toMatch(/\bwindow\./);
    expect(RUNTIME_SRC).not.toMatch(/\blocalStorage\b/);
    expect(RUNTIME_SRC).not.toMatch(/\bsessionStorage\b/);
    expect(RUNTIME_SRC).not.toMatch(/document\.cookie/);
    expect(RUNTIME_SRC).not.toMatch(/navigator\./);
  });

  it("imports only from ./actionRegistry, ./componentBlocks, ./guardrailPolicy", () => {
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/actionRegistry["']/);
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/componentBlocks["']/);
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/guardrailPolicy["']/);
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(3);
  });
});

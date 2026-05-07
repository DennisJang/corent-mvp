// Tests for the ComponentBlock registry v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COMPONENT_BLOCK_IDS,
  COMPONENT_BLOCK_KINDS,
  COMPONENT_BLOCK_RISK_TIERS,
  SOURCE_REQUIREMENTS,
  assertValidComponentBlockDefinition,
  getComponentBlockDefinition,
  getComponentBlocksForIntent,
  getComponentBlocksRequiringHumanReview,
  getComponentBlocksRequiringSource,
  isComponentBlockAllowedForIntent,
  isComponentBlockAllowedForRisk,
  listComponentBlockDefinitions,
  validateComponentBlockRegistry,
  type ComponentBlockDefinition,
  type ComponentBlockId,
} from "./componentBlocks";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(
  process.cwd(),
  "src",
  "lib",
  "cie",
  "componentBlocks.ts",
);
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

// CoRent marketplace terms that must NOT appear in any block's
// id / label / purpose / dataFieldAllowlist / safetyNotes after
// the 2026-05-07 platform pivot. Uses the list from the task
// spec.
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

// Helper for fixture validations.
function buildValidDef(
  overrides: Partial<ComponentBlockDefinition> = {},
): ComponentBlockDefinition {
  const base: ComponentBlockDefinition = {
    id: "intent_summary",
    kind: "guidance",
    label: "fixture",
    purpose: "fixture purpose",
    allowedIntentTypes: ["learn", "unknown"],
    maxRiskTier: "T1",
    sourceRequirement: "none",
    allowedSlotKeys: ["title", "summary"],
    requiredSlotKeys: ["title", "summary"],
    slotLimits: {
      title: { maxChars: 120, required: true },
      summary: { maxChars: 480, required: true },
    },
    dataFieldAllowlist: [],
    compatibleActionTypes: [],
    requiresHumanReview: false,
    safetyNotes: ["fixture safety note"],
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("ComponentBlock registry — closed vocabularies", () => {
  it("COMPONENT_BLOCK_IDS lists the 11 expected ids", () => {
    expect([...COMPONENT_BLOCK_IDS].sort()).toEqual(
      [
        "clarifying_question",
        "external_link_cta",
        "fallback_message",
        "faq_answer",
        "handoff_notice",
        "human_review_notice",
        "intent_summary",
        "lead_capture",
        "pre_action_checklist",
        "source_citation",
        "unmet_intent_capture",
      ].sort(),
    );
  });

  it("COMPONENT_BLOCK_KINDS lists the 7 expected kinds", () => {
    expect([...COMPONENT_BLOCK_KINDS].sort()).toEqual(
      [
        "action_prompt",
        "answer",
        "capture",
        "fallback",
        "guidance",
        "question",
        "review",
      ].sort(),
    );
  });

  it("COMPONENT_BLOCK_RISK_TIERS aligns with ISS-0 (T0–T5)", () => {
    expect([...COMPONENT_BLOCK_RISK_TIERS]).toEqual([
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
    ]);
  });

  it("SOURCE_REQUIREMENTS is the four expected values", () => {
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

describe("listComponentBlockDefinitions — production registry", () => {
  it("returns a non-empty array", () => {
    const defs = listComponentBlockDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBe(11);
  });

  it("includes the 11 v1 ids required by the task", () => {
    const ids = listComponentBlockDefinitions().map((d) => d.id).sort();
    expect(ids).toEqual([...COMPONENT_BLOCK_IDS].sort());
  });

  it("validateComponentBlockRegistry returns ok:true for the production registry", () => {
    const r = validateComponentBlockRegistry();
    expect(r.ok).toBe(true);
  });

  it("every block has a non-empty label / purpose / safetyNotes", () => {
    for (const def of listComponentBlockDefinitions()) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.purpose.trim().length).toBeGreaterThan(0);
      expect(def.safetyNotes.length).toBeGreaterThan(0);
      for (const note of def.safetyNotes) {
        expect(note.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every requiredSlotKey is in allowedSlotKeys and has slotLimits[k].required === true", () => {
    for (const def of listComponentBlockDefinitions()) {
      const allowedSet = new Set(def.allowedSlotKeys);
      for (const r of def.requiredSlotKeys) {
        expect(allowedSet.has(r)).toBe(true);
        expect(def.slotLimits[r]?.required).toBe(true);
      }
    }
  });

  it("every slotLimits key is in allowedSlotKeys", () => {
    for (const def of listComponentBlockDefinitions()) {
      const allowedSet = new Set(def.allowedSlotKeys);
      for (const k of Object.keys(def.slotLimits)) {
        expect(allowedSet.has(k)).toBe(true);
      }
    }
  });

  it("ids are unique", () => {
    const ids = listComponentBlockDefinitions().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------
// Per-block-id required posture
// ---------------------------------------------------------------

describe("ComponentBlock registry — per-block invariants", () => {
  it("faq_answer requires registered knowledge", () => {
    const def = getComponentBlockDefinition("faq_answer");
    expect(def?.sourceRequirement).toBe("registered_knowledge_required");
  });

  it("source_citation requires registered knowledge", () => {
    const def = getComponentBlockDefinition("source_citation");
    expect(def?.sourceRequirement).toBe("registered_knowledge_required");
  });

  it("human_review_notice requires human review", () => {
    const def = getComponentBlockDefinition("human_review_notice");
    expect(def?.requiresHumanReview).toBe(true);
  });

  it("handoff_notice requires human review", () => {
    const def = getComponentBlockDefinition("handoff_notice");
    expect(def?.requiresHumanReview).toBe(true);
  });

  it("fallback_message has no compatible actions", () => {
    const def = getComponentBlockDefinition("fallback_message");
    expect(def?.compatibleActionTypes).toEqual([]);
  });

  it("fallback_message is T0 (lowest risk only)", () => {
    const def = getComponentBlockDefinition("fallback_message");
    expect(def?.maxRiskTier).toBe("T0");
  });

  it("lead_capture's dataFieldAllowlist excludes sensitive regulated fields", () => {
    const def = getComponentBlockDefinition("lead_capture");
    expect(def).toBeTruthy();
    if (!def) return;
    const FORBIDDEN_SUBSTRINGS = [
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
      "policy_number",
      "medical",
      "diagnosis",
      "prescription",
      "citizenship",
      "visa_number",
    ];
    for (const field of def.dataFieldAllowlist) {
      const lower = field.toLowerCase();
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(lower.includes(forbidden)).toBe(false);
      }
    }
  });

  it("lead_capture's allowed fields are the bounded contact-only set from the task spec", () => {
    const def = getComponentBlockDefinition("lead_capture");
    expect(def?.dataFieldAllowlist).toEqual([
      "name",
      "email",
      "phone",
      "company",
      "role",
      "message",
      "preferred_contact_method",
      "requested_time_window",
    ]);
  });

  it("external_link_cta does not claim task completion in label or purpose", () => {
    const def = getComponentBlockDefinition("external_link_cta");
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
    ];
    for (const phrase of COMPLETION_PHRASES) {
      expect(def.label.toLowerCase().includes(phrase)).toBe(false);
      expect(def.purpose.toLowerCase().includes(phrase)).toBe(false);
    }
  });

  it("intent_summary supports every InteractionIntent kind for echo coverage", () => {
    const def = getComponentBlockDefinition("intent_summary");
    expect(def?.allowedIntentTypes.length).toBe(11);
  });

  it("at least one block supports common low-risk lead/intake intents (request, contact, apply)", () => {
    for (const intent of ["request", "contact", "apply"] as const) {
      const matches = getComponentBlocksForIntent(intent);
      expect(matches.length).toBeGreaterThan(0);
    }
    const leadCapture = getComponentBlockDefinition("lead_capture");
    for (const intent of ["request", "contact", "apply"] as const) {
      expect(leadCapture?.allowedIntentTypes.includes(intent)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------
// validateComponentBlockRegistry — drift detection
// ---------------------------------------------------------------

describe("validateComponentBlockRegistry — drift detection", () => {
  it("flags duplicate ids", () => {
    const a = buildValidDef({ id: "intent_summary" });
    const b = buildValidDef({
      id: "intent_summary",
      label: "another",
      purpose: "another purpose",
    });
    const r = validateComponentBlockRegistry([a, b]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /duplicate block id: intent_summary/.test(e))).toBe(true);
  });

  it("flags a requiredSlotKey that is not in allowedSlotKeys", () => {
    const def = buildValidDef({
      requiredSlotKeys: ["title", "phantom"],
      slotLimits: {
        title: { maxChars: 120, required: true },
        summary: { maxChars: 480, required: true },
      },
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /requiredSlotKey 'phantom' is not in allowedSlotKeys/.test(e)),
    ).toBe(true);
  });

  it("flags a slotLimits key that is not in allowedSlotKeys", () => {
    const def = buildValidDef({
      slotLimits: {
        title: { maxChars: 120, required: true },
        summary: { maxChars: 480, required: true },
        phantom: { maxChars: 60 },
      },
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /slotLimits key 'phantom' is not in allowedSlotKeys/.test(e)),
    ).toBe(true);
  });

  it("flags a requiredSlotKey whose slotLimits entry is missing required:true", () => {
    const def = buildValidDef({
      slotLimits: {
        title: { maxChars: 120 }, // missing required: true
        summary: { maxChars: 480, required: true },
      },
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /must have slotLimits\[title\]\.required === true/.test(e)),
    ).toBe(true);
  });

  it("flags an empty safetyNotes array", () => {
    const def = buildValidDef({ safetyNotes: [] });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /safetyNotes must be a non-empty array/.test(e))).toBe(true);
  });

  it("flags an empty safety note string", () => {
    const def = buildValidDef({ safetyNotes: ["ok", "  "] });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /safetyNotes\[1\] is empty/.test(e))).toBe(true);
  });

  it("flags an empty label / purpose", () => {
    const def = buildValidDef({ label: "  ", purpose: "" });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /label must be a non-empty string/.test(e))).toBe(true);
    expect(r.errors.some((e) => /purpose must be a non-empty string/.test(e))).toBe(true);
  });

  it("flags an out-of-vocab id / kind / risk tier / source requirement / intent kind", () => {
    const def = buildValidDef({
      id: "evil_block" as unknown as ComponentBlockId,
      kind: "evil_kind" as never,
      maxRiskTier: "T9" as never,
      sourceRequirement: "evil_source" as never,
      allowedIntentTypes: ["evil_intent" as never],
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /id 'evil_block'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /kind 'evil_kind'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /maxRiskTier 'T9'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /sourceRequirement 'evil_source'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /allowedIntentType 'evil_intent'/.test(e))).toBe(true);
  });

  it("flags T3+ block whose requiresHumanReview is false (ISS-0 §5)", () => {
    const def = buildValidDef({
      id: "human_review_notice",
      maxRiskTier: "T3",
      sourceRequirement: "human_review_required",
      requiresHumanReview: false,
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /'T3' is not enabled in v1 unless requiresHumanReview === true/.test(e))).toBe(true);
  });

  it("flags raw HTML / template fragments in label / purpose / safetyNotes", () => {
    const html = buildValidDef({ purpose: "Visit <b>here</b> to learn more" });
    const tmpl = buildValidDef({ purpose: "Hello {{name}}, welcome" });
    const md = buildValidDef({
      safetyNotes: ["See [docs](https://example.com) for details"],
    });
    const cssAttr = buildValidDef({
      label: 'Heading style="color:red"',
    });

    for (const tainted of [html, tmpl, md, cssAttr]) {
      const r = validateComponentBlockRegistry([tainted]);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(
        r.errors.some((e) =>
          /raw HTML \/ CSS \/ JSX \/ markdown \/ template fragment/.test(e),
        ),
      ).toBe(true);
    }
  });

  it("flags lead_capture variants that include sensitive regulated fields", () => {
    const def = buildValidDef({
      id: "lead_capture",
      kind: "capture",
      allowedSlotKeys: ["heading", "consent_help_text", "submit_label"],
      requiredSlotKeys: ["heading", "consent_help_text", "submit_label"],
      slotLimits: {
        heading: { maxChars: 120, required: true },
        consent_help_text: { maxChars: 240, required: true },
        submit_label: { maxChars: 60, required: true },
      },
      dataFieldAllowlist: ["name", "email", "ssn"],
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /must not include the sensitive field 'ssn'/.test(e))).toBe(true);
  });

  it("flags fallback_message variants with non-empty compatibleActionTypes", () => {
    const def = buildValidDef({
      id: "fallback_message",
      kind: "fallback",
      maxRiskTier: "T0",
      compatibleActionTypes: ["create_lead"],
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /compatibleActionTypes must be empty/.test(e))).toBe(true);
  });

  it("flags external_link_cta variants whose label or purpose claim task completion", () => {
    const def = buildValidDef({
      id: "external_link_cta",
      kind: "action_prompt",
      sourceRequirement: "registered_knowledge_required",
      label: "Marked completed externally",
      purpose:
        "Open the host page so the visitor can mark the task complete via the host UI.",
      compatibleActionTypes: [],
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /must not claim task completion/.test(e),
      ),
    ).toBe(true);
  });

  it("flags faq_answer variants with the wrong source requirement", () => {
    const def = buildValidDef({
      id: "faq_answer",
      kind: "answer",
      sourceRequirement: "none",
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /faq_answer: sourceRequirement must be 'registered_knowledge_required'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags human_review_notice variants with requiresHumanReview false", () => {
    const def = buildValidDef({
      id: "human_review_notice",
      kind: "review",
      sourceRequirement: "human_review_required",
      requiresHumanReview: false,
    });
    const r = validateComponentBlockRegistry([def]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /human_review_notice: requiresHumanReview must be true/.test(e)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// assertValidComponentBlockDefinition (throwing variant)
// ---------------------------------------------------------------

describe("assertValidComponentBlockDefinition", () => {
  it("does not throw for a valid definition", () => {
    expect(() =>
      assertValidComponentBlockDefinition(buildValidDef()),
    ).not.toThrow();
  });

  it("throws for a definition with an empty label", () => {
    expect(() =>
      assertValidComponentBlockDefinition(buildValidDef({ label: "" })),
    ).toThrow(/label must be a non-empty string/);
  });

  it("throws for a definition that violates the per-id source-requirement rule", () => {
    expect(() =>
      assertValidComponentBlockDefinition(
        buildValidDef({
          id: "faq_answer",
          kind: "answer",
          sourceRequirement: "none",
        }),
      ),
    ).toThrow(/faq_answer: sourceRequirement must be 'registered_knowledge_required'/);
  });
});

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

describe("getComponentBlockDefinition", () => {
  it("returns the definition by id", () => {
    const def = getComponentBlockDefinition("intent_summary");
    expect(def?.id).toBe("intent_summary");
  });

  it("returns null for an unknown id", () => {
    expect(getComponentBlockDefinition("nope")).toBeNull();
  });

  it("returns null for empty / non-string id", () => {
    expect(getComponentBlockDefinition("")).toBeNull();
    expect(getComponentBlockDefinition(undefined as unknown as string)).toBeNull();
    expect(getComponentBlockDefinition(null as unknown as string)).toBeNull();
    expect(getComponentBlockDefinition(123 as unknown as string)).toBeNull();
  });
});

describe("isComponentBlockAllowedForIntent", () => {
  it("returns true when the intent is in allowedIntentTypes", () => {
    const def = getComponentBlockDefinition("faq_answer")!;
    expect(isComponentBlockAllowedForIntent(def, "learn")).toBe(true);
    expect(isComponentBlockAllowedForIntent(def, "compare")).toBe(true);
  });

  it("returns false when the intent is not in allowedIntentTypes", () => {
    const def = getComponentBlockDefinition("faq_answer")!;
    expect(isComponentBlockAllowedForIntent(def, "buy")).toBe(false);
    expect(isComponentBlockAllowedForIntent(def, "book")).toBe(false);
  });

  it("returns false for an out-of-vocab intent", () => {
    const def = getComponentBlockDefinition("faq_answer")!;
    expect(
      isComponentBlockAllowedForIntent(def, "evil_intent" as never),
    ).toBe(false);
  });
});

describe("isComponentBlockAllowedForRisk", () => {
  it("returns true when the requested risk tier is at or below the block's maxRiskTier", () => {
    const def = getComponentBlockDefinition("source_citation")!;
    // source_citation is T2 → T0/T1/T2 should all be allowed.
    expect(isComponentBlockAllowedForRisk(def, "T0")).toBe(true);
    expect(isComponentBlockAllowedForRisk(def, "T1")).toBe(true);
    expect(isComponentBlockAllowedForRisk(def, "T2")).toBe(true);
  });

  it("returns false when the requested risk tier exceeds the block's maxRiskTier", () => {
    const def = getComponentBlockDefinition("fallback_message")!;
    // fallback_message is T0 → only T0 allowed.
    expect(isComponentBlockAllowedForRisk(def, "T0")).toBe(true);
    expect(isComponentBlockAllowedForRisk(def, "T1")).toBe(false);
    expect(isComponentBlockAllowedForRisk(def, "T5")).toBe(false);
  });

  it("returns false for an out-of-vocab risk tier", () => {
    const def = getComponentBlockDefinition("intent_summary")!;
    expect(isComponentBlockAllowedForRisk(def, "T9" as never)).toBe(false);
  });
});

describe("getComponentBlocksForIntent", () => {
  it("returns only blocks whose allowedIntentTypes include the intent", () => {
    const matches = getComponentBlocksForIntent("learn");
    for (const def of matches) {
      expect(def.allowedIntentTypes.includes("learn")).toBe(true);
    }
    const ids = matches.map((d) => d.id);
    expect(ids).toContain("faq_answer");
    expect(ids).toContain("intent_summary");
  });

  it("filters by riskTier (returns only blocks whose maxRiskTier ≥ requested tier)", () => {
    // riskTier="T0" returns blocks whose maxRiskTier covers T0
    // — every v1 block since they all sit at T0/T1/T2.
    const t0 = getComponentBlocksForIntent("learn", { riskTier: "T0" });
    expect(t0.length).toBeGreaterThan(0);
    for (const def of t0) {
      expect(isComponentBlockAllowedForRisk(def, "T0")).toBe(true);
    }
    expect(t0.map((d) => d.id)).toContain("fallback_message");

    // riskTier="T2" excludes any block whose maxRiskTier is
    // below T2 — fallback_message (T0) drops out.
    const t2 = getComponentBlocksForIntent("learn", { riskTier: "T2" });
    for (const def of t2) {
      expect(isComponentBlockAllowedForRisk(def, "T2")).toBe(true);
    }
    expect(t2.map((d) => d.id)).not.toContain("fallback_message");
  });

  it("filters by requiresHumanReview", () => {
    const reviewers = getComponentBlocksForIntent("contact", {
      requiresHumanReview: true,
    });
    for (const def of reviewers) {
      expect(def.requiresHumanReview).toBe(true);
    }
    expect(reviewers.map((d) => d.id)).toContain("handoff_notice");
    expect(reviewers.map((d) => d.id)).toContain("human_review_notice");
  });

  it("filters by sourceRequirement", () => {
    const knowledge = getComponentBlocksForIntent("learn", {
      sourceRequirement: "registered_knowledge_required",
    });
    for (const def of knowledge) {
      expect(def.sourceRequirement).toBe("registered_knowledge_required");
    }
    expect(knowledge.map((d) => d.id)).toContain("faq_answer");
  });
});

describe("getComponentBlocksRequiringSource", () => {
  it("returns only blocks whose sourceRequirement is not 'none'", () => {
    const blocks = getComponentBlocksRequiringSource();
    expect(blocks.length).toBeGreaterThan(0);
    for (const def of blocks) {
      expect(def.sourceRequirement).not.toBe("none");
    }
    const ids = blocks.map((d) => d.id);
    expect(ids).toContain("faq_answer");
    expect(ids).toContain("source_citation");
    expect(ids).toContain("pre_action_checklist");
    expect(ids).toContain("external_link_cta");
    expect(ids).toContain("human_review_notice");
  });
});

describe("getComponentBlocksRequiringHumanReview", () => {
  it("returns only blocks whose requiresHumanReview is true", () => {
    const blocks = getComponentBlocksRequiringHumanReview();
    expect(blocks.length).toBeGreaterThan(0);
    for (const def of blocks) {
      expect(def.requiresHumanReview).toBe(true);
    }
    const ids = blocks.map((d) => d.id).sort();
    expect(ids).toEqual(["handoff_notice", "human_review_notice"]);
  });
});

// ---------------------------------------------------------------
// Platform terminology + CoRent residue scan
// ---------------------------------------------------------------

describe("ComponentBlock registry — platform terminology + no CoRent residue", () => {
  it("no block id / label / purpose / safetyNotes mention CoRent marketplace terms", () => {
    for (const def of listComponentBlockDefinitions()) {
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

  it("no block dataFieldAllowlist mentions CoRent marketplace terms", () => {
    for (const def of listComponentBlockDefinitions()) {
      for (const field of def.dataFieldAllowlist) {
        const lower = field.toLowerCase();
        for (const term of CORENT_MARKETPLACE_TERMS) {
          expect(lower.includes(term)).toBe(false);
        }
      }
    }
  });

  it("no block allowedSlotKeys mentions CoRent marketplace terms", () => {
    for (const def of listComponentBlockDefinitions()) {
      for (const slot of def.allowedSlotKeys) {
        const lower = slot.toLowerCase();
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

describe("ComponentBlock registry — import boundary", () => {
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

  it("does NOT import payment / claim / trust / handoff / notification / feedback / wanted-write modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    // The interactionIntent module legitimately defines an
    // internal "handoff" lifecycle word; we only forbid imports
    // from a future external handoff service module (e.g.
    // `@/server/handoff/...`). The interactionIntent import is
    // allowed.
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

  it("imports only the InteractionIntent module (and nothing else from @/lib)", () => {
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/interactionIntent["']/);
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(1);
  });
});

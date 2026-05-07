// Tests for the platform interaction demo v0 model.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTION_IDS } from "@/lib/cie/actionRegistry";
import { COMPONENT_BLOCK_IDS } from "@/lib/cie/componentBlocks";
import {
  GUARDRAIL_DECISIONS,
  GUARDRAIL_TRIGGER_KINDS,
} from "@/lib/cie/guardrailPolicy";
import { ANALYTICS_EVENT_NAMES } from "@/lib/cie/analyticsEvents";
import { INTERACTION_INTENT_KINDS } from "@/lib/cie/interactionIntent";

import {
  PLATFORM_DEMO_PURPOSE_IDS,
  getPlatformDemoPurpose,
  listPlatformDemoPurposes,
  validatePlatformDemoModel,
  type PlatformDemoPurpose,
} from "./platformDemoModel";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(
  process.cwd(),
  "src",
  "app",
  "platform",
  "platformDemoModel.ts",
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

const STRICT_CORENT_TERMS: ReadonlyArray<string> = [
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
  "corent",
];

const FORBIDDEN_ASSERTIVE_PHRASES: ReadonlyArray<string> = [
  "task complete",
  "task completed",
  "purchase confirmed",
  "purchase complete",
  "booking confirmed",
  "booking is confirmed",
  "guaranteed conversion",
  "email sent",
  "email delivered",
  "autonomous execution",
  "fully automatic",
];

function buildValidPurpose(
  overrides: Partial<PlatformDemoPurpose> = {},
): PlatformDemoPurpose {
  const base: PlatformDemoPurpose = {
    id: "understand_product",
    label: "Understand the product",
    description: "Fixture description.",
    intentKind: "learn",
    intentRiskTier: "T0",
    componentBlockSequence: ["intent_summary"],
    proposedActionIds: ["open_external_link"],
    guardrailNotes: [
      {
        triggerKind: "missing_registered_knowledge",
        decision: "require_source",
        explanation: "Fixture explanation.",
      },
    ],
    analyticsEventSequence: ["interaction_started"],
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------
// Closed vocabulary
// ---------------------------------------------------------------

describe("Platform demo model — closed vocabulary", () => {
  it("PLATFORM_DEMO_PURPOSE_IDS lists the 4 expected ids", () => {
    expect([...PLATFORM_DEMO_PURPOSE_IDS].sort()).toEqual(
      [
        "understand_product",
        "check_site_fit",
        "see_how_it_works",
        "contact_or_handoff",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------
// Production model passes validation
// ---------------------------------------------------------------

describe("Platform demo model — production purposes", () => {
  it("validatePlatformDemoModel returns ok:true for the production model", () => {
    expect(validatePlatformDemoModel().ok).toBe(true);
  });

  it("returns the 4 v0 demo purposes", () => {
    const all = listPlatformDemoPurposes();
    expect(all.length).toBe(4);
    expect(all.map((p) => p.id).sort()).toEqual(
      [...PLATFORM_DEMO_PURPOSE_IDS].sort(),
    );
  });

  it("getPlatformDemoPurpose returns a known purpose and null for unknown / empty", () => {
    expect(getPlatformDemoPurpose("understand_product")?.id).toBe(
      "understand_product",
    );
    expect(getPlatformDemoPurpose("ghost")).toBeNull();
    expect(getPlatformDemoPurpose("")).toBeNull();
    expect(getPlatformDemoPurpose(undefined as unknown as string)).toBeNull();
  });
});

// ---------------------------------------------------------------
// Registry-id sanity for every purpose
// ---------------------------------------------------------------

describe("Platform demo model — registry-id sanity", () => {
  const intentSet = new Set<string>(INTERACTION_INTENT_KINDS);
  const blockSet = new Set<string>(COMPONENT_BLOCK_IDS);
  const actionSet = new Set<string>(ACTION_IDS);
  const triggerSet = new Set<string>(GUARDRAIL_TRIGGER_KINDS);
  const decisionSet = new Set<string>(GUARDRAIL_DECISIONS);
  const eventSet = new Set<string>(ANALYTICS_EVENT_NAMES);

  it("every intentKind is a known InteractionIntent kind", () => {
    for (const p of listPlatformDemoPurposes()) {
      expect(intentSet.has(p.intentKind)).toBe(true);
    }
  });

  it("every componentBlockSequence id is a known ComponentBlock id", () => {
    for (const p of listPlatformDemoPurposes()) {
      for (const b of p.componentBlockSequence) {
        expect(blockSet.has(b)).toBe(true);
      }
    }
  });

  it("every proposedActionIds id is a known Action id", () => {
    for (const p of listPlatformDemoPurposes()) {
      for (const a of p.proposedActionIds) {
        expect(actionSet.has(a)).toBe(true);
      }
    }
  });

  it("every guardrailNotes triggerKind is a known guardrail trigger kind", () => {
    for (const p of listPlatformDemoPurposes()) {
      for (const note of p.guardrailNotes) {
        expect(triggerSet.has(note.triggerKind)).toBe(true);
        expect(decisionSet.has(note.decision)).toBe(true);
      }
    }
  });

  it("every analyticsEventSequence name is a known AnalyticsEvent name", () => {
    for (const p of listPlatformDemoPurposes()) {
      for (const e of p.analyticsEventSequence) {
        expect(eventSet.has(e)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------
// Per-purpose flow expectations
// ---------------------------------------------------------------

describe("Platform demo model — per-purpose flow expectations", () => {
  it("understand_product is a low-risk learn flow rooted in registered knowledge", () => {
    const p = getPlatformDemoPurpose("understand_product")!;
    expect(p.intentKind).toBe("learn");
    expect(p.intentRiskTier).toBe("T0");
    expect(p.componentBlockSequence).toContain("faq_answer");
    expect(p.proposedActionIds).toContain("open_external_link");
  });

  it("check_site_fit walks a clarifying-question + checklist + lead-capture flow", () => {
    const p = getPlatformDemoPurpose("check_site_fit")!;
    expect(p.intentKind).toBe("compare");
    expect(p.componentBlockSequence).toContain("clarifying_question");
    expect(p.componentBlockSequence).toContain("pre_action_checklist");
    expect(p.componentBlockSequence).toContain("lead_capture");
    expect(p.proposedActionIds).toContain("create_lead");
    expect(p.analyticsEventSequence).toContain("intent_clarification_requested");
  });

  it("see_how_it_works surfaces an external-link CTA backed by registered knowledge", () => {
    const p = getPlatformDemoPurpose("see_how_it_works")!;
    expect(p.componentBlockSequence).toContain("external_link_cta");
    expect(p.proposedActionIds).toContain("open_external_link");
  });

  it("contact_or_handoff routes through human review and never emits action_prepared", () => {
    const p = getPlatformDemoPurpose("contact_or_handoff")!;
    expect(p.intentKind).toBe("contact");
    expect(p.componentBlockSequence).toContain("handoff_notice");
    expect(p.componentBlockSequence).toContain("human_review_notice");
    expect(p.proposedActionIds).toContain("request_human_review");
    expect(p.proposedActionIds).toContain("create_contact_request");
    expect(p.analyticsEventSequence).toContain("human_review_requested");
    // action_prepared would imply preparation; v0 demo does not run actions.
    expect(p.analyticsEventSequence).not.toContain("action_prepared");
  });

  it("if start_booking_request is shown, it always coexists with request_human_review", () => {
    for (const p of listPlatformDemoPurposes()) {
      if (p.proposedActionIds.includes("start_booking_request")) {
        expect(p.proposedActionIds).toContain("request_human_review");
      }
    }
  });
});

// ---------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------

describe("validatePlatformDemoModel — drift detection", () => {
  it("flags an unknown intentKind", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({ intentKind: "evil_kind" as never }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /intentKind 'evil_kind' is not in INTERACTION_INTENT_KINDS/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown ComponentBlock id", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        componentBlockSequence: ["intent_summary", "ghost_block" as never],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /componentBlockSequence references unknown id 'ghost_block'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown Action id", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        proposedActionIds: ["ghost_action" as never],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /proposedActionIds references unknown id 'ghost_action'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown guardrail trigger kind / decision", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        guardrailNotes: [
          {
            triggerKind: "ghost_trigger" as never,
            decision: "ghost_decision" as never,
            explanation: "Should fail.",
          },
        ],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /guardrailNotes references unknown trigger kind 'ghost_trigger'/.test(e),
      ),
    ).toBe(true);
    expect(
      r.errors.some((e) =>
        /guardrailNotes references unknown decision 'ghost_decision'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an unknown AnalyticsEvent name", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        analyticsEventSequence: ["interaction_started", "ghost_event" as never],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /analyticsEventSequence references unknown name 'ghost_event'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags start_booking_request without a matching request_human_review", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        proposedActionIds: ["start_booking_request"],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /start_booking_request must coexist with request_human_review/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty label / description / explanation", () => {
    const r = validatePlatformDemoModel([
      buildValidPurpose({
        label: "",
        description: "",
        guardrailNotes: [
          {
            triggerKind: "missing_registered_knowledge",
            decision: "require_source",
            explanation: "",
          },
        ],
      }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /label must be a non-empty string/.test(e)),
    ).toBe(true);
    expect(
      r.errors.some((e) => /description must be a non-empty string/.test(e)),
    ).toBe(true);
    expect(
      r.errors.some((e) =>
        /guardrailNotes explanation must be a non-empty string/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Copy hygiene — no CoRent residue, no task-completion claims
// ---------------------------------------------------------------

describe("Platform demo model — copy hygiene", () => {
  function expectClean(location: string, value: string) {
    const lower = value.toLowerCase();
    for (const term of STRICT_CORENT_TERMS) {
      if (lower.includes(term)) {
        throw new Error(
          `${location} mentions banned CoRent term '${term}': ${value}`,
        );
      }
    }
    for (const phrase of FORBIDDEN_ASSERTIVE_PHRASES) {
      if (lower.includes(phrase)) {
        throw new Error(
          `${location} asserts a forbidden completion phrase '${phrase}': ${value}`,
        );
      }
    }
  }

  it("no purpose label, description, or guardrail explanation contains CoRent residue or completion claims", () => {
    for (const p of listPlatformDemoPurposes()) {
      expectClean(`${p.id}.label`, p.label);
      expectClean(`${p.id}.description`, p.description);
      for (let i = 0; i < p.guardrailNotes.length; i++) {
        expectClean(
          `${p.id}.guardrailNotes[${i}].explanation`,
          p.guardrailNotes[i]!.explanation,
        );
      }
    }
  });
});

// ---------------------------------------------------------------
// Import boundary
// ---------------------------------------------------------------

describe("Platform demo model — import boundary", () => {
  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import any LLM provider / runtime / mock invoker", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai/i);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
    expect(IMPORT_BLOB).not.toMatch(/llmAdapter/);
    expect(IMPORT_BLOB).not.toMatch(/mockAdapter/);
  });

  it("does NOT import any Supabase client / SSR / persistence module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
  });

  it("does NOT import React or any UI framework", () => {
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
    expect(RUNTIME_SRC).not.toMatch(/\blocalStorage\b/);
    expect(RUNTIME_SRC).not.toMatch(/\bsessionStorage\b/);
    expect(RUNTIME_SRC).not.toMatch(/document\.cookie/);
    expect(RUNTIME_SRC).not.toMatch(/\bnavigator\./);
  });

  it("imports only from CIE registries (no @/server, no @/components, no @/data)", () => {
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    for (const imp of imports) {
      expect(imp).toMatch(/from\s+["']@\/lib\/cie\//);
    }
    expect(imports.length).toBeGreaterThan(0);
  });
});

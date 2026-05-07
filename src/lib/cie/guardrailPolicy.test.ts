// Tests for the GuardrailPolicy primitive v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACTION_IDS } from "./actionRegistry";
import {
  FALLBACK_STYLES,
  GUARDRAIL_DECISIONS,
  GUARDRAIL_MODES,
  GUARDRAIL_RISK_TIERS,
  GUARDRAIL_TRIGGER_KINDS,
  HIGH_RISK_TRIGGER_KINDS,
  LOG_REQUIREMENTS,
  PLATFORM_DEFAULT_GUARDRAIL_POLICY,
  REQUIRED_GUARDRAIL_TRIGGER_KINDS,
  REQUIRED_SENSITIVE_FIELD_PATTERNS,
  assertValidGuardrailPolicy,
  getBlockedTopics,
  getDefaultDecisionForRiskTier,
  getForbiddenPhrases,
  getGuardrailTrigger,
  getRiskTierRule,
  getSensitiveFieldRules,
  getTriggersByDecision,
  isActionAllowedByPolicy,
  isActionBlockedByPolicy,
  listGuardrailTriggers,
  listRiskTierRules,
  validateGuardrailPolicy,
  type GuardrailPolicy,
  type GuardrailTrigger,
} from "./guardrailPolicy";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(process.cwd(), "src", "lib", "cie", "guardrailPolicy.ts");
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
// policy except in fields that intentionally hold blocked terms
// (blockedTopics, forbiddenPhrases, sensitiveFieldRules.pattern,
// logging.redactPatterns). v1 forbids all of: rental, seller
// store, borrower, logistics, return, claim, dispute, corent.
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

function clonePolicy(policy: GuardrailPolicy): GuardrailPolicy {
  return {
    ...policy,
    riskTierRules: policy.riskTierRules.map((r) => ({
      ...r,
      allowedActionIds: [...r.allowedActionIds],
      blockedActionIds: [...r.blockedActionIds],
      notes: [...r.notes],
    })),
    triggers: policy.triggers.map((t) => ({ ...t, notes: [...t.notes] })),
    sensitiveFieldRules: policy.sensitiveFieldRules.map((s) => ({ ...s })),
    blockedTopics: [...policy.blockedTopics],
    forbiddenPhrases: [...policy.forbiddenPhrases],
    allowedActionIds: [...policy.allowedActionIds],
    blockedActionIds: [...policy.blockedActionIds],
    logging: { ...policy.logging, redactPatterns: [...policy.logging.redactPatterns] },
    safetyNotes: [...policy.safetyNotes],
  };
}

function buildValidPolicy(
  mutate: (p: GuardrailPolicy) => void = () => {},
): GuardrailPolicy {
  const p = clonePolicy(PLATFORM_DEFAULT_GUARDRAIL_POLICY);
  mutate(p);
  return p;
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("GuardrailPolicy — closed vocabularies", () => {
  it("GUARDRAIL_MODES lists the 4 expected values", () => {
    expect([...GUARDRAIL_MODES].sort()).toEqual(
      [
        "permissive_public_guidance",
        "careful_task_completion",
        "high_trust_review_first",
        "blocked",
      ].sort(),
    );
  });

  it("GUARDRAIL_DECISIONS lists the 6 expected values", () => {
    expect([...GUARDRAIL_DECISIONS].sort()).toEqual(
      [
        "allow",
        "require_source",
        "require_confirmation",
        "require_human_review",
        "fallback",
        "block",
      ].sort(),
    );
  });

  it("GUARDRAIL_TRIGGER_KINDS includes all required + optional kinds", () => {
    for (const required of REQUIRED_GUARDRAIL_TRIGGER_KINDS) {
      expect(GUARDRAIL_TRIGGER_KINDS).toContain(required);
    }
    expect(GUARDRAIL_TRIGGER_KINDS).toContain("brand_claim_policy");
    expect(GUARDRAIL_TRIGGER_KINDS).toContain("unsafe_prompt_injection");
  });

  it("HIGH_RISK_TRIGGER_KINDS covers payment / legal-medical / irreversible / autonomous", () => {
    expect(HIGH_RISK_TRIGGER_KINDS.has("payment_or_financial")).toBe(true);
    expect(HIGH_RISK_TRIGGER_KINDS.has("legal_medical_immigration_hr")).toBe(true);
    expect(HIGH_RISK_TRIGGER_KINDS.has("irreversible_or_binding_action")).toBe(true);
    expect(HIGH_RISK_TRIGGER_KINDS.has("autonomous_action")).toBe(true);
  });

  it("FALLBACK_STYLES lists the 4 expected values", () => {
    expect([...FALLBACK_STYLES].sort()).toEqual(
      [
        "brief_boundary",
        "source_gap_explanation",
        "human_review_redirect",
        "safe_alternative",
      ].sort(),
    );
  });

  it("LOG_REQUIREMENTS lists the 4 expected values", () => {
    expect([...LOG_REQUIREMENTS].sort()).toEqual(
      ["none", "decision_only", "decision_with_context", "full_review_required"].sort(),
    );
  });

  it("GUARDRAIL_RISK_TIERS aligns with T0..T5", () => {
    expect([...GUARDRAIL_RISK_TIERS]).toEqual(["T0", "T1", "T2", "T3", "T4", "T5"]);
  });

  it("REQUIRED_SENSITIVE_FIELD_PATTERNS covers the 25 platform-required patterns", () => {
    const expected = [
      "password",
      "ssn",
      "social_security",
      "passport",
      "government_id",
      "national_id",
      "resident_registration_number",
      "credit_card",
      "card_number",
      "cvv",
      "bank_account",
      "iban",
      "routing_number",
      "diagnosis",
      "medical",
      "prescription",
      "visa",
      "immigration",
      "legal_claim",
      "insurance",
      "deposit",
      "escrow",
      "payment",
      "refund",
      "settlement",
    ];
    expect([...REQUIRED_SENSITIVE_FIELD_PATTERNS].sort()).toEqual(expected.sort());
    expect(REQUIRED_SENSITIVE_FIELD_PATTERNS.length).toBe(25);
  });
});

// ---------------------------------------------------------------
// Default platform policy
// ---------------------------------------------------------------

describe("PLATFORM_DEFAULT_GUARDRAIL_POLICY", () => {
  it("validates ok:true", () => {
    expect(validateGuardrailPolicy().ok).toBe(true);
    expect(validateGuardrailPolicy(PLATFORM_DEFAULT_GUARDRAIL_POLICY).ok).toBe(true);
  });

  it("uses the platform-default identity values", () => {
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.id).toBe(
      "platform_default_guardrail_policy",
    );
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.mode).toBe("careful_task_completion");
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.fallbackStyle).toBe("brief_boundary");
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.logging.eventName).toBe(
      "guardrail_decision",
    );
  });

  it("riskTierRules cover T0..T5 exactly once each", () => {
    const tiers = PLATFORM_DEFAULT_GUARDRAIL_POLICY.riskTierRules.map((r) => r.tier).sort();
    expect(tiers).toEqual(["T0", "T1", "T2", "T3", "T4", "T5"]);
  });

  it("T4 and T5 default to block with no allowed actions", () => {
    const t4 = getRiskTierRule("T4")!;
    const t5 = getRiskTierRule("T5")!;
    expect(t4.defaultDecision).toBe("block");
    expect(t5.defaultDecision).toBe("block");
    expect(t4.allowedActionIds).toEqual([]);
    expect(t5.allowedActionIds).toEqual([]);
  });

  it("T3 defaults to block or require_human_review", () => {
    const t3 = getRiskTierRule("T3")!;
    expect(["block", "require_human_review"]).toContain(t3.defaultDecision);
  });

  it("T0 does not require human review by default", () => {
    const t0 = getRiskTierRule("T0")!;
    expect(t0.humanReviewRequired).toBe(false);
  });

  it("policy-level allowedActionIds covers every v1 action id with no overlap with blockedActionIds", () => {
    expect([...PLATFORM_DEFAULT_GUARDRAIL_POLICY.allowedActionIds].sort()).toEqual(
      [...ACTION_IDS].sort(),
    );
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.blockedActionIds).toEqual([]);
  });

  it("triggers cover every required kind", () => {
    const kinds = new Set(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.triggers.map((t) => t.kind),
    );
    for (const required of REQUIRED_GUARDRAIL_TRIGGER_KINDS) {
      expect(kinds.has(required)).toBe(true);
    }
  });

  it("high-risk triggers resolve to block or require_human_review", () => {
    for (const kind of [
      "payment_or_financial",
      "legal_medical_immigration_hr",
      "irreversible_or_binding_action",
      "autonomous_action",
    ] as const) {
      const t = getGuardrailTrigger(kind)!;
      expect(t).toBeTruthy();
      expect(["block", "require_human_review"]).toContain(t.decision);
    }
  });

  it("sensitiveFieldRules cover every required pattern with block / human-review decisions only", () => {
    const patterns = new Set(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.sensitiveFieldRules.map((r) => r.pattern),
    );
    for (const required of REQUIRED_SENSITIVE_FIELD_PATTERNS) {
      expect(patterns.has(required)).toBe(true);
    }
    for (const r of PLATFORM_DEFAULT_GUARDRAIL_POLICY.sensitiveFieldRules) {
      expect(["block", "require_human_review"]).toContain(r.decision);
    }
  });

  it("logging.redactPatterns covers every required pattern", () => {
    const redact = new Set(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.logging.redactPatterns,
    );
    for (const required of REQUIRED_SENSITIVE_FIELD_PATTERNS) {
      expect(redact.has(required)).toBe(true);
    }
  });

  it("blockedTopics and forbiddenPhrases are non-empty and align with the platform stance", () => {
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.blockedTopics.length).toBeGreaterThan(0);
    expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.forbiddenPhrases.length).toBeGreaterThan(0);
    for (const topic of [
      "payment",
      "escrow",
      "deposit",
      "insurance",
      "legal advice",
      "medical advice",
      "immigration decision",
      "financial recommendation",
    ]) {
      expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.blockedTopics).toContain(topic);
    }
    for (const phrase of [
      "autonomous action",
      "fully automatic decision",
      "guaranteed conversion",
      "replaces human judgment",
    ]) {
      expect(PLATFORM_DEFAULT_GUARDRAIL_POLICY.forbiddenPhrases).toContain(phrase);
    }
  });
});

// ---------------------------------------------------------------
// Closed-vocab drift detection
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — top-level vocab", () => {
  it("flags out-of-vocab mode / fallback / logging requirement", () => {
    const policy = buildValidPolicy((p) => {
      (p as unknown as Record<string, unknown>).mode = "evil_mode";
      (p as unknown as Record<string, unknown>).fallbackStyle = "evil_fallback";
      p.logging = { ...p.logging, requirement: "evil_log" as never };
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /mode 'evil_mode'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /fallbackStyle 'evil_fallback'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /logging\.requirement: 'evil_log'/.test(e))).toBe(true);
  });

  it("flags an empty id / label / purpose", () => {
    const policy = buildValidPolicy((p) => {
      p.id = "";
      p.label = "";
      p.purpose = "";
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /^id: must be a non-empty string/.test(e))).toBe(true);
    expect(r.errors.some((e) => /label:.*non-empty/.test(e))).toBe(true);
    expect(r.errors.some((e) => /purpose:.*non-empty/.test(e))).toBe(true);
  });

  it("flags an unknown action id in policy.allowedActionIds", () => {
    const policy = buildValidPolicy((p) => {
      p.allowedActionIds = [...p.allowedActionIds, "ghost_action"];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /allowedActionIds: 'ghost_action' is not a known Action registry id/.test(e),
      ),
    ).toBe(true);
  });

  it("flags overlap between policy.allowedActionIds and policy.blockedActionIds", () => {
    const policy = buildValidPolicy((p) => {
      p.blockedActionIds = ["create_lead"];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /action id 'create_lead' appears in BOTH allowedActionIds and blockedActionIds/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Risk-tier rule drift detection
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — risk tier rules", () => {
  it("flags a duplicate riskTierRule for the same tier", () => {
    const policy = buildValidPolicy((p) => {
      const t1 = p.riskTierRules.find((r) => r.tier === "T1")!;
      p.riskTierRules = [...p.riskTierRules, { ...t1 }];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /duplicate riskTierRule for tier 'T1'/.test(e)),
    ).toBe(true);
  });

  it("flags a missing risk-tier rule", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.filter((r) => r.tier !== "T2");
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /missing rule for tier 'T2'/.test(e)),
    ).toBe(true);
  });

  it("flags T4 with non-block default decision", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T4"
          ? { ...r, defaultDecision: "require_human_review" }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /tier 'T4' must default to 'block'/.test(e)),
    ).toBe(true);
  });

  it("flags T5 with non-block default decision", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T5" ? { ...r, defaultDecision: "allow" } : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /tier 'T5' must default to 'block'/.test(e)),
    ).toBe(true);
  });

  it("flags T3 with default 'allow'", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T3"
          ? {
              ...r,
              defaultDecision: "allow",
              humanReviewRequired: false,
              confirmationRequired: false,
            }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /tier 'T3' must default to 'block' or 'require_human_review'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags T0 with humanReviewRequired === true", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T0" ? { ...r, humanReviewRequired: true } : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /tier 'T0' must not require human review by default/.test(e)),
    ).toBe(true);
  });

  it("flags T4 / T5 rules that list any allowedActionIds", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T4" ? { ...r, allowedActionIds: ["create_lead"] } : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /tier 'T4' must not list any allowedActionIds/.test(e)),
    ).toBe(true);
  });

  it("flags an unknown action id inside a riskTierRule's allowedActionIds", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T1"
          ? { ...r, allowedActionIds: [...r.allowedActionIds, "ghost"] }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /riskTierRules\[\d+\]\.allowedActionIds: 'ghost' is not a known Action registry id/.test(e),
      ),
    ).toBe(true);
  });

  it("flags overlap between a rule's allowed and blocked action ids", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T1"
          ? { ...r, blockedActionIds: ["create_lead"] }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /action id 'create_lead' appears in BOTH allowedActionIds and blockedActionIds/.test(e),
      ),
    ).toBe(true);
  });

  it("flags humanReviewRequired === true with non-review / non-block defaultDecision", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T1"
          ? {
              ...r,
              humanReviewRequired: true,
              defaultDecision: "require_confirmation",
            }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /humanReviewRequired === true requires defaultDecision in \{require_human_review, block\}/.test(e),
      ),
    ).toBe(true);
  });

  it("flags confirmationRequired === true with defaultDecision 'allow'", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T0"
          ? {
              ...r,
              confirmationRequired: true,
              defaultDecision: "allow",
            }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /confirmationRequired === true forbids defaultDecision 'allow'/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — triggers", () => {
  it("flags a missing required trigger kind", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.filter((t) => t.kind !== "missing_registered_knowledge");
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /missing required trigger for kind 'missing_registered_knowledge'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a payment_or_financial trigger with decision 'allow'", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "payment_or_financial" ? { ...t, decision: "allow" } : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /kind 'payment_or_financial' must resolve to 'block' or 'require_human_review'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a legal_medical_immigration_hr trigger with decision 'allow'", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "legal_medical_immigration_hr"
          ? { ...t, decision: "allow" }
          : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /kind 'legal_medical_immigration_hr' must resolve to 'block' or 'require_human_review'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an irreversible_or_binding_action trigger with decision 'require_confirmation'", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "irreversible_or_binding_action"
          ? { ...t, decision: "require_confirmation" }
          : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /kind 'irreversible_or_binding_action' must resolve to 'block' or 'require_human_review'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an autonomous_action trigger with decision 'fallback'", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "autonomous_action" ? { ...t, decision: "fallback" } : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /kind 'autonomous_action' must resolve to 'block' or 'require_human_review'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty trigger message / notes", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "forbidden_phrase"
          ? { ...t, message: "", notes: [] }
          : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /triggers\[\d+\]\.message:.*non-empty/.test(e)),
    ).toBe(true);
    expect(
      r.errors.some((e) => /triggers\[\d+\]\.notes: must declare at least one note/.test(e)),
    ).toBe(true);
  });

  it("flags an out-of-vocab trigger kind / decision / fallback / log requirement", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = [
        ...p.triggers,
        {
          kind: "evil_kind" as never,
          decision: "evil_decision" as never,
          fallbackStyle: "evil_fallback" as never,
          logRequirement: "evil_log" as never,
          message: "should never appear",
          notes: ["unused"],
        } as GuardrailTrigger,
      ];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /kind 'evil_kind'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /decision 'evil_decision'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /fallbackStyle 'evil_fallback'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /logRequirement 'evil_log'/.test(e))).toBe(true);
  });
});

// ---------------------------------------------------------------
// Sensitive field rules
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — sensitive field rules", () => {
  it("flags a missing required pattern (e.g. 'password')", () => {
    const policy = buildValidPolicy((p) => {
      p.sensitiveFieldRules = p.sensitiveFieldRules.filter(
        (r) => r.pattern !== "password",
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitiveFieldRules: missing required pattern 'password'/.test(e),
      ),
    ).toBe(true);
  });

  it("flags a sensitive field rule with decision 'allow'", () => {
    const policy = buildValidPolicy((p) => {
      p.sensitiveFieldRules = p.sensitiveFieldRules.map((r) =>
        r.pattern === "ssn" ? { ...r, decision: "allow" } : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitive-field decision must be 'block' or 'require_human_review' \(got 'allow'\)/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty sensitiveFieldRules array", () => {
    const policy = buildValidPolicy((p) => {
      p.sensitiveFieldRules = [];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /sensitiveFieldRules: must declare at least one rule/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Logging rules
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — logging", () => {
  it("flags a non-snake-case logging.eventName", () => {
    const policy = buildValidPolicy((p) => {
      p.logging = { ...p.logging, eventName: "GuardrailDecision" };
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /logging\.eventName 'GuardrailDecision' must match \/\^\[a-z\]\[a-z0-9_\]\*\$\//.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty redactPatterns array", () => {
    const policy = buildValidPolicy((p) => {
      p.logging = { ...p.logging, redactPatterns: [] };
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /redactPatterns: must declare at least one pattern/.test(e),
      ),
    ).toBe(true);
  });

  it("flags redactPatterns missing a required sensitive pattern", () => {
    const policy = buildValidPolicy((p) => {
      p.logging = {
        ...p.logging,
        redactPatterns: p.logging.redactPatterns.filter(
          (x) => x !== "credit_card",
        ),
      };
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /redactPatterns: missing required pattern 'credit_card'/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// blockedTopics / forbiddenPhrases / safetyNotes
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — topics / phrases / safety notes", () => {
  it("flags an empty blockedTopics array", () => {
    const policy = buildValidPolicy((p) => {
      p.blockedTopics = [];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /blockedTopics: must declare at least one topic/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty forbiddenPhrases array", () => {
    const policy = buildValidPolicy((p) => {
      p.forbiddenPhrases = [];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /forbiddenPhrases: must declare at least one phrase/.test(e),
      ),
    ).toBe(true);
  });

  it("flags an empty safetyNotes array", () => {
    const policy = buildValidPolicy((p) => {
      p.safetyNotes = [];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /safetyNotes: must declare at least one note/.test(e),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// Visual-implementation banlist + raw template fragments
// ---------------------------------------------------------------

describe("validateGuardrailPolicy — visual / template banlists", () => {
  it("rejects a hex color in the policy purpose", () => {
    const policy = buildValidPolicy((p) => {
      p.purpose = "Use brand color #ff5733 to render.";
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(hex color\)/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects px / rem / ms units in safety notes", () => {
    const policy = buildValidPolicy((p) => {
      p.safetyNotes = [...p.safetyNotes, "Animation duration 300ms is fine."];
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(css unit/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a font-family name in a trigger message", () => {
    const policy = buildValidPolicy((p) => {
      p.triggers = p.triggers.map((t) =>
        t.kind === "forbidden_phrase"
          ? { ...t, message: "Render in Helvetica." }
          : t,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(common font-family name\)/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a tailwind utility class in a risk-tier rule note", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T1"
          ? {
              ...r,
              notes: [...r.notes, "Render with bg-black text-white."],
            }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /contains a visual-implementation token \(tailwind-style utility class\)/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects raw HTML / template fragments in a sensitive-field rule reason", () => {
    const policy = buildValidPolicy((p) => {
      p.sensitiveFieldRules = p.sensitiveFieldRules.map((r) =>
        r.pattern === "ssn"
          ? {
              ...r,
              reason: "Visit <b>here</b> for the secure form.",
            }
          : r,
      );
    });
    const r = validateGuardrailPolicy(policy);
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
// assertValidGuardrailPolicy (throwing variant)
// ---------------------------------------------------------------

describe("assertValidGuardrailPolicy", () => {
  it("does not throw for the platform default", () => {
    expect(() =>
      assertValidGuardrailPolicy(PLATFORM_DEFAULT_GUARDRAIL_POLICY),
    ).not.toThrow();
  });

  it("throws for a policy whose T4 rule does not block by default", () => {
    const policy = buildValidPolicy((p) => {
      p.riskTierRules = p.riskTierRules.map((r) =>
        r.tier === "T4"
          ? { ...r, defaultDecision: "require_human_review" }
          : r,
      );
    });
    expect(() => assertValidGuardrailPolicy(policy)).toThrow(
      /tier 'T4' must default to 'block'/,
    );
  });
});

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

describe("listRiskTierRules / getRiskTierRule", () => {
  it("listRiskTierRules returns the rules from the default policy when none is supplied", () => {
    expect(listRiskTierRules()).toEqual(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.riskTierRules,
    );
  });

  it("getRiskTierRule looks up by tier and returns null for unknown / non-string", () => {
    expect(getRiskTierRule("T1")?.tier).toBe("T1");
    expect(getRiskTierRule("T9")).toBeNull();
    expect(getRiskTierRule(undefined as unknown as string)).toBeNull();
  });
});

describe("listGuardrailTriggers / getGuardrailTrigger", () => {
  it("returns the trigger for a known kind and null otherwise", () => {
    expect(getGuardrailTrigger("payment_or_financial")?.kind).toBe(
      "payment_or_financial",
    );
    expect(getGuardrailTrigger("ghost_kind")).toBeNull();
  });

  it("listGuardrailTriggers returns the policy's triggers", () => {
    expect(listGuardrailTriggers()).toEqual(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.triggers,
    );
  });
});

describe("getSensitiveFieldRules", () => {
  it("returns 25 default rules with block / human-review decisions only", () => {
    const rules = getSensitiveFieldRules();
    expect(rules.length).toBe(REQUIRED_SENSITIVE_FIELD_PATTERNS.length);
    for (const r of rules) {
      expect(["block", "require_human_review"]).toContain(r.decision);
    }
  });
});

describe("isActionAllowedByPolicy / isActionBlockedByPolicy", () => {
  it("returns true for an action in policy.allowedActionIds", () => {
    expect(isActionAllowedByPolicy("create_lead")).toBe(true);
  });

  it("returns false for an unknown action id or empty input", () => {
    expect(isActionAllowedByPolicy("ghost_action")).toBe(false);
    expect(isActionAllowedByPolicy("")).toBe(false);
  });

  it("returns false from isActionBlockedByPolicy when the default policy blocks nothing", () => {
    for (const id of ACTION_IDS) {
      expect(isActionBlockedByPolicy(id)).toBe(false);
    }
  });

  it("returns true from isActionBlockedByPolicy when the action is in policy.blockedActionIds", () => {
    const policy = buildValidPolicy((p) => {
      p.allowedActionIds = p.allowedActionIds.filter((x) => x !== "create_lead");
      p.blockedActionIds = ["create_lead"];
    });
    expect(isActionBlockedByPolicy("create_lead", policy)).toBe(true);
    expect(isActionAllowedByPolicy("create_lead", policy)).toBe(false);
  });
});

describe("getDefaultDecisionForRiskTier", () => {
  it("returns the default decision for a known tier and null otherwise", () => {
    expect(getDefaultDecisionForRiskTier("T0")).toBe("allow");
    expect(getDefaultDecisionForRiskTier("T4")).toBe("block");
    expect(getDefaultDecisionForRiskTier("T5")).toBe("block");
    expect(getDefaultDecisionForRiskTier("T9")).toBeNull();
  });
});

describe("getTriggersByDecision", () => {
  it("returns only triggers whose decision matches the requested value", () => {
    const blocked = getTriggersByDecision("block");
    expect(blocked.length).toBeGreaterThan(0);
    for (const t of blocked) {
      expect(t.decision).toBe("block");
    }
  });

  it("returns [] for an out-of-vocab decision", () => {
    expect(getTriggersByDecision("scream")).toEqual([]);
  });
});

describe("getBlockedTopics / getForbiddenPhrases", () => {
  it("returns the same arrays as the policy holds", () => {
    expect(getBlockedTopics()).toEqual(PLATFORM_DEFAULT_GUARDRAIL_POLICY.blockedTopics);
    expect(getForbiddenPhrases()).toEqual(
      PLATFORM_DEFAULT_GUARDRAIL_POLICY.forbiddenPhrases,
    );
  });
});

// ---------------------------------------------------------------
// Platform terminology + CoRent residue scan
// ---------------------------------------------------------------

describe("GuardrailPolicy — platform terminology + no CoRent residue", () => {
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

  it("default policy id / label / purpose contain no strict-banned CoRent terms", () => {
    expectClean("id", PLATFORM_DEFAULT_GUARDRAIL_POLICY.id);
    expectClean("label", PLATFORM_DEFAULT_GUARDRAIL_POLICY.label);
    expectClean("purpose", PLATFORM_DEFAULT_GUARDRAIL_POLICY.purpose);
  });

  it("riskTierRule notes contain no strict-banned CoRent terms", () => {
    for (const rule of PLATFORM_DEFAULT_GUARDRAIL_POLICY.riskTierRules) {
      for (let i = 0; i < rule.notes.length; i++) {
        expectClean(`riskTierRules[${rule.tier}].notes[${i}]`, rule.notes[i]!);
      }
    }
  });

  it("trigger messages and notes contain no strict-banned CoRent terms", () => {
    for (const trig of PLATFORM_DEFAULT_GUARDRAIL_POLICY.triggers) {
      expectClean(`triggers[${trig.kind}].message`, trig.message);
      for (let i = 0; i < trig.notes.length; i++) {
        expectClean(`triggers[${trig.kind}].notes[${i}]`, trig.notes[i]!);
      }
    }
  });

  it("sensitive field reasons contain no strict-banned CoRent terms", () => {
    for (const rule of PLATFORM_DEFAULT_GUARDRAIL_POLICY.sensitiveFieldRules) {
      expectClean(`sensitiveFieldRules[${rule.pattern}].reason`, rule.reason);
    }
  });

  it("safetyNotes contain no strict-banned CoRent terms", () => {
    for (let i = 0; i < PLATFORM_DEFAULT_GUARDRAIL_POLICY.safetyNotes.length; i++) {
      expectClean(
        `safetyNotes[${i}]`,
        PLATFORM_DEFAULT_GUARDRAIL_POLICY.safetyNotes[i]!,
      );
    }
  });
});

// ---------------------------------------------------------------
// Import boundary + I/O surface
// ---------------------------------------------------------------

describe("GuardrailPolicy — import boundary", () => {
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

  it("imports only from ./actionRegistry — no other CIE module or external runtime", () => {
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/actionRegistry["']/);
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(1);
  });
});

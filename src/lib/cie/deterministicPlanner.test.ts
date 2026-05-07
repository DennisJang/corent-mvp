// Tests for the CIE Deterministic Planner v1.
//
// Coverage split:
//
//   - Behavior is tested directly against the real
//     `planCIEExperience` + `validateCIEPlan` against the
//     production knowledge registry (8 v1 cards).
//   - Closed-vocabulary, banlist, and import-boundary invariants
//     are pinned at the source level via readFileSync.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CIE_ALLOWED_BLOCKS,
  CIE_RELATED_ACTIONS,
} from "./knowledgeRegistry";
import {
  assertNoBannedClaimsInCIEPlan,
  planCIEExperience,
  validateCIEPlan,
  type CIEBlockRecipe,
  type CIEPlan,
} from "./deterministicPlanner";

const FILE = join(
  process.cwd(),
  "src",
  "lib",
  "cie",
  "deterministicPlanner.ts",
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

const CLOSED_ALPHA_BANLIST: ReadonlyArray<string> = [
  "보증금",
  "보증",
  "보험",
  "보장",
  "결제 완료",
  "결제 진행",
  "결제 처리",
  "보증금 청구",
  "대여 확정",
  "환불",
  "정산 완료",
  "guaranteed",
  "insured",
  "insurance",
  "verified seller",
];

function blockTypes(plan: CIEPlan): string[] {
  return plan.blocks.map((b) => b.type);
}

function findBlock<T extends CIEBlockRecipe["type"]>(
  plan: CIEPlan,
  type: T,
): Extract<CIEBlockRecipe, { type: T }> | undefined {
  return plan.blocks.find((b) => b.type === type) as
    | Extract<CIEBlockRecipe, { type: T }>
    | undefined;
}

describe("planCIEExperience — basic shape and provenance", () => {
  it("returns kind:'planned' with provenance:'deterministic'", () => {
    const plan = planCIEExperience({ surface: "home" });
    expect(plan.kind).toBe("planned");
    expect(plan.provenance).toBe("deterministic");
  });

  it("returns deterministic output for the same input (byte-stable)", () => {
    const a = planCIEExperience({
      surface: "search",
      audience: "visitor",
      rawInput: "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
      category: "home_care",
      durationDays: 3,
      hasListings: true,
    });
    const b = planCIEExperience({
      surface: "search",
      audience: "visitor",
      rawInput: "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
      category: "home_care",
      durationDays: 3,
      hasListings: true,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("validateCIEPlan returns ok:true for production registry plans", () => {
    const plans: CIEPlan[] = [
      planCIEExperience({ surface: "home" }),
      planCIEExperience({
        surface: "search",
        rawInput: "다이슨 에어랩",
        category: "home_care",
        hasListings: true,
      }),
      planCIEExperience({
        surface: "search",
        rawInput: "다이슨 에어랩",
        hasListings: false,
      }),
      planCIEExperience({
        surface: "listing_detail",
        audience: "borrower",
        category: "massage_gun",
      }),
      planCIEExperience({
        surface: "requests",
        audience: "borrower",
        requestStatus: "requested",
      }),
      planCIEExperience({ surface: "dashboard", audience: "seller" }),
      planCIEExperience({
        surface: "admin_cockpit",
        audience: "founder",
      }),
    ];
    for (const plan of plans) {
      const r = validateCIEPlan(plan);
      expect(r.ok).toBe(true);
    }
  });
});

describe("planCIEExperience — search surface (CIE Step 02)", () => {
  it("rawInput + category + hasListings:true → intent_summary, try_criteria, listing_matches", () => {
    const plan = planCIEExperience({
      surface: "search",
      audience: "visitor",
      rawInput: "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
      category: "home_care",
      hasListings: true,
    });
    const types = blockTypes(plan);
    expect(types).toContain("intent_summary");
    expect(types).toContain("try_criteria");
    expect(types).toContain("listing_matches");
    const lm = findBlock(plan, "listing_matches");
    expect(lm?.mode).toBe("show_results");
  });

  it("rawInput + category + hasListings:false → wanted_request_cta enabled + safety_note", () => {
    const plan = planCIEExperience({
      surface: "search",
      audience: "visitor",
      rawInput: "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
      category: "home_care",
      hasListings: false,
    });
    const types = blockTypes(plan);
    expect(types).toContain("wanted_request_cta");
    expect(types).toContain("safety_note");

    const cta = findBlock(plan, "wanted_request_cta");
    expect(cta?.enabled).toBe(true);
    expect(cta?.reason).toBe("no_listings");

    // listing_matches must NOT appear in the empty branch — the
    // wanted form takes over.
    expect(types).not.toContain("listing_matches");
  });

  it("hasListings:true suppresses wanted_request_cta enabled state", () => {
    const plan = planCIEExperience({
      surface: "search",
      rawInput: "마사지건",
      category: "massage_gun",
      hasListings: true,
    });
    const cta = findBlock(plan, "wanted_request_cta");
    if (cta) {
      expect(cta.enabled).toBe(false);
      expect(cta.reason).toBe("listings_present");
    }
  });

  it("no category yields no try_criteria block (or no more than the safety fallback)", () => {
    const plan = planCIEExperience({
      surface: "search",
      rawInput: "그냥 뭔가 써보고 싶어요",
      hasListings: true,
    });
    const types = blockTypes(plan);
    expect(types).not.toContain("try_criteria");
    // Other safe blocks still flow as appropriate.
    expect(types).toContain("intent_summary");
  });

  it("intent_summary is suppressed when rawInput is empty", () => {
    const plan = planCIEExperience({
      surface: "search",
      hasListings: true,
    });
    expect(blockTypes(plan)).not.toContain("intent_summary");
  });
});

describe("planCIEExperience — surface routing", () => {
  it("dashboard + seller audience includes seller_readiness", () => {
    const plan = planCIEExperience({
      surface: "dashboard",
      audience: "seller",
    });
    const types = blockTypes(plan);
    expect(types).toContain("seller_readiness");
    // Seller card carries safety_note as a suggested block too.
    expect(types).toContain("safety_note");
  });

  it("admin_cockpit + founder audience includes founder_feedback_review", () => {
    const plan = planCIEExperience({
      surface: "admin_cockpit",
      audience: "founder",
    });
    const types = blockTypes(plan);
    expect(types).toContain("founder_feedback_review");
    // founder_review_demand intent maps only to the cockpit card,
    // not to the visitor safety_note (which lives on visitor
    // surfaces — admin_cockpit is not in its surfaces list).
  });

  it("requests + borrower audience includes request_status when status is supplied", () => {
    const plan = planCIEExperience({
      surface: "requests",
      audience: "borrower",
      requestStatus: "seller_approved",
    });
    const status = findBlock(plan, "request_status");
    expect(status).toBeDefined();
    expect(status?.status).toBe("seller_approved");
  });

  it("requests without requestStatus omits the request_status block", () => {
    const plan = planCIEExperience({
      surface: "requests",
      audience: "borrower",
    });
    expect(blockTypes(plan)).not.toContain("request_status");
  });

  it("listing_detail + borrower + category emits listing_readiness", () => {
    const plan = planCIEExperience({
      surface: "listing_detail",
      audience: "borrower",
      category: "massage_gun",
    });
    const lr = findBlock(plan, "listing_readiness");
    expect(lr).toBeDefined();
    expect(lr?.category).toBe("massage_gun");
  });

  it("listing_detail without a category does NOT emit listing_readiness", () => {
    const plan = planCIEExperience({
      surface: "listing_detail",
      audience: "borrower",
    });
    expect(blockTypes(plan)).not.toContain("listing_readiness");
  });

  it("home surface emits an intent_summary when rawInput is supplied (try-before-buy entry)", () => {
    const plan = planCIEExperience({
      surface: "home",
      rawInput: "사기 전에 며칠 써볼 만한 물건",
    });
    expect(blockTypes(plan)).toContain("intent_summary");
  });
});

describe("planCIEExperience — relatedActions are deduped, sorted, closed-vocab", () => {
  it("returns sorted unique CIERelatedAction values", () => {
    const plan = planCIEExperience({
      surface: "search",
      rawInput: "다이슨",
      category: "home_care",
      hasListings: false,
    });
    const sorted = [...plan.relatedActions].sort();
    expect([...plan.relatedActions]).toEqual(sorted);
    // Dedup invariant
    expect(new Set(plan.relatedActions).size).toBe(plan.relatedActions.length);
  });

  it("every relatedAction is a member of CIE_RELATED_ACTIONS", () => {
    const allowed = new Set<string>(CIE_RELATED_ACTIONS);
    const plans: CIEPlan[] = [
      planCIEExperience({ surface: "home", rawInput: "x" }),
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "home_care",
        hasListings: true,
      }),
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        hasListings: false,
      }),
      planCIEExperience({
        surface: "listing_detail",
        audience: "borrower",
        category: "massage_gun",
      }),
      planCIEExperience({
        surface: "requests",
        audience: "borrower",
        requestStatus: "requested",
      }),
      planCIEExperience({ surface: "dashboard", audience: "seller" }),
      planCIEExperience({
        surface: "admin_cockpit",
        audience: "founder",
      }),
    ];
    for (const plan of plans) {
      for (const a of plan.relatedActions) {
        expect(allowed.has(a)).toBe(true);
      }
    }
  });
});

describe("planCIEExperience — closed block-recipe vocabulary + sourceCardId resolves to registry", () => {
  it("every emitted block.type is in CIE_ALLOWED_BLOCKS", () => {
    const allowed = new Set<string>(CIE_ALLOWED_BLOCKS);
    const plans: CIEPlan[] = [
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "home_care",
        hasListings: true,
      }),
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        hasListings: false,
      }),
      planCIEExperience({
        surface: "listing_detail",
        audience: "borrower",
        category: "massage_gun",
      }),
      planCIEExperience({
        surface: "requests",
        audience: "borrower",
        requestStatus: "requested",
      }),
      planCIEExperience({ surface: "dashboard", audience: "seller" }),
      planCIEExperience({
        surface: "admin_cockpit",
        audience: "founder",
      }),
    ];
    for (const plan of plans) {
      for (const block of plan.blocks) {
        expect(allowed.has(block.type)).toBe(true);
      }
    }
  });

  it("every emitted block.sourceCardId resolves to a registry card", () => {
    const plan = planCIEExperience({
      surface: "search",
      rawInput: "마사지건",
      category: "massage_gun",
      hasListings: true,
    });
    expect(plan.cards.length).toBeGreaterThan(0);
    const cardIds = new Set(plan.cards.map((c) => c.id));
    for (const block of plan.blocks) {
      expect(cardIds.has(block.sourceCardId)).toBe(true);
    }
  });
});

describe("planCIEExperience — DTO discipline (no PII / authority slots)", () => {
  const FORBIDDEN_SLOTS = [
    "rawPrompt",
    "prompt",
    "rawBody",
    "body",
    "messages",
    "system",
    "contactEmail",
    "contact_email",
    "profileId",
    "profile_id",
    "borrowerId",
    "borrower_id",
    "sellerId",
    "seller_id",
    "exactAddress",
    "exact_address",
    "address",
    "trustScore",
    "trust_score",
    "payment",
    "settlement",
    "founderEmail",
    "is_admin",
    "role",
    "capability",
  ];

  it("no block carries any forbidden authority/PII slot", () => {
    const plans: CIEPlan[] = [
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "home_care",
        hasListings: true,
      }),
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        hasListings: false,
      }),
      planCIEExperience({
        surface: "listing_detail",
        audience: "borrower",
        category: "massage_gun",
      }),
      planCIEExperience({
        surface: "requests",
        audience: "borrower",
        requestStatus: "requested",
      }),
      planCIEExperience({ surface: "dashboard", audience: "seller" }),
      planCIEExperience({
        surface: "admin_cockpit",
        audience: "founder",
      }),
    ];
    for (const plan of plans) {
      for (const block of plan.blocks) {
        const record = block as unknown as Record<string, unknown>;
        for (const slot of FORBIDDEN_SLOTS) {
          expect(record[slot]).toBeUndefined();
        }
      }
    }
  });
});

describe("planCIEExperience — banlist scan", () => {
  it("no banned phrase appears anywhere in the production plans", () => {
    const plans: CIEPlan[] = [
      planCIEExperience({ surface: "home", rawInput: "사기 전에 며칠" }),
      planCIEExperience({
        surface: "search",
        rawInput: "다이슨 에어랩",
        category: "home_care",
        hasListings: true,
      }),
      planCIEExperience({
        surface: "search",
        rawInput: "다이슨 에어랩",
        hasListings: false,
      }),
      planCIEExperience({
        surface: "listing_detail",
        audience: "borrower",
        category: "massage_gun",
      }),
      planCIEExperience({
        surface: "requests",
        audience: "borrower",
        requestStatus: "seller_approved",
      }),
      planCIEExperience({ surface: "dashboard", audience: "seller" }),
      planCIEExperience({
        surface: "admin_cockpit",
        audience: "founder",
      }),
    ];
    for (const plan of plans) {
      expect(() =>
        assertNoBannedClaimsInCIEPlan(CLOSED_ALPHA_BANLIST, plan),
      ).not.toThrow();
    }
  });

  it("the banlist scanner detects an injected violation (smoke test)", () => {
    const plan: CIEPlan = {
      kind: "planned",
      cards: [],
      blocks: [
        {
          type: "safety_note",
          copy: "verified seller", // ← deliberately banned
          sourceCardId: "no_payment_yet_safety_note",
        },
      ],
      relatedActions: [],
      provenance: "deterministic",
    };
    expect(() =>
      assertNoBannedClaimsInCIEPlan(CLOSED_ALPHA_BANLIST, plan),
    ).toThrow(/verified seller/);
  });
});

describe("planCIEExperience — try_criteria payload comes from deterministic readiness service", () => {
  it("category-specific criteria are returned (massage_gun ≠ projector ≠ camera)", () => {
    const a = findBlock(
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "massage_gun",
        hasListings: true,
      }),
      "try_criteria",
    );
    const b = findBlock(
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "projector",
        hasListings: true,
      }),
      "try_criteria",
    );
    const c = findBlock(
      planCIEExperience({
        surface: "search",
        rawInput: "x",
        category: "camera",
        hasListings: true,
      }),
      "try_criteria",
    );
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    expect(a!.criteria).not.toEqual(b!.criteria);
    expect(b!.criteria).not.toEqual(c!.criteria);
    expect(a!.criteria).not.toEqual(c!.criteria);
    expect(a!.criteria.length).toBeLessThanOrEqual(4);
    expect(a!.criteria.length).toBeGreaterThanOrEqual(1);
  });
});

describe("validateCIEPlan — structural drift", () => {
  it("flags a non-deterministic provenance", () => {
    const r = validateCIEPlan({
      kind: "planned",
      cards: [],
      blocks: [],
      relatedActions: [],
      // @ts-expect-error — runtime guard
      provenance: "llm_candidate",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /provenance must be 'deterministic'/.test(e)),
    ).toBe(true);
  });

  it("flags an out-of-vocab block.type", () => {
    const r = validateCIEPlan({
      kind: "planned",
      cards: [],
      blocks: [
        {
          // @ts-expect-error — runtime guard
          type: "evil_block",
          sourceCardId: "home_try_before_buy_entry",
        } as unknown as CIEBlockRecipe,
      ],
      relatedActions: [],
      provenance: "deterministic",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /'evil_block' is not allowed/.test(e))).toBe(
      true,
    );
  });

  it("flags an unresolved sourceCardId", () => {
    const r = validateCIEPlan({
      kind: "planned",
      cards: [],
      blocks: [
        {
          type: "safety_note",
          copy: "calm copy",
          sourceCardId: "ghost_card",
        },
      ],
      relatedActions: [],
      provenance: "deterministic",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /'ghost_card' does not resolve/.test(e)),
    ).toBe(true);
  });

  it("flags a forbidden slot snuck onto a block", () => {
    const r = validateCIEPlan({
      kind: "planned",
      cards: [],
      blocks: [
        {
          type: "safety_note",
          copy: "calm copy",
          sourceCardId: "no_payment_yet_safety_note",
          // @ts-expect-error — forge attempt
          contactEmail: "leak@example.com",
        } as unknown as CIEBlockRecipe,
      ],
      relatedActions: [],
      provenance: "deterministic",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /forbidden slot 'contactEmail'/.test(e)),
    ).toBe(true);
  });

  it("flags an out-of-vocab relatedAction", () => {
    const r = validateCIEPlan({
      kind: "planned",
      cards: [],
      blocks: [],
      // @ts-expect-error — runtime guard
      relatedActions: ["evil_action"],
      provenance: "deterministic",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /out-of-vocab 'evil_action'/.test(e)),
    ).toBe(true);
  });
});

describe("deterministicPlanner — import boundary", () => {
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

  it("does NOT import any Supabase client / persistence / service-role module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does NOT import payment / claim / trust / handoff / notification / wanted-write / feedback modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
  });

  it("does NOT import React (planner is pure logic, not UI)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react["']/);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react\//);
    expect(IMPORT_BLOB).not.toMatch(/jsx-runtime/);
  });

  it("does NOT call any I/O surface in the runtime body", () => {
    expect(RUNTIME_SRC).not.toMatch(/process\.env/);
    expect(RUNTIME_SRC).not.toMatch(/\bfetch\(/);
    expect(RUNTIME_SRC).not.toMatch(/\bXMLHttpRequest\b/);
    expect(RUNTIME_SRC).not.toMatch(/readFile|writeFile|require\(/);
  });

  it("imports the deterministic readiness service and the registry only", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/services\/tryBeforeBuyReadinessService["']/,
    );
    expect(IMPORT_BLOB).toMatch(/from\s+["'].\/knowledgeRegistry["']/);
    expect(IMPORT_BLOB).toMatch(/from\s+["']@\/domain\/categories["']/);
  });
});

describe("deterministicPlanner — provenance pinned in source", () => {
  it("the planner only declares provenance 'deterministic' in literals", () => {
    const provenanceLiterals =
      RUNTIME_SRC.match(/provenance:\s*["']([^"']+)["']/g) ?? [];
    expect(provenanceLiterals.length).toBeGreaterThan(0);
    for (const m of provenanceLiterals) {
      expect(m).toMatch(/provenance:\s*["']deterministic["']/);
    }
  });

  it("the runtime body never references llm_candidate / human_reviewed authority strings", () => {
    expect(RUNTIME_SRC).not.toContain('"llm_candidate"');
    expect(RUNTIME_SRC).not.toContain("'llm_candidate'");
    expect(RUNTIME_SRC).not.toContain('"human_reviewed"');
    expect(RUNTIME_SRC).not.toContain("'human_reviewed'");
  });
});

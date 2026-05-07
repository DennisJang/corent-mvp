// Tests for the CIE Knowledge Registry v1.
//
// Coverage split:
//
//   - Behavior of the pure helpers + validators is tested
//     directly against the exported registry (8 v1 cards).
//   - Closed-vocabulary, banlist, and import-boundary invariants
//     are also pinned at the source level via readFileSync —
//     same approach as the readiness card, search-intent summary,
//     and wanted-form tests.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CIE_ALLOWED_BLOCKS,
  CIE_AUDIENCES,
  CIE_INTENT_KINDS,
  CIE_RELATED_ACTIONS,
  CIE_SURFACES,
  assertNoBannedClaimsInKnowledgeRegistry,
  findCIEKnowledgeCards,
  getCIEKnowledgeCard,
  listCIEAllowedBlocks,
  listCIEKnowledgeCards,
  listCIERelatedActions,
  validateCIEKnowledgeRegistry,
  type CIEAudience,
  type CIEIntentKind,
  type CIEKnowledgeCard,
  type CIESurface,
} from "./knowledgeRegistry";

const FILE = join(
  process.cwd(),
  "src",
  "lib",
  "cie",
  "knowledgeRegistry.ts",
);
const SRC = readFileSync(FILE, "utf-8");

// Strip line + block comments before scanning so the docstring's
// negation references to banned phrases do not produce false
// positives. The IMPORT_BLOB scan uses the same comment-stripped
// source.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

// Closed-alpha banlist literals. Mirror of the
// `corent_closed_alpha_quality_gates.md` §"Banned Copy Rules".
// Kept local to this test so the registry module stays free of
// banlist data (separation of concerns) and so the assertion
// helper is callable with any banlist a future runtime might
// pass in.
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

describe("CIE Knowledge Registry — closed vocabularies", () => {
  it("CIE_AUDIENCES is exactly the four expected values", () => {
    expect([...CIE_AUDIENCES].sort()).toEqual(
      ["borrower", "founder", "seller", "visitor"].sort(),
    );
  });

  it("CIE_SURFACES is exactly the six expected values", () => {
    expect([...CIE_SURFACES].sort()).toEqual(
      [
        "admin_cockpit",
        "dashboard",
        "home",
        "listing_detail",
        "requests",
        "search",
      ].sort(),
    );
  });

  it("CIE_INTENT_KINDS is exactly the seven expected values", () => {
    expect([...CIE_INTENT_KINDS].sort()).toEqual(
      [
        "create_listing",
        "find_listing",
        "founder_review_demand",
        "leave_wanted_request",
        "review_request_status",
        "seller_improve_listing",
        "try_before_buy",
      ].sort(),
    );
  });

  it("CIE_ALLOWED_BLOCKS lists the nine architecture-aligned ids", () => {
    expect([...CIE_ALLOWED_BLOCKS].sort()).toEqual(
      [
        "founder_feedback_review",
        "intent_summary",
        "listing_matches",
        "listing_readiness",
        "request_status",
        "safety_note",
        "seller_readiness",
        "try_criteria",
        "wanted_request_cta",
      ].sort(),
    );
  });

  it("CIE_RELATED_ACTIONS lists the eight architecture-aligned ids (incl. _future)", () => {
    expect([...CIE_RELATED_ACTIONS].sort()).toEqual(
      [
        "create_rental_request",
        "create_seller_draft",
        "create_wanted_request",
        "derive_try_criteria",
        "search_listings",
        "show_request_status",
        "show_seller_demand_signals_future",
        "update_feedback_status",
      ].sort(),
    );
  });
});

describe("CIE Knowledge Registry — listCIEKnowledgeCards / non-empty registry", () => {
  it("exports a non-empty card array", () => {
    const cards = listCIEKnowledgeCards();
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("includes the eight v1 cards required by the task", () => {
    const ids = listCIEKnowledgeCards().map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "borrower_request_status",
        "founder_wanted_feedback_review",
        "home_try_before_buy_entry",
        "listing_readiness",
        "no_payment_yet_safety_note",
        "search_empty_wanted_request",
        "search_intent_summary",
        "seller_listing_readiness",
      ].sort(),
    );
  });

  it("every card has provenance 'deterministic'", () => {
    for (const c of listCIEKnowledgeCards()) {
      expect(c.provenance).toBe("deterministic");
    }
  });

  it("every card has a non-empty title and safeSummary", () => {
    for (const c of listCIEKnowledgeCards()) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.safeSummary.trim().length).toBeGreaterThan(0);
    }
  });

  it("every card's allowedClaims and forbiddenClaims are arrays", () => {
    for (const c of listCIEKnowledgeCards()) {
      expect(Array.isArray(c.allowedClaims)).toBe(true);
      expect(Array.isArray(c.forbiddenClaims)).toBe(true);
    }
  });

  it("card ids are unique", () => {
    const ids = listCIEKnowledgeCards().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("CIE Knowledge Registry — closed-vocabulary membership", () => {
  it("every card audience is in CIE_AUDIENCES", () => {
    const set = new Set<CIEAudience>(CIE_AUDIENCES);
    for (const c of listCIEKnowledgeCards()) {
      expect(set.has(c.audience)).toBe(true);
    }
  });

  it("every card surface is in CIE_SURFACES", () => {
    const set = new Set<CIESurface>(CIE_SURFACES);
    for (const c of listCIEKnowledgeCards()) {
      for (const s of c.surfaces) {
        expect(set.has(s)).toBe(true);
      }
    }
  });

  it("every card intentKind is in CIE_INTENT_KINDS", () => {
    const set = new Set<CIEIntentKind>(CIE_INTENT_KINDS);
    for (const c of listCIEKnowledgeCards()) {
      expect(set.has(c.intentKind)).toBe(true);
    }
  });

  it("every card suggestedBlock is in CIE_ALLOWED_BLOCKS", () => {
    const set = new Set<string>(CIE_ALLOWED_BLOCKS);
    for (const c of listCIEKnowledgeCards()) {
      for (const b of c.suggestedBlocks) {
        expect(set.has(b)).toBe(true);
      }
    }
  });

  it("every card relatedAction is in CIE_RELATED_ACTIONS", () => {
    const set = new Set<string>(CIE_RELATED_ACTIONS);
    for (const c of listCIEKnowledgeCards()) {
      for (const a of c.relatedActions) {
        expect(set.has(a)).toBe(true);
      }
    }
  });
});

describe("CIE Knowledge Registry — DTO discipline (no PII / authority slot)", () => {
  it("the CIEKnowledgeCard shape exposes none of the forbidden slots", () => {
    // Each card is a structural record. Read every key on every
    // card and assert no forbidden slot is present, even by
    // accident. Belt-and-suspenders alongside the type system.
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
    for (const c of listCIEKnowledgeCards()) {
      for (const k of FORBIDDEN_SLOTS) {
        expect(
          (c as unknown as Record<string, unknown>)[k],
        ).toBeUndefined();
      }
    }
  });
});

describe("CIE Knowledge Registry — banlist scan", () => {
  it("no banned phrase appears in any title / safeSummary / allowedClaims / forbiddenClaims", () => {
    expect(() =>
      assertNoBannedClaimsInKnowledgeRegistry(CLOSED_ALPHA_BANLIST),
    ).not.toThrow();
  });

  it("the banlist scanner detects an injected violation (smoke test of the helper itself)", () => {
    const tainted: CIEKnowledgeCard = {
      id: "tainted",
      audience: "visitor",
      surfaces: ["home"],
      intentKind: "try_before_buy",
      title: "verified seller", // ← deliberately banned
      safeSummary: "ok",
      allowedClaims: [],
      forbiddenClaims: [],
      suggestedBlocks: [],
      relatedActions: [],
      provenance: "deterministic",
    };
    expect(() =>
      assertNoBannedClaimsInKnowledgeRegistry(CLOSED_ALPHA_BANLIST, [
        tainted,
      ]),
    ).toThrow(/verified seller/);
  });
});

describe("CIE Knowledge Registry — query helpers", () => {
  it("getCIEKnowledgeCard returns the card by id", () => {
    const c = getCIEKnowledgeCard("home_try_before_buy_entry");
    expect(c).not.toBeNull();
    expect(c?.id).toBe("home_try_before_buy_entry");
    expect(c?.audience).toBe("visitor");
  });

  it("getCIEKnowledgeCard returns null for an unknown id", () => {
    expect(getCIEKnowledgeCard("does_not_exist")).toBeNull();
  });

  it("getCIEKnowledgeCard returns null for an empty / non-string id", () => {
    expect(getCIEKnowledgeCard("")).toBeNull();
    expect(
      getCIEKnowledgeCard(undefined as unknown as string),
    ).toBeNull();
    expect(getCIEKnowledgeCard(null as unknown as string)).toBeNull();
    expect(
      getCIEKnowledgeCard(123 as unknown as string),
    ).toBeNull();
  });

  it("findCIEKnowledgeCards filters by audience", () => {
    const seller = findCIEKnowledgeCards({ audience: "seller" });
    expect(seller.length).toBe(1);
    expect(seller[0]?.id).toBe("seller_listing_readiness");

    const founder = findCIEKnowledgeCards({ audience: "founder" });
    expect(founder.length).toBe(1);
    expect(founder[0]?.id).toBe("founder_wanted_feedback_review");

    const visitor = findCIEKnowledgeCards({ audience: "visitor" });
    expect(visitor.length).toBeGreaterThanOrEqual(4);
    for (const c of visitor) {
      expect(c.audience).toBe("visitor");
    }

    const borrower = findCIEKnowledgeCards({ audience: "borrower" });
    expect(borrower.length).toBe(2);
    expect(borrower.map((c) => c.id).sort()).toEqual([
      "borrower_request_status",
      "listing_readiness",
    ]);
  });

  it("findCIEKnowledgeCards filters by surface", () => {
    const home = findCIEKnowledgeCards({ surface: "home" });
    expect(home.map((c) => c.id).sort()).toEqual([
      "home_try_before_buy_entry",
      "no_payment_yet_safety_note",
    ]);

    const search = findCIEKnowledgeCards({ surface: "search" });
    expect(search.map((c) => c.id).sort()).toEqual([
      "no_payment_yet_safety_note",
      "search_empty_wanted_request",
      "search_intent_summary",
    ]);

    const cockpit = findCIEKnowledgeCards({ surface: "admin_cockpit" });
    expect(cockpit.map((c) => c.id)).toEqual([
      "founder_wanted_feedback_review",
    ]);
  });

  it("findCIEKnowledgeCards filters by intentKind", () => {
    const review = findCIEKnowledgeCards({
      intentKind: "review_request_status",
    });
    expect(review.map((c) => c.id)).toEqual(["borrower_request_status"]);

    const founderReview = findCIEKnowledgeCards({
      intentKind: "founder_review_demand",
    });
    expect(founderReview.map((c) => c.id)).toEqual([
      "founder_wanted_feedback_review",
    ]);

    const wanted = findCIEKnowledgeCards({
      intentKind: "leave_wanted_request",
    });
    expect(wanted.map((c) => c.id)).toEqual(["search_empty_wanted_request"]);
  });

  it("findCIEKnowledgeCards combines filters with AND semantics", () => {
    const result = findCIEKnowledgeCards({
      audience: "visitor",
      surface: "search",
      intentKind: "find_listing",
    });
    expect(result.map((c) => c.id)).toEqual(["search_intent_summary"]);
  });

  it("findCIEKnowledgeCards with no filter returns all cards", () => {
    expect(findCIEKnowledgeCards().length).toBe(
      listCIEKnowledgeCards().length,
    );
    expect(findCIEKnowledgeCards({}).length).toBe(
      listCIEKnowledgeCards().length,
    );
  });

  it("listCIEAllowedBlocks returns the closed allow-block vocabulary", () => {
    expect([...listCIEAllowedBlocks()]).toEqual([...CIE_ALLOWED_BLOCKS]);
  });

  it("listCIERelatedActions returns the closed related-action vocabulary", () => {
    expect([...listCIERelatedActions()]).toEqual([...CIE_RELATED_ACTIONS]);
  });
});

describe("CIE Knowledge Registry — validateCIEKnowledgeRegistry", () => {
  it("returns ok:true for the production registry", () => {
    const r = validateCIEKnowledgeRegistry();
    expect(r.ok).toBe(true);
  });

  it("returns ok:false + a duplicate-id error when ids collide", () => {
    const a: CIEKnowledgeCard = {
      id: "dup",
      audience: "visitor",
      surfaces: ["home"],
      intentKind: "try_before_buy",
      title: "a",
      safeSummary: "a",
      allowedClaims: [],
      forbiddenClaims: [],
      suggestedBlocks: [],
      relatedActions: [],
      provenance: "deterministic",
    };
    const r = validateCIEKnowledgeRegistry([a, a]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /duplicate card id/.test(e))).toBe(true);
  });

  it("flags a card with an out-of-vocab audience", () => {
    const r = validateCIEKnowledgeRegistry([
      {
        id: "x",
        // @ts-expect-error — runtime guard
        audience: "stranger",
        surfaces: ["home"],
        intentKind: "try_before_buy",
        title: "x",
        safeSummary: "x",
        allowedClaims: [],
        forbiddenClaims: [],
        suggestedBlocks: [],
        relatedActions: [],
        provenance: "deterministic",
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /audience 'stranger'/.test(e))).toBe(true);
  });

  it("flags a card with an unknown suggestedBlock", () => {
    const r = validateCIEKnowledgeRegistry([
      {
        id: "y",
        audience: "visitor",
        surfaces: ["home"],
        intentKind: "try_before_buy",
        title: "y",
        safeSummary: "y",
        allowedClaims: [],
        forbiddenClaims: [],
        // @ts-expect-error — runtime guard
        suggestedBlocks: ["evil_block"],
        relatedActions: [],
        provenance: "deterministic",
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /suggestedBlock 'evil_block'/.test(e))).toBe(
      true,
    );
  });

  it("flags an empty title or safeSummary", () => {
    const r = validateCIEKnowledgeRegistry([
      {
        id: "z",
        audience: "visitor",
        surfaces: ["home"],
        intentKind: "try_before_buy",
        title: "",
        safeSummary: "  ",
        allowedClaims: [],
        forbiddenClaims: [],
        suggestedBlocks: [],
        relatedActions: [],
        provenance: "deterministic",
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /title is empty/.test(e))).toBe(true);
    expect(r.errors.some((e) => /safeSummary is empty/.test(e))).toBe(true);
  });

  it("flags a non-deterministic provenance", () => {
    const r = validateCIEKnowledgeRegistry([
      {
        id: "p",
        audience: "visitor",
        surfaces: ["home"],
        intentKind: "try_before_buy",
        title: "p",
        safeSummary: "p",
        allowedClaims: [],
        forbiddenClaims: [],
        suggestedBlocks: [],
        relatedActions: [],
        // @ts-expect-error — runtime guard
        provenance: "llm_candidate",
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /provenance must be 'deterministic'/.test(e)),
    ).toBe(true);
  });
});

describe("CIE Knowledge Registry — import boundary (server / LLM / payment / Supabase)", () => {
  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import any LLM provider / runtime / mock invoker", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai/i);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
    expect(IMPORT_BLOB).not.toMatch(/llmAdapter/);
    expect(IMPORT_BLOB).not.toMatch(/invoke/);
    expect(IMPORT_BLOB).not.toMatch(/mockAdapter/);
  });

  it("does NOT import any Supabase client / persistence / service-role module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does NOT import payment / claim / trust / handoff / notification / wanted-write modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
  });

  it("does NOT call out to any I/O surface in the runtime body", () => {
    // The registry is pure data + pure helpers. No network /
    // env / fs / process references should appear anywhere in
    // the runtime body.
    expect(RUNTIME_SRC).not.toMatch(/process\.env/);
    expect(RUNTIME_SRC).not.toMatch(/\bfetch\(/);
    expect(RUNTIME_SRC).not.toMatch(/\bXMLHttpRequest\b/);
    expect(RUNTIME_SRC).not.toMatch(/readFile|writeFile|require\(/);
  });
});

describe("CIE Knowledge Registry — provenance pinned in source", () => {
  it("the registry never declares provenance other than 'deterministic'", () => {
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

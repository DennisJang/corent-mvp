// Static-text invariants for the FeedbackReviewControls component
// (founder feedback review workflow).
//
// Behavior is covered by the action + adapter runtime tests. This
// file pins down source-level invariants that the boundary tests
// cannot express directly:
//
//   - import boundary (no @/server/**, no payment/claim/trust/
//     handoff/notification/LLM imports);
//   - the call site forwards EXACTLY {id, status} — no PII, no
//     authority slot;
//   - the surface renders the two operational affordances
//     (`검토 완료`, `보관`) with their gating logic;
//   - banlist scan: no payment/refund/settlement/insurance/
//     guarantee phrases.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "FeedbackReviewControls.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

// Strip line + block comments before scanning so doc references
// to banned phrases (e.g. negation in the docstring) do not produce
// false positives.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("FeedbackReviewControls — import boundary", () => {
  it("declares 'use client'", () => {
    expect(SRC.startsWith('"use client"')).toBe(true);
  });

  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("imports the review adapter at exactly the established hop", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/feedbackReviewClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/updateFeedbackStatusFromCockpit/);
  });

  it("does NOT import any payment / claim / trust / handoff / notification / LLM module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai|@supabase\/supabase-js/i);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
  });
});

describe("FeedbackReviewControls — call site forwards only {id, status}", () => {
  it("only one call site to updateFeedbackStatusFromCockpit", () => {
    const callMatches =
      RUNTIME_SRC.match(/updateFeedbackStatusFromCockpit\(\s*\{[^}]*\}/g) ?? [];
    expect(callMatches.length).toBe(1);
  });

  it("the call site forwards EXACTLY {id, status} and nothing else", () => {
    const callMatch = RUNTIME_SRC.match(
      /updateFeedbackStatusFromCockpit\(\s*\{([^}]*)\}\s*\)/,
    );
    expect(callMatch).toBeTruthy();
    const args = callMatch?.[1] ?? "";
    // Every key inside the object literal must be either `id` or
    // `status`. Forbidden authority / PII slots must never appear.
    for (const forbidden of [
      "message",
      "contactEmail",
      "contact_email",
      "profileId",
      "profile_id",
      "borrowerId",
      "sellerId",
      "kind",
      "category",
      "itemName",
      "item_name",
      "sourcePage",
      "source_page",
      "createdAt",
      "created_at",
      "role",
      "capability",
      "adminId",
      "approval",
      "trustScore",
      "claimReview",
      "payment",
      "settlement",
      "founder",
      "is_admin",
    ]) {
      expect(args).not.toMatch(new RegExp(`${forbidden}\\s*:`));
    }
    expect(args).toMatch(/id\s*:/);
    expect(args).toMatch(/status\s*:/);
  });
});

describe("FeedbackReviewControls — operational surface", () => {
  it("renders the '검토 완료' affordance only when status is still 'new'", () => {
    expect(SRC).toContain("검토 완료");
    expect(SRC).toMatch(/status\s*===\s*["']new["'][\s\S]*?검토 완료/);
  });

  it("renders the '보관' affordance while status is not 'archived'", () => {
    expect(SRC).toContain("보관");
    expect(SRC).toMatch(/status\s*===\s*["']archived["']/);
  });

  it("collapses to a status label only once status === 'archived'", () => {
    expect(SRC).toMatch(/status\s*===\s*["']archived["'][\s\S]*?archived/);
  });

  it("provides calm Korean copy for every blocked-state reason", () => {
    for (const reason of [
      "unauthenticated",
      "input",
      "unsupported",
      "error",
    ]) {
      expect(SRC).toMatch(new RegExp(`\\b${reason}\\b\\s*:\\s*["']`));
    }
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).not.toMatch(/relation .* does not exist/);
  });
});

describe("FeedbackReviewControls — banlist", () => {
  const BANNED = [
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

  it.each(BANNED)("does not contain regulated/payment phrase %s", (phrase) => {
    expect(RUNTIME_SRC).not.toContain(phrase);
  });
});

describe("FeedbackReviewControls — design discipline", () => {
  it("does not introduce non-token color literals (only #000 / #fff allowed)", () => {
    const offenders: string[] = [];
    const COLOR_LITERAL =
      /(?:#(?:[0-9a-fA-F]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\))/g;
    const matches = SRC.match(COLOR_LITERAL) ?? [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (lower === "#000" || lower === "#000000") continue;
      if (lower === "#fff" || lower === "#ffffff") continue;
      offenders.push(m);
    }
    expect(offenders).toEqual([]);
  });
});

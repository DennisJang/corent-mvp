// Static-text invariants for the PublishListingButton (Bundle 2,
// Slice 4 — founder publish UI). We rely on the action + adapter
// runtime tests for behavior; this file pins down source-level
// invariants that the boundary tests cannot express directly.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "PublishListingButton.tsx",
);
const SRC = readFileSync(FILE, "utf-8");
const IMPORT_BLOB = (
  SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

// `RUNTIME_SRC` is the source with line comments stripped so the
// banned-phrase scan does not catch documentation that explicitly
// names what the runtime does NOT do (e.g. the docstring saying
// the button "does not say 결제 / 환불").
const RUNTIME_SRC = SRC.replace(/^\s*\/\/.*$/gm, "");

describe("PublishListingButton — import boundary", () => {
  it("does not import from @/server/** (boundary canary)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("imports the publish adapter at exactly the established hop", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/publishListingClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/publishListingFromCockpit/);
  });

  it("does not import any payment / claim / trust / handoff / notification module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notification/i);
    expect(IMPORT_BLOB).not.toMatch(/getMockSellerSession/);
    expect(IMPORT_BLOB).not.toMatch(/getMockRenterSession/);
    expect(IMPORT_BLOB).not.toMatch(/rentalService/);
  });
});

describe("PublishListingButton — payload shape", () => {
  it("forwards only listingId to publishListingFromCockpit (single call site)", () => {
    const callMatches = SRC.match(
      /publishListingFromCockpit\(\s*\{[^}]*\}/g,
    ) ?? [];
    expect(callMatches).toHaveLength(1);
    const call = callMatches[0]!;
    expect(call).toMatch(/listingId/);
    for (const forbidden of [
      "sellerId",
      "status",
      "adminId",
      "role",
      "capability",
      "approval",
      "trustScore",
      "claimReview",
      "payment",
    ]) {
      expect(call).not.toMatch(new RegExp(`${forbidden}\\s*:`));
    }
  });
});

describe("PublishListingButton — copy", () => {
  it("uses 공개로 승인 (publish/approve) language, not payment language", () => {
    expect(SRC).toContain("공개로 승인");
    expect(SRC).toContain("이미 공개됨");
  });

  it("never implies payment / refund / settlement / guarantee in the runtime body", () => {
    for (const banned of [
      "결제",
      "환불",
      "정산 완료",
      "보험",
      "보장",
    ]) {
      expect(RUNTIME_SRC).not.toContain(banned);
    }
  });

  it("provides calm Korean copy for every blocked-state reason", () => {
    for (const reason of [
      "unauthenticated",
      "not_found",
      "input",
      "unsupported",
      "error",
    ]) {
      expect(SRC).toMatch(new RegExp(`\\b${reason}\\b\\s*:\\s*["']`));
    }
    // Server internals never appear in the copy.
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).not.toMatch(/relation .* does not exist/);
  });
});

describe("PublishListingButton — design discipline", () => {
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

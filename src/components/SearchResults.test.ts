// Static-text guards for SearchResults' leakage fix (post-
// 2026-05-05 smoke). Confirms the component does NOT seed its
// `listings` state with static `PRODUCTS` projections, and the
// `kind: "error"` branch surfaces a calm error panel rather than
// silently keeping demo products on screen.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "SearchResults.tsx",
);
const SRC = readFileSync(FILE, "utf-8");
const IMPORT_BLOB = (
  SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("SearchResults — leakage guard", () => {
  it("does NOT import @/data/products (static PRODUCTS no longer seeds the listings state)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/data\/products["']/);
  });

  it("does NOT reference PRODUCTS as runtime code", () => {
    // Strip line comments so the explanatory comments mentioning
    // PRODUCTS for context do not produce a false positive.
    const runtimeSrc = SRC.replace(/^\s*\/\/.*$/gm, "");
    // The remaining mentions should only appear in JSDoc / block
    // comment context, not runtime — guard with a token boundary.
    expect(runtimeSrc).not.toMatch(/\bPRODUCTS\.map\b/);
    expect(runtimeSrc).not.toMatch(/\bPRODUCTS\.filter\b/);
    expect(runtimeSrc).not.toMatch(/\bPRODUCTS\.find\b/);
  });

  it("seeds `listings` state with an empty array, not a PRODUCTS projection", () => {
    expect(SRC).toMatch(
      /useState<PublicListing\[\]>\(\s*\[\s*\]\s*\)/,
    );
  });

  it("declares a loadState with loading / loaded / error variants", () => {
    expect(SRC).toMatch(
      /useState<\s*"loading"\s*\|\s*"loaded"\s*\|\s*"error"\s*>/,
    );
  });

  it("on probe.kind === 'error' sets an empty list, not the prior state, and flips loadState to 'error'", () => {
    expect(SRC).toMatch(
      /probe\.kind\s*===\s*["']error["'][\s\S]*?setListings\(\s*\[\s*\]\s*\)[\s\S]*?setLoadState\(\s*["']error["']\s*\)/,
    );
  });

  it("renders a LoadingResults panel during loadState='loading'", () => {
    expect(SRC).toMatch(/loadState\s*===\s*["']loading["']\s*\?\s*\(\s*<LoadingResults/);
    expect(SRC).toContain("검색 결과를 불러오고 있어요");
  });

  it("renders an ErrorResults panel during loadState='error'", () => {
    expect(SRC).toMatch(/loadState\s*===\s*["']error["']\s*\?\s*\(\s*<ErrorResults/);
    expect(SRC).toContain("결과를 불러오지 못했어요");
  });

  it("ErrorResults explicitly states demo data will NOT be substituted", () => {
    expect(SRC).toContain("이 화면에서는 데모 데이터를");
  });
});

describe("SearchResults — local mode behavior preserved", () => {
  it("still calls publicListingService.listPublicListings() on probe.kind === 'local'", () => {
    expect(SRC).toMatch(
      /probe\.kind\s*===\s*["']local["'][\s\S]*?publicListingService\.listPublicListings\(\)/,
    );
  });
});

describe("SearchResults — match hints (Bundle 4 Slice 1)", () => {
  it("imports the deterministic explainMatch generator", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/services\/marketplaceIntelligenceService["']/,
    );
    expect(IMPORT_BLOB).toMatch(/explainMatch/);
  });

  it("imports the MatchExplanation type from the marketplace intelligence domain module", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/domain\/marketplaceIntelligence["']/,
    );
    expect(IMPORT_BLOB).toMatch(/MatchExplanation/);
  });

  it("renders the '추천 이유' caption only inside the new MatchHints block", () => {
    expect(SRC).toContain("추천 이유");
  });

  it("renders the '확인할 점' caption only inside the new MatchHints block", () => {
    expect(SRC).toContain("확인할 점");
  });

  it("computes the explanations map from the parsed search intent (memoized) — no precomputed fixture", () => {
    expect(SRC).toMatch(
      /explanations[\s\S]*?Record<string,\s*MatchExplanation>[\s\S]*?explainMatch\(\s*intent\s*,\s*l\s*\)/,
    );
  });

  it("does not render hints when there is no parsed search intent (intent === null short-circuits)", () => {
    expect(SRC).toMatch(/if\s*\(\s*!intent\s*\)\s*return\s*\{\s*\}\s*;/);
  });

  it("does not introduce regulated-language phrases anywhere in the source", () => {
    for (const banned of [
      "결제 완료",
      "결제 처리",
      "대여 확정",
      "대여 완료",
      "보증금 청구",
      "보험",
      "보장",
      "환불",
      "정산 완료",
      "guaranteed",
      "verified_seller",
    ]) {
      expect(SRC).not.toContain(banned);
    }
  });

  it("does not render hints with strong-authority styling (uses dashed border tokens, not filled black pills)", () => {
    // The MatchHints block must use the dashed-line token, not
    // `bg-black text-white` filled pills (which would imply
    // confirmed authority). We slice strictly to the MatchHints
    // function body so the regex does not run into sibling
    // functions (`CategoryChip`, `EmptyResults`) that legitimately
    // use the filled-black pill style for selected filters.
    const start = SRC.indexOf("function MatchHints");
    expect(start).toBeGreaterThan(0);
    // The next top-level `\nfunction ` declaration after MatchHints
    // is the end of the slice we want to inspect.
    const after = SRC.indexOf("\nfunction ", start + 1);
    expect(after).toBeGreaterThan(start);
    const block = SRC.slice(start, after);
    expect(block).toMatch(/border-dashed/);
    expect(block).not.toMatch(/bg-black\s+text-white/);
  });
});

describe("SearchResults — design discipline", () => {
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

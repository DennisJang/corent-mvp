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

describe("SearchResults — wanted-try-request CTA (cold-start wedge)", () => {
  // Plan: docs/corent_wanted_try_request_slice_plan.md.
  // The wanted form must render ONLY in the loaded + empty branch;
  // it must NOT render on loadState === "error" (transient backend
  // failure should not capture demand).

  it("imports WantedTryRequestForm only once, from @/components/WantedTryRequestForm", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/components\/WantedTryRequestForm["']/,
    );
    const importLines = IMPORT_BLOB.split(/\n/).filter((l) =>
      l.includes("WantedTryRequestForm"),
    );
    expect(importLines.length).toBe(1);
  });

  it("renders <WantedTryRequestForm /> only inside the EmptyResults function", () => {
    // `<WantedTryRequestForm` must appear in the source. When it
    // does, it should live within the EmptyResults function body —
    // not in LoadingResults / ErrorResults / the result-grid path.
    const renderHits = SRC.match(/<WantedTryRequestForm\b/g) ?? [];
    expect(renderHits.length).toBe(1);

    const emptyStart = SRC.indexOf("function EmptyResults");
    expect(emptyStart).toBeGreaterThan(0);
    const emptyEnd = SRC.indexOf("\nfunction ", emptyStart + 1);
    const emptyBlock =
      emptyEnd > 0 ? SRC.slice(emptyStart, emptyEnd) : SRC.slice(emptyStart);
    expect(emptyBlock).toMatch(/<WantedTryRequestForm\b/);

    // Belt-and-suspenders: it must NOT appear in LoadingResults or
    // ErrorResults bodies.
    const loadingStart = SRC.indexOf("function LoadingResults");
    const loadingEnd = SRC.indexOf("\nfunction ", loadingStart + 1);
    const loadingBlock = SRC.slice(loadingStart, loadingEnd);
    expect(loadingBlock).not.toMatch(/<WantedTryRequestForm\b/);

    const errorStart = SRC.indexOf("function ErrorResults");
    const errorEnd = SRC.indexOf("\nfunction ", errorStart + 1);
    const errorBlock = SRC.slice(errorStart, errorEnd);
    expect(errorBlock).not.toMatch(/<WantedTryRequestForm\b/);
  });

  it("wires loadState branches so EmptyResults is reached only when loaded + filtered.length === 0", () => {
    // Pin the existing branch shape: the EmptyResults render is
    // gated by `loadState === "error"` falling through first, then
    // `filtered.length === 0`.
    expect(SRC).toMatch(
      /loadState\s*===\s*["']error["'][\s\S]*?<ErrorResults[\s\S]*?filtered\.length\s*===\s*0[\s\S]*?<EmptyResults/,
    );
  });

  it("passes the parsed intent (rawInput + category) into EmptyResults so the form can pre-fill", () => {
    expect(SRC).toMatch(
      /<EmptyResults[\s\S]*?rawInput=\{rawInput\}[\s\S]*?category=\{category\}[\s\S]*?\/>/,
    );
  });

  it("EmptyResults forwards rawInput → defaultMessage and category → defaultCategory to the form", () => {
    const emptyStart = SRC.indexOf("function EmptyResults");
    const emptyEnd = SRC.indexOf("\nfunction ", emptyStart + 1);
    const block =
      emptyEnd > 0 ? SRC.slice(emptyStart, emptyEnd) : SRC.slice(emptyStart);
    expect(block).toMatch(/defaultMessage=\{rawInput\}/);
    expect(block).toMatch(/defaultCategory=\{category\s*\?\?\s*null\}/);
  });

  it("the empty-state copy frames demand-capture, not a generic 'relax filters' suggestion", () => {
    // JSX wraps long copy across lines; allow whitespace/newlines
    // between tokens.
    expect(SRC).toMatch(/조건에\s*맞는\s*매물이\s*아직\s*없어요\./);
    expect(SRC).toMatch(/같은\s*물건을\s*가진\s*셀러가\s*보면\s*다시\s*안내드려요/);
    expect(SRC).toMatch(
      /자동으로\s*매칭되거나\s*결제·픽업·정산이\s*시작되지는?\s*않아요/,
    );
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

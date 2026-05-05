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

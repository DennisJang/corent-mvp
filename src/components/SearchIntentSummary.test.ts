// Tests for the Search Intent Summary surface (CIE Phase 1
// "step 02 / 체험 기준" panel).
//
// Coverage split:
//
//   - The pure `buildSearchTryCriteriaPreview` helper is exported
//     so we can test the deterministic try-criteria slicing
//     without rendering React.
//   - The remaining surface is pinned via source-level invariants
//     (readFileSync) — same approach as `SearchResults.test.ts`
//     and `WantedTryRequestForm.test.ts`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSearchTryCriteriaPreview } from "./SearchIntentSummary";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "SearchIntentSummary.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

// Strip line + block comments before scanning so doc references
// to banned phrases (e.g. negation in the docstring) do not
// produce false positives. The IMPORT_BLOB is also extracted from
// the comment-stripped source so a docstring sentence containing
// the word "import" is not picked up.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("buildSearchTryCriteriaPreview — category-driven deterministic preview", () => {
  it("returns [] when category is undefined (caller should render the fallback caption)", () => {
    expect(buildSearchTryCriteriaPreview(undefined)).toEqual([]);
  });

  it("returns 2–4 try-before-buy points for a known category (massage_gun)", () => {
    const items = buildSearchTryCriteriaPreview("massage_gun");
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(4);
    // Each point is a Korean caption from the closed readiness
    // vocabulary — never a banned phrase or empty string.
    for (const p of items) {
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
      for (const banned of [
        "보증",
        "보증금",
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
      ]) {
        expect(p).not.toContain(banned);
      }
    }
  });

  it("returns deterministic output for the same category (same input → same array)", () => {
    expect(buildSearchTryCriteriaPreview("massage_gun")).toEqual(
      buildSearchTryCriteriaPreview("massage_gun"),
    );
    expect(buildSearchTryCriteriaPreview("home_care")).toEqual(
      buildSearchTryCriteriaPreview("home_care"),
    );
  });

  it("returns category-specific output (massage_gun ≠ projector ≠ camera)", () => {
    const a = buildSearchTryCriteriaPreview("massage_gun");
    const b = buildSearchTryCriteriaPreview("projector");
    const c = buildSearchTryCriteriaPreview("camera");
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it("can be called with a custom deriver (dependency injection seam)", () => {
    const fakeCard = {
      tryBeforeBuyPoints: ["테스트 포인트 1", "테스트 포인트 2"],
      checkBeforeRequest: [],
      responsibilityCaption: "",
      responsibilityBasisLabel: "",
      nonPaymentCaption: "",
      provenance: "deterministic" as const,
    };
    const derived = buildSearchTryCriteriaPreview(
      "massage_gun",
      () => fakeCard,
    );
    expect(derived).toEqual(["테스트 포인트 1", "테스트 포인트 2"]);
  });
});

describe("SearchIntentSummary — client-only, no server / LLM / payment imports", () => {
  it("declares 'use client'", () => {
    expect(SRC.startsWith('"use client"')).toBe(true);
  });

  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import the feedback action / repository / client (no wanted-write path)", () => {
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
    expect(IMPORT_BLOB).not.toMatch(/wanted_item/);
  });

  it("does NOT import any LLM provider / external SDK / service-role client", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai|@supabase\/supabase-js/i);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
  });

  it("does NOT import payment / claim / trust / handoff / notification modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
  });

  it("imports the deterministic readiness service for try-criteria derivation", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/services\/tryBeforeBuyReadinessService["']/,
    );
    expect(IMPORT_BLOB).toMatch(/deriveTryBeforeBuyReadiness/);
  });
});

describe("SearchIntentSummary — surface", () => {
  it("renders the heading 입력한 고민을 체험 기준으로 정리했어요", () => {
    expect(SRC).toMatch(/입력한\s+고민을\s+체험\s+기준으로\s+정리했어요/);
  });

  it("echoes raw input only when present (rawInput is conditional, not always rendered)", () => {
    // The literal `“{rawInput}”` template lives inside a `rawInput
    // ? (...) : null` ternary so a missing rawInput collapses to
    // nothing.
    expect(SRC).toMatch(/rawInput\s*\?\s*\([\s\S]*?“\{rawInput\}”/);
  });

  it("trims and length-limits the echoed raw input", () => {
    // The trimmer + ellipsis pattern in clipRawInput is the only
    // place rawInput is read from `intent.rawInput`. Pin both.
    expect(SRC).toMatch(/RAW_INPUT_DISPLAY_MAX/);
    expect(SRC).toMatch(/clipRawInput/);
    expect(SRC).toMatch(/trim\(\)/);
  });

  it("renders the 4 parsed-condition chips behind their respective intent guards", () => {
    expect(SRC).toMatch(
      /intent\.category\s*\?[\s\S]*?search-intent-summary-chip-category/,
    );
    expect(SRC).toMatch(
      /intent\.durationDays\s*\?[\s\S]*?search-intent-summary-chip-duration/,
    );
    expect(SRC).toMatch(
      /intent\.region\s*===\s*["']seoul["'][\s\S]*?search-intent-summary-chip-region/,
    );
    expect(SRC).toMatch(
      /intent\.priceMax\s*\?[\s\S]*?search-intent-summary-chip-price/,
    );
  });

  it("renders the calm category-fallback caption when criteria are missing", () => {
    expect(SRC).toContain(
      "카테고리는 아직 확실하지 않아요. 결과를 보면서 조정할 수\n                있어요.",
    );
    expect(SRC).toMatch(/data-testid=["']search-intent-summary-fallback["']/);
  });

  it("renders the footer that points the user toward the wanted form below", () => {
    expect(SRC).toMatch(
      /맞는\s+매물이\s+없으면\s+아래에서\s+써보고\s+싶다는\s+신호를\s+남길\s+수\s+있어요/,
    );
    expect(SRC).toMatch(/data-testid=["']search-intent-summary-footer["']/);
  });

  it("short-circuits to null when intent is null (defensive)", () => {
    expect(SRC).toMatch(/if\s*\(\s*!intent\s*\)\s*return\s+null/);
  });

  it("short-circuits to null when no meaningful signal is present", () => {
    expect(SRC).toMatch(/hasMeaningfulSignal/);
    expect(SRC).toMatch(/if\s*\(\s*!hasMeaningfulSignal\s*\)\s*return\s+null/);
  });

  it("never calls a wanted-write path inside the runtime body", () => {
    expect(RUNTIME_SRC).not.toMatch(/submitFeedback/);
    expect(RUNTIME_SRC).not.toMatch(/submitFeedbackAction/);
    expect(RUNTIME_SRC).not.toMatch(/wanted_item/);
    expect(RUNTIME_SRC).not.toMatch(/createWantedTryRequest/);
    // No useState / form / button / onClick handlers — this is a
    // read-only summary, not an interactive form.
    expect(RUNTIME_SRC).not.toMatch(/useState/);
    expect(RUNTIME_SRC).not.toMatch(/onClick/);
    expect(RUNTIME_SRC).not.toMatch(/<form/);
    expect(RUNTIME_SRC).not.toMatch(/<button/);
  });
});

describe("SearchIntentSummary — banlist", () => {
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

  it("never promises automatic matching — only conditional phrasing is allowed", () => {
    expect(RUNTIME_SRC).not.toMatch(/셀러를\s*찾아드릴/);
    expect(RUNTIME_SRC).not.toMatch(/곧\s*연결/);
    // No naked "자동으로 매칭" — only "자동 정리" is allowed (it's
    // about the deterministic categorization preview).
    expect(RUNTIME_SRC).not.toMatch(/자동으로\s*매칭(?!되거나)/);
  });
});

describe("SearchIntentSummary — design discipline", () => {
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

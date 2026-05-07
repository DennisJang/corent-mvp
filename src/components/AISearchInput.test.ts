// Tests for the home AI entry surface (CIE Phase 1 — deterministic
// interactive surface). Plan:
//   docs/corent_interactive_experience_architecture.md
//   docs/corent_wanted_try_request_slice_plan.md
//
// Coverage split:
//
//   - The pure `buildHomeSearchHref` helper is exported so we can
//     test the navigation target shape without rendering React
//     (vitest runs in `environment: "node"`).
//   - The remaining surface is pinned via source-level invariants
//     (readFileSync) — same approach as `SearchResults.test.ts` /
//     `WantedTryRequestForm.test.ts`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildHomeSearchHref } from "./AISearchInput";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "AISearchInput.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

// Strip line + block comments before scanning so doc references
// to banned phrases (e.g. negation in the docstring) do not
// produce false positives. The IMPORT_BLOB is also extracted from
// the comment-stripped source so a docstring sentence that
// happens to contain the word "import" is not picked up as an
// import.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("buildHomeSearchHref — empty input", () => {
  it("returns valid:false for an empty string (no navigation)", () => {
    const r = buildHomeSearchHref("");
    expect(r.valid).toBe(false);
    if (r.valid) return;
    expect(r.reason).toBe("empty");
  });

  it("returns valid:false for a whitespace-only string", () => {
    const r = buildHomeSearchHref("   \n\t  ");
    expect(r.valid).toBe(false);
  });
});

describe("buildHomeSearchHref — non-empty input", () => {
  it("navigates to /search with the raw input encoded as ?q=", () => {
    const r = buildHomeSearchHref(
      "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.href.startsWith("/search?")).toBe(true);
    // The free-text intent must be carried over as a URL-encoded
    // q= param so /search can rehydrate the SearchIntent and
    // /search empty state can prefill the wanted form's message.
    // URLSearchParams encodes spaces as `+`; round-trip via
    // URLSearchParams.get to decode them back to the original
    // string.
    const queryString = r.href.split("?")[1] ?? "";
    const params = new URLSearchParams(queryString);
    expect(params.get("q")).toBe(
      "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
    );
    // The intent itself round-trips the raw input.
    expect(r.intent.rawInput).toBe(
      "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
    );
  });

  it("forwards a parsed duration as ?duration= when the parser detects one", () => {
    const r = buildHomeSearchHref("마사지건 3일만 써보고 싶어요");
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.href).toContain("duration=3");
  });

  it("URL-encodes the raw input safely (no naked Korean / spaces in the param value)", () => {
    const r = buildHomeSearchHref(
      "빔프로젝터를 내 방에서 테스트해보고 싶어요",
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    // Naked spaces (not encoded) would mean the URL is malformed.
    // URLSearchParams uses '+' for space encoding — accept either
    // '+' or '%20' but never a literal space.
    const querySection = r.href.split("?")[1] ?? "";
    expect(querySection).not.toMatch(/q=[^&]*\s/);
  });

  it("never embeds wanted_item / submitFeedback / feedback_submissions in the navigation target", () => {
    const r = buildHomeSearchHref(
      "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.href).not.toContain("wanted_item");
    expect(r.href).not.toContain("submitFeedback");
    expect(r.href).not.toContain("feedback_submissions");
    expect(r.href).not.toContain("/admin");
    expect(r.href).not.toContain("/api/");
  });
});

describe("AISearchInput — client-only, no server-only / LLM imports", () => {
  it("declares 'use client'", () => {
    expect(SRC.startsWith('"use client"')).toBe(true);
  });

  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import the feedback action / repository (home does NOT create wanted_item)", () => {
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
    expect(IMPORT_BLOB).not.toMatch(/wanted_item/);
  });

  it("does NOT import any LLM provider / external SDK", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai|@supabase\/supabase-js/i);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
  });

  it("does NOT import any payment / claim / trust / handoff / notification module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
  });
});

describe("AISearchInput — surface", () => {
  it("renders a single home AI entry form", () => {
    const formMatches = SRC.match(/data-testid=["']home-ai-search-form["']/g) ?? [];
    expect(formMatches.length).toBe(1);
  });

  it("renders the three try-before-buy example chips", () => {
    expect(SRC).toContain("다이슨 에어랩 사기 전에 3일만 써보고 싶어요");
    expect(SRC).toContain("빔프로젝터를 내 방에서 테스트해보고 싶어요");
    expect(SRC).toContain("UMPC로 게임이 잘 되는지 써보고 싶어요");
    const chipMatches =
      SRC.match(/data-testid=["']home-ai-example-chip["']/g) ?? [];
    expect(chipMatches.length).toBe(1);
  });

  it("renders the Phase 1 try-before-buy explainer copy", () => {
    expect(SRC).toMatch(
      /먼저\s+체험\s+기준을\s+정리하고,\s+맞는\s+매물이\s+없으면/,
    );
    expect(SRC).toMatch(/써보고\s+싶다는\s+신호를\s+남길\s+수\s+있어요/);
  });

  it("renders calm validation copy for empty submit (does not navigate)", () => {
    expect(SRC).toContain(
      "어떤 물건을 며칠 써보고 싶은지 한 줄만 적어 주세요",
    );
    expect(SRC).toMatch(/data-testid=["']home-ai-validation["']/);
  });

  it("never lists `submitFeedbackAction` / wanted-write call inside the runtime body", () => {
    // Defense-in-depth: the surface MUST NOT call the wanted-write
    // path. Wanted-item creation lives only on /search empty state
    // (rendered by SearchResults → WantedTryRequestForm).
    expect(RUNTIME_SRC).not.toMatch(/submitFeedback/);
    expect(RUNTIME_SRC).not.toMatch(/submitFeedbackAction/);
    expect(RUNTIME_SRC).not.toMatch(/wanted_item/);
    expect(RUNTIME_SRC).not.toMatch(/createWantedTryRequest/);
  });

  it("submit handler routes via router.push to a /search... target only", () => {
    // The handler reads the helper's result.href which is built
    // from `/search?` + URLSearchParams. Pin that the router push
    // target is exactly that shape — no other route is reachable
    // from this component.
    expect(RUNTIME_SRC).toMatch(/router\.push\(\s*result\.href\s*\)/);
    // No router.push call referencing /admin, /api, or
    // /auth/password-sign-in here.
    const pushMatches = RUNTIME_SRC.match(/router\.push\([^)]*\)/g) ?? [];
    for (const m of pushMatches) {
      expect(m).not.toMatch(/\/admin/);
      expect(m).not.toMatch(/\/api/);
      expect(m).not.toMatch(/auth/);
      expect(m).not.toMatch(/feedback/);
    }
  });
});

describe("AISearchInput — banlist", () => {
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
    // Allowed appearance: "자동으로 정리해 드려요" — about the
    // parsed-condition preview, not about matching. We assert
    // there is no bare "자동으로 매칭" promise. (The only allowed
    // shape is "자동으로 매칭되거나 ... 시작되지는 않아요" which
    // belongs to the wanted-form / search empty surfaces, not
    // here.)
    expect(RUNTIME_SRC).not.toMatch(/자동으로\s*매칭(?!되거나)/);
  });
});

describe("AISearchInput — design discipline", () => {
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

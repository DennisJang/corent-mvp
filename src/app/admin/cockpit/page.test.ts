// Static-text invariants for the founder validation cockpit page
// (Bundle 2, Slice 4). Behavior is covered by
// `founderCockpitData.test.ts`. This file pins down:
//
//   - the page is registered under `/admin/`, behind the founder
//     auth gate that the orchestrator already enforces;
//   - the page calls `notFound()` for the `forbidden` envelope so
//     non-allowlisted users see 404 (not 401) — the same fail-
//     closed posture the existing `/admin/dashboard` uses;
//   - the page renders a calm "supabase backend not active" panel
//     for the `inactive` envelope (mock mode);
//   - the page does not import from local mock identity helpers
//     (no `getMockSellerSession` / `getMockRenterSession`);
//   - the page does not import any payment / lifecycle / claim /
//     trust / handoff / notification module;
//   - the page renders no payment / refund / settlement / insurance
//     / coverage copy;
//   - `dynamic = "force-dynamic"` is set so server reads happen
//     per-request (not at build time).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "app",
  "admin",
  "cockpit",
  "page.tsx",
);
const SRC = readFileSync(FILE, "utf-8");
const IMPORT_BLOB = (
  SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("FounderCockpitPage — auth gate", () => {
  it("calls notFound() on the 'forbidden' envelope (fail-closed 404, never 401)", () => {
    expect(SRC).toMatch(/result\.kind === ["']forbidden["'][\s\S]*?notFound\(\)/);
  });

  it("renders an explicit 'supabase backend not active' panel on the 'inactive' envelope", () => {
    expect(SRC).toContain("서버 백엔드가 아직 활성화되지 않았어요");
    expect(SRC).toContain("CORENT_BACKEND_MODE=supabase");
  });

  it("uses dynamic = 'force-dynamic' so reads happen per request", () => {
    expect(SRC).toMatch(/export const dynamic = ["']force-dynamic["']/);
  });
});

describe("FounderCockpitPage — import discipline", () => {
  it("imports the orchestrator only via @/server/admin/founderCockpitData", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/server\/admin\/founderCockpitData["']/,
    );
    expect(IMPORT_BLOB).toMatch(/readFounderCockpitData/);
  });

  it("does not import mockSession helpers (no local identity reads on the cockpit)", () => {
    expect(IMPORT_BLOB).not.toMatch(/getMockSellerSession/);
    expect(IMPORT_BLOB).not.toMatch(/getMockRenterSession/);
    expect(IMPORT_BLOB).not.toMatch(/@\/lib\/auth\/mockSession/);
  });

  it("does not import any local persistence adapter (no localStorage reads on the cockpit)", () => {
    expect(IMPORT_BLOB).not.toMatch(/@\/lib\/adapters\/persistence/);
    expect(IMPORT_BLOB).not.toMatch(/getPersistence/);
  });

  it("does not import any payment / claim / trust / handoff / notification / lifecycle module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notification/i);
    expect(IMPORT_BLOB).not.toMatch(/rentalService/);
    expect(IMPORT_BLOB).not.toMatch(/rentalIntentMachine/);
  });
});

describe("FounderCockpitPage — copy discipline", () => {
  it("renders the read-only / pre-payment posture", () => {
    expect(SRC).toContain("결제·정산은 아직 연결되어 있지 않아요");
    expect(SRC).toContain("승인·거절·환불은");
  });

  it("never implies payment / confirmed rental / guarantee / insurance", () => {
    for (const banned of [
      "결제 완료",
      "결제 처리",
      "결제 진행",
      "보증금 청구",
      "대여 확정",
      "대여 완료",
      "보험",
      "보장",
      "정산 완료",
    ]) {
      expect(SRC).not.toContain(banned);
    }
  });
});

describe("FounderCockpitPage — design discipline", () => {
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

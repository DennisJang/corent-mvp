// Static-text guards for the SellerDashboard component (Bundle 2,
// Slice 3 — server-mode incoming requests block).
//
// We do not have React Testing Library in this project; behavior
// is covered transitively through the action + adapter tests
// (`listSellerRentalRequests.test.ts`,
// `sellerDashboardRequestsClient.test.ts`,
// `rentalIntentRepository.test.ts`).
//
// What this file pins down is the source-level invariants:
//
//   - The dashboard imports the new server-mode requests adapter
//     at exactly the established hop and never reaches into
//     `@/server/**` directly (the existing import-boundary regex
//     already enforces this; we add a per-file scan so a
//     regression is named).
//   - In server mode the dashboard hides the existing local-mode
//     pending/active blocks. A flat-source check on the wrapping
//     `chatIntakeMode === "local"` ternary catches a regression
//     that would re-render `MOCK_RENTAL_INTENTS` rows alongside
//     the server-mode block.
//   - The new `ServerRequestsBlock` exists, renders only inside
//     the server-mode branch, and emits the documented Korean
//     copy strings (empty / error / loading / pre-payment beta /
//     deferred-actions).
//   - The block does NOT render approve / decline / cancel /
//     payment buttons — request visibility is read-only.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "SellerDashboard.tsx",
);

const SRC = readFileSync(FILE, "utf-8");

const IMPORT_BLOB = (
  SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("SellerDashboard — server-mode requests adapter wiring", () => {
  it("imports loadSellerRequests + types from the established client adapter hop", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/sellerDashboardRequestsClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/loadSellerRequests/);
    expect(IMPORT_BLOB).toMatch(/SellerDashboardRequest/);
    expect(IMPORT_BLOB).toMatch(/SellerRequestsLoadResult/);
  });

  it("does not import @/server/** directly (boundary canary, redundant with import-boundary.test.ts)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });
});

describe("SellerDashboard — local vs server mode separation", () => {
  it("wraps the local pending/active section behind chatIntakeMode === 'local'", () => {
    // The local PendingBlock + ActiveBlock branch only renders
    // when the chat intake mode is `local`. The server-mode
    // branch renders the new ServerRequestsBlock instead. This
    // is the invariant that prevents MOCK_RENTAL_INTENTS rows
    // from showing up alongside server requests.
    expect(SRC).toMatch(/chatIntakeMode === ["']local["']\s*\?[\s\S]*?<PendingBlock/);
    expect(SRC).toMatch(/<ServerRequestsBlock\s+state=\{serverRequestsState\}/);
  });

  it("loads server requests only when chatIntakeMode === 'server'", () => {
    // The mode-flip effect must call loadSellerRequests in the
    // server branch and reset to null in the local branch.
    expect(SRC).toMatch(/chatIntakeMode !== ["']server["'][\s\S]*?setServerRequestsState\(null\)/);
    expect(SRC).toMatch(/loadSellerRequests\(\)\.then/);
  });
});

describe("SellerDashboard — ServerRequestsBlock copy", () => {
  it("renders the pre-payment beta caption", () => {
    expect(SRC).toContain("베타: 요청만 표시돼요");
    expect(SRC).toContain("결제·정산은 아직 연결되어 있지 않아요");
  });

  it("renders the empty state copy", () => {
    expect(SRC).toContain("아직 서버 요청이 없어요");
  });

  it("renders the failure caption", () => {
    expect(SRC).toContain("서버 요청을 불러오지 못했어요");
  });

  it("renders the deferred-actions caption (no approve/reject/payment in this slice)", () => {
    expect(SRC).toContain("승인·거절·결제 단계는 아직 준비 중이에요");
  });

  it("does not imply confirmed rental, payment, deposit, guarantee, or insurance in the server-mode block", () => {
    // Find the block body and assert active-money / confirmed
    // language never appears inside it. We slice from
    // "function ServerRequestsBlock" to the end of file.
    const idx = SRC.indexOf("function ServerRequestsBlock");
    expect(idx).toBeGreaterThan(0);
    const block = SRC.slice(idx);
    for (const banned of [
      "결제 완료",
      "결제 처리",
      "결제 진행",
      "보증금 청구",
      "보증금 결제",
      "대여 확정",
      "대여 완료",
      "보험",
      "보장",
      "환불",
      "정산 완료",
    ]) {
      expect(block).not.toContain(banned);
    }
  });
});

describe("SellerDashboard — ServerRequestsBlock is read-only in this slice", () => {
  it("does not render approve/decline/cancel/payment buttons inside the block", () => {
    // Slice the source from "function ServerRequestsBlock" to the
    // end of file (it is the last function in the file). No
    // <Button …> elements should appear inside the block —
    // request visibility is read-only this slice.
    const idx = SRC.indexOf("function ServerRequestsBlock");
    expect(idx).toBeGreaterThan(0);
    const block = SRC.slice(idx);
    expect(block).not.toMatch(/<Button[\s>]/);
    // No onClick handlers either — the block is read-only.
    expect(block).not.toMatch(/onClick=/);
    // No approve / decline / cancel / payment Korean copy.
    for (const banned of ["승인하기", "거절하기", "취소하기", "결제하기"]) {
      expect(block).not.toContain(banned);
    }
  });
});

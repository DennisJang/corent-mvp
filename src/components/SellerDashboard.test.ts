// Static-text guards for the SellerDashboard component.
//
// History:
//   - Bundle 2 Slice 3 — server-mode incoming requests block,
//     read-only.
//   - Bundle 3 Slice 1 (this update) — approve / decline server
//     actions wired into the same block as inline buttons gated
//     on `r.status === "requested"`. The block is no longer
//     read-only; payment / pickup / return / settlement remain
//     deferred.
//
// We do not have React Testing Library in this project; behavior
// is covered transitively through the action + adapter tests
// (`listSellerRentalRequests.test.ts`,
// `sellerDashboardRequestsClient.test.ts`,
// `respondToRentalRequest.test.ts`,
// `respondToRentalRequestClient.test.ts`,
// `rentalIntentRepository.test.ts`).
//
// What this file pins down is the source-level invariants:
//
//   - The dashboard imports the new server-mode requests adapter
//     at exactly the established hop and never reaches into
//     `@/server/**` directly (the existing import-boundary regex
//     already enforces this; we add a per-file scan so a
//     regression is named).
//   - The dashboard imports the approve / decline client adapter
//     at the established `@/lib/client/respondToRentalRequestClient`
//     hop.
//   - In server mode the dashboard hides the existing local-mode
//     pending/active blocks. A flat-source check on the wrapping
//     `chatIntakeMode === "local"` ternary catches a regression
//     that would re-render `MOCK_RENTAL_INTENTS` rows alongside
//     the server-mode block.
//   - The new `ServerRequestsBlock` exists, renders inside the
//     server-mode branch, and emits the documented Korean copy
//     strings (empty / error / loading / pre-payment beta /
//     deferred-actions).
//   - The block exposes inline `요청 수락` + `요청 거절` buttons
//     gated on `r.status === "requested"`. Other statuses remain
//     read-only (status label only).
//   - The block / parent functions never imply payment, deposit,
//     pickup, return, settlement, refund, insurance, or
//     guaranteed rental in their copy.

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

  it("imports approveRequest + declineRequest from the respondToRentalRequest adapter hop (Bundle 3 Slice 1)", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/respondToRentalRequestClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/approveRequest/);
    expect(IMPORT_BLOB).toMatch(/declineRequest/);
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
    // The ServerRequestsBlock renders in the server branch with
    // the response handlers wired through. Its props now include
    // state + busyId + toast + onApprove + onDecline (Bundle 3
    // Slice 1).
    expect(SRC).toMatch(/<ServerRequestsBlock\b/);
    expect(SRC).toMatch(/state=\{serverRequestsState\}/);
    expect(SRC).toMatch(/onApprove=\{[\s\S]*?handleServerRespond[\s\S]*?"approve"/);
    expect(SRC).toMatch(/onDecline=\{[\s\S]*?handleServerRespond[\s\S]*?"decline"/);
  });

  it("loads server requests only when chatIntakeMode === 'server'", () => {
    // The mode-flip effect must call loadSellerRequests in the
    // server branch and reset to null in the local branch.
    expect(SRC).toMatch(/chatIntakeMode !== ["']server["'][\s\S]*?setServerRequestsState\(null\)/);
    expect(SRC).toMatch(/loadSellerRequests\(\)\.then/);
  });
});

describe("SellerDashboard — ServerRequestsBlock copy (Bundle 3 Slice 1)", () => {
  it("renders the updated pre-payment posture caption that names the still-deferred lifecycle steps", () => {
    expect(SRC).toContain(
      "베타: 수락·거절은 처리되지만, 결제·픽업·반납·정산 단계는 아직",
    );
  });

  it("renders the empty state copy", () => {
    expect(SRC).toContain("아직 서버 요청이 없어요");
  });

  it("renders the failure caption", () => {
    expect(SRC).toContain("서버 요청을 불러오지 못했어요");
  });

  it("renders the deferred-payment-pickup-return-settlement footer", () => {
    expect(SRC).toContain(
      "결제·픽업·반납·정산은 아직 연결되어 있지 않아요",
    );
  });

  it("does not imply confirmed rental, payment completion, deposit charge, guarantee, insurance, or refund inside the ServerRequestsBlock body", () => {
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

describe("SellerDashboard — ServerRequestsBlock approve/decline buttons", () => {
  it("renders inline 요청 수락 + 요청 거절 buttons inside the block", () => {
    const idx = SRC.indexOf("function ServerRequestsBlock");
    expect(idx).toBeGreaterThan(0);
    const block = SRC.slice(idx);
    expect(block).toContain("요청 수락");
    expect(block).toContain("요청 거절");
    // The buttons are <Button>s with onClick handlers wiring to
    // the props onApprove(r.id) / onDecline(r.id).
    expect(block).toMatch(/<Button[\s\S]*?onClick=\{\s*\(\)\s*=>\s*onApprove\(r\.id\)/);
    expect(block).toMatch(/<Button[\s\S]*?onClick=\{\s*\(\)\s*=>\s*onDecline\(r\.id\)/);
  });

  it("gates the buttons on r.status === 'requested' (other statuses remain read-only)", () => {
    const idx = SRC.indexOf("function ServerRequestsBlock");
    const block = SRC.slice(idx);
    // The button group sits inside a `r.status === "requested"`
    // ternary. Other statuses fall through to the existing
    // statusLabel(r.status) read-only span.
    expect(block).toMatch(
      /r\.status\s*===\s*["']requested["']\s*\?\s*\([\s\S]*?요청 거절[\s\S]*?요청 수락[\s\S]*?\)\s*:\s*\(/,
    );
    expect(block).toMatch(/statusLabel\(r\.status\)/);
  });

  it("disables both buttons while busyId === r.id (busy row guard)", () => {
    const idx = SRC.indexOf("function ServerRequestsBlock");
    const block = SRC.slice(idx);
    // Both buttons reference busyId === r.id in their disabled
    // expression so a double-click cannot fire the action twice.
    const approveDisable = block.match(
      /onClick=\{\s*\(\)\s*=>\s*onApprove\(r\.id\)\s*\}\s*disabled=\{[^}]*\}/,
    );
    const declineDisable = block.match(
      /onClick=\{\s*\(\)\s*=>\s*onDecline\(r\.id\)\s*\}\s*disabled=\{[^}]*\}/,
    );
    expect(approveDisable?.[0]).toContain("busyId === r.id");
    expect(declineDisable?.[0]).toContain("busyId === r.id");
  });

  it("does NOT render payment / pickup / return / settlement / refund buttons inside the block", () => {
    const idx = SRC.indexOf("function ServerRequestsBlock");
    const block = SRC.slice(idx);
    for (const banned of [
      "결제하기",
      "결제 진행",
      "픽업 확인",
      "반납 확인",
      "정산하기",
      "환불하기",
    ]) {
      expect(block).not.toContain(banned);
    }
  });
});

describe("SellerDashboard — handleServerRespond (parent handler)", () => {
  it("declares per-row busyId + toast state distinct from the local PendingBlock state", () => {
    expect(SRC).toMatch(
      /useState<string \| null>\(\s*null\s*\)[\s\S]*?serverRespondBusyId/,
    );
    expect(SRC).toMatch(
      /useState<string \| null>\(\s*null\s*\)[\s\S]*?serverRespondToast/,
    );
  });

  it("re-fetches loadSellerRequests after a successful approve/decline so the row's status flips out of 'requested'", () => {
    expect(SRC).toMatch(
      /handleServerRespond[\s\S]*?result\.kind === ["']ok["'][\s\S]*?loadSellerRequests\(\)/,
    );
  });

  it("calls approveRequest / declineRequest with only { rentalIntentId }; never echoes seller_id, borrower_id, status, amounts, payment, pickup, return, settlement, adminId", () => {
    // Locate the two adapter call sites and confirm each only
    // passes `rentalIntentId`. A regression that adds extra keys
    // (e.g. `sellerId`, `status`) would surface here.
    const approveCall = SRC.match(/approveRequest\(\s*\{[^}]*\}\s*\)/);
    const declineCall = SRC.match(/declineRequest\(\s*\{[^}]*\}\s*\)/);
    expect(approveCall).not.toBeNull();
    expect(declineCall).not.toBeNull();
    for (const call of [approveCall![0], declineCall![0]]) {
      expect(call).toMatch(/rentalIntentId/);
      for (const forbidden of [
        "sellerId",
        "borrowerId",
        "status",
        "amounts",
        "payment",
        "pickup",
        "return",
        "settlement",
        "adminId",
        "role",
        "capability",
        "approval",
      ]) {
        expect(call).not.toMatch(new RegExp(`${forbidden}\\s*:`));
      }
    }
  });
});

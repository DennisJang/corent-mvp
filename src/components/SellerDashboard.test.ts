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

describe("SellerDashboard — seller listing readiness panel (Bundle 4 Slice 7)", () => {
  it("imports the deterministic readiness helpers from the safe service hop", () => {
    expect(SRC).toMatch(
      /import\s+\{[\s\S]*?deriveSellerListingReadiness[\s\S]*?SellerListingReadinessCard[\s\S]*?\}\s*from\s+["']@\/lib\/services\/sellerListingReadinessService["']/,
    );
  });

  it("computes the readiness only when chatIntakeMode === 'server' AND the listings envelope is server-backed", () => {
    expect(SRC).toMatch(
      /sellerListingReadiness[\s\S]*?chatIntakeMode\s*!==\s*["']server["'][\s\S]*?return\s+null/,
    );
    expect(SRC).toMatch(
      /sellerListingReadiness[\s\S]*?serverListingsState[\s\S]*?kind\s*!==\s*["']server["'][\s\S]*?return\s+null/,
    );
  });

  it("only forwards the safe { category, status } subset to the deterministic generator", () => {
    const start = SRC.indexOf("const sellerListingReadiness = useMemo");
    expect(start).toBeGreaterThan(0);
    const end = SRC.indexOf("\n  const sellerStorePreview", start);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);
    expect(block).toMatch(
      /listings:[\s\S]*?\.map\(\(l\)\s*=>\s*\(\{\s*category:\s*l\.category[\s\S]*?status:\s*l\.status[\s\S]*?\}\)\)/,
    );
    // No private / authority / borrower-side field forwarded.
    for (const banned of [
      "borrowerDisplayName",
      "borrowerId",
      "sellerPayout",
      "borrowerTotal",
      "safetyDeposit",
      "rentalFee",
      "itemName",
      "prices",
      "rawSellerInput",
      "privateSerialNumber",
      "humanReviewNotes",
      "verification",
      "payment",
      "settlement",
    ]) {
      expect(block).not.toContain(banned);
    }
  });

  it("renders the documented Korean headings and sub-captions", () => {
    expect(SRC).toContain("공개·요청 전 더 신뢰를 주려면");
    expect(SRC).toContain(
      "자동으로 정리한 안내예요. 구성품·상태·수령 권역을 먼저 확인해 주세요.",
    );
    expect(SRC).toContain("지금 상태");
    expect(SRC).toContain("추천 점검 항목");
    expect(SRC).toContain("책임 기준 안내");
  });

  it("forwards the readiness fields directly into the panel (no inline duplicate copy)", () => {
    // The panel destructures `readiness` into local consts, then
    // renders the values. We assert the destructure targets the
    // four documented fields and the JSX renders them directly.
    const start = SRC.indexOf("function SellerListingReadinessPanel");
    expect(start).toBeGreaterThan(0);
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
    expect(block).toMatch(
      /const\s*\{\s*readyChecks\s*,\s*missingOrRecommendedChecks\s*,\s*responsibilityBasisLabel\s*,\s*publicationReadinessCaption\s*,?\s*\}\s*=\s*readiness\s*;/,
    );
    expect(block).toContain("{responsibilityBasisLabel}");
    expect(block).toContain("{publicationReadinessCaption}");
    expect(block).toMatch(/readyChecks\.map/);
    expect(block).toMatch(/missingOrRecommendedChecks\.map/);
  });

  it("renders the panel only when sellerListingReadiness is non-null (no local-mode rendering)", () => {
    expect(SRC).toMatch(
      /\{\s*sellerListingReadiness\s*\?\s*\([\s\S]*?<SellerListingReadinessPanel[\s\S]*?:\s*null\s*\}/,
    );
  });

  it("does NOT use regulated language anywhere inside the SellerListingReadinessPanel function body", () => {
    const start = SRC.indexOf("function SellerListingReadinessPanel");
    expect(start).toBeGreaterThan(0);
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
    for (const banned of [
      "보증",
      "보험",
      "보장",
      "결제 완료",
      "대여 확정",
      "환불",
      "정산 완료",
    ]) {
      expect(block).not.toContain(banned);
    }
  });

  it("uses dashed-border tokens for the responsibility-basis pill (no filled-black authority styling)", () => {
    const start = SRC.indexOf("function SellerListingReadinessPanel");
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
    expect(block).toMatch(/border-dashed/);
    expect(block).not.toMatch(/bg-black\s+text-white/);
  });

  it("does not surface any private / authority field name inside the panel body", () => {
    const start = SRC.indexOf("function SellerListingReadinessPanel");
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
    for (const banned of [
      "rawSellerInput",
      "privateSerialNumber",
      "humanReviewNotes",
      "verification",
      "trustScore",
      "payment",
      "settlement",
      "sellerPayout",
      "platformFee",
      "borrowerId",
      "borrowerTotal",
      "safetyDeposit",
      "adminNotes",
      "address",
      "contact",
    ]) {
      expect(block).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
  });
});

describe("SellerDashboard — seller store preview panel (Bundle 4 Slice 2)", () => {
  it("imports the deterministic seller-store preview helpers from the marketplace intelligence service", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/services\/marketplaceIntelligenceService["']/,
    );
    expect(IMPORT_BLOB).toMatch(/deriveSellerStorePreview/);
    expect(IMPORT_BLOB).toMatch(/storeTypeLabel/);
    expect(IMPORT_BLOB).toMatch(/SellerStorePreview/);
  });

  it("computes the preview only when chatIntakeMode === 'server' AND the listings envelope is server-backed", () => {
    // The memo short-circuits to null in local mode and on either
    // envelope being absent / `error`. A regression that wires
    // local-mock fixtures into the preview would surface here.
    expect(SRC).toMatch(
      /sellerStorePreview[\s\S]*?chatIntakeMode\s*!==\s*["']server["'][\s\S]*?return\s+null/,
    );
    expect(SRC).toMatch(
      /sellerStorePreview[\s\S]*?serverListingsState[\s\S]*?kind\s*!==\s*["']server["'][\s\S]*?return\s+null/,
    );
  });

  it("only forwards the safe { category } / { pickupArea, status } subsets to the deterministic generator", () => {
    // The projections into deriveSellerStorePreview must NOT echo
    // `id`, `itemName`, `prices`, `createdAt`, `updatedAt`, or
    // any borrower-side field. We assert it strictly on the
    // sellerStorePreview useMemo block.
    const start = SRC.indexOf("const sellerStorePreview = useMemo");
    expect(start).toBeGreaterThan(0);
    // End at the closing `}, [chatIntakeMode, ...]);` of the memo
    // (next non-trivial useMemo / function declaration).
    const end = SRC.indexOf("\n  const seedMockData", start);
    expect(end).toBeGreaterThan(start);
    const block = SRC.slice(start, end);
    // The listings projection passes only `category`.
    expect(block).toMatch(
      /listings:[\s\S]*?\.map\(\(l\)\s*=>\s*\(\{\s*category:\s*l\.category[\s\S]*?\}\)\)/,
    );
    // The requests projection (computed into `requestsForPreview`
    // before being forwarded) passes only `pickupArea` + `status`.
    expect(block).toMatch(
      /\.requests\.map\(\(r\)\s*=>\s*\(\{\s*pickupArea:\s*r\.pickupArea[\s\S]*?status:\s*r\.status[\s\S]*?\}\)\)/,
    );
    // No id / amount / payment / borrower-side field forwarded.
    expect(block).not.toMatch(/borrowerDisplayName/);
    expect(block).not.toMatch(/borrowerId/);
    expect(block).not.toMatch(/sellerPayout/);
    expect(block).not.toMatch(/borrowerTotal/);
    expect(block).not.toMatch(/safetyDeposit/);
    expect(block).not.toMatch(/rentalFee/);
    expect(block).not.toMatch(/itemName/);
  });

  it("renders a non-authoritative panel header with the documented Korean copy", () => {
    expect(SRC).toContain("셀러 스토어 초안");
    expect(SRC).toContain(
      "자동으로 정리한 초안이에요. 공개 스토어는 아직 생성되지 않았어요.",
    );
    expect(SRC).toContain(
      "이 초안은 셀러 본인에게만 보여요. 공개 스토어 페이지는 준비가 되면",
    );
  });

  it("renders the three preview sections (공개 가능 리스팅 / 카테고리 포커스 / 주요 수령 권역)", () => {
    expect(SRC).toContain("공개 가능 리스팅");
    expect(SRC).toContain("카테고리 포커스");
    expect(SRC).toContain("주요 수령 권역");
    expect(SRC).toContain("다음에 해보면 좋은 것");
  });

  it("does NOT render strong-authority pill styling inside the preview panel (uses dashed tokens)", () => {
    const start = SRC.indexOf("function SellerStorePreviewPanel");
    expect(start).toBeGreaterThan(0);
    // Slice strictly to the function body to avoid sibling
    // functions (ServerRequestsBlock etc.) that legitimately use
    // the filled-black pill style.
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
    expect(block).toMatch(/border-dashed/);
    expect(block).not.toMatch(/bg-black\s+text-white/);
  });

  it("never emits regulated-language phrases anywhere in the panel function body", () => {
    const start = SRC.indexOf("function SellerStorePreviewPanel");
    const after = SRC.indexOf("\nfunction ", start + 1);
    const block = SRC.slice(start, after === -1 ? undefined : after);
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
    ]) {
      expect(block).not.toContain(banned);
    }
  });

  it("renders the preview section conditionally on sellerStorePreview being non-null", () => {
    // The JSX guard must be `sellerStorePreview ? (...) : null` so
    // a local-mode dashboard (preview === null) never shows the
    // panel.
    expect(SRC).toMatch(
      /\{\s*sellerStorePreview\s*\?\s*\([\s\S]*?<SellerStorePreviewPanel[\s\S]*?:\s*null\s*\}/,
    );
  });
});

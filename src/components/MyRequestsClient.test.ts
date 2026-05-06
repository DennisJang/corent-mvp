// Static-text guards for MyRequestsClient (Bundle 3, Slice 2).
//
// We do not have React Testing Library; behavior is covered
// transitively through the action + adapter tests
// (`listMyRentalRequests.test.ts`, `myRequestsClient.test.ts`,
// `rentalIntentRepository.test.ts`).
//
// What this file pins down is the source-level invariants:
//
//   - The component imports `loadMyRequests` from the established
//     `@/lib/client/myRequestsClient` hop and never reaches into
//     `@/server/**` directly (the existing import-boundary regex
//     already enforces this; a per-file scan is the regression
//     canary).
//   - Renders Korean copy for the three documented statuses
//     (`requested`, `seller_approved`, `seller_cancelled`).
//   - Empty state renders a `/search` link.
//   - Failure caption is present (no silent fallback).
//   - Pre-payment posture is present, naming the still-deferred
//     lifecycle steps.
//   - Component never implies payment completion / confirmed rental
//     / refund / insurance / guarantee / settlement complete in copy.
//   - Component does NOT render approve / decline / cancel / pay /
//     pickup / return / settle / refund buttons (read-only in this
//     slice).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "MyRequestsClient.tsx",
);

const SRC = readFileSync(FILE, "utf-8");

const IMPORT_BLOB = (
  SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("MyRequestsClient — adapter wiring", () => {
  it("imports loadMyRequests + types from the established client adapter hop", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/myRequestsClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/loadMyRequests/);
    expect(IMPORT_BLOB).toMatch(/MyRentalRequest/);
    expect(IMPORT_BLOB).toMatch(/MyRequestsLoadResult/);
  });

  it("does not import @/server/** directly (boundary canary, redundant with import-boundary.test.ts)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does not import any payment / lifecycle / claim / trust / handoff / notification module", () => {
    expect(IMPORT_BLOB).not.toMatch(/rentalService/);
    expect(IMPORT_BLOB).not.toMatch(/rentalIntentMachine/);
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notification/i);
    expect(IMPORT_BLOB).not.toMatch(/respondToRentalRequest/);
  });
});

describe("MyRequestsClient — Korean status copy", () => {
  it("renders the requested-status copy", () => {
    expect(SRC).toContain("셀러 응답을 기다리는 중");
  });

  it("renders the seller_approved-status copy", () => {
    expect(SRC).toContain(
      "셀러가 요청을 수락했어요. 아직 결제·픽업·정산은 시작되지 않았어요.",
    );
  });

  it("renders the seller_cancelled-status copy", () => {
    expect(SRC).toContain(
      "셀러가 요청을 거절했어요. 이 요청은 더 진행되지 않아요.",
    );
  });
});

describe("MyRequestsClient — empty / loading / error / local captions", () => {
  it("renders the loading caption", () => {
    expect(SRC).toContain("요청 목록을 불러오는 중이에요.");
  });

  it("renders the failure caption (no silent fallback)", () => {
    expect(SRC).toContain(
      "요청 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  });

  it("renders the empty-state copy", () => {
    expect(SRC).toContain("아직 보낸 요청이 없어요");
  });

  it("links the empty state to /search", () => {
    // The empty state must invite the borrower to /search.
    expect(SRC).toMatch(/href="\/search"[\s\S]*?\/search/);
  });

  it("renders the local-mode caption (server-only beta surface)", () => {
    expect(SRC).toContain("이 화면은 서버 모드에서만 동작해요");
  });

  it("renders the pre-payment posture caption that names the still-deferred lifecycle steps", () => {
    expect(SRC).toContain(
      "베타: 셀러 응답까지만 처리되며, 결제·픽업·반납·정산은 아직 연결되어",
    );
  });

  it("renders the deferred lifecycle footer", () => {
    expect(SRC).toContain(
      "결제·픽업·반납·정산은 아직 연결되어 있지 않아요",
    );
  });
});

describe("MyRequestsClient — copy banlist", () => {
  it("does not imply confirmed rental / payment completion / deposit charge / refund / insurance / guarantee", () => {
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
      expect(SRC).not.toContain(banned);
    }
  });
});

describe("MyRequestsClient — read-only (no mutate buttons in this slice)", () => {
  it("does NOT render approve / decline / cancel / pay / pickup / return / settle / refund buttons", () => {
    for (const banned of [
      "요청 수락",
      "요청 거절",
      "요청 취소",
      "결제하기",
      "결제 진행",
      "픽업 확인",
      "반납 확인",
      "정산하기",
      "환불하기",
    ]) {
      expect(SRC).not.toContain(banned);
    }
  });
});

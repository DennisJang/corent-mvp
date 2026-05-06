// Tests for the closed-alpha Wanted Try Request form.
//
// Coverage split:
//
//   - The pure `buildWantedTryRequestPayload` helper is exported so we
//     can test the SubmitFeedbackPayload shape without React or jsdom
//     (vitest runs in `environment: "node"`).
//   - The remaining surface is pinned via source-level invariants
//     (readFileSync) — same approach as `SearchResults.test.ts`.
//
// What we pin:
//
//   - Payload `kind === "wanted_item"` and `sourcePage` is the
//     hard-coded `/search?empty` constant.
//   - Payload only contains the six SubmitFeedbackPayload fields.
//     `profileId` / `borrowerId` / `sellerId` / `status` / `price` /
//     `payment` / `settlement` / address fields are absent.
//   - Form mounts only the existing `submitFeedback` client adapter.
//     No direct server-only import (no `@/server/**`), no payment /
//     trust_events / notifications / external SDK.
//   - Banlist scan: no `보증` / `보증금` / `보험` / `보장` / `결제
//     완료` / `대여 확정` / `환불` / `정산 완료` /
//     `guaranteed` / `insured` / `verified seller` etc.
//   - Success copy carries the exact closed-vocabulary phrases.
//   - The form is `"use client"` and the component is exported.
//
// Plan:
//   docs/corent_wanted_try_request_slice_plan.md

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WANTED_SOURCE_PAGE,
  buildWantedTryRequestPayload,
} from "./WantedTryRequestForm";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "WantedTryRequestForm.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

// Strip both line and block comments so banlist / authority scans
// only inspect runtime code, not docstrings that legitimately
// negate banned phrases (and may even contain the literal word
// "import" in a sentence).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

describe("buildWantedTryRequestPayload — payload shape", () => {
  it("kind is hard-coded 'wanted_item'", () => {
    const p = buildWantedTryRequestPayload({
      message: "다이슨 에어랩 사기 전에 써보고 싶어요",
      itemName: "",
      category: "",
      contactEmail: "",
    });
    expect(p.kind).toBe("wanted_item");
  });

  it("sourcePage is hard-coded '/search?empty' (not configurable)", () => {
    expect(WANTED_SOURCE_PAGE).toBe("/search?empty");
    const p = buildWantedTryRequestPayload({
      message: "x",
      itemName: "",
      category: "",
      contactEmail: "",
    });
    expect(p.sourcePage).toBe("/search?empty");
  });

  it("trims free-text fields (message, itemName, contactEmail)", () => {
    const p = buildWantedTryRequestPayload({
      message: "  다이슨 에어랩  ",
      itemName: "  Dyson Airwrap  ",
      category: "",
      contactEmail: "  user@example.com  ",
    });
    expect(p.message).toBe("다이슨 에어랩");
    expect(p.itemName).toBe("Dyson Airwrap");
    expect(p.contactEmail).toBe("user@example.com");
  });

  it("optional fields collapse to null when empty / whitespace-only", () => {
    const p = buildWantedTryRequestPayload({
      message: "x",
      itemName: "   ",
      category: "",
      contactEmail: "   ",
    });
    expect(p.itemName).toBeNull();
    expect(p.category).toBeNull();
    expect(p.contactEmail).toBeNull();
  });

  it("forwards a confirmed category enum value", () => {
    const p = buildWantedTryRequestPayload({
      message: "x",
      itemName: "",
      category: "home_care",
      contactEmail: "",
    });
    expect(p.category).toBe("home_care");
  });

  it("payload keys are EXACTLY the six SubmitFeedbackPayload fields — no authority leakage", () => {
    const p = buildWantedTryRequestPayload({
      message: "다이슨 에어랩",
      itemName: "Dyson Airwrap",
      category: "home_care",
      contactEmail: "user@example.com",
    });
    expect(Object.keys(p).sort()).toEqual(
      [
        "category",
        "contactEmail",
        "itemName",
        "kind",
        "message",
        "sourcePage",
      ].sort(),
    );
    // Forbidden authority slots — neither the helper's output nor
    // the SubmitFeedbackPayload type exposes them. This belt-and-
    // suspenders check pins it against a future widening.
    for (const forbidden of [
      "profileId",
      "profile_id",
      "borrowerId",
      "borrower_id",
      "sellerId",
      "seller_id",
      "id",
      "status",
      "price",
      "payment",
      "settlement",
      "exactAddress",
      "exact_address",
      "address",
      "phone",
      "lat",
      "lng",
      "is_admin",
      "founder",
      "role",
      "capability",
    ]) {
      expect(p as unknown as Record<string, unknown>).not.toHaveProperty(
        forbidden,
      );
    }
  });
});

describe("WantedTryRequestForm — client-only, no server-only imports", () => {
  it("declares 'use client'", () => {
    expect(SRC.startsWith('"use client"')).toBe(true);
  });

  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("imports the client adapter @/lib/client/feedbackClient (the only bridge to the server action)", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/feedbackClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/submitFeedback/);
  });

  it("does NOT import any payment / trust_events / notifications / external SDK module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/trust_event/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvents/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai|@supabase\/supabase-js/i);
  });

  it("does NOT import the service-role Supabase client", () => {
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });
});

describe("WantedTryRequestForm — banlist + safety copy", () => {
  it("does not contain regulated / payment-promise phrases", () => {
    for (const banned of [
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
    ]) {
      expect(RUNTIME_SRC).not.toContain(banned);
    }
  });

  it("never promises automatic matching — only conditional phrasing is allowed", () => {
    // "셀러를 찾아드릴게요" / "곧 연결돼요" / "자동으로 매칭" =
    // forbidden promissory phrasing per the slice plan §10.
    expect(RUNTIME_SRC).not.toMatch(/셀러를\s*찾아드릴/);
    expect(RUNTIME_SRC).not.toMatch(/곧\s*연결/);
    // Allowed: "자동으로 매칭되거나 결제가 시작되지는 않아요" — a
    // negation, not a promise. JSX wraps lines, so the negation
    // may sit on the next line; we span newlines and require the
    // denial within ~80 chars.
    const matches =
      RUNTIME_SRC.match(/자동으로[\s\S]{0,4}매칭[\s\S]{0,80}/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m).toMatch(/(되지는?\s*않|않아요|시작되지)/);
    }
  });

  it("renders the success copy from the slice plan §10.4 (calm, conditional)", () => {
    expect(SRC).toContain("받았어요.");
    expect(SRC).toContain("같은 물건을 가진 셀러가 보면 다시 안내드려요.");
    expect(SRC).toMatch(/자동으로\s*매칭되거나\s*결제가\s*시작되지는\s*않아요\./);
  });

  it("reuses the existing mock / local caption verbatim (no new mock-mode string)", () => {
    expect(SRC).toContain(
      "데모 환경에서는 저장되지 않아요. 클로즈드 알파 환경에서만 저장돼요.",
    );
  });
});

describe("WantedTryRequestForm — payload constants pin sourcePage", () => {
  it("the source path constant is exported and immutable", () => {
    expect(WANTED_SOURCE_PAGE).toBe("/search?empty");
  });

  it("the source page is referenced exactly once in code (single source of truth)", () => {
    // Strip strings inside other tokens. Since the constant is
    // exported, the runtime code should reference it via the
    // identifier, not by typing the literal repeatedly.
    const literalOccurrences = (
      RUNTIME_SRC.match(/["']\/search\?empty["']/g) ?? []
    ).length;
    expect(literalOccurrences).toBeLessThanOrEqual(1);
  });
});

// Static-text guards for the renter-facing server listing detail
// component (Bundle 2, Slice 2).
//
// We do not have React Testing Library in this project; component
// behavior is covered transitively through the action + client
// adapter tests (`createRentalRequest.test.ts`,
// `rentalRequestClient.test.ts`, `listPublicListings.test.ts`).
//
// What this file pins down is the source-level invariants that the
// boundary tests cannot express on their own:
//
//   - The component does NOT import from `@/server/**` directly —
//     the existing import-boundary regex would catch this anyway,
//     but we add a per-file scan so a regression is named.
//   - The component does NOT import the local `rentalService`,
//     `getMockRenterSession`, or any payment / claim / trust /
//     handoff / notification / lifecycle service. The renter's
//     server-mode request path stays disjoint from the local
//     demo path.
//   - The component does NOT pass any forged authority field to
//     `submitRentalRequest`. The only `submitRentalRequest` call
//     site in the file uses `listingId` + `durationDays` only.
//   - The component renders the explicit pre-payment posture copy
//     ("아직 결제는 발생하지 않아요. 요청만 전송돼요.") and
//     success copy that says "요청이 전송되었어요" — never
//     anything that implies a confirmed rental, payment, deposit,
//     or guarantee.
//   - The component renders calm, non-secret copy for every
//     blocked state.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "components",
  "ServerListingDetailClient.tsx",
);

const SRC = readFileSync(FILE, "utf-8");
const IMPORT_LINES = SRC.split(/\r?\n/).filter((l) =>
  /^\s*import\b/.test(l),
);
const IMPORT_BLOB = IMPORT_LINES.join("\n");

describe("ServerListingDetailClient — import boundary", () => {
  it("does not import from @/server/** (boundary canary)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does not import the local rentalService or mock identity helpers", () => {
    expect(IMPORT_BLOB).not.toMatch(/@\/lib\/services\/rentalService/);
    expect(IMPORT_BLOB).not.toMatch(/getMockRenterSession/);
    expect(IMPORT_BLOB).not.toMatch(/getMockSellerSession/);
    expect(IMPORT_BLOB).not.toMatch(/@\/lib\/auth\/mockSession/);
  });

  it("does not import any payment / claim / trust / handoff / notification / lifecycle module", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/handoff/i);
    expect(IMPORT_BLOB).not.toMatch(/notification/i);
    expect(IMPORT_BLOB).not.toMatch(/rentalIntentMachine/);
    expect(IMPORT_BLOB).not.toMatch(/rentalIntentRepository/);
    expect(IMPORT_BLOB).not.toMatch(/listing_secrets/);
  });

  it("imports the request adapter at exactly the established hop", () => {
    expect(IMPORT_BLOB).toMatch(
      /from\s+["']@\/lib\/client\/rentalRequestClient["']/,
    );
    expect(IMPORT_BLOB).toMatch(/submitRentalRequest/);
  });
});

describe("ServerListingDetailClient — request payload shape", () => {
  it("forwards only listingId + durationDays to submitRentalRequest (single call site)", () => {
    // There must be exactly one `submitRentalRequest({...})` call.
    // The call must include `listingId:` and `durationDays:` and
    // nothing else — no sellerId / borrowerId / price / status /
    // payment / pickup / return / settlement / adminId / role /
    // capability / approval / trustScore / claimReview key.
    const callMatches = SRC.match(/submitRentalRequest\(\s*\{[^}]*\}/g) ?? [];
    expect(callMatches).toHaveLength(1);
    const call = callMatches[0]!;
    expect(call).toMatch(/listingId\s*:/);
    expect(call).toMatch(/durationDays\s*:/);
    for (const forbidden of [
      "sellerId",
      "borrowerId",
      "rentalFee",
      "amounts",
      "status",
      "payment",
      "pickup",
      "return",
      "settlement",
      "adminId",
      "role",
      "capability",
      "approval",
      "trustScore",
      "claimReview",
    ]) {
      expect(call).not.toMatch(new RegExp(`${forbidden}\\s*:`));
    }
  });
});

describe("ServerListingDetailClient — pre-payment beta copy", () => {
  it("renders the explicit pre-payment posture line", () => {
    expect(SRC).toContain("아직 결제는 발생하지 않아요");
    expect(SRC).toContain("요청만 전송돼요");
  });

  it("success copy says 'request was sent', never 'rental confirmed' / 'payment' / 'deposit' / 'guarantee'", () => {
    // The success panel exists.
    expect(SRC).toContain("요청이 전송되었어요");
    // Active payment / deposit / guarantee / insurance / coverage
    // language must not appear in this file.
    const bannedActivePhrases = [
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
    ];
    for (const phrase of bannedActivePhrases) {
      expect(SRC).not.toContain(phrase);
    }
  });

  it("explicitly notes that the rental is not yet confirmed", () => {
    expect(SRC).toContain("아직 대여가 확정된 것은 아니에요");
  });
});

describe("ServerListingDetailClient — blocked-state copy", () => {
  it("provides calm Korean copy for every reason and never echoes server internals", () => {
    // Every reason has a copy entry; the entries are bounded
    // strings (no SQL / env / table leak).
    for (const reason of [
      "unauthenticated",
      "ownership",
      "not_found",
      "input",
      "unsupported",
      "error",
    ]) {
      expect(SRC).toMatch(
        new RegExp(`\\b${reason}\\b\\s*:\\s*["']`),
      );
    }
    // Server internals must not appear in the copy.
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).not.toMatch(/relation .* does not exist/);
  });

  it("offers a sign-in link when the request is blocked by missing auth", () => {
    expect(SRC).toContain("로그인 페이지로 이동");
    expect(SRC).toMatch(/href=["']\/login["']/);
  });
});

describe("ServerListingDetailClient — design discipline", () => {
  it("does not introduce a non-token color (no hex / rgb / named-color literals beyond #000 / #fff / inherit / currentColor / transparent)", () => {
    // Every color must come from --ink-* or the BW palette tokens.
    // We allow the design tokens, semantic keywords, and CSS
    // currentColor / inherit / transparent. Anything else is a
    // design-system violation.
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

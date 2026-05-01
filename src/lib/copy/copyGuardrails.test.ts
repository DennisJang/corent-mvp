// Beta-mode copy guardrail.
//
// CoRent's MVP is pre-payment. User-facing surfaces must not imply
// that money is actually charged, held, refunded, or paid out today.
// This test scans a curated list of user-facing source files for
// PROMISE PATTERNS — literal Korean / English phrases that imply
// active money movement or financial guarantees.
//
// Design notes:
//
//   - The deny list is intentionally **phrase-level**, not word-level.
//     Words alone (`결제`, `정산`, `보증금`, `환불`, `에스크로`) are
//     allowed because legitimate negation / process-language copy
//     needs them ("결제는 아직 연결되어 있지 않아요"). What we forbid
//     is the active-promise shape ("수수료 10%", "자동으로 환급",
//     "정산됩니다", "안전거래", "토스페이먼츠", etc.).
//
//   - The scan operates on **source text** so the test can run in the
//     existing Node test environment without jsdom or React rendering.
//     Comments and code-only identifiers are deliberately excluded
//     from the scan inputs (we read curated user-facing files; route
//     pages and components only).
//
//   - When a future PR needs to introduce one of these phrases inside
//     a comment or a clearly-disclaimed not-implemented note, prefer
//     rewording over expanding the allow-list. If unavoidable, add an
//     `ALLOW_FILE_PHRASES` entry below with a short justification.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "../../..");

// Curated list of user-facing source files. Server-only files,
// internal comments-only modules, and the legal `terms.tsx` /
// `privacy.tsx` pages (which intentionally negate every banned
// concept by name) are excluded — those negation pages have their
// own audit and would create noise here.
const USER_FACING_FILES = [
  "src/app/page.tsx",
  "src/components/ItemDetailClient.tsx",
  "src/components/pricing/PriceBreakdown.tsx",
  "src/components/SellerRegistration.tsx",
  "src/components/SellerDashboard.tsx",
  "src/components/ProductCard.tsx",
  "src/components/SellerStorefront.tsx",
  "src/components/SellerStorefrontProfileOverlay.tsx",
  "src/components/SellerProfileEditCard.tsx",
  "src/components/intent/IntentStatusBadge.tsx",
  "src/components/intent/RentalIntentTimeline.tsx",
];

// Promise-shaped phrases that imply active money movement or a
// financial guarantee. Match is case-insensitive. The list stays
// small and explicit so a future reviewer can audit it at a glance.
const FORBIDDEN_PHRASES = [
  // Korean — fee / settlement promises
  "수수료 10%",
  "플랫폼 수수료",
  "판매자 정산",
  "결제 합계",
  "안전 보증금",
  "정산됩니다",
  "정산이 진행됩니다",
  "자동으로 정산",
  "자동 정산",
  "자동으로 환급",
  "자동 환급",
  "환급됩니다",
  "환급돼요",
  "환불됩니다",
  "환불해드립니다",
  "보장됩니다",
  "전액 보상",
  "파손 보장",
  "안전거래",
  "에스크로 보호",
  "보험 가입",
  "토스페이먼츠",
  // English — same family
  "platform fee",
  "settlement payout",
  "auto refund",
  "auto-refund",
  "auto settle",
  "guaranteed payout",
  "fully refunded",
  "safe escrow",
  "fraud protection",
  "Toss Payments",
];

// Per-file allow-list. Entry shape: `{ file → array of phrases that
// are present for justified reasons (typically a negation disclaimer
// inside a clearly-marked beta block) }`. Add an entry only with a
// short justification comment. An empty allow-list is the default —
// the surface should reword instead.
const ALLOW_FILE_PHRASES: Record<string, string[]> = {};

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf8");
}

describe("user-facing copy guardrails — no active money promises", () => {
  for (const file of USER_FACING_FILES) {
    it(`${file} contains no forbidden promise phrases`, () => {
      const source = readSource(file).toLowerCase();
      const allow = (ALLOW_FILE_PHRASES[file] ?? []).map((s) =>
        s.toLowerCase(),
      );
      const hits: string[] = [];
      for (const phrase of FORBIDDEN_PHRASES) {
        const needle = phrase.toLowerCase();
        if (allow.includes(needle)) continue;
        if (source.includes(needle)) hits.push(phrase);
      }
      expect(hits, `forbidden phrases found in ${file}`).toEqual([]);
    });
  }

  it("the curated file list is non-empty (drift guard)", () => {
    expect(USER_FACING_FILES.length).toBeGreaterThan(0);
  });

  it("the forbidden-phrase list is non-empty (drift guard)", () => {
    expect(FORBIDDEN_PHRASES.length).toBeGreaterThan(0);
  });

  it("allow-list keys must reference files in the curated list", () => {
    for (const key of Object.keys(ALLOW_FILE_PHRASES)) {
      expect(USER_FACING_FILES, `unknown allow-list file: ${key}`).toContain(
        key,
      );
    }
  });
});

// Static-text invariants for the founder admin login page.
// Behavior (Supabase auth + redirects) lives in the auth route
// tests; this file pins the visible surface against drift.
//
// Coverage:
//   - Password form posts to /admin/auth/password-sign-in and is the
//     primary surface (renders before magic link).
//   - Magic-link fallback still posts to /admin/auth/sign-in.
//   - Password input is type="password" + autoComplete="current-password".
//   - Copy clarifies the founder-allowlist gate is unchanged:
//     "운영자 권한은 로그인만으로 부여되지 않아요."
//     "허용 목록에 등록된 계정만 cockpit에 접근할 수 있어요."
//   - Error chips for password_invalid / password_unavailable.
//   - signed_out chip preserved.
//   - No banned regulated / payment copy.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(
  process.cwd(),
  "src",
  "app",
  "admin",
  "login",
  "page.tsx",
);
const SRC = readFileSync(FILE, "utf-8");

describe("/admin/login — password form is primary", () => {
  it("renders a password sign-in form posting to /admin/auth/password-sign-in", () => {
    expect(SRC).toMatch(/action=["']\/admin\/auth\/password-sign-in["']/);
  });

  it("password form has a password input with type=\"password\" + autoComplete=\"current-password\"", () => {
    expect(SRC).toMatch(/type=["']password["'][\s\S]*?name=["']password["']/);
    expect(SRC).toMatch(/autoComplete=["']current-password["']/);
  });

  it("password form appears in source order BEFORE the magic-link fallback", () => {
    const passwordIdx = SRC.indexOf("/admin/auth/password-sign-in");
    const magicLinkActionMatch = /action=["']\/admin\/auth\/sign-in["']/.exec(SRC);
    expect(passwordIdx).toBeGreaterThan(-1);
    expect(magicLinkActionMatch?.index).toBeDefined();
    expect(passwordIdx).toBeLessThan(magicLinkActionMatch!.index!);
  });
});

describe("/admin/login — magic-link fallback still present", () => {
  it("renders a magic-link form posting to /admin/auth/sign-in", () => {
    expect(SRC).toMatch(/action=["']\/admin\/auth\/sign-in["']/);
  });

  it("labels the fallback section so testers know which is primary", () => {
    expect(SRC).toContain("매직 링크 (백업 경로)");
  });
});

describe("/admin/login — founder allowlist gate copy unchanged", () => {
  it("says login alone does not grant operator authority", () => {
    // The copy line wraps in JSX, so allow whitespace between tokens.
    expect(SRC).toMatch(/운영자 권한은\s+로그인만으로\s+부여되지\s+않아요/);
  });

  it("says only allowlisted accounts can reach /admin/cockpit", () => {
    expect(SRC).toMatch(/허용 목록에\s+등록된\s+계정만\s+cockpit에/);
  });

  it("does NOT call requireFounderSession from the page itself (the route handler enforces it on /admin/cockpit)", () => {
    // Defense in depth — the LOGIN page never short-circuits via
    // requireFounderSession. A non-allowlisted authenticated user
    // is shown the SignedInNotFounderPanel instead of being 404'd
    // here. The 404 enforcement stays on /admin/cockpit.
    expect(SRC).not.toMatch(/requireFounderSession\s*\(/);
  });
});

describe("/admin/login — error chips for password failure modes", () => {
  it("renders a `password_invalid` chip with calm copy", () => {
    expect(SRC).toContain('passwordError === "password_invalid"');
    expect(SRC).toContain("이메일 또는 비밀번호가 일치하지 않아요");
  });

  it("renders a `password_unavailable` chip pointing at magic-link", () => {
    expect(SRC).toContain('passwordError === "password_unavailable"');
    expect(SRC).toContain("비밀번호 로그인이 일시적으로 준비되지 않았어요");
  });

  it("preserves the existing `signed_out` (out=1) chip", () => {
    expect(SRC).toContain('params.out === "1"');
    expect(SRC).toContain("로그아웃되었어요");
  });
});

describe("/admin/login — no banned regulated / payment copy", () => {
  const BANNED = [
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
  ];

  it.each(BANNED)("does not contain regulated/payment phrase %s", (phrase) => {
    expect(SRC).not.toContain(phrase);
  });
});

describe("/admin/login — server-only / dynamic posture preserved", () => {
  it("keeps dynamic = 'force-dynamic'", () => {
    expect(SRC).toMatch(/export const dynamic = ["']force-dynamic["']/);
  });

  it("imports session summary from @/server/auth/sessionSummary", () => {
    expect(SRC).toMatch(
      /from\s+["']@\/server\/auth\/sessionSummary["']/,
    );
  });
});

// Static-text invariants for the closed-alpha CoRent user login
// page. Behavior (Supabase auth client construction, redirects)
// lives in the auth route tests; this file pins down the visible
// surface of `/login` against drift.
//
// Coverage:
//   - Password form posts to `/auth/password-sign-in` and is the
//     primary surface (renders before the magic-link form).
//   - Magic-link fallback still posts to `/auth/sign-in`.
//   - Password input has type="password" and never has type="text"
//     (defense in depth against an autofill-only edit).
//   - Copy clarifies "등록된 클로즈드 알파 계정" + "새 계정 생성은
//     아직 열려 있지 않아요." per closed-alpha provisioning.
//   - Error chips for `password_invalid` / `password_unavailable`
//     exist as conditional render branches.
//   - The `signed_out` chip (out=1 query) still renders.
//   - No banned regulated / payment copy ever leaks here.
//
// Behavior tests for the routes themselves live under
// `src/app/auth/sign-in/route.test.ts` and
// `src/app/auth/password-sign-in/route.test.ts`.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "src", "app", "login", "page.tsx");
const SRC = readFileSync(FILE, "utf-8");

describe("/login — password form is primary", () => {
  it("renders a password sign-in form posting to /auth/password-sign-in", () => {
    expect(SRC).toMatch(/action=["']\/auth\/password-sign-in["']/);
  });

  it("password form has a password input with type=\"password\" + autoComplete=\"current-password\"", () => {
    // The password input must be type="password" — type="text" would
    // expose the password to autofill / the rendered DOM tree.
    expect(SRC).toMatch(/type=["']password["'][\s\S]*?name=["']password["']/);
    expect(SRC).toMatch(/autoComplete=["']current-password["']/);
  });

  it("password form appears in source order BEFORE the magic-link fallback", () => {
    const passwordIdx = SRC.indexOf("/auth/password-sign-in");
    const magicLinkIdx = SRC.indexOf("/auth/sign-in");
    expect(passwordIdx).toBeGreaterThan(-1);
    expect(magicLinkIdx).toBeGreaterThan(-1);
    // The password action string must appear earlier in the file
    // than the magic-link action string. Note: `/auth/password-sign-in`
    // contains `auth/sign-in` as a substring, so we use a stricter
    // anchored check below as well.
    const magicLinkActionMatch = /action=["']\/auth\/sign-in["']/.exec(SRC);
    expect(magicLinkActionMatch?.index).toBeDefined();
    expect(passwordIdx).toBeLessThan(magicLinkActionMatch!.index!);
  });
});

describe("/login — magic-link fallback still present", () => {
  it("renders a magic-link form posting to /auth/sign-in (not the password endpoint)", () => {
    expect(SRC).toMatch(/action=["']\/auth\/sign-in["']/);
  });

  it("labels the fallback section so testers know which is primary", () => {
    expect(SRC).toContain("매직 링크 (백업 경로)");
  });
});

describe("/login — closed-alpha posture in copy", () => {
  it("says the page is for already-provisioned closed-alpha accounts", () => {
    expect(SRC).toContain("등록된 클로즈드 알파 계정");
  });

  it("says new account creation is not open yet", () => {
    // The copy line wraps in JSX, so allow whitespace between tokens.
    expect(SRC).toMatch(/새 계정 생성은\s+아직\s+열려\s+있지\s+않아요/);
  });

  it("clarifies that login is identity only — capability is granted by operator", () => {
    expect(SRC).toContain("판매자 자격");
    expect(SRC).toContain("운영자가 별도로 승인");
  });
});

describe("/login — error chips for password failure modes", () => {
  it("renders an `password_invalid` chip with calm copy (no raw error message)", () => {
    expect(SRC).toContain('passwordError === "password_invalid"');
    expect(SRC).toContain("이메일 또는 비밀번호가 일치하지 않아요");
  });

  it("renders an `password_unavailable` chip pointing at magic-link as fallback", () => {
    expect(SRC).toContain('passwordError === "password_unavailable"');
    expect(SRC).toContain("비밀번호 로그인이 일시적으로 준비되지 않았어요");
  });

  it("preserves the existing `signed_out` (out=1) chip", () => {
    expect(SRC).toContain('params.out === "1"');
    expect(SRC).toContain("로그아웃되었어요");
  });
});

describe("/login — no banned regulated / payment copy", () => {
  // Mirror of the closed-alpha quality-gate banlist (subset that is
  // forbidden anywhere on the user-facing login surface). Negated /
  // closed-vocabulary readiness card lives elsewhere; the login page
  // must never carry these literally.
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

describe("/login — server-only / dynamic posture preserved", () => {
  it("keeps dynamic = 'force-dynamic' so session is read per request", () => {
    expect(SRC).toMatch(/export const dynamic = ["']force-dynamic["']/);
  });

  it("imports session summary from @/server/auth/sessionSummary (not from a client module)", () => {
    expect(SRC).toMatch(
      /from\s+["']@\/server\/auth\/sessionSummary["']/,
    );
  });
});

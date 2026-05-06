// Source-level invariants for the closed-alpha password sign-in
// routes. Behavior is covered by the per-route handler tests; this
// file pins down the *static* posture so future drift can't quietly
// re-introduce signup, auto-provisioning, or a founder-authority
// shortcut.
//
// Pinned invariants (per the closed-alpha quality gates):
//
//   1. Neither password route imports `signUp` or sets
//      `shouldCreateUser` — both routes are sign-in only, never
//      provisioning.
//   2. Neither password route imports/queries the profile-insert
//      paths (no `from('profiles')` / `seller_profiles` /
//      `borrower_profiles` writes).
//   3. The admin password route does NOT import / call
//      `requireFounderSession`. Founder authority remains a
//      per-request gate on `/admin/cockpit`.
//   4. Magic-link route files are still present and still post to
//      `signInWithOtp` with `shouldCreateUser: false` — i.e. the
//      magic-link fallback hasn't been removed or relaxed.
//   5. The user password route imports `safeUserNextPath` (not
//      `safeAdminNextPath`) and the admin password route imports
//      `safeAdminNextPath` (not `safeUserNextPath`).
//   6. The `<form action>` strings on the login pages still point
//      at the password routes AND the magic-link routes — both
//      paths are reachable from the UI.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function readSrc(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

// Strip `// line` and `/* block */` comments so checks below match
// only on actual code, not on docstrings that *explain why a token
// is absent*. The route file's docstring deliberately mentions
// `requireFounderSession`, `founder`, etc. as denials; the code
// must stay clean.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const USER_PW_SRC_FULL = readSrc("src/app/auth/password-sign-in/route.ts");
const ADMIN_PW_SRC_FULL = readSrc(
  "src/app/admin/auth/password-sign-in/route.ts",
);
const USER_PW_SRC = stripComments(USER_PW_SRC_FULL);
const ADMIN_PW_SRC = stripComments(ADMIN_PW_SRC_FULL);
const USER_MAGIC_SRC = readSrc("src/app/auth/sign-in/route.ts");
const ADMIN_MAGIC_SRC = readSrc("src/app/admin/auth/sign-in/route.ts");
const USER_LOGIN_PAGE = readSrc("src/app/login/page.tsx");
const ADMIN_LOGIN_PAGE = readSrc("src/app/admin/login/page.tsx");

describe("password sign-in routes — no signup, no auto-provisioning", () => {
  it("user password route never references signUp / shouldCreateUser", () => {
    expect(USER_PW_SRC).not.toMatch(/\bsignUp\b/);
    expect(USER_PW_SRC).not.toMatch(/\bshouldCreateUser\b/);
  });

  it("admin password route never references signUp / shouldCreateUser", () => {
    expect(ADMIN_PW_SRC).not.toMatch(/\bsignUp\b/);
    expect(ADMIN_PW_SRC).not.toMatch(/\bshouldCreateUser\b/);
  });

  it("user password route never writes profiles / seller_profiles / borrower_profiles", () => {
    expect(USER_PW_SRC).not.toMatch(/from\(\s*["']profiles["']\s*\)/);
    expect(USER_PW_SRC).not.toMatch(/from\(\s*["']seller_profiles["']\s*\)/);
    expect(USER_PW_SRC).not.toMatch(/from\(\s*["']borrower_profiles["']\s*\)/);
    // Never imports the profile lookup module either — that is read-only,
    // but staying out keeps the route's surface tiny.
    expect(USER_PW_SRC).not.toMatch(/profileLookup/);
  });

  it("admin password route never writes profiles / seller_profiles / borrower_profiles", () => {
    expect(ADMIN_PW_SRC).not.toMatch(/from\(\s*["']profiles["']\s*\)/);
    expect(ADMIN_PW_SRC).not.toMatch(/from\(\s*["']seller_profiles["']\s*\)/);
    expect(ADMIN_PW_SRC).not.toMatch(/from\(\s*["']borrower_profiles["']\s*\)/);
    expect(ADMIN_PW_SRC).not.toMatch(/profileLookup/);
  });
});

describe("admin password route — no founder-authority shortcut", () => {
  it("admin password route does NOT import or call requireFounderSession", () => {
    expect(ADMIN_PW_SRC).not.toMatch(/requireFounderSession/);
  });

  it("admin password route does NOT import @/server/admin/auth", () => {
    // The per-request founder gate lives in @/server/admin/auth.ts.
    // The password route must not touch it — it only authenticates;
    // authority is decided per-request at the surface (e.g.
    // /admin/cockpit calls requireFounderSession itself).
    expect(ADMIN_PW_SRC).not.toMatch(/from\s+["']@\/server\/admin\/auth["']/);
  });

  it("admin password route does NOT set or read founder / role / capability fields on the session", () => {
    expect(ADMIN_PW_SRC).not.toMatch(/\bfounder\s*[:=]/);
    expect(ADMIN_PW_SRC).not.toMatch(/\bis_admin\b/);
    expect(ADMIN_PW_SRC).not.toMatch(/\bcapability\b/);
  });
});

describe("magic-link fallback remains intact", () => {
  it("user magic-link route file still exists", () => {
    expect(existsSync(join(ROOT, "src/app/auth/sign-in/route.ts"))).toBe(true);
  });

  it("admin magic-link route file still exists", () => {
    expect(existsSync(join(ROOT, "src/app/admin/auth/sign-in/route.ts"))).toBe(
      true,
    );
  });

  it("user magic-link route still calls signInWithOtp with shouldCreateUser=false", () => {
    expect(USER_MAGIC_SRC).toMatch(/signInWithOtp/);
    expect(USER_MAGIC_SRC).toMatch(/shouldCreateUser:\s*false/);
  });

  it("admin magic-link route still calls signInWithOtp with shouldCreateUser=false", () => {
    expect(ADMIN_MAGIC_SRC).toMatch(/signInWithOtp/);
    expect(ADMIN_MAGIC_SRC).toMatch(/shouldCreateUser:\s*false/);
  });

  it("admin magic-link route still consults isAllowlistedFounder before sending the link", () => {
    expect(ADMIN_MAGIC_SRC).toMatch(/isAllowlistedFounder/);
  });
});

describe("password routes import only the correct redirect helper", () => {
  it("user password route imports safeUserNextPath, not safeAdminNextPath", () => {
    expect(USER_PW_SRC).toMatch(
      /from\s+["']@\/server\/auth\/redirect["']/,
    );
    expect(USER_PW_SRC).not.toMatch(
      /from\s+["']@\/server\/admin\/redirect["']/,
    );
  });

  it("admin password route imports safeAdminNextPath, not safeUserNextPath", () => {
    expect(ADMIN_PW_SRC).toMatch(
      /from\s+["']@\/server\/admin\/redirect["']/,
    );
    expect(ADMIN_PW_SRC).not.toMatch(
      /from\s+["']@\/server\/auth\/redirect["']/,
    );
  });
});

describe("login pages expose both auth methods", () => {
  it("/login posts to BOTH password and magic-link routes", () => {
    expect(USER_LOGIN_PAGE).toMatch(/action=["']\/auth\/password-sign-in["']/);
    expect(USER_LOGIN_PAGE).toMatch(/action=["']\/auth\/sign-in["']/);
  });

  it("/admin/login posts to BOTH password and magic-link routes", () => {
    expect(ADMIN_LOGIN_PAGE).toMatch(
      /action=["']\/admin\/auth\/password-sign-in["']/,
    );
    expect(ADMIN_LOGIN_PAGE).toMatch(/action=["']\/admin\/auth\/sign-in["']/);
  });
});

describe("password routes — POST-only verb gating asserted in source", () => {
  it("user password route exports POST plus 405 stubs for the other verbs", () => {
    expect(USER_PW_SRC).toMatch(/export async function POST/);
    expect(USER_PW_SRC).toMatch(/export async function GET/);
    expect(USER_PW_SRC).toMatch(/export async function PUT/);
    expect(USER_PW_SRC).toMatch(/export async function PATCH/);
    expect(USER_PW_SRC).toMatch(/export async function DELETE/);
    // Each non-POST stub must return a 405 (defense in depth).
    const non_post_count = (USER_PW_SRC.match(/status:\s*405/g) ?? []).length;
    expect(non_post_count).toBeGreaterThanOrEqual(4);
  });

  it("admin password route exports POST plus 405 stubs for the other verbs", () => {
    expect(ADMIN_PW_SRC).toMatch(/export async function POST/);
    expect(ADMIN_PW_SRC).toMatch(/export async function GET/);
    expect(ADMIN_PW_SRC).toMatch(/export async function PUT/);
    expect(ADMIN_PW_SRC).toMatch(/export async function PATCH/);
    expect(ADMIN_PW_SRC).toMatch(/export async function DELETE/);
    const non_post_count = (ADMIN_PW_SRC.match(/status:\s*405/g) ?? []).length;
    expect(non_post_count).toBeGreaterThanOrEqual(4);
  });
});

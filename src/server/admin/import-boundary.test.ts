// Static-text guards. These tests don't execute code; they grep across
// the source tree to enforce import / secret boundaries that lint cannot
// always express. Required by:
//   - docs/corent_security_review_phase1_2026-04-30.md §3.2 (service-role
//     key handling) and §3.20 (NEXT_PUBLIC_* exposure).
//   - The Phase 1.5 brief: SSR auth module must not pull the service-role
//     key, and must not be reachable from client components.
//
// Read-only: we touch the filesystem, never write.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..", "..", "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const ALL_FILES = walk(SRC_ROOT);

function readRel(file: string): string {
  return readFileSync(file, "utf8");
}

describe("SSR auth module boundary", () => {
  it("@/server/admin/supabase-ssr is never imported by src/components/**", () => {
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      const rel = relative(SRC_ROOT, f);
      if (!rel.startsWith("components/")) continue;
      const src = readRel(f);
      if (
        src.includes("@/server/admin/supabase-ssr") ||
        src.includes("@/server/admin/auth") ||
        /from\s+["']@\/server\//.test(src)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file outside src/server/** imports from "@supabase/ssr"', () => {
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      const rel = relative(SRC_ROOT, f);
      if (rel.startsWith("server/")) continue;
      // Tests for the routes need to mock the module path; they themselves
      // never import the package. The mock is via vi.mock("@/server/admin/...").
      const src = readRel(f);
      if (/from\s+["']@supabase\/ssr["']/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("supabase-ssr.ts never references SUPABASE_SERVICE_ROLE_KEY", () => {
    const file = join(SRC_ROOT, "server", "admin", "supabase-ssr.ts");
    const src = readRel(file);
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(src).not.toContain("readSupabaseServerEnv");
    // It must use the anon-key reader exclusively.
    expect(src).toContain("readSupabaseAuthEnv");
  });

  it("admin auth.ts (founder session reader) never references SUPABASE_SERVICE_ROLE_KEY", () => {
    const file = join(SRC_ROOT, "server", "admin", "auth.ts");
    const src = readRel(file);
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(src).not.toContain("readSupabaseServerEnv");
    expect(src).not.toContain("getServiceRoleClient");
  });

  it("admin auth route handlers never reference SUPABASE_SERVICE_ROLE_KEY", () => {
    const targets = [
      join(SRC_ROOT, "app", "admin", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "admin", "auth", "sign-in", "route.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(src).not.toContain("getServiceRoleClient");
      expect(src).not.toContain("readSupabaseServerEnv");
    }
  });
});

describe("NEXT_PUBLIC_* deny-list (security review §3.20)", () => {
  const DENY = /(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)/i;

  it("no NEXT_PUBLIC_* variable name matches the deny-list regex", () => {
    const offenders: { file: string; match: string }[] = [];
    for (const f of ALL_FILES) {
      const rel = relative(SRC_ROOT, f);
      // Skip this test file — it intentionally contains the regex.
      if (rel.endsWith("import-boundary.test.ts")) continue;
      const src = readRel(f);
      const matches = src.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const m of matches) {
        if (DENY.test(m)) offenders.push({ file: rel, match: m });
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Server-only logger boundary", () => {
  it("admin auth route handlers do not use console.* directly", () => {
    const targets = [
      join(SRC_ROOT, "app", "admin", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "admin", "auth", "sign-in", "route.ts"),
    ];
    const consoleRe = /console\.(log|info|warn|error|debug|trace)\s*\(/;
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toMatch(consoleRe);
    }
  });

  it("admin auth route handlers never log raw email or token-bearing values", () => {
    const targets = [
      join(SRC_ROOT, "app", "admin", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "admin", "auth", "sign-in", "route.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      // No reference to logging the raw email / body / token / session.
      expect(src).not.toMatch(/log[A-Za-z]+\(.*email\b/);
      expect(src).not.toMatch(/log[A-Za-z]+\(.*\baccess_token\b/);
      expect(src).not.toMatch(/log[A-Za-z]+\(.*\brefresh_token\b/);
      expect(src).not.toMatch(/log[A-Za-z]+\(.*\bsession\b/);
    }
  });
});

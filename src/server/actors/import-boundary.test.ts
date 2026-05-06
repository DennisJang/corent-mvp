// Static-text guardrail for the server-side actor seam.
//
// The rule: only `src/server/actors/resolveServerActor.ts` may
// reach the mock identity helpers from production server runtime
// code. Every other server module (intake actions, future
// rental/claim/admin server actions, etc.) MUST go through the
// resolver — that is the single seam where real auth replaces the
// mock helpers.
//
// Two helper modules are both forbidden:
//
//   - `@/lib/auth/mockSession` — the mock seller / renter sessions.
//   - `@/data/mockSellers` — the static SELLERS fixture; reaching
//     for it on a server runtime path would let a future caller
//     pluck identities directly without going through the resolver.
//
// Patterns covered:
//
//   - bare `from "@/lib/auth/mockSession"`
//   - extension-suffixed `from "@/lib/auth/mockSession.ts"`
//   - relative path variants
//   - `require()` calls
//   - dynamic `import("...")` calls
//
// Test files (`*.test.ts` / `*.test.tsx`) under `src/server/**` are
// excluded — they may legitimately import mock fixtures for setup.
// Production server runtime files are scanned strictly.
//
// This is a docs-as-tests pattern (same shape as
// `src/server/admin/import-boundary.test.ts`). It greps the
// filesystem; it does not execute imports.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(__dirname, "..", "..", "..", "src");
const SERVER_ROOT = join(SRC_ROOT, "server");

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

const ALL_SERVER_FILES = walk(SERVER_ROOT);

// Production runtime files only — tests can import freely (they may
// seed `CURRENT_SELLER` from `@/data/mockSellers`, mock identities,
// etc.). The actor seam guard is about runtime code paths, not
// test-time fixtures.
const SERVER_RUNTIME_FILES = ALL_SERVER_FILES.filter(
  (f) => !/\.test\.(ts|tsx)$/.test(f),
);

const MOCK_SESSION_PATTERNS: RegExp[] = [
  // static `from "@/lib/auth/mockSession"` (with or without `.ts`)
  /from\s+["']@\/lib\/auth\/mockSession(?:\.tsx?)?["']/,
  /from\s+["'](?:\.\.\/)+lib\/auth\/mockSession(?:\.tsx?)?["']/,
  // CommonJS require
  /require\(\s*["']@\/lib\/auth\/mockSession(?:\.tsx?)?["']\s*\)/,
  /require\(\s*["'](?:\.\.\/)+lib\/auth\/mockSession(?:\.tsx?)?["']\s*\)/,
  // dynamic `import("...")`
  /import\(\s*["']@\/lib\/auth\/mockSession(?:\.tsx?)?["']\s*\)/,
  /import\(\s*["'](?:\.\.\/)+lib\/auth\/mockSession(?:\.tsx?)?["']\s*\)/,
];

const MOCK_SELLERS_PATTERNS: RegExp[] = [
  /from\s+["']@\/data\/mockSellers(?:\.tsx?)?["']/,
  /from\s+["'](?:\.\.\/)+data\/mockSellers(?:\.tsx?)?["']/,
  /require\(\s*["']@\/data\/mockSellers(?:\.tsx?)?["']\s*\)/,
  /require\(\s*["'](?:\.\.\/)+data\/mockSellers(?:\.tsx?)?["']\s*\)/,
  /import\(\s*["']@\/data\/mockSellers(?:\.tsx?)?["']\s*\)/,
  /import\(\s*["'](?:\.\.\/)+data\/mockSellers(?:\.tsx?)?["']\s*\)/,
];

// Files allowed to import the mock identity helpers. The intent is
// to keep this at exactly ONE entry — the resolver — until real
// auth ships and the import disappears entirely.
const ALLOWED_MOCK_IDENTITY_IMPORTERS = new Set<string>([
  "actors/resolveServerActor.ts",
]);

describe("server actor seam — mock identity import boundary", () => {
  it("only `actors/resolveServerActor.ts` may reach @/lib/auth/mockSession from server runtime", () => {
    const offenders: string[] = [];
    for (const file of SERVER_RUNTIME_FILES) {
      const rel = relative(SERVER_ROOT, file);
      const src = readFileSync(file, "utf8");
      const hits = MOCK_SESSION_PATTERNS.some((re) => re.test(src));
      if (!hits) continue;
      if (ALLOWED_MOCK_IDENTITY_IMPORTERS.has(rel)) continue;
      offenders.push(rel);
    }
    expect(
      offenders,
      "src/server/** runtime files reaching @/lib/auth/mockSession outside the resolver",
    ).toEqual([]);
  });

  it("server runtime never reaches @/data/mockSellers directly", () => {
    const offenders: string[] = [];
    for (const file of SERVER_RUNTIME_FILES) {
      const rel = relative(SERVER_ROOT, file);
      const src = readFileSync(file, "utf8");
      const hits = MOCK_SELLERS_PATTERNS.some((re) => re.test(src));
      if (!hits) continue;
      // No file should import the static fixture from server
      // runtime — even the resolver. Tests use it freely.
      offenders.push(rel);
    }
    expect(
      offenders,
      "src/server/** runtime files reaching @/data/mockSellers (use the resolver instead)",
    ).toEqual([]);
  });

  it("the resolver imports the mock session helper today (canary)", () => {
    // If this expectation flips to false, real auth has likely
    // landed and the allowlist above can shrink to an empty set.
    // Failing loudly here forces the boundary test to be revisited
    // rather than silently allowing zero importers and forgetting
    // why.
    const file = join(SERVER_ROOT, "actors", "resolveServerActor.ts");
    const src = readFileSync(file, "utf8");
    const importsMock = MOCK_SESSION_PATTERNS.some((re) => re.test(src));
    expect(importsMock).toBe(true);
  });

  it("server actions never reach the mock session helper directly", () => {
    // Intake actions and any future per-domain `actions.ts` files
    // must call `resolveServerActor()` instead. Spot-check every
    // production `actions.ts` file under `src/server/**`.
    const candidates = SERVER_RUNTIME_FILES.filter((f) =>
      /\/actions\.ts$/.test(f),
    );
    for (const file of candidates) {
      const src = readFileSync(file, "utf8");
      for (const re of MOCK_SESSION_PATTERNS) {
        expect(
          re.test(src),
          `${relative(SERVER_ROOT, file)} must not import mockSession directly`,
        ).toBe(false);
      }
      for (const re of MOCK_SELLERS_PATTERNS) {
        expect(
          re.test(src),
          `${relative(SERVER_ROOT, file)} must not import mockSellers directly`,
        ).toBe(false);
      }
    }
  });

  it("dynamic-import bypass attempts are rejected (synthetic regex sanity)", () => {
    // Sanity check on the patterns themselves — confirm the regexes
    // catch the common bypass shapes. Guards against future edits
    // that accidentally weaken the patterns.
    const cases = [
      `await import("@/lib/auth/mockSession")`,
      `await import('@/lib/auth/mockSession.ts')`,
      `import("../../lib/auth/mockSession")`,
      `require("@/lib/auth/mockSession")`,
      `require('@/lib/auth/mockSession.ts')`,
    ];
    for (const c of cases) {
      const matched = MOCK_SESSION_PATTERNS.some((re) => re.test(c));
      expect(matched, `pattern set must match: ${c}`).toBe(true);
    }
  });
});

// =====================================================================
// PR 5A — closed-alpha profile / capability lookup boundary
//
// `lookupProfileCapabilities` reads the profile + capability rows
// (profiles, seller_profiles, borrower_profiles) and is the single
// supabase-side seam used by `resolveServerActor`. Two boundary
// invariants:
//
//   1. Only the resolver may call it from production server runtime.
//      Server actions, services, dispatchers, etc. resolve actors via
//      `resolveServerActor()` — they never look up capabilities
//      themselves.
//
//   2. The lookup helper is read-only: no insert / upsert / update
//      paths exist. Closed-alpha posture is "manual seed only"; an
//      automatic insert here would silently grant capabilities the
//      founder did not approve.
//
// Tests are static-text guards (same pattern as the mock-session
// boundary above). They grep the filesystem; no code is executed.
// =====================================================================

const ALL_SRC_FILES = walk(join(__dirname, "..", "..", "..", "src"));

const PROFILE_LOOKUP_PATTERNS: RegExp[] = [
  /from\s+["']@\/server\/actors\/profileLookup(?:\.tsx?)?["']/,
  /from\s+["'](?:\.\.\/)+server\/actors\/profileLookup(?:\.tsx?)?["']/,
  /require\(\s*["']@\/server\/actors\/profileLookup(?:\.tsx?)?["']\s*\)/,
  /require\(\s*["'](?:\.\.\/)+server\/actors\/profileLookup(?:\.tsx?)?["']\s*\)/,
  /import\(\s*["']@\/server\/actors\/profileLookup(?:\.tsx?)?["']\s*\)/,
  /import\(\s*["'](?:\.\.\/)+server\/actors\/profileLookup(?:\.tsx?)?["']\s*\)/,
];

const ALLOWED_PROFILE_LOOKUP_IMPORTERS = new Set<string>([
  "actors/resolveServerActor.ts",
  // `auth/sessionSummary.ts` is the display-only login-surface
  // read used by `/login` and `/admin/login` to render "logged in
  // as X with Seller / Borrower / Founder pills". It does NOT make
  // authorization decisions — every existing authority gate
  // (`requireFounderSession`, `runIntentCommand`, ownership
  // asserts) continues to go through `resolveServerActor` (the
  // first allowlist entry above) or its own dedicated path. The
  // session summary needs BOTH `hasSeller` and `hasBorrower`
  // simultaneously, which the resolver does not return.
  "auth/sessionSummary.ts",
]);

describe("server actor seam — profile lookup boundary (PR 5A)", () => {
  it("no client/component file imports the profile lookup helper", () => {
    const SRC_ROOT_LOCAL = join(__dirname, "..", "..", "..", "src");
    const offenders: string[] = [];
    for (const file of ALL_SRC_FILES) {
      const rel = relative(SRC_ROOT_LOCAL, file);
      // Only check non-server source. Tests anywhere may import.
      if (rel.startsWith("server/")) continue;
      if (/\.test\.(ts|tsx)$/.test(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (PROFILE_LOOKUP_PATTERNS.some((re) => re.test(src))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "non-server source files must not import @/server/actors/profileLookup",
    ).toEqual([]);
  });

  it("only `actors/resolveServerActor.ts` calls lookupProfileCapabilities from server runtime", () => {
    const offenders: string[] = [];
    for (const file of SERVER_RUNTIME_FILES) {
      const rel = relative(SERVER_ROOT, file);
      // The lookup module itself is allowed to define the function.
      if (rel === "actors/profileLookup.ts") continue;
      const src = readFileSync(file, "utf8");
      const hits = PROFILE_LOOKUP_PATTERNS.some((re) => re.test(src));
      if (!hits) continue;
      if (ALLOWED_PROFILE_LOOKUP_IMPORTERS.has(rel)) continue;
      offenders.push(rel);
    }
    expect(
      offenders,
      "src/server/** runtime files reaching profileLookup outside the resolver",
    ).toEqual([]);
  });

  it("profileLookup module is read-only — no insert / upsert / update / delete paths", () => {
    const file = join(SERVER_ROOT, "actors", "profileLookup.ts");
    const src = readFileSync(file, "utf8");
    // The module composes Supabase calls of the form
    // `client.from(table).select(...).eq(...).maybeSingle()`. Any
    // mutation method is a regression — closed-alpha auto-create is
    // explicitly forbidden.
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    // It MUST use only `.select` against the three tables.
    expect(src).toContain('"profiles"');
    expect(src).toContain('"seller_profiles"');
    expect(src).toContain('"borrower_profiles"');
  });

  it("server actions never reach the profile lookup helper directly (must go through the resolver)", () => {
    const candidates = SERVER_RUNTIME_FILES.filter((f) =>
      /\/actions\.ts$/.test(f),
    );
    for (const file of candidates) {
      const src = readFileSync(file, "utf8");
      for (const re of PROFILE_LOOKUP_PATTERNS) {
        expect(
          re.test(src),
          `${relative(SERVER_ROOT, file)} must not import profileLookup directly`,
        ).toBe(false);
      }
    }
  });
});

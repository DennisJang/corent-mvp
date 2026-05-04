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

  // Slice A PR 5C — closed-alpha CoRent user auth boundary.

  it("user auth route handlers never reference SUPABASE_SERVICE_ROLE_KEY", () => {
    const targets = [
      join(SRC_ROOT, "app", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "auth", "sign-in", "route.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(src).not.toContain("getServiceRoleClient");
      expect(src).not.toContain("readSupabaseServerEnv");
    }
  });

  it("user auth route handlers never check the founder allowlist", () => {
    // The founder allowlist is admin-only. The user surface MUST
    // NOT consult it: capability is row-presence in
    // `seller_profiles` / `borrower_profiles`, granted manually
    // per the closed-alpha provisioning workflow. If a future edit
    // imports `isAllowlistedFounder` here, this test fails loudly.
    const targets = [
      join(SRC_ROOT, "app", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "auth", "sign-in", "route.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toContain("isAllowlistedFounder");
      expect(src).not.toContain("requireFounderSession");
      expect(src).not.toContain("FOUNDER_ADMIN_EMAIL_ALLOWLIST");
      expect(src).not.toContain("getFounderAllowlist");
    }
  });

  it("user auth route handlers never auto-create profiles or capability rows", () => {
    // Closed-alpha posture: provisioning is manual (PR 5B). The
    // user auth route must never insert / upsert / update / delete
    // against profiles, seller_profiles, or borrower_profiles. We
    // also forbid use of the marketplace service-role client from
    // these routes.
    const targets = [
      join(SRC_ROOT, "app", "auth", "callback", "route.ts"),
      join(SRC_ROOT, "app", "auth", "sign-in", "route.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toContain("getMarketplaceClient");
      expect(src).not.toContain("@/server/persistence/supabase");
      expect(src).not.toContain("lookupProfileCapabilities");
      // No table mutations.
      expect(src).not.toMatch(/from\(\s*["']profiles["']/);
      expect(src).not.toMatch(/from\(\s*["']seller_profiles["']/);
      expect(src).not.toMatch(/from\(\s*["']borrower_profiles["']/);
      expect(src).not.toMatch(/\.insert\s*\(/);
      expect(src).not.toMatch(/\.upsert\s*\(/);
      expect(src).not.toMatch(/\.update\s*\(/);
      expect(src).not.toMatch(/\.delete\s*\(/);
    }
  });

  it("the /login page never imports server-only auth helpers and never auto-creates rows", () => {
    const file = join(SRC_ROOT, "app", "login", "page.tsx");
    const src = readRel(file);
    // The page is a server component but it must not reach for
    // the SSR auth client, the marketplace client, or the
    // profile lookup. The route handlers do that.
    expect(src).not.toContain("@/server/admin/supabase-ssr");
    expect(src).not.toContain("@/server/persistence/supabase");
    expect(src).not.toContain("lookupProfileCapabilities");
    expect(src).not.toContain("getMarketplaceClient");
    // No table mutations on the page either.
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
  });

  it("the user auth surface posts to /auth/sign-in (single shared CoRent auth path)", () => {
    // The closed-alpha decision is "one shared CoRent auth entry
    // route". Confirm /login posts to /auth/sign-in (NOT /admin/...).
    const file = join(SRC_ROOT, "app", "login", "page.tsx");
    const src = readRel(file);
    expect(src).toContain('action="/auth/sign-in"');
    expect(src).not.toContain('action="/admin/auth/sign-in"');
  });

  it("PR 5C did not flip the visible chat intake runtime — SHARED_SERVER_MODE stays false", () => {
    // The closed-alpha decision: PR 5C adds the auth entry path
    // only. The visible chat intake demo continues to use local
    // persistence. If a future edit flips this constant, the
    // chat intake UI starts depending on a server-side path that
    // PR 5C deliberately did NOT wire up.
    const file = join(SRC_ROOT, "lib", "client", "chatIntakeClient.ts");
    const src = readRel(file);
    expect(src).toContain("const SHARED_SERVER_MODE = false");
    expect(src).not.toContain("const SHARED_SERVER_MODE = true");
  });

  // Slice A PR 5E — listing-draft writer boundary.

  it("server-only listing-draft modules are never imported by src/components/**", () => {
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      const rel = relative(SRC_ROOT, f);
      if (!rel.startsWith("components/")) continue;
      const src = readRel(f);
      if (
        src.includes("@/server/intake/supabaseListingDraftWriter") ||
        src.includes("@/server/intake/listingDraftWriterDispatcher")
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the supabase listing-draft writer never references SUPABASE_ANON_KEY directly", () => {
    // The marketplace service-role client is the only thing it
    // talks to (via `saveListing` / `getListingById`). It must
    // not reach for the anon-key reader.
    const file = join(
      SRC_ROOT,
      "server",
      "intake",
      "supabaseListingDraftWriter.ts",
    );
    const src = readRel(file);
    expect(src).not.toContain("SUPABASE_ANON_KEY");
    expect(src).not.toContain("readSupabaseAuthEnv");
  });

  it("createListingDraftFromIntake never calls getPersistence() (PR 5E split-brain prevention)", () => {
    // PR 5E externalized listing-draft persistence through the
    // ListingDraftWriter seam. Any direct `getPersistence()` call
    // inside `createListingDraftFromIntake` would re-introduce a
    // split-brain path in supabase mode (intake in Supabase,
    // listing in localStorage). The chat intake service file
    // still imports `getPersistence` for unrelated reasons would
    // be a regression — assert only the comment-section mention
    // exists, not a live call.
    const file = join(
      SRC_ROOT,
      "lib",
      "services",
      "chatListingIntakeService.ts",
    );
    const src = readRel(file);
    // Find the function body and assert no `getPersistence(` call
    // appears inside it. We scan the whole file for `getPersistence(`
    // and require ZERO live calls. Comment-only mentions of
    // `getPersistence()` (with no arg list immediately following
    // a leading `//` or block-comment context) are filtered by
    // matching the actual call shape `getPersistence()`. Any line
    // that has the call but is preceded by `// ` is a comment.
    const lines = src.split(/\r?\n/);
    const liveCalls: { line: number; text: string }[] = [];
    for (const [i, line] of lines.entries()) {
      if (!/getPersistence\(\)/.test(line)) continue;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      // Block-comment middle lines ("//      ...") were already
      // caught above; the only remaining false positive is a
      // string literal. The chat intake service does not embed
      // `getPersistence()` in any string today, so we treat any
      // surviving line as a live call.
      liveCalls.push({ line: i + 1, text: line });
    }
    expect(
      liveCalls,
      "createListingDraftFromIntake (and surrounding service body) must not call getPersistence() directly after PR 5E",
    ).toEqual([]);
  });

  it("listing-draft dispatcher and intake dispatcher remain symmetric (PR 5E invariant)", () => {
    // Static-text guard: both dispatcher files must key on
    // `getBackendMode()` and `actor.source` and return null in
    // the same combination (supabase mode + mock actor). A future
    // edit that asymmetrically loosens one side would re-open
    // the split-brain hole.
    const intake = readRel(
      join(SRC_ROOT, "server", "intake", "intakeWriterDispatcher.ts"),
    );
    const listing = readRel(
      join(SRC_ROOT, "server", "intake", "listingDraftWriterDispatcher.ts"),
    );
    for (const src of [intake, listing]) {
      expect(src).toContain('getBackendMode() !== "supabase"');
      expect(src).toContain('actor.source !== "supabase"');
      expect(src).toContain("return null");
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

describe("Phase 2 marketplace persistence boundary", () => {
  it("@/server/persistence/supabase is never imported from src/components/**", () => {
    const offenders: string[] = [];
    for (const f of ALL_FILES) {
      const rel = relative(SRC_ROOT, f);
      if (!rel.startsWith("components/")) continue;
      const src = readRel(f);
      if (
        src.includes("@/server/persistence/supabase") ||
        src.includes("@/server/backend/")
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("@/server/persistence/supabase modules never reference SUPABASE_ANON_KEY directly", () => {
    // Marketplace repos must use the service-role server env reader. They
    // must never reach for the anon key (which is the founder-auth-only
    // path).
    const targets = [
      join(SRC_ROOT, "server", "persistence", "supabase", "client.ts"),
      join(SRC_ROOT, "server", "persistence", "supabase", "listingRepository.ts"),
      join(SRC_ROOT, "server", "persistence", "supabase", "rentalIntentRepository.ts"),
      join(SRC_ROOT, "server", "persistence", "supabase", "adminReviewRepository.ts"),
      join(SRC_ROOT, "server", "persistence", "supabase", "marketplaceAggregates.ts"),
    ];
    for (const file of targets) {
      const src = readRel(file);
      expect(src).not.toContain("SUPABASE_ANON_KEY");
      expect(src).not.toContain("readSupabaseAuthEnv");
    }
  });

  it("backend mode module never references service-role / anon env vars", () => {
    const file = join(SRC_ROOT, "server", "backend", "mode.ts");
    const src = readRel(file);
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(src).not.toContain("SUPABASE_ANON_KEY");
    expect(src).not.toContain("SUPABASE_URL");
    // It only reads CORENT_BACKEND_MODE and NODE_ENV.
    expect(src).toContain("CORENT_BACKEND_MODE");
  });

  it("Phase 2 dev DB-health route stays under src/app/admin/ behind the founder gate", () => {
    const file = join(SRC_ROOT, "app", "admin", "dev", "db-health", "route.ts");
    const src = readRel(file);
    expect(src).toContain("requireFounderSession");
    // Hard prod gate present.
    expect(src).toContain('NODE_ENV === "production"');
    // No env values are echoed.
    expect(src).not.toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
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

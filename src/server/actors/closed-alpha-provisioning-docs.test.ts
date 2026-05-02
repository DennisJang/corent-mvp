// Static-text guardrails for the closed-alpha provisioning workflow
// (Slice A PR 5B).
//
// PR 5B is documentation only — there is no runtime code path for
// provisioning, by design. These tests defend the docs-as-contract
// invariants so a future edit cannot silently weaken the posture:
//
//   1. The provisioning SQL template lives under `docs/sql_templates/`
//      and is clearly marked "TEMPLATE ONLY — DO NOT RUN AS-IS".
//   2. The template is NOT placed in any path the Supabase CLI would
//      pick up automatically (`supabase/seed.sql`,
//      `supabase/seeds/*.sql`, `supabase/migrations/*.sql`).
//   3. The closed-alpha provisioning doc states the load-bearing
//      claims: `profiles.id == auth.users.id`, capability is
//      row-presence, no auto-create, fail-closed on missing rows,
//      remote `corent-dev` requires founder approval.
//   4. The Supabase CLI auto-run filenames (`supabase/seed.sql`,
//      `supabase/seeds/`) are NOT introduced by PR 5B.
//
// These are filesystem reads + greps. Nothing is executed.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DOCS_ROOT = join(REPO_ROOT, "docs");
const SUPABASE_ROOT = join(REPO_ROOT, "supabase");

const PROVISIONING_DOC = join(
  DOCS_ROOT,
  "corent_closed_alpha_provisioning_workflow.md",
);
const PROVISIONING_TEMPLATE = join(
  DOCS_ROOT,
  "sql_templates",
  "closed_alpha_profile_capabilities.sql",
);

describe("closed-alpha provisioning template — location is non-auto-run", () => {
  it("the template exists at docs/sql_templates/closed_alpha_profile_capabilities.sql", () => {
    expect(existsSync(PROVISIONING_TEMPLATE)).toBe(true);
  });

  it("the template is under docs/ (not under supabase/)", () => {
    const rel = relative(REPO_ROOT, PROVISIONING_TEMPLATE);
    expect(rel.startsWith("docs/")).toBe(true);
    expect(rel.startsWith("supabase/")).toBe(false);
  });

  it("the Supabase CLI auto-run filename `supabase/seed.sql` does NOT exist", () => {
    // The Supabase CLI picks up `supabase/seed.sql` automatically on
    // `supabase db reset`. The repo intentionally avoids that name so
    // no agent or CLI step ever auto-applies seed-style SQL. Regression
    // alarm: if a future PR introduces this file, it must come with
    // an explicit founder-approval note and a scope check.
    expect(existsSync(join(SUPABASE_ROOT, "seed.sql"))).toBe(false);
  });

  it("the Supabase CLI auto-scan directory `supabase/seeds/` does NOT exist", () => {
    // Same reasoning as `supabase/seed.sql`. The closed-alpha posture
    // forbids any path the CLI scans automatically.
    expect(existsSync(join(SUPABASE_ROOT, "seeds"))).toBe(false);
  });

  it("the closed-alpha provisioning template is not duplicated under any supabase/ path", () => {
    // Defense in depth: walk every file under supabase/ and confirm
    // the template body has not been copied there. We look for the
    // distinctive header banner as a fingerprint.
    const FINGERPRINT = "TEMPLATE ONLY — DO NOT RUN AS-IS";
    const offenders: string[] = [];
    function walk(dir: string): void {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const s = statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else if (/\.sql$/.test(name)) {
          const src = readFileSync(full, "utf8");
          if (src.includes(FINGERPRINT)) {
            offenders.push(relative(REPO_ROOT, full));
          }
        }
      }
    }
    walk(SUPABASE_ROOT);
    expect(
      offenders,
      "provisioning template fingerprint must not appear under supabase/",
    ).toEqual([]);
  });
});

describe("closed-alpha provisioning template — content posture", () => {
  it("the template begins with the TEMPLATE ONLY — DO NOT RUN AS-IS banner", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    // The banner must be visible within the first 400 bytes so a
    // founder opening the file in any editor sees it before the SQL.
    const head = src.slice(0, 400);
    expect(head).toContain("TEMPLATE ONLY — DO NOT RUN AS-IS");
  });

  it("the template uses placeholders (no real auth user ids / emails / secrets)", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    // Required placeholder tokens (the doc references these names).
    const required = [
      "<<AUTH_USER_ID_UUID>>",
      "<<TESTER_EMAIL>>",
      "<<TESTER_DISPLAY_NAME>>",
      "<<REGION_COARSE>>",
      "<<SELLER_DISPLAY_NAME>>",
      "<<BORROWER_DISPLAY_NAME>>",
    ];
    for (const token of required) {
      expect(src, `template must reference placeholder ${token}`).toContain(
        token,
      );
    }
    // Negative: no real-looking emails (any string of the form
    // `xxx@yyy.zzz` outside SQL comments is a smell). The template's
    // SQL bodies are commented out, so the file is allowed to contain
    // syntax-shaped strings only inside `--` comments. Concretely,
    // require: every literal `@` is on a comment line.
    const lines = src.split(/\r?\n/);
    const offenders: { line: number; text: string }[] = [];
    lines.forEach((line, i) => {
      if (!line.includes("@")) return;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("--")) return;
      offenders.push({ line: i + 1, text: line });
    });
    expect(
      offenders,
      "template must not contain any non-comment line with an email/@ literal",
    ).toEqual([]);
  });

  it("the template covers seller-only, borrower-only, and dual-capability examples", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    expect(src).toMatch(/Seller-only tester/i);
    expect(src).toMatch(/Borrower-only tester/i);
    expect(src).toMatch(/Dual-capability tester/i);
  });

  it("the template includes verification SELECT queries and rollback snippets", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    expect(src).toMatch(/Verification queries/i);
    expect(src).toMatch(/Rollback snippets/i);
    // Verification reads against the three capability-relevant tables.
    expect(src).toContain("public.profiles");
    expect(src).toContain("public.seller_profiles");
    expect(src).toContain("public.borrower_profiles");
  });

  it("the template warns that running against corent-dev requires explicit founder approval", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    expect(src).toMatch(/founder approval/i);
    expect(src).toMatch(/corent-dev/i);
    // No agent-driven application. The dotall `s` flag lets the
    // assertion match across the SQL comment line breaks (`-- `)
    // separating "agent" and "MUST NOT".
    expect(src).toMatch(/agent[\s\S]*MUST NOT|MUST NOT[\s\S]*agent/i);
  });

  it("the template does NOT contain destructive blanket statements (TRUNCATE / GRANT / ALTER / DROP)", () => {
    const src = readFileSync(PROVISIONING_TEMPLATE, "utf8");
    // Note: rollback snippets contain `delete from` which is allowed
    // (scoped per profile_id). The disallowed verbs below are blanket
    // schema mutations that the template explicitly disclaims.
    const lines = src.split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("--")) continue; // comments are fine
      const lower = line.toLowerCase();
      if (
        /\btruncate\b/.test(lower) ||
        /\bgrant\b/.test(lower) ||
        /\balter\b/.test(lower) ||
        /\bdrop\b/.test(lower)
      ) {
        throw new Error(
          `template line ${i + 1} contains disallowed statement: ${line}`,
        );
      }
    }
  });
});

describe("closed-alpha provisioning doc — load-bearing claims present", () => {
  // The doc is a contract; the sentences below are referenced by
  // other modules / tests and by the agent-loop guardrails.

  it("the provisioning doc exists at docs/corent_closed_alpha_provisioning_workflow.md", () => {
    expect(existsSync(PROVISIONING_DOC)).toBe(true);
  });

  it("states profiles.id must equal auth.users.id", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    // The claim is split across a soft line wrap in the doc body;
    // use `[\s\S]` so the assertion is line-break-tolerant.
    expect(src).toMatch(/profiles\.id[\s\S]*equal[\s\S]*auth\.users\.id/i);
  });

  it("states seller capability = seller_profiles row presence", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    // The doc states this in two places: the model section
    // ("seller_profiles → seller capability") and the rules
    // section ("Capability presence is row-presence"). Match both
    // claims with line-break-tolerant patterns.
    expect(src).toMatch(/seller_profiles[\s\S]*seller capability/i);
    expect(src).toMatch(/row-presence/i);
  });

  it("states no automatic seller_profiles / borrower_profiles / profiles creation exists or is approved", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    expect(src).toMatch(/No auto-provisioning/i);
    // The doc must explicitly list each of the three triggers we forbid.
    expect(src).toMatch(/first sign-in/i);
    expect(src).toMatch(/first chat intake/i);
    expect(src).toMatch(/first seller action/i);
  });

  it("states missing profile / capability rows fail closed", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    expect(src).toMatch(/fail closed/i);
  });

  it("states remote corent-dev requires explicit founder approval", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    expect(src).toMatch(/founder approval/i);
    expect(src).toMatch(/corent-dev/i);
    // And explicitly that agents may not run remote Supabase commands.
    // The doc renders this in markdown-bold (`**may not**`) so the
    // pattern allows arbitrary inline markup between the words.
    expect(src).toMatch(
      /may[\s\S]{0,8}not[\s\S]*run remote[\s\S]+Supabase|MUST NOT[\s\S]*remote/i,
    );
  });

  it("states PR 5B does not implement login routes, callback routes, RLS policies, or the runtime flip", () => {
    const src = readFileSync(PROVISIONING_DOC, "utf8");
    expect(src).toMatch(/Seller \/ renter sign-in routes.*not added/i);
    expect(src).toMatch(/RLS polic(?:y|ies).*not added/i);
    expect(src).toMatch(/SHARED_SERVER_MODE.*not flipped/i);
  });
});

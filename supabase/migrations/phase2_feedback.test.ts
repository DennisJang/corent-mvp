// Phase 2 feedback intake migration text-safety guard. Validation
// Bundle 1, Part 2. Mirrors the shape of `phase2.test.ts` for the
// parent marketplace migration: deny-by-default RLS, no permissive
// policies, no forbidden columns, no broad grants.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  __dirname,
  "20260504120000_phase2_feedback_intake.sql",
);

const RAW_SQL = readFileSync(MIGRATION_PATH, "utf8");

// Strip line comments and the body of `comment on ... is '...'`
// strings so the migration's own self-documenting text never trips
// the forbidden-pattern checks.
const SQL = RAW_SQL
  .replace(/--[^\n]*$/gm, "")
  .replace(
    /comment\s+on\s+(?:table|view|column)\s+[^;]*?is\s+(?:'(?:''|[^'])*'\s*)+;/gi,
    "",
  );

describe("Phase 2 feedback migration — RLS posture", () => {
  it("enables RLS on feedback_submissions", () => {
    expect(SQL).toMatch(
      /alter\s+table\s+public\.feedback_submissions\s+enable\s+row\s+level\s+security/i,
    );
  });

  it("does not declare any permissive 'using (true)' / 'with check (true)' policy", () => {
    expect(SQL).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(SQL).not.toMatch(/with\s+check\s*\(\s*true\s*\)/i);
  });

  it("does not create any policy on feedback_submissions (deny-by-default)", () => {
    expect(SQL).not.toMatch(/create\s+policy/i);
  });

  it("revokes all from anon and authenticated on feedback_submissions", () => {
    expect(SQL).toMatch(
      /revoke\s+all\s+on\s+public\.feedback_submissions\s+from\s+anon,\s*authenticated/i,
    );
  });

  it("does not grant SELECT or ALL to anon on any relation", () => {
    expect(SQL).not.toMatch(/grant\s+select\s+on[^;]*to\s+anon/i);
    expect(SQL).not.toMatch(/grant\s+all\s+on[^;]*to\s+anon/i);
  });
});

describe("Phase 2 feedback migration — forbidden columns stay out", () => {
  it("does not store phone / national id / address / GPS columns", () => {
    for (const re of [
      /\bphone\b/i,
      /\brrn\b/i,
      /\bnational_id\b/i,
      /\bstreet_address\b/i,
      /\bfull_address\b/i,
      /\bgps_lat\b/i,
      /\bgps_lng\b/i,
      /\blatitude\b/i,
      /\blongitude\b/i,
    ]) {
      expect(SQL).not.toMatch(re);
    }
  });

  it("does not store payment / settlement / deposit credentials", () => {
    for (const re of [
      /\bcard_number\b/i,
      /\bbank_account\b/i,
      /\bservice_role\b/i,
    ]) {
      expect(SQL).not.toMatch(re);
    }
  });
});

describe("Phase 2 feedback migration — bounded text", () => {
  it("declares CHECK constraints on every text column", () => {
    expect(SQL).toMatch(/feedback_submissions_message_length/i);
    expect(SQL).toMatch(/feedback_submissions_item_name_length/i);
    expect(SQL).toMatch(/feedback_submissions_contact_email_length/i);
    expect(SQL).toMatch(/feedback_submissions_source_page_length/i);
  });

  it("declares the feedback_kind and feedback_status enums", () => {
    expect(RAW_SQL).toMatch(
      /create\s+type\s+public\.feedback_kind\s+as\s+enum/i,
    );
    expect(RAW_SQL).toMatch(
      /create\s+type\s+public\.feedback_status\s+as\s+enum/i,
    );
  });
});

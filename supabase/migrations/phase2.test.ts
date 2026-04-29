// Phase 2 migration text-safety guard. The migration is a SPECIFICATION
// — anything we ship to corent-dev must not silently broaden RLS or
// re-introduce forbidden columns / tables. These checks grep the SQL
// text and catch drift across PRs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = join(
  __dirname,
  "20260430120000_phase2_marketplace_draft.sql",
);

const RAW_SQL = readFileSync(MIGRATION_PATH, "utf8");

// Strip SQL line comments (`-- ...`) and the bodies of `comment on ... is
// '...';` strings so the migration's own self-documenting notes (which
// deliberately mention things like "no phone column" or "no
// `using (true)` policy") do not trigger the forbidden-pattern checks
// below. We keep DDL intact.
const SQL = RAW_SQL
  .replace(/--[^\n]*$/gm, "")
  .replace(/comment\s+on\s+(?:table|view|column)\s+[^;]*?is\s+(?:'(?:''|[^'])*'\s*)+;/gi, "");

describe("Phase 2 migration — RLS posture", () => {
  it("enables RLS on every Phase 2 table", () => {
    const tables = [
      "profiles",
      "seller_profiles",
      "borrower_profiles",
      "listings",
      "listing_secrets",
      "listing_versions",
      "listing_verifications",
      "rental_intents",
      "rental_events",
      "admin_reviews",
      "admin_actions",
    ];
    for (const t of tables) {
      const re = new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, "i");
      expect(SQL).toMatch(re);
    }
  });

  it("does not declare any permissive 'using (true)' policy", () => {
    expect(SQL).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("does not declare any permissive 'with check (true)' policy", () => {
    expect(SQL).not.toMatch(/with\s+check\s*\(\s*true\s*\)/i);
  });

  it("does not create any policy on Phase 2 tables (deny-by-default)", () => {
    // No `create policy` on anything in this migration. Future migrations
    // will add narrow policies; this one stays deny-all.
    expect(SQL).not.toMatch(/create\s+policy/i);
  });

  it("revokes all from anon and authenticated on every Phase 2 table", () => {
    const tables = [
      "profiles",
      "seller_profiles",
      "borrower_profiles",
      "listings",
      "listing_secrets",
      "listing_versions",
      "listing_verifications",
      "rental_intents",
      "rental_events",
      "admin_reviews",
      "admin_actions",
      "listings_public",
    ];
    for (const t of tables) {
      const re = new RegExp(
        `revoke\\s+all\\s+on\\s+public\\.${t}\\s+from\\s+anon,\\s*authenticated`,
        "i",
      );
      expect(SQL).toMatch(re);
    }
  });
});

describe("Phase 2 migration — forbidden surfaces stay out of scope", () => {
  it("does not create any payments / deposit / settlement / payout table", () => {
    for (const t of [
      "payments",
      "deposit_holds",
      "deposits",
      "settlements",
      "payouts",
      "seller_payouts",
      "transactions",
    ]) {
      const re = new RegExp(`create\\s+table[^;]*public\\.${t}\\b`, "i");
      expect(SQL).not.toMatch(re);
    }
  });

  it("does not create any upload / file / asset / identity table", () => {
    for (const t of [
      "upload_assets",
      "uploads",
      "identity_documents",
      "kyc_documents",
      "photo_assets",
    ]) {
      const re = new RegExp(`create\\s+table[^;]*public\\.${t}\\b`, "i");
      expect(SQL).not.toMatch(re);
    }
  });

  it("does not store phone / national id / RRN / address / GPS columns", () => {
    // These keywords are forbidden in column names. The migration must
    // never re-introduce them without a security review.
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

  it("does not drop or alter Phase 1 analytics tables", () => {
    expect(SQL).not.toMatch(/drop\s+table[^;]*growth_events/i);
    expect(SQL).not.toMatch(/alter\s+table\s+public\.growth_events/i);
    expect(SQL).not.toMatch(/drop\s+table[^;]*sanitizer_rejections/i);
    expect(SQL).not.toMatch(/alter\s+table\s+public\.sanitizer_rejections/i);
  });

  it("does not grant SELECT to anon on any relation in this migration", () => {
    expect(SQL).not.toMatch(/grant\s+select\s+on[^;]*to\s+anon/i);
    expect(SQL).not.toMatch(/grant\s+all\s+on[^;]*to\s+anon/i);
  });
});

describe("Phase 2 migration — listings_public sanitized read view", () => {
  it("excludes private columns from the view", () => {
    // Capture only the SELECT body of the view, up to the first `;`.
    const m = SQL.match(
      /create\s+or\s+replace\s+view\s+public\.listings_public[\s\S]*?;/i,
    );
    expect(m).not.toBeNull();
    const viewBody = m?.[0] ?? "";
    expect(viewBody).not.toMatch(/private_serial_number/i);
    // The view must not join listing_secrets either.
    expect(viewBody).not.toMatch(/listing_secrets/i);
  });

  it("filters to status='approved'", () => {
    expect(SQL).toMatch(
      /create or replace view public\.listings_public[\s\S]*?where\s+l\.status\s*=\s*'approved'/i,
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  getFounderAllowlist,
  isAllowlistedFounder,
  isAnalyticsBetaEnabled,
  readSupabaseServerEnv,
} from "./env";

afterEach(() => {
  delete process.env.ENABLE_ANALYTICS_BETA;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

describe("isAnalyticsBetaEnabled", () => {
  it("returns false when env is missing", () => {
    expect(isAnalyticsBetaEnabled()).toBe(false);
  });

  it("returns false when env is 'false'", () => {
    process.env.ENABLE_ANALYTICS_BETA = "false";
    expect(isAnalyticsBetaEnabled()).toBe(false);
  });

  it("returns false for any non-'true' literal", () => {
    for (const v of ["1", "yes", "TRUE", "True", "on", " true"]) {
      process.env.ENABLE_ANALYTICS_BETA = v;
      expect(isAnalyticsBetaEnabled()).toBe(false);
    }
  });

  it("returns true only for the exact literal 'true'", () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    expect(isAnalyticsBetaEnabled()).toBe(true);
  });
});

describe("readSupabaseServerEnv", () => {
  it("returns missing when both vars are unset", () => {
    const r = readSupabaseServerEnv();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toContain("SUPABASE_URL");
    expect(r.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns missing when only the URL is set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const r = readSupabaseServerEnv();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("returns ok with both vars present", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
    const r = readSupabaseServerEnv();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.env.url).toBe("https://example.supabase.co");
    expect(r.env.serviceRoleKey).toBe("fake-service-role-key");
  });
});

describe("getFounderAllowlist & isAllowlistedFounder", () => {
  it("returns empty list when env is missing", () => {
    expect(getFounderAllowlist()).toEqual([]);
  });

  it("returns empty list when env is empty string", () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "";
    expect(getFounderAllowlist()).toEqual([]);
  });

  it("trims, lowercases, and filters empty entries", () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST =
      " Founder@example.com , , dev@example.com ";
    expect(getFounderAllowlist()).toEqual([
      "founder@example.com",
      "dev@example.com",
    ]);
  });

  it("isAllowlistedFounder fails closed when allowlist is empty", () => {
    expect(isAllowlistedFounder("anyone@example.com")).toBe(false);
  });

  it("isAllowlistedFounder fails closed when input is null/undefined", () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    expect(isAllowlistedFounder(null)).toBe(false);
    expect(isAllowlistedFounder(undefined)).toBe(false);
    expect(isAllowlistedFounder("")).toBe(false);
  });

  it("isAllowlistedFounder accepts allowlisted emails (case-insensitive)", () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    expect(isAllowlistedFounder("Founder@Example.com")).toBe(true);
    expect(isAllowlistedFounder("  founder@example.com  ")).toBe(true);
  });

  it("isAllowlistedFounder rejects non-allowlisted emails", () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    expect(isAllowlistedFounder("attacker@example.com")).toBe(false);
  });
});

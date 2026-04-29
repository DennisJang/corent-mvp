import { afterEach, describe, expect, it } from "vitest";
import {
  _resetSessionReaderForTests,
  _setSessionReaderForTests,
  requireFounderSession,
} from "./auth";

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
  _resetSessionReaderForTests();
});

describe("requireFounderSession — fail-closed defaults", () => {
  it("returns null when no session reader is installed (default)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when allowlist is missing even if a session exists", async () => {
    _setSessionReaderForTests(async () => ({ email: "founder@example.com" }));
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when allowlist is empty even if a session exists", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "";
    _setSessionReaderForTests(async () => ({ email: "founder@example.com" }));
    expect(await requireFounderSession()).toBeNull();
  });
});

describe("requireFounderSession — allowlisted vs non-allowlisted", () => {
  it("returns null for non-allowlisted email", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    _setSessionReaderForTests(async () => ({ email: "attacker@example.com" }));
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns session for allowlisted email (normalized)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "Founder@Example.com";
    _setSessionReaderForTests(async () => ({ email: "founder@example.com" }));
    const r = await requireFounderSession();
    expect(r).not.toBeNull();
    expect(r?.email).toBe("founder@example.com");
  });

  it("rejects sessions returning empty / falsy email", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    _setSessionReaderForTests(async () => ({ email: "" }));
    expect(await requireFounderSession()).toBeNull();
  });
});

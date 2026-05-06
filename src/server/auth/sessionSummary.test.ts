// Tests for the session summary helper used by the login pages.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => null),
  createUserAuthClient: vi.fn(async () => null),
}));

vi.mock("@/server/actors/profileLookup", () => ({
  lookupProfileCapabilities: vi.fn(async () => null),
}));

import { lookupProfileCapabilities } from "@/server/actors/profileLookup";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { readCurrentSessionSummary } from "./sessionSummary";

const mockFactory = vi.mocked(createAdminAuthClient);
const mockProfile = vi.mocked(lookupProfileCapabilities);

const FOUNDER_EMAIL = "founder@example.com";
const TESTER_EMAIL = "tester@example.com";
const AUTH_USER_ID = "11111111-2222-4333-8444-555555555555";

function withFakeUser(
  email: string | null,
  id: string | null = AUTH_USER_ID,
) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: email === null ? null : { id, email } },
        error: null,
      }),
    },
  };
}

function withGetUserError() {
  return {
    auth: {
      getUser: async () => ({
        data: null,
        error: { message: "redacted" },
      }),
    },
  };
}

beforeEach(() => {
  mockFactory.mockReset();
  mockFactory.mockResolvedValue(null);
  mockProfile.mockReset();
  mockProfile.mockResolvedValue(null);
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

describe("readCurrentSessionSummary — fail-closed defaults", () => {
  it("returns signed_out when SSR client factory returns null (env missing)", async () => {
    mockFactory.mockResolvedValueOnce(null);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({ kind: "signed_out" });
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it("returns signed_out when getUser() errors", async () => {
    mockFactory.mockResolvedValueOnce(withGetUserError() as never);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({ kind: "signed_out" });
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it("returns signed_out when getUser() returns no user", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser(null) as never);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({ kind: "signed_out" });
  });

  it("returns signed_out when getUser() returns a user with no email", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser("") as never);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({ kind: "signed_out" });
  });

  it("returns signed_out when getUser() returns a user with no id", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser(TESTER_EMAIL, null) as never);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({ kind: "signed_out" });
  });
});

describe("readCurrentSessionSummary — signed_in_no_profile", () => {
  it("returns signed_in_no_profile when the auth user has no profiles row", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser(TESTER_EMAIL) as never);
    mockProfile.mockResolvedValueOnce(null);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({
      kind: "signed_in_no_profile",
      email: TESTER_EMAIL,
      isAllowlistedFounder: false,
    });
  });

  it("flags the allowlist match even when no profile row exists", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
    mockFactory.mockResolvedValueOnce(withFakeUser(FOUNDER_EMAIL) as never);
    mockProfile.mockResolvedValueOnce(null);
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({
      kind: "signed_in_no_profile",
      email: FOUNDER_EMAIL,
      isAllowlistedFounder: true,
    });
  });
});

describe("readCurrentSessionSummary — signed_in", () => {
  it("returns capability flags + email + allowlist=false for a non-founder", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser(TESTER_EMAIL) as never);
    mockProfile.mockResolvedValueOnce({
      profileId: AUTH_USER_ID,
      displayName: "DEMO 셀러",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: "DEMO 셀러",
      borrowerDisplayName: null,
    });
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({
      kind: "signed_in",
      email: TESTER_EMAIL,
      hasSeller: true,
      hasBorrower: false,
      isAllowlistedFounder: false,
    });
  });

  it("returns allowlist=true for a founder with both capabilities", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
    mockFactory.mockResolvedValueOnce(withFakeUser(FOUNDER_EMAIL) as never);
    mockProfile.mockResolvedValueOnce({
      profileId: AUTH_USER_ID,
      displayName: "founder",
      hasSeller: true,
      hasBorrower: true,
      sellerDisplayName: "founder seller",
      borrowerDisplayName: "founder borrower",
    });
    const r = await readCurrentSessionSummary();
    expect(r).toEqual({
      kind: "signed_in",
      email: FOUNDER_EMAIL,
      hasSeller: true,
      hasBorrower: true,
      isAllowlistedFounder: true,
    });
  });

  it("does NOT echo profileId / displayName / sellerDisplayName / borrowerDisplayName in the summary (only email + capability flags)", async () => {
    mockFactory.mockResolvedValueOnce(withFakeUser(TESTER_EMAIL) as never);
    mockProfile.mockResolvedValueOnce({
      profileId: AUTH_USER_ID,
      displayName: "DEMO 셀러 SECRET",
      hasSeller: true,
      hasBorrower: false,
      sellerDisplayName: "SELLER_DISPLAY_NAME_SECRET",
      borrowerDisplayName: "BORROWER_DISPLAY_NAME_SECRET",
    });
    const r = await readCurrentSessionSummary();
    const blob = JSON.stringify(r);
    expect(blob).not.toContain(AUTH_USER_ID);
    expect(blob).not.toContain("SELLER_DISPLAY_NAME_SECRET");
    expect(blob).not.toContain("BORROWER_DISPLAY_NAME_SECRET");
    expect(blob).not.toContain("DEMO 셀러 SECRET");
    expect(blob).not.toMatch(/profileId/);
    expect(blob).not.toMatch(/displayName/);
  });
});

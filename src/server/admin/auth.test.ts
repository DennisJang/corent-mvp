import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock the SSR client factory so unit tests don't require a real
// Supabase project. Tests inject fake `getUser()` responses to exercise
// the real default session reader path. Tests that need to bypass the
// SSR plumbing entirely use `_setSessionReaderForTests`.
vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => null),
}));

import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import {
  _resetSessionReaderForTests,
  _setSessionReaderForTests,
  requireFounderSession,
} from "./auth";

const factoryMock = vi.mocked(createAdminAuthClient);

type FakeAuth = {
  getUser: () => Promise<{
    data: { user: { email: string | null } | null } | null;
    error: { code?: string; message: string } | null;
  }>;
};
type FakeClient = { auth: FakeAuth };

function withFakeUser(email: string | null): FakeClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: email === null ? null : { email } },
        error: null,
      }),
    },
  };
}

function withGetUserError(): FakeClient {
  return {
    auth: {
      getUser: async () => ({
        data: null,
        error: { code: "invalid_jwt", message: "redacted" },
      }),
    },
  };
}

beforeEach(() => {
  factoryMock.mockReset();
  factoryMock.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
  _resetSessionReaderForTests();
});

describe("requireFounderSession — fail-closed defaults (default reader)", () => {
  it("returns null when SSR client factory returns null (env missing)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(null);
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when allowlist is missing even if SSR session is valid", async () => {
    factoryMock.mockResolvedValueOnce(
      withFakeUser("founder@example.com") as never,
    );
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when allowlist is empty even if SSR session is valid", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "";
    factoryMock.mockResolvedValueOnce(
      withFakeUser("founder@example.com") as never,
    );
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when getUser() returns an error (e.g. expired JWT)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(withGetUserError() as never);
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when getUser() returns no user (no session)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(withFakeUser(null) as never);
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns null when getUser() returns a user with no email", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(withFakeUser("") as never);
    expect(await requireFounderSession()).toBeNull();
  });
});

describe("requireFounderSession — allowlisted vs non-allowlisted (default reader)", () => {
  it("returns null for non-allowlisted email", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(
      withFakeUser("attacker@example.com") as never,
    );
    expect(await requireFounderSession()).toBeNull();
  });

  it("returns session for allowlisted email (normalized)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "Founder@Example.com";
    factoryMock.mockResolvedValueOnce(
      withFakeUser("Founder@Example.com") as never,
    );
    const r = await requireFounderSession();
    expect(r).not.toBeNull();
    expect(r?.email).toBe("founder@example.com");
  });

  it("ignores any user_metadata role flag — allowlist is the only signal", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    // Even if the Supabase user object contained a role/admin flag, the
    // session reader exposes only `email`. We assert that by giving the
    // fake user a non-allowlisted email (the "role: admin" claim, if any,
    // would be in user_metadata, which `auth.ts` never reads).
    factoryMock.mockResolvedValueOnce({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              email: "attacker@example.com",
              user_metadata: { role: "admin", is_founder: true },
              app_metadata: { role: "founder" },
            },
          },
          error: null,
        }),
      },
    } as never);
    expect(await requireFounderSession()).toBeNull();
  });
});

describe("requireFounderSession — test-seam reader override", () => {
  it("returns null when no session reader installed and SSR client returns null", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(null);
    expect(await requireFounderSession()).toBeNull();
  });

  it("honors a swapped session reader (used elsewhere in the suite)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    _setSessionReaderForTests(async () => ({ email: "founder@example.com" }));
    const r = await requireFounderSession();
    expect(r?.email).toBe("founder@example.com");
  });

  it("rejects sessions returning empty / falsy email via the seam", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    _setSessionReaderForTests(async () => ({ email: "" }));
    expect(await requireFounderSession()).toBeNull();
  });
});

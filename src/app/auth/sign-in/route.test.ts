// Slice A PR 5C — tests for the closed-alpha CoRent user sign-in
// magic-link initiation route.
//
// Coverage:
//   - Verb gating (only POST is allowed).
//   - Generic envelope on every branch (no allowlist leak signal,
//     no provisioning signal).
//   - shouldCreateUser is always false (no auto-provisioning of
//     `auth.users` from sign-in attempts).
//   - The route never consults `isAllowlistedFounder` (this is the
//     normal-user surface; admin allowlist is irrelevant).
//   - safe `next` handling and hostile `next` downgrade.
//   - SSR client unavailable path returns generic 200 (env missing).
//
// The test mocks the SSR client factory at `@/server/admin/supabase-ssr`
// (the module that exports both `createAdminAuthClient` and
// `createUserAuthClient` — they are reference-equal). The user
// route imports `createUserAuthClient`; the mock substitutes both
// names so the route's import is intercepted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn(async () => ({ data: {}, error: null }));

vi.mock("@/server/admin/supabase-ssr", () => {
  const factory = vi.fn(async () => ({ auth: { signInWithOtp } }));
  return {
    createAdminAuthClient: factory,
    createUserAuthClient: factory,
  };
});

import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const factoryMock = vi.mocked(createUserAuthClient);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form).toString();
  return new Request("http://localhost/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
  factoryMock.mockReset();
  factoryMock.mockResolvedValue({
    auth: { signInWithOtp },
  } as never);
});

afterEach(() => {
  // Defense in depth: the user route MUST NOT consult
  // FOUNDER_ADMIN_EMAIL_ALLOWLIST. We never set this env in this
  // test file, so no cleanup is required — but stripping it
  // ensures a stale env from another test cannot poison this one.
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

describe("/auth/sign-in — verb gating", () => {
  it("returns 405 for GET / PUT / PATCH / DELETE", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("/auth/sign-in — closed-alpha posture (no founder allowlist, no auto-create)", () => {
  it("does NOT consult the founder allowlist (no env reads)", async () => {
    // Set a hostile allowlist that, if the user route mistakenly
    // checked it, would short-circuit before signInWithOtp. The
    // user route must call Supabase regardless.
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ email: "tester@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("calls signInWithOtp with shouldCreateUser=false (no auto-provisioning)", async () => {
    const r = await POST(jsonRequest({ email: "Tester@Example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const arg = signInWithOtp.mock.calls[0][0] as {
      email: string;
      options: { emailRedirectTo: string; shouldCreateUser: boolean };
    };
    // Email is lowercased before sending.
    expect(arg.email).toBe("tester@example.com");
    // Critical closed-alpha invariant: the route must not
    // auto-create auth.users rows.
    expect(arg.options.shouldCreateUser).toBe(false);
    // Same-origin callback URL.
    expect(arg.options.emailRedirectTo).toBe(
      "http://localhost/auth/callback",
    );
  });

  it("safe `next` is forwarded to the callback URL", async () => {
    await POST(
      jsonRequest({ email: "tester@example.com", next: "/dashboard" }),
    );
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(arg.options.emailRedirectTo).toContain("/auth/callback");
    expect(arg.options.emailRedirectTo).toContain("next=%2Fdashboard");
  });

  it("hostile `next` is downgraded — callback URL has no `next` param", async () => {
    await POST(
      jsonRequest({
        email: "tester@example.com",
        next: "https://evil.example.com",
      }),
    );
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(arg.options.emailRedirectTo).toBe(
      "http://localhost/auth/callback",
    );
    expect(arg.options.emailRedirectTo).not.toContain("evil");
  });

  it("attempting `next: /admin/dashboard` is downgraded — user auth never lands on admin surface", async () => {
    await POST(
      jsonRequest({
        email: "tester@example.com",
        next: "/admin/dashboard",
      }),
    );
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(arg.options.emailRedirectTo).toBe(
      "http://localhost/auth/callback",
    );
    expect(arg.options.emailRedirectTo).not.toContain("admin");
  });

  it("ignores forged authority fields on the payload (role / source / capability / sellerId)", async () => {
    // The route reads only `email` and `next`. Any other key is
    // ignored at the runtime call site. Capability is row-presence
    // in `seller_profiles` / `borrower_profiles`, never a payload
    // field.
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        role: "seller",
        source: "supabase",
        capability: "seller",
        sellerId: "00000000-0000-4000-8000-000000000001",
        sellerProfileId: "00000000-0000-4000-8000-000000000001",
        is_admin: true,
        founder: true,
      }),
    );
    expect(r.status).toBe(200);
    const arg = signInWithOtp.mock.calls[0][0] as {
      email: string;
      options: { shouldCreateUser: boolean };
    };
    // Email is the only thing forwarded; auto-create stays off.
    expect(arg.email).toBe("tester@example.com");
    expect(arg.options.shouldCreateUser).toBe(false);
  });

  it("returns the same generic envelope for valid email vs invalid email", async () => {
    const valid = await POST(jsonRequest({ email: "tester@example.com" }));
    const invalid = await POST(jsonRequest({ email: "not-an-email" }));
    expect(valid.status).toBe(invalid.status);
    expect(await valid.text()).toEqual(await invalid.text());
  });

  it("invalid email shape returns the same generic envelope, never calls Supabase", async () => {
    const r = await POST(jsonRequest({ email: "not-an-email" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("missing email returns generic envelope without calling Supabase", async () => {
    const r = await POST(jsonRequest({}));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("accepts form-encoded bodies as well as JSON", async () => {
    const r = await POST(formRequest({ email: "tester@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });
});

describe("/auth/sign-in — Supabase auth env missing", () => {
  it("no SSR client (env missing) returns generic 200, never calls Supabase", async () => {
    factoryMock.mockResolvedValueOnce(null);
    const r = await POST(jsonRequest({ email: "tester@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("/auth/sign-in — Supabase error path is non-secret", () => {
  it("Supabase signInWithOtp error still returns generic 200 (no error leak)", async () => {
    signInWithOtp.mockResolvedValueOnce({
      data: null,
      error: { code: "rate_limit", message: "redacted" },
    } as never);
    const r = await POST(jsonRequest({ email: "tester@example.com" }));
    expect(r.status).toBe(200);
    const text = await r.text();
    // No Supabase error code or message in the response body.
    expect(text).not.toContain("rate_limit");
    expect(text).not.toContain("redacted");
  });
});

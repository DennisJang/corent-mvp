import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn(async () => ({ data: {}, error: null }));

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => ({
    auth: { signInWithOtp },
  })),
}));

import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const factoryMock = vi.mocked(createAdminAuthClient);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/admin/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form).toString();
  return new Request("http://localhost/admin/auth/sign-in", {
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
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

describe("/admin/auth/sign-in — verb gating", () => {
  it("returns 405 for GET / PUT / PATCH / DELETE", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("/admin/auth/sign-in — allowlist gates", () => {
  it("missing allowlist: never calls signInWithOtp, returns generic 200", async () => {
    const r = await POST(jsonRequest({ email: "founder@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("empty allowlist: never calls signInWithOtp, returns generic 200", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "";
    const r = await POST(jsonRequest({ email: "founder@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("non-allowlisted email: never calls signInWithOtp, returns generic 200", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ email: "attacker@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("allowlisted email: calls signInWithOtp with same-origin callback URL", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ email: "Founder@Example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    const arg = signInWithOtp.mock.calls[0][0] as {
      email: string;
      options: { emailRedirectTo: string; shouldCreateUser: boolean };
    };
    // Email is lowercased before sending.
    expect(arg.email).toBe("founder@example.com");
    expect(arg.options.shouldCreateUser).toBe(false);
    expect(arg.options.emailRedirectTo).toBe(
      "http://localhost/admin/auth/callback",
    );
  });

  it("allowlisted email with safe `next`: appends only same-origin /admin/* redirect", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    await POST(
      jsonRequest({
        email: "founder@example.com",
        next: "/admin/dashboard?tab=events",
      }),
    );
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    expect(arg.options.emailRedirectTo).toContain("/admin/auth/callback");
    expect(arg.options.emailRedirectTo).toContain(
      "next=%2Fadmin%2Fdashboard%3Ftab%3Devents",
    );
  });

  it("allowlisted email with hostile `next`: callback URL has no `next` param", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    await POST(
      jsonRequest({
        email: "founder@example.com",
        next: "https://evil.example.com",
      }),
    );
    const arg = signInWithOtp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    // Hostile next is downgraded to /admin/dashboard which is the default,
    // so the callback URL omits the parameter.
    expect(arg.options.emailRedirectTo).toBe(
      "http://localhost/admin/auth/callback",
    );
    expect(arg.options.emailRedirectTo).not.toContain("evil.example.com");
  });

  it("returns the same generic envelope regardless of allowlist status", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const allowed = await POST(
      jsonRequest({ email: "founder@example.com" }),
    );
    const denied = await POST(
      jsonRequest({ email: "attacker@example.com" }),
    );
    expect(allowed.status).toBe(denied.status);
    expect(await allowed.text()).toEqual(await denied.text());
  });

  it("invalid email shape returns the same generic envelope (no allowlist leak)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ email: "not-an-email" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("missing email returns generic envelope without calling Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({}));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("accepts form-encoded bodies as well as JSON", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(formRequest({ email: "founder@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });
});

describe("/admin/auth/sign-in — Supabase auth env missing", () => {
  it("no SSR client (env missing) returns generic 200, never calls Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(null);
    const r = await POST(jsonRequest({ email: "founder@example.com" }));
    expect(r.status).toBe(200);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

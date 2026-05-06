// Tests for the founder admin email/password sign-in route.
//
// Coverage:
//   - Verb gating (POST only).
//   - Happy path: allowlisted email + correct password redirects 303
//     to safe admin `next` (default `/admin/dashboard`).
//   - Allowlist gate: non-allowlisted email → 303 redirect to
//     /admin/login?pe=invalid WITHOUT calling Supabase. Same envelope
//     as a wrong password (no allowlist disclosure).
//   - Invalid credentials → 303 redirect to /admin/login?pe=invalid.
//   - Missing client → 303 redirect to /admin/login?pe=unavailable.
//   - Open-redirect blocked: non-/admin paths and hostile absolute
//     URLs are downgraded to /admin/dashboard.
//   - Password is NEVER included in the redirect URL.
//   - The route does NOT itself grant founder authority — it only
//     calls Supabase signInWithPassword (no allowlist check on the
//     RESPONSE, no founder-pill writeback).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
  error: null,
}));

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => ({
    auth: { signInWithPassword },
  })),
}));

const logServerWarn = vi.fn();
vi.mock("@/server/logging/logger", () => ({
  logServerWarn: (event: string, payload?: Record<string, unknown>) =>
    logServerWarn(event, payload),
}));

import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const factoryMock = vi.mocked(createAdminAuthClient);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/admin/auth/password-sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form).toString();
  return new Request("http://localhost/admin/auth/password-sign-in", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  signInWithPassword.mockReset();
  signInWithPassword.mockResolvedValue({
    data: { session: { access_token: "tok" } },
    error: null,
  });
  factoryMock.mockReset();
  factoryMock.mockResolvedValue({
    auth: { signInWithPassword },
  } as never);
  logServerWarn.mockReset();
});

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
});

describe("/admin/auth/password-sign-in — verb gating", () => {
  it("returns 405 for GET / PUT / PATCH / DELETE", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("/admin/auth/password-sign-in — happy path", () => {
  it("allowlisted email + correct password → 303 to /admin/dashboard", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/admin/dashboard");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    const arg = signInWithPassword.mock.calls[0][0] as {
      email: string;
      password: string;
    };
    expect(arg.email).toBe("founder@example.com");
    expect(arg.password).toBe("hunter2");
  });

  it("lowercases the email before calling Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    await POST(
      jsonRequest({ email: "Founder@Example.com", password: "hunter2" }),
    );
    const arg = signInWithPassword.mock.calls[0][0] as { email: string };
    expect(arg.email).toBe("founder@example.com");
  });

  it("forwards a safe /admin `next` query — redirects to that path", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({
        email: "founder@example.com",
        password: "hunter2",
        next: "/admin/cockpit",
      }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/admin/cockpit");
  });

  it("accepts form-encoded bodies as well as JSON", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      formRequest({ email: "founder@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

describe("/admin/auth/password-sign-in — allowlist gate", () => {
  it("missing allowlist → 303 /admin/login?pe=invalid, never calls Supabase", async () => {
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("non-allowlisted email → 303 /admin/login?pe=invalid (same envelope as wrong password)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({ email: "attacker@example.com", password: "anything" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns the same envelope for non-allowlisted email vs wrong password", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";

    const denied = await POST(
      jsonRequest({ email: "attacker@example.com", password: "anything" }),
    );

    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "redacted" },
    } as never);
    const wrong = await POST(
      jsonRequest({ email: "founder@example.com", password: "wrong" }),
    );

    expect(denied.status).toBe(wrong.status);
    // Both redirect to the same shape: /admin/login?pe=invalid.
    expect(denied.headers.get("location")).toBe(
      wrong.headers.get("location"),
    );
  });
});

describe("/admin/auth/password-sign-in — invalid credentials path", () => {
  it("Supabase error → 303 /admin/login?pe=invalid (no error leak)", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "redacted" },
    } as never);
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "wrong" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("pe=invalid");
    expect(loc).not.toContain("invalid_credentials");
    expect(loc).not.toContain("redacted");
  });

  it("Supabase ok=true but no session → 303 /admin/login?pe=invalid", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as never);
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
  });

  it("missing email → 303 /admin/login?pe=invalid, never calls Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ password: "hunter2" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("missing password → 303 /admin/login?pe=invalid, never calls Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(jsonRequest({ email: "founder@example.com" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("preserves safe `next` on the failure redirect for retry", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "x" },
    } as never);
    const r = await POST(
      jsonRequest({
        email: "founder@example.com",
        password: "wrong",
        next: "/admin/cockpit",
      }),
    );
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("pe=invalid");
    expect(loc).toContain("next=%2Fadmin%2Fcockpit");
  });
});

describe("/admin/auth/password-sign-in — Supabase env missing", () => {
  it("no SSR client → 303 /admin/login?pe=unavailable, never calls Supabase", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    factoryMock.mockResolvedValueOnce(null);
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("pe=unavailable");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(logServerWarn).toHaveBeenCalledWith(
      "admin_auth_password_sign_in_no_client",
      undefined,
    );
  });
});

describe("/admin/auth/password-sign-in — open-redirect defense", () => {
  it("hostile absolute URL in `next` → downgraded to /admin/dashboard on success", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({
        email: "founder@example.com",
        password: "hunter2",
        next: "https://evil.example.com",
      }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/admin/dashboard");
  });

  it("non-/admin path in `next` → downgraded to /admin/dashboard", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({
        email: "founder@example.com",
        password: "hunter2",
        next: "/dashboard",
      }),
    );
    expect(r.headers.get("location")).toBe("http://localhost/admin/dashboard");
  });

  it("protocol-relative `next` → downgraded to /admin/dashboard", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({
        email: "founder@example.com",
        password: "hunter2",
        next: "//evil.example.com/admin/x",
      }),
    );
    expect(r.headers.get("location")).toBe("http://localhost/admin/dashboard");
  });
});

describe("/admin/auth/password-sign-in — does not grant founder authority", () => {
  it("no founder-promotion side effect: only calls signInWithPassword + redirects", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({ email: "founder@example.com", password: "hunter2" }),
    );

    // Only one auth call, only one mock module touched.
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    // Only email + password forwarded — no `role`, `is_admin`,
    // `founder`, capability, etc.
    const arg = signInWithPassword.mock.calls[0][0] as {
      email: string;
      password: string;
    };
    expect(Object.keys(arg).sort()).toEqual(["email", "password"]);

    // The response is just a redirect to /admin/dashboard. The
    // founder authority gate (`requireFounderSession`) is checked
    // by /admin/cockpit at request time, not by this route.
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard",
    );
  });
});

describe("/admin/auth/password-sign-in — password never leaks", () => {
  it("password is never present in any redirect Location", async () => {
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const password = "Sup3r-Secret-pa$$";

    // success
    const ok = await POST(
      jsonRequest({ email: "founder@example.com", password }),
    );
    expect(ok.headers.get("location") ?? "").not.toContain(password);

    // wrong password
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "x" },
    } as never);
    const bad = await POST(
      jsonRequest({ email: "founder@example.com", password }),
    );
    expect(bad.headers.get("location") ?? "").not.toContain(password);

    // non-allowlisted (no Supabase call)
    const denied = await POST(
      jsonRequest({ email: "attacker@example.com", password }),
    );
    expect(denied.headers.get("location") ?? "").not.toContain(password);

    // env missing
    factoryMock.mockResolvedValueOnce(null);
    const env = await POST(
      jsonRequest({ email: "founder@example.com", password }),
    );
    expect(env.headers.get("location") ?? "").not.toContain(password);
  });
});

// Tests for the closed-alpha CoRent user email/password sign-in.
//
// Coverage:
//   - Verb gating (POST only).
//   - Happy path redirects to safe `next` (303) — and to /dashboard
//     when no `next` was supplied.
//   - `signInWithPassword` is invoked with the lowercased email +
//     forwarded password.
//   - Invalid credentials → 303 redirect to /login?pe=invalid.
//   - Missing client (env unavailable) → 303 redirect to
//     /login?pe=unavailable.
//   - Missing / invalid email or password → 303 redirect to
//     /login?pe=invalid WITHOUT calling Supabase.
//   - Open-redirect blocked: `/admin/...`, hostile schemes,
//     protocol-relative all downgrade.
//   - Password is NEVER included in the redirect URL.
//   - Password is NEVER passed to the logger payload.
//
// The route imports `createUserAuthClient` from
// `@/server/admin/supabase-ssr` — the same factory the magic-link
// route uses. We mock it here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
  error: null,
}));

vi.mock("@/server/admin/supabase-ssr", () => {
  const factory = vi.fn(async () => ({ auth: { signInWithPassword } }));
  return {
    createAdminAuthClient: factory,
    createUserAuthClient: factory,
  };
});

const logServerWarn = vi.fn();
vi.mock("@/server/logging/logger", () => ({
  logServerWarn: (event: string, payload?: Record<string, unknown>) =>
    logServerWarn(event, payload),
}));

import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const factoryMock = vi.mocked(createUserAuthClient);

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/auth/password-sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form).toString();
  return new Request("http://localhost/auth/password-sign-in", {
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

describe("/auth/password-sign-in — verb gating", () => {
  it("returns 405 for GET / PUT / PATCH / DELETE", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("/auth/password-sign-in — happy path", () => {
  it("redirects 303 to /dashboard when no `next` is supplied", async () => {
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/dashboard");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    const arg = signInWithPassword.mock.calls[0][0] as {
      email: string;
      password: string;
    };
    expect(arg.email).toBe("tester@example.com");
    expect(arg.password).toBe("hunter2");
  });

  it("lowercases the email before calling Supabase", async () => {
    await POST(
      jsonRequest({ email: "Tester@Example.com", password: "hunter2" }),
    );
    const arg = signInWithPassword.mock.calls[0][0] as { email: string };
    expect(arg.email).toBe("tester@example.com");
  });

  it("forwards a safe `next` query — redirects to that path", async () => {
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "hunter2",
        next: "/requests",
      }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/requests");
  });

  it("does NOT consult the founder allowlist (this is the user surface)", async () => {
    // A populated allowlist with a different email must not block a
    // user-side login.
    process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = "founder@example.com";
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("accepts form-encoded bodies as well as JSON", async () => {
    const r = await POST(
      formRequest({ email: "tester@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

describe("/auth/password-sign-in — invalid credentials path", () => {
  it("Supabase error → 303 redirect to /login?pe=invalid (no error leak)", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "redacted" },
    } as never);
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "wrong" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("pe=invalid");
    // Never leak Supabase error details into the redirect URL.
    expect(loc).not.toContain("invalid_credentials");
    expect(loc).not.toContain("redacted");
  });

  it("Supabase ok=true but no session → 303 redirect to /login?pe=invalid", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as never);
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
  });

  it("missing email → 303 /login?pe=invalid, never calls Supabase", async () => {
    const r = await POST(jsonRequest({ password: "hunter2" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("missing password → 303 /login?pe=invalid, never calls Supabase", async () => {
    const r = await POST(jsonRequest({ email: "tester@example.com" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("malformed email → 303 /login?pe=invalid, never calls Supabase", async () => {
    const r = await POST(
      jsonRequest({ email: "not-an-email", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("empty password → 303 /login?pe=invalid, never calls Supabase", async () => {
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location") ?? "").toContain("pe=invalid");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("preserves safe `next` on the failure redirect for retry", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "x" },
    } as never);
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "wrong",
        next: "/requests",
      }),
    );
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("pe=invalid");
    expect(loc).toContain("next=%2Frequests");
  });
});

describe("/auth/password-sign-in — Supabase env missing", () => {
  it("no SSR client → 303 /login?pe=unavailable, never calls Supabase", async () => {
    factoryMock.mockResolvedValueOnce(null);
    const r = await POST(
      jsonRequest({ email: "tester@example.com", password: "hunter2" }),
    );
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("pe=unavailable");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(logServerWarn).toHaveBeenCalledWith(
      "user_auth_password_sign_in_no_client",
      undefined,
    );
  });
});

describe("/auth/password-sign-in — open-redirect defense", () => {
  it("hostile absolute URL in `next` → downgraded to /dashboard on success", async () => {
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "hunter2",
        next: "https://evil.example.com",
      }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("admin path in `next` → downgraded to /dashboard on success (user must never land on admin)", async () => {
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "hunter2",
        next: "/admin/cockpit",
      }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("protocol-relative `next` → downgraded to /dashboard on success", async () => {
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "hunter2",
        next: "//evil.example.com/x",
      }),
    );
    expect(r.headers.get("location")).toBe("http://localhost/dashboard");
  });
});

describe("/auth/password-sign-in — password never leaks", () => {
  it("password is never present in any redirect Location", async () => {
    const password = "Sup3r-Secret-pa$$";

    // success path
    signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "tok" } },
      error: null,
    } as never);
    const ok = await POST(
      jsonRequest({ email: "tester@example.com", password }),
    );
    expect(ok.headers.get("location") ?? "").not.toContain(password);

    // invalid creds
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "x" },
    } as never);
    const bad = await POST(
      jsonRequest({ email: "tester@example.com", password }),
    );
    expect(bad.headers.get("location") ?? "").not.toContain(password);

    // env missing
    factoryMock.mockResolvedValueOnce(null);
    const env = await POST(
      jsonRequest({ email: "tester@example.com", password }),
    );
    expect(env.headers.get("location") ?? "").not.toContain(password);
  });

  it("password is never passed to the logger payload", async () => {
    const password = "another-secret";
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "redacted" },
    } as never);
    await POST(jsonRequest({ email: "tester@example.com", password }));

    // No logger call should carry the password value.
    for (const call of logServerWarn.mock.calls) {
      const [event, payload] = call as [string, Record<string, unknown> | undefined];
      expect(event).not.toContain(password);
      if (payload) {
        for (const value of Object.values(payload)) {
          expect(typeof value === "string" ? value : "").not.toContain(password);
        }
      }
    }

    factoryMock.mockResolvedValueOnce(null);
    await POST(jsonRequest({ email: "tester@example.com", password }));
    for (const call of logServerWarn.mock.calls) {
      const [event, payload] = call as [string, Record<string, unknown> | undefined];
      expect(event).not.toContain(password);
      if (payload) {
        for (const value of Object.values(payload)) {
          expect(typeof value === "string" ? value : "").not.toContain(password);
        }
      }
    }
  });

  it("email is never passed to the logger payload", async () => {
    const email = "secret-tester@example.com";

    // Failure (Supabase error) path
    signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "redacted" },
    } as never);
    await POST(jsonRequest({ email, password: "hunter2" }));

    // Env-missing path
    factoryMock.mockResolvedValueOnce(null);
    await POST(jsonRequest({ email, password: "hunter2" }));

    for (const call of logServerWarn.mock.calls) {
      const [event, payload] = call as [string, Record<string, unknown> | undefined];
      expect(event).not.toContain(email);
      expect(event).not.toContain("@");
      if (payload) {
        for (const [key, value] of Object.entries(payload)) {
          // Defense in depth — neither key nor value carries the email.
          expect(key).not.toContain("@");
          if (typeof value === "string") {
            expect(value).not.toContain(email);
            expect(value).not.toContain("@");
          }
        }
      }
    }
  });

  it("ignores forged authority fields on the payload (role / capability / sellerId / founder / is_admin)", async () => {
    const r = await POST(
      jsonRequest({
        email: "tester@example.com",
        password: "hunter2",
        role: "seller",
        capability: "founder",
        sellerId: "00000000-0000-4000-8000-000000000001",
        founder: true,
        is_admin: true,
      }),
    );
    expect(r.status).toBe(303);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    const arg = signInWithPassword.mock.calls[0][0] as {
      email: string;
      password: string;
    };
    // Only email + password are forwarded.
    expect(Object.keys(arg).sort()).toEqual(["email", "password"]);
  });
});

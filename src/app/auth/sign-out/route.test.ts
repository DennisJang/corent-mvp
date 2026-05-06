// Tests for the closed-alpha shared sign-out route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));

vi.mock("@/server/admin/supabase-ssr", () => {
  const factory = vi.fn(async () => ({ auth: { signOut } }));
  return {
    createAdminAuthClient: factory,
    createUserAuthClient: factory,
  };
});

import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const factoryMock = vi.mocked(createUserAuthClient);

function formRequest(form: Record<string, string>): Request {
  const body = new URLSearchParams(form).toString();
  return new Request("http://localhost/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  signOut.mockReset();
  signOut.mockResolvedValue({ error: null });
  factoryMock.mockReset();
  factoryMock.mockResolvedValue({
    auth: { signOut },
  } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /auth/sign-out — verb gating", () => {
  it("rejects GET / PUT / PATCH / DELETE with 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});

describe("POST /auth/sign-out — happy path", () => {
  it("calls auth.signOut and redirects to /login?out=1 by default", async () => {
    const res = await POST(formRequest({}));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login?out=1");
  });

  it("redirects to /admin/login?out=1 when next='/admin/login'", async () => {
    const res = await POST(formRequest({ next: "/admin/login" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost/admin/login?out=1",
    );
  });

  it("supports JSON body with next='/admin/login'", async () => {
    const res = await POST(jsonRequest({ next: "/admin/login" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "http://localhost/admin/login?out=1",
    );
  });

  it("redirects even when signOut returns an error (still clears cookie via the SSR client and lands on a calm surface)", async () => {
    signOut.mockResolvedValueOnce({
      error: { code: "boom", message: "redacted" },
    });
    const res = await POST(formRequest({}));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login?out=1");
  });
});

describe("POST /auth/sign-out — open-redirect defense", () => {
  it("rejects arbitrary next values and falls back to /login", async () => {
    for (const hostile of [
      "https://attacker.example.com",
      "//attacker.example.com",
      "/dashboard",
      "/admin/cockpit",
      "javascript:alert(1)",
      "/login\nfoo",
      "..",
    ]) {
      const res = await POST(formRequest({ next: hostile }));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        "http://localhost/login?out=1",
      );
    }
  });

  it("rejects non-string next via JSON body", async () => {
    const res = await POST(jsonRequest({ next: 42 }));
    expect(res.headers.get("location")).toBe("http://localhost/login?out=1");
    const res2 = await POST(jsonRequest({ next: null }));
    expect(res2.headers.get("location")).toBe(
      "http://localhost/login?out=1",
    );
  });
});

describe("POST /auth/sign-out — env / client missing", () => {
  it("redirects anyway when the SSR client factory returns null (no signOut call)", async () => {
    factoryMock.mockResolvedValueOnce(null);
    const res = await POST(formRequest({}));
    expect(signOut).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login?out=1");
  });
});

describe("POST /auth/sign-out — never echoes secrets in logs / response", () => {
  it("does not include the email or any auth token in the redirect URL", async () => {
    const res = await POST(
      formRequest({
        next: "/login",
        email: "tester@example.com",
        access_token: "FAKE_ACCESS_TOKEN",
      }),
    );
    const loc = res.headers.get("location") ?? "";
    expect(loc).not.toContain("tester@example.com");
    expect(loc).not.toContain("FAKE_ACCESS_TOKEN");
    expect(loc).toBe("http://localhost/login?out=1");
  });
});

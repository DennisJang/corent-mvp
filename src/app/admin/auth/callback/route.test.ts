import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn(async () => ({
  data: { session: { access_token: "fake" } },
  error: null,
}));

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}));

import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { GET } from "./route";

const factoryMock = vi.mocked(createAdminAuthClient);

function makeRequest(query: Record<string, string> = {}): Request {
  const u = new URL("http://localhost/admin/auth/callback");
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return new Request(u);
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({
    data: { session: { access_token: "fake" } },
    error: null,
  });
  factoryMock.mockReset();
  factoryMock.mockResolvedValue({
    auth: { exchangeCodeForSession },
  } as never);
});

afterEach(() => {
  // No env mutations in these tests.
});

describe("/admin/auth/callback — happy path", () => {
  it("valid code → 303 to /admin/dashboard", async () => {
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
  });

  it("valid code with safe next → 303 to that next", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "/admin/dashboard?tab=events" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard?tab=events",
    );
  });
});

describe("/admin/auth/callback — failure paths", () => {
  it("missing code → 303 to /admin/login?e=1, never exchanges", async () => {
    const r = await GET(makeRequest({}));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/login?e=1",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("no SSR client (env missing) → 303 to /admin/login?e=1, never exchanges", async () => {
    factoryMock.mockResolvedValueOnce(null);
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/login?e=1",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchange error → 303 to /admin/login?e=1", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: null,
      error: { code: "otp_expired", message: "redacted" },
    } as never);
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/login?e=1",
    );
  });
});

describe("/admin/auth/callback — open-redirect defense", () => {
  it("hostile absolute next is downgraded to /admin/dashboard", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "https://evil.example.com" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard",
    );
    expect(r.headers.get("location")).not.toContain("evil");
  });

  it("hostile protocol-relative next is downgraded to /admin/dashboard", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "//evil.example.com/admin" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard",
    );
  });

  it("non-/admin relative next is downgraded to /admin/dashboard", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "/search" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/admin/dashboard",
    );
  });

  it("response body is empty (no token / code echo)", async () => {
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(await r.text()).toBe("");
  });
});

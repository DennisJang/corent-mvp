// Slice A PR 5C — tests for the closed-alpha CoRent user
// magic-link callback route.
//
// Coverage:
//   - Valid code → 303 to `/` (default user target).
//   - Valid code with safe `next` → 303 to that next.
//   - Hostile `next` is downgraded to `/` (open-redirect defense).
//   - `/admin/*` `next` is downgraded — user callback never lands
//     on the admin surface even though the admin gate would 404.
//   - Missing code, no SSR client, exchange error → 303 to
//     `/login?e=1` (NOT `/admin/login`).
//   - Response body is empty (no token / code echo).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn(async () => ({
  data: { session: { access_token: "fake" } },
  error: null,
}));

vi.mock("@/server/admin/supabase-ssr", () => {
  const factory = vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  }));
  return {
    createAdminAuthClient: factory,
    createUserAuthClient: factory,
  };
});

import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { GET } from "./route";

const factoryMock = vi.mocked(createUserAuthClient);

function makeRequest(query: Record<string, string> = {}): Request {
  const u = new URL("http://localhost/auth/callback");
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

describe("/auth/callback — happy path", () => {
  it("valid code → 303 to / (public homepage, the default user target)", async () => {
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
  });

  it("valid code with safe next → 303 to that next", async () => {
    const r = await GET(makeRequest({ code: "abc123", next: "/dashboard" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("valid code with safe deep-link next → 303 to that next", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "/items/theragun-mini-2" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      "http://localhost/items/theragun-mini-2",
    );
  });
});

describe("/auth/callback — failure paths redirect to /login (never /admin/login)", () => {
  it("missing code → 303 to /login?e=1, never exchanges", async () => {
    const r = await GET(makeRequest({}));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/login?e=1");
    expect(r.headers.get("location")).not.toContain("/admin");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("no SSR client (env missing) → 303 to /login?e=1, never exchanges", async () => {
    factoryMock.mockResolvedValueOnce(null);
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/login?e=1");
    expect(r.headers.get("location")).not.toContain("/admin");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchange error → 303 to /login?e=1", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      data: null,
      error: { code: "otp_expired", message: "redacted" },
    } as never);
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/login?e=1");
    expect(r.headers.get("location")).not.toContain("/admin");
  });
});

describe("/auth/callback — open-redirect defense (incl. admin downgrade)", () => {
  it("hostile absolute next is downgraded to /", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "https://evil.example.com" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/");
    expect(r.headers.get("location")).not.toContain("evil");
  });

  it("hostile protocol-relative next is downgraded to /", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "//evil.example.com/dashboard" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/");
  });

  it("/admin next is downgraded to / — user callback must never land on admin surface", async () => {
    const r = await GET(
      makeRequest({ code: "abc123", next: "/admin/dashboard" }),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/");
    expect(r.headers.get("location")).not.toContain("admin");
  });

  it("/admin alone is also downgraded", async () => {
    const r = await GET(makeRequest({ code: "abc123", next: "/admin" }));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost/");
  });

  it("response body is empty (no token / code echo)", async () => {
    const r = await GET(makeRequest({ code: "abc123" }));
    expect(await r.text()).toBe("");
  });
});

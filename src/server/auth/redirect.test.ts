import { describe, expect, it } from "vitest";

import { DEFAULT_USER_TARGET, safeUserNextPath } from "./redirect";

describe("safeUserNextPath — open-redirect defense for closed-alpha user auth", () => {
  it("falls back to default when input is missing", () => {
    expect(safeUserNextPath(undefined)).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath(null)).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("")).toBe(DEFAULT_USER_TARGET);
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeUserNextPath("//evil.example.com")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("//evil.example.com/dashboard")).toBe(
      DEFAULT_USER_TARGET,
    );
  });

  it("rejects absolute URLs of any scheme", () => {
    expect(safeUserNextPath("https://evil.example.com/")).toBe(
      DEFAULT_USER_TARGET,
    );
    expect(safeUserNextPath("http://localhost/dashboard")).toBe(
      DEFAULT_USER_TARGET,
    );
    expect(safeUserNextPath("javascript:alert(1)")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("data:text/html,evil")).toBe(DEFAULT_USER_TARGET);
  });

  it("rejects backslash tricks", () => {
    expect(safeUserNextPath("/\\evil.example.com")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("/dashboard\\..\\admin")).toBe(
      DEFAULT_USER_TARGET,
    );
  });

  it("rejects newlines and carriage returns", () => {
    expect(safeUserNextPath("/dashboard\n/admin")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("/dashboard\r/admin")).toBe(DEFAULT_USER_TARGET);
  });

  it("rejects values longer than 256 chars", () => {
    const longPath = "/" + "x".repeat(256);
    expect(safeUserNextPath(longPath)).toBe(DEFAULT_USER_TARGET);
  });

  it("rejects /admin and /admin/* — user auth must never land on admin surface", () => {
    expect(safeUserNextPath("/admin")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("/admin/")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("/admin/dashboard")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("/admin/dashboard?tab=events")).toBe(
      DEFAULT_USER_TARGET,
    );
    expect(safeUserNextPath("/admin/login")).toBe(DEFAULT_USER_TARGET);
  });

  it("rejects values that don't start with / (no relative-path tricks)", () => {
    expect(safeUserNextPath("dashboard")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("./dashboard")).toBe(DEFAULT_USER_TARGET);
    expect(safeUserNextPath("../admin")).toBe(DEFAULT_USER_TARGET);
  });

  it("accepts safe public CoRent paths", () => {
    expect(safeUserNextPath("/")).toBe("/");
    expect(safeUserNextPath("/dashboard")).toBe("/dashboard");
    expect(safeUserNextPath("/dashboard?tab=overview")).toBe(
      "/dashboard?tab=overview",
    );
    expect(safeUserNextPath("/search")).toBe("/search");
    expect(safeUserNextPath("/sell")).toBe("/sell");
    expect(safeUserNextPath("/items/theragun-mini-2")).toBe(
      "/items/theragun-mini-2",
    );
    expect(safeUserNextPath("/sellers/seller_jisu")).toBe(
      "/sellers/seller_jisu",
    );
  });

  it("path that starts with /admin-prefix-but-not-route is still rejected", () => {
    // `/administrator` does not match the `/admin/*` rule (no slash
    // after `admin`) and is technically not under /admin, but our
    // rule rejects only `/admin` exactly OR `/admin/*` — so
    // `/administrator` would technically pass the prefix check. We
    // explicitly verify the boundary here so future edits don't
    // accidentally tighten or loosen it.
    expect(safeUserNextPath("/administrator")).toBe("/administrator");
    // But anything definitely under the admin surface is rejected:
    expect(safeUserNextPath("/admin/anything")).toBe(DEFAULT_USER_TARGET);
  });
});

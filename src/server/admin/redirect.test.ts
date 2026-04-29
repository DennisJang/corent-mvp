import { describe, expect, it } from "vitest";
import { DEFAULT_ADMIN_TARGET, safeAdminNextPath } from "./redirect";

describe("safeAdminNextPath — open-redirect defense", () => {
  it("falls back to default when input is missing", () => {
    expect(safeAdminNextPath(undefined)).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath(null)).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath("")).toBe(DEFAULT_ADMIN_TARGET);
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeAdminNextPath("//evil.example.com")).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath("//evil.example.com/admin/dashboard")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
  });

  it("rejects absolute URLs of any scheme", () => {
    expect(safeAdminNextPath("https://evil.example.com/admin")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
    expect(safeAdminNextPath("http://localhost/admin/dashboard")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
    expect(safeAdminNextPath("javascript:alert(1)")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
    expect(safeAdminNextPath("data:text/html,evil")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
  });

  it("rejects backslash tricks", () => {
    expect(safeAdminNextPath("/\\evil.example.com")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
    expect(safeAdminNextPath("/admin\\..\\..\\evil")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
  });

  it("rejects newlines and CR (header injection)", () => {
    expect(safeAdminNextPath("/admin/dashboard\nLocation: evil")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
    expect(safeAdminNextPath("/admin/dashboard\r\n")).toBe(
      DEFAULT_ADMIN_TARGET,
    );
  });

  it("rejects non-/admin relative paths", () => {
    expect(safeAdminNextPath("/")).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath("/search")).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath("/items/foo")).toBe(DEFAULT_ADMIN_TARGET);
    expect(safeAdminNextPath("admin/dashboard")).toBe(DEFAULT_ADMIN_TARGET); // no leading slash
    expect(safeAdminNextPath("/admin-evil")).toBe(DEFAULT_ADMIN_TARGET);
  });

  it("accepts /admin and /admin/* relative paths", () => {
    expect(safeAdminNextPath("/admin")).toBe("/admin");
    expect(safeAdminNextPath("/admin/dashboard")).toBe("/admin/dashboard");
    expect(safeAdminNextPath("/admin/foo/bar")).toBe("/admin/foo/bar");
    expect(safeAdminNextPath("/admin/dashboard?tab=events")).toBe(
      "/admin/dashboard?tab=events",
    );
  });

  it("rejects pathological lengths", () => {
    expect(safeAdminNextPath("/admin/" + "a".repeat(300))).toBe(
      DEFAULT_ADMIN_TARGET,
    );
  });
});

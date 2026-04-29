// Backend mode is the public switch from "default mock" to "Phase 2
// Supabase". The defaults must be safe: any unknown / missing /
// production environment must return "mock". Adding a regression here
// is cheap insurance.

import { afterEach, describe, expect, it } from "vitest";
import { getBackendMode, isSupabaseBackend } from "./mode";

afterEach(() => {
  delete process.env.CORENT_BACKEND_MODE;
  delete process.env.NODE_ENV;
});

describe("getBackendMode", () => {
  it("returns 'mock' when CORENT_BACKEND_MODE is unset", () => {
    expect(getBackendMode()).toBe("mock");
    expect(isSupabaseBackend()).toBe(false);
  });

  it("returns 'mock' when CORENT_BACKEND_MODE is empty", () => {
    process.env.CORENT_BACKEND_MODE = "";
    expect(getBackendMode()).toBe("mock");
  });

  it("returns 'mock' for any value other than 'mock' or 'supabase'", () => {
    for (const v of ["SUPABASE", "Supabase", "real", "1", "yes", "on", "prod"]) {
      process.env.CORENT_BACKEND_MODE = v;
      expect(getBackendMode()).toBe("mock");
    }
  });

  it("returns 'supabase' only for the exact literal 'supabase' (non-prod)", () => {
    process.env.CORENT_BACKEND_MODE = "supabase";
    process.env.NODE_ENV = "development";
    expect(getBackendMode()).toBe("supabase");
    expect(isSupabaseBackend()).toBe(true);
  });

  it("falls back to 'mock' in production even when env asks for supabase", () => {
    process.env.CORENT_BACKEND_MODE = "supabase";
    process.env.NODE_ENV = "production";
    expect(getBackendMode()).toBe("mock");
    expect(isSupabaseBackend()).toBe(false);
  });

  it("returns 'mock' explicitly when env says 'mock'", () => {
    process.env.CORENT_BACKEND_MODE = "mock";
    expect(getBackendMode()).toBe("mock");
  });
});

// Server-only env reading for Phase 1 analytics. Anything that touches a
// secret-bearing or service-role-bearing env var lives behind functions in
// this module so the rest of the codebase never reads `process.env.*`
// directly. All accessors fail closed: a missing env var means "feature
// disabled" or "admin denied", never "feature enabled with defaults".
//
// This file must never be imported from a client component (`"use client"`)
// or any file under `src/components/**`. Enforced by the ESLint
// `no-restricted-imports` override on `src/components/**`.

const SAFE_TRUE = "true";

export function isAnalyticsBetaEnabled(): boolean {
  return process.env.ENABLE_ANALYTICS_BETA === SAFE_TRUE;
}

export type SupabaseEnv = {
  url: string;
  serviceRoleKey: string;
};

export type SupabaseEnvResult =
  | { ok: true; env: SupabaseEnv }
  | { ok: false; missing: string[] };

export function readSupabaseServerEnv(): SupabaseEnvResult {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, env: { url, serviceRoleKey } };
}

// Reads the Supabase URL + anon key for the SSR auth client used by the
// founder admin dashboard. The anon key is browser-safe; we keep it under
// `SUPABASE_ANON_KEY` (no `NEXT_PUBLIC_` prefix) so the auth surface stays
// server-only at this stage of Phase 1. The service-role key is **never**
// used for session/auth — it's read separately by `readSupabaseServerEnv`
// and stays scoped to the analytics writer / admin reader.
export type SupabaseAuthEnv = {
  url: string;
  anonKey: string;
};

export type SupabaseAuthEnvResult =
  | { ok: true; env: SupabaseAuthEnv }
  | { ok: false; missing: string[] };

export function readSupabaseAuthEnv(): SupabaseAuthEnvResult {
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, env: { url, anonKey } };
}

// Reads the founder admin email allowlist. Empty / missing env var produces
// an empty array — every admin request must then fail closed.
export function getFounderAllowlist(): string[] {
  const raw = process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isAllowlistedFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = getFounderAllowlist();
  if (allow.length === 0) return false;
  return allow.includes(email.trim().toLowerCase());
}

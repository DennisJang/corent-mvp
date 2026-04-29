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

// Phase 1.5 — Supabase SSR auth client factory.
//
// This is the **only** Supabase client in the codebase that is allowed to
// read a user session. It uses the Supabase **anon** key (browser-safe) and
// the Next.js App Router cookie store, per @supabase/ssr's contract. The
// service-role key is never touched here; it stays scoped to the analytics
// writer + admin reader in `src/server/analytics/supabase.ts`.
//
// Hard rules (enforced by tests + the security review):
//   - Anon key only. Service-role key must not appear in this file.
//   - Server-only. Must not be imported by any `"use client"` component
//     or any file under `src/components/**`.
//   - Returns `null` if SSR auth env is missing — callers fail closed.
//   - Per-request client. We do **not** cache across requests; cookie
//     state is request-scoped.
//
// References: docs/corent_security_review_phase1_2026-04-30.md §3.2–§3.5,
// §3.13; phase1_validation_beta_plan.md.

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabaseAuthEnv } from "@/server/analytics/env";

// We narrow the cookie surface so this module can be used both from server
// components (read-only — `setAll` is a no-op) and from route handlers
// (mutating — `setAll` writes refreshed session cookies). The route
// handlers pass `mutable: true`; pages get the safe default.
export type CreateAdminAuthClientOptions = {
  // When true, allow Supabase to write refreshed session cookies. Only
  // route handlers (POST /admin/auth/sign-in, GET /admin/auth/callback)
  // and explicitly-cookie-enabled paths set this; default is false so a
  // server component cannot accidentally trigger a cookie write.
  mutable?: boolean;
};

export async function createAdminAuthClient(
  options: CreateAdminAuthClientOptions = {},
): Promise<SupabaseClient | null> {
  const env = readSupabaseAuthEnv();
  if (!env.ok) return null;

  const cookieStore = await cookies();
  const mutable = options.mutable === true;

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll().map((c) => ({
        name: c.name,
        value: c.value,
      }));
    },
    setAll(cookiesToSet) {
      if (!mutable) {
        // Server-component context: writing cookies is a no-op. Supabase
        // itself emits a console warning when it cannot persist a refreshed
        // session — that's expected; the auth boundary still holds because
        // an expired session is rejected at session-read time.
        return;
      }
      try {
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          cookieStore.set(name, value, cookieOptions);
        }
      } catch {
        // Some Next.js contexts (e.g. middleware or static rendering) throw
        // when cookies are mutated; silently ignore so the auth flow keeps
        // working in the contexts where it can.
      }
    },
  };

  return createServerClient(env.env.url, env.env.anonKey, {
    cookies: cookieMethods,
    auth: {
      // Defense in depth — we never want to write a fallback session.
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Slice A PR 5C — closed-alpha user auth alias.
//
// `createAdminAuthClient` was first introduced for the founder admin
// magic-link flow. The factory itself is generic: anon key + cookie
// store, no founder-specific behavior, no allowlist coupling. The
// closed-alpha user sign-in / callback routes reuse the same
// implementation under this name so the call sites read clearly. The
// two identifiers are reference-equal — there is no second client.
export const createUserAuthClient = createAdminAuthClient;

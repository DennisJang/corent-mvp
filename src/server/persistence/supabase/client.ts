// Phase 2 server-only Supabase client factory for marketplace persistence.
// Distinct from `src/server/analytics/supabase.ts` (analytics writer) so
// marketplace work does not borrow the analytics module's caching or
// header tagging. Both clients use the service-role key — RLS is
// enabled on every Phase 2 table with no permissive policies, so the
// service role is the only role that can read/write today.
//
// Hard rules:
//   - Server-only. Must not be imported by `src/components/**` or any
//     `"use client"` file. Enforced by `import-boundary.test.ts`.
//   - Service-role key. Must never appear in a `NEXT_PUBLIC_*` env name
//     or be re-exported through one.
//   - Backend mode gate. Returns `null` when `getBackendMode() !== "supabase"`
//     so callers fall back to the safe mock path.
//   - Env gate. Returns `null` when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//     are missing. Callers must fail closed.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseServerEnv } from "@/server/analytics/env";
import { getBackendMode } from "@/server/backend/mode";

let cached: SupabaseClient | null = null;

export function getMarketplaceClient(): SupabaseClient | null {
  if (getBackendMode() !== "supabase") return null;
  if (cached) return cached;
  const result = readSupabaseServerEnv();
  if (!result.ok) return null;
  cached = createClient(result.env.url, result.env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-corent-source": "phase2-marketplace",
      },
    },
  });
  return cached;
}

// Test seam.
export function _resetMarketplaceClientForTests(): void {
  cached = null;
}

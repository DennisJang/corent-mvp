// Server-only Supabase service-role client factory. The service-role key
// bypasses RLS and is required for the analytics writer (insert into
// `growth_events`) and the founder admin reader. It must never be
// imported from a client component or any file under `src/components/**`.
//
// Returns `null` if env is missing — callers must fail closed when this
// happens; do not invent fallback credentials.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseServerEnv } from "./env";

let cached: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient | null {
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
        // Mark our requests so a Postgres role audit shows them clearly.
        "x-corent-source": "phase1-analytics",
      },
    },
  });
  return cached;
}

// Test seam: tests that swap env vars need to invalidate the module-level
// cache so the next `getServiceRoleClient` call rebuilds with fresh env.
export function _resetServiceRoleClientForTests(): void {
  cached = null;
}

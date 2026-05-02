// Server-only chat intake writer dispatcher.
//
// Pure function over `(getBackendMode(), actor.source)`. Returns
// the writer the action should use, or `null` when no safe writer
// exists for the current combination — the action then maps `null`
// to the same `unauthenticated` typed result the PR 3 gate
// produced, preserving fail-closed behavior.
//
// Decision table:
//
//   | mode      | actor.source | result                  |
//   | --------- | ------------ | ----------------------- |
//   | mock      | mock         | localIntakeWriter       |
//   | mock      | supabase     | localIntakeWriter       |
//   | supabase  | mock         | null (caller fails)     |
//   | supabase  | supabase     | supabaseIntakeWriter    |
//
// The `mock-mode + supabase-actor` row is unreachable from
// production today (the resolver always returns a mock-sourced
// actor). It's included for completeness — when an operator runs
// the local same-browser demo, every actor is mock-sourced and
// the writer is local regardless.
//
// The `supabase-mode + supabase-actor` row is the future state.
// `resolveServerActor` still returns mock-sourced actors today, so
// this branch is exercised only by tests that mock the resolver.
// Production callers in this branch would write to a real
// Supabase project — gated by `CORENT_BACKEND_MODE=supabase` AND
// real auth (which PR 5 ships).
//
// Hard rules:
//   - Server-only. Imports the supabase writer adapter.
//   - This is a dispatcher, NOT a policy gate. The action layer's
//     `assertSupabaseAuthority`-style check stayed in PR 3 to
//     produce a user-facing typed error; the dispatcher just
//     returns `null` so the action can map it to the same code.
//     Keeping both the gate and the dispatcher fail-closed in the
//     same shape means a future caller cannot bypass one without
//     hitting the other.

import type { IntakeWriter } from "@/lib/intake/intakeWriter";
import { localIntakeWriter } from "@/lib/intake/intakeWriter";
import type { ServerActor } from "@/server/actors/resolveServerActor";
import { getBackendMode } from "@/server/backend/mode";
import { supabaseIntakeWriter } from "@/server/intake/supabaseIntakeWriter";

export function getIntakeWriter(actor: ServerActor): IntakeWriter | null {
  if (getBackendMode() !== "supabase") {
    // Mock / default mode: always local. Same path the chat intake
    // service has used since the chat intake skeleton landed —
    // default behavior is byte-identical to pre-PR-4.
    return localIntakeWriter;
  }
  // Supabase mode: actor identity must be auth-bound. A mock-sourced
  // actor cannot back a shared-DB write.
  if (actor.source !== "supabase") return null;
  return supabaseIntakeWriter;
}

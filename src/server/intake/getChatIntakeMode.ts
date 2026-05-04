"use server";

// Slice A PR 5F — server-side chat-intake mode probe.
//
// The visible browser chat intake card calls this once at mount to
// decide whether subsequent calls should go through the local
// `chatListingIntakeService` (the same-browser demo) or through the
// server-backed actions in `@/server/intake/actions`. The decision is
// driven entirely server-side so the client never imports
// `@/server/backend/mode` (boundary forbids it) and never trusts a
// cookie / query / NEXT_PUBLIC env to choose its own mode.
//
// Hard rules:
//
//   - Read-only. The probe never inserts / updates / deletes. It does
//     not auto-create profiles, seller_profiles, or borrower_profiles.
//   - No PII surface. The return shape carries `mode` and a coarse
//     `capability` enum only. No user id, no email, no profile
//     metadata, no actor source string. The `capability` is derived
//     from `actor.kind` (already coarse) and exists so the chat card
//     can preflight a renter-only-friendly disabled-submit state in
//     server mode.
//   - Defaults to `{ mode: "local" }` on every uncertain branch:
//       - backend mode != supabase
//       - resolver returns null (no auth, no profile, no capability)
//       - actor.source !== "supabase" (defense in depth — the
//         supabase branch only mints `source: "supabase"` actors,
//         but we re-check)
//   - The action MUST be safe to call repeatedly. The chat intake
//     adapter caches the first result; tests reset that cache via
//     `_resetChatIntakeModeForTests` on the client side.
//   - Failures inside this action propagate as thrown errors. The
//     client adapter's `probeChatIntakeMode` wraps the call in
//     try/catch and defaults to `"local"` on any throw — this is the
//     ONE acceptable "fallback" semantic and applies BEFORE any
//     intake data has been written.
//
// References:
//   - `src/server/actors/resolveServerActor.ts` (PR 5A)
//   - `src/server/backend/mode.ts` (server-only `getBackendMode`)
//   - `src/lib/client/chatIntakeClient.ts` (client-side caller, PR 5F)
//   - `docs/corent_closed_alpha_chat_intake_client_mode_note.md`

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { getBackendMode } from "@/server/backend/mode";

export type ChatIntakeModeResult =
  | { mode: "local" }
  | { mode: "server"; capability: "seller" | "renter" };

export async function getChatIntakeModeAction(): Promise<ChatIntakeModeResult> {
  if (getBackendMode() !== "supabase") {
    return { mode: "local" };
  }
  const actor = await resolveServerActor({ prefer: "seller" });
  if (!actor) return { mode: "local" };
  if (actor.source !== "supabase") return { mode: "local" };
  // The resolver under `prefer: "seller"` returns the seller actor
  // when the profile has the seller capability, the renter actor
  // when only the borrower capability exists, and `null` when
  // neither does. The card preflights a calm renter-only disabled
  // state via the `capability` field.
  if (actor.kind === "seller") {
    return { mode: "server", capability: "seller" };
  }
  if (actor.kind === "renter") {
    return { mode: "server", capability: "renter" };
  }
  // Admin actors are not part of the chat intake surface; a future
  // edit that adds a third kind should explicitly decide its
  // capability mapping. Today we fail safe to local.
  return { mode: "local" };
}

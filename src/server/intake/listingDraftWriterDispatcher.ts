// Server-only listing-draft writer dispatcher.
//
// Slice A PR 5E. Pure function over `(getBackendMode(),
// actor.source)`. Returns the writer the chat intake action
// should use for the listing-draft side, or `null` when no safe
// writer exists for the current combination — the action then
// maps `null` to the same `unauthenticated` typed result the
// intake-side dispatcher produces.
//
// Decision table (mirrors `intakeWriterDispatcher.ts`):
//
//   | mode      | actor.source | result                       |
//   | --------- | ------------ | ---------------------------- |
//   | mock      | mock         | localListingDraftWriter      |
//   | mock      | supabase     | localListingDraftWriter      |
//   | supabase  | mock         | null (caller fails closed)   |
//   | supabase  | supabase     | supabaseListingDraftWriter   |
//
// The `mock + supabase` row is unreachable from production today
// (the resolver always returns a mock-sourced actor in mock mode);
// the row exists for completeness and to mirror PR 4's
// dispatcher.
//
// The `supabase + supabase` row is what PR 5E unlocks for the
// `createIntakeListingDraftAction` path: combined with the intake
// dispatcher's same-row decision, both sides of
// `createListingDraftFromIntake` route through the Supabase
// writers, eliminating the split-brain hole PR 5D's `unsupported`
// guard placeholdered.
//
// Hard rules:
//   - Server-only. Imports the supabase listing-draft writer
//     adapter.
//   - This is a dispatcher, NOT a policy gate. Action-layer
//     fail-closed shape (typed `unauthenticated` IntentResult)
//     is owned by the action; the dispatcher just returns `null`.
//   - The decision must remain symmetric with the intake-writer
//     dispatcher: any drift would re-introduce a split-brain
//     possibility. The boundary tests assert the two dispatchers
//     return the same combination for the same inputs.

import {
  type ListingDraftWriter,
  localListingDraftWriter,
} from "@/lib/intake/listingDraftWriter";
import type { ServerActor } from "@/server/actors/resolveServerActor";
import { getBackendMode } from "@/server/backend/mode";
import { supabaseListingDraftWriter } from "@/server/intake/supabaseListingDraftWriter";

export function getListingDraftWriter(
  actor: ServerActor,
): ListingDraftWriter | null {
  if (getBackendMode() !== "supabase") {
    // Mock / default mode: always local. Same path the chat
    // intake service used pre-PR-5E (when listing-side
    // persistence went through `getPersistence()` directly).
    return localListingDraftWriter;
  }
  // Supabase mode: actor identity must be auth-bound. A
  // mock-sourced actor cannot back a shared-DB write.
  if (actor.source !== "supabase") return null;
  return supabaseListingDraftWriter;
}

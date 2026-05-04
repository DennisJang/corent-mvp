// ListingDraftWriter — the pluggable persistence seam for the
// listing-draft side of chat-to-listing intake.
//
// Slice A PR 5E. PR 4 introduced `IntakeWriter` for chat intake
// session / message / extraction persistence; this is its sibling
// for the `ListingIntent` draft that
// `chatListingIntakeService.createListingDraftFromIntake` produces
// at the end of the chat flow.
//
// Why a separate interface from `IntakeWriter`:
//
//   - The two writers are on different schemas (`listing_intake_*`
//     vs. `listings` + `listing_verifications`).
//   - The local listing-draft path has its own validate-and-write
//     pipeline through `listingService.saveDraft`. Bundling that
//     into `IntakeWriter` would have made `localIntakeWriter`
//     reach across modules it currently does not.
//   - The id-format choice is a writer concern (local uses
//     `li_<16hex>`; the Supabase schema requires `uuid`). Putting
//     `newDraftId()` on the writer encapsulates that decision.
//
// Hard rules:
//
//   - Browser-safe. This module does not import from
//     `@/server/**`. The chat intake service lives under `src/lib`
//     and is reachable from the browser through the local-mode
//     client adapter; it must be able to import this interface
//     without dragging server-only modules into the bundle.
//
//   - The interface covers ONLY what the chat intake service's
//     `createListingDraftFromIntake` needs (id allocation, save,
//     read by id). Listing publication, edits, status transitions,
//     and approval are NOT part of this seam — those continue to
//     go through `listingService` directly.
//
//   - `saveListingDraft` returns `Promise<void>`. A writer that
//     fails MUST throw; callers expect either resolution or a
//     thrown error so the existing service-layer try/catch +
//     `ChatIntakeInputError` mapping continues to work. The
//     Supabase variant adapts the repository's `RepoResult` shape
//     into this contract.
//
//   - `saveListingDraft` MUST mirror `listingService.saveDraft`'s
//     `ai_extracted → draft` transition before persisting. Local
//     does this by delegating to `listingService.saveDraft`; the
//     Supabase writer does the transition explicitly.
//
//   - `getListingIntent` returns the same domain shape as
//     `getPersistence().getListingIntent` so the chat intake
//     service does not need to branch on writer type.

import type { ListingIntent } from "@/domain/intents";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId } from "@/lib/ids";
import { listingService } from "@/lib/services/listingService";

export interface ListingDraftWriter {
  // Allocate a fresh listing-draft id in the writer's preferred
  // format. The chat intake service calls this BEFORE building the
  // draft so the id chosen matches the eventual save target. The
  // local writer returns `li_<16hex>`; the Supabase writer returns
  // a uuid (because the `listings.id` column is `uuid` and the
  // server-side validator rejects everything else).
  newDraftId(): string;
  // Persist a draft listing. Implementations must mirror the
  // `ai_extracted → draft` transition that `listingService.saveDraft`
  // already performs for the local path; downstream readers expect
  // a persisted listing to be at status `"draft"` (or higher), not
  // `"ai_extracted"`.
  saveListingDraft(intent: ListingIntent): Promise<void>;
  getListingIntent(id: string): Promise<ListingIntent | null>;
}

// Default writer for local / same-browser demo mode.
//
// Delegates to `listingService.saveDraft` (which handles validate +
// the `ai_extracted → draft` transition and writes through
// `getPersistence().saveListingIntent`) and `getPersistence()
// .getListingIntent` for reads. Behavior is byte-identical to the
// pre-PR-5E call sites in `chatListingIntakeService` because those
// call sites previously called the same two functions directly.
export const localListingDraftWriter: ListingDraftWriter = {
  newDraftId(): string {
    return generateId("li");
  },
  async saveListingDraft(intent) {
    await listingService.saveDraft(intent);
  },
  async getListingIntent(id) {
    return getPersistence().getListingIntent(id);
  },
};

// Supabase-backed `ListingDraftWriter` — server-only.
//
// Slice A PR 5E. Closes the split-brain hole PR 5D's `unsupported`
// guard placeholdered: in supabase mode + supabase actor, the
// chat intake service now writes the listing draft through the
// Phase 2 `listings` + `listing_verifications` tables, not through
// `getPersistence()`. The previous PR 5D `unsupported` guard for
// `createIntakeListingDraftAction` becomes unreachable for the
// supabase + supabase combination once both writers are dispatched
// together.
//
// Hard rules:
//
//   - Server-only. Imports `@/server/persistence/supabase/...`
//     which is forbidden from `src/components/**` and any
//     `"use client"` file by the static-text guard in
//     `src/server/admin/import-boundary.test.ts`.
//
//   - This module is NOT a service. It does not resolve actor
//     identity, does not enforce ownership, does not orchestrate
//     status transitions beyond mirroring `saveDraft`'s
//     `ai_extracted → draft`. The chat intake service still owns
//     those responsibilities; this writer is a swappable
//     persistence leg.
//
//   - The id allocation uses `crypto.randomUUID()` because the
//     Phase 2 `listings.id` column is `uuid`. The local writer
//     stays on `li_<16hex>` so the same-browser demo continues
//     to work without changing the domain id format.
//
//   - Failures throw a typed non-secret error. The error message
//     never includes table names, env values, SQL, service-role
//     hints, or row payloads. The intake service's existing
//     try/catch in `createListingDraftFromIntake` maps this to
//     the standard `internal` IntentResult code.
//
// References:
//   - `src/lib/intake/listingDraftWriter.ts` — interface contract
//   - `src/server/persistence/supabase/listingRepository.ts` —
//     row mappers, validators, upsert path (PR 2 + PR 5E reuse)
//   - `src/server/intake/listingDraftWriterDispatcher.ts` —
//     dispatcher
//   - `docs/corent_closed_alpha_listing_draft_externalization_note.md`

import type { ListingIntent } from "@/domain/intents";
import type { ListingDraftWriter } from "@/lib/intake/listingDraftWriter";
import {
  getListingById,
  saveListing,
} from "@/server/persistence/supabase/listingRepository";

// Typed write error so the chat intake service's existing
// try / catch maps it cleanly. The message never includes table
// names, env values, or repo internals.
export class ListingDraftWriteError extends Error {
  readonly code: "save_listing_draft_failed";
  constructor(detail: string) {
    super(`save_listing_draft_failed: ${detail}`);
    this.name = "ListingDraftWriteError";
    this.code = "save_listing_draft_failed";
  }
}

export const supabaseListingDraftWriter: ListingDraftWriter = {
  newDraftId(): string {
    // The schema PK is uuid; `validateUuid` in the marketplace
    // validators rejects anything else. Local mode keeps
    // `li_<16hex>` (see `localListingDraftWriter`).
    return crypto.randomUUID();
  },
  async saveListingDraft(intent) {
    // Mirror `listingService.saveDraft`'s `ai_extracted → draft`
    // transition explicitly — the Supabase repository's
    // `saveListing` does NOT auto-transition; it persists whatever
    // status it is given. Without this, a chat-intake-created row
    // would land at `'ai_extracted'` in `listings.status`, which
    // is allowed by the enum but breaks parity with the local
    // path's user-visible behavior (where the persisted listing
    // is always at `'draft'` after `createListingDraftFromIntake`).
    const next: ListingIntent =
      intent.status === "ai_extracted"
        ? { ...intent, status: "draft" }
        : intent;

    const result = await saveListing({ intent: next });
    if (!result.ok) {
      // The repo error string is not user-secret (it's the upsert
      // message or a validator label). We still wrap it in a
      // ListingDraftWriteError so callers can branch on the typed
      // class without parsing strings, and the Korean copy stays
      // bounded to a non-secret summary downstream.
      throw new ListingDraftWriteError(result.error);
    }
  },
  async getListingIntent(id) {
    return getListingById(id);
  },
};

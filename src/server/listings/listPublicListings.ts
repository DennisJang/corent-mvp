"use server";

// Bundle 2, Slice 1 — server-backed public listing read.
//
// Bridges approved server-side listings to the renter-facing browse
// surface without changing request creation UI yet. The action is
// READ-ONLY and PUBLIC (no actor required) — approved listings are
// public by definition; the existing
// `mapApprovedListingIntentToPublicListing` projection enforces the
// privacy allowlist.
//
// Why this action does NOT use `runIntentCommand`:
//
//   - Public listing browse is unauthenticated. The runner would
//     fail-closed on `unauthenticated` for an anonymous renter who
//     just wants to see what's available. Surfacing approved
//     listings does not need an actor.
//
//   - Authority on what is "public" is the canonical
//     `listing.status === "approved"` check inside the projection
//     mapper, NOT actor identity. The service-role client bypasses
//     RLS; the projection itself is the safety boundary.
//
// Hard rules:
//
//   - In mock / default backend mode, the action returns
//     `{ mode: "local" }`. The client adapter then falls back to the
//     existing isomorphic `publicListingService.listPublicListings()`
//     path so the local-MVP demo (static `PRODUCTS` + any
//     localStorage-persisted approved listings) continues to work
//     unchanged.
//
//   - In supabase backend mode, the action reads ONLY server-approved
//     rows via `listApprovedListings()` and projects them through the
//     existing allowlist mapper
//     (`mapApprovedListingIntentToPublicListing`). Static `PRODUCTS`
//     are NOT included in the supabase-mode payload — they have no
//     `seller_profiles` row and would not be requestable via the
//     server-mode renter request action, so surfacing them here would
//     mislead the closed-alpha tester.
//
//   - The action never returns `ListingIntent` rows directly. Every
//     row goes through the allowlist mapper, which discards
//     `rawSellerInput`, `privateSerialNumber`, `verification.*`,
//     internal review notes, and any other private slot. The output
//     shape (`PublicListing`) does not even have slots for those
//     fields.
//
//   - Errors are typed and non-secret. A repo throw is caught and
//     surfaced as an empty server result so the client renders a
//     calm empty state. Internally it logs nothing to console.* —
//     `src/server/logging/logger.ts` is the only allowed log path,
//     and this slice does not need to log.
//
// References:
//   - `src/server/persistence/supabase/listingRepository.ts`
//     (`listApprovedListings` — server-only repo read)
//   - `src/lib/services/publicListingService.ts`
//     (`mapApprovedListingIntentToPublicListing` — pure allowlist
//     projection; reused isomorphically here)
//   - `src/components/SearchResults.tsx` (the client consumer; calls
//     this action via `src/lib/client/publicListingsClient.ts`)
//   - `docs/corent_validation_bundle2_slice1_public_browse_bridge_note.md`

import type { PublicListing } from "@/domain/listings";
import { mapApprovedListingIntentToPublicListing } from "@/lib/services/publicListingService";
import { getBackendMode } from "@/server/backend/mode";
import { listApprovedListings } from "@/server/persistence/supabase/listingRepository";

export type PublicListingsReadResult =
  | { mode: "local" }
  | { mode: "server"; listings: PublicListing[] };

export async function listPublicListingsAction(): Promise<PublicListingsReadResult> {
  // Mock / default backend: defer to the client's existing local
  // path. The client adapter then calls
  // `publicListingService.listPublicListings()` from the browser,
  // which is the only context where localStorage-persisted approved
  // listings are visible.
  if (getBackendMode() !== "supabase") {
    return { mode: "local" };
  }

  let approvedIntents;
  try {
    approvedIntents = await listApprovedListings();
  } catch {
    // Calm degraded state. The client renders an empty result
    // instead of a leaked SQL/env message.
    return { mode: "server", listings: [] };
  }

  // Project EVERY row through the explicit allowlist. Rows that fail
  // the minimum-shape gate (missing pickupArea, malformed prices,
  // unknown category, etc.) silently drop — the mapper returns null
  // for those.
  const projected: PublicListing[] = [];
  for (const intent of approvedIntents) {
    const safe = mapApprovedListingIntentToPublicListing(intent);
    if (safe) projected.push(safe);
  }

  return { mode: "server", listings: projected };
}

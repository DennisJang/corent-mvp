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
import {
  getListingById,
  listApprovedListings,
} from "@/server/persistence/supabase/listingRepository";
import { validateUuid } from "@/server/persistence/supabase/validators";

export type PublicListingsReadResult =
  | { mode: "local" }
  | { mode: "server"; listings: PublicListing[] };

export type PublicListingDetailReadResult =
  | { mode: "local" }
  | { mode: "server"; listing: PublicListing | null };

// Bundle 2, Slice 2 — server-projected approved listings get a
// clickable card. The detail href points at the new server-only
// route under `/listings/[listingId]`, which is gated to supabase
// mode + status='approved' + minimum-shape projection.
//
// We override `detailHref` at the action layer (not inside the
// shared `mapApprovedListingIntentToPublicListing` mapper) so the
// pure mapper still produces `detailHref: undefined` for every
// approved listing intent. Mock-mode local projections (read via
// `publicListingService.listPublicListings()` from the browser)
// continue to render as non-clickable cards — they have no
// server detail page and will not silently appear server-backed.
function withServerDetailHref(dto: PublicListing): PublicListing {
  return { ...dto, detailHref: `/listings/${dto.sourceId}` };
}

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
    if (safe) projected.push(withServerDetailHref(safe));
  }

  return { mode: "server", listings: projected };
}

// Bundle 2, Slice 2 — single-listing read for the new
// `/listings/[listingId]` server detail route.
//
// Hard rules:
//
//   - The `listingId` argument is the canonical row id (no
//     `listing:` prefix). The detail route URL carries the bare
//     uuid; this action validates uuid shape before any DB read.
//
//   - Mock / default backend mode → `{ mode: "local" }`. The new
//     `/listings/[listingId]` route is server-mode only; in mock
//     mode the page surfaces a 404. Local-MVP demo flows continue
//     to use `/items/[id]` against the static `PRODUCTS` fixture.
//
//   - Supabase mode → reads `getListingById`. Anything other than
//     `status='approved'` collapses to `{ listing: null }` so a
//     renter cannot enumerate draft / in-review / rejected rows
//     by trying ids in the URL bar.
//
//   - The output is always a sanitized `PublicListing` DTO (or
//     null). `ListingIntent` itself is NEVER returned to the
//     caller; the projection mapper is the privacy boundary.
//
//   - Repo throw → calm `{ listing: null }`. No SQL / env / table /
//     row / service-role hint leaks through the action surface.
export async function getServerApprovedPublicListingAction(
  listingId: string,
): Promise<PublicListingDetailReadResult> {
  if (getBackendMode() !== "supabase") {
    return { mode: "local" };
  }

  // Validate the uuid before reaching the DB. Bad shapes look
  // identical to "missing" from the renter's perspective.
  const idRes = validateUuid(listingId);
  if (!idRes.ok) {
    return { mode: "server", listing: null };
  }

  let intent;
  try {
    intent = await getListingById(idRes.value);
  } catch {
    return { mode: "server", listing: null };
  }
  if (!intent) {
    return { mode: "server", listing: null };
  }

  // The repository's mapper returns the full ListingIntent.
  // `mapApprovedListingIntentToPublicListing` enforces
  // `status === "approved"` AND the minimum-shape gate; everything
  // else collapses to `null`.
  const safe = mapApprovedListingIntentToPublicListing(intent);
  if (!safe) {
    return { mode: "server", listing: null };
  }
  return {
    mode: "server",
    listing: withServerDetailHref(safe),
  };
}

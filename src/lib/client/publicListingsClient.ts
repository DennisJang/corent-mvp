// Client-side adapter for the server-backed public listing read
// (Bundle 2, Slice 1).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary test in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a client adapter under
//     `src/lib/client/**` — the same pattern PR 5F (chat intake)
//     and PR 5G (seller dashboard listings) already use.
//
//   - The adapter normalizes the server action's
//     `PublicListingsReadResult` into a tighter three-state
//     envelope the component branches on directly: `local` /
//     `server` / `error`. The component never inspects internal
//     server-action error codes; the failure caption (or fallback
//     to the local path) is the same for every error.
//
// Hard rules:
//
//   - No silent fallback after a `kind: "server"` result lands. If
//     the server returned an empty `listings` array, the component
//     renders the empty state — it does NOT then go ask the local
//     path for more rows. Mixing local + server data in supabase
//     mode would be the exact "silent local fallback" the slice
//     forbids.
//
//   - On `kind: "local"`, the component is free to call its
//     existing local path
//     (`publicListingService.listPublicListings()`); local fallback
//     is the documented mock-mode behavior.
//
//   - On `kind: "error"`, the component must render a calm degraded
//     state (e.g. keep the SSR initial paint, show no rows). Local
//     data must NOT be used as a substitute for server data.

"use client";

import type { PublicListing } from "@/domain/listings";
import { listPublicListingsAction } from "@/server/listings/listPublicListings";

export type PublicListingsLoadResult =
  | { kind: "local" }
  | { kind: "server"; listings: PublicListing[] }
  | { kind: "error" };

export async function loadPublicListings(): Promise<PublicListingsLoadResult> {
  try {
    const result = await listPublicListingsAction();
    if (result.mode === "local") return { kind: "local" };
    return { kind: "server", listings: result.listings };
  } catch {
    return { kind: "error" };
  }
}

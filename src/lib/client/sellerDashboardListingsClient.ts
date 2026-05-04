// Client-side adapter for the seller dashboard's server-mode
// listings read (Slice A PR 5G).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary test in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a client adapter under
//     `src/lib/client/**`, the same shape PR 5F uses for chat
//     intake.
//
//   - The adapter normalizes the server action's typed
//     `IntentResult<SellerOwnedListingsResult>` into a tighter
//     three-state shape the component branches on directly:
//     `local` / `server` / `error`. The component never inspects
//     `IntentErrorCode` strings — the failure caption is the same
//     for every error code.
//
// Hard rules:
//
//   - No silent fallback. When the server action fails (typed
//     error or thrown), the adapter returns `{ kind: "error" }`.
//     The component renders a failure caption; localStorage rows
//     are NOT consulted.
//
//   - The adapter is browser-safe but the `loadSellerOwnedListings`
//     function is a thin wrapper around a `"use server"` action,
//     so it round-trips to the server at runtime.

"use client";

import {
  listSellerOwnedListingsAction,
  type SellerDashboardListing,
} from "@/server/listings/listSellerOwnedListings";

export type { SellerDashboardListing };

export type SellerOwnedListingsLoadResult =
  | { kind: "local" }
  | { kind: "server"; listings: SellerDashboardListing[] }
  | { kind: "error" };

export async function loadSellerOwnedListings(): Promise<SellerOwnedListingsLoadResult> {
  try {
    const result = await listSellerOwnedListingsAction();
    if (!result.ok) return { kind: "error" };
    if (result.value.mode === "local") return { kind: "local" };
    return { kind: "server", listings: result.value.listings };
  } catch {
    return { kind: "error" };
  }
}

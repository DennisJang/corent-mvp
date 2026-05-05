// Client-side adapter for the seller dashboard's server-mode
// requests read (Bundle 2, Slice 3).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a `src/lib/client/**` adapter.
//
//   - The adapter normalizes the typed
//     `IntentResult<SellerRentalRequestsResult>` into a tighter
//     three-state shape the component branches on directly:
//     `local` / `server` / `error`. The component never inspects
//     `IntentErrorCode` strings — the failure caption is the same
//     for every error code.
//
// Hard rules:
//
//   - No silent fallback. When the server action fails (typed
//     error or thrown), the adapter returns `{ kind: "error" }`.
//     The component renders a failure caption and renders no
//     server rows. Local mock requests are NEVER substituted as
//     "server-backed" — they are rendered, if at all, by the
//     existing local-mode pending/active blocks under the
//     `chatIntakeMode === "local"` gate.
//
//   - The adapter is browser-safe but the `loadSellerRequests`
//     function is a thin wrapper around a `"use server"` action,
//     so it round-trips to the server at runtime.

"use client";

import {
  listSellerRentalRequestsAction,
  type SellerDashboardRequest,
} from "@/server/rentals/listSellerRentalRequests";

export type { SellerDashboardRequest };

export type SellerRequestsLoadResult =
  | { kind: "local" }
  | { kind: "server"; requests: SellerDashboardRequest[] }
  | { kind: "error" };

export async function loadSellerRequests(): Promise<SellerRequestsLoadResult> {
  try {
    const result = await listSellerRentalRequestsAction();
    if (!result.ok) return { kind: "error" };
    if (result.value.mode === "local") return { kind: "local" };
    return { kind: "server", requests: result.value.requests };
  } catch {
    return { kind: "error" };
  }
}

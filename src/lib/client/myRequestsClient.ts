// Client-side adapter for the borrower `/requests` page server-mode
// read (Bundle 3, Slice 2). Mirrors `sellerDashboardRequestsClient`
// but routes through `listMyRentalRequestsAction`.
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a `src/lib/client/**` adapter.
//
//   - The adapter normalizes the typed
//     `IntentResult<MyRentalRequestsResult>` into a tighter
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
//     "server-backed".
//
//   - The adapter is browser-safe but the `loadMyRequests`
//     function is a thin wrapper around a `"use server"` action,
//     so it round-trips to the server at runtime.

"use client";

import {
  listMyRentalRequestsAction,
  type MyRentalRequest,
} from "@/server/rentals/listMyRentalRequests";

export type { MyRentalRequest };

export type MyRequestsLoadResult =
  | { kind: "local" }
  | { kind: "server"; requests: MyRentalRequest[] }
  | { kind: "error" };

export async function loadMyRequests(): Promise<MyRequestsLoadResult> {
  try {
    const result = await listMyRentalRequestsAction();
    if (!result.ok) return { kind: "error" };
    if (result.value.mode === "local") return { kind: "local" };
    return { kind: "server", requests: result.value.requests };
  } catch {
    return { kind: "error" };
  }
}

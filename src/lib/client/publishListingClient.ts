// Client-side adapter for the founder publish action (Bundle 1
// Part 3, wired to the cockpit UI in Bundle 2 Slice 4).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a `src/lib/client/**` adapter.
//
//   - The adapter normalizes the typed
//     `IntentResult<PublishListingResult>` into a tighter
//     envelope (`ok` / `unauthenticated` / `not_found` / `input` /
//     `unsupported` / `error`). The cockpit's button branches on
//     `kind` and renders calm Korean copy. The component never
//     inspects raw `IntentErrorCode` strings.
//
// Hard rules:
//
//   - The CLIENT payload is `{ listingId }` only. The server
//     action's payload type forbids `sellerId`, `status`,
//     `adminId`, `role`, `capability`, `approval`, etc.; the
//     runtime never reads them. This adapter forwards ONLY the
//     whitelisted field.
//
//   - The founder gate stays inside `publishListingAction` itself
//     (it calls `requireFounderSession()` before any DB read).
//     Sellers cannot self-publish through this adapter — a
//     non-allowlisted Supabase session that calls the action gets
//     `unauthenticated`. The button only renders inside the
//     founder cockpit page, which is itself founder-gated, but
//     defense in depth: the action's gate is the authority signal.

"use client";

import { publishListingAction } from "@/server/listings/publishListing";

export type PublishListingInput = {
  listingId: string;
};

export type PublishListingUiResult =
  | {
      kind: "ok";
      id: string;
      alreadyApproved: boolean;
    }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "input" }
  | { kind: "unsupported" }
  | { kind: "error" };

export async function publishListingFromCockpit(
  input: PublishListingInput,
): Promise<PublishListingUiResult> {
  // Forge defense — the adapter sends ONLY the whitelisted
  // payload field. A caller passing extra keys via cast cannot
  // smuggle them past this boundary because we destructure into
  // a fresh object before forwarding.
  const payload = { listingId: input.listingId };

  try {
    const result = await publishListingAction(payload);
    if (result.ok) {
      return {
        kind: "ok",
        id: result.value.id,
        alreadyApproved: result.value.alreadyApproved,
      };
    }
    switch (result.code) {
      case "unauthenticated":
        return { kind: "unauthenticated" };
      case "not_found":
        return { kind: "not_found" };
      case "input":
        return { kind: "input" };
      case "unsupported":
        return { kind: "unsupported" };
      default:
        return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}

// Client-side adapter for the seller approve / decline rental
// request actions (post-2026-05-05 smoke).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary in
//     `src/server/admin/import-boundary.test.ts`).
//
//   - The adapter normalizes the typed `IntentResult` into a
//     tighter envelope the dashboard branches on directly:
//     `ok` / `unauthenticated` / `ownership` / `not_found` /
//     `input` / `conflict` / `unsupported` / `error`. The
//     component renders calm Korean copy for each — never raw
//     server messages.
//
// Hard rules:
//
//   - The CLIENT payload is `{ rentalIntentId }` only. The
//     server action's payload type forbids `sellerId`,
//     `borrowerId`, `status`, `amounts`, `payment`, `pickup`,
//     `return`, `settlement`, `adminId`, `role`, `capability`,
//     `approval`. The adapter destructures into a fresh object
//     before forwarding so a forged caller passing extras via
//     cast cannot ride along.
//
//   - The adapter is `"use client"`; it round-trips to the
//     server actions at runtime.

"use client";

import {
  approveRentalRequestAction,
  declineRentalRequestAction,
  type RespondToRentalRequestResult,
} from "@/server/rentals/respondToRentalRequest";

export type RespondToRentalRequestInput = {
  rentalIntentId: string;
};

export type RespondToRentalRequestUiResult =
  | {
      kind: "ok";
      result: RespondToRentalRequestResult;
    }
  | { kind: "unauthenticated" }
  | { kind: "ownership" }
  | { kind: "not_found" }
  | { kind: "input" }
  | { kind: "conflict" }
  | { kind: "unsupported" }
  | { kind: "error" };

function mapResult(
  result:
    | { ok: true; value: RespondToRentalRequestResult }
    | { ok: false; code: string; message: string },
): RespondToRentalRequestUiResult {
  if (result.ok) return { kind: "ok", result: result.value };
  switch (result.code) {
    case "unauthenticated":
      return { kind: "unauthenticated" };
    case "ownership":
      return { kind: "ownership" };
    case "not_found":
      return { kind: "not_found" };
    case "input":
      return { kind: "input" };
    case "conflict":
      return { kind: "conflict" };
    case "unsupported":
      return { kind: "unsupported" };
    default:
      return { kind: "error" };
  }
}

export async function approveRequest(
  input: RespondToRentalRequestInput,
): Promise<RespondToRentalRequestUiResult> {
  const payload: RespondToRentalRequestInput = {
    rentalIntentId: input.rentalIntentId,
  };
  try {
    const result = await approveRentalRequestAction(payload);
    return mapResult(result);
  } catch {
    return { kind: "error" };
  }
}

export async function declineRequest(
  input: RespondToRentalRequestInput,
): Promise<RespondToRentalRequestUiResult> {
  const payload: RespondToRentalRequestInput = {
    rentalIntentId: input.rentalIntentId,
  };
  try {
    const result = await declineRentalRequestAction(payload);
    return mapResult(result);
  } catch {
    return { kind: "error" };
  }
}

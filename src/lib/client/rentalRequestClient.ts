// Client-side adapter for the renter request creation action
// (Bundle 2, Slice 2 — wires Bundle 1, Part 4's
// `createRentalRequestAction` into the renter UI).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a `src/lib/client/**` adapter.
//
//   - The adapter normalizes the typed `IntentResult` into a
//     tighter envelope (`ok` / `unauthenticated` / `ownership` /
//     `not_found` / `input` / `unsupported` / `error`). The
//     calling component branches on `kind` and renders calm,
//     non-secret Korean copy. The component never inspects raw
//     `IntentErrorCode` strings or any server-side error message.
//
// Hard rules:
//
//   - The CLIENT payload is `{ listingId, durationDays }` only.
//     The server action's payload type forbids `sellerId`,
//     `borrowerId`, `price`, `amounts`, `status`, `payment`,
//     `pickup`, `return`, `settlement`, `adminId`, `role`,
//     `capability`, `approval`, `trustScore`, and `claimReview`
//     fields; the runtime never reads them. This adapter
//     forwards ONLY the two whitelisted fields and never
//     adds more on the way through.
//
//   - No silent fallback to the local `rentalService` path. A
//     server-mode failure surfaces as an explicit non-`ok`
//     `kind`. Mock backend / unsigned-in users see the
//     `unauthenticated` / `unsupported` envelopes. Local
//     persistence is never used as a substitute for the server
//     write.
//
//   - The `ok` envelope's amounts are SERVER-DERIVED from the
//     canonical listing pricing. The component must render the
//     server-returned amounts; it must not reuse a stale
//     client-computed value as the "request was sent" total.

"use client";

import type { CategoryId } from "@/domain/categories";
import { createRentalRequestAction } from "@/server/rentals/createRentalRequest";

export type CreateRentalRequestInput = {
  listingId: string;
  durationDays: 1 | 3 | 7;
};

export type CreateRentalRequestUiResult =
  | {
      kind: "ok";
      request: {
        id: string;
        durationDays: 1 | 3 | 7;
        rentalFee: number;
        safetyDeposit: number;
        borrowerTotal: number;
        productName: string;
        productCategory: CategoryId;
      };
    }
  | { kind: "unauthenticated" }
  | { kind: "ownership" }
  | { kind: "not_found" }
  | { kind: "input" }
  | { kind: "unsupported" }
  | { kind: "error" };

export async function submitRentalRequest(
  input: CreateRentalRequestInput,
): Promise<CreateRentalRequestUiResult> {
  // Forge defense — the adapter sends ONLY the whitelisted
  // payload fields. A caller passing extra keys via cast cannot
  // smuggle them past this boundary.
  const payload: CreateRentalRequestInput = {
    listingId: input.listingId,
    durationDays: input.durationDays,
  };

  try {
    const result = await createRentalRequestAction(payload);
    if (result.ok) {
      return {
        kind: "ok",
        request: {
          id: result.value.id,
          durationDays: result.value.durationDays as 1 | 3 | 7,
          rentalFee: result.value.rentalFee,
          safetyDeposit: result.value.safetyDeposit,
          borrowerTotal: result.value.borrowerTotal,
          productName: result.value.productName,
          productCategory: result.value.productCategory,
        },
      };
    }
    switch (result.code) {
      case "unauthenticated":
        return { kind: "unauthenticated" };
      case "ownership":
        return { kind: "ownership" };
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

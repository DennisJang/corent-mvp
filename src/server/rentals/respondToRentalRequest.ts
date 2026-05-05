"use server";

// Bundle 3, slice 1 (post-2026-05-05 smoke) — seller approve /
// decline of a server-side rental request.
//
// First lifecycle transition past `requested` against the
// supabase backend. Stays narrow:
//
//   - approve: `requested → seller_approved`
//   - decline: `requested → seller_cancelled`
//
// Both transitions exist in the canonical
// `rentalIntentMachine.ALLOWED_TRANSITIONS` table; no schema /
// migration / new enum value is needed. Persistence reuses the
// existing `saveRentalIntent` + `appendRentalEvent` repository
// functions — both validators already enforce uuid PKs +
// `actor in ('system','seller','borrower','admin')` + bounded
// `reason`.
//
// Hard rules:
//
//   - Client payload is `{ rentalIntentId }` only. Any
//     `sellerId` / `borrowerId` / `status` / `amounts` /
//     `payment` / `pickup` / `return` / `settlement` / `adminId` /
//     `role` / `capability` / `approval` field a forged caller
//     attaches is ignored — the type does not declare them and
//     the runtime never reads them.
//
//   - Authority signals are server-derived ONLY: actor identity
//     comes from `resolveServerActor`; rental ownership is
//     re-asserted server-side via `assertRentalSellerIs`
//     against the canonical row reloaded from the supabase
//     repository.
//
//   - Status semantics use the existing state machine. The
//     `approveRentalIntent` / `cancelRentalIntent` helpers run
//     `canTransition` internally; an out-of-window call (e.g.
//     approve while already `paid`, or decline while already
//     `seller_approved`) collapses to `intentErr("conflict",
//     …)`. Idempotent re-call against the matching destination
//     (e.g. approve while `seller_approved`) returns
//     `intentOk({ alreadyResponded: true })` without writing.
//
//   - The state machine helper mints `event.id` via
//     `generateId("evt")` which is NOT a uuid. The supabase
//     `appendRentalEvent` validator requires a uuid, so we
//     override `event.id` with `crypto.randomUUID()` before
//     persisting (same workaround `createRentalRequest` uses).
//
//   - **No payment / deposit / settlement / pickup / return /
//     handoff / claim / dispute / trust-event / notification
//     side effect.** This action only updates `rental_intents`
//     status + appends one row to `rental_events`. The
//     `payment.status` / `pickup.status` / `return.status` /
//     `settlement.status` columns remain at their existing
//     values from the `requested` state (`not_started` /
//     `not_scheduled` / `not_due` / `not_ready`).
//
//   - Tight non-secret response DTO: `{ id, status,
//     alreadyResponded }`. Borrower id, amounts, payment
//     internals, settlement internals are never echoed.
//
// References:
//   - `src/lib/stateMachines/rentalIntentMachine.ts` —
//     `approveRentalIntent`, `cancelRentalIntent`, `canTransition`
//   - `src/lib/auth/guards.ts` — `assertRentalSellerIs`,
//     `OwnershipError`
//   - `src/server/persistence/supabase/rentalIntentRepository.ts`
//     — `getRentalIntentById`, `saveRentalIntent`,
//     `appendRentalEvent`
//   - `src/server/rentals/createRentalRequest.ts` — same
//     uuid-event-id workaround pattern
//   - `docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`

import type { RentalIntent } from "@/domain/intents";
import { OwnershipError, assertRentalSellerIs } from "@/lib/auth/guards";
import {
  approveRentalIntent,
  cancelRentalIntent,
} from "@/lib/stateMachines/rentalIntentMachine";
import { getBackendMode } from "@/server/backend/mode";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import {
  appendRentalEvent,
  getRentalIntentById,
  saveRentalIntent,
} from "@/server/persistence/supabase/rentalIntentRepository";
import { validateUuid } from "@/server/persistence/supabase/validators";

export type RespondToRentalRequestPayload = {
  rentalIntentId: string;
};

export type RespondToRentalRequestResult = {
  id: string;
  status: "seller_approved" | "seller_cancelled";
  alreadyResponded: boolean;
};

type Decision = "approve" | "decline";

const DESTINATION_STATUS: Record<
  Decision,
  "seller_approved" | "seller_cancelled"
> = {
  approve: "seller_approved",
  decline: "seller_cancelled",
};

// One core handler used by both action wrappers; the only
// per-decision difference is the state-machine helper invoked.
async function handleRespond(
  decision: Decision,
  payload: RespondToRentalRequestPayload,
  actorSellerId: string,
): Promise<IntentResult<RespondToRentalRequestResult>> {
  // Backend gate. The action runs ONLY against the supabase
  // backend. Mock mode + supabase actor (defense in depth) /
  // mock mode (no actor at all) collapse to `unsupported`.
  if (getBackendMode() !== "supabase") {
    return intentErr(
      "unsupported",
      "rental_response_requires_server_backend",
    );
  }

  // Validate the only client-supplied field.
  const idRes = validateUuid(payload?.rentalIntentId);
  if (!idRes.ok) return intentErr("input", "rental_intent_id_invalid");

  let rental: RentalIntent | null;
  try {
    rental = await getRentalIntentById(idRes.value);
  } catch {
    return intentErr("internal", "respond_to_rental_request_failed");
  }
  if (!rental) {
    return intentErr("not_found", "rental_not_found");
  }

  // Ownership: the rental must belong to THIS seller. The
  // canonical row's `sellerId` is the only signal. Forged
  // payload field would be ignored; the actor's `sellerId` is
  // the only identity passed in.
  try {
    assertRentalSellerIs(rental, actorSellerId);
  } catch (e) {
    if (e instanceof OwnershipError) {
      return intentErr("ownership", "rental_seller_mismatch");
    }
    return intentErr("internal", "respond_to_rental_request_failed");
  }

  const target = DESTINATION_STATUS[decision];

  // Idempotency: if the rental is already in the matching
  // destination status, succeed without writing. A subsequent
  // approve-after-approve / decline-after-decline is a safe
  // no-op (e.g. a double-click during latency).
  if (rental.status === target) {
    return intentOk({
      id: rental.id,
      status: target,
      alreadyResponded: true,
    });
  }

  // Run the state-machine transition. The helper itself enforces
  // `canTransition` against the canonical `ALLOWED_TRANSITIONS`
  // table; an out-of-window call (e.g. approve a `paid` rental)
  // collapses to `conflict`.
  const r =
    decision === "approve"
      ? approveRentalIntent(rental)
      : cancelRentalIntent(rental, "seller");
  if (!r.ok) {
    return intentErr(
      "conflict",
      `invalid_transition_from_${rental.status}_to_${target}`,
    );
  }

  // The state-machine helper mints `event.id` via
  // `generateId("evt")` which is NOT a uuid. The supabase
  // `appendRentalEvent` validator requires a uuid; mirror the
  // workaround `createRentalRequest` already uses.
  const eventId = crypto.randomUUID();
  const safeEvent = { ...r.event, id: eventId };

  try {
    const saved = await saveRentalIntent(r.intent);
    if (!saved.ok) {
      return intentErr("internal", "respond_to_rental_request_failed");
    }
    const appended = await appendRentalEvent(safeEvent);
    if (!appended.ok) {
      return intentErr("internal", "respond_to_rental_request_failed");
    }
  } catch {
    return intentErr("internal", "respond_to_rental_request_failed");
  }

  return intentOk({
    id: r.intent.id,
    status: target,
    alreadyResponded: false,
  });
}

export async function approveRentalRequestAction(
  payload: RespondToRentalRequestPayload,
): Promise<IntentResult<RespondToRentalRequestResult>> {
  return runIntentCommand<
    RespondToRentalRequestPayload,
    RespondToRentalRequestResult
  >(
    async ({ actor, payload }) => {
      // Defense in depth: even with `expectedActorKind: "seller"`,
      // re-check the source so a future drift in the resolver
      // cannot route a mock-sourced identity into a shared-DB
      // write. Same posture used by `createRentalRequestAction`.
      if (actor.source !== "supabase") {
        return intentErr(
          "unsupported",
          "rental_response_requires_server_backend",
        );
      }
      if (actor.kind !== "seller") {
        return intentErr(
          "ownership",
          "only sellers can respond to rental requests",
        );
      }
      return handleRespond("approve", payload, actor.sellerId);
    },
    payload,
    { expectedActorKind: "seller", prefer: "seller" },
  );
}

export async function declineRentalRequestAction(
  payload: RespondToRentalRequestPayload,
): Promise<IntentResult<RespondToRentalRequestResult>> {
  return runIntentCommand<
    RespondToRentalRequestPayload,
    RespondToRentalRequestResult
  >(
    async ({ actor, payload }) => {
      if (actor.source !== "supabase") {
        return intentErr(
          "unsupported",
          "rental_response_requires_server_backend",
        );
      }
      if (actor.kind !== "seller") {
        return intentErr(
          "ownership",
          "only sellers can respond to rental requests",
        );
      }
      return handleRespond("decline", payload, actor.sellerId);
    },
    payload,
    { expectedActorKind: "seller", prefer: "seller" },
  );
}

// Minimal server-side command boundary.
//
// Pattern (this is NOT a framework — keep it tiny):
//
//   actor → command → handler → IntentResult
//
// Every server action that mutates state goes through `runIntentCommand`:
//
//   1. The runner resolves the server actor via `resolveServerActor`.
//      The handler never sees a caller-supplied actor id.
//   2. The handler accepts a typed payload (only client-safe fields).
//      Adding `actorSellerId` to a payload type is a compile-time
//      error; adding it via cast is a runtime no-op because the
//      handler signature does not read it.
//   3. The handler returns a typed `IntentResult<TValue>`. Known
//      domain errors (`OwnershipError`, `ChatIntakeInputError`, etc.)
//      are mapped to typed codes by the handler — not by the runner.
//   4. Unexpected throws are mapped to `{ ok: false, code: "internal" }`
//      with no stack trace so the client never sees server internals.
//
// This module is tiny on purpose. Future tracks (rental lifecycle,
// claim/admin, notifications) will reuse it; they should not grow it
// into a generic mediator.

import {
  resolveServerActor,
  type ServerActor,
} from "@/server/actors/resolveServerActor";
import { intentErr, type IntentResult } from "@/server/intents/intentResult";

export type IntentCommandContext<TPayload> = {
  actor: ServerActor;
  payload: TPayload;
};

export type IntentCommandHandler<TPayload, TValue> = (
  ctx: IntentCommandContext<TPayload>,
) => Promise<IntentResult<TValue>>;

// Optional actor-kind narrowing. Most chat-intake handlers expect a
// seller; later rental flows may expect renter or admin. The runner
// stays generic; the handler asserts the kind it needs and returns
// `intentErr("ownership", ...)` if the actor doesn't match.
export type ExpectedActorKind = ServerActor["kind"];

export async function runIntentCommand<TPayload, TValue>(
  handler: IntentCommandHandler<TPayload, TValue>,
  payload: TPayload,
  options?: { expectedActorKind?: ExpectedActorKind },
): Promise<IntentResult<TValue>> {
  const actor = await resolveServerActor();
  if (!actor) {
    return intentErr("unauthenticated", "no actor resolved");
  }
  if (
    options?.expectedActorKind !== undefined &&
    actor.kind !== options.expectedActorKind
  ) {
    return intentErr(
      "ownership",
      `actor kind ${actor.kind} cannot run a ${options.expectedActorKind} command`,
    );
  }
  try {
    return await handler({ actor, payload });
  } catch {
    // Defense-in-depth: handlers should map known errors to typed
    // results themselves. Anything that escapes is a programming
    // error; surface a generic code so the client can show a calm
    // toast without leaking internals.
    return intentErr("internal", "intent_command_failed");
  }
}

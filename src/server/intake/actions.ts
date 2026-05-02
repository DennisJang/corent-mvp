"use server";

// Chat-to-listing intake server actions.
//
// These are the first three handlers built on the intent command
// boundary in `src/server/intents/intentCommand.ts`. They wrap the
// existing `chatListingIntakeService` so that:
//
//   1. The actor is resolved server-side via `resolveServerActor`.
//      The client never passes `actorSellerId` — the payload types
//      below do not include it, and the runtime ignores any extra
//      keys a forged caller might attach.
//   2. Known domain errors map to typed `IntentResult` codes; the
//      client gets `{ ok: false, code: "input" | "not_found" | ... }`
//      and never a server stack trace.
//   3. Internal/unexpected throws fall through to the runner's
//      generic `internal` mapping (see `runIntentCommand`).
//
// The underlying service (`chatListingIntakeService`) still works
// when called directly from server tests or future server flows;
// these actions are an additional, narrower entry point.

import type {
  IntakeMessage,
  IntakeSession,
  IntakeExtraction,
} from "@/domain/intake";
import type { ListingIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import {
  ChatIntakeInputError,
  chatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";
import type { ServerActor } from "@/server/actors/resolveServerActor";
import { getBackendMode } from "@/server/backend/mode";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";

// --------------------------------------------------------------
// Payload types — client-safe fields only.
//
// Note: there is intentionally NO `actorSellerId` field here. The
// command runner resolves the actor server-side. Adding such a
// field would be a compile-time regression; passing one via
// `as` cast is a runtime no-op because the handler reads
// `ctx.actor.sellerId`, never `ctx.payload`.
// --------------------------------------------------------------

export type StartIntakeSessionPayload = Record<string, never>;

export type AppendIntakeSellerMessagePayload = {
  sessionId: string;
  content: string;
};

export type CreateIntakeListingDraftPayload = {
  sessionId: string;
};

// --------------------------------------------------------------
// Result types — what the action returns to the client.
// --------------------------------------------------------------

export type StartIntakeSessionResult = { session: IntakeSession };

export type AppendIntakeSellerMessageResult = {
  session: IntakeSession;
  sellerMessage: IntakeMessage;
  assistantMessage: IntakeMessage;
  extraction: IntakeExtraction;
};

export type CreateIntakeListingDraftResult = {
  session: IntakeSession;
  listing: ListingIntent;
};

// --------------------------------------------------------------
// Backend-mode safety gate.
//
// In `mock` mode (the default and the only mode the local
// same-browser demo runs in) this is a pass-through — it returns
// `null` and the action proceeds against the local persistence
// adapter pair via `chatListingIntakeService`.
//
// In `supabase` mode it FAILS CLOSED in two layers:
//
//   1. If the resolved actor's `source` is `"mock"`, the action
//      refuses with `unauthenticated`. Mock identities cannot back
//      a shared-server write — that is the executable form of the
//      externalization plan §3 principle "no client-supplied
//      actor / status / amount trust" plus its corollary
//      "mock actor identity must never authorize an external/
//      shared-DB write". Today every real production resolver
//      returns a mock actor (the `resolveServerActor` body still
//      reads `getMockSellerSession`), so this branch is always
//      taken when an operator explicitly sets
//      `CORENT_BACKEND_MODE=supabase`.
//
//   2. If the actor's `source` is `"supabase"` (an auth-bound
//      actor from a future PR that lands real auth), the action
//      still refuses — with `internal: supabase_runtime_not_yet_wired`.
//      Slice A PR 3 only puts the gate up; the dispatch from the
//      gate to the Supabase intake repository ships in a later PR
//      after real auth + a Supabase-resolved actor exist.
//
// Net effect of PR 3:
//   - Default behavior unchanged for every same-browser demo user.
//   - Any operator that sets `CORENT_BACKEND_MODE=supabase` sees
//     every intake server action fail closed with a typed,
//     non-secret error code.
//
// Returns `null` when the action should proceed; otherwise an
// `IntentResult<T>` failure that the action returns directly.
function assertSupabaseAuthority<T>(actor: ServerActor): IntentResult<T> | null {
  if (getBackendMode() !== "supabase") return null;
  if (actor.source !== "supabase") {
    return intentErr<T>(
      "unauthenticated",
      "supabase_mode_requires_auth_bound_actor",
    );
  }
  return intentErr<T>("internal", "supabase_runtime_not_yet_wired");
}

// --------------------------------------------------------------
// Error mapping helper — translates the chat intake domain errors
// into typed `IntentResult` codes. Stack traces and internal
// messages never reach the client.
// --------------------------------------------------------------

function mapChatIntakeError<T>(err: unknown): IntentResult<T> | null {
  if (err instanceof OwnershipError) {
    return intentErr(
      "ownership",
      "actor cannot access this intake session",
    );
  }
  if (err instanceof ChatIntakeInputError) {
    switch (err.code) {
      case "session_not_found":
        return intentErr("not_found", "intake session not found");
      case "message_empty":
      case "message_too_long":
        return intentErr("input", err.code);
      case "session_already_finalized":
        return intentErr("conflict", "session already produced a draft");
      default:
        return intentErr("internal", "chat_intake_unknown");
    }
  }
  return null;
}

// --------------------------------------------------------------
// Action 1: start an intake session.
//
// No payload (an empty object). The session is stamped with the
// resolved actor's seller id and persisted.
// --------------------------------------------------------------

export async function startIntakeSessionAction(): Promise<
  IntentResult<StartIntakeSessionResult>
> {
  return runIntentCommand<StartIntakeSessionPayload, StartIntakeSessionResult>(
    async ({ actor }) => {
      if (actor.kind !== "seller") {
        return intentErr("ownership", "only sellers can start intake");
      }
      const gated = assertSupabaseAuthority<StartIntakeSessionResult>(actor);
      if (gated) return gated;
      try {
        const session = await chatListingIntakeService.startSession(
          actor.sellerId,
        );
        return intentOk({ session });
      } catch (err) {
        return (
          mapChatIntakeError<StartIntakeSessionResult>(err) ??
          intentErr("internal", "start_intake_failed")
        );
      }
    },
    {} as StartIntakeSessionPayload,
    { expectedActorKind: "seller" },
  );
}

// --------------------------------------------------------------
// Action 2: append a seller message to an existing session.
//
// Payload is `{ sessionId, content }` only. `actorSellerId` is
// resolved server-side. The underlying service still runs the
// `assertSessionOwnedBy` guard against the canonical session row.
// --------------------------------------------------------------

export async function appendIntakeSellerMessageAction(
  payload: AppendIntakeSellerMessagePayload,
): Promise<IntentResult<AppendIntakeSellerMessageResult>> {
  return runIntentCommand<
    AppendIntakeSellerMessagePayload,
    AppendIntakeSellerMessageResult
  >(
    async ({ actor, payload }) => {
      if (actor.kind !== "seller") {
        return intentErr("ownership", "only sellers can append intake");
      }
      const gated = assertSupabaseAuthority<AppendIntakeSellerMessageResult>(
        actor,
      );
      if (gated) return gated;
      if (
        typeof payload.sessionId !== "string" ||
        payload.sessionId.length === 0
      ) {
        return intentErr("input", "sessionId required");
      }
      if (typeof payload.content !== "string") {
        return intentErr("input", "content required");
      }
      try {
        const result = await chatListingIntakeService.appendSellerMessage(
          payload.sessionId,
          actor.sellerId,
          payload.content,
        );
        return intentOk(result);
      } catch (err) {
        return (
          mapChatIntakeError<AppendIntakeSellerMessageResult>(err) ??
          intentErr("internal", "append_intake_failed")
        );
      }
    },
    payload,
    { expectedActorKind: "seller" },
  );
}

// --------------------------------------------------------------
// Action 3: create a private ListingIntent draft from the session.
//
// Payload is `{ sessionId }` only. The draft is owned by the
// resolved actor's seller id, regardless of any caller-supplied
// id (which the payload type forbids).
// --------------------------------------------------------------

export async function createIntakeListingDraftAction(
  payload: CreateIntakeListingDraftPayload,
): Promise<IntentResult<CreateIntakeListingDraftResult>> {
  return runIntentCommand<
    CreateIntakeListingDraftPayload,
    CreateIntakeListingDraftResult
  >(
    async ({ actor, payload }) => {
      if (actor.kind !== "seller") {
        return intentErr("ownership", "only sellers can create drafts");
      }
      const gated = assertSupabaseAuthority<CreateIntakeListingDraftResult>(
        actor,
      );
      if (gated) return gated;
      if (
        typeof payload.sessionId !== "string" ||
        payload.sessionId.length === 0
      ) {
        return intentErr("input", "sessionId required");
      }
      try {
        const result =
          await chatListingIntakeService.createListingDraftFromIntake(
            payload.sessionId,
            actor.sellerId,
          );
        return intentOk(result);
      } catch (err) {
        return (
          mapChatIntakeError<CreateIntakeListingDraftResult>(err) ??
          intentErr("internal", "create_intake_draft_failed")
        );
      }
    },
    payload,
    { expectedActorKind: "seller" },
  );
}

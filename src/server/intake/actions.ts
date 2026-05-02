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
  createChatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";
import { getBackendMode } from "@/server/backend/mode";
import { getIntakeWriter } from "@/server/intake/intakeWriterDispatcher";
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
// Backend-mode safety + writer-dispatch seam.
//
// PR 4 replaces the PR 3 two-layer fail-closed helper with a
// single dispatcher call. `getIntakeWriter(actor)` returns:
//
//   - `localIntakeWriter` — in mock / default mode, regardless of
//     actor source. Wraps `getPersistence()`; behavior is identical
//     to pre-PR-4. The same-browser demo runs through this path.
//
//   - `null` — in supabase mode + mock-sourced actor. Mock identity
//     must never back a shared-DB write. Actions map `null` to the
//     same `unauthenticated` typed result PR 3 returned, preserving
//     the user-visible failure shape.
//
//   - `supabaseIntakeWriter` — in supabase mode + supabase-sourced
//     actor. Today this branch is unreachable from production
//     because `resolveServerActor` always returns a mock-sourced
//     actor; the resolver body swap is the prerequisite tracked
//     for PR 5.
//
// The action helper below maps the `null` case to a typed
// `unauthenticated` result. Throwing dispatch errors (write
// failures from the supabase writer) propagate to the runner's
// internal-throws-become-`internal` mapping; the runner does not
// leak stack traces to the client.
function intakeUnauthenticated<T>(): IntentResult<T> {
  return intentErr<T>(
    "unauthenticated",
    "supabase_mode_requires_auth_bound_actor",
  );
}

// Slice A PR 5D — split-brain guard for `createIntakeListingDraftAction`.
//
// The chat intake service's `createListingDraftFromIntake` step
// reads the session via the dispatched `IntakeWriter` (Supabase in
// supabase-mode + supabase actor) but writes the *listing draft*
// row through `getPersistence()` (local-only, even in supabase
// mode). Letting that path run end-to-end in supabase mode would
// produce a hybrid where:
//
//   - `listing_intake_sessions` row is in Supabase,
//   - `listing_intake_messages` rows are in Supabase,
//   - `listing_extractions` row is in Supabase,
//   - `session.listingIntentId` (Supabase) points at a listing
//     id that exists ONLY in localStorage.
//
// PR 5D forbids that combination. Until listing draft persistence
// is externalized in a later PR (with its own migrations + tests),
// `createIntakeListingDraftAction` fails closed in supabase mode
// AFTER auth and capability checks but BEFORE any intake read or
// write fires — so no partial state lands in Supabase either.
//
// The message is non-secret: no table names, no SQL, no env names,
// no service-role hints, no row payloads.
function intakeListingDraftUnsupportedInSupabase<T>(): IntentResult<T> {
  return intentErr<T>(
    "unsupported",
    "supabase_listing_draft_not_yet_wired",
  );
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
      const writer = getIntakeWriter(actor);
      if (!writer) return intakeUnauthenticated<StartIntakeSessionResult>();
      try {
        const service = createChatListingIntakeService(writer);
        const session = await service.startSession(actor.sellerId);
        return intentOk({ session });
      } catch (err) {
        return (
          mapChatIntakeError<StartIntakeSessionResult>(err) ??
          intentErr("internal", "start_intake_failed")
        );
      }
    },
    {} as StartIntakeSessionPayload,
    { expectedActorKind: "seller", prefer: "seller" },
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
      const writer = getIntakeWriter(actor);
      if (!writer) {
        return intakeUnauthenticated<AppendIntakeSellerMessageResult>();
      }
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
        const service = createChatListingIntakeService(writer);
        const result = await service.appendSellerMessage(
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
    { expectedActorKind: "seller", prefer: "seller" },
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
      const writer = getIntakeWriter(actor);
      if (!writer) {
        return intakeUnauthenticated<CreateIntakeListingDraftResult>();
      }
      // Split-brain guard (PR 5D). Fires AFTER the unauthenticated
      // gate so a mock-sourced actor in supabase mode still gets
      // the existing `unauthenticated` shape; only the
      // supabase-mode + supabase-sourced combination — the one
      // where the intake side would land in Supabase but the
      // listing draft would land in localStorage — hits this
      // branch. The check runs before any service call so no
      // partial state lands in Supabase.
      if (getBackendMode() === "supabase") {
        return intakeListingDraftUnsupportedInSupabase<CreateIntakeListingDraftResult>();
      }
      if (
        typeof payload.sessionId !== "string" ||
        payload.sessionId.length === 0
      ) {
        return intentErr("input", "sessionId required");
      }
      try {
        const service = createChatListingIntakeService(writer);
        const result = await service.createListingDraftFromIntake(
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
    { expectedActorKind: "seller", prefer: "seller" },
  );
}

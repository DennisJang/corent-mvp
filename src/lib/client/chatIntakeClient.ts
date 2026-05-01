// Client-side adapter for chat-to-listing intake.
//
// Why this seam exists:
//
//   - `getPersistence()` returns a `LocalStoragePersistenceAdapter`
//     in the browser and a `MemoryPersistenceAdapter` on the server.
//     If the chat intake card called the server actions directly,
//     intake writes would land in *server* memory while the seller
//     dashboard's `refresh()` read from *browser* localStorage. The
//     "초안이 저장됐어요" toast would fire while the dashboard rows
//     stayed empty — a misleading local demo.
//   - The boundary fix is to route the local demo through the
//     existing browser-local `chatListingIntakeService`, while the
//     server actions remain the future shared-server write path.
//   - This adapter is the *only* place that decides which mode to
//     use. The component never imports the server actions directly;
//     the future flip from local-mode to shared-server-mode is a
//     single edit here, not a sweep across every UI surface.
//
// Local-mode rules:
//
//   - Actor identity is resolved from the mock seller session in
//     this adapter, not in the component. The component cannot
//     pass `actorSellerId`.
//   - Errors map to the same `IntentResult` shape the server actions
//     return, so the component branches on `code` regardless of
//     mode.
//
// Shared-server mode (future):
//
//   - When CoRent ships shared persistence + auth, `localMode` flips
//     to false and each function delegates to the corresponding
//     `@/server/intake/actions` action. The action contract is
//     already designed for this — no payload shape change is
//     needed. See `src/server/intake/actions.ts` and the related
//     tests.

"use client";

import { getMockSellerSession } from "@/lib/auth/mockSession";
import { OwnershipError } from "@/lib/auth/guards";
import {
  ChatIntakeInputError,
  chatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";

// Re-export the typed-result shape so the UI never imports from
// `@/server/**` directly. The shape is identical to
// `@/server/intents/intentResult` by design — both modes hand the
// component the same envelope.
export type IntentErrorCode =
  | "unauthenticated"
  | "ownership"
  | "input"
  | "not_found"
  | "conflict"
  | "internal";

export type IntentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: IntentErrorCode; message: string };

function ok<T>(value: T): IntentResult<T> {
  return { ok: true, value };
}
function err<T = never>(code: IntentErrorCode, message: string): IntentResult<T> {
  return { ok: false, code, message };
}

// LOCAL-DEMO-MODE-FLAG. Today CoRent runs entirely in one browser
// profile; the chat intake writes belong in browser localStorage so
// the seller dashboard sees them. When shared persistence + auth
// land, this flag flips to false and each helper below delegates to
// `@/server/intake/actions`. Until then, the server actions stay
// available (and tested) but are not on the demo path.
const SHARED_SERVER_MODE = false;

function resolveLocalSellerId(): string | null {
  // The mock session is the local-mode actor source. When the demo
  // flips to shared-server mode, this branch goes away entirely;
  // the server resolver (`resolveServerActor`) becomes the single
  // identity seam.
  const session = getMockSellerSession();
  return session?.sellerId ?? null;
}

function mapError<T>(e: unknown): IntentResult<T> {
  if (e instanceof OwnershipError) {
    return err("ownership", "actor cannot access this intake session");
  }
  if (e instanceof ChatIntakeInputError) {
    switch (e.code) {
      case "session_not_found":
        return err("not_found", "intake session not found");
      case "message_empty":
      case "message_too_long":
        return err("input", e.code);
      case "session_already_finalized":
        return err("conflict", "session already produced a draft");
    }
  }
  return err("internal", "chat_intake_failed");
}

// --------------------------------------------------------------
// Public API — the component imports only these.
// --------------------------------------------------------------

export type StartIntakeSessionResult = {
  session: Awaited<ReturnType<typeof chatListingIntakeService.startSession>>;
};

export type AppendSellerMessageResult = Awaited<
  ReturnType<typeof chatListingIntakeService.appendSellerMessage>
>;

export type CreateListingDraftResult = Awaited<
  ReturnType<typeof chatListingIntakeService.createListingDraftFromIntake>
>;

export async function startIntakeSession(): Promise<
  IntentResult<StartIntakeSessionResult>
> {
  if (SHARED_SERVER_MODE) {
    // FUTURE: replace with `await startIntakeSessionAction()` from
    // `@/server/intake/actions`. The action contract already
    // matches this signature.
    return err("internal", "shared_server_mode_not_wired");
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  try {
    const session = await chatListingIntakeService.startSession(sellerId);
    return ok({ session });
  } catch (e) {
    return mapError(e);
  }
}

export async function appendSellerMessage(payload: {
  sessionId: string;
  content: string;
}): Promise<IntentResult<AppendSellerMessageResult>> {
  if (SHARED_SERVER_MODE) {
    return err("internal", "shared_server_mode_not_wired");
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  if (typeof payload.sessionId !== "string" || payload.sessionId.length === 0) {
    return err("input", "sessionId required");
  }
  if (typeof payload.content !== "string") {
    return err("input", "content required");
  }
  try {
    const result = await chatListingIntakeService.appendSellerMessage(
      payload.sessionId,
      sellerId,
      payload.content,
    );
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

export async function createListingDraft(payload: {
  sessionId: string;
}): Promise<IntentResult<CreateListingDraftResult>> {
  if (SHARED_SERVER_MODE) {
    return err("internal", "shared_server_mode_not_wired");
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  if (typeof payload.sessionId !== "string" || payload.sessionId.length === 0) {
    return err("input", "sessionId required");
  }
  try {
    const result =
      await chatListingIntakeService.createListingDraftFromIntake(
        payload.sessionId,
        sellerId,
      );
    return ok(result);
  } catch (e) {
    return mapError(e);
  }
}

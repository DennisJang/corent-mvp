// Client-side adapter for chat-to-listing intake.
//
// Slice A PR 5F replaced the static `SHARED_SERVER_MODE` flag with a
// **server-side mode probe**. The browser chat intake card calls
// `probeChatIntakeMode()` once at mount; the result becomes the
// adapter's `activeMode`. Subsequent calls dispatch to either the
// browser-local `chatListingIntakeService` (the same-browser demo)
// or the server-backed actions in `@/server/intake/actions`,
// depending on what the probe returned.
//
// Why this seam exists:
//
//   - `getPersistence()` returns a `LocalStoragePersistenceAdapter`
//     in the browser and a `MemoryPersistenceAdapter` on the server.
//     Without this adapter, intake writes would land in *server*
//     memory while the seller dashboard's `refresh()` read from
//     *browser* localStorage — a misleading "draft saved" toast.
//   - The server-backed dispatch path (PR 4 + PR 5D + PR 5E) is
//     fully implemented but only safe to call when the user is a
//     supabase-authenticated, founder-provisioned seller. The probe
//     decides; the client never tries to determine this on its own.
//
// Hard rules:
//
//   - Default to `local`. Until the probe resolves, the adapter
//     stays in `local` mode so a pre-probe call cannot accidentally
//     hit the server path.
//   - **No silent fallback** in `server` mode. If a server action
//     returns a typed failure or throws, the client surfaces the
//     typed error. The local service is NOT called as a backup.
//     A "saved" toast must mean what it says.
//   - The probe failure path defaults to `local` ONLY before any
//     write — that's the one acceptable fallback semantic.
//   - This module never imports from `@/server/backend/**` or
//     `@/server/persistence/**`. The mode decision lives entirely
//     inside the server-action probe.

"use client";

import { getMockSellerSession } from "@/lib/auth/mockSession";
import { OwnershipError } from "@/lib/auth/guards";
import {
  ChatIntakeInputError,
  chatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";
import {
  getChatIntakeModeAction,
  type ChatIntakeModeResult,
} from "@/server/intake/getChatIntakeMode";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
} from "@/server/intake/actions";

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
  | "unsupported"
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

// --------------------------------------------------------------
// Mode state.
//
// `activeMode` is the cached probe result. Default is `"local"`
// — every adapter call before a successful probe routes to the
// local service. The probe can transition this to `"server"` only
// once, and only via `probeChatIntakeMode()`.
//
// `_resetChatIntakeModeForTests` is the test seam. Production code
// must not import it.
// --------------------------------------------------------------

type ActiveMode = "local" | "server";

// Module-level cache. `activeMode` decides which dispatch path
// every call below takes. The component reads `capability` from
// the probe's return value, not from this module — capability is a
// UI hint, not a dispatch signal, and storing it here would create
// a redundant cache to keep in sync.
let activeMode: ActiveMode = "local";
let probeResolved: Promise<ChatIntakeModeResult> | null = null;

export function _resetChatIntakeModeForTests(): void {
  activeMode = "local";
  probeResolved = null;
}

// Single-flight probe. Concurrent callers awaiting the probe see
// the same in-flight Promise; subsequent callers see the cached
// result. On any throw the adapter stays in `"local"` mode so the
// component still renders a working UI.
export async function probeChatIntakeMode(): Promise<ChatIntakeModeResult> {
  if (probeResolved) return probeResolved;
  probeResolved = (async () => {
    try {
      const result = await getChatIntakeModeAction();
      activeMode = result.mode === "server" ? "server" : "local";
      return result;
    } catch {
      // Probe-failure fallback — applies BEFORE any data is
      // written. Safe because the adapter has not yet committed
      // to the server path. After a successful probe, server-mode
      // failures DO NOT fall back here.
      activeMode = "local";
      return { mode: "local" } as ChatIntakeModeResult;
    }
  })();
  return probeResolved;
}

function resolveLocalSellerId(): string | null {
  // The mock session is the local-mode actor source. Server mode
  // resolves the actor server-side via `resolveServerActor`; the
  // server actions never trust a client-supplied seller id.
  const session = getMockSellerSession();
  return session?.sellerId ?? null;
}

function mapLocalError<T>(e: unknown): IntentResult<T> {
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

// In server mode an action throw is wrapped to the same typed
// shape, but we DO NOT call the local service afterwards. The
// envelope tells the user the server attempt failed; nothing was
// saved locally as a side-effect.
function mapServerThrow<T>(): IntentResult<T> {
  return err("internal", "chat_intake_server_failed");
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
  if (activeMode === "server") {
    try {
      const result = await startIntakeSessionAction();
      // Server action returns IntentResult<StartIntakeSessionResult>
      // already; pass through unchanged.
      return result as IntentResult<StartIntakeSessionResult>;
    } catch {
      return mapServerThrow<StartIntakeSessionResult>();
    }
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  try {
    const session = await chatListingIntakeService.startSession(sellerId);
    return ok({ session });
  } catch (e) {
    return mapLocalError(e);
  }
}

export async function appendSellerMessage(payload: {
  sessionId: string;
  content: string;
}): Promise<IntentResult<AppendSellerMessageResult>> {
  if (typeof payload.sessionId !== "string" || payload.sessionId.length === 0) {
    return err("input", "sessionId required");
  }
  if (typeof payload.content !== "string") {
    return err("input", "content required");
  }
  if (activeMode === "server") {
    try {
      const result = await appendIntakeSellerMessageAction({
        sessionId: payload.sessionId,
        content: payload.content,
      });
      return result as IntentResult<AppendSellerMessageResult>;
    } catch {
      return mapServerThrow<AppendSellerMessageResult>();
    }
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  try {
    const result = await chatListingIntakeService.appendSellerMessage(
      payload.sessionId,
      sellerId,
      payload.content,
    );
    return ok(result);
  } catch (e) {
    return mapLocalError(e);
  }
}

export async function createListingDraft(payload: {
  sessionId: string;
}): Promise<IntentResult<CreateListingDraftResult>> {
  if (typeof payload.sessionId !== "string" || payload.sessionId.length === 0) {
    return err("input", "sessionId required");
  }
  if (activeMode === "server") {
    try {
      const result = await createIntakeListingDraftAction({
        sessionId: payload.sessionId,
      });
      return result as IntentResult<CreateListingDraftResult>;
    } catch {
      return mapServerThrow<CreateListingDraftResult>();
    }
  }
  const sellerId = resolveLocalSellerId();
  if (!sellerId) return err("unauthenticated", "no actor");
  try {
    const result =
      await chatListingIntakeService.createListingDraftFromIntake(
        payload.sessionId,
        sellerId,
      );
    return ok(result);
  } catch (e) {
    return mapLocalError(e);
  }
}

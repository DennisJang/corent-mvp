// Chat-to-listing intake service. The seller describes an item in a
// chat-style flow; this service stores the session and messages,
// runs the deterministic local extractor, and (when the seller
// confirms) creates a private `ListingIntent` draft using the
// existing listing service patterns.
//
// Hard rules — read before editing:
//
//   - `actorSellerId` is the only authorization signal. It is stamped
//     on the IntakeSession at create time and verified on every
//     subsequent write. A caller-supplied `sellerId` field is never
//     trusted; the service derives ownership from `actorSellerId`.
//   - The service never publishes anything. Created listing drafts
//     are stored at status `"draft"` (the same status produced by
//     `listingService.saveDraft`); approval / public projection is
//     unchanged and continues to require the existing approved-status
//     gate inside `publicListingService`.
//   - No external AI / LLM call. No network. The extractor is fully
//     local and synchronous.
//   - Raw chat text is private. It is never copied into PublicListing
//     (the projection layer has its own explicit allowlist) and the
//     service does not surface message bodies on any renter-facing
//     route.

import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import type { ListingIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";
import {
  buildAssistantSummary,
  extractIntake,
} from "@/lib/services/chatIntakeExtractor";
import { listingService } from "@/lib/services/listingService";

// 2,000 chars matches the listing validator's `RAW_INPUT_MAX`. Caller
// is expected to surface a friendly Korean copy string.
const SELLER_MESSAGE_MAX = 2000;

export class ChatIntakeInputError extends Error {
  readonly code:
    | "session_not_found"
    | "message_empty"
    | "message_too_long"
    | "session_already_finalized";
  constructor(code: ChatIntakeInputError["code"], message: string) {
    super(message);
    this.name = "ChatIntakeInputError";
    this.code = code;
  }
}

function assertSessionOwnedBy(
  session: Pick<IntakeSession, "id" | "sellerId">,
  actorSellerId: string,
): void {
  if (!actorSellerId || session.sellerId !== actorSellerId) {
    // Reuse OwnershipError so callers can branch with the same error
    // class they already use for listing / rental ownership mismatches.
    throw new OwnershipError(
      "listing_owner_mismatch",
      `Caller is not the owner of intake session ${session.id}.`,
    );
  }
}

export type AppendSellerMessageResult = {
  session: IntakeSession;
  sellerMessage: IntakeMessage;
  assistantMessage: IntakeMessage;
  extraction: IntakeExtraction;
};

export const chatListingIntakeService = {
  async startSession(actorSellerId: string): Promise<IntakeSession> {
    if (!actorSellerId) {
      throw new OwnershipError(
        "listing_owner_mismatch",
        "Cannot start an intake session without an actor seller id.",
      );
    }
    const at = nowIso();
    const session: IntakeSession = {
      id: generateId("isn"),
      // Canonical sellerId comes from the actor — never from a caller-
      // supplied field.
      sellerId: actorSellerId,
      status: "drafting",
      createdAt: at,
      updatedAt: at,
    };
    await getPersistence().saveIntakeSession(session);
    return session;
  },

  async getSession(sessionId: string): Promise<IntakeSession | null> {
    if (typeof sessionId !== "string" || sessionId.length === 0) return null;
    return getPersistence().getIntakeSession(sessionId);
  },

  async listSessionsForSeller(
    actorSellerId: string,
  ): Promise<IntakeSession[]> {
    if (!actorSellerId) return [];
    const all = await getPersistence().listIntakeSessions();
    return all.filter((s) => s.sellerId === actorSellerId);
  },

  async listMessages(sessionId: string): Promise<IntakeMessage[]> {
    if (typeof sessionId !== "string" || sessionId.length === 0) return [];
    return getPersistence().listIntakeMessagesForSession(sessionId);
  },

  async getExtraction(sessionId: string): Promise<IntakeExtraction | null> {
    if (typeof sessionId !== "string" || sessionId.length === 0) return null;
    return getPersistence().getIntakeExtractionForSession(sessionId);
  },

  // Append a single seller message and synthesize an assistant
  // summary + extraction from it. The skeleton phase treats every
  // call as a one-shot extraction over the latest seller message;
  // future iterations can fold prior messages into context.
  async appendSellerMessage(
    sessionId: string,
    actorSellerId: string,
    content: string,
  ): Promise<AppendSellerMessageResult> {
    const persistence = getPersistence();
    const session = await persistence.getIntakeSession(sessionId);
    if (!session) {
      throw new ChatIntakeInputError(
        "session_not_found",
        `intake session ${sessionId} not found`,
      );
    }
    assertSessionOwnedBy(session, actorSellerId);
    if (session.status === "draft_created") {
      throw new ChatIntakeInputError(
        "session_already_finalized",
        `intake session ${sessionId} already produced a draft`,
      );
    }
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (trimmed.length === 0) {
      throw new ChatIntakeInputError(
        "message_empty",
        "seller message must be non-empty",
      );
    }
    if (trimmed.length > SELLER_MESSAGE_MAX) {
      throw new ChatIntakeInputError(
        "message_too_long",
        `seller message must be <= ${SELLER_MESSAGE_MAX} chars`,
      );
    }

    const at = nowIso();
    const sellerMessage: IntakeMessage = {
      id: generateId("imsg"),
      sessionId,
      role: "seller",
      content: trimmed,
      createdAt: at,
    };
    await persistence.appendIntakeMessage(sellerMessage);

    const extraction = extractIntake({
      sessionId,
      text: trimmed,
      at,
    });
    await persistence.saveIntakeExtraction(extraction);

    const assistantMessage: IntakeMessage = {
      id: generateId("imsg"),
      sessionId,
      role: "assistant",
      content: buildAssistantSummary(extraction),
      createdAt: at,
    };
    await persistence.appendIntakeMessage(assistantMessage);

    const updatedSession: IntakeSession = {
      ...session,
      // The session stays in `drafting` until the seller confirms a
      // draft; an extraction alone never finalizes it.
      status: "drafting",
      updatedAt: at,
    };
    await persistence.saveIntakeSession(updatedSession);

    return {
      session: updatedSession,
      sellerMessage,
      assistantMessage,
      extraction,
    };
  },

  // Create a private ListingIntent draft from the most recent
  // extraction. Reuses `listingService.draftFromInput` (which builds
  // a verification subtree, computes the recommended price table,
  // and stamps the seller-input string) and `listingService.saveDraft`
  // (which validates and persists). The resulting listing has
  // `status === "draft"` — never `"approved"`. PublicListing
  // projection is unchanged and continues to filter out any non-
  // approved row.
  async createListingDraftFromIntake(
    sessionId: string,
    actorSellerId: string,
  ): Promise<{ session: IntakeSession; listing: ListingIntent }> {
    const persistence = getPersistence();
    const session = await persistence.getIntakeSession(sessionId);
    if (!session) {
      throw new ChatIntakeInputError(
        "session_not_found",
        `intake session ${sessionId} not found`,
      );
    }
    assertSessionOwnedBy(session, actorSellerId);
    if (session.status === "draft_created" && session.listingIntentId) {
      // Idempotent: re-loading an already-finalized session returns
      // the existing draft.
      const existing = await persistence.getListingIntent(
        session.listingIntentId,
      );
      if (existing) return { session, listing: existing };
    }

    const messages = await persistence.listIntakeMessagesForSession(sessionId);
    const sellerText = messages
      .filter((m) => m.role === "seller")
      .map((m) => m.content)
      .join("\n");
    const extraction =
      (await persistence.getIntakeExtractionForSession(sessionId)) ??
      extractIntake({ sessionId, text: sellerText });

    // Build the draft via the existing listing service. `actorSellerId`
    // is the only seller id ever passed downstream; the session's
    // own `sellerId` was already stamped from the actor at start
    // time, but we re-pin from the actor here as defense in depth.
    const initial = listingService.draftFromInput({
      sellerId: actorSellerId,
      rawInput: sellerText,
      fallbackCategory: extraction.category ?? "massage_gun",
      fallbackEstimatedValue: extraction.estimatedValue ?? 200_000,
    });

    // Layer the extracted fields the AI parser inside
    // `draftFromInput` may have missed (the chat extractor is more
    // permissive about pickup-area detection). `applyEdits` ignores
    // any unknown field, so passing an empty patch when nothing was
    // extracted is safe.
    const merged = listingService.applyEdits(initial, {
      itemName: extraction.itemName,
      category: extraction.category,
      condition: extraction.condition,
      pickupArea: extraction.pickupArea,
      defects: extraction.defects,
      components: extraction.components,
      estimatedValue: extraction.estimatedValue,
    });

    // `saveDraft` validates and transitions ai_extracted → draft. The
    // listing is owned by `actorSellerId` regardless of what the
    // session record holds.
    const persisted: ListingIntent = {
      ...merged,
      sellerId: actorSellerId,
    };
    await listingService.saveDraft(persisted);
    // saveDraft writes status: "draft" — read it back so the caller
    // gets the canonical record.
    const reloaded =
      (await persistence.getListingIntent(persisted.id)) ?? persisted;

    const updatedSession: IntakeSession = {
      ...session,
      status: "draft_created",
      listingIntentId: reloaded.id,
      updatedAt: nowIso(),
    };
    await persistence.saveIntakeSession(updatedSession);

    return { session: updatedSession, listing: reloaded };
  },
};

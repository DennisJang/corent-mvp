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
import { nowIso } from "@/lib/ids";
import {
  localIntakeWriter,
  type IntakeWriter,
} from "@/lib/intake/intakeWriter";
import {
  localListingDraftWriter,
  type ListingDraftWriter,
} from "@/lib/intake/listingDraftWriter";
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

export type ChatListingIntakeService = {
  startSession(actorSellerId: string): Promise<IntakeSession>;
  getSession(sessionId: string): Promise<IntakeSession | null>;
  listSessionsForSeller(actorSellerId: string): Promise<IntakeSession[]>;
  listMessages(sessionId: string): Promise<IntakeMessage[]>;
  getExtraction(sessionId: string): Promise<IntakeExtraction | null>;
  appendSellerMessage(
    sessionId: string,
    actorSellerId: string,
    content: string,
  ): Promise<AppendSellerMessageResult>;
  createListingDraftFromIntake(
    sessionId: string,
    actorSellerId: string,
  ): Promise<{ session: IntakeSession; listing: ListingIntent }>;
};

// Factory — Slice A PR 4 / PR 5E. Every persistence call goes
// through one of two pluggable writers:
//
//   - `IntakeWriter` (PR 4) — chat intake session / messages /
//     extraction.
//   - `ListingDraftWriter` (PR 5E) — listing draft id allocation,
//     save, and read by id.
//
// The default writers are `localIntakeWriter` + `localListingDraftWriter`,
// both of which wrap the same `getPersistence()` calls the service
// used pre-PR-5E. The default const-export
// (`chatListingIntakeService`) therefore preserves byte-identical
// behavior for every existing caller (chat intake card, tests,
// etc.).
//
// PR 5E removes the last `getPersistence()` listing-side calls
// from `createListingDraftFromIntake`. Both sides of the
// chat-to-listing transaction now route through the same
// dispatcher decision (mock vs supabase, mock-actor vs
// supabase-actor), eliminating the split-brain hole PR 5D's
// `unsupported` guard placeholdered.
export function createChatListingIntakeService(
  writer: IntakeWriter = localIntakeWriter,
  listingDraftWriter: ListingDraftWriter = localListingDraftWriter,
): ChatListingIntakeService {
  return {
    async startSession(actorSellerId: string): Promise<IntakeSession> {
      if (!actorSellerId) {
        throw new OwnershipError(
          "listing_owner_mismatch",
          "Cannot start an intake session without an actor seller id.",
        );
      }
      const at = nowIso();
      const session: IntakeSession = {
        // Id format follows the writer (local: `isn_<16hex>`,
        // supabase: `crypto.randomUUID()` — required by the Phase 2
        // schema's uuid PK).
        id: writer.newSessionId(),
        // Canonical sellerId comes from the actor — never from a caller-
        // supplied field.
        sellerId: actorSellerId,
        status: "drafting",
        createdAt: at,
        updatedAt: at,
      };
      await writer.saveIntakeSession(session);
      return session;
    },

    async getSession(sessionId: string): Promise<IntakeSession | null> {
      if (typeof sessionId !== "string" || sessionId.length === 0) return null;
      return writer.getIntakeSession(sessionId);
    },

    async listSessionsForSeller(
      actorSellerId: string,
    ): Promise<IntakeSession[]> {
      if (!actorSellerId) return [];
      const all = await writer.listIntakeSessions();
      return all.filter((s) => s.sellerId === actorSellerId);
    },

    async listMessages(sessionId: string): Promise<IntakeMessage[]> {
      if (typeof sessionId !== "string" || sessionId.length === 0) return [];
      return writer.listIntakeMessagesForSession(sessionId);
    },

    async getExtraction(sessionId: string): Promise<IntakeExtraction | null> {
      if (typeof sessionId !== "string" || sessionId.length === 0) return null;
      return writer.getIntakeExtractionForSession(sessionId);
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
      const session = await writer.getIntakeSession(sessionId);
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
        id: writer.newMessageId(),
        sessionId,
        role: "seller",
        content: trimmed,
        createdAt: at,
      };
      await writer.appendIntakeMessage(sellerMessage);

      const extraction = extractIntake({
        sessionId,
        text: trimmed,
        at,
      });
      await writer.saveIntakeExtraction(extraction);

      const assistantMessage: IntakeMessage = {
        id: writer.newMessageId(),
        sessionId,
        role: "assistant",
        content: buildAssistantSummary(extraction),
        createdAt: at,
      };
      await writer.appendIntakeMessage(assistantMessage);

      const updatedSession: IntakeSession = {
        ...session,
        // The session stays in `drafting` until the seller confirms a
        // draft; an extraction alone never finalizes it.
        status: "drafting",
        updatedAt: at,
      };
      await writer.saveIntakeSession(updatedSession);

      return {
        session: updatedSession,
        sellerMessage,
        assistantMessage,
        extraction,
      };
    },

    // Create a private ListingIntent draft from the most recent
    // extraction. Reuses `listingService.draftFromInput` (which
    // builds a verification subtree, computes the recommended
    // price table, and stamps the seller-input string) and the
    // pluggable `ListingDraftWriter` (which validates + persists
    // and mirrors the `ai_extracted → draft` transition). The
    // resulting listing has `status === "draft"` — never
    // `"approved"`. PublicListing projection is unchanged and
    // continues to filter out any non-approved row.
    //
    // PR 5E: every listing-side read/write goes through
    // `listingDraftWriter`. There is no `getPersistence()` call
    // anywhere in this method. The writer's local variant
    // delegates to the previous `listingService.saveDraft` +
    // `getPersistence().getListingIntent` calls so the same-browser
    // demo stays byte-identical; the supabase variant routes
    // through `saveListing` + `getListingById`.
    async createListingDraftFromIntake(
      sessionId: string,
      actorSellerId: string,
    ): Promise<{ session: IntakeSession; listing: ListingIntent }> {
      const session = await writer.getIntakeSession(sessionId);
      if (!session) {
        throw new ChatIntakeInputError(
          "session_not_found",
          `intake session ${sessionId} not found`,
        );
      }
      assertSessionOwnedBy(session, actorSellerId);
      if (session.status === "draft_created" && session.listingIntentId) {
        // Idempotent: re-loading an already-finalized session returns
        // the existing draft. The writer's `getListingIntent` returns
        // the canonical record from whichever store the listing was
        // saved to.
        const existing = await listingDraftWriter.getListingIntent(
          session.listingIntentId,
        );
        if (existing) return { session, listing: existing };
      }

      const messages = await writer.listIntakeMessagesForSession(sessionId);
      const sellerText = messages
        .filter((m) => m.role === "seller")
        .map((m) => m.content)
        .join("\n");
      const extraction =
        (await writer.getIntakeExtractionForSession(sessionId)) ??
        extractIntake({ sessionId, text: sellerText });

      // Build the draft via the existing listing service. `actorSellerId`
      // is the only seller id ever passed downstream; the session's
      // own `sellerId` was already stamped from the actor at start
      // time, but we re-pin from the actor here as defense in depth.
      // PR 5E: the listing id is allocated by the writer so the
      // format matches the eventual save target (`li_<16hex>` in
      // local mode; uuid in supabase mode).
      const initial = listingService.draftFromInput({
        sellerId: actorSellerId,
        rawInput: sellerText,
        fallbackCategory: extraction.category ?? "massage_gun",
        fallbackEstimatedValue: extraction.estimatedValue ?? 200_000,
        id: listingDraftWriter.newDraftId(),
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

      // The listing is owned by `actorSellerId` regardless of what
      // the session record holds. `saveListingDraft` validates +
      // mirrors the `ai_extracted → draft` transition (local
      // delegates to `listingService.saveDraft`; supabase does the
      // transition explicitly inside the writer).
      const persisted: ListingIntent = {
        ...merged,
        sellerId: actorSellerId,
      };
      await listingDraftWriter.saveListingDraft(persisted);
      // Read back so the caller gets the canonical record (status
      // moved to `'draft'`, verification.id may have been replaced
      // with a server-generated uuid in supabase mode).
      const reloaded =
        (await listingDraftWriter.getListingIntent(persisted.id)) ?? persisted;

      const updatedSession: IntakeSession = {
        ...session,
        status: "draft_created",
        listingIntentId: reloaded.id,
        updatedAt: nowIso(),
      };
      await writer.saveIntakeSession(updatedSession);

      return { session: updatedSession, listing: reloaded };
    },
  };
}

// Default const for the same-browser demo path. Existing callers
// (`chatIntakeClient.ts`, the chat intake action that needs the
// local writer, every test that imports the const) keep working
// with no signature change. Behavior is byte-identical to pre-PR-4
// because `localIntakeWriter` is a thin pass-through to
// `getPersistence()` — the same call the service made directly
// before this refactor.
export const chatListingIntakeService: ChatListingIntakeService =
  createChatListingIntakeService();

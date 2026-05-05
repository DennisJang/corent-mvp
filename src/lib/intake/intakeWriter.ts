// IntakeWriter — the pluggable persistence seam for chat-to-listing
// intake records.
//
// This module is browser-safe. It does not import from
// `@/server/**` and may be used by both the chat intake service
// (which is reachable from the browser through the client adapter
// at `src/lib/client/chatIntakeClient.ts`) and from server-only
// code (the chat intake server actions and the future Supabase
// dispatcher).
//
// Slice A, PR 4 introduces this seam without changing default
// behavior. The default writer (`localIntakeWriter`) is a thin
// pass-through to `getPersistence()`, which is the same path the
// service has used since chat intake landed (`64e21a9`). The
// Supabase-backed writer lives in `src/server/intake/` and is
// returned only by the dispatcher when an auth-bound actor is
// resolved — a path that is unreachable from production today.
//
// Hard rules:
//
//   - The interface covers ONLY chat intake methods. Cross-cut
//     concerns (listing reads / writes from
//     `createListingDraftFromIntake`) intentionally remain on
//     `getPersistence()`. Extending the writer to listings is a
//     later slice.
//   - Saves return `Promise<void>`. A writer that fails MUST throw;
//     callers expect either resolution or a thrown error so the
//     existing service-layer try/catch + ChatIntakeInputError
//     mapping continues to work. The Supabase writer adapts the
//     repository's `RepoResult` shape into this contract.
//   - Reads return the same shape the service expected from
//     `getPersistence()` (domain types, never raw rows).

import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId } from "@/lib/ids";

export interface IntakeWriter {
  // Mint a new id for a session / message. The local writer keeps
  // the existing `isn_<16hex>` / `imsg_<16hex>` shapes; the supabase
  // writer returns `crypto.randomUUID()` because the Phase 2 schema
  // requires uuid PKs on `listing_intake_sessions.id` and
  // `listing_intake_messages.id`. Mirrors
  // `ListingDraftWriter.newDraftId()`.
  newSessionId(): string;
  newMessageId(): string;
  saveIntakeSession(session: IntakeSession): Promise<void>;
  getIntakeSession(id: string): Promise<IntakeSession | null>;
  listIntakeSessions(): Promise<IntakeSession[]>;
  appendIntakeMessage(message: IntakeMessage): Promise<void>;
  listIntakeMessagesForSession(sessionId: string): Promise<IntakeMessage[]>;
  saveIntakeExtraction(extraction: IntakeExtraction): Promise<void>;
  getIntakeExtractionForSession(
    sessionId: string,
  ): Promise<IntakeExtraction | null>;
}

// Default writer for local / same-browser demo mode.
//
// Delegates to `getPersistence()` which the existing
// `chatListingIntakeService` already calls — so threading this
// writer through the service produces byte-identical behavior in
// the local demo. In the browser, `getPersistence()` returns
// `LocalStoragePersistenceAdapter`; in SSR / node tests it returns
// `MemoryPersistenceAdapter`.
export const localIntakeWriter: IntakeWriter = {
  newSessionId(): string {
    return generateId("isn");
  },
  newMessageId(): string {
    return generateId("imsg");
  },
  async saveIntakeSession(session) {
    await getPersistence().saveIntakeSession(session);
  },
  async getIntakeSession(id) {
    return getPersistence().getIntakeSession(id);
  },
  async listIntakeSessions() {
    return getPersistence().listIntakeSessions();
  },
  async appendIntakeMessage(message) {
    await getPersistence().appendIntakeMessage(message);
  },
  async listIntakeMessagesForSession(sessionId) {
    return getPersistence().listIntakeMessagesForSession(sessionId);
  },
  async saveIntakeExtraction(extraction) {
    await getPersistence().saveIntakeExtraction(extraction);
  },
  async getIntakeExtractionForSession(sessionId) {
    return getPersistence().getIntakeExtractionForSession(sessionId);
  },
};

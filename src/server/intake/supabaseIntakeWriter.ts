// Supabase-backed IntakeWriter — server-only.
//
// Adapts the existing Supabase intake repository
// (`src/server/persistence/supabase/intakeRepository.ts`) to the
// `IntakeWriter` interface in `src/lib/intake/intakeWriter.ts`. The
// repository's write methods return a typed `RepoResult` shape;
// `IntakeWriter` write methods return `Promise<void>` and throw on
// failure. This file is the translation.
//
// Hard rules:
//
//   - Server-only. Imports from `@/server/persistence/supabase/`,
//     which is forbidden from `src/components/**` by the static
//     guard in `src/server/admin/import-boundary.test.ts` and the
//     ESLint `no-restricted-imports` rule.
//   - This module is NOT a service. It does not resolve actor
//     identity, does not enforce ownership, does not orchestrate
//     status transitions. The chat intake service still owns those
//     responsibilities; this writer is a swappable persistence
//     leg.
//   - PR 4 only puts the writer in place. The dispatcher returns
//     it only when `getBackendMode() === "supabase"` AND
//     `actor.source === "supabase"`. The latter is unreachable in
//     production today (`resolveServerActor` still produces a
//     mock-sourced actor), so this writer never runs against a
//     real Supabase client outside a test that explicitly mocks
//     both the resolver and the marketplace client.
//
// References:
//   - `src/lib/intake/intakeWriter.ts` — interface contract
//   - `src/server/persistence/supabase/intakeRepository.ts` —
//     row mappers + validators (PR 2)
//   - `src/server/intake/intakeWriterDispatcher.ts` — dispatcher
//   - `docs/phase2_marketplace_schema_draft.md` Slice A PR 4

import type { IntakeWriter } from "@/lib/intake/intakeWriter";
import {
  appendIntakeMessage,
  getIntakeExtractionForSession,
  getIntakeSession,
  listIntakeMessagesForSession,
  listIntakeSessions,
  saveIntakeExtraction,
  saveIntakeSession,
} from "@/server/persistence/supabase/intakeRepository";

// Typed write error so the chat intake service's existing
// try/catch can still map domain failures cleanly. The error code
// surfaces which repo method failed — useful for telemetry, but
// the message stays non-secret.
export class IntakeRepoWriteError extends Error {
  readonly code:
    | "save_intake_session_failed"
    | "append_intake_message_failed"
    | "save_intake_extraction_failed";
  constructor(
    code: IntakeRepoWriteError["code"],
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "IntakeRepoWriteError";
    this.code = code;
  }
}

export const supabaseIntakeWriter: IntakeWriter = {
  newSessionId(): string {
    // Phase 2 schema PKs `listing_intake_sessions.id` as `uuid`;
    // `validateUuid` in the marketplace validators rejects
    // anything else. Mirrors `supabaseListingDraftWriter.newDraftId`.
    return crypto.randomUUID();
  },
  newMessageId(): string {
    // Same uuid requirement on `listing_intake_messages.id`.
    return crypto.randomUUID();
  },
  async saveIntakeSession(session) {
    const r = await saveIntakeSession(session);
    if (!r.ok) {
      throw new IntakeRepoWriteError("save_intake_session_failed", r.error);
    }
  },
  async getIntakeSession(id) {
    return getIntakeSession(id);
  },
  async listIntakeSessions() {
    return listIntakeSessions();
  },
  async appendIntakeMessage(message) {
    const r = await appendIntakeMessage(message);
    if (!r.ok) {
      throw new IntakeRepoWriteError("append_intake_message_failed", r.error);
    }
  },
  async listIntakeMessagesForSession(sessionId) {
    return listIntakeMessagesForSession(sessionId);
  },
  async saveIntakeExtraction(extraction) {
    const r = await saveIntakeExtraction(extraction);
    if (!r.ok) {
      throw new IntakeRepoWriteError("save_intake_extraction_failed", r.error);
    }
  },
  async getIntakeExtractionForSession(sessionId) {
    return getIntakeExtractionForSession(sessionId);
  },
};

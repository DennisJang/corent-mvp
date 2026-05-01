// Persistence adapter interface. The current implementation uses
// localStorage; future implementations (Supabase, Postgres, etc.) can swap
// in without changing callers.

import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
import type { SellerProfileOverride } from "@/domain/sellers";
import type {
  ClaimReview,
  ClaimWindow,
  HandoffPhase,
  HandoffRecord,
  TrustEvent,
} from "@/domain/trust";

export interface PersistenceAdapter {
  // RentalIntent
  saveRentalIntent(intent: RentalIntent): Promise<void>;
  getRentalIntent(id: string): Promise<RentalIntent | null>;
  listRentalIntents(): Promise<RentalIntent[]>;
  deleteRentalIntent(id: string): Promise<void>;

  // ListingIntent
  saveListingIntent(intent: ListingIntent): Promise<void>;
  getListingIntent(id: string): Promise<ListingIntent | null>;
  listListingIntents(): Promise<ListingIntent[]>;

  // SearchIntent — most-recent only is persisted, for landing → search hand-off.
  saveSearchIntent(intent: SearchIntent): Promise<void>;
  getLatestSearchIntent(): Promise<SearchIntent | null>;
  listSearchIntents(): Promise<SearchIntent[]>;

  // RentalEvent (append-only lifecycle log)
  appendRentalEvent(event: RentalEvent): Promise<void>;
  listRentalEvents(rentalIntentId: string): Promise<RentalEvent[]>;

  // HandoffRecord — at most one record per (rentalIntentId, phase).
  // Save is upsert; missing rows return null. See
  // docs/corent_return_trust_layer.md §"Phase 1.3".
  saveHandoffRecord(record: HandoffRecord): Promise<void>;
  getHandoffRecord(
    rentalIntentId: string,
    phase: HandoffPhase,
  ): Promise<HandoffRecord | null>;
  listHandoffRecordsForRental(
    rentalIntentId: string,
  ): Promise<HandoffRecord[]>;

  // TrustEvent — append-only log of trust-relevant actions. Save is
  // upsert by id (idempotent re-saves are safe), but the service
  // layer treats this collection as append-only. There is no delete
  // here; only `clearAll` removes events. See
  // docs/corent_return_trust_layer.md §"Phase 1.4".
  saveTrustEvent(event: TrustEvent): Promise<void>;
  listTrustEventsForRental(rentalIntentId: string): Promise<TrustEvent[]>;
  listTrustEvents(): Promise<TrustEvent[]>;

  // ClaimWindow — at most one window per rental. Save is upsert by id;
  // the service layer keys lookups on `rentalIntentId`. See
  // docs/corent_return_trust_layer.md §"Phase 1.5".
  saveClaimWindow(window: ClaimWindow): Promise<void>;
  getClaimWindowForRental(rentalIntentId: string): Promise<ClaimWindow | null>;
  listClaimWindows(): Promise<ClaimWindow[]>;

  // ClaimReview — at most one review per rental in this skeleton phase.
  // Save is upsert by id. Reads are scoped per rental or global for the
  // admin queue.
  saveClaimReview(review: ClaimReview): Promise<void>;
  getClaimReview(id: string): Promise<ClaimReview | null>;
  listClaimReviewsForRental(rentalIntentId: string): Promise<ClaimReview[]>;
  listClaimReviews(): Promise<ClaimReview[]>;

  // SellerProfileOverride — at most one override per seller. Save is
  // upsert by `sellerId`. The static SELLERS fixture is never mutated;
  // overrides live entirely in this collection. See
  // docs/corent_return_trust_layer.md §"Phase 1.9".
  saveSellerProfileOverride(override: SellerProfileOverride): Promise<void>;
  getSellerProfileOverride(
    sellerId: string,
  ): Promise<SellerProfileOverride | null>;
  listSellerProfileOverrides(): Promise<SellerProfileOverride[]>;

  // Chat-to-listing intake (skeleton). Sessions are upserted by id;
  // messages are append-only per session; the extraction is upserted
  // by sessionId (one extraction per session in this skeleton phase).
  // See docs/corent_functional_mvp_intent_rules.md and the intake
  // service for the surrounding contract.
  saveIntakeSession(session: IntakeSession): Promise<void>;
  getIntakeSession(id: string): Promise<IntakeSession | null>;
  listIntakeSessions(): Promise<IntakeSession[]>;
  appendIntakeMessage(message: IntakeMessage): Promise<void>;
  listIntakeMessagesForSession(sessionId: string): Promise<IntakeMessage[]>;
  saveIntakeExtraction(extraction: IntakeExtraction): Promise<void>;
  getIntakeExtractionForSession(
    sessionId: string,
  ): Promise<IntakeExtraction | null>;

  // Wipe all CoRent-MVP-owned data. Used by the dashboard's "로컬 데이터
  // 비우기" affordance and by tests that need a clean slate.
  clearAll(): Promise<void>;
}

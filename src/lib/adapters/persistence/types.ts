// Persistence adapter interface. The current implementation uses
// localStorage; future implementations (Supabase, Postgres, etc.) can swap
// in without changing callers.

import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
import type {
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

  // Wipe all CoRent-MVP-owned data. Used by the dashboard's "로컬 데이터
  // 비우기" affordance and by tests that need a clean slate.
  clearAll(): Promise<void>;
}

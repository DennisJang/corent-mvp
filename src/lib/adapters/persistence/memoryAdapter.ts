// In-memory fallback. Used during SSR (no `window`) and as a base class
// the localStorage adapter extends.
//
// Phase 1.10 invariants:
//
//   - Clone on save and on read for every collection. The adapter
//     never returns a live reference to its internal state, so a
//     caller mutating a returned object (or a stored fixture) cannot
//     bypass service guards by editing the in-memory copy directly.
//     `structuredClone` is used because every persisted shape in this
//     module is plain JSON-serializable data.
//   - TrustEvent saves are append-only. Re-saving the same id throws
//     so the audit log cannot be silently overwritten.
//   - `deleteRentalIntent` cascades to handoffs, trust events, claim
//     windows, and claim reviews tied to the rental, matching the
//     localStorage adapter's behavior.

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
import type { PersistenceAdapter } from "./types";

// Composite key for handoff records: `${rentalIntentId}:${phase}`. The
// pair is the natural primary key — at most one record per phase per
// rental — and a flat Map keeps the memory adapter readable.
function handoffKey(rentalIntentId: string, phase: HandoffPhase): string {
  return `${rentalIntentId}:${phase}`;
}

// Defensive clone for stored / returned values. Falls back to the
// JSON round-trip when `structuredClone` is unavailable (older Node
// or constrained sandboxes). Every persisted shape in this module is
// plain JSON-serializable data, so the round-trip is faithful.
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  protected rentalIntents = new Map<string, RentalIntent>();
  protected listingIntents = new Map<string, ListingIntent>();
  protected searchIntents: SearchIntent[] = [];
  protected rentalEvents = new Map<string, RentalEvent[]>();
  protected handoffRecords = new Map<string, HandoffRecord>();
  protected trustEvents = new Map<string, TrustEvent>();
  protected claimWindows = new Map<string, ClaimWindow>();
  protected claimReviews = new Map<string, ClaimReview>();
  protected sellerProfileOverrides = new Map<string, SellerProfileOverride>();
  protected intakeSessions = new Map<string, IntakeSession>();
  protected intakeMessages = new Map<string, IntakeMessage[]>();
  protected intakeExtractions = new Map<string, IntakeExtraction>();

  async saveRentalIntent(intent: RentalIntent): Promise<void> {
    this.rentalIntents.set(intent.id, clone(intent));
  }
  async getRentalIntent(id: string): Promise<RentalIntent | null> {
    const found = this.rentalIntents.get(id);
    return found ? clone(found) : null;
  }
  async listRentalIntents(): Promise<RentalIntent[]> {
    return Array.from(this.rentalIntents.values()).map((v) => clone(v));
  }
  async deleteRentalIntent(id: string): Promise<void> {
    this.rentalIntents.delete(id);
    this.rentalEvents.delete(id);
    // Cascade to trust / admin / handoff records tied to this rental.
    for (const [k, v] of this.handoffRecords) {
      if (v.rentalIntentId === id) this.handoffRecords.delete(k);
    }
    for (const [k, v] of this.trustEvents) {
      if (v.rentalIntentId === id) this.trustEvents.delete(k);
    }
    for (const [k, v] of this.claimWindows) {
      if (v.rentalIntentId === id) this.claimWindows.delete(k);
    }
    for (const [k, v] of this.claimReviews) {
      if (v.rentalIntentId === id) this.claimReviews.delete(k);
    }
  }

  async saveListingIntent(intent: ListingIntent): Promise<void> {
    this.listingIntents.set(intent.id, clone(intent));
  }
  async getListingIntent(id: string): Promise<ListingIntent | null> {
    const found = this.listingIntents.get(id);
    return found ? clone(found) : null;
  }
  async listListingIntents(): Promise<ListingIntent[]> {
    return Array.from(this.listingIntents.values()).map((v) => clone(v));
  }

  async saveSearchIntent(intent: SearchIntent): Promise<void> {
    this.searchIntents.unshift(clone(intent));
    this.searchIntents = this.searchIntents.slice(0, 10);
  }
  async getLatestSearchIntent(): Promise<SearchIntent | null> {
    const head = this.searchIntents[0];
    return head ? clone(head) : null;
  }
  async listSearchIntents(): Promise<SearchIntent[]> {
    return this.searchIntents.map((v) => clone(v));
  }

  async appendRentalEvent(event: RentalEvent): Promise<void> {
    const list = this.rentalEvents.get(event.rentalIntentId) ?? [];
    list.push(clone(event));
    this.rentalEvents.set(event.rentalIntentId, list);
  }
  async listRentalEvents(rentalIntentId: string): Promise<RentalEvent[]> {
    return (this.rentalEvents.get(rentalIntentId) ?? []).map((v) => clone(v));
  }

  async saveHandoffRecord(record: HandoffRecord): Promise<void> {
    this.handoffRecords.set(
      handoffKey(record.rentalIntentId, record.phase),
      clone(record),
    );
  }
  async getHandoffRecord(
    rentalIntentId: string,
    phase: HandoffPhase,
  ): Promise<HandoffRecord | null> {
    const found = this.handoffRecords.get(handoffKey(rentalIntentId, phase));
    return found ? clone(found) : null;
  }
  async listHandoffRecordsForRental(
    rentalIntentId: string,
  ): Promise<HandoffRecord[]> {
    const out: HandoffRecord[] = [];
    for (const r of this.handoffRecords.values()) {
      if (r.rentalIntentId === rentalIntentId) out.push(clone(r));
    }
    return out;
  }

  async saveTrustEvent(event: TrustEvent): Promise<void> {
    // Phase 1.10: append-only. Re-saving an existing id is a service-
    // layer bug; throwing prevents silent audit corruption.
    if (this.trustEvents.has(event.id)) {
      throw new Error(`trust_event_duplicate_id: ${event.id}`);
    }
    this.trustEvents.set(event.id, clone(event));
  }
  async listTrustEventsForRental(rentalIntentId: string): Promise<TrustEvent[]> {
    const out: TrustEvent[] = [];
    for (const e of this.trustEvents.values()) {
      if (e.rentalIntentId === rentalIntentId) out.push(clone(e));
    }
    return out;
  }
  async listTrustEvents(): Promise<TrustEvent[]> {
    return Array.from(this.trustEvents.values()).map((v) => clone(v));
  }

  async saveClaimWindow(window: ClaimWindow): Promise<void> {
    this.claimWindows.set(window.id, clone(window));
  }
  async getClaimWindowForRental(
    rentalIntentId: string,
  ): Promise<ClaimWindow | null> {
    for (const w of this.claimWindows.values()) {
      if (w.rentalIntentId === rentalIntentId) return clone(w);
    }
    return null;
  }
  async listClaimWindows(): Promise<ClaimWindow[]> {
    return Array.from(this.claimWindows.values()).map((v) => clone(v));
  }

  async saveClaimReview(review: ClaimReview): Promise<void> {
    this.claimReviews.set(review.id, clone(review));
  }
  async getClaimReview(id: string): Promise<ClaimReview | null> {
    const found = this.claimReviews.get(id);
    return found ? clone(found) : null;
  }
  async listClaimReviewsForRental(
    rentalIntentId: string,
  ): Promise<ClaimReview[]> {
    const out: ClaimReview[] = [];
    for (const r of this.claimReviews.values()) {
      if (r.rentalIntentId === rentalIntentId) out.push(clone(r));
    }
    return out;
  }
  async listClaimReviews(): Promise<ClaimReview[]> {
    return Array.from(this.claimReviews.values()).map((v) => clone(v));
  }

  async saveSellerProfileOverride(
    override: SellerProfileOverride,
  ): Promise<void> {
    this.sellerProfileOverrides.set(override.sellerId, clone(override));
  }
  async getSellerProfileOverride(
    sellerId: string,
  ): Promise<SellerProfileOverride | null> {
    const found = this.sellerProfileOverrides.get(sellerId);
    return found ? clone(found) : null;
  }
  async listSellerProfileOverrides(): Promise<SellerProfileOverride[]> {
    return Array.from(this.sellerProfileOverrides.values()).map((v) =>
      clone(v),
    );
  }

  async saveIntakeSession(session: IntakeSession): Promise<void> {
    this.intakeSessions.set(session.id, clone(session));
  }
  async getIntakeSession(id: string): Promise<IntakeSession | null> {
    const found = this.intakeSessions.get(id);
    return found ? clone(found) : null;
  }
  async listIntakeSessions(): Promise<IntakeSession[]> {
    return Array.from(this.intakeSessions.values()).map((v) => clone(v));
  }
  async appendIntakeMessage(message: IntakeMessage): Promise<void> {
    const list = this.intakeMessages.get(message.sessionId) ?? [];
    list.push(clone(message));
    this.intakeMessages.set(message.sessionId, list);
  }
  async listIntakeMessagesForSession(
    sessionId: string,
  ): Promise<IntakeMessage[]> {
    return (this.intakeMessages.get(sessionId) ?? []).map((v) => clone(v));
  }
  async saveIntakeExtraction(extraction: IntakeExtraction): Promise<void> {
    this.intakeExtractions.set(extraction.sessionId, clone(extraction));
  }
  async getIntakeExtractionForSession(
    sessionId: string,
  ): Promise<IntakeExtraction | null> {
    const found = this.intakeExtractions.get(sessionId);
    return found ? clone(found) : null;
  }

  async clearAll(): Promise<void> {
    this.rentalIntents.clear();
    this.listingIntents.clear();
    this.searchIntents = [];
    this.rentalEvents.clear();
    this.handoffRecords.clear();
    this.trustEvents.clear();
    this.claimWindows.clear();
    this.claimReviews.clear();
    this.sellerProfileOverrides.clear();
    this.intakeSessions.clear();
    this.intakeMessages.clear();
    this.intakeExtractions.clear();
  }
}

// In-memory fallback. Used during SSR (no `window`) and as a base class
// the localStorage adapter extends.

import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
import type { HandoffPhase, HandoffRecord } from "@/domain/trust";
import type { PersistenceAdapter } from "./types";

// Composite key for handoff records: `${rentalIntentId}:${phase}`. The
// pair is the natural primary key — at most one record per phase per
// rental — and a flat Map keeps the memory adapter readable.
function handoffKey(rentalIntentId: string, phase: HandoffPhase): string {
  return `${rentalIntentId}:${phase}`;
}

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  protected rentalIntents = new Map<string, RentalIntent>();
  protected listingIntents = new Map<string, ListingIntent>();
  protected searchIntents: SearchIntent[] = [];
  protected rentalEvents = new Map<string, RentalEvent[]>();
  protected handoffRecords = new Map<string, HandoffRecord>();

  async saveRentalIntent(intent: RentalIntent): Promise<void> {
    this.rentalIntents.set(intent.id, intent);
  }
  async getRentalIntent(id: string): Promise<RentalIntent | null> {
    return this.rentalIntents.get(id) ?? null;
  }
  async listRentalIntents(): Promise<RentalIntent[]> {
    return Array.from(this.rentalIntents.values());
  }
  async deleteRentalIntent(id: string): Promise<void> {
    this.rentalIntents.delete(id);
    this.rentalEvents.delete(id);
  }

  async saveListingIntent(intent: ListingIntent): Promise<void> {
    this.listingIntents.set(intent.id, intent);
  }
  async getListingIntent(id: string): Promise<ListingIntent | null> {
    return this.listingIntents.get(id) ?? null;
  }
  async listListingIntents(): Promise<ListingIntent[]> {
    return Array.from(this.listingIntents.values());
  }

  async saveSearchIntent(intent: SearchIntent): Promise<void> {
    this.searchIntents.unshift(intent);
    this.searchIntents = this.searchIntents.slice(0, 10);
  }
  async getLatestSearchIntent(): Promise<SearchIntent | null> {
    return this.searchIntents[0] ?? null;
  }
  async listSearchIntents(): Promise<SearchIntent[]> {
    return [...this.searchIntents];
  }

  async appendRentalEvent(event: RentalEvent): Promise<void> {
    const list = this.rentalEvents.get(event.rentalIntentId) ?? [];
    list.push(event);
    this.rentalEvents.set(event.rentalIntentId, list);
  }
  async listRentalEvents(rentalIntentId: string): Promise<RentalEvent[]> {
    return [...(this.rentalEvents.get(rentalIntentId) ?? [])];
  }

  async saveHandoffRecord(record: HandoffRecord): Promise<void> {
    this.handoffRecords.set(handoffKey(record.rentalIntentId, record.phase), record);
  }
  async getHandoffRecord(
    rentalIntentId: string,
    phase: HandoffPhase,
  ): Promise<HandoffRecord | null> {
    return this.handoffRecords.get(handoffKey(rentalIntentId, phase)) ?? null;
  }
  async listHandoffRecordsForRental(
    rentalIntentId: string,
  ): Promise<HandoffRecord[]> {
    const out: HandoffRecord[] = [];
    for (const r of this.handoffRecords.values()) {
      if (r.rentalIntentId === rentalIntentId) out.push(r);
    }
    return out;
  }

  async clearAll(): Promise<void> {
    this.rentalIntents.clear();
    this.listingIntents.clear();
    this.searchIntents = [];
    this.rentalEvents.clear();
    this.handoffRecords.clear();
  }
}

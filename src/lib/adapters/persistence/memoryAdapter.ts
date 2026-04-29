// In-memory fallback. Used during SSR (no `window`) and as a base class
// the localStorage adapter extends.

import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
import type { PersistenceAdapter } from "./types";

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  protected rentalIntents = new Map<string, RentalIntent>();
  protected listingIntents = new Map<string, ListingIntent>();
  protected searchIntents: SearchIntent[] = [];
  protected rentalEvents = new Map<string, RentalEvent[]>();

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

  async clearAll(): Promise<void> {
    this.rentalIntents.clear();
    this.listingIntents.clear();
    this.searchIntents = [];
    this.rentalEvents.clear();
  }
}

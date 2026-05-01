// localStorage-backed persistence. Browser-only — SSR must use the memory
// adapter via `getPersistence()`. Keys are namespaced under `corent:` so
// callers can safely clear them in dev tools without touching unrelated
// state.

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

const KEYS = {
  rentalIntents: "corent:rentalIntents",
  listingIntents: "corent:listingIntents",
  searchIntents: "corent:searchIntents",
  rentalEvents: "corent:rentalEvents",
  handoffRecords: "corent:handoffRecords",
  trustEvents: "corent:trustEvents",
  claimWindows: "corent:claimWindows",
  claimReviews: "corent:claimReviews",
  sellerProfileOverrides: "corent:sellerProfileOverrides",
} as const;

// Composite key inside the handoff blob: `${rentalIntentId}:${phase}`.
function handoffKey(rentalIntentId: string, phase: HandoffPhase): string {
  return `${rentalIntentId}:${phase}`;
}

// Read + parse + shape-check. If the stored value doesn't match the shape
// of `fallback` (record vs array vs primitive), the fallback is returned
// instead of crashing downstream consumers like `Object.values(...)`.
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? (parsed as T) : fallback;
    }
    if (fallback && typeof fallback === "object") {
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as T)
        : fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode — silently degrade.
  }
}

export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  async saveRentalIntent(intent: RentalIntent): Promise<void> {
    const all = readJson<Record<string, RentalIntent>>(KEYS.rentalIntents, {});
    all[intent.id] = intent;
    writeJson(KEYS.rentalIntents, all);
  }
  async getRentalIntent(id: string): Promise<RentalIntent | null> {
    const all = readJson<Record<string, RentalIntent>>(KEYS.rentalIntents, {});
    return all[id] ?? null;
  }
  async listRentalIntents(): Promise<RentalIntent[]> {
    const all = readJson<Record<string, RentalIntent>>(KEYS.rentalIntents, {});
    return Object.values(all);
  }
  async deleteRentalIntent(id: string): Promise<void> {
    const all = readJson<Record<string, RentalIntent>>(KEYS.rentalIntents, {});
    delete all[id];
    writeJson(KEYS.rentalIntents, all);
    const events = readJson<Record<string, RentalEvent[]>>(
      KEYS.rentalEvents,
      {},
    );
    delete events[id];
    writeJson(KEYS.rentalEvents, events);
  }

  async saveListingIntent(intent: ListingIntent): Promise<void> {
    const all = readJson<Record<string, ListingIntent>>(
      KEYS.listingIntents,
      {},
    );
    all[intent.id] = intent;
    writeJson(KEYS.listingIntents, all);
  }
  async getListingIntent(id: string): Promise<ListingIntent | null> {
    const all = readJson<Record<string, ListingIntent>>(
      KEYS.listingIntents,
      {},
    );
    return all[id] ?? null;
  }
  async listListingIntents(): Promise<ListingIntent[]> {
    const all = readJson<Record<string, ListingIntent>>(
      KEYS.listingIntents,
      {},
    );
    return Object.values(all);
  }

  async saveSearchIntent(intent: SearchIntent): Promise<void> {
    const all = readJson<SearchIntent[]>(KEYS.searchIntents, []);
    all.unshift(intent);
    writeJson(KEYS.searchIntents, all.slice(0, 10));
  }
  async getLatestSearchIntent(): Promise<SearchIntent | null> {
    const all = readJson<SearchIntent[]>(KEYS.searchIntents, []);
    return all[0] ?? null;
  }
  async listSearchIntents(): Promise<SearchIntent[]> {
    return readJson<SearchIntent[]>(KEYS.searchIntents, []);
  }

  async appendRentalEvent(event: RentalEvent): Promise<void> {
    const all = readJson<Record<string, RentalEvent[]>>(KEYS.rentalEvents, {});
    const list = all[event.rentalIntentId] ?? [];
    list.push(event);
    all[event.rentalIntentId] = list;
    writeJson(KEYS.rentalEvents, all);
  }
  async listRentalEvents(rentalIntentId: string): Promise<RentalEvent[]> {
    const all = readJson<Record<string, RentalEvent[]>>(KEYS.rentalEvents, {});
    return all[rentalIntentId] ?? [];
  }

  async saveHandoffRecord(record: HandoffRecord): Promise<void> {
    const all = readJson<Record<string, HandoffRecord>>(KEYS.handoffRecords, {});
    all[handoffKey(record.rentalIntentId, record.phase)] = record;
    writeJson(KEYS.handoffRecords, all);
  }
  async getHandoffRecord(
    rentalIntentId: string,
    phase: HandoffPhase,
  ): Promise<HandoffRecord | null> {
    const all = readJson<Record<string, HandoffRecord>>(KEYS.handoffRecords, {});
    return all[handoffKey(rentalIntentId, phase)] ?? null;
  }
  async listHandoffRecordsForRental(
    rentalIntentId: string,
  ): Promise<HandoffRecord[]> {
    const all = readJson<Record<string, HandoffRecord>>(KEYS.handoffRecords, {});
    return Object.values(all).filter(
      (r) => r.rentalIntentId === rentalIntentId,
    );
  }

  async saveTrustEvent(event: TrustEvent): Promise<void> {
    const all = readJson<Record<string, TrustEvent>>(KEYS.trustEvents, {});
    all[event.id] = event;
    writeJson(KEYS.trustEvents, all);
  }
  async listTrustEventsForRental(rentalIntentId: string): Promise<TrustEvent[]> {
    const all = readJson<Record<string, TrustEvent>>(KEYS.trustEvents, {});
    return Object.values(all).filter(
      (e) => e.rentalIntentId === rentalIntentId,
    );
  }
  async listTrustEvents(): Promise<TrustEvent[]> {
    const all = readJson<Record<string, TrustEvent>>(KEYS.trustEvents, {});
    return Object.values(all);
  }

  async saveClaimWindow(window: ClaimWindow): Promise<void> {
    const all = readJson<Record<string, ClaimWindow>>(KEYS.claimWindows, {});
    all[window.id] = window;
    writeJson(KEYS.claimWindows, all);
  }
  async getClaimWindowForRental(
    rentalIntentId: string,
  ): Promise<ClaimWindow | null> {
    const all = readJson<Record<string, ClaimWindow>>(KEYS.claimWindows, {});
    for (const w of Object.values(all)) {
      if (w.rentalIntentId === rentalIntentId) return w;
    }
    return null;
  }
  async listClaimWindows(): Promise<ClaimWindow[]> {
    const all = readJson<Record<string, ClaimWindow>>(KEYS.claimWindows, {});
    return Object.values(all);
  }

  async saveClaimReview(review: ClaimReview): Promise<void> {
    const all = readJson<Record<string, ClaimReview>>(KEYS.claimReviews, {});
    all[review.id] = review;
    writeJson(KEYS.claimReviews, all);
  }
  async getClaimReview(id: string): Promise<ClaimReview | null> {
    const all = readJson<Record<string, ClaimReview>>(KEYS.claimReviews, {});
    return all[id] ?? null;
  }
  async listClaimReviewsForRental(
    rentalIntentId: string,
  ): Promise<ClaimReview[]> {
    const all = readJson<Record<string, ClaimReview>>(KEYS.claimReviews, {});
    return Object.values(all).filter(
      (r) => r.rentalIntentId === rentalIntentId,
    );
  }
  async listClaimReviews(): Promise<ClaimReview[]> {
    const all = readJson<Record<string, ClaimReview>>(KEYS.claimReviews, {});
    return Object.values(all);
  }

  async saveSellerProfileOverride(
    override: SellerProfileOverride,
  ): Promise<void> {
    const all = readJson<Record<string, SellerProfileOverride>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    all[override.sellerId] = override;
    writeJson(KEYS.sellerProfileOverrides, all);
  }
  async getSellerProfileOverride(
    sellerId: string,
  ): Promise<SellerProfileOverride | null> {
    const all = readJson<Record<string, SellerProfileOverride>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    return all[sellerId] ?? null;
  }
  async listSellerProfileOverrides(): Promise<SellerProfileOverride[]> {
    const all = readJson<Record<string, SellerProfileOverride>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    return Object.values(all);
  }

  async clearAll(): Promise<void> {
    try {
      for (const key of Object.values(KEYS)) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable (privacy mode) — ignore.
    }
  }
}

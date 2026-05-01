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

// Typed write error for critical paths (claim windows, claim reviews,
// trust events, seller profile overrides). The legacy `writeJson`
// helper silently degrades on quota / privacy-mode failures, which
// is fine for non-critical writes (rental drafts) but hides real
// data loss for audit / admin records. The strict variant throws.
export class LocalStorageWriteError extends Error {
  readonly code: "quota_or_privacy_mode";
  constructor(key: string, cause: unknown) {
    super(`localStorage write failed for ${key}`);
    this.name = "LocalStorageWriteError";
    this.code = "quota_or_privacy_mode";
    if (cause !== undefined) {
      // Preserve the underlying error for debugging without losing the
      // typed code field.
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

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
    // Quota or privacy mode — silently degrade. Used for non-critical
    // writes (rental drafts, search history, listing drafts) where a
    // dropped write does not corrupt the audit trail.
  }
}

// Strict variant for critical writes. Throws `LocalStorageWriteError`
// on quota / privacy-mode failures so a caller (e.g. the claim review
// orchestrator) can surface the failure rather than silently
// "succeeding" with no persisted record.
function writeJsonOrThrow<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    throw new LocalStorageWriteError(key, err);
  }
}

// Record-level validators. The legacy `readJson` only checks the
// container shape (Record vs Array). For trust / admin records we
// also drop entries whose required fields are missing or wrong-typed
// so a malformed localStorage entry can never crash the summary or
// admin queue.
function isString(v: unknown): v is string {
  return typeof v === "string";
}

function pickValid<T>(
  blob: Record<string, unknown>,
  isValid: (v: unknown) => v is T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(blob)) {
    if (isValid(v)) out[k] = v;
  }
  return out;
}

function isTrustEventShape(v: unknown): v is TrustEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isString(o.rentalIntentId) &&
    isString(o.type) &&
    isString(o.at) &&
    isString(o.actor)
  );
}
function isClaimWindowShape(v: unknown): v is ClaimWindow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isString(o.rentalIntentId) &&
    isString(o.status) &&
    isString(o.openedAt) &&
    isString(o.closesAt)
  );
}
function isClaimReviewShape(v: unknown): v is ClaimReview {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isString(o.rentalIntentId) &&
    isString(o.claimWindowId) &&
    isString(o.status) &&
    isString(o.openedAt)
  );
}
function isProfileOverrideShape(v: unknown): v is SellerProfileOverride {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return isString(o.sellerId) && isString(o.updatedAt);
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
    // Phase 1.10: cascade delete to keep trust / admin records from
    // being orphaned. Handoff records, trust events, claim windows,
    // and claim reviews tied to this rental are removed alongside.
    const handoffs = readJson<Record<string, HandoffRecord>>(
      KEYS.handoffRecords,
      {},
    );
    for (const [k, v] of Object.entries(handoffs)) {
      if (v.rentalIntentId === id) delete handoffs[k];
    }
    writeJson(KEYS.handoffRecords, handoffs);

    const trust = readJson<Record<string, TrustEvent>>(KEYS.trustEvents, {});
    for (const [k, v] of Object.entries(trust)) {
      if (v.rentalIntentId === id) delete trust[k];
    }
    writeJson(KEYS.trustEvents, trust);

    const windows = readJson<Record<string, ClaimWindow>>(
      KEYS.claimWindows,
      {},
    );
    for (const [k, v] of Object.entries(windows)) {
      if (v.rentalIntentId === id) delete windows[k];
    }
    writeJson(KEYS.claimWindows, windows);

    const reviews = readJson<Record<string, ClaimReview>>(
      KEYS.claimReviews,
      {},
    );
    for (const [k, v] of Object.entries(reviews)) {
      if (v.rentalIntentId === id) delete reviews[k];
    }
    writeJson(KEYS.claimReviews, reviews);
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
    // Phase 1.10: append-only invariant. Re-saving the same id is a
    // bug at the service layer (audit log corruption); reject.
    if (Object.prototype.hasOwnProperty.call(all, event.id)) {
      throw new Error(`trust_event_duplicate_id: ${event.id}`);
    }
    all[event.id] = event;
    writeJsonOrThrow(KEYS.trustEvents, all);
  }
  async listTrustEventsForRental(rentalIntentId: string): Promise<TrustEvent[]> {
    const raw = readJson<Record<string, unknown>>(KEYS.trustEvents, {});
    const all = pickValid(raw, isTrustEventShape);
    return Object.values(all).filter(
      (e) => e.rentalIntentId === rentalIntentId,
    );
  }
  async listTrustEvents(): Promise<TrustEvent[]> {
    const raw = readJson<Record<string, unknown>>(KEYS.trustEvents, {});
    return Object.values(pickValid(raw, isTrustEventShape));
  }

  async saveClaimWindow(window: ClaimWindow): Promise<void> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimWindows, {});
    const all = pickValid(raw, isClaimWindowShape);
    all[window.id] = window;
    writeJsonOrThrow(KEYS.claimWindows, all);
  }
  async getClaimWindowForRental(
    rentalIntentId: string,
  ): Promise<ClaimWindow | null> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimWindows, {});
    const all = pickValid(raw, isClaimWindowShape);
    for (const w of Object.values(all)) {
      if (w.rentalIntentId === rentalIntentId) return w;
    }
    return null;
  }
  async listClaimWindows(): Promise<ClaimWindow[]> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimWindows, {});
    return Object.values(pickValid(raw, isClaimWindowShape));
  }

  async saveClaimReview(review: ClaimReview): Promise<void> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimReviews, {});
    const all = pickValid(raw, isClaimReviewShape);
    all[review.id] = review;
    writeJsonOrThrow(KEYS.claimReviews, all);
  }
  async getClaimReview(id: string): Promise<ClaimReview | null> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimReviews, {});
    const all = pickValid(raw, isClaimReviewShape);
    return all[id] ?? null;
  }
  async listClaimReviewsForRental(
    rentalIntentId: string,
  ): Promise<ClaimReview[]> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimReviews, {});
    const all = pickValid(raw, isClaimReviewShape);
    return Object.values(all).filter(
      (r) => r.rentalIntentId === rentalIntentId,
    );
  }
  async listClaimReviews(): Promise<ClaimReview[]> {
    const raw = readJson<Record<string, unknown>>(KEYS.claimReviews, {});
    return Object.values(pickValid(raw, isClaimReviewShape));
  }

  async saveSellerProfileOverride(
    override: SellerProfileOverride,
  ): Promise<void> {
    const raw = readJson<Record<string, unknown>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    const all = pickValid(raw, isProfileOverrideShape);
    all[override.sellerId] = override;
    writeJsonOrThrow(KEYS.sellerProfileOverrides, all);
  }
  async getSellerProfileOverride(
    sellerId: string,
  ): Promise<SellerProfileOverride | null> {
    const raw = readJson<Record<string, unknown>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    const all = pickValid(raw, isProfileOverrideShape);
    return all[sellerId] ?? null;
  }
  async listSellerProfileOverrides(): Promise<SellerProfileOverride[]> {
    const raw = readJson<Record<string, unknown>>(
      KEYS.sellerProfileOverrides,
      {},
    );
    return Object.values(pickValid(raw, isProfileOverrideShape));
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

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
import type {
  ClaimReview,
  ClaimWindow,
  HandoffRecord,
  TrustEvent,
} from "@/domain/trust";
import { LocalStoragePersistenceAdapter } from "@/lib/adapters/persistence/localStorageAdapter";
import { MemoryPersistenceAdapter } from "@/lib/adapters/persistence/memoryAdapter";
import type { PersistenceAdapter } from "@/lib/adapters/persistence/types";

type StorageMock = Storage & {
  dump(): Record<string, string>;
};

const baseRentalIntent: RentalIntent = {
  id: "ri_test",
  productId: "product_test",
  productName: "Test massage gun",
  productCategory: "massage_gun",
  borrowerId: "borrower_test",
  borrowerName: "Borrower",
  sellerId: "seller_test",
  sellerName: "Seller",
  status: "requested",
  durationDays: 3,
  amounts: {
    rentalFee: 30_000,
    safetyDeposit: 100_000,
    platformFee: 3_000,
    sellerPayout: 27_000,
    borrowerTotal: 130_000,
  },
  payment: {
    provider: "mock",
    status: "not_started",
  },
  pickup: {
    method: "direct",
    status: "not_scheduled",
    locationLabel: "Gangnam",
  },
  return: {
    status: "not_due",
  },
  settlement: {
    status: "not_ready",
    sellerPayout: 27_000,
  },
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z",
};

const baseListingIntent: ListingIntent = {
  id: "li_test",
  sellerId: "seller_test",
  status: "approved",
  rawSellerInput: "Massage gun in good condition",
  item: {
    name: "Test massage gun",
    category: "massage_gun",
    estimatedValue: 300_000,
    condition: "excellent",
    components: ["charger", "case"],
    pickupArea: "Gangnam",
  },
  pricing: {
    oneDay: 10_000,
    threeDays: 25_000,
    sevenDays: 45_000,
  },
  verification: {
    id: "vi_test",
    safetyCode: "COR-1234",
    status: "verified",
    checks: {
      frontPhoto: true,
      backPhoto: true,
      componentsPhoto: true,
      workingProof: true,
      safetyCodePhoto: true,
      privateSerialStored: false,
    },
  },
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z",
};

const baseSearchIntent: SearchIntent = {
  id: "si_test",
  rawInput: "Need a massage gun this weekend",
  category: "massage_gun",
  durationDays: 3,
  region: "seoul",
  pickupMethod: "direct",
  trustPreference: "verified_first",
  createdAt: "2026-04-29T00:00:00.000Z",
};

const baseRentalEvent: RentalEvent = {
  id: "evt_test",
  rentalIntentId: baseRentalIntent.id,
  fromStatus: null,
  toStatus: "requested",
  at: "2026-04-29T00:01:00.000Z",
  reason: "created",
  actor: "borrower",
  metadata: {
    source: "test",
  },
};

const basePickupHandoff: HandoffRecord = {
  id: "ho_pickup_test",
  rentalIntentId: baseRentalIntent.id,
  phase: "pickup",
  checks: {
    mainUnit: true,
    components: true,
    working: true,
    appearance: true,
    preexisting: true,
  },
  confirmedBySeller: true,
  confirmedByBorrower: false,
  note: "외관 양호, 흠집 1건 기록",
  createdAt: "2026-04-29T00:02:00.000Z",
  updatedAt: "2026-04-29T00:02:00.000Z",
};

const baseReturnHandoff: HandoffRecord = {
  id: "ho_return_test",
  rentalIntentId: baseRentalIntent.id,
  phase: "return",
  checks: {
    mainUnit: false,
    components: false,
    working: false,
    appearance: false,
    preexisting: false,
  },
  confirmedBySeller: false,
  confirmedByBorrower: false,
  createdAt: "2026-04-29T00:03:00.000Z",
  updatedAt: "2026-04-29T00:03:00.000Z",
};

const basePickupTrustEvent: TrustEvent = {
  id: "tev_pickup_test",
  rentalIntentId: baseRentalIntent.id,
  type: "pickup_evidence_recorded",
  at: "2026-04-29T00:04:00.000Z",
  actor: "seller",
  handoffPhase: "pickup",
};

const baseReturnTrustEvent: TrustEvent = {
  id: "tev_return_test",
  rentalIntentId: baseRentalIntent.id,
  type: "return_evidence_recorded",
  at: "2026-04-29T00:05:00.000Z",
  actor: "seller",
  handoffPhase: "return",
  notes: "정상 반납",
};

const otherRentalTrustEvent: TrustEvent = {
  id: "tev_other_test",
  rentalIntentId: "ri_other",
  type: "seller_approved_request",
  at: "2026-04-29T00:06:00.000Z",
  actor: "seller",
};

const baseClaimWindow: ClaimWindow = {
  id: "cw_test",
  rentalIntentId: baseRentalIntent.id,
  status: "open",
  openedAt: "2026-04-29T00:07:00.000Z",
  closesAt: "2026-04-30T00:07:00.000Z",
};

const baseClaimReview: ClaimReview = {
  id: "crv_test",
  rentalIntentId: baseRentalIntent.id,
  claimWindowId: baseClaimWindow.id,
  status: "open",
  openedAt: "2026-04-29T00:08:00.000Z",
  openedReason: "본체에 새로운 흠집이 보여요",
};

function makeRentalIntent(overrides: Partial<RentalIntent> = {}): RentalIntent {
  return {
    ...baseRentalIntent,
    ...overrides,
    amounts: {
      ...baseRentalIntent.amounts,
      ...overrides.amounts,
    },
    payment: {
      ...baseRentalIntent.payment,
      ...overrides.payment,
    },
    pickup: {
      ...baseRentalIntent.pickup,
      ...overrides.pickup,
    },
    return: {
      ...baseRentalIntent.return,
      ...overrides.return,
    },
    settlement: {
      ...baseRentalIntent.settlement,
      ...overrides.settlement,
    },
  };
}

function makeStorageMock(initial: Record<string, string> = {}): StorageMock {
  let store = { ...initial };

  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: vi.fn(() => {
      store = {};
    }),
    getItem: vi.fn((key: string) => store[key] ?? null),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    dump: () => ({ ...store }),
  };
}

function stubWindowWithStorage(
  initial: Record<string, string> = {},
): StorageMock {
  const storage = makeStorageMock(initial);
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

async function expectAdapterSupportsMvpEntities(
  adapter: PersistenceAdapter,
): Promise<void> {
  await adapter.saveRentalIntent(baseRentalIntent);
  await adapter.saveListingIntent(baseListingIntent);
  await adapter.saveSearchIntent(baseSearchIntent);
  await adapter.appendRentalEvent(baseRentalEvent);

  expect(await adapter.getRentalIntent(baseRentalIntent.id)).toEqual(
    baseRentalIntent,
  );
  expect(await adapter.listRentalIntents()).toEqual([baseRentalIntent]);
  expect(await adapter.getListingIntent(baseListingIntent.id)).toEqual(
    baseListingIntent,
  );
  expect(await adapter.listListingIntents()).toEqual([baseListingIntent]);
  expect(await adapter.getLatestSearchIntent()).toEqual(baseSearchIntent);
  expect(await adapter.listSearchIntents()).toEqual([baseSearchIntent]);
  expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([
    baseRentalEvent,
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("MemoryPersistenceAdapter", () => {
  it("saves and reads MVP entities, including rental lifecycle events", async () => {
    await expectAdapterSupportsMvpEntities(new MemoryPersistenceAdapter());
  });

  it("updates existing saved entities without duplicating them", async () => {
    const adapter = new MemoryPersistenceAdapter();
    const updated = makeRentalIntent({
      status: "seller_approved",
      updatedAt: "2026-04-29T00:05:00.000Z",
    });

    await adapter.saveRentalIntent(baseRentalIntent);
    await adapter.saveRentalIntent(updated);

    expect(await adapter.listRentalIntents()).toEqual([updated]);
    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toEqual(updated);
  });

  it("deletes rental intents and their event logs", async () => {
    const adapter = new MemoryPersistenceAdapter();

    await adapter.saveRentalIntent(baseRentalIntent);
    await adapter.appendRentalEvent(baseRentalEvent);
    await adapter.deleteRentalIntent(baseRentalIntent.id);

    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toBeNull();
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
  });

  it("clearAll removes all adapter-managed MVP data", async () => {
    const adapter = new MemoryPersistenceAdapter();

    await expectAdapterSupportsMvpEntities(adapter);
    await adapter.saveHandoffRecord(basePickupHandoff);
    await adapter.saveTrustEvent(basePickupTrustEvent);
    await adapter.saveClaimWindow(baseClaimWindow);
    await adapter.saveClaimReview(baseClaimReview);
    await adapter.clearAll();

    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.getLatestSearchIntent()).toBeNull();
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
    expect(
      await adapter.listHandoffRecordsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toBeNull();
    expect(await adapter.listTrustEvents()).toEqual([]);
    expect(
      await adapter.listTrustEventsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(await adapter.listClaimWindows()).toEqual([]);
    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toBeNull();
    expect(await adapter.listClaimReviews()).toEqual([]);
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([]);
  });

  it("saves and reads claim windows scoped per rental", async () => {
    const adapter = new MemoryPersistenceAdapter();

    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toBeNull();
    expect(await adapter.listClaimWindows()).toEqual([]);

    await adapter.saveClaimWindow(baseClaimWindow);
    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toEqual(baseClaimWindow);
    expect(await adapter.listClaimWindows()).toEqual([baseClaimWindow]);

    // Re-saving the same id overwrites instead of duplicating.
    const closed: ClaimWindow = {
      ...baseClaimWindow,
      status: "closed_no_claim",
      closedAt: "2026-04-29T01:00:00.000Z",
    };
    await adapter.saveClaimWindow(closed);
    expect(await adapter.listClaimWindows()).toEqual([closed]);
    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toEqual(closed);
  });

  it("saves, reads, and scopes claim reviews per rental", async () => {
    const adapter = new MemoryPersistenceAdapter();

    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(await adapter.listClaimReviews()).toEqual([]);

    await adapter.saveClaimReview(baseClaimReview);
    expect(await adapter.getClaimReview(baseClaimReview.id)).toEqual(
      baseClaimReview,
    );
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([baseClaimReview]);
    expect(await adapter.listClaimReviews()).toEqual([baseClaimReview]);

    const otherReview: ClaimReview = {
      ...baseClaimReview,
      id: "crv_other",
      rentalIntentId: "ri_other",
      claimWindowId: "cw_other",
    };
    await adapter.saveClaimReview(otherReview);
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([baseClaimReview]);
    expect(await adapter.listClaimReviewsForRental("ri_other")).toEqual([
      otherReview,
    ]);

    // Re-saving the same id overwrites.
    const decided: ClaimReview = {
      ...baseClaimReview,
      status: "approved",
      decidedBy: "founder@example.com",
      decidedAt: "2026-04-29T02:00:00.000Z",
    };
    await adapter.saveClaimReview(decided);
    expect(await adapter.getClaimReview(baseClaimReview.id)).toEqual(decided);
    expect(await adapter.listClaimReviews()).toHaveLength(2);
  });

  it("saves, reads, lists, and updates handoff records by (rental, phase)", async () => {
    const adapter = new MemoryPersistenceAdapter();

    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toBeNull();

    await adapter.saveHandoffRecord(basePickupHandoff);
    await adapter.saveHandoffRecord(baseReturnHandoff);

    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toEqual(basePickupHandoff);
    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "return"),
    ).toEqual(baseReturnHandoff);

    const both = await adapter.listHandoffRecordsForRental(
      baseRentalIntent.id,
    );
    expect(both).toHaveLength(2);
    expect(both).toEqual(
      expect.arrayContaining([basePickupHandoff, baseReturnHandoff]),
    );

    // Re-saving the same (rental, phase) overwrites instead of duplicating.
    const updated: HandoffRecord = {
      ...basePickupHandoff,
      confirmedByBorrower: true,
      updatedAt: "2026-04-29T00:10:00.000Z",
    };
    await adapter.saveHandoffRecord(updated);
    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toEqual(updated);
    expect(
      await adapter.listHandoffRecordsForRental(baseRentalIntent.id),
    ).toHaveLength(2);
  });

  it("saves, lists, and scopes trust events per rental", async () => {
    const adapter = new MemoryPersistenceAdapter();

    expect(await adapter.listTrustEvents()).toEqual([]);
    expect(
      await adapter.listTrustEventsForRental(baseRentalIntent.id),
    ).toEqual([]);

    await adapter.saveTrustEvent(basePickupTrustEvent);
    await adapter.saveTrustEvent(baseReturnTrustEvent);
    await adapter.saveTrustEvent(otherRentalTrustEvent);

    const all = await adapter.listTrustEvents();
    expect(all).toHaveLength(3);
    const forRental = await adapter.listTrustEventsForRental(
      baseRentalIntent.id,
    );
    expect(forRental).toHaveLength(2);
    expect(forRental).toEqual(
      expect.arrayContaining([basePickupTrustEvent, baseReturnTrustEvent]),
    );
    expect(
      await adapter.listTrustEventsForRental("ri_other"),
    ).toEqual([otherRentalTrustEvent]);

    // Re-saving the same id overwrites instead of duplicating.
    const updated: TrustEvent = {
      ...basePickupTrustEvent,
      notes: "updated note",
    };
    await adapter.saveTrustEvent(updated);
    const after = await adapter.listTrustEventsForRental(baseRentalIntent.id);
    expect(after).toHaveLength(2);
    expect(after).toEqual(
      expect.arrayContaining([updated, baseReturnTrustEvent]),
    );
  });
});

describe("LocalStoragePersistenceAdapter", () => {
  it("returns safe empty values when stored data is missing", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();

    expect(await adapter.getRentalIntent("missing")).toBeNull();
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.getListingIntent("missing")).toBeNull();
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.getLatestSearchIntent()).toBeNull();
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.listRentalEvents("missing")).toEqual([]);
  });

  it("does not crash on corrupted JSON", async () => {
    stubWindowWithStorage({
      "corent:rentalIntents": "{",
      "corent:listingIntents": "{",
      "corent:searchIntents": "{",
      "corent:rentalEvents": "{",
    });
    const adapter = new LocalStoragePersistenceAdapter();

    await expect(adapter.listRentalIntents()).resolves.toEqual([]);
    await expect(adapter.listListingIntents()).resolves.toEqual([]);
    await expect(adapter.listSearchIntents()).resolves.toEqual([]);
    await expect(adapter.listRentalEvents(baseRentalIntent.id)).resolves.toEqual(
      [],
    );
  });

  it("returns safe empty values when stored data has the wrong shape", async () => {
    stubWindowWithStorage({
      "corent:rentalIntents": JSON.stringify([]),
      "corent:listingIntents": JSON.stringify([]),
      "corent:searchIntents": JSON.stringify({ bad: "shape" }),
      "corent:rentalEvents": JSON.stringify([]),
    });
    const adapter = new LocalStoragePersistenceAdapter();

    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toBeNull();
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.getListingIntent(baseListingIntent.id)).toBeNull();
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.getLatestSearchIntent()).toBeNull();
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
  });

  it("saves and reads MVP entities, including rental lifecycle events", async () => {
    stubWindowWithStorage();

    await expectAdapterSupportsMvpEntities(
      new LocalStoragePersistenceAdapter(),
    );
  });

  it("updates existing saved entities without duplicating them", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();
    const updated = makeRentalIntent({
      status: "seller_approved",
      updatedAt: "2026-04-29T00:05:00.000Z",
    });

    await adapter.saveRentalIntent(baseRentalIntent);
    await adapter.saveRentalIntent(updated);

    expect(await adapter.listRentalIntents()).toEqual([updated]);
    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toEqual(updated);
  });

  it("deletes rental intents and their event logs", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();

    await adapter.saveRentalIntent(baseRentalIntent);
    await adapter.appendRentalEvent(baseRentalEvent);
    await adapter.deleteRentalIntent(baseRentalIntent.id);

    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toBeNull();
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
  });

  it("clearAll removes CoRent keys without removing unrelated localStorage keys", async () => {
    const storage = stubWindowWithStorage({
      "corent:rentalIntents": JSON.stringify({
        [baseRentalIntent.id]: baseRentalIntent,
      }),
      "corent:listingIntents": JSON.stringify({
        [baseListingIntent.id]: baseListingIntent,
      }),
      "corent:searchIntents": JSON.stringify([baseSearchIntent]),
      "corent:rentalEvents": JSON.stringify({
        [baseRentalIntent.id]: [baseRentalEvent],
      }),
      "corent:handoffRecords": JSON.stringify({
        [`${baseRentalIntent.id}:pickup`]: basePickupHandoff,
      }),
      "corent:trustEvents": JSON.stringify({
        [basePickupTrustEvent.id]: basePickupTrustEvent,
      }),
      "corent:claimWindows": JSON.stringify({
        [baseClaimWindow.id]: baseClaimWindow,
      }),
      "corent:claimReviews": JSON.stringify({
        [baseClaimReview.id]: baseClaimReview,
      }),
      unrelated: "keep me",
    });
    const adapter = new LocalStoragePersistenceAdapter();

    await adapter.clearAll();

    expect(storage.dump()).toEqual({ unrelated: "keep me" });
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
    expect(
      await adapter.listHandoffRecordsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toBeNull();
    expect(await adapter.listTrustEvents()).toEqual([]);
    expect(
      await adapter.listTrustEventsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(await adapter.listClaimWindows()).toEqual([]);
    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toBeNull();
    expect(await adapter.listClaimReviews()).toEqual([]);
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([]);
  });

  it("saves and reads claim windows + claim reviews", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();

    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toBeNull();
    expect(await adapter.listClaimWindows()).toEqual([]);
    expect(await adapter.getClaimReview(baseClaimReview.id)).toBeNull();
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([]);
    expect(await adapter.listClaimReviews()).toEqual([]);

    await adapter.saveClaimWindow(baseClaimWindow);
    await adapter.saveClaimReview(baseClaimReview);

    expect(
      await adapter.getClaimWindowForRental(baseRentalIntent.id),
    ).toEqual(baseClaimWindow);
    expect(await adapter.listClaimWindows()).toEqual([baseClaimWindow]);

    expect(await adapter.getClaimReview(baseClaimReview.id)).toEqual(
      baseClaimReview,
    );
    expect(
      await adapter.listClaimReviewsForRental(baseRentalIntent.id),
    ).toEqual([baseClaimReview]);
    expect(await adapter.listClaimReviews()).toEqual([baseClaimReview]);

    // Re-saving overwrites instead of duplicating.
    const decided: ClaimReview = {
      ...baseClaimReview,
      status: "approved",
      decidedBy: "founder@example.com",
      decidedAt: "2026-04-29T02:00:00.000Z",
    };
    await adapter.saveClaimReview(decided);
    expect(await adapter.getClaimReview(baseClaimReview.id)).toEqual(decided);
    expect(await adapter.listClaimReviews()).toHaveLength(1);
  });

  it("saves and reads handoff records keyed by (rental, phase)", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();

    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toBeNull();
    expect(
      await adapter.listHandoffRecordsForRental(baseRentalIntent.id),
    ).toEqual([]);

    await adapter.saveHandoffRecord(basePickupHandoff);
    await adapter.saveHandoffRecord(baseReturnHandoff);

    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "pickup"),
    ).toEqual(basePickupHandoff);
    expect(
      await adapter.getHandoffRecord(baseRentalIntent.id, "return"),
    ).toEqual(baseReturnHandoff);

    const both = await adapter.listHandoffRecordsForRental(
      baseRentalIntent.id,
    );
    expect(both).toHaveLength(2);

    // (rental, other-rental) records are scoped per id.
    const otherRecord: HandoffRecord = {
      ...basePickupHandoff,
      id: "ho_other",
      rentalIntentId: "ri_other",
    };
    await adapter.saveHandoffRecord(otherRecord);
    expect(
      await adapter.listHandoffRecordsForRental("ri_other"),
    ).toEqual([otherRecord]);
    expect(
      await adapter.listHandoffRecordsForRental(baseRentalIntent.id),
    ).toHaveLength(2);
  });

  it("saves, lists, and scopes trust events per rental", async () => {
    stubWindowWithStorage();
    const adapter = new LocalStoragePersistenceAdapter();

    expect(await adapter.listTrustEvents()).toEqual([]);
    expect(
      await adapter.listTrustEventsForRental(baseRentalIntent.id),
    ).toEqual([]);

    await adapter.saveTrustEvent(basePickupTrustEvent);
    await adapter.saveTrustEvent(baseReturnTrustEvent);
    await adapter.saveTrustEvent(otherRentalTrustEvent);

    expect(await adapter.listTrustEvents()).toHaveLength(3);
    const forRental = await adapter.listTrustEventsForRental(
      baseRentalIntent.id,
    );
    expect(forRental).toHaveLength(2);
    expect(forRental).toEqual(
      expect.arrayContaining([basePickupTrustEvent, baseReturnTrustEvent]),
    );
    expect(
      await adapter.listTrustEventsForRental("ri_other"),
    ).toEqual([otherRentalTrustEvent]);
  });
});

describe("getPersistence", () => {
  it("does not access localStorage at module import time", async () => {
    const storage = makeStorageMock();
    const localStorageGetter = vi.fn(() => storage);

    vi.stubGlobal("window", {});
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: localStorageGetter,
    });

    await import("@/lib/adapters/persistence");

    expect(localStorageGetter).not.toHaveBeenCalled();
  });

  it("falls back to usable memory persistence when window is unavailable", async () => {
    vi.stubGlobal("window", undefined);
    const { getPersistence } = await import("@/lib/adapters/persistence");
    const { MemoryPersistenceAdapter: FreshMemoryPersistenceAdapter } =
      await import("@/lib/adapters/persistence/memoryAdapter");
    const adapter = getPersistence();

    await adapter.saveRentalIntent(baseRentalIntent);

    expect(adapter).toBeInstanceOf(FreshMemoryPersistenceAdapter);
    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toEqual(
      baseRentalIntent,
    );
  });

  it("returns usable localStorage persistence in browser-like environments", async () => {
    stubWindowWithStorage();
    const { getPersistence } = await import("@/lib/adapters/persistence");
    const {
      LocalStoragePersistenceAdapter: FreshLocalStoragePersistenceAdapter,
    } = await import("@/lib/adapters/persistence/localStorageAdapter");
    const adapter = getPersistence();

    await adapter.saveRentalIntent(baseRentalIntent);

    expect(adapter).toBeInstanceOf(FreshLocalStoragePersistenceAdapter);
    expect(await adapter.getRentalIntent(baseRentalIntent.id)).toEqual(
      baseRentalIntent,
    );
  });

  it("keeps repeated calls consistent within the same module instance", async () => {
    stubWindowWithStorage();
    const { getPersistence } = await import("@/lib/adapters/persistence");
    const first = getPersistence();
    const second = getPersistence();

    await first.saveRentalIntent(baseRentalIntent);

    expect(second).toBe(first);
    expect(await second.getRentalIntent(baseRentalIntent.id)).toEqual(
      baseRentalIntent,
    );
  });
});

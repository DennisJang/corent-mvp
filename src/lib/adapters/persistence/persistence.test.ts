import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ListingIntent,
  RentalEvent,
  RentalIntent,
  SearchIntent,
} from "@/domain/intents";
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
    await adapter.clearAll();

    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.getLatestSearchIntent()).toBeNull();
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
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
      unrelated: "keep me",
    });
    const adapter = new LocalStoragePersistenceAdapter();

    await adapter.clearAll();

    expect(storage.dump()).toEqual({ unrelated: "keep me" });
    expect(await adapter.listRentalIntents()).toEqual([]);
    expect(await adapter.listListingIntents()).toEqual([]);
    expect(await adapter.listSearchIntents()).toEqual([]);
    expect(await adapter.listRentalEvents(baseRentalIntent.id)).toEqual([]);
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

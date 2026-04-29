// Returns the active persistence adapter. Browser → localStorage, SSR →
// in-memory. Always picked at call time so dynamic imports/route segments
// behave correctly.

import { LocalStoragePersistenceAdapter } from "./localStorageAdapter";
import { MemoryPersistenceAdapter } from "./memoryAdapter";
import type { PersistenceAdapter } from "./types";

let cached: PersistenceAdapter | null = null;

export function getPersistence(): PersistenceAdapter {
  if (cached) return cached;
  cached =
    typeof window === "undefined"
      ? new MemoryPersistenceAdapter()
      : new LocalStoragePersistenceAdapter();
  return cached;
}

export type { PersistenceAdapter } from "./types";

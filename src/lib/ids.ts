// Lightweight ID generator. Crypto.randomUUID is preferred when available —
// otherwise a time + random fallback that is unique enough for mock data.

export function generateId(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${t}${r}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

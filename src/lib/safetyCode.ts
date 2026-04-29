// Generates today's safety code: a single letter plus three digits, e.g.
// `B-428`. Deterministic per UTC day so repeated renders within the same day
// produce the same code, while photos taken on a different day surface as
// stale.

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // skip confusable I/O

function dayOfYearUTC(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = d.getTime() - start;
  return Math.floor(diff / 86_400_000);
}

export function generateSafetyCode(at: Date = new Date()): string {
  const doy = dayOfYearUTC(at);
  const year = at.getUTCFullYear();
  const seed = (doy * 31 + year) % (LETTERS.length * 1000);
  const letter = LETTERS[Math.floor(seed / 1000) % LETTERS.length];
  const digits = String(seed % 1000).padStart(3, "0");
  return `${letter}-${digits}`;
}

// Random per-listing variant. Used when each listing wants its own code
// rather than the global daily code (mirrors how real verification flows
// would issue per-submission tokens).
export function generateListingSafetyCode(seed?: string): string {
  const base = seed ?? `${Date.now()}_${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash);
  const letter = LETTERS[positive % LETTERS.length];
  const digits = String(positive % 1000).padStart(3, "0");
  return `${letter}-${digits}`;
}

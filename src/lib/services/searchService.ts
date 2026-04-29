// Search service. Wraps the AI parser adapter and persistence so the
// landing page → search page hand-off goes through one well-known seam.

import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { SearchIntent } from "@/domain/intents";
import { mockAIParser } from "@/lib/adapters/ai/mockAIParserAdapter";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";

const ENABLED_CATEGORY_IDS = new Set<string>(
  CATEGORIES.filter((c) => c.enabled).map((c) => c.id),
);

function parseCategory(raw: string | null): CategoryId | undefined {
  if (!raw) return undefined;
  return ENABLED_CATEGORY_IDS.has(raw) ? (raw as CategoryId) : undefined;
}

export const searchService = {
  parse(rawInput: string): SearchIntent {
    const parsed = mockAIParser.parseSearch(rawInput);
    return {
      id: generateId("si"),
      createdAt: nowIso(),
      ...parsed,
    };
  },

  async save(intent: SearchIntent): Promise<void> {
    await getPersistence().saveSearchIntent(intent);
  },

  async latest(): Promise<SearchIntent | null> {
    return getPersistence().getLatestSearchIntent();
  },

  // Encode a SearchIntent into URL params so the search route can rehydrate
  // without needing localStorage on first paint (helps with deep-linking).
  toQuery(intent: SearchIntent): Record<string, string> {
    const q: Record<string, string> = { q: intent.rawInput };
    if (intent.category) q.category = intent.category;
    if (intent.durationDays) q.duration = String(intent.durationDays);
    if (intent.region) q.region = intent.region;
    if (intent.priceMax) q.priceMax = String(intent.priceMax);
    return q;
  },

  fromQuery(params: URLSearchParams): SearchIntent | null {
    const raw = params.get("q");
    const category = parseCategory(params.get("category"));
    const durationParam = params.get("duration");
    const durationDays =
      durationParam === "1" || durationParam === "3" || durationParam === "7"
        ? (Number(durationParam) as 1 | 3 | 7)
        : undefined;
    const region = params.get("region") === "seoul" ? "seoul" : undefined;
    const priceMaxRaw = params.get("priceMax");
    const priceMaxParsed = priceMaxRaw ? Number(priceMaxRaw) : NaN;
    const priceMax =
      Number.isFinite(priceMaxParsed) && priceMaxParsed > 0
        ? priceMaxParsed
        : undefined;

    // No useful query state at all — caller can render a neutral default.
    if (!raw && !category && !durationDays && !region && !priceMax) {
      return null;
    }

    // Deterministic id: keeps React useMemo references from churning across
    // renders that produce the same query string.
    const id = `si_${[
      raw ?? "",
      category ?? "",
      durationDays ?? "",
      region ?? "",
      priceMax ?? "",
    ].join("|")}`;

    return {
      id,
      rawInput: raw ?? "",
      category,
      durationDays,
      region,
      priceMax,
      pickupMethod: "direct",
      createdAt: "",
    };
  },
};

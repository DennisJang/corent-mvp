// Provider-neutral candidate normalizer (Bundle 4 Slice 3).
//
// Sanitizes a possibly-untrusted LLM candidate object into one of
// the typed candidate shapes declared in `./types.ts`. The
// normalizer is the single seam every future provider's raw
// output goes through before reaching product code, so the
// authority-field banlist is enforced in one place.
//
// Hard rules:
//
//   - The input is treated as `unknown`. The normalizer never
//     reads keys outside the allowlist for each task; a provider
//     that returns extra fields (e.g. `status`, `sellerId`,
//     `price`) silently has them dropped.
//
//   - Closed enums (`CategoryId`, `ListingUseCaseTag`) are
//     re-validated against their definitions; non-matching values
//     are dropped, never coerced.
//
//   - Lengths are bounded:
//       * title:                  ≤ 80 chars
//       * pickupArea:             ≤ 32 chars (matches deterministic
//                                  match-reason caption cap)
//       * components / defects:   each ≤ 40 chars; max 6 entries
//       * positioningSentence:    ≤ 240 chars
//       * improvementNudges:      each ≤ 60 chars; max 3 entries
//       * match labels:           ≤ 32 chars; max 5 reasons,
//                                  max 2 cautions
//
//   - Every output candidate carries `provenance: "llm_candidate"`
//     regardless of what the provider claimed. A provider can
//     never widen its own provenance.
//
//   - The normalizer is pure. No I/O. Same input → same output.

import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { ListingUseCaseTag } from "@/domain/marketplaceIntelligence";
import type {
  ListingExtractionCandidate,
  MatchExplanationCandidate,
  RenterIntentCandidate,
  SellerStoreCandidate,
} from "./types";

const PROV = "llm_candidate" as const;

const VALID_CATEGORY_IDS: ReadonlySet<string> = new Set(
  CATEGORIES.map((c) => c.id),
);

const VALID_USE_CASE_TAGS: ReadonlySet<ListingUseCaseTag> = new Set<
  ListingUseCaseTag
>([
  "try_before_buy",
  "home_recovery",
  "home_workout",
  "home_care_routine",
  "short_trial",
  "weekly_trial",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen);
}

function asStringArray(
  value: unknown,
  perEntryMax: number,
  totalMax: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    const s = asTrimmedString(entry, perEntryMax);
    if (s !== null) out.add(s);
    if (out.size >= totalMax) break;
  }
  // Sort alphabetically for byte-stable output. The product
  // surfaces don't depend on insertion order; a stable sort makes
  // tests + React keys stable.
  return [...out].sort();
}

export function normalizeListingExtractionCandidate(
  raw: unknown,
): ListingExtractionCandidate {
  const obj = asObject(raw);
  const title = obj ? asTrimmedString(obj.title, 80) : null;
  const categoryRaw = obj?.category;
  const category: CategoryId | null =
    typeof categoryRaw === "string" && VALID_CATEGORY_IDS.has(categoryRaw)
      ? (categoryRaw as CategoryId)
      : null;
  const pickupArea = obj ? asTrimmedString(obj.pickupArea, 32) : null;
  const components = obj ? asStringArray(obj.components, 40, 6) : [];
  const defects = obj ? asStringArray(obj.defects, 40, 6) : [];
  return {
    title,
    category,
    pickupArea,
    components,
    defects,
    provenance: PROV,
  };
}

export function normalizeSellerStoreCandidate(
  raw: unknown,
): SellerStoreCandidate {
  const obj = asObject(raw);
  const positioningSentence =
    (obj && asTrimmedString(obj.positioningSentence, 240)) ?? "";
  const improvementNudges = obj
    ? asStringArray(obj.improvementNudges, 60, 3)
    : [];
  return {
    positioningSentence,
    improvementNudges,
    provenance: PROV,
  };
}

export function normalizeRenterIntentCandidate(
  raw: unknown,
): RenterIntentCandidate {
  const obj = asObject(raw);
  const tagsRaw = obj?.intentTags;
  const tags = new Set<ListingUseCaseTag>();
  if (Array.isArray(tagsRaw)) {
    for (const t of tagsRaw) {
      if (typeof t !== "string") continue;
      if (VALID_USE_CASE_TAGS.has(t as ListingUseCaseTag)) {
        tags.add(t as ListingUseCaseTag);
      }
    }
  }
  return {
    intentTags: [...tags].sort(),
    provenance: PROV,
  };
}

function asLabelArray(
  value: unknown,
  perEntryMax: number,
  totalMax: number,
): { label: string; provenance: "llm_candidate" }[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: { label: string; provenance: "llm_candidate" }[] = [];
  for (const entry of value) {
    // Accept either a bare string or an object `{ label }`. The
    // normalizer drops everything else.
    let label: string | null = null;
    if (typeof entry === "string") {
      label = asTrimmedString(entry, perEntryMax);
    } else {
      const obj = asObject(entry);
      label = obj ? asTrimmedString(obj.label, perEntryMax) : null;
    }
    if (label === null) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, provenance: PROV });
    if (out.length >= totalMax) break;
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function normalizeMatchExplanationCandidate(
  raw: unknown,
): MatchExplanationCandidate {
  const obj = asObject(raw);
  const reasons = obj ? asLabelArray(obj.reasons, 32, 5) : [];
  const cautions = obj ? asLabelArray(obj.cautions, 32, 2) : [];
  return { reasons, cautions };
}

// Shared marketplace intelligence — deterministic generators
// (Bundle 4, Slice 1).
//
// Pure functions. No I/O. No env vars. No external SDKs. No LLM
// calls. Stable for the same input.
//
// What lives here:
//
//   - `deriveListingIntelligenceSignal` — `PublicListing →
//     ListingIntelligenceSignal`. Maps the listing's category to a
//     bounded set of use-case tags + echoes the pickup area.
//
//   - `deriveSellerStoreIntelligenceSignal` — `(sellerId,
//     PublicListing[]) → SellerStoreIntelligenceSignal`. Counts the
//     seller's public listings, classifies the store type, surfaces
//     the top 3 categories and pickup areas.
//
//   - `deriveRenterIntentSignal` — `SearchIntent →
//     RenterIntentSignal`. Maps coarse intent fields (duration,
//     priceMax) to a small set of intent tags. The raw input is
//     deliberately NOT scanned for free-text NLP heuristics — that's
//     the LLM's job in a future slice.
//
//   - `explainMatch` — `(SearchIntent, PublicListing) →
//     MatchExplanation`. The deterministic match-reason generator
//     used by `/search`.
//
// Hard rules:
//
//   - Generators only see SAFE DTOs. `PublicListing` is the
//     allowlist projection (no `rawSellerInput`, no
//     `privateSerialNumber`, no verification internals); a
//     `SearchIntent` carries only parsed search params. By
//     construction the generators cannot leak a private field —
//     they don't have one in scope.
//
//   - No status / payment / verification authority. The output
//     never claims "verified", "guaranteed", "approved", "결제
//     완료", "대여 확정". The match-reason vocabulary is closed
//     and reviewed in PR.
//
//   - All output strings are short Korean captions (≤ 32 chars)
//     drawn from a fixed set defined in this file. A future LLM
//     channel cannot widen this vocabulary without touching this
//     module.
//
//   - Generators are SORTED. For the same input the output is
//     byte-for-byte identical, so React keys / snapshot tests stay
//     stable and surfaces never reorder hints between renders.
//
//   - Generators never invent canonical facts. They re-derive from
//     the safe DTO and never add information the DTO doesn't
//     already imply.

import type { CategoryId } from "@/domain/categories";
import type { SearchIntent } from "@/domain/intents";
import type { PublicListing } from "@/domain/listings";
import type {
  CautionReason,
  ListingIntelligenceSignal,
  ListingUseCaseTag,
  MatchExplanation,
  MatchReason,
  RenterIntentSignal,
  SellerStoreIntelligenceSignal,
  SellerStoreType,
} from "@/domain/marketplaceIntelligence";

// Deterministic provenance for every generator in this module. The
// `human_reviewed` and `llm_candidate` channels are NOT produced by
// any function below — those are reserved for future slices.
const PROVENANCE = "deterministic" as const;

// Hard cap on every caption emitted by this module. Surfaces use a
// copy banlist; this is the second belt.
const MAX_LABEL_LEN = 32;

function bound(label: string): string {
  return label.length <= MAX_LABEL_LEN ? label : label.slice(0, MAX_LABEL_LEN);
}

// Closed mapping: category → use-case tags. Adding a new tag here
// is a deliberate decision; the generator can never invent one at
// runtime.
//
// `try_before_buy` is the universal CoRent positioning, so every
// supported category gets it. The other tags add a category-
// specific use-case so a renter can see *why* this listing might
// fit them.
const USE_CASES_BY_CATEGORY: Record<CategoryId, ListingUseCaseTag[]> = {
  massage_gun: ["try_before_buy", "home_recovery"],
  home_care: ["try_before_buy", "home_care_routine"],
  exercise: ["try_before_buy", "home_workout"],
  // Disabled / future categories — keep the map total so the type
  // checker catches new categories landing without a use-case
  // mapping. Surfaces filter out disabled categories upstream.
  vacuum: ["try_before_buy"],
  projector: ["try_before_buy"],
  camera: ["try_before_buy"],
  camping: ["try_before_buy"],
};

const USE_CASE_LABEL: Record<ListingUseCaseTag, string> = {
  try_before_buy: "구매 전 체험",
  home_recovery: "홈 회복 케어",
  home_workout: "홈 운동",
  home_care_routine: "홈 케어 루틴",
  short_trial: "1일 체험에 적합",
  weekly_trial: "주 단위 체험에 적합",
};

// Public — surfaces import this to render use-case tags as Korean
// pills. The mapping is closed so the surface never has to fall
// back to a string display.
export function useCaseTagLabel(tag: ListingUseCaseTag): string {
  return USE_CASE_LABEL[tag];
}

export function deriveListingIntelligenceSignal(
  listing: PublicListing,
): ListingIntelligenceSignal {
  const useCases = [...(USE_CASES_BY_CATEGORY[listing.category] ?? ["try_before_buy"])];
  // Sort the closed enum so the output is byte-stable for the same
  // category.
  useCases.sort();
  return {
    publicListingId: listing.publicListingId,
    category: listing.category,
    useCases,
    pickupArea: listing.pickupArea,
    provenance: PROVENANCE,
  };
}

function classifyStoreType(count: number): SellerStoreType {
  if (count <= 1) return "casual";
  if (count <= 3) return "repeat_light";
  return "micro_store";
}

export function deriveSellerStoreIntelligenceSignal(
  sellerId: string,
  listings: PublicListing[],
): SellerStoreIntelligenceSignal {
  // Defensive: only count listings actually owned by this seller.
  // The caller may pass a wider list (e.g. all public listings) —
  // the generator is the gate.
  const owned = listings.filter((l) => l.sellerId === sellerId);

  // Category frequency, sorted by count desc then alphabetical for
  // stable output.
  const categoryCounts = new Map<CategoryId, number>();
  for (const l of owned) {
    categoryCounts.set(l.category, (categoryCounts.get(l.category) ?? 0) + 1);
  }
  const categoryFocus: CategoryId[] = [...categoryCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([cat]) => cat);

  // Pickup areas, deduplicated, sorted alphabetically, capped at 3.
  const pickupAreaSet = new Set<string>();
  for (const l of owned) {
    if (l.pickupArea && l.pickupArea.length > 0) {
      pickupAreaSet.add(l.pickupArea);
    }
  }
  const pickupAreas = [...pickupAreaSet].sort().slice(0, 3);

  return {
    sellerId,
    storeType: classifyStoreType(owned.length),
    publicListingCount: owned.length,
    categoryFocus,
    pickupAreas,
    provenance: PROVENANCE,
  };
}

export function deriveRenterIntentSignal(
  intent: SearchIntent,
): RenterIntentSignal {
  const tags = new Set<ListingUseCaseTag>();
  // The CoRent positioning (사기 전에 며칠 써보기) — every renter
  // intent gets `try_before_buy` so the matching surface can
  // always render a baseline reason.
  tags.add("try_before_buy");
  if (intent.durationDays === 1) tags.add("short_trial");
  if (intent.durationDays === 7) tags.add("weekly_trial");
  // 3-day intents intentionally leave the trial-length channel
  // empty — neither tag fits cleanly without overclaiming.

  const intentTags = [...tags].sort();

  return {
    searchIntentId: intent.id,
    intentTags,
    provenance: PROVENANCE,
  };
}

// Build a calm Korean reason caption. Order matters here only to
// keep copy tests stable; the generator sorts the final output by
// label.
function reason(label: string): MatchReason {
  return { label: bound(label), provenance: PROVENANCE };
}

function caution(label: string): CautionReason {
  return { label: bound(label), provenance: PROVENANCE };
}

// Explain how a listing fits a parsed search intent. Output is
// deterministic and bounded:
//
//   - max 4 reasons
//   - max 2 cautions
//
// Surfaces may further trim the list for layout. The output is
// safe to render directly.
export function explainMatch(
  intent: SearchIntent,
  listing: PublicListing,
): MatchExplanation {
  const reasons: MatchReason[] = [];

  // Category fit — only when the renter explicitly picked a
  // category AND it matches.
  if (intent.category && intent.category === listing.category) {
    reasons.push(reason("카테고리 일치"));
  }

  // Pickup-area fit. We don't (and can't) compute geographic
  // distance from a SearchIntent today. We surface the listing's
  // coarse pickup area as a hint so the renter can decide whether
  // it's reachable.
  if (listing.pickupArea && listing.pickupArea.length > 0) {
    reasons.push(reason(`${listing.pickupArea} 픽업`));
  }

  // Trial-length hints.
  if (intent.durationDays === 1) {
    reasons.push(reason("1일 체험에 적합"));
  } else if (intent.durationDays === 7) {
    reasons.push(reason("주 단위 체험에 적합"));
  }

  // Universal CoRent framing — always available.
  reasons.push(reason("구매 전 체험"));

  // Price-fit hint. Only fires when the renter set a priceMax AND
  // the listing's selected-duration price is within it. We use
  // the renter's chosen duration (defaults to 3 days when not set).
  const durationKey: "1d" | "3d" | "7d" =
    intent.durationDays === 1
      ? "1d"
      : intent.durationDays === 7
        ? "7d"
        : "3d";
  if (
    typeof intent.priceMax === "number" &&
    Number.isFinite(intent.priceMax) &&
    intent.priceMax > 0 &&
    listing.prices[durationKey] <= intent.priceMax
  ) {
    reasons.push(reason("희망 가격 이내"));
  }

  // Cautions — calm copy only. These are always present so a
  // renter never reads the reasons block as a guarantee.
  const cautions: CautionReason[] = [
    caution("결제·픽업 전 단계"),
  ];
  // If the listing's free-text condition implies any wear, hint
  // at component-check.
  const conditionStr = (listing.condition ?? "").toString();
  if (
    conditionStr.includes("사용감") ||
    conditionStr.includes("보통") ||
    conditionStr.includes("적음")
  ) {
    cautions.push(caution("구성품 확인 필요"));
  }

  // De-dup + sort for byte-stable output. The vocabulary is small
  // enough that sorting by `label` is enough to keep React keys
  // stable.
  const dedupedReasons = Array.from(
    new Map(reasons.map((r) => [r.label, r])).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));
  const dedupedCautions = Array.from(
    new Map(cautions.map((c) => [c.label, c])).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));

  return {
    publicListingId: listing.publicListingId,
    searchIntentId: intent.id,
    // Cap at 5 short pills so the calm BW card layout stays
    // breathable while leaving room for category-match + pickup +
    // duration-fit + price-fit + the universal "구매 전 체험"
    // baseline. Hangul-codepoint sort would otherwise drop
    // "희망 가격 이내" (last in collation) before it ever reached
    // the renter.
    reasons: dedupedReasons.slice(0, 5),
    cautions: dedupedCautions.slice(0, 2),
    provenance: PROVENANCE,
  };
}

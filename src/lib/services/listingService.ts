// Listing service. Builds ListingIntents from seller natural-language input,
// persists drafts, and submits for human review.

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import {
  EMPTY_VERIFICATION_CHECKS,
  type ListingIntent,
  type VerificationIntent,
} from "@/domain/intents";
import type { ItemCondition } from "@/domain/products";
import { mockAIParser } from "@/lib/adapters/ai/mockAIParserAdapter";
import { assertListingOwnedBy } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";
import { calculateRecommendedPriceTable } from "@/lib/pricing";
import { generateListingSafetyCode } from "@/lib/safetyCode";
import { validateListingDraft } from "@/lib/validators/listingInput";

type DraftFromInputArgs = {
  sellerId: string;
  rawInput: string;
  fallbackCategory?: CategoryId;
  fallbackEstimatedValue?: number;
  // When provided, the listing + verification ids and the safety code
  // are derived deterministically from this seed. Used by the seller
  // registration page's SSR initial state to avoid hydration mismatch
  // between the server-rendered safety code and the client-rendered
  // one. Reseed-omitted calls (e.g. user clicks "AI로 다시 추출") still
  // generate fresh random ids.
  idSeed?: string;
  // Slice A PR 5E — explicit listing id override. When supplied,
  // overrides both `idSeed` and the random `generateId("li")`
  // fallback. Used by `chatListingIntakeService` so the listing id
  // can match the writer's preferred format (uuid in supabase
  // mode; `li_<16hex>` in local mode). Local callers leave this
  // unset and keep the existing id format.
  id?: string;
  // The createdAt/updatedAt timestamps default to `nowIso()`. Tests and
  // SSR seed the value to keep snapshots stable.
  at?: string;
};

export type DraftListing = ListingIntent;

function buildVerification(seedId: string, idSeed?: string): VerificationIntent {
  return {
    id: idSeed ? `vi_${idSeed}` : generateId("vi"),
    safetyCode: generateListingSafetyCode(seedId),
    status: "pending",
    checks: { ...EMPTY_VERIFICATION_CHECKS },
  };
}

export const listingService = {
  draftFromInput({
    sellerId,
    rawInput,
    fallbackCategory = "massage_gun",
    fallbackEstimatedValue = 200000,
    idSeed,
    id: providedId,
    at: providedAt,
  }: DraftFromInputArgs): DraftListing {
    const parsed = mockAIParser.parseSellerInput(rawInput);
    // Slice A PR 5E — explicit `id` wins over `idSeed` wins over
    // random. The verification id stays on the existing
    // `vi_<...>` format because the Phase 2 schema generates its
    // own uuid for `listing_verifications.id` and the read-back
    // returns the canonical value; the in-memory `vi_` is local
    // metadata only.
    const id = providedId ?? (idSeed ? `li_${idSeed}` : generateId("li"));
    const at = providedAt ?? nowIso();
    const estimatedValue = parsed.estimatedValue ?? fallbackEstimatedValue;
    const prices = calculateRecommendedPriceTable(estimatedValue);
    return {
      id,
      sellerId,
      status: "ai_extracted",
      rawSellerInput: rawInput,
      item: {
        name: parsed.itemName ?? "이름 미입력",
        category: parsed.category ?? fallbackCategory,
        estimatedValue,
        condition: (parsed.condition ?? "lightly_used") as ItemCondition,
        components: parsed.components ?? [],
        defects: parsed.defects,
      },
      pricing: {
        oneDay: prices["1d"],
        threeDays: prices["3d"],
        sevenDays: prices["7d"],
      },
      verification: buildVerification(id, idSeed),
      createdAt: at,
      updatedAt: at,
    };
  },

  applyEdits(
    listing: ListingIntent,
    patch: {
      itemName?: string;
      category?: CategoryId;
      estimatedValue?: number;
      condition?: ItemCondition;
      components?: string[];
      defects?: string;
      privateSerialNumber?: string;
      pickupArea?: string;
      sellerAdjustedPrices?: { "1d": number; "3d": number; "7d": number };
      durationFocus?: DurationDays;
    },
  ): ListingIntent {
    const estimatedValue =
      patch.estimatedValue ?? listing.item.estimatedValue;
    const recommended =
      patch.estimatedValue !== undefined &&
      patch.estimatedValue !== listing.item.estimatedValue &&
      !patch.sellerAdjustedPrices
        ? calculateRecommendedPriceTable(patch.estimatedValue)
        : null;
    return {
      ...listing,
      item: {
        ...listing.item,
        name: patch.itemName ?? listing.item.name,
        category: patch.category ?? listing.item.category,
        estimatedValue,
        condition: patch.condition ?? listing.item.condition,
        components: patch.components ?? listing.item.components,
        defects: patch.defects ?? listing.item.defects,
        privateSerialNumber:
          patch.privateSerialNumber ?? listing.item.privateSerialNumber,
        pickupArea: patch.pickupArea ?? listing.item.pickupArea,
      },
      pricing: patch.sellerAdjustedPrices
        ? {
            oneDay: patch.sellerAdjustedPrices["1d"],
            threeDays: patch.sellerAdjustedPrices["3d"],
            sevenDays: patch.sellerAdjustedPrices["7d"],
            sellerAdjusted: true,
          }
        : recommended
          ? {
              oneDay: recommended["1d"],
              threeDays: recommended["3d"],
              sevenDays: recommended["7d"],
              sellerAdjusted: false,
            }
          : listing.pricing,
      verification: {
        ...listing.verification,
        checks: {
          ...listing.verification.checks,
          privateSerialStored: patch.privateSerialNumber
            ? true
            : listing.verification.checks.privateSerialStored,
        },
      },
      updatedAt: nowIso(),
    };
  },

  toggleVerificationCheck(
    listing: ListingIntent,
    key: keyof ListingIntent["verification"]["checks"],
    value: boolean,
  ): ListingIntent {
    const checks = { ...listing.verification.checks, [key]: value };
    return {
      ...listing,
      verification: { ...listing.verification, checks },
      updatedAt: nowIso(),
    };
  },

  isVerificationComplete(listing: ListingIntent): boolean {
    const c = listing.verification.checks;
    // MVP: serial is optional; require photo proofs + safety code.
    return (
      c.frontPhoto &&
      c.backPhoto &&
      c.componentsPhoto &&
      c.workingProof &&
      c.safetyCodePhoto
    );
  },

  async saveDraft(listing: ListingIntent): Promise<void> {
    const next: ListingIntent = {
      ...listing,
      status: listing.status === "ai_extracted" ? "draft" : listing.status,
      updatedAt: nowIso(),
    };
    // Fail fast on malformed shape — defends the local-write boundary
    // against AI-generated edits that drift past the bounds the future
    // server-side adapter will enforce. Throws ListingInputError.
    validateListingDraft(next);
    await getPersistence().saveListingIntent(next);
  },

  async submitForReview(listing: ListingIntent): Promise<ListingIntent> {
    const next: ListingIntent = {
      ...listing,
      status: this.isVerificationComplete(listing)
        ? "human_review_pending"
        : "verification_incomplete",
      verification: {
        ...listing.verification,
        status: this.isVerificationComplete(listing)
          ? "human_review_pending"
          : "pending",
      },
      updatedAt: nowIso(),
    };
    validateListingDraft(next);
    await getPersistence().saveListingIntent(next);
    return next;
  },

  async list(): Promise<ListingIntent[]> {
    return getPersistence().listListingIntents();
  },

  // Phase 1.9: actor-aware seller-owned write for persisted listing
  // drafts. Reloads the canonical persisted listing by id, runs
  // `assertListingOwnedBy` against the canonical `sellerId`, applies
  // only safe fields via `applyEdits`, validates the result, and
  // persists the canonical record.
  //
  // Hard rules:
  //   - The caller-supplied `actorSellerId` is the only authorization
  //     signal. The patch never includes `sellerId`, `id`, `status`,
  //     `verification`, `createdAt`, or `updatedAt` — those are domain
  //     fields owned by the listing lifecycle, not seller edits.
  //   - The static PRODUCTS / legacy LISTED_ITEMS arrays are never
  //     mutated by this method; the surface that exposes the edit
  //     button must filter to persisted ListingIntent rows only.
  //   - Status changes (e.g. `human_review_pending → approved`) are
  //     out of scope here. Only the `applyEdits` patch shape is
  //     accepted; status is preserved from the canonical record.
  //
  // Throws:
  //   - Error("listing_not_found") when the id has no persisted record.
  //   - OwnershipError when `actorSellerId` does not own the listing.
  //   - ListingInputError when the merged result fails validation.
  async updateOwnListingDraft(
    listingId: string,
    actorSellerId: string,
    patch: Parameters<typeof this.applyEdits>[1],
  ): Promise<ListingIntent> {
    if (typeof listingId !== "string" || listingId.length === 0) {
      throw new Error("listing_not_found");
    }
    const persistence = getPersistence();
    const canonical = await persistence.getListingIntent(listingId);
    if (!canonical) throw new Error("listing_not_found");
    // Ownership runs against the CANONICAL sellerId. A forged patch
    // that supplies a different sellerId is silently dropped because
    // `applyEdits` does not accept a `sellerId` field.
    assertListingOwnedBy(canonical, actorSellerId);
    const merged = listingService.applyEdits(canonical, patch);
    // Preserve canonical id/sellerId/status/createdAt — `applyEdits`
    // already does, but the explicit copy below documents the contract.
    const next: ListingIntent = {
      ...merged,
      id: canonical.id,
      sellerId: canonical.sellerId,
      status: canonical.status,
      createdAt: canonical.createdAt,
    };
    validateListingDraft(next);
    await persistence.saveListingIntent(next);
    return next;
  },
};

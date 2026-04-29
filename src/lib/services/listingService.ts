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
import { getPersistence } from "@/lib/adapters/persistence";
import { generateId, nowIso } from "@/lib/ids";
import { calculateRecommendedPriceTable } from "@/lib/pricing";
import { generateListingSafetyCode } from "@/lib/safetyCode";

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
    at: providedAt,
  }: DraftFromInputArgs): DraftListing {
    const parsed = mockAIParser.parseSellerInput(rawInput);
    const id = idSeed ? `li_${idSeed}` : generateId("li");
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
    await getPersistence().saveListingIntent({
      ...listing,
      status: listing.status === "ai_extracted" ? "draft" : listing.status,
      updatedAt: nowIso(),
    });
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
    await getPersistence().saveListingIntent(next);
    return next;
  },

  async list(): Promise<ListingIntent[]> {
    return getPersistence().listListingIntents();
  },
};

// Product domain type. Pricing fields stay on the product for now (used
// across the static MVP) but can be derived from `estimatedValue` via the
// pricing module once we move to seller-driven prices.

import type { CategoryId } from "@/domain/categories";
import type { DurationKey } from "@/domain/durations";

export type ItemCondition = "new" | "like_new" | "lightly_used" | "used";

export type Product = {
  id: string;
  name: string;
  category: CategoryId;
  estimatedValue: number;
  prices: Record<DurationKey, number>;
  pickupArea: string;
  region: "seoul";
  condition: string;
  components: string[];
  defects: string;
  sellerId: string;
  sellerName: string;
  sellerTrustNote: string;
  trust: {
    photoVerified: boolean;
    safetyCode: string;
    humanReviewed: boolean;
    serialOnFile: boolean;
  };
  summary: string;
  hero: { initials: string };
};

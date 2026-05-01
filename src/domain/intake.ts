// Chat-to-listing intake domain types. The seller describes an item
// in a chat-style flow; the system produces a structured ListingIntent
// draft they can review and edit later. Trust verification stays
// separate and is owned by `verification` on the resulting
// ListingIntent.
//
// Hard rules:
//
//   - All money / settlement / payout fields belong on RentalIntent
//     and never appear here. An IntakeSession is a private seller
//     workspace.
//   - Raw chat text is private. It is never copied into PublicListing
//     (`publicListingService` enforces an explicit allowlist).
//   - `sellerId` is the canonical owner. The intake service authorizes
//     writes against an actor seller id and never trusts a value
//     supplied by the caller.

import type { CategoryId } from "@/domain/categories";
import type { ItemCondition } from "@/domain/products";

export type IntakeSessionStatus = "drafting" | "draft_created" | "abandoned";

export type IntakeMessageRole = "seller" | "assistant" | "system";

export type IntakeSession = {
  id: string;
  sellerId: string;
  status: IntakeSessionStatus;
  // When the session has produced a persisted ListingIntent draft this
  // points at it. Absent while the seller is still drafting.
  listingIntentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type IntakeMessage = {
  id: string;
  sessionId: string;
  role: IntakeMessageRole;
  content: string;
  createdAt: string;
};

// Fields the extractor knows how to look for. Anything missing from
// the seller's input lands in `IntakeExtraction.missingFields` so the
// dashboard can surface "검토 후 수정 필요" copy instead of inventing
// values.
export type IntakeExtractionField =
  | "itemName"
  | "category"
  | "pickupArea"
  | "estimatedValue"
  | "condition"
  | "defects"
  | "oneDayPrice";

export type IntakeExtraction = {
  sessionId: string;
  itemName?: string;
  category?: CategoryId;
  pickupArea?: string;
  condition?: ItemCondition;
  defects?: string;
  components?: string[];
  estimatedValue?: number;
  // Suggestion-only seller-stated daily price. The persisted listing
  // recomputes the full price table from `estimatedValue` via the
  // shared pricing module — these fields are reference values for the
  // assistant summary, not promises.
  oneDayPrice?: number;
  threeDaysPrice?: number;
  sevenDaysPrice?: number;
  missingFields: IntakeExtractionField[];
  createdAt: string;
};

// Client-facing listing validator. Used by the listing service before any
// write to the local persistence adapter.
//
// Why a separate module from the Phase 2 server-side validators in
// `src/server/persistence/supabase/validators.ts`:
//
//   - The server-side validators run inside the service-role write path
//     and reject any client-supplied id, status, or amount as a defense
//     against an untrusted caller. They are strict (UUIDs only, mirror DB
//     CHECK constraints).
//
//   - This module defends the in-memory + localStorage path. Ids here
//     are MVP shape (`li_<random>`, `li_demo_*`), not UUIDs. The point
//     is to fail fast on shapes that would be corrupt or malicious if
//     they ever leaked into a future real-DB write — and to give AI-
//     generated edits a single, obvious wall to fail at.
//
// Hard rules: throws `ListingInputError` on first violation. The caller
// is expected to surface a safe user-facing message (e.g. a Korean copy
// string) and log the `code` field separately.

import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { ListingIntent, ListingStatus } from "@/domain/intents";
import type { ItemCondition } from "@/domain/products";

const CATEGORY_IDS: ReadonlySet<string> = new Set(CATEGORIES.map((c) => c.id));

const LISTING_STATUSES: ReadonlySet<ListingStatus> = new Set<ListingStatus>([
  "draft",
  "ai_extracted",
  "verification_incomplete",
  "human_review_pending",
  "approved",
  "rejected",
]);

const ITEM_CONDITIONS: ReadonlySet<ItemCondition> = new Set<ItemCondition>([
  "new",
  "like_new",
  "lightly_used",
  "used",
]);

// Bounds. Slightly more permissive than the server-side validator so the
// in-browser draft can hold a longer free-text input without crashing the
// edit flow; the server-side path will reject anything past its own caps
// when the listing actually goes to DB.
const ITEM_NAME_MAX = 120;
const RAW_INPUT_MAX = 2000;
const DEFECTS_MAX = 240;
const PICKUP_AREA_MAX = 60;
const COMPONENTS_MAX = 12;
const COMPONENT_ENTRY_MAX = 60;
const PRICE_MAX = 10_000_000;
const VALUE_MAX = 100_000_000;
const SERIAL_MAX = 80;

export class ListingInputError extends Error {
  readonly code:
    | "id_required"
    | "seller_id_required"
    | "status_invalid"
    | "item_name_invalid"
    | "category_invalid"
    | "estimated_value_invalid"
    | "condition_invalid"
    | "components_invalid"
    | "defects_too_long"
    | "pickup_area_too_long"
    | "private_serial_too_long"
    | "price_invalid"
    | "raw_input_too_long";
  constructor(code: ListingInputError["code"], message: string) {
    super(message);
    this.name = "ListingInputError";
    this.code = code;
  }
}

function isInteger(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n)
  );
}

function isNonEmptyString(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

// Throws on first violation. Returns void on success.
//
// The caller passes the full ListingIntent (or a draft-shaped object).
// The function does NOT validate the verification subtree — verification
// state is owned by `listingService.toggleVerificationCheck` /
// `submitForReview` and bounded by its own type, not by user input.
export function validateListingDraft(listing: ListingIntent): void {
  if (!isNonEmptyString(listing.id)) {
    throw new ListingInputError("id_required", "listing id is required");
  }
  if (!isNonEmptyString(listing.sellerId)) {
    throw new ListingInputError(
      "seller_id_required",
      "listing sellerId is required",
    );
  }
  if (!LISTING_STATUSES.has(listing.status)) {
    throw new ListingInputError(
      "status_invalid",
      `listing status not allowed: ${String(listing.status)}`,
    );
  }

  const item = listing.item;
  if (!isNonEmptyString(item.name) || item.name.length > ITEM_NAME_MAX) {
    throw new ListingInputError(
      "item_name_invalid",
      `item name must be 1..${ITEM_NAME_MAX} chars`,
    );
  }
  if (!CATEGORY_IDS.has(item.category as CategoryId)) {
    throw new ListingInputError(
      "category_invalid",
      `category not allowed: ${String(item.category)}`,
    );
  }
  if (
    !isInteger(item.estimatedValue) ||
    item.estimatedValue < 0 ||
    item.estimatedValue > VALUE_MAX
  ) {
    throw new ListingInputError(
      "estimated_value_invalid",
      "estimated value out of bounds",
    );
  }
  if (!ITEM_CONDITIONS.has(item.condition)) {
    throw new ListingInputError(
      "condition_invalid",
      `condition not allowed: ${String(item.condition)}`,
    );
  }
  if (!Array.isArray(item.components) || item.components.length > COMPONENTS_MAX) {
    throw new ListingInputError(
      "components_invalid",
      `components must be an array of <= ${COMPONENTS_MAX} entries`,
    );
  }
  for (const c of item.components) {
    if (typeof c !== "string" || c.length > COMPONENT_ENTRY_MAX) {
      throw new ListingInputError(
        "components_invalid",
        `components entries must be strings <= ${COMPONENT_ENTRY_MAX} chars`,
      );
    }
  }
  if (item.defects !== undefined && item.defects !== null) {
    if (typeof item.defects !== "string" || item.defects.length > DEFECTS_MAX) {
      throw new ListingInputError(
        "defects_too_long",
        `defects must be <= ${DEFECTS_MAX} chars`,
      );
    }
  }
  if (item.pickupArea !== undefined && item.pickupArea !== null) {
    if (
      typeof item.pickupArea !== "string" ||
      item.pickupArea.length > PICKUP_AREA_MAX
    ) {
      throw new ListingInputError(
        "pickup_area_too_long",
        `pickup area must be <= ${PICKUP_AREA_MAX} chars`,
      );
    }
  }
  if (
    item.privateSerialNumber !== undefined &&
    item.privateSerialNumber !== null
  ) {
    if (
      typeof item.privateSerialNumber !== "string" ||
      item.privateSerialNumber.length > SERIAL_MAX
    ) {
      throw new ListingInputError(
        "private_serial_too_long",
        `private serial must be <= ${SERIAL_MAX} chars`,
      );
    }
  }

  const p = listing.pricing;
  for (const [label, val] of [
    ["price_one_day", p.oneDay],
    ["price_three_days", p.threeDays],
    ["price_seven_days", p.sevenDays],
  ] as const) {
    if (!isInteger(val) || val < 0 || val > PRICE_MAX) {
      throw new ListingInputError(
        "price_invalid",
        `${label} out of bounds`,
      );
    }
  }

  if (listing.rawSellerInput !== undefined && listing.rawSellerInput !== null) {
    if (
      typeof listing.rawSellerInput !== "string" ||
      listing.rawSellerInput.length > RAW_INPUT_MAX
    ) {
      throw new ListingInputError(
        "raw_input_too_long",
        `raw input must be <= ${RAW_INPUT_MAX} chars`,
      );
    }
  }
}

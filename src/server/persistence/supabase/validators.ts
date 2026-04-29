// Server-side validators. The Phase 2 adapters never trust client-supplied
// values for ownerId, status, role, or numeric amounts. These helpers
// produce a typed Result so the adapter can early-return rather than
// throwing — keeping the call site readable and the failure mode explicit.
//
// The validators here mirror (and are slightly stricter than) the
// CHECK constraints in supabase/migrations/20260430120000_phase2_marketplace_draft.sql.
// If the two ever drift, the adapter rejects first; the database catches
// anything that slips through.

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type {
  ListingStatus,
  RentalIntentStatus,
  VerificationStatus,
} from "@/domain/intents";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const CATEGORY_IDS: ReadonlySet<CategoryId> = new Set<CategoryId>([
  "massage_gun",
  "home_care",
  "exercise",
  "vacuum",
  "projector",
  "camera",
  "camping",
]);

const LISTING_STATUSES: ReadonlySet<ListingStatus> = new Set<ListingStatus>([
  "draft",
  "ai_extracted",
  "verification_incomplete",
  "human_review_pending",
  "approved",
  "rejected",
]);

const VERIFICATION_STATUSES: ReadonlySet<VerificationStatus> = new Set<VerificationStatus>([
  "not_started",
  "pending",
  "submitted",
  "ai_checked",
  "human_review_pending",
  "verified",
  "rejected",
]);

const RENTAL_STATUSES: ReadonlySet<RentalIntentStatus> = new Set<RentalIntentStatus>([
  "draft",
  "requested",
  "seller_approved",
  "payment_pending",
  "paid",
  "pickup_confirmed",
  "return_pending",
  "return_confirmed",
  "settlement_ready",
  "settled",
  "cancelled",
  "payment_failed",
  "seller_cancelled",
  "borrower_cancelled",
  "pickup_missed",
  "return_overdue",
  "damage_reported",
  "dispute_opened",
  "settlement_blocked",
]);

const ALLOWED_DURATIONS: ReadonlySet<number> = new Set([1, 3, 7]);

// UUID v4-ish (we accept any RFC 4122 shape — that's what Postgres
// `uuid` accepts too). The string check defends against the adapter
// being passed a numeric or unsanitized id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFETY_CODE_RE = /^[A-Z]-[0-9]{3}$/;

const PRICE_MAX = 10_000_000;
const VALUE_MAX = 100_000_000;
const ITEM_NAME_MAX = 80;
const PICKUP_AREA_MAX = 60;
const COMPONENTS_MAX = 12;
const DEFECT_MAX = 240;
const DISPLAY_NAME_MAX = 60;

export function validateUuid(s: unknown): ValidationResult<string> {
  if (typeof s !== "string") return { ok: false, error: "uuid must be a string" };
  if (!UUID_RE.test(s)) return { ok: false, error: "uuid shape is invalid" };
  return { ok: true, value: s };
}

export function validateOptionalUuid(s: unknown): ValidationResult<string | null> {
  if (s === null || s === undefined) return { ok: true, value: null };
  return validateUuid(s);
}

export function validateCategory(c: unknown): ValidationResult<CategoryId> {
  if (typeof c !== "string" || !CATEGORY_IDS.has(c as CategoryId)) {
    return { ok: false, error: "category not allowed" };
  }
  return { ok: true, value: c as CategoryId };
}

export function validateListingStatus(s: unknown): ValidationResult<ListingStatus> {
  if (typeof s !== "string" || !LISTING_STATUSES.has(s as ListingStatus)) {
    return { ok: false, error: "listing status not allowed" };
  }
  return { ok: true, value: s as ListingStatus };
}

export function validateVerificationStatus(s: unknown): ValidationResult<VerificationStatus> {
  if (typeof s !== "string" || !VERIFICATION_STATUSES.has(s as VerificationStatus)) {
    return { ok: false, error: "verification status not allowed" };
  }
  return { ok: true, value: s as VerificationStatus };
}

export function validateRentalStatus(s: unknown): ValidationResult<RentalIntentStatus> {
  if (typeof s !== "string" || !RENTAL_STATUSES.has(s as RentalIntentStatus)) {
    return { ok: false, error: "rental status not allowed" };
  }
  return { ok: true, value: s as RentalIntentStatus };
}

export function validateDurationDays(n: unknown): ValidationResult<DurationDays> {
  if (typeof n !== "number" || !ALLOWED_DURATIONS.has(n)) {
    return { ok: false, error: "duration must be 1, 3, or 7" };
  }
  return { ok: true, value: n as DurationDays };
}

export function validatePrice(n: unknown, label: string): ValidationResult<number> {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${label} must be an integer` };
  }
  if (n < 0 || n > PRICE_MAX) {
    return { ok: false, error: `${label} out of bounds` };
  }
  return { ok: true, value: n };
}

export function validateEstimatedValue(n: unknown): ValidationResult<number> {
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: "estimated value must be an integer" };
  }
  if (n < 0 || n > VALUE_MAX) {
    return { ok: false, error: "estimated value out of bounds" };
  }
  return { ok: true, value: n };
}

export function validateBoundedText(
  s: unknown,
  label: string,
  max: number,
  required = false,
): ValidationResult<string | null> {
  if (s === null || s === undefined) {
    if (required) return { ok: false, error: `${label} required` };
    return { ok: true, value: null };
  }
  if (typeof s !== "string") {
    return { ok: false, error: `${label} must be a string` };
  }
  if (required && s.length === 0) {
    return { ok: false, error: `${label} required` };
  }
  if (s.length > max) {
    return { ok: false, error: `${label} too long` };
  }
  return { ok: true, value: s };
}

export function validateRequiredText(
  s: unknown,
  label: string,
  max: number,
): ValidationResult<string> {
  const r = validateBoundedText(s, label, max, true);
  if (!r.ok) return r;
  // r.value is guaranteed non-null because required=true.
  return { ok: true, value: r.value as string };
}

export function validateItemName(s: unknown): ValidationResult<string> {
  return validateRequiredText(s, "item name", ITEM_NAME_MAX);
}

export function validatePickupArea(s: unknown): ValidationResult<string | null> {
  return validateBoundedText(s, "pickup area", PICKUP_AREA_MAX, false);
}

export function validateDisplayName(s: unknown): ValidationResult<string | null> {
  return validateBoundedText(s, "display name", DISPLAY_NAME_MAX, false);
}

export function validateDefects(s: unknown): ValidationResult<string | null> {
  return validateBoundedText(s, "defects", DEFECT_MAX, false);
}

export function validateComponents(arr: unknown): ValidationResult<string[]> {
  if (!Array.isArray(arr)) {
    return { ok: false, error: "components must be an array" };
  }
  if (arr.length > COMPONENTS_MAX) {
    return { ok: false, error: "components has too many entries" };
  }
  for (const v of arr) {
    if (typeof v !== "string") {
      return { ok: false, error: "components entries must be strings" };
    }
    if (v.length > 60) {
      return { ok: false, error: "components entry too long" };
    }
  }
  return { ok: true, value: arr as string[] };
}

export function validateSafetyCode(s: unknown): ValidationResult<string> {
  if (typeof s !== "string" || !SAFETY_CODE_RE.test(s)) {
    return { ok: false, error: "safety code shape is invalid" };
  }
  return { ok: true, value: s };
}

export function validateItemCondition(s: unknown): ValidationResult<
  "new" | "like_new" | "lightly_used" | "used"
> {
  if (
    s === "new" ||
    s === "like_new" ||
    s === "lightly_used" ||
    s === "used"
  ) {
    return { ok: true, value: s };
  }
  return { ok: false, error: "item condition not allowed" };
}

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
  IntakeExtractionField,
  IntakeMessageRole,
  IntakeSessionStatus,
} from "@/domain/intake";
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

// --------------------------------------------------------------
// Chat-to-listing intake validators
//
// Mirrors the schema in
// `supabase/migrations/20260502120000_phase2_intake_draft.sql` and the
// TS domain in `src/domain/intake.ts`. These are shape validators
// only — actor identity / ownership / authorization remain the
// service-layer concern.
// --------------------------------------------------------------

const INTAKE_SESSION_STATUSES: ReadonlySet<IntakeSessionStatus> =
  new Set<IntakeSessionStatus>(["drafting", "draft_created", "abandoned"]);

const INTAKE_MESSAGE_ROLES: ReadonlySet<IntakeMessageRole> =
  new Set<IntakeMessageRole>(["seller", "assistant", "system"]);

// Mirrors the `IntakeExtractionField` TS union. Anything outside this
// set is rejected on write and silently filtered on read (see
// `validateMissingFieldsForWrite` and `normalizeMissingFieldsForRead`).
const INTAKE_EXTRACTION_FIELDS: ReadonlySet<IntakeExtractionField> =
  new Set<IntakeExtractionField>([
    "itemName",
    "category",
    "pickupArea",
    "estimatedValue",
    "condition",
    "defects",
    "oneDayPrice",
  ]);

const INTAKE_MESSAGE_CONTENT_MAX = 2000;

export function validateIntakeSessionStatus(
  s: unknown,
): ValidationResult<IntakeSessionStatus> {
  if (
    typeof s !== "string" ||
    !INTAKE_SESSION_STATUSES.has(s as IntakeSessionStatus)
  ) {
    return { ok: false, error: "intake session status not allowed" };
  }
  return { ok: true, value: s as IntakeSessionStatus };
}

export function validateIntakeMessageRole(
  s: unknown,
): ValidationResult<IntakeMessageRole> {
  if (
    typeof s !== "string" ||
    !INTAKE_MESSAGE_ROLES.has(s as IntakeMessageRole)
  ) {
    return { ok: false, error: "intake message role not allowed" };
  }
  return { ok: true, value: s as IntakeMessageRole };
}

export function validateIntakeMessageContent(
  s: unknown,
): ValidationResult<string> {
  return validateRequiredText(s, "intake content", INTAKE_MESSAGE_CONTENT_MAX);
}

// Write path: reject any unknown entry, reject duplicates, reject
// non-array shapes. The repository never silently rewrites caller
// intent on the way in — fail closed.
export function validateMissingFieldsForWrite(
  arr: unknown,
): ValidationResult<IntakeExtractionField[]> {
  if (!Array.isArray(arr)) {
    return { ok: false, error: "missing_fields must be an array" };
  }
  const seen = new Set<IntakeExtractionField>();
  const out: IntakeExtractionField[] = [];
  for (const v of arr) {
    if (
      typeof v !== "string" ||
      !INTAKE_EXTRACTION_FIELDS.has(v as IntakeExtractionField)
    ) {
      return { ok: false, error: `missing_fields entry not allowed: ${String(v)}` };
    }
    const f = v as IntakeExtractionField;
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return { ok: true, value: out };
}

// Read path: tolerate enum drift. The persisted JSONB array might
// carry values that were valid in a future schema or that came from
// a stale import; we filter unknown / wrong-typed entries silently
// rather than failing the whole row read. Extraction is best-effort
// derived data — the seller can re-extract from the raw chat if a
// row is incomplete. Order is preserved; duplicates are dropped.
export function normalizeMissingFieldsForRead(
  raw: unknown,
): IntakeExtractionField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<IntakeExtractionField>();
  const out: IntakeExtractionField[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    if (!INTAKE_EXTRACTION_FIELDS.has(v as IntakeExtractionField)) continue;
    const f = v as IntakeExtractionField;
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

export function validateOptionalEstimatedValue(
  n: unknown,
): ValidationResult<number | null> {
  if (n === null || n === undefined) return { ok: true, value: null };
  return validateEstimatedValue(n) as ValidationResult<number | null>;
}

export function validateOptionalPrice(
  n: unknown,
  label: string,
): ValidationResult<number | null> {
  if (n === null || n === undefined) return { ok: true, value: null };
  return validatePrice(n, label) as ValidationResult<number | null>;
}

export function validateOptionalItemName(
  s: unknown,
): ValidationResult<string | null> {
  // Extraction may produce no item name; the column is nullable. The
  // length cap mirrors the listing validator (120) which is wider
  // than the listings.item_name SQL cap (80) intentionally — the
  // extraction can hold a longer raw guess; the listing edit step
  // tightens it.
  return validateBoundedText(s, "extraction item_name", 120, false);
}

export function validateOptionalItemCondition(
  s: unknown,
): ValidationResult<"new" | "like_new" | "lightly_used" | "used" | null> {
  if (s === null || s === undefined) return { ok: true, value: null };
  return validateItemCondition(s) as ValidationResult<
    "new" | "like_new" | "lightly_used" | "used" | null
  >;
}

export function validateOptionalCategory(
  s: unknown,
): ValidationResult<CategoryId | null> {
  if (s === null || s === undefined) return { ok: true, value: null };
  return validateCategory(s) as ValidationResult<CategoryId | null>;
}

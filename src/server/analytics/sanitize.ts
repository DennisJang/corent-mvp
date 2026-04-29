// Phase 1 analytics sanitizer. The only writer to `growth_events` goes
// through this module. The allow-list per event type is the primary
// defense; the deny-list regex pass is belt-and-suspenders. Per
// `docs/phase1_validation_beta_plan.md` and
// `docs/corent_security_review_phase1_2026-04-30.md`.
//
// Server-only: do not import from `src/components/**` or any client
// component. Sanitizer must never log raw inputs.

// --------------------------------------------------------------
// Closed sets (event types and property dictionaries)
// --------------------------------------------------------------

export const ALLOWED_EVENT_TYPES = [
  "landing_visited",
  "search_submitted",
  "search_filter_changed",
  "category_chip_clicked",
  "listing_view",
  "duration_selected",
  "request_clicked",
  "request_submitted",
  "seller_registration_started",
  "seller_registration_submitted",
  "dashboard_cta_clicked",
  "trust_explanation_opened",
  "waitlist_opt_in",
] as const;
export type AllowedEventType = (typeof ALLOWED_EVENT_TYPES)[number];

// Sentinel events emitted by the sanitizer itself in response to specific
// boundary conditions. Not in the allow-list above because clients are not
// permitted to send them; the sanitizer is the only producer.
export const SENTINEL_EVENT_TYPES = [
  "analytics_denied",
  "analytics_oversized",
] as const;
export type SentinelEventType = (typeof SENTINEL_EVENT_TYPES)[number];

export type StoredEventType = AllowedEventType | SentinelEventType;

export const CATEGORIES = [
  "massage_gun",
  "home_care",
  "exercise",
  "vacuum",
  "projector",
  "camera",
  "camping",
  "unknown",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const REGIONS_COARSE = [
  "seoul",
  "busan",
  "incheon",
  "gyeonggi",
  "other_metro",
  "non_metro",
  "unknown",
] as const;
export type RegionCoarse = (typeof REGIONS_COARSE)[number];

export const PRICE_BANDS = [
  "under_10k",
  "10k_30k",
  "30k_70k",
  "70k_150k",
  "over_150k",
  "unknown",
] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export const DEVICE_CLASSES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const REFERRER_KINDS = ["direct", "search", "social", "other", "unknown"] as const;
export type ReferrerKind = (typeof REFERRER_KINDS)[number];

export const LANGUAGES = ["ko", "en", "other", "unknown"] as const;
export type Language = (typeof LANGUAGES)[number];

export const FILTER_KINDS = ["category", "duration", "price", "reset", "unknown"] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export const CONDITIONS = [
  "new",
  "like_new",
  "lightly_used",
  "used",
  "unknown",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const DURATION_DAYS = [1, 3, 7] as const;
export type DurationDays = (typeof DURATION_DAYS)[number];

export const CONSENT_STATES = ["granted", "denied", "unknown"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

// CTA / panel kinds — closed by enumerating the surfaces that exist today.
// Adding a new CTA requires editing this list and the corresponding doc.
export const CTA_KINDS = [
  "approve_request",
  "decline_request",
  "advance_active",
  "seed_mock_data",
  "clear_local_data",
  "register_new_item",
  "open_request",
  "unknown",
] as const;
export type CtaKind = (typeof CTA_KINDS)[number];

export const PANEL_KINDS = [
  "trust_summary",
  "safety_code",
  "deposit_explanation",
  "settlement_explanation",
  "unknown",
] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

// --------------------------------------------------------------
// Allow-list per event type. Any property not in this list is dropped.
// --------------------------------------------------------------

const ALLOWED_PROPERTIES: Record<AllowedEventType, readonly string[]> = {
  landing_visited: ["referrer_kind", "device_class", "language"],
  search_submitted: [
    "category",
    "duration_days",
    "region_coarse",
    "price_band",
    "had_query",
  ],
  search_filter_changed: ["filter_kind", "category", "duration_days"],
  category_chip_clicked: ["category"],
  listing_view: ["category", "duration_days_default", "price_band_3d"],
  duration_selected: ["category", "duration_days"],
  request_clicked: ["category", "duration_days", "price_band"],
  request_submitted: [
    "category",
    "duration_days",
    "price_band",
    "had_pickup_label",
  ],
  seller_registration_started: ["device_class"],
  seller_registration_submitted: [
    "category",
    "condition",
    "price_band_3d",
    "pickup_region_coarse",
  ],
  dashboard_cta_clicked: ["cta_kind"],
  trust_explanation_opened: ["panel_kind"],
  waitlist_opt_in: ["referrer_kind"],
};

// Per-property dictionaries. A value not in the dictionary is coerced to
// `unknown` for enums or dropped for booleans / closed strings.
type Dictionary = readonly (string | number | boolean)[];
const DICTIONARIES: Record<string, Dictionary> = {
  category: CATEGORIES,
  region_coarse: REGIONS_COARSE,
  pickup_region_coarse: REGIONS_COARSE,
  price_band: PRICE_BANDS,
  price_band_3d: PRICE_BANDS,
  device_class: DEVICE_CLASSES,
  referrer_kind: REFERRER_KINDS,
  language: LANGUAGES,
  filter_kind: FILTER_KINDS,
  condition: CONDITIONS,
  duration_days: DURATION_DAYS,
  duration_days_default: DURATION_DAYS,
  cta_kind: CTA_KINDS,
  panel_kind: PANEL_KINDS,
};

// Boolean-typed properties — drop on type mismatch (no `unknown` fallback).
const BOOLEAN_KEYS = new Set(["had_query", "had_pickup_label"]);

// Properties whose dictionary fallback is `unknown` (string enums) vs. number
// enums (no `unknown` value).
const STRING_ENUM_FALLBACK = "unknown";

// --------------------------------------------------------------
// Deny-list regex (belt-and-suspenders)
// --------------------------------------------------------------

const STRING_LENGTH_CAP = 64;

const DENY_PATTERNS: { name: string; pattern: RegExp }[] = [
  {
    name: "email",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  },
  {
    name: "kr_phone_local",
    pattern: /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/,
  },
  {
    name: "kr_phone_intl",
    pattern: /\+82[-.\s]?\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/,
  },
  {
    name: "rrn",
    pattern: /\d{6}[-\s]?\d{7}/,
  },
  {
    name: "card_16",
    pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,
  },
];

function failsDenyList(value: string): { failed: boolean; matched?: string } {
  for (const p of DENY_PATTERNS) {
    if (p.pattern.test(value)) return { failed: true, matched: p.name };
  }
  return { failed: false };
}

// --------------------------------------------------------------
// Public types
// --------------------------------------------------------------

export type SanitizerInput = {
  event_kind?: unknown;
  properties?: unknown;
  consent_state?: unknown;
  session_hash?: unknown;
  event_schema_version?: unknown;
};

export type SanitizedRow = {
  event_kind: StoredEventType;
  event_schema_version: "v1";
  category: Category | null;
  region_coarse: RegionCoarse | null;
  properties: Record<string, string | number | boolean>;
  session_hash: string;
  consent_state: ConsentState;
};

export type RejectionRecord = {
  event_kind: string;
  dropped_keys: string[];
  reason: string;
};

export type SanitizerResult =
  | { ok: true; row: SanitizedRow; rejections: RejectionRecord[] }
  | { ok: false; reason: SanitizerFailure };

export type SanitizerFailure =
  | "missing_session_hash"
  | "invalid_session_hash"
  | "unknown_event_type"
  | "invalid_payload_shape";

// --------------------------------------------------------------
// Sanitization
// --------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asConsentState(v: unknown): ConsentState {
  return v === "granted" || v === "denied" || v === "unknown" ? v : "unknown";
}

function valueInDict(value: unknown, dict: Dictionary): boolean {
  return (dict as readonly unknown[]).includes(value);
}

const SESSION_HASH_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const PROPERTIES_BYTE_CAP = 2048;

export function sanitize(input: SanitizerInput): SanitizerResult {
  if (!isPlainObject(input)) return { ok: false, reason: "invalid_payload_shape" };

  // Session hash is mandatory and must look like an opaque token.
  const session_hash = asString(input.session_hash);
  if (!session_hash) return { ok: false, reason: "missing_session_hash" };
  if (!SESSION_HASH_PATTERN.test(session_hash))
    return { ok: false, reason: "invalid_session_hash" };

  const consent_state = asConsentState(input.consent_state);

  // consent_state = denied: coerce to a single analytics_denied event with
  // no other properties, regardless of what the client posted.
  if (consent_state === "denied") {
    return {
      ok: true,
      row: {
        event_kind: "analytics_denied",
        event_schema_version: "v1",
        category: null,
        region_coarse: null,
        properties: {},
        session_hash,
        consent_state,
      },
      rejections: [],
    };
  }

  const event_kind_raw = asString(input.event_kind);
  if (!event_kind_raw) return { ok: false, reason: "unknown_event_type" };
  if (!(ALLOWED_EVENT_TYPES as readonly string[]).includes(event_kind_raw)) {
    return { ok: false, reason: "unknown_event_type" };
  }
  const event_kind = event_kind_raw as AllowedEventType;

  const inputProps = isPlainObject(input.properties) ? input.properties : {};

  const allowed = ALLOWED_PROPERTIES[event_kind];
  const cleaned: Record<string, string | number | boolean> = {};
  const dropped_keys: string[] = [];
  let denyMatch: string | undefined;

  for (const [key, value] of Object.entries(inputProps)) {
    if (!allowed.includes(key)) {
      dropped_keys.push(key);
      continue;
    }
    // Boolean keys
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value === "boolean") {
        cleaned[key] = value;
      } else {
        dropped_keys.push(key);
      }
      continue;
    }
    // Enum / dictionary keys
    const dict = DICTIONARIES[key];
    if (dict) {
      if (valueInDict(value, dict)) {
        cleaned[key] = value as string | number;
      } else if (dict.includes(STRING_ENUM_FALLBACK)) {
        cleaned[key] = STRING_ENUM_FALLBACK;
      } else {
        dropped_keys.push(key);
      }
      continue;
    }
    // Anything else with no dictionary entry — drop. (No event type today
    // routes to this branch; the line is defensive.)
    dropped_keys.push(key);
  }

  // Belt-and-suspenders: deny-list regex pass + 64-char cap on every
  // surviving string value.
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value !== "string") continue;
    if (value.length > STRING_LENGTH_CAP) {
      delete cleaned[key];
      dropped_keys.push(key);
      continue;
    }
    const deny = failsDenyList(value);
    if (deny.failed) {
      delete cleaned[key];
      dropped_keys.push(key);
      denyMatch = deny.matched;
    }
  }

  // Properties size cap (post-sanitization). If even the cleaned object is
  // somehow over 2 KB serialized, fall back to oversized sentinel.
  const serialized = JSON.stringify(cleaned);
  if (Buffer.byteLength(serialized, "utf8") > PROPERTIES_BYTE_CAP) {
    return {
      ok: true,
      row: {
        event_kind: "analytics_oversized",
        event_schema_version: "v1",
        category: null,
        region_coarse: null,
        properties: {},
        session_hash,
        consent_state,
      },
      rejections: [
        {
          event_kind,
          dropped_keys,
          reason: "properties_oversized",
        },
      ],
    };
  }

  // Promote category / region_coarse to top-level columns when present so
  // aggregations don't have to dig through jsonb.
  const category =
    typeof cleaned.category === "string" &&
    valueInDict(cleaned.category, CATEGORIES)
      ? (cleaned.category as Category)
      : null;
  const region_coarse =
    typeof cleaned.region_coarse === "string" &&
    valueInDict(cleaned.region_coarse, REGIONS_COARSE)
      ? (cleaned.region_coarse as RegionCoarse)
      : typeof cleaned.pickup_region_coarse === "string" &&
          valueInDict(cleaned.pickup_region_coarse, REGIONS_COARSE)
        ? (cleaned.pickup_region_coarse as RegionCoarse)
        : null;

  const rejections: RejectionRecord[] = [];
  if (dropped_keys.length > 0) {
    rejections.push({
      event_kind,
      dropped_keys,
      reason: denyMatch
        ? `deny_list_match:${denyMatch}`
        : "not_in_allowlist_or_dictionary",
    });
  }

  return {
    ok: true,
    row: {
      event_kind,
      event_schema_version: "v1",
      category,
      region_coarse,
      properties: cleaned,
      session_hash,
      consent_state,
    },
    rejections,
  };
}

// Public byte cap so the route handler can apply the same number.
export const RAW_BODY_BYTE_CAP = 4 * 1024;
export const SANITIZER_PROPERTIES_BYTE_CAP = PROPERTIES_BYTE_CAP;
export const SANITIZER_STRING_LENGTH_CAP = STRING_LENGTH_CAP;

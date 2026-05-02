// Phase 2 server-only chat-to-listing intake repository.
//
// Maps `public.listing_intake_sessions`, `listing_intake_messages`,
// and `listing_extractions` rows to the TS domain types in
// `src/domain/intake.ts` and back. Schema lives in
// `supabase/migrations/20260502120000_phase2_intake_draft.sql`.
//
// Hard rules — read before editing:
//
//   - Server-only. Imports `@/server/persistence/supabase/client`,
//     which is enforced by the static-text guard
//     `src/server/admin/import-boundary.test.ts`. This module must
//     not be imported by `src/components/**` or any `"use client"`
//     file.
//   - This is a DB adapter, NOT a service. It does NOT resolve actor
//     identity, does NOT enforce ownership, and does NOT decide what
//     a seller / borrower / admin is allowed to do. The intake
//     service in `src/lib/services/chatListingIntakeService.ts`
//     keeps that responsibility; this repo is shape validation +
//     row mapping only.
//   - This is a write surface. It is NOT a public projection. Raw
//     chat content is never read into any rendering path here. The
//     public projection privacy contract in
//     `src/lib/services/publicListingService.test.ts` continues to
//     own the public allowlist.
//   - `appendIntakeMessage` is INSERT-only. There is no upsert / no
//     update path, mirroring the DB-level append-only trigger
//     `listing_intake_messages_reject_modify`.
//   - Every input goes through `./validators.ts`. Untrusted shapes
//     are rejected before any DB call.
//   - Returns `null` (not throws) when the env / backend mode is
//     missing, matching the existing repository pattern. Callers
//     fall back to the safe mock path.
//
// Slice A, PR 2 of the externalization sequence. Schema-only PR 1
// (`b436c47`) created the DB shape; PR 3 will wire the service layer
// to this repository behind the existing `CORENT_BACKEND_MODE=supabase`
// gate. Until PR 3, nothing in the running app calls this module.
//
// Migration apply remains UNVERIFIED in the canonical environment
// (no supabase CLI / psql / Docker present). PR 3 wiring is blocked
// on first applying the Slice A migration to the dev DB.

import type {
  IntakeExtraction,
  IntakeExtractionField,
  IntakeMessage,
  IntakeMessageRole,
  IntakeSession,
  IntakeSessionStatus,
} from "@/domain/intake";
import type { CategoryId } from "@/domain/categories";
import type { ItemCondition } from "@/domain/products";
import { getMarketplaceClient } from "./client";
import {
  normalizeMissingFieldsForRead,
  validateComponents,
  validateDefects,
  validateIntakeMessageContent,
  validateIntakeMessageRole,
  validateIntakeSessionStatus,
  validateMissingFieldsForWrite,
  validateOptionalCategory,
  validateOptionalEstimatedValue,
  validateOptionalItemCondition,
  validateOptionalItemName,
  validateOptionalPrice,
  validateOptionalUuid,
  validatePickupArea,
  validateUuid,
} from "./validators";

// --------------------------------------------------------------
// Row shapes — match the SQL columns one-for-one.
// --------------------------------------------------------------

type IntakeSessionRow = {
  id: string;
  seller_id: string;
  status: IntakeSessionStatus;
  listing_intent_id: string | null;
  created_at: string;
  updated_at: string;
};

type IntakeMessageRow = {
  id: string;
  session_id: string;
  role: IntakeMessageRole;
  content: string;
  created_at: string;
};

type IntakeExtractionRow = {
  session_id: string;
  item_name: string | null;
  category: CategoryId | null;
  pickup_area: string | null;
  condition: ItemCondition | null;
  defects: string | null;
  components: string[] | null;
  estimated_value: number | null;
  one_day_price: number | null;
  three_days_price: number | null;
  seven_days_price: number | null;
  // jsonb — typed as `unknown` because we do not trust the shape of
  // a JSONB column at read time. `normalizeMissingFieldsForRead`
  // filters to known IntakeExtractionField values.
  missing_fields: unknown;
  created_at: string;
  updated_at: string;
};

export type RepoResult =
  | { ok: true }
  | { ok: false; error: string };

// --------------------------------------------------------------
// Row → domain mappers.
//
// Mappers do NOT re-validate; they are called from happy-paths after
// the row was returned by the DB. Where a column carries a free-form
// shape (jsonb missing_fields), the mapper applies a tolerant
// read-path normalization.
// --------------------------------------------------------------

function mapRowToSession(r: IntakeSessionRow): IntakeSession {
  return {
    id: r.id,
    sellerId: r.seller_id,
    status: r.status,
    listingIntentId: r.listing_intent_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapRowToMessage(r: IntakeMessageRow): IntakeMessage {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  };
}

function mapRowToExtraction(r: IntakeExtractionRow): IntakeExtraction {
  // Empty `components` array round-trips to `undefined` so the
  // domain shape produced by the deterministic local extractor (see
  // `chatIntakeExtractor.ts`) matches the DB-backed shape exactly.
  // The DB column is `not null default '{}'`; both empty and absent
  // come back as `[]` and the domain treats both as no-components.
  const components =
    Array.isArray(r.components) && r.components.length > 0
      ? r.components
      : undefined;

  // Read-path tolerance: drop unknown / wrong-typed entries silently.
  // Documented in `validators.ts`.
  const missingFields: IntakeExtractionField[] = normalizeMissingFieldsForRead(
    r.missing_fields,
  );

  return {
    sessionId: r.session_id,
    itemName: r.item_name ?? undefined,
    category: r.category ?? undefined,
    pickupArea: r.pickup_area ?? undefined,
    condition: r.condition ?? undefined,
    defects: r.defects ?? undefined,
    components,
    estimatedValue: r.estimated_value ?? undefined,
    oneDayPrice: r.one_day_price ?? undefined,
    threeDaysPrice: r.three_days_price ?? undefined,
    sevenDaysPrice: r.seven_days_price ?? undefined,
    missingFields,
    createdAt: r.created_at,
  };
}

// Internal test seam — exposes the mappers + the components round-trip
// rule without making the rest of the repo public.
export const _mappers = {
  mapRowToSession,
  mapRowToMessage,
  mapRowToExtraction,
} as const;

// --------------------------------------------------------------
// Sessions
// --------------------------------------------------------------

// Upsert a session by id. Validates id / sellerId / status and the
// optional `listingIntentId` reference. Does NOT enforce status
// transitions (drafting → draft_created etc.) — that is a service
// concern; the repo only stores the requested shape.
export async function saveIntakeSession(
  session: IntakeSession,
): Promise<RepoResult> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const idRes = validateUuid(session.id);
  if (!idRes.ok) return { ok: false, error: `id: ${idRes.error}` };
  const sellerRes = validateUuid(session.sellerId);
  if (!sellerRes.ok) return { ok: false, error: `seller_id: ${sellerRes.error}` };
  const statusRes = validateIntakeSessionStatus(session.status);
  if (!statusRes.ok) return { ok: false, error: `status: ${statusRes.error}` };
  const listingRes = validateOptionalUuid(session.listingIntentId ?? null);
  if (!listingRes.ok) {
    return { ok: false, error: `listing_intent_id: ${listingRes.error}` };
  }

  const payload = {
    id: idRes.value,
    seller_id: sellerRes.value,
    status: statusRes.value,
    listing_intent_id: listingRes.value,
    updated_at: new Date().toISOString(),
  };

  const upsert = await client
    .from("listing_intake_sessions")
    .upsert(payload, { onConflict: "id" });
  if (upsert.error) {
    return {
      ok: false,
      error: upsert.error.message ?? "intake session upsert failed",
    };
  }
  return { ok: true };
}

export async function getIntakeSession(
  id: string,
): Promise<IntakeSession | null> {
  const idRes = validateUuid(id);
  if (!idRes.ok) return null;
  const client = getMarketplaceClient();
  if (!client) return null;

  const { data, error } = await client
    .from("listing_intake_sessions")
    .select(
      "id, seller_id, status, listing_intent_id, created_at, updated_at",
    )
    .eq("id", idRes.value)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToSession(data as unknown as IntakeSessionRow);
}

// Returns sessions ordered by most-recent activity. Bounded by
// `limit` to keep the query cheap; the dashboard surface paginates
// in a future PR.
export async function listIntakeSessions(
  limit = 100,
): Promise<IntakeSession[]> {
  const client = getMarketplaceClient();
  if (!client) return [];
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  const { data, error } = await client
    .from("listing_intake_sessions")
    .select(
      "id, seller_id, status, listing_intent_id, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error || !data) return [];
  return (data as unknown as IntakeSessionRow[]).map(mapRowToSession);
}

// --------------------------------------------------------------
// Messages
//
// Append-only. The DB enforces this via the
// `listing_intake_messages_reject_modify` trigger; the repo enforces
// it by exposing only `.insert(...)` and not exposing any update /
// upsert / delete path.
// --------------------------------------------------------------

export async function appendIntakeMessage(
  message: IntakeMessage,
): Promise<RepoResult> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const idRes = validateUuid(message.id);
  if (!idRes.ok) return { ok: false, error: `id: ${idRes.error}` };
  const sessionRes = validateUuid(message.sessionId);
  if (!sessionRes.ok) {
    return { ok: false, error: `session_id: ${sessionRes.error}` };
  }
  const roleRes = validateIntakeMessageRole(message.role);
  if (!roleRes.ok) return { ok: false, error: `role: ${roleRes.error}` };
  const contentRes = validateIntakeMessageContent(message.content);
  if (!contentRes.ok) {
    return { ok: false, error: `content: ${contentRes.error}` };
  }

  const insert = await client.from("listing_intake_messages").insert({
    id: idRes.value,
    session_id: sessionRes.value,
    role: roleRes.value,
    content: contentRes.value,
    created_at: message.createdAt,
  });
  if (insert.error) {
    return {
      ok: false,
      error: insert.error.message ?? "intake message insert failed",
    };
  }
  return { ok: true };
}

export async function listIntakeMessagesForSession(
  sessionId: string,
): Promise<IntakeMessage[]> {
  const sessionRes = validateUuid(sessionId);
  if (!sessionRes.ok) return [];
  const client = getMarketplaceClient();
  if (!client) return [];

  const { data, error } = await client
    .from("listing_intake_messages")
    .select("id, session_id, role, content, created_at")
    .eq("session_id", sessionRes.value)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as IntakeMessageRow[]).map(mapRowToMessage);
}

// --------------------------------------------------------------
// Extractions
//
// One row per session (PK = session_id). `saveIntakeExtraction` is an
// upsert; on a duplicate write the latest extraction overwrites the
// previous one.
//
// JSONB note:
//   - `missing_fields` is validated strictly on the way in
//     (`validateMissingFieldsForWrite` rejects any unknown entry).
//   - On the way out, `mapRowToExtraction` runs the read-path
//     normalizer (`normalizeMissingFieldsForRead`) which tolerates
//     enum drift by filtering rather than failing the whole row.
// --------------------------------------------------------------

export async function saveIntakeExtraction(
  extraction: IntakeExtraction,
): Promise<RepoResult> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const sessionRes = validateUuid(extraction.sessionId);
  if (!sessionRes.ok) {
    return { ok: false, error: `session_id: ${sessionRes.error}` };
  }
  const itemNameRes = validateOptionalItemName(extraction.itemName ?? null);
  if (!itemNameRes.ok) return { ok: false, error: itemNameRes.error };
  const categoryRes = validateOptionalCategory(extraction.category ?? null);
  if (!categoryRes.ok) return { ok: false, error: categoryRes.error };
  const pickupRes = validatePickupArea(extraction.pickupArea ?? null);
  if (!pickupRes.ok) return { ok: false, error: pickupRes.error };
  const conditionRes = validateOptionalItemCondition(extraction.condition ?? null);
  if (!conditionRes.ok) return { ok: false, error: conditionRes.error };
  const defectsRes = validateDefects(extraction.defects ?? null);
  if (!defectsRes.ok) return { ok: false, error: defectsRes.error };

  // Components: the domain treats `undefined` as "no components".
  // The DB column is `not null default '{}'`; we map `undefined` to
  // an empty array on the way in.
  const componentsInput = extraction.components ?? [];
  const componentsRes = validateComponents(componentsInput);
  if (!componentsRes.ok) return { ok: false, error: componentsRes.error };

  const valueRes = validateOptionalEstimatedValue(
    extraction.estimatedValue ?? null,
  );
  if (!valueRes.ok) return { ok: false, error: valueRes.error };
  const p1 = validateOptionalPrice(
    extraction.oneDayPrice ?? null,
    "one_day_price",
  );
  if (!p1.ok) return { ok: false, error: p1.error };
  const p3 = validateOptionalPrice(
    extraction.threeDaysPrice ?? null,
    "three_days_price",
  );
  if (!p3.ok) return { ok: false, error: p3.error };
  const p7 = validateOptionalPrice(
    extraction.sevenDaysPrice ?? null,
    "seven_days_price",
  );
  if (!p7.ok) return { ok: false, error: p7.error };

  const missingRes = validateMissingFieldsForWrite(extraction.missingFields);
  if (!missingRes.ok) return { ok: false, error: missingRes.error };

  const payload = {
    session_id: sessionRes.value,
    item_name: itemNameRes.value,
    category: categoryRes.value,
    pickup_area: pickupRes.value,
    condition: conditionRes.value,
    defects: defectsRes.value,
    components: componentsRes.value,
    estimated_value: valueRes.value,
    one_day_price: p1.value,
    three_days_price: p3.value,
    seven_days_price: p7.value,
    missing_fields: missingRes.value,
    updated_at: new Date().toISOString(),
  };

  const upsert = await client
    .from("listing_extractions")
    .upsert(payload, { onConflict: "session_id" });
  if (upsert.error) {
    return {
      ok: false,
      error: upsert.error.message ?? "intake extraction upsert failed",
    };
  }
  return { ok: true };
}

export async function getIntakeExtractionForSession(
  sessionId: string,
): Promise<IntakeExtraction | null> {
  const sessionRes = validateUuid(sessionId);
  if (!sessionRes.ok) return null;
  const client = getMarketplaceClient();
  if (!client) return null;

  const { data, error } = await client
    .from("listing_extractions")
    .select(
      `
      session_id, item_name, category, pickup_area, condition, defects,
      components, estimated_value, one_day_price, three_days_price,
      seven_days_price, missing_fields, created_at, updated_at
      `,
    )
    .eq("session_id", sessionRes.value)
    .maybeSingle();

  if (error || !data) return null;
  return mapRowToExtraction(data as unknown as IntakeExtractionRow);
}


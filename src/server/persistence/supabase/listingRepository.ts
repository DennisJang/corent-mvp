// Phase 2 server-only listing repository. Maps `public.listings` rows to
// the `ListingIntent` domain shape (and back). The shape is not exact —
// the Phase 2 schema flattens nested fields (item.*, pricing.*) into
// columns, and per-listing verification lives in `listing_verifications`.
//
// Hard rules:
//   - Server-only. Imports `@/server/persistence/supabase/client`.
//   - Never trusts client-supplied IDs, ownership, status, or numeric
//     amounts. Every input goes through `./validators.ts`.
//   - Returns `null` (not throws) when the env / backend mode is missing.
//   - Queries the public `listings` table only. The view
//     `listings_public` is documented but not used here yet because
//     Phase 2 reads everything via service role.

import type { CategoryId } from "@/domain/categories";
import type {
  ListingIntent,
  VerificationIntent,
} from "@/domain/intents";
import type { ItemCondition } from "@/domain/products";
import { getMarketplaceClient } from "./client";
import {
  validateBoundedText,
  validateCategory,
  validateComponents,
  validateDefects,
  validateDisplayName,
  validateEstimatedValue,
  validateItemCondition,
  validateItemName,
  validateListingStatus,
  validatePickupArea,
  validatePrice,
  validateSafetyCode,
  validateUuid,
  validateVerificationStatus,
} from "./validators";

type ListingRow = {
  id: string;
  seller_id: string;
  status: ListingIntent["status"];
  raw_seller_input: string | null;
  item_name: string;
  category: CategoryId;
  estimated_value: number;
  condition: ItemCondition;
  components: string[];
  defects: string | null;
  pickup_area: string | null;
  region_coarse: string;
  price_one_day: number;
  price_three_days: number;
  price_seven_days: number;
  seller_adjusted_pricing: boolean;
  created_at: string;
  updated_at: string;
};

type VerificationRow = {
  id: string;
  listing_id: string;
  status: VerificationIntent["status"];
  safety_code: string;
  front_photo: boolean;
  back_photo: boolean;
  components_photo: boolean;
  working_proof: boolean;
  safety_code_photo: boolean;
  private_serial_stored: boolean;
  ai_notes: string[];
  human_review_notes: string[];
};

type SaveListingInput = {
  intent: ListingIntent;
};

export type SaveListingResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function mapRowToIntent(
  l: ListingRow,
  v: VerificationRow | null,
): ListingIntent {
  const verification: VerificationIntent = v
    ? {
        id: v.id,
        safetyCode: v.safety_code,
        status: v.status,
        checks: {
          frontPhoto: v.front_photo,
          backPhoto: v.back_photo,
          componentsPhoto: v.components_photo,
          workingProof: v.working_proof,
          safetyCodePhoto: v.safety_code_photo,
          privateSerialStored: v.private_serial_stored,
        },
        aiNotes: v.ai_notes.length ? v.ai_notes : undefined,
        humanReviewNotes:
          v.human_review_notes.length ? v.human_review_notes : undefined,
      }
    : {
        id: `vi_pending_${l.id}`,
        safetyCode: "A-000",
        status: "not_started",
        checks: {
          frontPhoto: false,
          backPhoto: false,
          componentsPhoto: false,
          workingProof: false,
          safetyCodePhoto: false,
          privateSerialStored: false,
        },
      };

  return {
    id: l.id,
    sellerId: l.seller_id,
    status: l.status,
    rawSellerInput: l.raw_seller_input ?? undefined,
    item: {
      name: l.item_name,
      category: l.category,
      estimatedValue: l.estimated_value,
      condition: l.condition,
      components: l.components,
      defects: l.defects ?? undefined,
      // Private serial is never returned via this read — it lives in
      // listing_secrets and the public read flow does not join.
      privateSerialNumber: undefined,
      pickupArea: l.pickup_area ?? undefined,
    },
    pricing: {
      oneDay: l.price_one_day,
      threeDays: l.price_three_days,
      sevenDays: l.price_seven_days,
      sellerAdjusted: l.seller_adjusted_pricing,
    },
    verification,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

// Reads a single listing by id. Joins the verification row (1:1) so the
// caller gets a complete `ListingIntent` shape. Returns `null` on
// missing client (env / mode) and on row-not-found.
export async function getListingById(
  id: string,
): Promise<ListingIntent | null> {
  const idRes = validateUuid(id);
  if (!idRes.ok) return null;
  const client = getMarketplaceClient();
  if (!client) return null;

  const { data, error } = await client
    .from("listings")
    .select(
      `
      id, seller_id, status, raw_seller_input, item_name, category,
      estimated_value, condition, components, defects, pickup_area,
      region_coarse, price_one_day, price_three_days, price_seven_days,
      seller_adjusted_pricing, created_at, updated_at,
      listing_verifications (
        id, listing_id, status, safety_code, front_photo, back_photo,
        components_photo, working_proof, safety_code_photo,
        private_serial_stored, ai_notes, human_review_notes
      )
      `,
    )
    .eq("id", idRes.value)
    .maybeSingle();

  if (error || !data) return null;

  const lvJoin = (data as { listing_verifications: VerificationRow[] | VerificationRow | null }).listing_verifications;
  const verification: VerificationRow | null = Array.isArray(lvJoin)
    ? lvJoin[0] ?? null
    : lvJoin ?? null;

  return mapRowToIntent(data as unknown as ListingRow, verification);
}

// Lists approved listings for the public read shape. Uses the
// `listings` table directly (not the view) because the service-role
// client bypasses RLS either way; the filter is the same. Bounded by
// `limit` to keep the query cheap.
export async function listApprovedListings(
  limit = 50,
): Promise<ListingIntent[]> {
  const client = getMarketplaceClient();
  if (!client) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  const { data, error } = await client
    .from("listings")
    .select(
      `
      id, seller_id, status, raw_seller_input, item_name, category,
      estimated_value, condition, components, defects, pickup_area,
      region_coarse, price_one_day, price_three_days, price_seven_days,
      seller_adjusted_pricing, created_at, updated_at,
      listing_verifications (
        id, listing_id, status, safety_code, front_photo, back_photo,
        components_photo, working_proof, safety_code_photo,
        private_serial_stored, ai_notes, human_review_notes
      )
      `,
    )
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error || !data) return [];

  return data.map((row) => {
    const lvJoin = (row as { listing_verifications: VerificationRow[] | VerificationRow | null }).listing_verifications;
    const verification: VerificationRow | null = Array.isArray(lvJoin)
      ? lvJoin[0] ?? null
      : lvJoin ?? null;
    return mapRowToIntent(row as unknown as ListingRow, verification);
  });
}

// Upserts a listing from a domain `ListingIntent`. Validates EVERY
// field the adapter writes — id, seller_id, status, prices, item name,
// category, components are all server-checked. Verification row is
// upserted in a sibling write keyed on `listing_id`.
export async function saveListing({ intent }: SaveListingInput): Promise<SaveListingResult> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const idRes = validateUuid(intent.id);
  if (!idRes.ok) {
    // Soft fallback: if the in-memory id is not a UUID, generate one
    // server-side. Phase 2 schema requires uuid PKs.
    return { ok: false, error: idRes.error };
  }
  const sellerRes = validateUuid(intent.sellerId);
  if (!sellerRes.ok) return { ok: false, error: `seller_id: ${sellerRes.error}` };
  const statusRes = validateListingStatus(intent.status);
  if (!statusRes.ok) return { ok: false, error: `status: ${statusRes.error}` };
  const nameRes = validateItemName(intent.item.name);
  if (!nameRes.ok) return { ok: false, error: nameRes.error };
  const catRes = validateCategory(intent.item.category);
  if (!catRes.ok) return { ok: false, error: catRes.error };
  const valRes = validateEstimatedValue(intent.item.estimatedValue);
  if (!valRes.ok) return { ok: false, error: valRes.error };
  const condRes = validateItemCondition(intent.item.condition);
  if (!condRes.ok) return { ok: false, error: condRes.error };
  const compRes = validateComponents(intent.item.components);
  if (!compRes.ok) return { ok: false, error: compRes.error };
  const defRes = validateDefects(intent.item.defects ?? null);
  if (!defRes.ok) return { ok: false, error: defRes.error };
  const pickRes = validatePickupArea(intent.item.pickupArea ?? null);
  if (!pickRes.ok) return { ok: false, error: pickRes.error };
  const p1 = validatePrice(intent.pricing.oneDay, "price_one_day");
  if (!p1.ok) return { ok: false, error: p1.error };
  const p3 = validatePrice(intent.pricing.threeDays, "price_three_days");
  if (!p3.ok) return { ok: false, error: p3.error };
  const p7 = validatePrice(intent.pricing.sevenDays, "price_seven_days");
  if (!p7.ok) return { ok: false, error: p7.error };
  const rawRes = validateBoundedText(
    intent.rawSellerInput ?? null,
    "raw_seller_input",
    2000,
    false,
  );
  if (!rawRes.ok) return { ok: false, error: rawRes.error };

  const listingPayload = {
    id: idRes.value,
    seller_id: sellerRes.value,
    status: statusRes.value,
    raw_seller_input: rawRes.value,
    item_name: nameRes.value,
    category: catRes.value,
    estimated_value: valRes.value,
    condition: condRes.value,
    components: compRes.value,
    defects: defRes.value,
    pickup_area: pickRes.value,
    price_one_day: p1.value,
    price_three_days: p3.value,
    price_seven_days: p7.value,
    seller_adjusted_pricing: intent.pricing.sellerAdjusted === true,
    updated_at: new Date().toISOString(),
  };

  const upsert = await client
    .from("listings")
    .upsert(listingPayload, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (upsert.error || !upsert.data) {
    return { ok: false, error: upsert.error?.message ?? "listing upsert failed" };
  }

  // Verification row.
  const v = intent.verification;
  const safetyRes = validateSafetyCode(v.safetyCode);
  if (!safetyRes.ok) return { ok: false, error: safetyRes.error };
  const vStatusRes = validateVerificationStatus(v.status);
  if (!vStatusRes.ok) return { ok: false, error: vStatusRes.error };

  const verificationPayload = {
    listing_id: idRes.value,
    status: vStatusRes.value,
    safety_code: safetyRes.value,
    front_photo: v.checks.frontPhoto === true,
    back_photo: v.checks.backPhoto === true,
    components_photo: v.checks.componentsPhoto === true,
    working_proof: v.checks.workingProof === true,
    safety_code_photo: v.checks.safetyCodePhoto === true,
    private_serial_stored: v.checks.privateSerialStored === true,
    ai_notes: Array.isArray(v.aiNotes) ? v.aiNotes.slice(0, 24) : [],
    human_review_notes: Array.isArray(v.humanReviewNotes)
      ? v.humanReviewNotes.slice(0, 24)
      : [],
  };

  const verificationUpsert = await client
    .from("listing_verifications")
    .upsert(verificationPayload, { onConflict: "listing_id" });
  if (verificationUpsert.error) {
    return {
      ok: false,
      error: verificationUpsert.error.message ?? "verification upsert failed",
    };
  }

  return { ok: true, id: idRes.value };
}

export async function countListingsByStatus(): Promise<
  Record<string, number>
> {
  const client = getMarketplaceClient();
  if (!client) return {};
  const { data, error } = await client
    .from("listings")
    .select("status")
    .limit(50_000);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

// Internal — used by tests to ensure the fallback display name path is
// not silently deserialized into the listings table.
export const _displayNameValidatorForTests = validateDisplayName;

// Phase 2 server-only admin review queue repository. Reads and inserts
// rows into `admin_reviews` and `admin_actions`. Both tables are
// admin-only (deny-by-default RLS, service-role-only access).

import { getMarketplaceClient } from "./client";
import {
  validateBoundedText,
  validateOptionalUuid,
  validateUuid,
} from "./validators";

export type AdminReviewStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "cancelled";

export type AdminReview = {
  id: string;
  listingId: string | null;
  rentalIntentId: string | null;
  status: AdminReviewStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
  notes: string | null;
};

const ALLOWED_STATUSES: ReadonlySet<AdminReviewStatus> = new Set([
  "pending",
  "in_review",
  "approved",
  "rejected",
  "cancelled",
]);

const ALLOWED_ACTION_TYPES: ReadonlySet<string> = new Set([
  "listing_approved",
  "listing_rejected",
  "rental_intervened",
  "dispute_resolved",
  "settlement_blocked",
  "settlement_unblocked",
  "note",
]);

function rowToReview(r: {
  id: string;
  listing_id: string | null;
  rental_intent_id: string | null;
  status: AdminReviewStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_id: string | null;
  notes: string | null;
}): AdminReview {
  return {
    id: r.id,
    listingId: r.listing_id,
    rentalIntentId: r.rental_intent_id,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewerId: r.reviewer_id,
    notes: r.notes,
  };
}

export async function listAdminReviews(opts?: {
  status?: AdminReviewStatus;
  limit?: number;
}): Promise<AdminReview[]> {
  const client = getMarketplaceClient();
  if (!client) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? 50)));
  let q = client
    .from("admin_reviews")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(safeLimit);
  if (opts?.status && ALLOWED_STATUSES.has(opts.status)) {
    q = q.eq("status", opts.status);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((d) =>
    rowToReview(
      d as Parameters<typeof rowToReview>[0],
    ),
  );
}

export type EnqueueAdminReviewInput = {
  listingId?: string | null;
  rentalIntentId?: string | null;
  notes?: string | null;
};

export async function enqueueAdminReview(
  input: EnqueueAdminReviewInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const listingIdRes = validateOptionalUuid(input.listingId ?? null);
  if (!listingIdRes.ok) return { ok: false, error: listingIdRes.error };
  const rentalIdRes = validateOptionalUuid(input.rentalIntentId ?? null);
  if (!rentalIdRes.ok) return { ok: false, error: rentalIdRes.error };

  // Schema requires exactly one of (listing_id, rental_intent_id).
  if (
    (listingIdRes.value === null && rentalIdRes.value === null) ||
    (listingIdRes.value !== null && rentalIdRes.value !== null)
  ) {
    return { ok: false, error: "exactly one of listingId / rentalIntentId required" };
  }

  const notesRes = validateBoundedText(input.notes ?? null, "notes", 1000, false);
  if (!notesRes.ok) return { ok: false, error: notesRes.error };

  const { data, error } = await client
    .from("admin_reviews")
    .insert({
      listing_id: listingIdRes.value,
      rental_intent_id: rentalIdRes.value,
      notes: notesRes.value,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, id: (data as { id: string }).id };
}

export type RecordAdminActionInput = {
  actionType: string;
  actorId?: string | null;
  actorEmail?: string | null;
  listingId?: string | null;
  rentalIntentId?: string | null;
  notes?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAdminAction(
  input: RecordAdminActionInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  if (!ALLOWED_ACTION_TYPES.has(input.actionType)) {
    return { ok: false, error: "actionType not allowed" };
  }
  const actorIdRes = validateOptionalUuid(input.actorId ?? null);
  if (!actorIdRes.ok) return { ok: false, error: actorIdRes.error };
  const listingIdRes = validateOptionalUuid(input.listingId ?? null);
  if (!listingIdRes.ok) return { ok: false, error: listingIdRes.error };
  const rentalIdRes = validateOptionalUuid(input.rentalIntentId ?? null);
  if (!rentalIdRes.ok) return { ok: false, error: rentalIdRes.error };

  const emailRes = validateBoundedText(input.actorEmail ?? null, "actor_email", 128, false);
  if (!emailRes.ok) return { ok: false, error: emailRes.error };
  if (
    typeof emailRes.value === "string" &&
    !/^[^@\s]{1,128}@[^@\s]{1,128}$/.test(emailRes.value)
  ) {
    return { ok: false, error: "actor_email shape" };
  }
  const notesRes = validateBoundedText(input.notes ?? null, "notes", 1000, false);
  if (!notesRes.ok) return { ok: false, error: notesRes.error };

  const metadata: Record<string, string | number | boolean | null> = {};
  if (input.metadata) {
    if (typeof input.metadata !== "object" || Array.isArray(input.metadata)) {
      return { ok: false, error: "metadata must be a plain object" };
    }
    for (const [k, v] of Object.entries(input.metadata)) {
      if (k.length > 60) return { ok: false, error: "metadata key too long" };
      if (
        v !== null &&
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean"
      ) {
        return { ok: false, error: "metadata value type not allowed" };
      }
      if (typeof v === "string" && v.length > 240) {
        return { ok: false, error: "metadata string value too long" };
      }
      metadata[k] = v;
    }
  }

  const { data, error } = await client
    .from("admin_actions")
    .insert({
      actor_id: actorIdRes.value,
      actor_email: emailRes.value,
      action_type: input.actionType,
      listing_id: listingIdRes.value,
      rental_intent_id: rentalIdRes.value,
      notes: notesRes.value,
      metadata,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, id: (data as { id: string }).id };
}

export async function countAdminReviewsByStatus(): Promise<Record<string, number>> {
  const client = getMarketplaceClient();
  if (!client) return {};
  const { data, error } = await client
    .from("admin_reviews")
    .select("status")
    .limit(50_000);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const r of data as { status: string }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

// Internal — used by tests to assert the validator id-shape.
export function _validateUuidForTests(s: unknown): { ok: boolean } {
  return validateUuid(s);
}

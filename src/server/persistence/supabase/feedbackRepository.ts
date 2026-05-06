// Phase 2 server-only feedback / wishlist repository.
//
// Maps `public.feedback_submissions` rows. Schema lives in
// `supabase/migrations/20260504120000_phase2_feedback_intake.sql`.
//
// Hard rules — read before editing:
//
//   - Server-only. Imports `@/server/persistence/supabase/client`.
//     Never reachable from `src/components/**` or any
//     `"use client"` file (asserted by the import-boundary test).
//   - This is a DB adapter, NOT a service. It does NOT resolve actor
//     identity, does NOT enforce ownership, and does NOT decide who
//     can submit. The action layer
//     (`src/server/feedback/submitFeedback.ts`) handles those
//     concerns. This module is shape validation + row mapping only.
//   - Every input goes through `./validators.ts`. Untrusted shapes
//     are rejected before any DB call.
//   - Returns a typed safe error when the env / backend mode is
//     missing. Callers fall back to the safe mock path.
//   - There is no read path in this slice. Founder/admin review is
//     deferred to a future commit with its own access-control review.

import type { CategoryId } from "@/domain/categories";
import { getMarketplaceClient } from "./client";
import {
  validateFeedbackContactEmail,
  validateFeedbackItemName,
  validateFeedbackKind,
  validateFeedbackMessage,
  validateFeedbackSourcePage,
  validateOptionalCategory,
  validateOptionalUuid,
  type FeedbackKind,
  type FeedbackStatus,
} from "./validators";

export type InsertFeedbackInput = {
  kind: FeedbackKind;
  message: string;
  itemName?: string | null;
  category?: CategoryId | null;
  contactEmail?: string | null;
  profileId?: string | null;
  sourcePage?: string | null;
};

export type InsertFeedbackResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Inserts a single feedback row. The `status` is forced server-side
// to `'new'`; the action layer cannot override it. Validates every
// caller-supplied field, mirroring the SQL CHECK constraints.
export async function insertFeedbackSubmission(
  input: InsertFeedbackInput,
): Promise<InsertFeedbackResult> {
  const kindRes = validateFeedbackKind(input.kind);
  if (!kindRes.ok) return { ok: false, error: kindRes.error };
  const messageRes = validateFeedbackMessage(input.message);
  if (!messageRes.ok) return { ok: false, error: messageRes.error };
  const itemRes = validateFeedbackItemName(input.itemName ?? null);
  if (!itemRes.ok) return { ok: false, error: itemRes.error };
  const catRes = validateOptionalCategory(input.category ?? null);
  if (!catRes.ok) return { ok: false, error: catRes.error };
  const emailRes = validateFeedbackContactEmail(input.contactEmail ?? null);
  if (!emailRes.ok) return { ok: false, error: emailRes.error };
  const profileRes = validateOptionalUuid(input.profileId ?? null);
  if (!profileRes.ok) {
    return { ok: false, error: `profile_id: ${profileRes.error}` };
  }
  const sourceRes = validateFeedbackSourcePage(input.sourcePage ?? null);
  if (!sourceRes.ok) return { ok: false, error: sourceRes.error };

  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const payload = {
    kind: kindRes.value,
    message: messageRes.value,
    item_name: itemRes.value,
    category: catRes.value,
    contact_email: emailRes.value,
    profile_id: profileRes.value,
    source_page: sourceRes.value,
    // status / created_at / updated_at use the column defaults.
  };

  const { data, error } = await client
    .from("feedback_submissions")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "feedback insert failed" };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// Bundle 2 Slice 4 — server-only feedback read for the founder
// validation cockpit. The action layer
// (`src/server/admin/founderCockpitData.ts`) is the access-control
// gate (it calls `requireFounderSession` before invoking this
// helper); this module is row mapping + bounded read only.
//
// Hard rules:
//
//   - Service-role client bypasses RLS; the deny-by-default RLS on
//     `feedback_submissions` plus the explicit `revoke all` from
//     anon/authenticated mean nobody else can read these rows.
//   - The DTO carries `contact_email` because the founder needs it
//     to follow up with optionally-anonymous testers (this is the
//     point of the intake). The DTO does NOT carry `updated_at`,
//     internal review fields, or any other column not needed for
//     the cockpit.
//   - Bounded by `limit` (clamped to `[1, 200]`).
type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  message: string;
  item_name: string | null;
  category: CategoryId | null;
  contact_email: string | null;
  profile_id: string | null;
  source_page: string | null;
  status: FeedbackStatus;
  created_at: string;
};

export type RecentFeedbackSubmission = {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  message: string;
  itemName: string | null;
  category: CategoryId | null;
  contactEmail: string | null;
  profileId: string | null;
  sourcePage: string | null;
  createdAt: string;
};

// Founder-only status update for the feedback review workflow
// (cockpit row controls: 검토 완료 / 보관). Auth gate lives one
// layer up in `src/server/feedback/updateFeedbackStatus.ts` —
// this module is the DB adapter, never the authority. The
// service-role client bypasses RLS; the deny-by-default RLS +
// `revoke all from anon, authenticated` keep the row unwritable
// from any other path.
//
// Safe target statuses: only `reviewed` and `archived`. The
// `new` enum value is the column default; surfacing a
// `new`-target update would be a regression case the founder
// never needs (fresh rows already start there). The validator
// enforces the closed set.
export type FeedbackTargetStatus = Exclude<FeedbackStatus, "new">;

export type SetFeedbackStatusResult =
  | { ok: true; id: string; status: FeedbackTargetStatus }
  | { ok: false; error: string };

const ALLOWED_TARGET_STATUSES: ReadonlySet<FeedbackTargetStatus> = new Set<
  FeedbackTargetStatus
>(["reviewed", "archived"]);

export async function setFeedbackStatus(
  id: string,
  target: FeedbackTargetStatus,
): Promise<SetFeedbackStatusResult> {
  const idRes = validateOptionalUuid(id);
  if (!idRes.ok || idRes.value === null) {
    return { ok: false, error: "feedback id invalid" };
  }
  if (!ALLOWED_TARGET_STATUSES.has(target)) {
    return { ok: false, error: "feedback target status not allowed" };
  }

  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const { data, error } = await client
    .from("feedback_submissions")
    .update({ status: target })
    .eq("id", idRes.value)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "feedback status update failed",
    };
  }
  return { ok: true, id: idRes.value, status: target };
}

export async function listRecentFeedbackSubmissions(
  limit = 50,
): Promise<RecentFeedbackSubmission[]> {
  const client = getMarketplaceClient();
  if (!client) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  const { data, error } = await client
    .from("feedback_submissions")
    .select(
      "id, kind, message, item_name, category, contact_email, profile_id, source_page, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error || !data) return [];
  return (data as FeedbackRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    message: r.message,
    itemName: r.item_name,
    category: r.category,
    contactEmail: r.contact_email,
    profileId: r.profile_id,
    sourcePage: r.source_page,
    createdAt: r.created_at,
  }));
}

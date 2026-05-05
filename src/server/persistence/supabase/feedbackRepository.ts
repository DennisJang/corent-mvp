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

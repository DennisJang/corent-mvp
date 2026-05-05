"use server";

// Validation Bundle 1, Part 2 — server action to capture closed-alpha
// feedback / wishlist signals.
//
// Why this action does NOT use `runIntentCommand`:
//
//   - Feedback is OPTIONALLY anonymous. A casual visitor on the
//     landing page must be able to submit a wishlist signal without
//     being signed in. `runIntentCommand` requires a resolved actor
//     and would fail-closed `unauthenticated` for the common case.
//   - The action still resolves the auth session OPTIONALLY and
//     records the `profile_id` when one exists. A forged caller
//     cannot supply their own `profile_id`: the payload type forbids
//     it, and the runtime never reads it.
//
// Hard rules:
//
//   - In mock / default backend mode the action does NOT write. It
//     returns a typed `unsupported` envelope so the client can
//     render an explicit "데모 환경에서는 의견을 저장하지 않아요."
//     message. No silent local fallback.
//   - In supabase mode the service-role client writes directly.
//     RLS deny-by-default + the explicit `revoke all` from anon /
//     authenticated mean the row is unreadable until a future
//     founder review surface adds a narrow policy.
//   - Errors are typed and non-secret. Repo throws map to
//     `intentErr("internal", "submit_feedback_failed")`; no SQL,
//     env values, or row payloads reach the client.
//
// References:
//   - `supabase/migrations/20260504120000_phase2_feedback_intake.sql`
//   - `src/server/persistence/supabase/feedbackRepository.ts`

import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { getBackendMode } from "@/server/backend/mode";
import { insertFeedbackSubmission } from "@/server/persistence/supabase/feedbackRepository";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import {
  validateFeedbackContactEmail,
  validateFeedbackItemName,
  validateFeedbackKind,
  validateFeedbackMessage,
  validateFeedbackSourcePage,
  validateOptionalCategory,
  type FeedbackKind,
} from "@/server/persistence/supabase/validators";
import type { CategoryId } from "@/domain/categories";

// Client-supplied payload. Notably absent: `profile_id`, `id`,
// `status`, `created_at`. These are server-controlled.
export type SubmitFeedbackPayload = {
  kind: FeedbackKind;
  message: string;
  itemName?: string | null;
  category?: CategoryId | null;
  contactEmail?: string | null;
  sourcePage?: string | null;
};

export type SubmitFeedbackResult = { id: string };

async function resolveOptionalProfileId(): Promise<string | null> {
  // The closed-alpha provisioning workflow keeps profile creation
  // manual (PR 5B). If the user is signed in AND has a profile row,
  // we attach `profile_id`; otherwise we record an anonymous row.
  // Errors fall through to anonymous — feedback intake never fails
  // closed on auth resolution.
  try {
    const actor = await resolveServerActor({ prefer: "renter" });
    if (!actor || actor.source !== "supabase") return null;
    if (actor.kind === "seller") return actor.sellerId;
    if (actor.kind === "renter") return actor.borrowerId;
    return null;
  } catch {
    return null;
  }
}

export async function submitFeedbackAction(
  payload: SubmitFeedbackPayload,
): Promise<IntentResult<SubmitFeedbackResult>> {
  // Shape validation runs in BOTH modes so a forged client cannot
  // probe the supabase branch with garbage.
  const kindRes = validateFeedbackKind(payload?.kind);
  if (!kindRes.ok) return intentErr("input", kindRes.error);
  const messageRes = validateFeedbackMessage(payload?.message);
  if (!messageRes.ok) return intentErr("input", messageRes.error);
  const itemRes = validateFeedbackItemName(payload?.itemName ?? null);
  if (!itemRes.ok) return intentErr("input", itemRes.error);
  const catRes = validateOptionalCategory(payload?.category ?? null);
  if (!catRes.ok) return intentErr("input", catRes.error);
  const emailRes = validateFeedbackContactEmail(payload?.contactEmail ?? null);
  if (!emailRes.ok) return intentErr("input", emailRes.error);
  const sourceRes = validateFeedbackSourcePage(payload?.sourcePage ?? null);
  if (!sourceRes.ok) return intentErr("input", sourceRes.error);

  if (getBackendMode() !== "supabase") {
    // Mock / default mode: the validation-only path. The form
    // surfaces a transparent "데모 환경에서는 저장되지 않아요"
    // caption. Returning `unsupported` (vs `internal`) lets the
    // client render specific copy.
    return intentErr("unsupported", "feedback_intake_local_only");
  }

  const profileId = await resolveOptionalProfileId();

  try {
    const result = await insertFeedbackSubmission({
      kind: kindRes.value,
      message: messageRes.value,
      itemName: itemRes.value,
      category: catRes.value,
      contactEmail: emailRes.value,
      profileId,
      sourcePage: sourceRes.value,
    });
    if (!result.ok) {
      // The repo's error string is not user-secret (it's the
      // upsert / validator label) but we collapse it into a
      // single typed code so the client copy stays bounded.
      return intentErr("internal", "submit_feedback_failed");
    }
    return intentOk({ id: result.id });
  } catch {
    return intentErr("internal", "submit_feedback_failed");
  }
}

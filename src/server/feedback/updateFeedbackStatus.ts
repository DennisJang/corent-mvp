"use server";

// Founder-only feedback review status update.
//
// Mirrors the publication action's posture
// (`src/server/listings/publishListing.ts`):
//
//   - Authority is the founder allowlist via
//     `requireFounderSession()`. Sellers, borrowers, and any non-
//     allowlisted Supabase session fail closed at this gate.
//
//   - The payload contains ONLY `id` + `status`. Any forged
//     `profileId`, `borrowerId`, `sellerId`, `email`,
//     `contact_email`, `role`, `capability`, `adminId`, `approval`,
//     `created_at`, etc. is ignored — the type does not declare them
//     and the runtime never reads them.
//
//   - Allowed target statuses are the exclusive subset
//     `"reviewed" | "archived"`. The third enum value, `"new"`, is
//     the column default; surfacing a `new`-target update on the
//     cockpit would have no operational meaning and could mask a
//     bug. The validator + the repo both reject it.
//
//   - Mock / default backend → typed `unsupported`. No silent local
//     fallback.
//
//   - The response is a tight non-secret DTO: `{ id, status }`. It
//     does NOT echo `message`, `contact_email`, `profile_id`,
//     `kind`, `category`, `item_name`, `source_page`, `created_at`,
//     or any other column the cockpit reader exposes.
//
//   - Errors are typed and non-secret. Repo / DB throws map to
//     `intentErr("internal", "update_feedback_status_failed")`. SQL
//     text, env values, and row payloads never reach the client.
//
// Plan: docs/corent_wanted_try_request_slice_plan.md §12 PR 3.

import { requireFounderSession } from "@/server/admin/auth";
import { getBackendMode } from "@/server/backend/mode";
import {
  setFeedbackStatus,
  type FeedbackTargetStatus,
} from "@/server/persistence/supabase/feedbackRepository";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import { validateUuid } from "@/server/persistence/supabase/validators";

// Allowed target statuses for the founder review workflow. Kept in
// sync with the repository's allowlist; surfaces should reuse this
// const rather than repeating literal strings.
const ALLOWED_TARGET_STATUSES: ReadonlySet<FeedbackTargetStatus> = new Set<
  FeedbackTargetStatus
>(["reviewed", "archived"]);

// Client-supplied payload. Notably absent: `profileId`,
// `borrowerId`, `sellerId`, `email`, `contactEmail`, `kind`,
// `message`, `role`, `capability`, `adminId`, `approval`. Forged
// values for these are ignored by the type and the runtime.
export type UpdateFeedbackStatusPayload = {
  id: string;
  status: FeedbackTargetStatus;
};

// Tight result DTO — id + status only. No PII, no message body,
// no contact email, no profile linkage.
export type UpdateFeedbackStatusResult = {
  id: string;
  status: FeedbackTargetStatus;
};

export async function updateFeedbackStatusAction(
  payload: UpdateFeedbackStatusPayload,
): Promise<IntentResult<UpdateFeedbackStatusResult>> {
  // Shape validation runs first — same posture as the publish
  // action. A malformed id is rejected before the founder probe.
  const idRes = validateUuid(payload?.id);
  if (!idRes.ok) return intentErr("input", "feedback_id_invalid");

  if (
    typeof payload?.status !== "string" ||
    !ALLOWED_TARGET_STATUSES.has(payload.status as FeedbackTargetStatus)
  ) {
    return intentErr("input", "feedback_status_not_allowed");
  }

  const session = await requireFounderSession();
  if (!session) {
    return intentErr("unauthenticated", "founder_session_required");
  }

  if (getBackendMode() !== "supabase") {
    return intentErr(
      "unsupported",
      "feedback_status_update_requires_server_backend",
    );
  }

  try {
    const result = await setFeedbackStatus(
      idRes.value,
      payload.status as FeedbackTargetStatus,
    );
    if (!result.ok) {
      return intentErr("internal", "update_feedback_status_failed");
    }
    return intentOk({ id: result.id, status: result.status });
  } catch {
    return intentErr("internal", "update_feedback_status_failed");
  }
}

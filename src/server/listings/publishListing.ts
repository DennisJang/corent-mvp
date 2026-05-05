"use server";

// Validation Bundle 1, Part 3 — founder-controlled public listing
// publication path.
//
// Why this action does NOT use `runIntentCommand`:
//
//   - Publication authority is the **founder allowlist**, not the
//     seller / renter actor identity that `runIntentCommand` would
//     resolve. The seller actor that owns the listing must NOT be
//     able to self-publish. Reusing the existing
//     `requireFounderSession` gate keeps the authorization signal
//     equal to "Supabase session whose email is in
//     `FOUNDER_ADMIN_EMAIL_ALLOWLIST`" and ignores every
//     client-supplied flag.
//
//   - The runner's `prefer: "seller"` / `"renter"` resolution is
//     irrelevant here. The founder is identified by allowlist
//     email; no `seller_profiles` / `borrower_profiles` row is read
//     or required.
//
// Hard rules:
//
//   - The payload contains ONLY `listingId`. Any `sellerId`,
//     `status`, `role`, `capability`, `adminId`, or `approval` flag
//     a forged caller attaches is ignored — the type does not
//     declare them and the runtime never reads them.
//
//   - In mock / default backend mode the action does NOT mutate
//     anything. It returns a typed `unsupported` envelope so the
//     mock environment cannot be coerced into a fake "publish"
//     surface.
//
//   - The canonical listing is reloaded server-side from the
//     marketplace repository BEFORE the status update so a missing
//     id surfaces as `not_found` instead of a silent DB no-op.
//
//   - The response is a tight non-secret DTO (`{ id, status,
//     alreadyApproved }`). It does NOT echo `rawSellerInput`,
//     `privateSerialNumber`, verification internals, internal
//     review notes, or any other private listing field.
//
//   - Errors are typed and non-secret. Repo / db throws map to
//     `intentErr("internal", "publish_listing_failed")`; SQL,
//     env values, table names, and row payloads never reach the
//     client.
//
// References:
//   - `src/server/admin/auth.ts` (`requireFounderSession`)
//   - `src/server/persistence/supabase/listingRepository.ts`
//     (`setListingStatus`, `getListingById`)
//   - `src/lib/services/publicListingService.ts` (allowlist-only
//     public projection — drafts stay private)
//   - `docs/corent_validation_bundle1_part3_publication_note.md`

import { requireFounderSession } from "@/server/admin/auth";
import { getBackendMode } from "@/server/backend/mode";
import {
  getListingById,
  setListingStatus,
} from "@/server/persistence/supabase/listingRepository";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";
import { validateUuid } from "@/server/persistence/supabase/validators";

// Client-supplied payload. Notably absent: `sellerId`, `status`,
// `role`, `capability`, `adminId`, `approval`. These would be
// forged authorization signals; the action never reads them.
export type PublishListingPayload = {
  listingId: string;
};

export type PublishListingResult = {
  id: string;
  status: "approved";
  alreadyApproved: boolean;
};

export async function publishListingAction(
  payload: PublishListingPayload,
): Promise<IntentResult<PublishListingResult>> {
  // Shape validation runs first so a malformed id is rejected
  // BEFORE the founder gate. The validator returns a stable
  // non-secret label.
  const idRes = validateUuid(payload?.listingId);
  if (!idRes.ok) return intentErr("input", "listing_id_invalid");

  // Founder gate. The allowlist is the only authorization signal.
  // Missing session, missing email, non-allowlisted email, or
  // missing SSR client all fail closed (null).
  const session = await requireFounderSession();
  if (!session) {
    return intentErr("unauthenticated", "founder_session_required");
  }

  if (getBackendMode() !== "supabase") {
    // Mock / default backend: refuse to mutate. Returning
    // `unsupported` (vs `internal`) lets the caller surface a
    // specific "not available in mock mode" message without
    // pretending a publication happened.
    return intentErr("unsupported", "publication_requires_server_backend");
  }

  try {
    const existing = await getListingById(idRes.value);
    if (!existing) {
      return intentErr("not_found", "listing_not_found");
    }

    if (existing.status === "approved") {
      // Idempotent: a second call against an already-approved
      // listing is a safe no-op. Surface it explicitly so the
      // caller can render "이미 공개됨" copy without re-running
      // the update.
      return intentOk({
        id: existing.id,
        status: "approved",
        alreadyApproved: true,
      });
    }

    const updated = await setListingStatus(idRes.value, "approved");
    if (!updated.ok) {
      return intentErr("internal", "publish_listing_failed");
    }
    return intentOk({
      id: updated.id,
      status: "approved",
      alreadyApproved: false,
    });
  } catch {
    return intentErr("internal", "publish_listing_failed");
  }
}

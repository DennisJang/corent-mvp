// Client-side adapter for the founder-only feedback review status
// action.
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (boundary test in
//     `src/server/admin/import-boundary.test.ts`). All server
//     action calls go through a `src/lib/client/**` adapter.
//
//   - The adapter normalizes the typed
//     `IntentResult<UpdateFeedbackStatusResult>` into a tighter
//     envelope (`ok` / `unauthenticated` / `input` / `unsupported`
//     / `error`) the cockpit's row controls branch on without
//     reading raw `IntentErrorCode` strings.
//
// Hard rules:
//
//   - The CLIENT payload is `{ id, status }` only — and the
//     `status` is constrained to the `"reviewed" | "archived"`
//     subset. The server action's payload type forbids any other
//     field; this adapter forwards ONLY the whitelisted ones via a
//     fresh object so a forged caller cannot smuggle keys.
//
//   - The founder gate stays inside the server action itself
//     (`requireFounderSession()`). The button only renders inside
//     the founder cockpit page, which is itself founder-gated, but
//     defense in depth: the action's gate is the authority signal.

"use client";

import {
  updateFeedbackStatusAction,
  type UpdateFeedbackStatusPayload,
  type UpdateFeedbackStatusResult,
} from "@/server/feedback/updateFeedbackStatus";

export type FeedbackReviewTargetStatus = UpdateFeedbackStatusPayload["status"];

export type FeedbackReviewInput = {
  id: string;
  status: FeedbackReviewTargetStatus;
};

export type FeedbackReviewUiResult =
  | {
      kind: "ok";
      id: string;
      status: UpdateFeedbackStatusResult["status"];
    }
  | { kind: "unauthenticated" }
  | { kind: "input" }
  | { kind: "unsupported" }
  | { kind: "error" };

export async function updateFeedbackStatusFromCockpit(
  input: FeedbackReviewInput,
): Promise<FeedbackReviewUiResult> {
  // Forge defense — destructure into a fresh object so a caller
  // passing extra keys via cast cannot smuggle them past this
  // boundary.
  const payload: UpdateFeedbackStatusPayload = {
    id: input.id,
    status: input.status,
  };

  try {
    const result = await updateFeedbackStatusAction(payload);
    if (result.ok) {
      return {
        kind: "ok",
        id: result.value.id,
        status: result.value.status,
      };
    }
    switch (result.code) {
      case "unauthenticated":
        return { kind: "unauthenticated" };
      case "input":
        return { kind: "input" };
      case "unsupported":
        return { kind: "unsupported" };
      default:
        return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}

// Client-side adapter for the closed-alpha feedback intake action
// (Validation Bundle 1, Part 2).
//
// Why this seam exists:
//
//   - Components in `src/components/**` cannot import from
//     `@/server/**` directly (static-text boundary). All server
//     action calls go through a `src/lib/client/**` adapter.
//   - The adapter normalizes the typed `IntentResult` into a
//     three-state shape (`ok` / `local` / `error`) the form
//     branches on without inspecting `IntentErrorCode` strings.
//
// Hard rules:
//
//   - No silent fallback. A typed failure surfaces as
//     `{ kind: "error" }`; the form renders an explicit failure
//     caption. Local persistence is never used as a backup.
//   - Mock / default backend mode is surfaced explicitly as
//     `{ kind: "local" }` so the form can show
//     "데모 환경에서는 저장되지 않아요" instead of pretending to
//     have stored the signal.

"use client";

import {
  submitFeedbackAction,
  type SubmitFeedbackPayload,
} from "@/server/feedback/submitFeedback";

export type { SubmitFeedbackPayload };

export type FeedbackSubmitResult =
  | { kind: "ok"; id: string }
  | { kind: "local" }
  | { kind: "error"; reason: "input" | "internal" | "unknown" };

export async function submitFeedback(
  payload: SubmitFeedbackPayload,
): Promise<FeedbackSubmitResult> {
  try {
    const result = await submitFeedbackAction(payload);
    if (result.ok) {
      return { kind: "ok", id: result.value.id };
    }
    if (result.code === "unsupported") {
      return { kind: "local" };
    }
    if (result.code === "input") {
      return { kind: "error", reason: "input" };
    }
    return { kind: "error", reason: "internal" };
  } catch {
    return { kind: "error", reason: "unknown" };
  }
}

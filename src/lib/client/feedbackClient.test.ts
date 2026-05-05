// Tests for the feedback intake client adapter (Validation Bundle 1,
// Part 2). The adapter is intentionally tiny: it calls the server
// action and maps the typed IntentResult into UI-friendly states.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/feedback/submitFeedback", () => ({
  submitFeedbackAction: vi.fn(async () => ({
    ok: true,
    value: { id: "fb-id" },
  })),
}));

import { submitFeedbackAction } from "@/server/feedback/submitFeedback";
import { submitFeedback } from "./feedbackClient";

const mockSubmitAction = vi.mocked(submitFeedbackAction);

const validPayload = {
  kind: "general" as const,
  message: "테스트 의견",
};

beforeEach(() => {
  mockSubmitAction.mockReset();
  mockSubmitAction.mockResolvedValue({ ok: true, value: { id: "fb-id" } });
});

describe("feedback client adapter", () => {
  it("passes the allowlisted payload to the server action and maps ok", async () => {
    const r = await submitFeedback(validPayload);

    expect(r).toEqual({ kind: "ok", id: "fb-id" });
    expect(mockSubmitAction).toHaveBeenCalledWith(validPayload);
  });

  it("maps unsupported to the explicit local-only state", async () => {
    mockSubmitAction.mockResolvedValueOnce({
      ok: false,
      code: "unsupported",
      message: "feedback_intake_local_only",
    });

    await expect(submitFeedback(validPayload)).resolves.toEqual({
      kind: "local",
    });
  });

  it("maps input errors without exposing the action message", async () => {
    mockSubmitAction.mockResolvedValueOnce({
      ok: false,
      code: "input",
      message: "feedback message required",
    });

    await expect(submitFeedback(validPayload)).resolves.toEqual({
      kind: "error",
      reason: "input",
    });
  });

  it("maps internal errors and thrown actions to non-secret states", async () => {
    mockSubmitAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "submit_feedback_failed",
    });

    await expect(submitFeedback(validPayload)).resolves.toEqual({
      kind: "error",
      reason: "internal",
    });

    mockSubmitAction.mockRejectedValueOnce(new Error("SUPABASE_KEY=secret"));
    await expect(submitFeedback(validPayload)).resolves.toEqual({
      kind: "error",
      reason: "unknown",
    });
  });
});

describe("feedback component import boundary", () => {
  it("uses the client adapter and does not import @/server/** directly", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components", "FeedbackIntakeCard.tsx"),
      "utf8",
    );

    expect(src).toContain("@/lib/client/feedbackClient");
    expect(src).not.toMatch(/from\s+["']@\/server\//);
  });
});

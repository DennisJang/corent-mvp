// Tests for the founder feedback review client adapter
// (closed-alpha review workflow).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/feedback/updateFeedbackStatus", () => ({
  updateFeedbackStatusAction: vi.fn(),
}));

import { updateFeedbackStatusAction } from "@/server/feedback/updateFeedbackStatus";
import { updateFeedbackStatusFromCockpit } from "./feedbackReviewClient";

const mockAction = vi.mocked(updateFeedbackStatusAction);

const FEEDBACK_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  mockAction.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateFeedbackStatusFromCockpit — payload forwarding", () => {
  it("forwards EXACTLY {id, status} to the server action", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: { id: FEEDBACK_ID, status: "reviewed" },
    });
    await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(mockAction).toHaveBeenCalledTimes(1);
    const sent = mockAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["id", "status"]);
    expect(sent.id).toBe(FEEDBACK_ID);
    expect(sent.status).toBe("reviewed");
  });

  it("ignores forged authority + PII keys via cast", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: { id: FEEDBACK_ID, status: "archived" },
    });
    await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "archived",
      // @ts-expect-error — forged extra
      profileId: "FORGED_PROFILE",
      // @ts-expect-error — forged extra
      borrowerId: "FORGED_BORROWER",
      // @ts-expect-error — forged extra
      sellerId: "FORGED_SELLER",
      // @ts-expect-error — forged extra
      contactEmail: "spoof@example.com",
      // @ts-expect-error — forged extra
      kind: "wanted_item",
      // @ts-expect-error — forged extra
      message: "spoofed",
      // @ts-expect-error — forged extra
      role: "founder",
      // @ts-expect-error — forged extra
      capability: "founder",
      // @ts-expect-error — forged extra
      adminId: "FORGED_ADMIN",
    });
    const sent = mockAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["id", "status"]);
    for (const k of [
      "profileId",
      "borrowerId",
      "sellerId",
      "contactEmail",
      "kind",
      "message",
      "role",
      "capability",
      "adminId",
    ]) {
      expect(sent[k]).toBeUndefined();
    }
  });
});

describe("updateFeedbackStatusFromCockpit — result mapping", () => {
  it("maps ok envelope → { kind: 'ok', id, status }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      value: { id: FEEDBACK_ID, status: "reviewed" },
    });
    const r = await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "ok", id: FEEDBACK_ID, status: "reviewed" });
  });

  it("maps unauthenticated → { kind: 'unauthenticated' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unauthenticated",
      message: "founder_session_required",
    });
    const r = await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "unauthenticated" });
  });

  it("maps input → { kind: 'input' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "input",
      message: "feedback_id_invalid",
    });
    const r = await updateFeedbackStatusFromCockpit({
      id: "not-a-uuid",
      // @ts-expect-error — runtime guard exists
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "input" });
  });

  it("maps unsupported → { kind: 'unsupported' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "unsupported",
      message: "feedback_status_update_requires_server_backend",
    });
    const r = await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "unsupported" });
  });

  it("maps any other typed code → { kind: 'error' }", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      code: "internal",
      message: "update_feedback_status_failed",
    });
    const r = await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "error" });
  });

  it("maps a thrown error → { kind: 'error' } (no leak)", async () => {
    mockAction.mockRejectedValueOnce(new Error("ECONNRESET"));
    const r = await updateFeedbackStatusFromCockpit({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r).toEqual({ kind: "error" });
  });
});

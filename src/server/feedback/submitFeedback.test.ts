// Tests for the closed-alpha feedback intake action (Validation
// Bundle 1, Part 2). Covers:
//
//   - shape validation (missing/empty message, unknown kind,
//     malformed email, oversize fields)
//   - mock backend mode → typed `unsupported` envelope (no DB call)
//   - supabase backend mode → repo invoked with the validated
//     payload and the resolved profile id (or null)
//   - forged payload `profileId` / `id` / `status` is ignored
//   - repo throw maps to typed `internal`
//
// We mock the repo and the actor resolver so the test runs without
// env or DB.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/persistence/supabase/feedbackRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/feedbackRepository")
  >("@/server/persistence/supabase/feedbackRepository");
  return {
    ...actual,
    insertFeedbackSubmission: vi.fn(async () => ({ ok: true, id: "fb-id" })),
  };
});

vi.mock("@/server/actors/resolveServerActor", () => ({
  resolveServerActor: vi.fn(async () => null),
}));

import { insertFeedbackSubmission } from "@/server/persistence/supabase/feedbackRepository";
import { resolveServerActor } from "@/server/actors/resolveServerActor";
import { submitFeedbackAction } from "./submitFeedback";

const mockInsert = vi.mocked(insertFeedbackSubmission);
const mockResolveActor = vi.mocked(resolveServerActor);

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ ok: true, id: "fb-id" });
  mockResolveActor.mockReset();
  mockResolveActor.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("submitFeedbackAction — shape validation", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("rejects empty message with code 'input'", async () => {
    const r = await submitFeedbackAction({
      kind: "general",
      message: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only message with code 'input'", async () => {
    const r = await submitFeedbackAction({
      kind: "general",
      message: "   ",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects unknown kind with code 'input'", async () => {
    const r = await submitFeedbackAction({
      // @ts-expect-error — runtime guard
      kind: "unknown",
      message: "테스트",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects malformed contact email with code 'input'", async () => {
    const r = await submitFeedbackAction({
      kind: "general",
      message: "테스트",
      contactEmail: "not-an-email",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects unknown category with code 'input'", async () => {
    const r = await submitFeedbackAction({
      kind: "wanted_item",
      message: "테스트",
      // @ts-expect-error — runtime guard
      category: "electronics",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects oversize message with code 'input'", async () => {
    const r = await submitFeedbackAction({
      kind: "general",
      message: "x".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("submitFeedbackAction — mock / default backend mode", () => {
  it("returns 'unsupported' when backend is not supabase (no DB write)", async () => {
    const r = await submitFeedbackAction({
      kind: "general",
      message: "테스트",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' even when payload is fully valid", async () => {
    const r = await submitFeedbackAction({
      kind: "wanted_item",
      message: "테스트 메모",
      itemName: "다이슨",
      category: "home_care",
      contactEmail: "x@example.com",
      sourcePage: "/",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("submitFeedbackAction — supabase backend mode", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("inserts with null profile_id when no auth session", async () => {
    mockResolveActor.mockResolvedValueOnce(null);
    const r = await submitFeedbackAction({
      kind: "wanted_item",
      message: "테스트 메모",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("fb-id");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0]?.[0]?.profileId).toBeNull();
  });

  it("inserts with the resolved profile_id when the user is signed in", async () => {
    mockResolveActor.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: "11111111-2222-3333-4444-555555555555",
      displayName: "DEMO 셀러",
      source: "supabase",
    });

    const r = await submitFeedbackAction({
      kind: "feature_request",
      message: "이 기능이 있었으면 좋겠어요.",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(mockInsert.mock.calls[0]?.[0]?.profileId).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
    expect(mockResolveActor).toHaveBeenCalledWith({ prefer: "renter" });
  });

  it("ignores any client-supplied profileId/id/status field on the payload (compile + runtime)", async () => {
    mockResolveActor.mockResolvedValueOnce(null);
    // The payload type does not declare these fields. A forged
    // caller passing them via cast must NOT see them reach the
    // repo — the action only forwards the validated allowlist.
    const r = await submitFeedbackAction({
      kind: "general",
      message: "테스트",
      // @ts-expect-error — forged extra fields not in the payload type
      profileId: "forged-profile",
      // @ts-expect-error — forged extra fields not in the payload type
      id: "forged-id",
      // @ts-expect-error — forged extra fields not in the payload type
      status: "reviewed",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const insertedPayload = mockInsert.mock.calls[0]?.[0];
    expect(insertedPayload?.profileId).toBeNull();
    expect(
      (insertedPayload as Record<string, unknown> | undefined)?.id,
    ).toBeUndefined();
    expect(
      (insertedPayload as Record<string, unknown> | undefined)?.status,
    ).toBeUndefined();
  });

  it("maps repo error to typed 'internal' without leaking the underlying message", async () => {
    mockInsert.mockResolvedValueOnce({
      ok: false,
      error: "relation does not exist; SUPABASE_SERVICE_ROLE_KEY=xxx",
    });
    const r = await submitFeedbackAction({
      kind: "general",
      message: "테스트",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toContain("relation");
    expect(r.message).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("maps repo throw to typed 'internal'", async () => {
    mockInsert.mockRejectedValueOnce(new Error("boom"));
    const r = await submitFeedbackAction({
      kind: "general",
      message: "테스트",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
  });
});

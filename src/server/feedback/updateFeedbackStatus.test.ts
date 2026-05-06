// Tests for the founder-only feedback review status action
// (closed-alpha review workflow).
//
// Coverage:
//   - shape validation (non-uuid id rejected before auth probe)
//   - status validation: "new" is rejected; only "reviewed" /
//     "archived" are accepted
//   - founder gate (no session → unauthenticated, no DB call)
//   - normal seller / non-allowlisted Supabase user fails closed
//   - mock backend mode → typed `unsupported` (no DB call)
//   - supabase backend mode + missing row → repo error → typed
//     `internal`
//   - supabase backend mode + happy path → ok envelope with the
//     tight `{id, status}` DTO
//   - forged payload (profileId / contactEmail / borrowerId / kind /
//     message / role / capability / adminId / approval) is ignored
//   - response DTO does NOT carry message / contactEmail / profileId
//     / kind / category / itemName / sourcePage / createdAt
//   - repo throw maps to typed `internal` (no SQL/env/stack leakage)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/persistence/supabase/feedbackRepository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/persistence/supabase/feedbackRepository")
  >("@/server/persistence/supabase/feedbackRepository");
  return {
    ...actual,
    setFeedbackStatus: vi.fn(async () => ({
      ok: true,
      id: "ok",
      status: "reviewed",
    })),
  };
});

vi.mock("@/server/admin/supabase-ssr", () => ({
  createAdminAuthClient: vi.fn(async () => null),
}));

import { setFeedbackStatus } from "@/server/persistence/supabase/feedbackRepository";
import {
  _resetSessionReaderForTests,
  _setSessionReaderForTests,
} from "@/server/admin/auth";
import { updateFeedbackStatusAction } from "./updateFeedbackStatus";

const mockSetStatus = vi.mocked(setFeedbackStatus);

const FEEDBACK_ID = "11111111-2222-4333-8444-555555555555";
const FOUNDER_EMAIL = "founder@example.com";

function asFounder() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => ({ email: FOUNDER_EMAIL }));
}

function asNonFounder() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => ({ email: "attacker@example.com" }));
}

function asAnonymous() {
  process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST = FOUNDER_EMAIL;
  _setSessionReaderForTests(async () => null);
}

beforeEach(() => {
  mockSetStatus.mockReset();
  mockSetStatus.mockResolvedValue({
    ok: true,
    id: FEEDBACK_ID,
    status: "reviewed",
  });
});

afterEach(() => {
  delete process.env.FOUNDER_ADMIN_EMAIL_ALLOWLIST;
  _resetSessionReaderForTests();
  vi.unstubAllEnvs();
});

describe("updateFeedbackStatusAction — shape validation", () => {
  beforeEach(() => {
    asFounder();
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("rejects a non-uuid id with code 'input' (no auth or DB call)", async () => {
    const r = await updateFeedbackStatusAction({
      id: "not-a-uuid",
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("rejects an empty id", async () => {
    const r = await updateFeedbackStatusAction({
      id: "",
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing id", async () => {
    const r = await updateFeedbackStatusAction(
      { status: "reviewed" } as unknown as {
        id: string;
        status: "reviewed";
      },
    );
    expect(r.ok).toBe(false);
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("rejects target status 'new' (only reviewed/archived are allowed)", async () => {
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "new" as unknown as "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("rejects an unknown target status string", async () => {
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "deleted" as unknown as "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("input");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});

describe("updateFeedbackStatusAction — founder authority gate", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
  });

  it("returns 'unauthenticated' when no session is present", async () => {
    asAnonymous();
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unauthenticated' for a non-allowlisted Supabase user (sellers cannot mutate)", async () => {
    asNonFounder();
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unauthenticated' when the allowlist env var is missing entirely", async () => {
    _setSessionReaderForTests(async () => ({ email: FOUNDER_EMAIL }));
    // Note: no FOUNDER_ADMIN_EMAIL_ALLOWLIST set → fail closed.
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unauthenticated");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});

describe("updateFeedbackStatusAction — mock / default backend mode", () => {
  beforeEach(() => {
    asFounder();
  });

  it("returns 'unsupported' when backend is not supabase (no DB call)", async () => {
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("returns 'unsupported' when CORENT_BACKEND_MODE is explicitly 'mock'", async () => {
    vi.stubEnv("CORENT_BACKEND_MODE", "mock");
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "archived",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported");
  });
});

describe("updateFeedbackStatusAction — supabase backend mode (happy path)", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    asFounder();
  });

  it("returns ok envelope with the tight {id, status} DTO and forwards (id, 'reviewed') to the repo", async () => {
    mockSetStatus.mockResolvedValueOnce({
      ok: true,
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ id: FEEDBACK_ID, status: "reviewed" });
    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(FEEDBACK_ID, "reviewed");
  });

  it("supports the 'archived' transition", async () => {
    mockSetStatus.mockResolvedValueOnce({
      ok: true,
      id: FEEDBACK_ID,
      status: "archived",
    });
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "archived",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ id: FEEDBACK_ID, status: "archived" });
    expect(mockSetStatus).toHaveBeenCalledWith(FEEDBACK_ID, "archived");
  });

  it("ignores forged authority + PII fields on the payload", async () => {
    const forged = {
      id: FEEDBACK_ID,
      status: "reviewed",
      // The fields below would be authority / PII smuggling. The
      // action's runtime forwards ONLY id + status — the forged
      // values must never reach the repo.
      profileId: "00000000-0000-4000-8000-000000000099",
      borrowerId: "22222222-2222-4333-8444-555555555555",
      sellerId: "33333333-2222-4333-8444-555555555555",
      email: "spoof@example.com",
      contactEmail: "spoof2@example.com",
      kind: "wanted_item",
      message: "spoofed message",
      role: "founder",
      capability: "founder",
      adminId: "44444444-2222-4333-8444-555555555555",
      approval: true,
      createdAt: "2026-05-06T00:00:00.000Z",
    } as unknown as { id: string; status: "reviewed" };

    const r = await updateFeedbackStatusAction(forged);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    // The repo received exactly two args: id + status. None of the
    // forged keys reached the boundary.
    expect(mockSetStatus.mock.calls[0]).toEqual([FEEDBACK_ID, "reviewed"]);
    // The result DTO carries only id + status.
    expect(Object.keys(r.value).sort()).toEqual(["id", "status"]);
  });

  it("returns 'internal' when the repo reports a failure (no leak)", async () => {
    mockSetStatus.mockResolvedValueOnce({
      ok: false,
      error: "feedback status update failed: relation \"x\" does not exist",
    });
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    // No SQL / table name / row payload / id leaked through the
    // typed envelope label.
    expect(r.message).not.toMatch(/relation/);
    expect(r.message).not.toMatch(/feedback_submissions/);
    expect(r.message).not.toContain(FEEDBACK_ID);
  });

  it("maps a repo throw to typed 'internal' (no stack / SQL leakage)", async () => {
    mockSetStatus.mockRejectedValueOnce(
      new Error("ECONNRESET — internal stack frame"),
    );
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("internal");
    expect(r.message).not.toMatch(/ECONNRESET/);
  });
});

describe("updateFeedbackStatusAction — DTO is narrow (id + status only)", () => {
  beforeEach(() => {
    vi.stubEnv("CORENT_BACKEND_MODE", "supabase");
    asFounder();
  });

  it("ok envelope value has EXACTLY {id, status} — no message / contact / profile / kind / etc.", async () => {
    mockSetStatus.mockResolvedValueOnce({
      ok: true,
      id: FEEDBACK_ID,
      status: "archived",
    });
    const r = await updateFeedbackStatusAction({
      id: FEEDBACK_ID,
      status: "archived",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value).sort()).toEqual(["id", "status"]);
    for (const forbidden of [
      "message",
      "contactEmail",
      "contact_email",
      "profileId",
      "profile_id",
      "kind",
      "category",
      "itemName",
      "item_name",
      "sourcePage",
      "source_page",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
      "borrowerId",
      "sellerId",
      "email",
    ]) {
      expect(r.value as unknown as Record<string, unknown>).not.toHaveProperty(
        forbidden,
      );
    }
  });
});

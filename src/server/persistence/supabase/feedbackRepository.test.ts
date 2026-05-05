// Tests for the closed-alpha feedback repository (Validation Bundle 1,
// Part 2). The marketplace client is mocked at the module level so
// the test runs without env / DB.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { insertFeedbackSubmission } from "./feedbackRepository";

vi.mock("./client", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("./client");
  return {
    ...mod,
    getMarketplaceClient: vi.fn(() => null),
  };
});

import { getMarketplaceClient } from "./client";

type Capture = { table: string; method: string; args: unknown[] };

function makeFakeClient(
  responders: {
    insert?: () => { data: unknown; error: unknown };
  },
  capture: Capture[],
) {
  function builder(table: string) {
    return {
      insert(payload: unknown) {
        capture.push({ table, method: "insert", args: [payload] });
        const r = responders.insert
          ? responders.insert()
          : { data: { id: "ok" }, error: null };
        return {
          select() {
            return {
              maybeSingle() {
                return Promise.resolve(r);
              },
            };
          },
          then(...args: Parameters<Promise<unknown>["then"]>) {
            return Promise.resolve(r).then(...args);
          },
        };
      },
    };
  }
  return {
    from(table: string) {
      return builder(table);
    },
  };
}

beforeEach(() => {
  vi.mocked(getMarketplaceClient).mockReturnValue(null);
});

afterEach(() => {
  vi.mocked(getMarketplaceClient).mockReset();
});

describe("feedback repository — client unavailable", () => {
  it("insertFeedbackSubmission fails closed when client is null", async () => {
    const r = await insertFeedbackSubmission({
      kind: "wanted_item",
      message: "테스트 메모",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unavailable/);
  });
});

describe("feedback repository — input validation rejects untrusted shapes", () => {
  it("rejects unknown kind", async () => {
    const r = await insertFeedbackSubmission({
      // @ts-expect-error — runtime guard exists
      kind: "unknown",
      message: "테스트",
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects empty message", async () => {
    const r = await insertFeedbackSubmission({
      kind: "general",
      message: "",
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only message", async () => {
    const r = await insertFeedbackSubmission({
      kind: "general",
      message: "   ",
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects oversize message", async () => {
    const r = await insertFeedbackSubmission({
      kind: "general",
      message: "x".repeat(2001),
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed contact email", async () => {
    const r = await insertFeedbackSubmission({
      kind: "general",
      message: "테스트",
      contactEmail: "not-an-email",
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects unknown category", async () => {
    const r = await insertFeedbackSubmission({
      kind: "wanted_item",
      message: "테스트",
      // @ts-expect-error — runtime guard
      category: "electronics",
    });
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });
});

describe("feedback repository — happy path with mocked client", () => {
  it("inserts a row with status defaulting to 'new' (column default)", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        insert: () => ({
          data: { id: "11111111-2222-4333-8444-555555555555" },
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await insertFeedbackSubmission({
      kind: "wanted_item",
      message: "테스트 메모",
      itemName: "다이슨 슈퍼소닉",
      category: "home_care",
      contactEmail: "tester@example.com",
      sourcePage: "/",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe("11111111-2222-4333-8444-555555555555");

    const insertCall = captured.find(
      (c) => c.table === "feedback_submissions" && c.method === "insert",
    );
    expect(insertCall).toBeTruthy();
    const payload = insertCall?.args[0] as Record<string, unknown>;
    expect(payload.kind).toBe("wanted_item");
    expect(payload.message).toBe("테스트 메모");
    expect(payload.item_name).toBe("다이슨 슈퍼소닉");
    expect(payload.category).toBe("home_care");
    expect(payload.contact_email).toBe("tester@example.com");
    expect(payload.source_page).toBe("/");
    // Status / id / created_at / updated_at must NOT be on the
    // payload — they come from column defaults so the action
    // cannot override them.
    expect(payload.status).toBeUndefined();
    expect(payload.id).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.updated_at).toBeUndefined();
  });
});

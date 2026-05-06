// Tests for the closed-alpha feedback repository (Validation Bundle 1,
// Part 2). The marketplace client is mocked at the module level so
// the test runs without env / DB.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  insertFeedbackSubmission,
  listRecentFeedbackSubmissions,
  setFeedbackStatus,
} from "./feedbackRepository";

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
    select?: () => { data: unknown; error: unknown };
    update?: () => { data: unknown; error: unknown };
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
      update(payload: unknown) {
        capture.push({ table, method: "update", args: [payload] });
        const r = responders.update
          ? responders.update()
          : { data: { id: "ok" }, error: null };
        return {
          eq(col: string, val: unknown) {
            capture.push({ table, method: "eq", args: [col, val] });
            return this;
          },
          select(cols?: string) {
            capture.push({ table, method: "select", args: [cols] });
            return this;
          },
          maybeSingle() {
            capture.push({ table, method: "maybeSingle", args: [] });
            return Promise.resolve(r);
          },
        };
      },
      select(cols?: string) {
        capture.push({ table, method: "select", args: [cols] });
        return this;
      },
      order(col: string, opts?: unknown) {
        capture.push({ table, method: "order", args: [col, opts] });
        return this;
      },
      limit(n: number) {
        capture.push({ table, method: "limit", args: [n] });
        const r = responders.select
          ? responders.select()
          : { data: [], error: null };
        return Promise.resolve(r);
      },
      then(...args: Parameters<Promise<unknown>["then"]>) {
        const r = responders.select
          ? responders.select()
          : { data: [], error: null };
        return Promise.resolve(r).then(...args);
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

describe("listRecentFeedbackSubmissions — Bundle 2 Slice 4 read helper", () => {
  it("returns [] when client is unavailable (no env)", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await listRecentFeedbackSubmissions()).toEqual([]);
  });

  it("returns [] when the underlying read errors", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      { select: () => ({ data: null, error: { message: "boom" } }) },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    expect(await listRecentFeedbackSubmissions()).toEqual([]);
  });

  it("orders by created_at desc, clamps limit, returns DTO with bounded fields only", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        select: () => ({
          data: [
            {
              id: "00000000-0000-0000-0000-000000000001",
              kind: "wanted_item",
              message: "다이슨 빌려보고 싶어요",
              item_name: "다이슨 슈퍼소닉",
              category: "home_care",
              contact_email: "tester@example.com",
              profile_id: "00000000-0000-0000-0000-000000000099",
              source_page: "/",
              status: "new",
              created_at: "2026-05-01T00:00:00.000Z",
            },
          ],
          error: null,
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const rows = await listRecentFeedbackSubmissions(10_000);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      kind: "wanted_item",
      status: "new",
      message: "다이슨 빌려보고 싶어요",
      itemName: "다이슨 슈퍼소닉",
      category: "home_care",
      contactEmail: "tester@example.com",
      profileId: "00000000-0000-0000-0000-000000000099",
      sourcePage: "/",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    // The query is ordered by created_at desc and the limit is
    // clamped to 200 (the function's documented upper bound).
    const orderCall = captured.find((c) => c.method === "order");
    expect(orderCall?.args).toEqual([
      "created_at",
      { ascending: false },
    ]);
    const limitCall = captured.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(200);
  });

  it("clamps a too-small limit to 1", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient({}, captured) as unknown as ReturnType<
      typeof getMarketplaceClient
    >;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);
    await listRecentFeedbackSubmissions(0);
    const limitCall = captured.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(1);
  });
});

describe("setFeedbackStatus — input validation", () => {
  const VALID_ID = "11111111-2222-4333-8444-555555555555";

  it("rejects a non-uuid id without calling the client", async () => {
    const r = await setFeedbackStatus("not-a-uuid", "reviewed");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/invalid/);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects an empty id", async () => {
    const r = await setFeedbackStatus("", "reviewed");
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects target status 'new' (only reviewed/archived are allowed)", async () => {
    const r = await setFeedbackStatus(
      VALID_ID,
      // @ts-expect-error — runtime guard exists; "new" is excluded
      "new",
    );
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("rejects an unknown target status", async () => {
    const r = await setFeedbackStatus(
      VALID_ID,
      // @ts-expect-error — runtime guard
      "deleted",
    );
    expect(r.ok).toBe(false);
    expect(getMarketplaceClient).not.toHaveBeenCalled();
  });

  it("returns 'unavailable' error when the client is null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await setFeedbackStatus(VALID_ID, "reviewed");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unavailable/);
  });
});

describe("setFeedbackStatus — happy path with mocked client", () => {
  const VALID_ID = "11111111-2222-4333-8444-555555555555";

  it("issues an update on feedback_submissions filtered by id and only writes the status column", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: { id: VALID_ID }, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setFeedbackStatus(VALID_ID, "reviewed");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe(VALID_ID);
    expect(r.status).toBe("reviewed");

    const updateCall = captured.find(
      (c) => c.table === "feedback_submissions" && c.method === "update",
    );
    expect(updateCall).toBeTruthy();
    const payload = updateCall?.args[0] as Record<string, unknown>;
    // Only `status` is mutated — never message, contact_email,
    // profile_id, created_at, etc.
    expect(Object.keys(payload).sort()).toEqual(["status"]);
    expect(payload.status).toBe("reviewed");

    const eqCall = captured.find(
      (c) => c.table === "feedback_submissions" && c.method === "eq",
    );
    expect(eqCall?.args).toEqual(["id", VALID_ID]);
  });

  it("supports the 'archived' transition", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: { id: VALID_ID }, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setFeedbackStatus(VALID_ID, "archived");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("archived");
    const updateCall = captured.find((c) => c.method === "update");
    expect((updateCall?.args[0] as Record<string, unknown>).status).toBe(
      "archived",
    );
  });

  it("returns ok:false when the underlying update reports an error (no leak)", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({
          data: null,
          error: { message: "duplicate key value" },
        }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setFeedbackStatus(VALID_ID, "reviewed");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The repo surfaces the error string verbatim from the driver
    // so the action layer can collapse it into a typed `internal`
    // envelope. Either way it must not be the SQL or the row body.
    expect(r.error).not.toContain(VALID_ID);
    expect(r.error).not.toMatch(/feedback_submissions\./);
  });

  it("returns ok:false when the row does not exist (no rows returned)", async () => {
    const captured: Capture[] = [];
    const fake = makeFakeClient(
      {
        update: () => ({ data: null, error: null }),
      },
      captured,
    ) as unknown as ReturnType<typeof getMarketplaceClient>;
    vi.mocked(getMarketplaceClient).mockReturnValue(fake);

    const r = await setFeedbackStatus(VALID_ID, "reviewed");
    expect(r.ok).toBe(false);
  });
});

// Intake repository tests. Default test run uses a mocked marketplace
// client — there is no live DB dependency.
//
// Coverage:
//   - client-unavailable safe path (returns null / [] / { ok:false })
//   - validator boundary on every save / append path
//   - row → domain mappers (sessions, messages, extractions)
//   - JSONB `missing_fields` write-path strictness vs read-path
//     tolerance
//   - components empty-array round-trips to undefined on read
//
// Integration against a real Supabase project is intentionally NOT
// part of this file. When the migration has been applied to a dev
// project and an env-gated suite arrives in PR 3, it will live in a
// separate `*.integration.test.ts` and skip cleanly when env is
// missing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IntakeExtraction,
  IntakeMessage,
  IntakeSession,
} from "@/domain/intake";
import { _resetMarketplaceClientForTests } from "./client";
import {
  _mappers,
  appendIntakeMessage,
  getIntakeExtractionForSession,
  getIntakeSession,
  listIntakeMessagesForSession,
  listIntakeSessions,
  saveIntakeExtraction,
  saveIntakeSession,
} from "./intakeRepository";

const SESSION_UUID = "11111111-2222-4333-8444-555555555555";
const SELLER_UUID  = "22222222-2222-4333-8444-555555555555";
const LISTING_UUID = "33333333-2222-4333-8444-555555555555";
const MESSAGE_UUID = "44444444-2222-4333-8444-555555555555";

// Minimal builder-style fake Supabase client that records calls and
// returns scripted responses. Enough surface area for the repo's
// upsert / insert / select / eq / order / limit / maybeSingle calls.

type Capture = { table: string; method: string; args: unknown[] };

type Responders = {
  select?: () => { data: unknown; error: unknown };
  upsert?: () => { data: unknown; error: unknown };
  insert?: () => { data: unknown; error: unknown };
};

function makeFakeClient(responders: Responders, capture: Capture[]) {
  function builder(table: string) {
    return {
      select(cols?: string, opts?: unknown) {
        capture.push({ table, method: "select", args: [cols, opts] });
        return this;
      },
      eq(col: string, val: unknown) {
        capture.push({ table, method: "eq", args: [col, val] });
        return this;
      },
      order(col: string, opts?: unknown) {
        capture.push({ table, method: "order", args: [col, opts] });
        return this;
      },
      limit(n: number) {
        capture.push({ table, method: "limit", args: [n] });
        return this;
      },
      maybeSingle() {
        capture.push({ table, method: "maybeSingle", args: [] });
        return Promise.resolve(
          responders.select ? responders.select() : { data: null, error: null },
        );
      },
      then(...args: Parameters<Promise<unknown>["then"]>) {
        capture.push({ table, method: "then", args: [] });
        const result = responders.select
          ? responders.select()
          : { data: [], error: null };
        return Promise.resolve(result).then(...args);
      },
      upsert(payload: unknown, opts?: unknown) {
        capture.push({ table, method: "upsert", args: [payload, opts] });
        const r = responders.upsert
          ? responders.upsert()
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
      insert(payload: unknown) {
        capture.push({ table, method: "insert", args: [payload] });
        const r = responders.insert
          ? responders.insert()
          : { data: null, error: null };
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

vi.mock("./client", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("./client");
  return {
    ...mod,
    getMarketplaceClient: vi.fn(() => null),
    _resetMarketplaceClientForTests: () => {},
  };
});

import { getMarketplaceClient } from "./client";

const baseSession: IntakeSession = {
  id: SESSION_UUID,
  sellerId: SELLER_UUID,
  status: "drafting",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

const baseMessage: IntakeMessage = {
  id: MESSAGE_UUID,
  sessionId: SESSION_UUID,
  role: "seller",
  content: "테라건 미니 빌려줄게요. 강남역 근처에서 픽업 가능해요.",
  createdAt: "2026-04-30T00:00:01.000Z",
};

const baseExtraction: IntakeExtraction = {
  sessionId: SESSION_UUID,
  itemName: "Theragun Mini",
  category: "massage_gun",
  pickupArea: "강남역 근처",
  condition: "lightly_used",
  components: ["본체"],
  oneDayPrice: 9000,
  missingFields: ["estimatedValue", "defects"],
  createdAt: "2026-04-30T00:00:02.000Z",
};

beforeEach(() => {
  _resetMarketplaceClientForTests();
});

afterEach(() => {
  vi.mocked(getMarketplaceClient).mockReturnValue(null);
});

describe("intake repository — client unavailable (default safe path)", () => {
  it("getIntakeSession returns null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await getIntakeSession(SESSION_UUID)).toBeNull();
  });

  it("listIntakeSessions returns []", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await listIntakeSessions()).toEqual([]);
  });

  it("listIntakeMessagesForSession returns []", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await listIntakeMessagesForSession(SESSION_UUID)).toEqual([]);
  });

  it("getIntakeExtractionForSession returns null", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await getIntakeExtractionForSession(SESSION_UUID)).toBeNull();
  });

  it("saveIntakeSession fails closed when client is unavailable", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await saveIntakeSession(baseSession);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unavailable/);
  });

  it("appendIntakeMessage fails closed when client is unavailable", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await appendIntakeMessage(baseMessage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unavailable/);
  });

  it("saveIntakeExtraction fails closed when client is unavailable", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    const r = await saveIntakeExtraction(baseExtraction);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unavailable/);
  });
});

describe("intake repository — input validation rejects untrusted shapes", () => {
  // The repo's save / append methods check `getMarketplaceClient()`
  // BEFORE validating (matching the listing / rental repos). To
  // exercise the validator-error path we need a working fake client;
  // the validators short-circuit before any DB call gets made.
  let validationCapture: Capture[];
  beforeEach(() => {
    validationCapture = [];
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient(
        {
          upsert: () => ({ data: null, error: null }),
          insert: () => ({ data: null, error: null }),
        },
        validationCapture,
      ) as never,
    );
  });
  afterEach(() => {
    // No DB call should have happened on any rejected validation.
    expect(
      validationCapture.some((c) => c.method === "upsert" || c.method === "insert"),
    ).toBe(false);
  });

  it("saveIntakeSession rejects non-uuid id", async () => {
    const r = await saveIntakeSession({ ...baseSession, id: "isn_abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^id: /);
  });

  it("saveIntakeSession rejects non-uuid seller_id", async () => {
    const r = await saveIntakeSession({ ...baseSession, sellerId: "seller_jisu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^seller_id: /);
  });

  it("saveIntakeSession rejects unknown status", async () => {
    const r = await saveIntakeSession({
      ...baseSession,
      status: "weird" as IntakeSession["status"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/status:/);
  });

  it("saveIntakeSession rejects non-uuid listing_intent_id", async () => {
    const r = await saveIntakeSession({
      ...baseSession,
      listingIntentId: "li_abc",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/listing_intent_id:/);
  });

  it("appendIntakeMessage rejects empty content", async () => {
    const r = await appendIntakeMessage({ ...baseMessage, content: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/content:/);
  });

  it("appendIntakeMessage rejects > 2000 char content", async () => {
    const long = "x".repeat(2001);
    const r = await appendIntakeMessage({ ...baseMessage, content: long });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/content:/);
  });

  it("appendIntakeMessage rejects unknown role", async () => {
    const r = await appendIntakeMessage({
      ...baseMessage,
      role: "founder" as IntakeMessage["role"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/role:/);
  });

  it("saveIntakeExtraction rejects unknown missing_fields entries", async () => {
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      missingFields: [
        "estimatedValue",
        // intentionally not a valid IntakeExtractionField:
        "fooBar" as unknown as never,
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/missing_fields/);
  });

  it("saveIntakeExtraction rejects out-of-bounds price", async () => {
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      oneDayPrice: 99_999_999,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/one_day_price/);
  });

  it("saveIntakeExtraction rejects unknown category", async () => {
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      category: "drone" as IntakeExtraction["category"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/category/);
  });

  it("saveIntakeExtraction rejects too many components", async () => {
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      components: Array.from({ length: 13 }, (_, i) => `c${i}`),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/components/);
  });
});

describe("intake repository — happy path issues correct DB calls", () => {
  it("saveIntakeSession upserts onto listing_intake_sessions with normalized payload", async () => {
    const capture: Capture[] = [];
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({ upsert: () => ({ data: { id: SESSION_UUID }, error: null }) }, capture) as never,
    );
    const r = await saveIntakeSession({
      ...baseSession,
      listingIntentId: LISTING_UUID,
    });
    expect(r.ok).toBe(true);

    const upsertCall = capture.find((c) => c.method === "upsert");
    expect(upsertCall?.table).toBe("listing_intake_sessions");
    const payload = upsertCall?.args[0] as Record<string, unknown>;
    expect(payload.id).toBe(SESSION_UUID);
    expect(payload.seller_id).toBe(SELLER_UUID);
    expect(payload.status).toBe("drafting");
    expect(payload.listing_intent_id).toBe(LISTING_UUID);
  });

  it("appendIntakeMessage uses INSERT (never UPSERT)", async () => {
    const capture: Capture[] = [];
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({ insert: () => ({ data: null, error: null }) }, capture) as never,
    );
    const r = await appendIntakeMessage(baseMessage);
    expect(r.ok).toBe(true);

    expect(capture.some((c) => c.method === "insert")).toBe(true);
    expect(capture.some((c) => c.method === "upsert")).toBe(false);
  });

  it("saveIntakeExtraction upserts with the validated jsonb missing_fields", async () => {
    const capture: Capture[] = [];
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({ upsert: () => ({ data: null, error: null }) }, capture) as never,
    );
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      missingFields: ["estimatedValue", "estimatedValue", "defects"],
    });
    expect(r.ok).toBe(true);

    const upsertCall = capture.find((c) => c.method === "upsert");
    const payload = upsertCall?.args[0] as Record<string, unknown>;
    // duplicates are dropped by the write-path validator
    expect(payload.missing_fields).toEqual(["estimatedValue", "defects"]);
  });

  it("saveIntakeExtraction maps undefined components to empty array on the way to DB", async () => {
    const capture: Capture[] = [];
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({ upsert: () => ({ data: null, error: null }) }, capture) as never,
    );
    const r = await saveIntakeExtraction({
      ...baseExtraction,
      components: undefined,
    });
    expect(r.ok).toBe(true);
    const upsertCall = capture.find((c) => c.method === "upsert");
    const payload = upsertCall?.args[0] as Record<string, unknown>;
    expect(payload.components).toEqual([]);
  });
});

describe("intake repository — row → domain mappers", () => {
  it("mapRowToSession folds null listing_intent_id to undefined", () => {
    const session = _mappers.mapRowToSession({
      id: SESSION_UUID,
      seller_id: SELLER_UUID,
      status: "drafting",
      listing_intent_id: null,
      created_at: "2026-04-30T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    });
    expect(session.listingIntentId).toBeUndefined();
    expect(session.sellerId).toBe(SELLER_UUID);
  });

  it("mapRowToSession preserves a non-null listing_intent_id", () => {
    const session = _mappers.mapRowToSession({
      id: SESSION_UUID,
      seller_id: SELLER_UUID,
      status: "draft_created",
      listing_intent_id: LISTING_UUID,
      created_at: "2026-04-30T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    });
    expect(session.listingIntentId).toBe(LISTING_UUID);
    expect(session.status).toBe("draft_created");
  });

  it("mapRowToMessage round-trips the durable fields", () => {
    const message = _mappers.mapRowToMessage({
      id: MESSAGE_UUID,
      session_id: SESSION_UUID,
      role: "assistant",
      content: "초안 미리보기 (검토 후 수정 가능):",
      created_at: "2026-04-30T00:00:01.000Z",
    });
    expect(message.id).toBe(MESSAGE_UUID);
    expect(message.sessionId).toBe(SESSION_UUID);
    expect(message.role).toBe("assistant");
    expect(message.content).toContain("초안");
  });

  it("mapRowToExtraction folds [] components to undefined and nulls to undefined", () => {
    const ex = _mappers.mapRowToExtraction({
      session_id: SESSION_UUID,
      item_name: null,
      category: null,
      pickup_area: null,
      condition: null,
      defects: null,
      components: [],
      estimated_value: null,
      one_day_price: null,
      three_days_price: null,
      seven_days_price: null,
      missing_fields: [],
      created_at: "2026-04-30T00:00:02.000Z",
      updated_at: "2026-04-30T00:00:02.000Z",
    });
    expect(ex.itemName).toBeUndefined();
    expect(ex.category).toBeUndefined();
    expect(ex.components).toBeUndefined();
    expect(ex.estimatedValue).toBeUndefined();
    expect(ex.missingFields).toEqual([]);
  });

  it("mapRowToExtraction tolerates JSONB drift — drops unknown / wrong-typed missing_fields entries", () => {
    const ex = _mappers.mapRowToExtraction({
      session_id: SESSION_UUID,
      item_name: "Theragun Mini",
      category: "massage_gun",
      pickup_area: "강남역 근처",
      condition: "lightly_used",
      defects: null,
      components: ["본체"],
      estimated_value: null,
      one_day_price: 9000,
      three_days_price: null,
      seven_days_price: null,
      // mix of valid, unknown, and wrong-typed entries:
      missing_fields: ["estimatedValue", "fooBar", 42, null, "defects"],
      created_at: "2026-04-30T00:00:02.000Z",
      updated_at: "2026-04-30T00:00:02.000Z",
    });
    expect(ex.missingFields).toEqual(["estimatedValue", "defects"]);
    expect(ex.components).toEqual(["本体".replace("本体", "본체")]);
    expect(ex.oneDayPrice).toBe(9000);
  });

  it("mapRowToExtraction tolerates JSONB that isn't an array at all", () => {
    const ex = _mappers.mapRowToExtraction({
      session_id: SESSION_UUID,
      item_name: null,
      category: null,
      pickup_area: null,
      condition: null,
      defects: null,
      components: null,
      estimated_value: null,
      one_day_price: null,
      three_days_price: null,
      seven_days_price: null,
      missing_fields: { not: "an array" },
      created_at: "2026-04-30T00:00:02.000Z",
      updated_at: "2026-04-30T00:00:02.000Z",
    });
    expect(ex.missingFields).toEqual([]);
  });
});

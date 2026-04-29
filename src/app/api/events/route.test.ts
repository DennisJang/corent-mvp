import { afterEach, describe, expect, it, vi } from "vitest";

// We mock the writer so route tests don't need a real Supabase project.
// The sanitizer runs for real — it's pure and has its own fixtures.
vi.mock("@/server/analytics/writer", () => ({
  writeEvent: vi.fn(async () => ({ ok: true as const })),
}));

import { writeEvent } from "@/server/analytics/writer";
import { POST, GET, PUT, PATCH, DELETE } from "./route";

const writeEventMock = vi.mocked(writeEvent);

const SH = "sess_abcdef0123456789";

function jsonRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: JSON.stringify(body),
    ...init,
  });
}

afterEach(() => {
  delete process.env.ENABLE_ANALYTICS_BETA;
  writeEventMock.mockClear();
  writeEventMock.mockResolvedValue({ ok: true });
});

describe("/api/events — flag gating", () => {
  it("returns 204 with no write when ENABLE_ANALYTICS_BETA is missing", async () => {
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        properties: {},
        consent_state: "granted",
        session_hash: SH,
      }),
    );
    expect(r.status).toBe(204);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("returns 204 with no write when ENABLE_ANALYTICS_BETA=false", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "false";
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        session_hash: SH,
        consent_state: "granted",
      }),
    );
    expect(r.status).toBe(204);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("returns 204 with no write for any non-'true' literal (security: only the literal 'true' enables)", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "1";
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        session_hash: SH,
        consent_state: "granted",
      }),
    );
    expect(r.status).toBe(204);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("invokes writer when ENABLE_ANALYTICS_BETA=true", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        properties: { category: "massage_gun" },
        session_hash: SH,
        consent_state: "granted",
      }),
    );
    expect(r.status).toBe(200);
    expect(writeEventMock).toHaveBeenCalledTimes(1);
    const [row] = writeEventMock.mock.calls[0];
    expect(row.event_kind).toBe("search_submitted");
    expect(row.category).toBe("massage_gun");
  });
});

describe("/api/events — input boundary", () => {
  it("rejects non-POST verbs with 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  it("rejects non-JSON content-type with 415", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const r = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );
    expect(r.status).toBe(415);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("rejects bodies larger than 4 KB with 413", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const huge = "a".repeat(5 * 1024);
    const r = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pad: huge, session_hash: SH }),
      }),
    );
    expect(r.status).toBe(413);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const r = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(r.status).toBe(400);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("rejects unknown event kinds with 400", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const r = await POST(
      jsonRequest({
        event_kind: "secret_data_export",
        session_hash: SH,
        consent_state: "granted",
      }),
    );
    expect(r.status).toBe(400);
    expect(writeEventMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the writer fails (does not leak details)", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    writeEventMock.mockResolvedValueOnce({ ok: false, reason: "no_client" });
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        session_hash: SH,
        consent_state: "granted",
      }),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).toBe("");
  });

  it("emits an analytics_denied event when consent_state=denied", async () => {
    process.env.ENABLE_ANALYTICS_BETA = "true";
    const r = await POST(
      jsonRequest({
        event_kind: "search_submitted",
        properties: { category: "massage_gun" },
        consent_state: "denied",
        session_hash: SH,
      }),
    );
    expect(r.status).toBe(200);
    const [row] = writeEventMock.mock.calls[0];
    expect(row.event_kind).toBe("analytics_denied");
    expect(row.properties).toEqual({});
  });
});

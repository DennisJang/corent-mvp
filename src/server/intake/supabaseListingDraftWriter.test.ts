// Tests for the Supabase-backed `ListingDraftWriter` (Slice A
// PR 5E).
//
// We mock the underlying repo functions so the test runs without
// any real Supabase client. The point is to assert the shape
// contract: newDraftId returns a uuid; saveListingDraft delegates
// to `saveListing` after mirroring the `ai_extracted → draft`
// transition; getListingIntent delegates to `getListingById`;
// failures throw a typed non-secret error.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/persistence/supabase/listingRepository", () => ({
  saveListing: vi.fn(async () => ({ ok: true, id: "ok" })),
  getListingById: vi.fn(async () => null),
}));

import {
  getListingById,
  saveListing,
} from "@/server/persistence/supabase/listingRepository";
import {
  ListingDraftWriteError,
  supabaseListingDraftWriter,
} from "./supabaseListingDraftWriter";

const mockSaveListing = vi.mocked(saveListing);
const mockGetListingById = vi.mocked(getListingById);

const SELLER_UUID = "11111111-2222-4333-8444-555555555555";

function makeDraft(
  overrides: Partial<import("@/domain/intents").ListingIntent> = {},
): import("@/domain/intents").ListingIntent {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    sellerId: SELLER_UUID,
    status: "ai_extracted",
    rawSellerInput: "raw",
    item: {
      name: "테라건 미니",
      category: "massage_gun",
      estimatedValue: 200000,
      condition: "lightly_used",
      components: [],
    },
    pricing: {
      oneDay: 9000,
      threeDays: 24000,
      sevenDays: 50000,
    },
    verification: {
      id: "vi_local",
      safetyCode: "A-001",
      status: "pending",
      checks: {
        frontPhoto: false,
        backPhoto: false,
        componentsPhoto: false,
        workingProof: false,
        safetyCodePhoto: false,
        privateSerialStored: false,
      },
    },
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockSaveListing.mockReset();
  mockSaveListing.mockResolvedValue({ ok: true, id: "ok" });
  mockGetListingById.mockReset();
  mockGetListingById.mockResolvedValue(null);
});

afterEach(() => {
  mockSaveListing.mockReset();
  mockGetListingById.mockReset();
});

describe("supabaseListingDraftWriter — id allocation", () => {
  it("newDraftId returns a well-formed uuid", () => {
    const id = supabaseListingDraftWriter.newDraftId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("newDraftId returns a fresh value on each call", () => {
    const a = supabaseListingDraftWriter.newDraftId();
    const b = supabaseListingDraftWriter.newDraftId();
    expect(a).not.toBe(b);
  });

  it("newDraftId never returns the local `li_*` shape", () => {
    const id = supabaseListingDraftWriter.newDraftId();
    expect(id.startsWith("li_")).toBe(false);
  });
});

describe("supabaseListingDraftWriter — saveListingDraft", () => {
  it("delegates to saveListing and mirrors ai_extracted → draft", async () => {
    await supabaseListingDraftWriter.saveListingDraft(makeDraft());
    expect(mockSaveListing).toHaveBeenCalledTimes(1);
    const passed = mockSaveListing.mock.calls[0][0];
    expect(passed.intent.status).toBe("draft");
  });

  it("preserves a non-ai_extracted status (no surprise overwrite)", async () => {
    await supabaseListingDraftWriter.saveListingDraft(
      makeDraft({ status: "draft" }),
    );
    const passed = mockSaveListing.mock.calls[0][0];
    expect(passed.intent.status).toBe("draft");
  });

  it("throws a typed ListingDraftWriteError on saveListing failure", async () => {
    mockSaveListing.mockResolvedValueOnce({
      ok: false,
      error: "validator: id: uuid shape is invalid",
    });
    await expect(
      supabaseListingDraftWriter.saveListingDraft(
        makeDraft({ id: "li_not_a_uuid" }),
      ),
    ).rejects.toBeInstanceOf(ListingDraftWriteError);
  });

  it("the thrown error message is non-secret (no env / SQL / stack frames / row payload)", async () => {
    mockSaveListing.mockResolvedValueOnce({
      ok: false,
      error: "shape rejected",
    });
    let caught: unknown = null;
    try {
      await supabaseListingDraftWriter.saveListingDraft(makeDraft());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ListingDraftWriteError);
    if (caught instanceof Error) {
      expect(caught.message).not.toMatch(/SUPABASE_/);
      expect(caught.message).not.toMatch(/SERVICE_ROLE/);
      expect(caught.message).not.toMatch(/process\.env/);
      expect(caught.message).not.toMatch(/insert into|select from/i);
      expect(caught.message).not.toMatch(/at .+\(/);
    }
  });
});

describe("supabaseListingDraftWriter — getListingIntent", () => {
  it("delegates to getListingById", async () => {
    await supabaseListingDraftWriter.getListingIntent(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    expect(mockGetListingById).toHaveBeenCalledWith(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
  });

  it("returns the row mapper output unchanged", async () => {
    const fixture = makeDraft({ status: "draft" });
    mockGetListingById.mockResolvedValueOnce(fixture);
    const got = await supabaseListingDraftWriter.getListingIntent(fixture.id);
    expect(got).toEqual(fixture);
  });
});

// Tests for the local listing-draft writer (Slice A PR 5E).
//
// Coverage:
//   - newDraftId() returns the existing `li_<16hex>` shape (the
//     same format the rest of the local domain uses; changing this
//     would break local snapshot tests).
//   - saveListingDraft delegates to listingService.saveDraft (the
//     pre-PR-5E path; preserves validate + ai_extracted → draft).
//   - getListingIntent reads through getPersistence() — the same
//     path the chat intake service called pre-PR-5E.
//
// These tests run against the in-memory persistence adapter (the
// default in a Node/SSR test environment), so no localStorage /
// network is touched.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPersistence } from "@/lib/adapters/persistence";
import {
  localListingDraftWriter,
  type ListingDraftWriter,
} from "./listingDraftWriter";
import { listingService } from "@/lib/services/listingService";

const SELLER_ID = "seller_jisu";

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("localListingDraftWriter — id allocation", () => {
  it("newDraftId returns an `li_<16hex>` shaped id (existing local format)", () => {
    const id = localListingDraftWriter.newDraftId();
    expect(id).toMatch(/^li_[0-9a-f]{16}$/);
  });

  it("newDraftId returns a fresh id on each call", () => {
    const a = localListingDraftWriter.newDraftId();
    const b = localListingDraftWriter.newDraftId();
    expect(a).not.toBe(b);
  });
});

describe("localListingDraftWriter — saveListingDraft + getListingIntent round-trip", () => {
  it("saveListingDraft persists via listingService.saveDraft (ai_extracted → draft)", async () => {
    const id = localListingDraftWriter.newDraftId();
    const initial = listingService.draftFromInput({
      sellerId: SELLER_ID,
      rawInput: "테라건 미니",
      id,
    });
    // draftFromInput returns ai_extracted; saveDraft transitions to
    // draft.
    expect(initial.status).toBe("ai_extracted");
    await localListingDraftWriter.saveListingDraft(initial);
    const reloaded = await localListingDraftWriter.getListingIntent(id);
    expect(reloaded?.status).toBe("draft");
    expect(reloaded?.id).toBe(id);
    expect(reloaded?.sellerId).toBe(SELLER_ID);
  });

  it("getListingIntent returns null for an unknown id", async () => {
    const out = await localListingDraftWriter.getListingIntent(
      "li_nonexistent_id",
    );
    expect(out).toBeNull();
  });
});

describe("localListingDraftWriter — interface conformance (compile-time)", () => {
  it("the exported writer satisfies the ListingDraftWriter type", () => {
    // Pure type-shape assertion — if the export ever drifts from
    // the interface, this assignment fails to type-check.
    const w: ListingDraftWriter = localListingDraftWriter;
    expect(typeof w.newDraftId).toBe("function");
    expect(typeof w.saveListingDraft).toBe("function");
    expect(typeof w.getListingIntent).toBe("function");
  });
});

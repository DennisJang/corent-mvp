// Regression test for the SSR-stable seed path. The `/sell` page renders
// `<SafetyCodeCard code={listing.verification.safetyCode} />` during
// SSR; the same component re-renders on hydration. If
// `listingService.draftFromInput` produces a different listing id (and
// therefore a different safety code) on the server vs. the client,
// React logs a hydration mismatch.
//
// This test asserts that passing a fixed `idSeed` (and a fixed `at`)
// produces a fully deterministic draft — listing id, verification id,
// safety code, timestamps. As long as the SellerRegistration component
// passes a fixed seed for its initial state, the page hydrates clean.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ListingIntent } from "@/domain/intents";
import { OwnershipError } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import { listingService } from "./listingService";

describe("listingService.draftFromInput — deterministic SSR seed", () => {
  it("produces an identical draft when given the same idSeed + at", () => {
    const args = {
      sellerId: "seller_test",
      rawInput: "테라건 미니고 거의 안 썼어. 3일 정도 빌려주고 싶어.",
      idSeed: "ssr_initial",
      at: "2026-04-30T00:00:00.000Z",
    } as const;
    const a = listingService.draftFromInput(args);
    const b = listingService.draftFromInput(args);
    expect(a).toEqual(b);
    // Sanity check: the same seed must produce the documented id shape.
    expect(a.id).toBe("li_ssr_initial");
    expect(a.verification.id).toBe("vi_ssr_initial");
    expect(a.verification.safetyCode).toMatch(/^[A-Z]-[0-9]{3}$/);
  });

  it("produces a fresh random listing id when no idSeed is provided", () => {
    const args = {
      sellerId: "seller_test",
      rawInput: "테라건 미니고 거의 안 썼어. 3일 정도 빌려주고 싶어.",
    } as const;
    const a = listingService.draftFromInput(args);
    const b = listingService.draftFromInput(args);
    // Without a seed, ids must differ between calls (so consecutive
    // "AI로 다시 추출" clicks produce distinct drafts).
    expect(a.id).not.toBe(b.id);
  });

  it("safety code is stable under the same seed even across reruns", () => {
    const seedA = listingService.draftFromInput({
      sellerId: "seller_test",
      rawInput: "abc",
      idSeed: "fixed",
      at: "2026-04-30T00:00:00.000Z",
    });
    const seedB = listingService.draftFromInput({
      sellerId: "seller_other",
      rawInput: "different input",
      idSeed: "fixed",
      at: "2026-04-30T01:00:00.000Z",
    });
    // The safety code is a function of the listing id (which is in
    // turn a function of the idSeed). Different sellerId / rawInput /
    // at should not perturb the safety code.
    expect(seedA.verification.safetyCode).toBe(seedB.verification.safetyCode);
  });
});

// --------------------------------------------------------------
// Phase 1.9 — actor-aware seller-owned listing draft edits.
// `updateOwnListingDraft` reloads the canonical persisted listing
// before any ownership / status check, runs `assertListingOwnedBy`
// against the canonical `sellerId`, applies only safe fields via
// `applyEdits`, and persists the validated result.
// --------------------------------------------------------------

const SELLER_ID = "seller_jisu";
const STRANGER_ID = "stranger_x";

async function makePersistedDraft(): Promise<ListingIntent> {
  const draft = listingService.draftFromInput({
    sellerId: SELLER_ID,
    rawInput: "테라건 미니. 사용감 거의 없음.",
    idSeed: "draft_under_test",
    at: "2026-04-30T00:00:00.000Z",
  });
  await listingService.saveDraft(draft);
  // saveDraft transitions ai_extracted → draft.
  return (await getPersistence().getListingIntent(draft.id))!;
}

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("listingService.updateOwnListingDraft", () => {
  it("seller can update safe fields on their own draft", async () => {
    const stored = await makePersistedDraft();
    const updated = await listingService.updateOwnListingDraft(
      stored.id,
      SELLER_ID,
      {
        itemName: "테라건 미니 2세대",
        defects: "외관 미세 흠집 1건",
        pickupArea: "서울 마포구 합정",
      },
    );
    expect(updated.id).toBe(stored.id);
    expect(updated.sellerId).toBe(SELLER_ID);
    expect(updated.item.name).toBe("테라건 미니 2세대");
    expect(updated.item.defects).toBe("외관 미세 흠집 1건");
    expect(updated.item.pickupArea).toBe("서울 마포구 합정");
    // Status is preserved from the canonical record.
    expect(updated.status).toBe(stored.status);
    const reload = await getPersistence().getListingIntent(stored.id);
    expect(reload?.item.name).toBe("테라건 미니 2세대");
  });

  it("non-owner cannot edit — throws OwnershipError, no persisted change", async () => {
    const stored = await makePersistedDraft();
    await expect(
      listingService.updateOwnListingDraft(stored.id, STRANGER_ID, {
        itemName: "should not stick",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
    const reload = await getPersistence().getListingIntent(stored.id);
    expect(reload?.item.name).toBe(stored.item.name);
  });

  it("forged sellerId on a stale object cannot bypass ownership", async () => {
    const stored = await makePersistedDraft();
    // The patch shape doesn't accept sellerId at all, but this test
    // documents that even if a forger upserts an out-of-band edit
    // with `sellerId: STRANGER_ID`, the canonical record's sellerId
    // is the authorization source. The edit method only takes
    // `(listingId, actorSellerId, patch)`.
    await expect(
      listingService.updateOwnListingDraft(stored.id, STRANGER_ID, {
        itemName: "forged",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("operating on an unknown listing id throws listing_not_found", async () => {
    await expect(
      listingService.updateOwnListingDraft("li_does_not_exist", SELLER_ID, {
        itemName: "no",
      }),
    ).rejects.toThrow(/listing_not_found/);
  });

  it("preserves canonical status; the patch shape cannot change it", async () => {
    const stored = await makePersistedDraft();
    expect(stored.status).toBe("draft");
    // The patch type does not accept `status`, but if a forger sneaks
    // it in via type coercion the implementation must still preserve
    // the canonical status.
    const forged = {
      itemName: "ok rename",
      status: "approved",
    } as unknown as Parameters<
      typeof listingService.updateOwnListingDraft
    >[2];
    const updated = await listingService.updateOwnListingDraft(
      stored.id,
      SELLER_ID,
      forged,
    );
    expect(updated.status).toBe("draft");
  });

  it("validation errors do not leave a partially-persisted draft", async () => {
    const stored = await makePersistedDraft();
    await expect(
      listingService.updateOwnListingDraft(stored.id, SELLER_ID, {
        itemName: "x".repeat(121), // 120-char cap on item name
      }),
    ).rejects.toBeInstanceOf(Error);
    const reload = await getPersistence().getListingIntent(stored.id);
    expect(reload?.item.name).toBe(stored.item.name);
  });
});

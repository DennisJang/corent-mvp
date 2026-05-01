// Chat-to-listing intake service tests. Cover the actor-aware
// session creation, the seller-message append + extraction
// roundtrip, and the safe ListingIntent draft creation gate
// (status, sellerId, public projection invariants).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OwnershipError } from "@/lib/auth/guards";
import { getPersistence } from "@/lib/adapters/persistence";
import {
  ChatIntakeInputError,
  chatListingIntakeService,
} from "@/lib/services/chatListingIntakeService";
import { publicListingService } from "@/lib/services/publicListingService";

const SELLER_ID = "seller_jisu";
const STRANGER_ID = "stranger_x";
const REPRESENTATIVE_INPUT =
  "소니 WH-1000XM5 헤드폰 빌려줄게요. 상태 좋고 강남역 근처에서 가능해요. 하루 9000원 정도면 좋겠어요.";

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("chatListingIntakeService.startSession", () => {
  it("stamps actorSellerId on the session — caller cannot supply a different sellerId", async () => {
    const session = await chatListingIntakeService.startSession(SELLER_ID);
    expect(session.sellerId).toBe(SELLER_ID);
    expect(session.status).toBe("drafting");
    expect(session.listingIntentId).toBeUndefined();
    const reload = await getPersistence().getIntakeSession(session.id);
    expect(reload?.sellerId).toBe(SELLER_ID);
  });
});

describe("chatListingIntakeService.appendSellerMessage", () => {
  it("appends seller + assistant messages and persists an extraction", async () => {
    const session = await chatListingIntakeService.startSession(SELLER_ID);
    const result = await chatListingIntakeService.appendSellerMessage(
      session.id,
      SELLER_ID,
      REPRESENTATIVE_INPUT,
    );
    expect(result.sellerMessage.role).toBe("seller");
    expect(result.sellerMessage.content).toContain("WH-1000XM5");
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.assistantMessage.content).toContain("초안 미리보기");
    expect(result.extraction.pickupArea).toBe("강남역 근처");
    expect(result.extraction.oneDayPrice).toBe(9000);

    const messages = await chatListingIntakeService.listMessages(session.id);
    expect(messages).toHaveLength(2);
    const stored = await chatListingIntakeService.getExtraction(session.id);
    expect(stored?.oneDayPrice).toBe(9000);
  });

  it("rejects an empty message instead of recording it", async () => {
    const session = await chatListingIntakeService.startSession(SELLER_ID);
    await expect(
      chatListingIntakeService.appendSellerMessage(session.id, SELLER_ID, "   "),
    ).rejects.toBeInstanceOf(ChatIntakeInputError);
    const messages = await chatListingIntakeService.listMessages(session.id);
    expect(messages).toEqual([]);
  });

  it("non-owner cannot append — throws OwnershipError", async () => {
    const session = await chatListingIntakeService.startSession(SELLER_ID);
    await expect(
      chatListingIntakeService.appendSellerMessage(
        session.id,
        STRANGER_ID,
        "테라건 미니",
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("session_not_found is raised for an unknown id", async () => {
    await expect(
      chatListingIntakeService.appendSellerMessage(
        "isn_does_not_exist",
        SELLER_ID,
        "ok",
      ),
    ).rejects.toBeInstanceOf(ChatIntakeInputError);
  });
});

describe("chatListingIntakeService.createListingDraftFromIntake", () => {
  async function seedDraftableSession(): Promise<{ sessionId: string }> {
    const session = await chatListingIntakeService.startSession(SELLER_ID);
    await chatListingIntakeService.appendSellerMessage(
      session.id,
      SELLER_ID,
      "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.",
    );
    return { sessionId: session.id };
  }

  it("creates a draft owned by the actor seller, never an approved/public listing", async () => {
    const { sessionId } = await seedDraftableSession();
    const { listing, session } =
      await chatListingIntakeService.createListingDraftFromIntake(
        sessionId,
        SELLER_ID,
      );
    expect(listing.sellerId).toBe(SELLER_ID);
    expect(listing.status).toBe("draft");
    expect(listing.status).not.toBe("approved");
    expect(session.status).toBe("draft_created");
    expect(session.listingIntentId).toBe(listing.id);
  });

  it("non-owner cannot create a draft from someone else's intake session", async () => {
    const { sessionId } = await seedDraftableSession();
    await expect(
      chatListingIntakeService.createListingDraftFromIntake(
        sessionId,
        STRANGER_ID,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    // No listing created.
    const all = await getPersistence().listListingIntents();
    expect(all).toEqual([]);
  });

  it("created draft does NOT appear in PublicListing (status is draft, not approved)", async () => {
    const { sessionId } = await seedDraftableSession();
    const { listing } =
      await chatListingIntakeService.createListingDraftFromIntake(
        sessionId,
        SELLER_ID,
      );
    const projections = await publicListingService.listPublicListings();
    const draftPublic = projections.find(
      (p) => p.source === "approved_listing_intent" && p.sourceId === listing.id,
    );
    expect(draftPublic).toBeUndefined();
    const byId = await publicListingService.getPublicListingById(
      `listing:${listing.id}`,
    );
    expect(byId).toBeNull();
  });

  it("raw intake messages are not exposed via PublicListing once approved (allowlisted projection)", async () => {
    const { sessionId } = await seedDraftableSession();
    const { listing } =
      await chatListingIntakeService.createListingDraftFromIntake(
        sessionId,
        SELLER_ID,
      );
    // Force the canonical listing to "approved" for this projection
    // test only — the chat intake service itself never publishes.
    const persistence = getPersistence();
    const persisted = await persistence.getListingIntent(listing.id);
    expect(persisted).not.toBeNull();
    await persistence.saveListingIntent({
      ...persisted!,
      status: "approved",
    });
    const projection = await publicListingService.getPublicListingById(
      `listing:${listing.id}`,
    );
    expect(projection).not.toBeNull();
    // The raw seller text contains "거의 안 썼고" / "하루 9000원" — neither
    // should appear anywhere on the projection. The projection's
    // shape doesn't even have a slot for the raw input string.
    const blob = JSON.stringify(projection ?? {});
    expect(blob).not.toContain("하루 9000원");
    expect(blob).not.toContain("거의 안 썼");
  });

  it("is idempotent — re-calling on a finalized session returns the same listing", async () => {
    const { sessionId } = await seedDraftableSession();
    const a = await chatListingIntakeService.createListingDraftFromIntake(
      sessionId,
      SELLER_ID,
    );
    const b = await chatListingIntakeService.createListingDraftFromIntake(
      sessionId,
      SELLER_ID,
    );
    expect(b.listing.id).toBe(a.listing.id);
    expect(b.session.listingIntentId).toBe(a.listing.id);
  });
});

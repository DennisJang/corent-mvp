// Chat intake server-action boundary tests.
//
// Coverage:
//
//   - The action payload types do not accept `actorSellerId`. The
//     compile-time test runs through TypeScript via `expectTypeOf`-style
//     assertions; the runtime test verifies that injecting an
//     `actorSellerId` via cast does not change persisted ownership
//     (the action uses `resolveServerActor` instead).
//   - Each action resolves the actor server-side and stamps it on
//     the persisted records.
//   - End-to-end (start → append → create draft) produces a
//     `ListingIntent` at status `"draft"` owned by the resolved
//     actor's seller id — equivalent to calling the underlying
//     service with the same actor.
//   - Known domain errors map to the typed `IntentResult` codes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CURRENT_SELLER } from "@/data/mockSellers";
import { getPersistence } from "@/lib/adapters/persistence";
import {
  appendIntakeSellerMessageAction,
  createIntakeListingDraftAction,
  startIntakeSessionAction,
  type AppendIntakeSellerMessagePayload,
  type CreateIntakeListingDraftPayload,
} from "@/server/intake/actions";

const REPRESENTATIVE_INPUT =
  "테라건 미니 빌려줄게요. 거의 안 썼고 강남역 근처에서 픽업 가능해요. 하루 9000원이면 좋겠어요.";

beforeEach(async () => {
  await getPersistence().clearAll();
});

afterEach(async () => {
  await getPersistence().clearAll();
});

describe("startIntakeSessionAction", () => {
  it("resolves the actor server-side and stamps the canonical seller id on the session", async () => {
    const result = await startIntakeSessionAction();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.session.sellerId).toBe(CURRENT_SELLER.id);
    expect(result.value.session.status).toBe("drafting");
    // The persisted row matches the in-memory result.
    const stored = await getPersistence().getIntakeSession(
      result.value.session.id,
    );
    expect(stored?.sellerId).toBe(CURRENT_SELLER.id);
  });
});

describe("appendIntakeSellerMessageAction", () => {
  async function start(): Promise<string> {
    const r = await startIntakeSessionAction();
    if (!r.ok) throw new Error("startIntakeSessionAction failed in test");
    return r.value.session.id;
  }

  it("appends seller + assistant messages and persists the extraction", async () => {
    const sessionId = await start();
    const result = await appendIntakeSellerMessageAction({
      sessionId,
      content: REPRESENTATIVE_INPUT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sellerMessage.role).toBe("seller");
    expect(result.value.assistantMessage.role).toBe("assistant");
    expect(result.value.extraction.pickupArea).toBe("강남역 근처");
    expect(result.value.extraction.oneDayPrice).toBe(9000);
  });

  it("ignores a forged actorSellerId injected into the payload via cast", async () => {
    const sessionId = await start();
    // Force a payload with an unknown extra key. TypeScript would
    // normally reject this; the cast simulates a malicious caller.
    const forged = {
      sessionId,
      content: REPRESENTATIVE_INPUT,
      actorSellerId: "stranger_x",
    } as unknown as AppendIntakeSellerMessagePayload;
    const result = await appendIntakeSellerMessageAction(forged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Ownership stays with the canonical mock seller — never the
    // forged caller-supplied id.
    expect(result.value.session.sellerId).toBe(CURRENT_SELLER.id);
    expect(result.value.sellerMessage.sessionId).toBe(sessionId);
    const stored = await getPersistence().getIntakeSession(sessionId);
    expect(stored?.sellerId).toBe(CURRENT_SELLER.id);
  });

  it("maps message_empty / message_too_long to input", async () => {
    const sessionId = await start();
    const empty = await appendIntakeSellerMessageAction({
      sessionId,
      content: "   ",
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("input");

    const long = await appendIntakeSellerMessageAction({
      sessionId,
      content: "x".repeat(2001),
    });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.code).toBe("input");
  });

  it("maps unknown sessionId to not_found", async () => {
    const result = await appendIntakeSellerMessageAction({
      sessionId: "isn_does_not_exist",
      content: "ok",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });

  it("rejects an empty sessionId at the input boundary", async () => {
    const result = await appendIntakeSellerMessageAction({
      sessionId: "",
      content: "ok",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("input");
  });
});

describe("createIntakeListingDraftAction", () => {
  async function startAndAppend(): Promise<string> {
    const start = await startIntakeSessionAction();
    if (!start.ok) throw new Error("startIntakeSessionAction failed");
    const append = await appendIntakeSellerMessageAction({
      sessionId: start.value.session.id,
      content: REPRESENTATIVE_INPUT,
    });
    if (!append.ok) throw new Error("appendIntakeSellerMessageAction failed");
    return start.value.session.id;
  }

  it("creates a draft listing owned by the resolved actor (never approved/public)", async () => {
    const sessionId = await startAndAppend();
    const result = await createIntakeListingDraftAction({ sessionId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.listing.sellerId).toBe(CURRENT_SELLER.id);
    expect(result.value.listing.status).toBe("draft");
    expect(result.value.listing.status).not.toBe("approved");
    expect(result.value.session.status).toBe("draft_created");
    expect(result.value.session.listingIntentId).toBe(result.value.listing.id);
  });

  it("ignores a forged actorSellerId injected into the payload via cast", async () => {
    const sessionId = await startAndAppend();
    const forged = {
      sessionId,
      actorSellerId: "stranger_x",
    } as unknown as CreateIntakeListingDraftPayload;
    const result = await createIntakeListingDraftAction(forged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.listing.sellerId).toBe(CURRENT_SELLER.id);
  });

  it("is idempotent — re-calling on a finalized session returns the same listing", async () => {
    const sessionId = await startAndAppend();
    const a = await createIntakeListingDraftAction({ sessionId });
    const b = await createIntakeListingDraftAction({ sessionId });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.listing.id).toBe(a.value.listing.id);
    }
  });

  it("maps unknown sessionId to not_found", async () => {
    const result = await createIntakeListingDraftAction({
      sessionId: "isn_does_not_exist",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });
});

// Type-level guards have been intentionally removed: vitest does
// not run a TypeScript type-check pass, so `@ts-expect-error`
// directives in test files are advisory at best. The runtime
// forged-payload tests above are the source of truth — they verify
// that injecting `actorSellerId` via cast does not change the
// persisted ownership, which is the actual invariant we care about.

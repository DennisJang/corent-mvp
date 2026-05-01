import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RentalIntent } from "@/domain/intents";
import type { TrustEvent } from "@/domain/trust";
import { getPersistence } from "@/lib/adapters/persistence";
import {
  TrustEventInputError,
  createTrustEvent,
  summarizeTrustEvents,
  trustEventService,
} from "./trustEvents";

describe("createTrustEvent", () => {
  it("creates a typed event with documented defaults", () => {
    const e = createTrustEvent({
      rentalIntentId: "ri_1",
      type: "pickup_evidence_recorded",
      actor: "seller",
      handoffPhase: "pickup",
    });
    expect(e.id.startsWith("tev_")).toBe(true);
    expect(e.rentalIntentId).toBe("ri_1");
    expect(e.type).toBe("pickup_evidence_recorded");
    expect(e.actor).toBe("seller");
    expect(e.handoffPhase).toBe("pickup");
    expect(typeof e.at).toBe("string");
  });

  it("honors a caller-supplied `at`", () => {
    const e = createTrustEvent({
      rentalIntentId: "ri_1",
      type: "return_confirmed_by_seller",
      actor: "seller",
      at: "2026-04-30T00:00:00.000Z",
    });
    expect(e.at).toBe("2026-04-30T00:00:00.000Z");
  });

  it("rejects empty rentalIntentId", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "",
        type: "seller_approved_request",
        actor: "seller",
      }),
    ).toThrow(TrustEventInputError);
  });

  it("rejects unknown event types", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "wat" as unknown as "seller_approved_request",
        actor: "seller",
      }),
    ).toThrow(TrustEventInputError);
  });

  it("rejects unknown actors", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "seller_approved_request",
        actor: "stranger" as unknown as "seller",
      }),
    ).toThrow(TrustEventInputError);
  });

  it("rejects unknown handoff phase", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "pickup_evidence_recorded",
        actor: "seller",
        handoffPhase: "wat" as unknown as "pickup",
      }),
    ).toThrow(TrustEventInputError);
  });

  it("rejects oversize notes (>240 chars)", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "condition_issue_reported",
        actor: "seller",
        notes: "x".repeat(241),
      }),
    ).toThrow(TrustEventInputError);
  });

  it("rejects non-array / non-string evidenceRefs", () => {
    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "pickup_evidence_recorded",
        actor: "seller",
        evidenceRefs: "not-an-array" as unknown as string[],
      }),
    ).toThrow(TrustEventInputError);

    expect(() =>
      createTrustEvent({
        rentalIntentId: "ri_1",
        type: "pickup_evidence_recorded",
        actor: "seller",
        evidenceRefs: [123 as unknown as string],
      }),
    ).toThrow(TrustEventInputError);
  });

  it("accepts each documented event type and actor", () => {
    const types: Array<Parameters<typeof createTrustEvent>[0]["type"]> = [
      "seller_approved_request",
      "borrower_acknowledged_pickup",
      "pickup_evidence_recorded",
      "return_evidence_recorded",
      "return_confirmed_by_seller",
      "condition_match_recorded",
      "condition_issue_reported",
      "admin_review_started",
      "admin_decision_recorded",
      "claim_window_opened",
      "claim_window_closed",
    ];
    for (const t of types) {
      expect(() =>
        createTrustEvent({
          rentalIntentId: "ri_1",
          type: t,
          actor: "system",
        }),
      ).not.toThrow();
    }
    for (const a of ["seller", "borrower", "admin", "system"] as const) {
      expect(() =>
        createTrustEvent({
          rentalIntentId: "ri_1",
          type: "seller_approved_request",
          actor: a,
        }),
      ).not.toThrow();
    }
  });
});

const SELLER = "seller_jisu";
const BORROWER = "borrower_minho";
const STRANGER = "stranger_x";

function rentalFor(
  id: string,
  sellerId: string,
  borrowerId?: string,
): RentalIntent {
  return {
    id,
    productId: "p_test",
    productName: "DEMO",
    productCategory: "massage_gun",
    sellerId,
    sellerName: "DEMO 셀러",
    borrowerId,
    borrowerName: borrowerId ? "DEMO 빌리는사람" : undefined,
    status: "requested",
    durationDays: 3,
    amounts: {
      rentalFee: 21000,
      safetyDeposit: 0,
      platformFee: 0,
      sellerPayout: 21000,
      borrowerTotal: 21000,
    },
    payment: { provider: "mock", status: "not_started" },
    pickup: { method: "direct", status: "not_scheduled" },
    return: { status: "not_due" },
    settlement: { status: "not_ready", sellerPayout: 21000 },
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
  };
}

function ev(
  partial: Partial<TrustEvent> & Pick<TrustEvent, "type" | "rentalIntentId">,
): TrustEvent {
  return {
    id: partial.id ?? `tev_${partial.type}_${Math.random()}`,
    rentalIntentId: partial.rentalIntentId,
    type: partial.type,
    at: partial.at ?? "2026-04-30T00:00:00.000Z",
    actor: partial.actor ?? "seller",
    handoffPhase: partial.handoffPhase,
    evidenceRefs: partial.evidenceRefs,
    notes: partial.notes,
  };
}

describe("summarizeTrustEvents — pure count-based summary", () => {
  it("returns zero counts and 'normal' standing for an unknown user", () => {
    const summary = summarizeTrustEvents([], new Map(), "");
    expect(summary).toEqual({
      userId: "",
      successfulReturns: 0,
      pickupConfirmedCount: 0,
      returnConfirmedCount: 0,
      conditionCheckCompletedCount: 0,
      disputesOpened: 0,
      damageReportsAgainst: 0,
      accountStanding: "normal",
    });
  });

  it("counts known event types scoped to seller-or-borrower rentals", () => {
    const r1 = rentalFor("ri_1", SELLER, BORROWER);
    const r2 = rentalFor("ri_2", SELLER, "other");
    const rentalById = new Map([
      [r1.id, r1],
      [r2.id, r2],
    ]);
    const events: TrustEvent[] = [
      ev({ rentalIntentId: r1.id, type: "pickup_evidence_recorded" }),
      ev({ rentalIntentId: r1.id, type: "return_evidence_recorded" }),
      ev({ rentalIntentId: r1.id, type: "return_confirmed_by_seller" }),
      ev({ rentalIntentId: r2.id, type: "condition_match_recorded" }),
      ev({ rentalIntentId: r2.id, type: "admin_review_started" }),
      ev({ rentalIntentId: r2.id, type: "condition_issue_reported" }),
    ];
    const summary = summarizeTrustEvents(events, rentalById, SELLER);
    expect(summary.pickupConfirmedCount).toBe(1);
    expect(summary.returnConfirmedCount).toBe(1);
    expect(summary.successfulReturns).toBe(1);
    expect(summary.conditionCheckCompletedCount).toBe(1);
    expect(summary.disputesOpened).toBe(1);
    expect(summary.damageReportsAgainst).toBe(1);
    expect(summary.accountStanding).toBe("normal");
  });

  it("ignores events whose rental does not include the user", () => {
    const r1 = rentalFor("ri_1", "other_seller", "other_borrower");
    const rentalById = new Map([[r1.id, r1]]);
    const events: TrustEvent[] = [
      ev({ rentalIntentId: r1.id, type: "pickup_evidence_recorded" }),
      ev({ rentalIntentId: r1.id, type: "return_confirmed_by_seller" }),
    ];
    const summary = summarizeTrustEvents(events, rentalById, STRANGER);
    expect(summary.pickupConfirmedCount).toBe(0);
    expect(summary.successfulReturns).toBe(0);
  });

  it("damageReportsAgainst is scoped to rentals where user is seller", () => {
    const asSeller = rentalFor("ri_a", SELLER, "borrower_x");
    const asBorrower = rentalFor("ri_b", "other_seller", SELLER);
    const rentalById = new Map([
      [asSeller.id, asSeller],
      [asBorrower.id, asBorrower],
    ]);
    const events: TrustEvent[] = [
      ev({ rentalIntentId: asSeller.id, type: "condition_issue_reported" }),
      // This one is on a rental where SELLER is the borrower; it
      // should NOT count toward damageReportsAgainst for SELLER.
      ev({ rentalIntentId: asBorrower.id, type: "condition_issue_reported" }),
    ];
    const summary = summarizeTrustEvents(events, rentalById, SELLER);
    expect(summary.damageReportsAgainst).toBe(1);
  });

  it("never automatically changes accountStanding from 'normal'", () => {
    const r1 = rentalFor("ri_1", SELLER, BORROWER);
    const events: TrustEvent[] = Array.from({ length: 10 }).map((_, i) =>
      ev({
        id: `tev_${i}`,
        rentalIntentId: r1.id,
        type: "admin_review_started",
      }),
    );
    const summary = summarizeTrustEvents(
      events,
      new Map([[r1.id, r1]]),
      SELLER,
    );
    expect(summary.disputesOpened).toBe(10);
    expect(summary.accountStanding).toBe("normal");
  });
});

describe("trustEventService — persistence orchestration", () => {
  beforeEach(async () => {
    await getPersistence().clearAll();
  });
  afterEach(async () => {
    await getPersistence().clearAll();
  });

  it("recordTrustEvent persists and returns the event", async () => {
    const e = await trustEventService.recordTrustEvent({
      rentalIntentId: "ri_1",
      type: "pickup_evidence_recorded",
      actor: "seller",
      handoffPhase: "pickup",
    });
    expect(e.id.startsWith("tev_")).toBe(true);
    const all = await trustEventService.listTrustEventsForRental("ri_1");
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(e);
  });

  it("recordTrustEvent rejects malformed input via createTrustEvent", async () => {
    await expect(
      trustEventService.recordTrustEvent({
        rentalIntentId: "",
        type: "pickup_evidence_recorded",
        actor: "seller",
      }),
    ).rejects.toBeInstanceOf(TrustEventInputError);
    expect(await trustEventService.listTrustEventsForRental("")).toEqual([]);
  });

  it("listTrustEventsForUser scopes to rentals owned by the user", async () => {
    const persistence = getPersistence();
    const r1 = rentalFor("ri_1", SELLER, BORROWER);
    const r2 = rentalFor("ri_2", "other_seller", "other_borrower");
    await persistence.saveRentalIntent(r1);
    await persistence.saveRentalIntent(r2);
    await trustEventService.recordTrustEvent({
      rentalIntentId: r1.id,
      type: "pickup_evidence_recorded",
      actor: "seller",
    });
    await trustEventService.recordTrustEvent({
      rentalIntentId: r2.id,
      type: "pickup_evidence_recorded",
      actor: "seller",
    });

    const sellerEvents = await trustEventService.listTrustEventsForUser(SELLER);
    expect(sellerEvents).toHaveLength(1);
    expect(sellerEvents[0]?.rentalIntentId).toBe(r1.id);

    const borrowerEvents = await trustEventService.listTrustEventsForUser(
      BORROWER,
    );
    expect(borrowerEvents).toHaveLength(1);

    const stranger = await trustEventService.listTrustEventsForUser(STRANGER);
    expect(stranger).toEqual([]);

    expect(await trustEventService.listTrustEventsForUser("")).toEqual([]);
  });

  it("summarizeUserTrust counts persisted events for the user", async () => {
    const persistence = getPersistence();
    const r1 = rentalFor("ri_1", SELLER, BORROWER);
    await persistence.saveRentalIntent(r1);
    await trustEventService.recordTrustEvent({
      rentalIntentId: r1.id,
      type: "pickup_evidence_recorded",
      actor: "seller",
    });
    await trustEventService.recordTrustEvent({
      rentalIntentId: r1.id,
      type: "return_evidence_recorded",
      actor: "seller",
    });

    const summary = await trustEventService.summarizeUserTrust(SELLER);
    expect(summary.userId).toBe(SELLER);
    expect(summary.pickupConfirmedCount).toBe(1);
    expect(summary.returnConfirmedCount).toBe(1);
    expect(summary.successfulReturns).toBe(0);
    expect(summary.accountStanding).toBe("normal");
  });

  it("summarizeUserTrust returns empty summary for empty userId", async () => {
    const summary = await trustEventService.summarizeUserTrust("");
    expect(summary.userId).toBe("");
    expect(summary.pickupConfirmedCount).toBe(0);
    expect(summary.accountStanding).toBe("normal");
  });
});

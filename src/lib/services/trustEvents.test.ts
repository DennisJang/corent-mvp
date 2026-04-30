import { describe, expect, it } from "vitest";
import {
  TrustEventInputError,
  createTrustEvent,
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

// Tests for the handoff service. These cover three concerns:
//
//   1. Default checklist shape is stable. Surfaces depend on the keys
//      and order in `HANDOFF_CHECKLIST_KEYS`; a regression test makes
//      drift loud.
//   2. Actor verification fires BEFORE the new record is built.
//      OwnershipError, HandoffInputError, and the borrower-identity
//      gate all fail closed without producing a partially-mutated
//      record.
//   3. Bounded text/url/checklist-key validation rejects the obvious
//      drift (oversize note, oversize url, non-http url, unknown
//      checklist key, non-boolean checklist value).

import { describe, expect, it } from "vitest";
import type { RentalIntent } from "@/domain/intents";
import {
  EMPTY_HANDOFF_CHECKS,
  HANDOFF_CHECKLIST_KEYS,
  type HandoffRecord,
} from "@/domain/trust";
import { OwnershipError } from "@/lib/auth/guards";
import {
  HandoffInputError,
  createHandoffRecord,
  handoffService,
} from "./handoffService";

const SELLER_ID = "seller_jisu";
const BORROWER_ID = "borrower_minho";
const STRANGER_ID = "stranger_x";

const intent: Pick<RentalIntent, "id" | "sellerId" | "borrowerId"> = {
  id: "ri_1",
  sellerId: SELLER_ID,
  borrowerId: BORROWER_ID,
};

const intentNoBorrower: Pick<RentalIntent, "id" | "sellerId" | "borrowerId"> = {
  id: "ri_2",
  sellerId: SELLER_ID,
  borrowerId: undefined,
};

function fresh(phase: "pickup" | "return" = "pickup"): HandoffRecord {
  return createHandoffRecord("ri_1", phase);
}

describe("HANDOFF_CHECKLIST_KEYS + EMPTY_HANDOFF_CHECKS — stable shape", () => {
  it("documents exactly five checklist keys in stable order", () => {
    expect([...HANDOFF_CHECKLIST_KEYS]).toEqual([
      "mainUnit",
      "components",
      "working",
      "appearance",
      "preexisting",
    ]);
  });
  it("EMPTY_HANDOFF_CHECKS has every key set to false", () => {
    for (const k of HANDOFF_CHECKLIST_KEYS) {
      expect(EMPTY_HANDOFF_CHECKS[k]).toBe(false);
    }
  });
});

describe("createHandoffRecord", () => {
  it("creates a record with all checks false and no confirmations", () => {
    const r = createHandoffRecord("ri_1", "pickup");
    expect(r.rentalIntentId).toBe("ri_1");
    expect(r.phase).toBe("pickup");
    expect(r.confirmedBySeller).toBe(false);
    expect(r.confirmedByBorrower).toBe(false);
    expect(r.checks).toEqual(EMPTY_HANDOFF_CHECKS);
    expect(r.id.startsWith("ho_")).toBe(true);
  });
  it("rejects empty rentalIntentId", () => {
    expect(() => createHandoffRecord("", "pickup")).toThrow(HandoffInputError);
  });
  it("rejects an unknown phase", () => {
    expect(() =>
      createHandoffRecord("ri_1", "wat" as unknown as "pickup"),
    ).toThrow(HandoffInputError);
  });
});

describe("confirmAsSeller — actor verification + state update", () => {
  it("seller can confirm own pickup check and flips confirmedBySeller", () => {
    const r = fresh();
    const next = handoffService.confirmAsSeller(intent, r, SELLER_ID, {
      checks: { mainUnit: true, components: true },
    });
    expect(next.confirmedBySeller).toBe(true);
    expect(next.checks.mainUnit).toBe(true);
    expect(next.checks.components).toBe(true);
    expect(next.checks.working).toBe(false);
  });

  it("non-seller (borrower) cannot confirm — throws OwnershipError", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, BORROWER_ID),
    ).toThrow(OwnershipError);
  });

  it("non-seller (stranger) cannot confirm — throws OwnershipError", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, STRANGER_ID),
    ).toThrow(OwnershipError);
  });

  it("empty actorUserId is rejected", () => {
    const r = fresh();
    expect(() => handoffService.confirmAsSeller(intent, r, "")).toThrow(
      OwnershipError,
    );
  });

  it("rejects a record that does not belong to this rental", () => {
    const r = createHandoffRecord("ri_other", "pickup");
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID),
    ).toThrow(HandoffInputError);
  });

  it("confirm=false leaves confirmedBySeller untouched but applies patch", () => {
    const r = fresh();
    const next = handoffService.confirmAsSeller(
      intent,
      r,
      SELLER_ID,
      { checks: { working: true } },
      false,
    );
    expect(next.confirmedBySeller).toBe(false);
    expect(next.checks.working).toBe(true);
  });
});

describe("confirmAsBorrower — actor verification + borrower-identity gate", () => {
  it("borrower can confirm own check when borrowerId is recorded", () => {
    const r = fresh();
    const next = handoffService.confirmAsBorrower(intent, r, BORROWER_ID, {
      checks: { appearance: true },
    });
    expect(next.confirmedByBorrower).toBe(true);
    expect(next.checks.appearance).toBe(true);
  });

  it("rejects when rental has no borrowerId yet (real auth gap)", () => {
    const r = createHandoffRecord(intentNoBorrower.id, "pickup");
    expect(() =>
      handoffService.confirmAsBorrower(intentNoBorrower, r, BORROWER_ID),
    ).toThrow(HandoffInputError);
  });

  it("non-borrower cannot confirm — throws OwnershipError", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsBorrower(intent, r, SELLER_ID),
    ).toThrow(OwnershipError);
    expect(() =>
      handoffService.confirmAsBorrower(intent, r, STRANGER_ID),
    ).toThrow(OwnershipError);
  });

  it("empty actorUserId is rejected", () => {
    const r = fresh();
    expect(() => handoffService.confirmAsBorrower(intent, r, "")).toThrow(
      OwnershipError,
    );
  });
});

describe("validatePatch — bounded text + checklist", () => {
  it("rejects oversize note (>240 chars)", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        note: "x".repeat(241),
      }),
    ).toThrow(HandoffInputError);
  });

  it("accepts a bounded note", () => {
    const r = fresh();
    const next = handoffService.confirmAsSeller(intent, r, SELLER_ID, {
      note: "픽업 시 외관 양호. 사이드 패널 미세 흠집 1건 기록.",
    });
    expect(next.note).toContain("픽업");
  });

  it("clears note when null is passed", () => {
    const r: HandoffRecord = { ...fresh(), note: "old note" };
    const next = handoffService.confirmAsSeller(intent, r, SELLER_ID, {
      note: null,
    });
    expect(next.note).toBeUndefined();
  });

  it("rejects oversize manualEvidenceUrl (>500 chars)", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        manualEvidenceUrl: "https://example.com/" + "x".repeat(500),
      }),
    ).toThrow(HandoffInputError);
  });

  it("rejects manualEvidenceUrl without http(s) scheme", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        manualEvidenceUrl: "javascript:alert(1)",
      }),
    ).toThrow(HandoffInputError);
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        manualEvidenceUrl: "file:///etc/passwd",
      }),
    ).toThrow(HandoffInputError);
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        manualEvidenceUrl: "example.com",
      }),
    ).toThrow(HandoffInputError);
  });

  it("accepts http and https URLs within bound", () => {
    const r = fresh();
    const a = handoffService.confirmAsSeller(intent, r, SELLER_ID, {
      manualEvidenceUrl: "https://example.com/evidence/123",
    });
    expect(a.manualEvidenceUrl).toBe("https://example.com/evidence/123");
    const b = handoffService.confirmAsSeller(intent, r, SELLER_ID, {
      manualEvidenceUrl: "http://192.168.0.1/p",
    });
    expect(b.manualEvidenceUrl).toBe("http://192.168.0.1/p");
  });

  it("rejects unknown checklist keys", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        checks: { not_a_real_key: true } as unknown as Partial<
          HandoffRecord["checks"]
        >,
      }),
    ).toThrow(HandoffInputError);
  });

  it("rejects non-boolean checklist values", () => {
    const r = fresh();
    expect(() =>
      handoffService.confirmAsSeller(intent, r, SELLER_ID, {
        checks: { mainUnit: "yes" } as unknown as Partial<
          HandoffRecord["checks"]
        >,
      }),
    ).toThrow(HandoffInputError);
  });
});

describe("isComplete + completedCount", () => {
  it("returns 0 for a fresh record and isComplete=false", () => {
    const r = fresh();
    expect(handoffService.completedCount(r)).toBe(0);
    expect(handoffService.isComplete(r)).toBe(false);
  });

  it("counts checks as they flip true", () => {
    const r: HandoffRecord = {
      ...fresh(),
      checks: {
        mainUnit: true,
        components: true,
        working: true,
        appearance: false,
        preexisting: false,
      },
    };
    expect(handoffService.completedCount(r)).toBe(3);
    expect(handoffService.isComplete(r)).toBe(false);
  });

  it("isComplete only when all 5 checks AND both confirmations are true", () => {
    const allTrue: HandoffRecord = {
      ...fresh(),
      checks: {
        mainUnit: true,
        components: true,
        working: true,
        appearance: true,
        preexisting: true,
      },
      confirmedBySeller: true,
      confirmedByBorrower: false,
    };
    expect(handoffService.completedCount(allTrue)).toBe(5);
    expect(handoffService.isComplete(allTrue)).toBe(false);
    const both = { ...allTrue, confirmedByBorrower: true };
    expect(handoffService.isComplete(both)).toBe(true);
  });
});

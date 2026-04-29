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

import { describe, expect, it } from "vitest";
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

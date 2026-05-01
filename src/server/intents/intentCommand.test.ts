// Tests for the tiny intent command runner. Coverage focuses on
// the actor-resolution branches that the chat intake action tests
// can't hit cleanly (the action tests use the real mock seller
// session). Vitest's `vi.mock` on the resolver module lets us
// substitute resolver outcomes deterministically without a heavy
// fixture or framework.

import { afterEach, describe, expect, it, vi } from "vitest";

import { runIntentCommand } from "@/server/intents/intentCommand";
import { intentOk } from "@/server/intents/intentResult";

vi.mock("@/server/actors/resolveServerActor", () => ({
  resolveServerActor: vi.fn(),
}));

import { resolveServerActor } from "@/server/actors/resolveServerActor";

const mockResolver = vi.mocked(resolveServerActor);

afterEach(() => {
  mockResolver.mockReset();
});

describe("runIntentCommand", () => {
  it("returns unauthenticated when the resolver returns null", async () => {
    mockResolver.mockResolvedValueOnce(null);
    const result = await runIntentCommand(
      async ({ actor }) => intentOk({ ranAs: actor.kind }),
      undefined,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unauthenticated");
  });

  it("returns ownership when the resolved actor kind does not match the expected kind", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "renter",
      borrowerId: "borrower_x",
      displayName: "tester",
      source: "mock",
    });
    const result = await runIntentCommand(
      async ({ actor }) => intentOk({ ranAs: actor.kind }),
      undefined,
      { expectedActorKind: "seller" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ownership");
  });

  it("admin actor is rejected when seller kind is required", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "admin",
      adminId: "admin_x",
      displayName: "founder",
      source: "mock",
    });
    const result = await runIntentCommand(
      async ({ actor }) => intentOk({ ranAs: actor.kind }),
      undefined,
      { expectedActorKind: "seller" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ownership");
  });

  it("passes the resolved actor to the handler when the expected kind matches", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: "seller_jisu",
      displayName: "지수",
      source: "mock",
    });
    const result = await runIntentCommand<undefined, { sellerId: string }>(
      async ({ actor }) => {
        if (actor.kind !== "seller") {
          throw new Error("unexpected actor kind in handler");
        }
        return intentOk({ sellerId: actor.sellerId });
      },
      undefined,
      { expectedActorKind: "seller" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sellerId).toBe("seller_jisu");
  });

  it("maps unexpected handler throws to a generic internal error (no stack leak)", async () => {
    mockResolver.mockResolvedValueOnce({
      kind: "seller",
      sellerId: "seller_jisu",
      displayName: "지수",
      source: "mock",
    });
    const result = await runIntentCommand(async () => {
      throw new Error("boom — internal stack should not leak");
    }, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("internal");
      expect(result.message).not.toContain("boom");
    }
  });
});

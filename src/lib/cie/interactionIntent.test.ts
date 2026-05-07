// Tests for the InteractionIntent primitive v1.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INTERACTION_INTENT_EVENT_TYPES,
  INTERACTION_INTENT_KINDS,
  INTERACTION_INTENT_PROVENANCES,
  INTERACTION_INTENT_RISK_TIERS,
  INTERACTION_INTENT_SOURCES,
  INTERACTION_INTENT_STATUSES,
  INTERACTION_INTENT_SUMMARY_MAX,
  INTERACTION_INTENT_TITLE_MAX,
  appendInteractionIntentEvent,
  assertNoBannedClaimsInInteractionIntent,
  createInteractionIntent,
  deriveInteractionIntentMetrics,
  isTerminalInteractionIntentStatus,
  transitionInteractionIntent,
  validateInteractionIntent,
  type InteractionIntent,
  type InteractionIntentEventInput,
  type InteractionIntentRiskTier,
  type InteractionIntentStatus,
} from "./interactionIntent";

// ---------------------------------------------------------------
// Source-level invariants
// ---------------------------------------------------------------

const FILE = join(
  process.cwd(),
  "src",
  "lib",
  "cie",
  "interactionIntent.ts",
);
const SRC = readFileSync(FILE, "utf-8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const RUNTIME_SRC = stripComments(SRC);
const IMPORT_BLOB = (
  RUNTIME_SRC.match(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g) ?? []
).join("\n");

const CLOSED_ALPHA_BANLIST: ReadonlyArray<string> = [
  "보증금",
  "보증",
  "보험",
  "보장",
  "결제 완료",
  "결제 진행",
  "결제 처리",
  "보증금 청구",
  "대여 확정",
  "환불",
  "정산 완료",
  "guaranteed",
  "insured",
  "insurance",
  "verified seller",
];

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const FIXED_NOW = "2026-05-07T00:00:00.000Z";
const LATER_NOW = "2026-05-07T00:01:00.000Z";

function buildIntent(
  overrides: Partial<{
    riskTier: InteractionIntentRiskTier;
    title: string;
    summary: string;
  }> = {},
): InteractionIntent {
  const r = createInteractionIntent({
    kind: "try_before_buy",
    riskTier: overrides.riskTier ?? "T1",
    source: "search",
    title: overrides.title ?? "intent for tests",
    summary: overrides.summary ?? "summary for tests",
    relatedBlockTypes: ["intent_summary", "try_criteria"],
    relatedActionIds: ["search_listings", "create_wanted_request"],
    now: FIXED_NOW,
    id: "intent_fixture_001",
  });
  if (!r.ok) {
    throw new Error(`fixture build failed: ${JSON.stringify(r.errors)}`);
  }
  return r.intent;
}

function walkTo(
  startTier: InteractionIntentRiskTier,
  path: ReadonlyArray<InteractionIntentStatus>,
): InteractionIntent {
  let intent = buildIntent({ riskTier: startTier });
  let now = Date.parse(FIXED_NOW);
  for (const next of path) {
    now += 1000;
    const at = new Date(now).toISOString();
    const r = transitionInteractionIntent(intent, next, { now: at });
    if (!r.ok) {
      throw new Error(
        `unexpected transition rejection ${intent.status} → ${next}: ${r.message}`,
      );
    }
    intent = r.intent;
  }
  return intent;
}

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

describe("InteractionIntent — closed vocabularies", () => {
  it("INTERACTION_INTENT_KINDS is the 11 expected values", () => {
    expect([...INTERACTION_INTENT_KINDS].sort()).toEqual(
      [
        "apply",
        "book",
        "buy",
        "choose",
        "compare",
        "contact",
        "learn",
        "request",
        "troubleshoot",
        "try_before_buy",
        "unknown",
      ].sort(),
    );
  });

  it("INTERACTION_INTENT_STATUSES is the 11 expected lifecycle values", () => {
    expect([...INTERACTION_INTENT_STATUSES].sort()).toEqual(
      [
        "abandoned",
        "action_proposed",
        "blocked",
        "clarifying",
        "confirmed",
        "created",
        "executed",
        "handoff",
        "planned",
        "resolved",
        "shown",
      ].sort(),
    );
  });

  it("INTERACTION_INTENT_RISK_TIERS aligns with ISS-0 (T0–T5)", () => {
    expect([...INTERACTION_INTENT_RISK_TIERS]).toEqual([
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
    ]);
  });

  it("INTERACTION_INTENT_SOURCES is the 8 expected values", () => {
    expect([...INTERACTION_INTENT_SOURCES].sort()).toEqual(
      [
        "admin_cockpit",
        "api",
        "dashboard",
        "embedded_site",
        "home",
        "listing_detail",
        "search",
        "test",
      ].sort(),
    );
  });

  it("INTERACTION_INTENT_PROVENANCES is exactly the three values", () => {
    expect([...INTERACTION_INTENT_PROVENANCES].sort()).toEqual(
      ["deterministic", "human_reviewed", "llm_candidate"].sort(),
    );
  });

  it("INTERACTION_INTENT_EVENT_TYPES is the 11 expected lifecycle event names", () => {
    expect([...INTERACTION_INTENT_EVENT_TYPES].sort()).toEqual(
      [
        "abandoned",
        "action_executed",
        "action_proposed",
        "block_shown",
        "blocked",
        "clarification_requested",
        "created",
        "human_handoff",
        "plan_attached",
        "resolved",
        "user_confirmed",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------
// createInteractionIntent
// ---------------------------------------------------------------

describe("createInteractionIntent — happy path", () => {
  it("returns a deterministic intent with status 'created' and a 'created' event", () => {
    const r = createInteractionIntent({
      kind: "try_before_buy",
      riskTier: "T1",
      source: "search",
      title: "  Dyson Airwrap, try before buy  ",
      summary: "  Three-day trial preview  ",
      now: FIXED_NOW,
      id: "intent_create_001",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.status).toBe("created");
    expect(r.intent.provenance).toBe("deterministic");
    // Title and summary are trimmed.
    expect(r.intent.title).toBe("Dyson Airwrap, try before buy");
    expect(r.intent.summary).toBe("Three-day trial preview");
    expect(r.intent.createdAt).toBe(FIXED_NOW);
    expect(r.intent.updatedAt).toBe(FIXED_NOW);
    expect(r.intent.events.length).toBe(1);
    expect(r.intent.events[0]?.type).toBe("created");
    expect(r.intent.events[0]?.statusAfter).toBe("created");
    expect(r.intent.events[0]?.at).toBe(FIXED_NOW);
  });

  it("applies length caps to title and summary with an ellipsis tail", () => {
    const longTitle = "A".repeat(INTERACTION_INTENT_TITLE_MAX + 50);
    const longSummary = "B".repeat(INTERACTION_INTENT_SUMMARY_MAX + 100);
    const r = createInteractionIntent({
      kind: "learn",
      riskTier: "T0",
      source: "home",
      title: longTitle,
      summary: longSummary,
      now: FIXED_NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.title.length).toBe(INTERACTION_INTENT_TITLE_MAX);
    expect(r.intent.title.endsWith("…")).toBe(true);
    expect(r.intent.summary.length).toBe(INTERACTION_INTENT_SUMMARY_MAX);
    expect(r.intent.summary.endsWith("…")).toBe(true);
  });

  it("dedupes and sorts relatedBlockTypes / relatedActionIds, drops out-of-vocab", () => {
    const r = createInteractionIntent({
      kind: "find_listing" as never, // force a vocab miss below to confirm structural validation
      riskTier: "T1",
      source: "search",
      title: "x",
      summary: "x",
      now: FIXED_NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /kind 'find_listing' is not allowed/.test(e))).toBe(true);
  });

  it("dedupes and sorts relatedBlockTypes / relatedActionIds (happy path), drops out-of-vocab", () => {
    const r = createInteractionIntent({
      kind: "try_before_buy",
      riskTier: "T1",
      source: "search",
      title: "x",
      summary: "x",
      relatedBlockTypes: [
        "try_criteria",
        "intent_summary",
        "try_criteria",
        "evil_block" as never,
      ],
      relatedActionIds: [
        "create_wanted_request",
        "search_listings",
        "search_listings",
        "evil_action" as never,
      ],
      now: FIXED_NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.intent.relatedBlockTypes]).toEqual([
      "intent_summary",
      "try_criteria",
    ]);
    expect([...r.intent.relatedActionIds]).toEqual([
      "create_wanted_request",
      "search_listings",
    ]);
  });

  it("rejects out-of-vocab kind / riskTier / source with typed validation errors", () => {
    const r = createInteractionIntent({
      kind: "evil_kind" as never,
      riskTier: "T9" as never,
      source: "evil_source" as never,
      title: "x",
      summary: "x",
      now: FIXED_NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");
    expect(r.errors.some((e) => /kind 'evil_kind'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /riskTier 'T9'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /source 'evil_source'/.test(e))).toBe(true);
  });

  it("rejects empty title / summary", () => {
    const r = createInteractionIntent({
      kind: "learn",
      riskTier: "T0",
      source: "home",
      title: "   ",
      summary: "",
      now: FIXED_NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /title is empty/.test(e))).toBe(true);
    expect(r.errors.some((e) => /summary is empty/.test(e))).toBe(true);
  });

  it("rejects a non-ISO `now`", () => {
    const r = createInteractionIntent({
      kind: "learn",
      riskTier: "T0",
      source: "home",
      title: "x",
      summary: "x",
      now: "yesterday",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /now must be an ISO timestamp/.test(e))).toBe(true);
  });

  it("create-time provenance is 'deterministic' regardless of caller hint", () => {
    // The input type does not expose `provenance`, so casting is
    // the only way a forged caller could try to set it. The
    // runtime ignores any extra key — hard-coded "deterministic".
    const r = createInteractionIntent({
      kind: "learn",
      riskTier: "T0",
      source: "home",
      title: "x",
      summary: "x",
      now: FIXED_NOW,
      // @ts-expect-error — forge attempt; runtime must hard-code provenance
      provenance: "llm_candidate",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.provenance).toBe("deterministic");
  });

  it("the created intent has none of the forbidden authority/PII slots", () => {
    const intent = buildIntent();
    const FORBIDDEN_SLOTS = [
      "rawPrompt",
      "prompt",
      "messages",
      "body",
      "rawBody",
      "system",
      "contactEmail",
      "contact_email",
      "phone",
      "profileId",
      "profile_id",
      "borrowerId",
      "borrower_id",
      "sellerId",
      "seller_id",
      "userId",
      "user_id",
      "exactAddress",
      "exact_address",
      "address",
      "payment",
      "settlement",
      "trustScore",
      "trust_score",
      "secret",
      "token",
      "providerPayload",
      "provider_payload",
    ];
    const record = intent as unknown as Record<string, unknown>;
    for (const slot of FORBIDDEN_SLOTS) {
      expect(record[slot]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------
// transitionInteractionIntent
// ---------------------------------------------------------------

describe("transitionInteractionIntent — allowed lifecycle path", () => {
  it("walks created → clarifying → planned → shown → action_proposed → confirmed → handoff → resolved", () => {
    const final = walkTo("T1", [
      "clarifying",
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "handoff",
      "resolved",
    ]);
    expect(final.status).toBe("resolved");
    expect(final.events.map((e) => e.statusAfter)).toEqual([
      "created",
      "clarifying",
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "handoff",
      "resolved",
    ]);
    expect(final.events[final.events.length - 1]?.type).toBe("resolved");
  });

  it("walks created → planned → shown → action_proposed → confirmed → executed → resolved on a T1 intent", () => {
    const final = walkTo("T1", [
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "executed",
      "resolved",
    ]);
    expect(final.status).toBe("resolved");
    expect(final.events.some((e) => e.type === "action_executed")).toBe(true);
  });

  it("does not mutate the original intent (immutable transition)", () => {
    const intent = buildIntent({ riskTier: "T1" });
    const originalSerialized = JSON.stringify(intent);
    const r = transitionInteractionIntent(intent, "clarifying", {
      now: LATER_NOW,
    });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(intent)).toBe(originalSerialized);
  });

  it("appends a transition event with the matching event type and statusAfter", () => {
    const intent = buildIntent({ riskTier: "T1" });
    const r = transitionInteractionIntent(intent, "clarifying", {
      now: LATER_NOW,
      label: "user asked a follow-up",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const last = r.intent.events[r.intent.events.length - 1]!;
    expect(last.type).toBe("clarification_requested");
    expect(last.statusAfter).toBe("clarifying");
    expect(last.label).toBe("user asked a follow-up");
    expect(last.at).toBe(LATER_NOW);
    expect(r.intent.updatedAt).toBe(LATER_NOW);
    expect(r.intent.status).toBe("clarifying");
  });
});

describe("transitionInteractionIntent — disallowed paths", () => {
  it("rejects an out-of-vocab nextStatus", () => {
    const intent = buildIntent();
    const r = transitionInteractionIntent(
      intent,
      "evil_status" as never,
      { now: LATER_NOW },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");
  });

  it("rejects action_proposed → executed without confirmed in between", () => {
    let intent = buildIntent({ riskTier: "T1" });
    intent = walkTo("T1", ["planned", "shown", "action_proposed"]);
    const r = transitionInteractionIntent(intent, "executed", {
      now: LATER_NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_transition");
  });

  it("rejects T3/T4/T5 transitions to executed with code 'blocked_by_risk_tier'", () => {
    for (const tier of ["T3", "T4", "T5"] as const) {
      const intent = walkTo(tier, [
        "planned",
        "shown",
        "action_proposed",
        "confirmed",
      ]);
      const r = transitionInteractionIntent(intent, "executed", {
        now: LATER_NOW,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("blocked_by_risk_tier");
    }
  });

  it("allows T4/T5 to take handoff or blocked instead of executed", () => {
    const t4Final = walkTo("T4", [
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "handoff",
      "resolved",
    ]);
    expect(t4Final.status).toBe("resolved");

    const t5Blocked = walkTo("T5", [
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "blocked",
    ]);
    expect(t5Blocked.status).toBe("blocked");
  });

  it("rejects any transition out of a terminal status", () => {
    for (const terminal of ["resolved", "abandoned", "blocked"] as const) {
      const intent = walkTo("T1", ["abandoned"]);
      // Intent status is "abandoned" now; replace status to test
      // each terminal explicitly.
      const tIntent: InteractionIntent = { ...intent, status: terminal };
      for (const next of ["clarifying", "planned", "shown"] as const) {
        const r = transitionInteractionIntent(tIntent, next, {
          now: LATER_NOW,
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.code).toBe("terminal_status");
      }
    }
  });

  it("rejects a non-ISO `now`", () => {
    const intent = buildIntent();
    const r = transitionInteractionIntent(intent, "clarifying", {
      now: "soon",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");
  });
});

// ---------------------------------------------------------------
// appendInteractionIntentEvent
// ---------------------------------------------------------------

describe("appendInteractionIntentEvent", () => {
  it("appends a typed event with the closed-vocab type and statusAfter", () => {
    const intent = buildIntent();
    const input: InteractionIntentEventInput = {
      type: "block_shown",
      label: "showed try criteria block",
      statusAfter: "shown",
      now: LATER_NOW,
    };
    const r = appendInteractionIntentEvent(intent, input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intent.events.length).toBe(intent.events.length + 1);
    const last = r.intent.events[r.intent.events.length - 1]!;
    expect(last.type).toBe("block_shown");
    expect(last.statusAfter).toBe("shown");
    expect(last.at).toBe(LATER_NOW);
    expect(last.label).toBe("showed try criteria block");
  });

  it("rejects out-of-vocab type / statusAfter", () => {
    const intent = buildIntent();
    const r = appendInteractionIntentEvent(intent, {
      type: "evil" as never,
      label: "x",
      statusAfter: "shown",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");

    const r2 = appendInteractionIntentEvent(intent, {
      type: "block_shown",
      label: "x",
      statusAfter: "evil_status" as never,
    });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.code).toBe("validation");
  });

  it("rejects an empty label", () => {
    const intent = buildIntent();
    const r = appendInteractionIntentEvent(intent, {
      type: "block_shown",
      label: "   ",
      statusAfter: "shown",
      now: LATER_NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("validation");
  });

  it("rejects forbidden authority / PII slots smuggled onto the event input", () => {
    const intent = buildIntent();
    const FORGED = [
      "rawPrompt",
      "prompt",
      "messages",
      "body",
      "rawBody",
      "system",
      "contactEmail",
      "phone",
      "profileId",
      "borrowerId",
      "sellerId",
      "userId",
      "exactAddress",
      "address",
      "payment",
      "settlement",
      "trustScore",
      "secret",
      "token",
      "providerPayload",
    ];
    for (const slot of FORGED) {
      const tainted = {
        type: "block_shown",
        label: "x",
        statusAfter: "shown",
        now: LATER_NOW,
        [slot]: "forged",
      } as unknown as InteractionIntentEventInput;
      const r = appendInteractionIntentEvent(intent, tainted);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("validation");
      expect(r.message).toContain(slot);
    }
  });
});

// ---------------------------------------------------------------
// validateInteractionIntent
// ---------------------------------------------------------------

describe("validateInteractionIntent", () => {
  it("returns ok:true for a freshly created intent", () => {
    const intent = buildIntent();
    const r = validateInteractionIntent(intent);
    expect(r.ok).toBe(true);
  });

  it("returns ok:true after a full T1 lifecycle to resolved", () => {
    const final = walkTo("T1", [
      "clarifying",
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "executed",
      "resolved",
    ]);
    const r = validateInteractionIntent(final);
    expect(r.ok).toBe(true);
  });

  it("flags an intent whose final event.statusAfter does not match intent.status", () => {
    const intent: InteractionIntent = {
      ...buildIntent(),
      status: "shown",
    };
    const r = validateInteractionIntent(intent);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /final event\.statusAfter/.test(e))).toBe(true);
  });

  it("flags an out-of-vocab kind / status / riskTier / source / provenance", () => {
    const intent: InteractionIntent = {
      ...buildIntent(),
      kind: "evil_kind" as never,
      riskTier: "T9" as never,
      source: "evil_source" as never,
      provenance: "evil_prov" as never,
    };
    const r = validateInteractionIntent(intent);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /kind 'evil_kind'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /riskTier 'T9'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /source 'evil_source'/.test(e))).toBe(true);
    expect(r.errors.some((e) => /provenance 'evil_prov'/.test(e))).toBe(true);
  });

  it("flags forged forbidden slots on the intent or on an event", () => {
    const base = buildIntent();
    const taintedIntent = {
      ...base,
      contactEmail: "leak@example.com",
    } as unknown as InteractionIntent;
    const r = validateInteractionIntent(taintedIntent);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /forbidden slot 'contactEmail'/.test(e)),
    ).toBe(true);

    const taintedEvent: InteractionIntent = {
      ...base,
      events: [
        ...base.events,
        {
          id: "evt_forged",
          type: "block_shown",
          at: LATER_NOW,
          label: "ok",
          statusAfter: "created",
          // @ts-expect-error — forged extra
          rawPrompt: "leak",
        },
      ],
    };
    const r2 = validateInteractionIntent(taintedEvent);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(
      r2.errors.some((e) => /forbidden slot 'rawPrompt'/.test(e)),
    ).toBe(true);
  });

  it("flags T3/T4/T5 intents that have ever reached executed", () => {
    const base = buildIntent({ riskTier: "T1" });
    const final = walkTo("T1", [
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "executed",
    ]);
    // Forge the riskTier on a finished intent to simulate drift.
    const tainted: InteractionIntent = {
      ...final,
      riskTier: "T4",
    };
    const r = validateInteractionIntent(tainted);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) =>
        /riskTier 'T4' cannot have status 'executed'/.test(e),
      ),
    ).toBe(true);
    expect(
      r.errors.some((e) => /has an executed event/.test(e)),
    ).toBe(true);
    // Suppress unused warning — `base` retained for fixture parity.
    expect(base.id).toBeDefined();
  });

  it("flags a non-ISO createdAt / updatedAt", () => {
    const tainted: InteractionIntent = {
      ...buildIntent(),
      createdAt: "yesterday",
      updatedAt: "soon",
    };
    const r = validateInteractionIntent(tainted);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /createdAt must be ISO/.test(e))).toBe(true);
    expect(r.errors.some((e) => /updatedAt must be ISO/.test(e))).toBe(true);
  });

  it("flags out-of-order events", () => {
    const base = buildIntent();
    const tainted: InteractionIntent = {
      ...base,
      events: [
        base.events[0]!,
        {
          id: "evt_oop",
          type: "block_shown",
          at: "2026-05-06T00:00:00.000Z", // before base.events[0]
          label: "out of order",
          statusAfter: "shown",
        },
      ],
      status: "shown",
    };
    const r = validateInteractionIntent(tainted);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(
      r.errors.some((e) => /older than the previous event/.test(e)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------
// isTerminalInteractionIntentStatus
// ---------------------------------------------------------------

describe("isTerminalInteractionIntentStatus", () => {
  it("returns true for resolved / abandoned / blocked", () => {
    expect(isTerminalInteractionIntentStatus("resolved")).toBe(true);
    expect(isTerminalInteractionIntentStatus("abandoned")).toBe(true);
    expect(isTerminalInteractionIntentStatus("blocked")).toBe(true);
  });

  it("returns false for every other status", () => {
    for (const s of [
      "created",
      "clarifying",
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "executed",
      "handoff",
    ] as const) {
      expect(isTerminalInteractionIntentStatus(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------
// deriveInteractionIntentMetrics
// ---------------------------------------------------------------

describe("deriveInteractionIntentMetrics", () => {
  it("returns a safe analytics record with no title or summary", () => {
    const final = walkTo("T1", [
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "executed",
      "handoff",
      "resolved",
    ]);
    const m = deriveInteractionIntentMetrics(final);
    expect(m).toEqual({
      id: final.id,
      kind: final.kind,
      status: "resolved",
      riskTier: "T1",
      source: final.source,
      eventCount: final.events.length,
      isTerminal: true,
      hasActionProposal: true,
      hasHumanHandoff: true,
      hasResolution: true,
      durationMs: Date.parse(final.updatedAt) - Date.parse(final.createdAt),
    });
    const record = m as unknown as Record<string, unknown>;
    expect(record["title"]).toBeUndefined();
    expect(record["summary"]).toBeUndefined();
    expect(record["events"]).toBeUndefined();
    expect(record["label"]).toBeUndefined();
    expect(record["rawPrompt"]).toBeUndefined();
    expect(record["contactEmail"]).toBeUndefined();
  });

  it("flags hasActionProposal=false / hasHumanHandoff=false / hasResolution=false on a fresh intent", () => {
    const m = deriveInteractionIntentMetrics(buildIntent());
    expect(m.hasActionProposal).toBe(false);
    expect(m.hasHumanHandoff).toBe(false);
    expect(m.hasResolution).toBe(false);
    expect(m.isTerminal).toBe(false);
    expect(m.eventCount).toBe(1);
  });
});

// ---------------------------------------------------------------
// Banlist scan
// ---------------------------------------------------------------

describe("InteractionIntent — banlist scan", () => {
  it("the production fixture has no banned phrase in title / summary / event labels", () => {
    const final = walkTo("T1", [
      "clarifying",
      "planned",
      "shown",
      "action_proposed",
      "confirmed",
      "handoff",
      "resolved",
    ]);
    expect(() =>
      assertNoBannedClaimsInInteractionIntent(CLOSED_ALPHA_BANLIST, final),
    ).not.toThrow();
  });

  it("the banlist scanner detects an injected violation", () => {
    const tainted = buildIntent({ title: "verified seller test" });
    expect(() =>
      assertNoBannedClaimsInInteractionIntent(CLOSED_ALPHA_BANLIST, tainted),
    ).toThrow(/verified seller/);
  });

  it("the runtime body never carries a literal banned phrase", () => {
    for (const banned of CLOSED_ALPHA_BANLIST) {
      expect(RUNTIME_SRC).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------
// Import boundary + I/O surface
// ---------------------------------------------------------------

describe("InteractionIntent — import boundary", () => {
  it("does NOT import from @/server/**", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']@\/server\//);
  });

  it("does NOT import any LLM provider / runtime / mock invoker", () => {
    expect(IMPORT_BLOB).not.toMatch(/anthropic|openai/i);
    expect(IMPORT_BLOB).not.toMatch(/@\/server\/llm/);
    expect(IMPORT_BLOB).not.toMatch(/llmAdapter/);
    expect(IMPORT_BLOB).not.toMatch(/\binvoke\b/);
    expect(IMPORT_BLOB).not.toMatch(/mockAdapter/);
  });

  it("does NOT import any Supabase client / SSR / persistence module", () => {
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/supabase-js/);
    expect(IMPORT_BLOB).not.toMatch(/@supabase\/ssr/);
    expect(IMPORT_BLOB).not.toMatch(/persistence\/supabase\/client/);
    expect(IMPORT_BLOB).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("does NOT import payment / claim / trust / handoff / notification / feedback / wanted-write modules", () => {
    expect(IMPORT_BLOB).not.toMatch(/payment/i);
    expect(IMPORT_BLOB).not.toMatch(/claim/i);
    expect(IMPORT_BLOB).not.toMatch(/trustEvent/i);
    expect(IMPORT_BLOB).not.toMatch(/\bhandoff\b/i);
    expect(IMPORT_BLOB).not.toMatch(/notifications?/i);
    expect(IMPORT_BLOB).not.toMatch(/webhook/i);
    expect(IMPORT_BLOB).not.toMatch(/feedback/i);
    expect(IMPORT_BLOB).not.toMatch(/submitFeedback/);
  });

  it("does NOT import React (this is a pure data primitive, not UI)", () => {
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react["']/);
    expect(IMPORT_BLOB).not.toMatch(/from\s+["']react\//);
    expect(IMPORT_BLOB).not.toMatch(/jsx-runtime/);
  });

  it("does NOT call any I/O surface (process.env / fetch / XMLHttpRequest / fs)", () => {
    expect(RUNTIME_SRC).not.toMatch(/process\.env/);
    expect(RUNTIME_SRC).not.toMatch(/\bfetch\(/);
    expect(RUNTIME_SRC).not.toMatch(/\bXMLHttpRequest\b/);
    expect(RUNTIME_SRC).not.toMatch(/readFile|writeFile|require\(/);
  });

  it("imports only the registry's closed vocabularies (and nothing else from @/lib)", () => {
    expect(IMPORT_BLOB).toMatch(/from\s+["']\.\/knowledgeRegistry["']/);
    // No other relative or alias imports — the primitive is pure.
    const imports = IMPORT_BLOB.match(/from\s+["']([^"']+)["']/g) ?? [];
    expect(imports.length).toBe(1);
  });
});

describe("InteractionIntent — provenance pinned in source", () => {
  it("every `provenance: \"...\"` object-property assignment is hard-coded to 'deterministic'", () => {
    // The closed-vocab `INTERACTION_INTENT_PROVENANCES` array
    // legitimately lists all three values; what we pin here is
    // that the runtime never WRITES `provenance: "llm_candidate"`
    // or `provenance: "human_reviewed"` as an object-property
    // assignment. Bare references inside the closed-vocab array
    // are excluded because they are list literals, not writes.
    const provenanceWrites =
      RUNTIME_SRC.match(/\bprovenance:\s*["']([^"']+)["']/g) ?? [];
    expect(provenanceWrites.length).toBeGreaterThan(0);
    for (const m of provenanceWrites) {
      expect(m).toMatch(/\bprovenance:\s*["']deterministic["']/);
    }
  });
});

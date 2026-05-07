// Platform interaction demo v0 — deterministic data model.
//
// Plan / authority:
//   docs/platform_thesis_ai_interaction_layer.md (§4 the
//     primitive model — this is the first dogfooding slice
//     that consumes the Platform Core registries on our own
//     public website).
//   docs/platform_pivot_note_2026-05-07.md §9 (next build
//     target after AnalyticsEvent taxonomy v1).
//
// Purpose:
//
//   Pure-data model that maps a small set of visitor purposes
//   to the registered ComponentBlock sequence, registered
//   ActionDefinition ids, GuardrailPolicy trigger explanations,
//   and AnalyticsEvent names that would describe the flow.
//
//   This file does NOT emit events, run actions, or fetch
//   anything. It only declares the deterministic mapping that
//   the demo page reads. Validation guarantees every id
//   referenced exists in its source registry.
//
// Hard rules pinned in this file:
//
//   - Pure data + pure functions. No I/O, no env, no network,
//     no Supabase, no LLM, no React, no DOM, no cookies, no
//     storage of any kind.
//   - Every ComponentBlock id, Action id, GuardrailTrigger
//     kind, and AnalyticsEvent name MUST come from the real
//     registries — no invented ids, no duplicated copies.
//   - `start_booking_request`, when proposed, must coexist
//     with `request_human_review` in the same flow; the
//     registered ActionDefinition.purpose already pins
//     "never asserts a confirmed booking", so the UI reads
//     the registry text rather than re-stating it here.
//   - No copy may assert task completion, purchase, booking
//     confirmation, autonomous execution, guaranteed
//     conversion, or email-sent.
//   - No CoRent / rental-marketplace residue in any copy.
//
// What this module is NOT:
//
//   - Not an emitter. The `analyticsEventSequence` is a
//     declarative *preview* of what the platform would later
//     emit, never a live trigger.
//   - Not a planner. The mapping is hand-authored for the
//     dogfooding slice; a future deterministicPlanner pass
//     will replace it.

import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
} from "@/lib/cie/analyticsEvents";
import {
  ACTION_IDS,
  type ActionId,
} from "@/lib/cie/actionRegistry";
import {
  COMPONENT_BLOCK_IDS,
  type ComponentBlockId,
} from "@/lib/cie/componentBlocks";
import {
  GUARDRAIL_DECISIONS,
  GUARDRAIL_TRIGGER_KINDS,
  type GuardrailDecision,
  type GuardrailTriggerKind,
} from "@/lib/cie/guardrailPolicy";
import {
  INTERACTION_INTENT_KINDS,
  INTERACTION_INTENT_RISK_TIERS,
  type InteractionIntentKind,
  type InteractionIntentRiskTier,
} from "@/lib/cie/interactionIntent";

// ---------------------------------------------------------------
// Closed vocabulary for demo purposes
// ---------------------------------------------------------------

export const PLATFORM_DEMO_PURPOSE_IDS = [
  "understand_product",
  "check_site_fit",
  "see_how_it_works",
  "contact_or_handoff",
] as const;
export type PlatformDemoPurposeId = (typeof PLATFORM_DEMO_PURPOSE_IDS)[number];

// ---------------------------------------------------------------
// Definition shape
// ---------------------------------------------------------------

export type PlatformDemoGuardrailNote = {
  triggerKind: GuardrailTriggerKind;
  decision: GuardrailDecision;
  explanation: string;
};

export type PlatformDemoOperatorInsight = {
  // One-sentence summary of what visitors at this purpose
  // are actually trying to accomplish.
  summary: string;
  // Short label the operator would see for the detected
  // intent — phrased from the visitor's point of view.
  detectedIntentLabel: string;
  // Friction points the platform would surface to the operator.
  visitorFriction: ReadonlyArray<string>;
  // Concrete missing-explanation areas on the operator's site.
  knowledgeGaps: ReadonlyArray<string>;
  // Concrete copy / structure changes the operator could make.
  recommendedSiteUpdates: ReadonlyArray<string>;
  // Why parts of the flow route to human review, in operator
  // language. Empty when the flow has no review escalation.
  reviewReasons: ReadonlyArray<string>;
  // What an operator gets without paying anything yet — kept
  // strictly informational; this is a positioning value list,
  // not a pricing claim.
  freePlanValue: ReadonlyArray<string>;
};

export type PlatformDemoPurpose = {
  id: PlatformDemoPurposeId;
  label: string;
  description: string;
  intentKind: InteractionIntentKind;
  intentRiskTier: InteractionIntentRiskTier;
  componentBlockSequence: ReadonlyArray<ComponentBlockId>;
  proposedActionIds: ReadonlyArray<ActionId>;
  guardrailNotes: ReadonlyArray<PlatformDemoGuardrailNote>;
  analyticsEventSequence: ReadonlyArray<AnalyticsEventName>;
  operatorInsight: PlatformDemoOperatorInsight;
};

// ---------------------------------------------------------------
// Demo flows
// ---------------------------------------------------------------

const PLATFORM_DEMO_PURPOSES: ReadonlyArray<PlatformDemoPurpose> = [
  {
    id: "understand_product",
    label: "Understand the product",
    description:
      "Read what the platform is and what it is not, grounded in registered sources.",
    intentKind: "learn",
    intentRiskTier: "T0",
    componentBlockSequence: [
      "intent_summary",
      "faq_answer",
      "source_citation",
      "fallback_message",
    ],
    proposedActionIds: ["open_external_link"],
    guardrailNotes: [
      {
        triggerKind: "missing_registered_knowledge",
        decision: "require_source",
        explanation:
          "When no registered source covers the question, the platform shows a calm source-gap message instead of guessing.",
      },
      {
        triggerKind: "forbidden_phrase",
        decision: "block",
        explanation:
          "Marketing-style phrasing is refused at the brand layer; canonical phrasing wins.",
      },
    ],
    analyticsEventSequence: [
      "interaction_started",
      "intent_detected",
      "knowledge_source_used",
      "component_block_presented",
      "action_presented",
    ],
    operatorInsight: {
      summary:
        "Visitors want to know what the platform actually is and is not before going further.",
      detectedIntentLabel: "Learn what this is.",
      visitorFriction: [
        "Visitors may confuse the platform with a chatbot or autoresponder.",
        "Visitors may miss that the planner stays deterministic — no autonomous action.",
      ],
      knowledgeGaps: [
        "Plain-language description of the platform's scope.",
        "Side-by-side of what the platform does and does not do.",
      ],
      recommendedSiteUpdates: [
        "Add a short 'what this is and is not' section near the hero.",
        "Anchor each headline statement to a registered source citation.",
      ],
      reviewReasons: [
        "When no registered source covers a question, the platform shows a calm source-gap message instead of guessing.",
      ],
      freePlanValue: [
        "See the top visitor intents on this page.",
        "See where the explanation has gaps.",
        "Get suggested copy fixes for the first three gaps.",
      ],
    },
  },
  {
    id: "check_site_fit",
    label: "Check site fit",
    description:
      "Walk through a short fit check to see whether the platform is a match for a candidate site.",
    intentKind: "compare",
    intentRiskTier: "T1",
    componentBlockSequence: [
      "intent_summary",
      "clarifying_question",
      "pre_action_checklist",
      "lead_capture",
    ],
    proposedActionIds: ["create_lead", "create_contact_request"],
    guardrailNotes: [
      {
        triggerKind: "sensitive_field_request",
        decision: "block",
        explanation:
          "Identity and financial fields are refused at the guardrail layer; the fit check stays contact-only.",
      },
      {
        triggerKind: "brand_claim_policy",
        decision: "require_confirmation",
        explanation:
          "Wording that drifts from the brand's canonical phrasing rule needs visitor confirmation before it ships.",
      },
    ],
    analyticsEventSequence: [
      "interaction_started",
      "intent_detected",
      "intent_clarification_requested",
      "component_block_presented",
      "action_presented",
      "action_confirmed",
    ],
    operatorInsight: {
      summary:
        "Visitors want to know whether this can work on their site before talking to anyone.",
      detectedIntentLabel: "Check fit for my site.",
      visitorFriction: [
        "Visitors may not know what site type is a good fit.",
        "Visitors may not know which next step is safe.",
      ],
      knowledgeGaps: [
        "Clearer examples of supported website types.",
        "Plain-language explanation of what the platform does not automate.",
      ],
      recommendedSiteUpdates: [
        "Add a short 'who this is for' section.",
        "Frame the next step as 'request a fit review', not as a one-click activation.",
      ],
      reviewReasons: [
        "A human should review site-specific fit before the page makes site-specific promises.",
      ],
      freePlanValue: [
        "See the top visitor intents.",
        "See missing-explanation areas.",
        "Get the first recommended site updates.",
      ],
    },
  },
  {
    id: "see_how_it_works",
    label: "See how it works",
    description:
      "Walk the registered primitives — knowledge, blocks, actions, guardrails, events.",
    intentKind: "learn",
    intentRiskTier: "T0",
    componentBlockSequence: [
      "intent_summary",
      "faq_answer",
      "external_link_cta",
      "fallback_message",
    ],
    proposedActionIds: ["open_external_link", "download_resource"],
    guardrailNotes: [
      {
        triggerKind: "external_integration",
        decision: "block",
        explanation:
          "External integrations not registered for this site are refused at the guardrail layer.",
      },
      {
        triggerKind: "unsafe_prompt_injection",
        decision: "block",
        explanation:
          "Inputs that look like instructions are treated as data; the planner stays deterministic.",
      },
    ],
    analyticsEventSequence: [
      "interaction_started",
      "intent_detected",
      "knowledge_source_used",
      "component_block_presented",
      "action_presented",
    ],
    operatorInsight: {
      summary:
        "Visitors want to walk through the primitives and see the boundary, not a slide deck.",
      detectedIntentLabel: "See how the platform works.",
      visitorFriction: [
        "Visitors may bounce when the page hides the mechanics behind marketing copy.",
        "Visitors may not realize the planner is deterministic and source-grounded.",
      ],
      knowledgeGaps: [
        "Walkthrough of the registered primitives in plain language.",
        "Linkable resources for each primitive.",
      ],
      recommendedSiteUpdates: [
        "Add a primitive-by-primitive walkthrough page.",
        "Offer a downloadable one-page summary of the safety standard.",
      ],
      reviewReasons: [
        "External integrations not registered for this site stay refused at the guardrail layer.",
      ],
      freePlanValue: [
        "See which primitives visitors stop at.",
        "Get the first three documentation gaps.",
        "Preview the events that would tell you what visitors were doing.",
      ],
    },
  },
  {
    id: "contact_or_handoff",
    label: "Contact or hand off",
    description:
      "Ask a host operator to follow up, or hand off the visitor flow to a human reviewer.",
    intentKind: "contact",
    intentRiskTier: "T2",
    componentBlockSequence: [
      "intent_summary",
      "handoff_notice",
      "human_review_notice",
      "lead_capture",
    ],
    proposedActionIds: [
      "create_contact_request",
      "request_human_review",
      "start_booking_request",
    ],
    guardrailNotes: [
      {
        triggerKind: "high_risk_tier",
        decision: "require_human_review",
        explanation:
          "Higher-stakes flows route through a human operator before any preparation or visible action.",
      },
      {
        triggerKind: "autonomous_action",
        decision: "block",
        explanation:
          "Autonomous actions are not allowed; every action is visitor-initiated and visibly confirmed.",
      },
      {
        triggerKind: "irreversible_or_binding_action",
        decision: "block",
        explanation:
          "Binding actions are blocked at the policy layer; the booking action prepares a request, never a confirmed slot.",
      },
    ],
    analyticsEventSequence: [
      "interaction_started",
      "intent_detected",
      "component_block_presented",
      "action_presented",
      "action_confirmed",
      "human_review_requested",
    ],
    operatorInsight: {
      summary:
        "Visitors want a human, or want to start a request the platform will queue for review.",
      detectedIntentLabel: "Talk to a person or start a request.",
      visitorFriction: [
        "Visitors may not see a clear path to a real human.",
        "Visitors may worry the form will dispatch something they did not approve.",
      ],
      knowledgeGaps: [
        "Operator response times, in plain language.",
        "Which review steps the request will pass through.",
      ],
      recommendedSiteUpdates: [
        "Add a short 'what happens next' note next to the contact CTA.",
        "Surface the human-review notice before any preparation step.",
      ],
      reviewReasons: [
        "Higher-stakes flows route through a human operator before any preparation or visible action.",
        "Booking is request-only; a confirmed slot requires reviewer approval.",
      ],
      freePlanValue: [
        "See where contact requests get stuck.",
        "See which intents trigger human review most often.",
        "Get the first three contact-flow improvements.",
      ],
    },
  },
];

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

export function listPlatformDemoPurposes(): ReadonlyArray<PlatformDemoPurpose> {
  return PLATFORM_DEMO_PURPOSES;
}

export function getPlatformDemoPurpose(
  id: string,
): PlatformDemoPurpose | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return PLATFORM_DEMO_PURPOSES.find((p) => p.id === id) ?? null;
}

// ---------------------------------------------------------------
// Validator
// ---------------------------------------------------------------

export type PlatformDemoModelValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function validatePlatformDemoModel(
  purposes: ReadonlyArray<PlatformDemoPurpose> = PLATFORM_DEMO_PURPOSES,
): PlatformDemoModelValidationResult {
  const errors: string[] = [];

  const intentSet = new Set<string>(INTERACTION_INTENT_KINDS);
  const intentRiskTierSet = new Set<string>(INTERACTION_INTENT_RISK_TIERS);
  const blockSet = new Set<string>(COMPONENT_BLOCK_IDS);
  const actionSet = new Set<string>(ACTION_IDS);
  const triggerSet = new Set<string>(GUARDRAIL_TRIGGER_KINDS);
  const decisionSet = new Set<string>(GUARDRAIL_DECISIONS);
  const eventSet = new Set<string>(ANALYTICS_EVENT_NAMES);
  const purposeIdSet = new Set<string>(PLATFORM_DEMO_PURPOSE_IDS);

  const seen = new Set<string>();
  for (const p of purposes) {
    const id = p?.id ?? "<missing id>";
    if (!purposeIdSet.has(p?.id)) {
      errors.push(`${id}: id '${String(p?.id)}' is not in PLATFORM_DEMO_PURPOSE_IDS`);
    } else if (seen.has(p.id)) {
      errors.push(`${id}: duplicate purpose id`);
    } else {
      seen.add(p.id);
    }
    if (typeof p?.label !== "string" || p.label.trim().length === 0) {
      errors.push(`${id}: label must be a non-empty string`);
    }
    if (typeof p?.description !== "string" || p.description.trim().length === 0) {
      errors.push(`${id}: description must be a non-empty string`);
    }
    if (!intentSet.has(p?.intentKind)) {
      errors.push(`${id}: intentKind '${String(p?.intentKind)}' is not in INTERACTION_INTENT_KINDS`);
    }
    if (!intentRiskTierSet.has(p?.intentRiskTier)) {
      errors.push(`${id}: intentRiskTier '${String(p?.intentRiskTier)}' is not in INTERACTION_INTENT_RISK_TIERS`);
    }
    for (const b of p?.componentBlockSequence ?? []) {
      if (!blockSet.has(b)) {
        errors.push(`${id}: componentBlockSequence references unknown id '${b}'`);
      }
    }
    for (const a of p?.proposedActionIds ?? []) {
      if (!actionSet.has(a)) {
        errors.push(`${id}: proposedActionIds references unknown id '${a}'`);
      }
    }
    for (const note of p?.guardrailNotes ?? []) {
      if (!triggerSet.has(note?.triggerKind)) {
        errors.push(`${id}: guardrailNotes references unknown trigger kind '${String(note?.triggerKind)}'`);
      }
      if (!decisionSet.has(note?.decision)) {
        errors.push(`${id}: guardrailNotes references unknown decision '${String(note?.decision)}'`);
      }
      if (
        typeof note?.explanation !== "string" ||
        note.explanation.trim().length === 0
      ) {
        errors.push(`${id}: guardrailNotes explanation must be a non-empty string`);
      }
    }
    for (const e of p?.analyticsEventSequence ?? []) {
      if (!eventSet.has(e)) {
        errors.push(`${id}: analyticsEventSequence references unknown name '${e}'`);
      }
    }
    // start_booking_request always pairs with request_human_review.
    if (
      Array.isArray(p?.proposedActionIds) &&
      p.proposedActionIds.includes("start_booking_request") &&
      !p.proposedActionIds.includes("request_human_review")
    ) {
      errors.push(
        `${id}: start_booking_request must coexist with request_human_review (booking is request-only, human-review-required)`,
      );
    }

    // Operator insight shape.
    const insight = p?.operatorInsight;
    if (!insight || typeof insight !== "object") {
      errors.push(`${id}: operatorInsight must be an object`);
    } else {
      if (typeof insight.summary !== "string" || insight.summary.trim().length === 0) {
        errors.push(`${id}: operatorInsight.summary must be a non-empty string`);
      }
      if (
        typeof insight.detectedIntentLabel !== "string" ||
        insight.detectedIntentLabel.trim().length === 0
      ) {
        errors.push(
          `${id}: operatorInsight.detectedIntentLabel must be a non-empty string`,
        );
      }
      for (const [field, requireNonEmpty] of [
        ["visitorFriction", true],
        ["knowledgeGaps", true],
        ["recommendedSiteUpdates", true],
        ["reviewReasons", false],
        ["freePlanValue", true],
      ] as const) {
        const arr = (insight as Record<string, unknown>)[field];
        if (!Array.isArray(arr)) {
          errors.push(`${id}: operatorInsight.${field} must be an array`);
          continue;
        }
        if (requireNonEmpty && arr.length === 0) {
          errors.push(`${id}: operatorInsight.${field} must declare at least one entry`);
        }
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i];
          if (typeof v !== "string" || v.trim().length === 0) {
            errors.push(
              `${id}: operatorInsight.${field}[${i}] must be a non-empty string`,
            );
          }
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

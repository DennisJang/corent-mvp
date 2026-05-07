// CoRent Interactive Experience — Deterministic Planner v1.
//
// Plan:
//   docs/corent_interactive_experience_architecture.md
//     §4.2 "Orchestrator" (planner branch),
//     §6.1 "Allowed block types" (closed vocabulary),
//     §7    "Tool orchestration" (related actions),
//     §13   "Phased roadmap → Phase 1 deterministic interactive
//           experience" (this slice — no LLM yet).
//
// Purpose:
//
//   Given a (audience, surface, intentKind?, rawInput?,
//   category?, durationDays?, hasListings?, requestStatus?)
//   context, produce a deterministic plan: which knowledge
//   cards apply, which block recipes the surface should render,
//   and which related actions are now reachable. The planner
//   never executes an action, never writes data, never calls an
//   LLM.
//
//   This module is the second seam in the CIE architecture:
//
//      knowledgeRegistry.ts   ← "what is this surface for?"
//      deterministicPlanner.ts ← "given the user's context, what
//                                  blocks render here?"
//      <future>               ← mock LLM orchestration (Phase 3)
//
// Hard rules pinned in this file:
//
//   - Pure functions. No I/O, no env reads, no network, no
//     Supabase, no LLM provider, no payment / claim / trust /
//     handoff / notifications. Importing this module is free.
//   - Closed block-recipe vocabulary. Every emitted block's
//     `type` is in `CIE_ALLOWED_BLOCKS`. Adding a new block type
//     requires (a) extending the registry's vocabulary and
//     (b) extending this file's union type — both reviewed.
//   - Closed action vocabulary. Every entry in `relatedActions`
//     is in `CIE_RELATED_ACTIONS`.
//   - DTO discipline. Block recipes have NO slot for
//     contactEmail / profileId / borrowerId / sellerId /
//     exactAddress / trustScore / payment / settlement / raw
//     prompts / messages / system fields. The shape itself
//     forbids them.
//   - Banlist clean. Every emitted Korean string is sourced from
//     the registry's `title` / `safeSummary` / `allowedClaims`
//     or the deterministic readiness service. The registry test
//     pins those upstream; this planner's test re-pins downstream.
//   - Provenance: `"deterministic"` only. The Phase 3 LLM-channel
//     planner will return `provenance: "llm_candidate"` blocks
//     and live elsewhere.
//
// What this module is NOT:
//
//   - Not wired into any UI surface. /, /search, /listings/[id],
//     /requests, /dashboard, /admin/cockpit do not call
//     `planCIEExperience` yet. Wiring is a future slice.
//   - Not a Phase 3 LLM orchestrator. The planner is purely
//     rule-based on top of the typed registry.

import type { CategoryId } from "@/domain/categories";
import { deriveTryBeforeBuyReadiness } from "@/lib/services/tryBeforeBuyReadinessService";
import {
  CIE_ALLOWED_BLOCKS,
  CIE_RELATED_ACTIONS,
  findCIEKnowledgeCards,
  getCIEKnowledgeCard,
  type CIEAllowedBlock,
  type CIEAudience,
  type CIEIntentKind,
  type CIEKnowledgeCard,
  type CIEProvenance,
  type CIERelatedAction,
  type CIESurface,
} from "./knowledgeRegistry";

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------

export type CIEPlannerInput = {
  audience?: CIEAudience;
  // The surface the user is on right now. Required because the
  // planner's primary narrowing axis is the surface — every
  // surface has its own block vocabulary.
  surface: CIESurface;
  intentKind?: CIEIntentKind;
  rawInput?: string | null;
  category?: CategoryId | null;
  durationDays?: number | null;
  // null/undefined = "we have not asked the listings layer yet";
  // false = "loaded and zero matches" (cold-start wedge entry);
  // true  = "loaded and ≥1 match".
  hasListings?: boolean | null;
  // Borrower request status string (e.g. "requested",
  // "seller_approved"). When supplied, the planner emits a
  // `request_status` block.
  requestStatus?: string | null;
};

// ---------------------------------------------------------------
// Block recipes (closed union)
// ---------------------------------------------------------------

export type CIEBlockRecipeIntentSummary = {
  type: "intent_summary";
  title: string;
  summary: string;
  sourceCardId: string;
};

export type CIEBlockRecipeTryCriteria = {
  type: "try_criteria";
  criteria: ReadonlyArray<string>;
  sourceCardId: string;
};

export type CIEBlockRecipeListingMatches = {
  type: "listing_matches";
  // "show_results" — caller has confirmed listings are present
  // and the surface should render the existing results grid.
  // "none"        — caller has not asked the listings layer yet
  // (planner stays neutral; the surface keeps its default).
  mode: "show_results" | "none";
  sourceCardId: string;
};

export type CIEBlockRecipeWantedRequestCTA = {
  type: "wanted_request_cta";
  enabled: boolean;
  // Closed reason vocabulary. Surfaces never read free-text
  // explanations from a planner — they map the reason to their
  // own copy if needed.
  reason:
    | "no_listings"
    | "listings_present"
    | "neutral"
    | "wanted_form_default";
  sourceCardId: string;
};

export type CIEBlockRecipeListingReadiness = {
  type: "listing_readiness";
  category: CategoryId;
  sourceCardId: string;
};

export type CIEBlockRecipeRequestStatus = {
  type: "request_status";
  status: string;
  sourceCardId: string;
};

export type CIEBlockRecipeSellerReadiness = {
  type: "seller_readiness";
  sourceCardId: string;
};

export type CIEBlockRecipeFounderFeedbackReview = {
  type: "founder_feedback_review";
  sourceCardId: string;
};

export type CIEBlockRecipeSafetyNote = {
  type: "safety_note";
  copy: string;
  sourceCardId: string;
};

export type CIEBlockRecipe =
  | CIEBlockRecipeIntentSummary
  | CIEBlockRecipeTryCriteria
  | CIEBlockRecipeListingMatches
  | CIEBlockRecipeWantedRequestCTA
  | CIEBlockRecipeListingReadiness
  | CIEBlockRecipeRequestStatus
  | CIEBlockRecipeSellerReadiness
  | CIEBlockRecipeFounderFeedbackReview
  | CIEBlockRecipeSafetyNote;

// ---------------------------------------------------------------
// Output
// ---------------------------------------------------------------

export type CIEPlan = {
  kind: "planned";
  cards: ReadonlyArray<CIEKnowledgeCard>;
  blocks: ReadonlyArray<CIEBlockRecipe>;
  relatedActions: ReadonlyArray<CIERelatedAction>;
  provenance: CIEProvenance;
};

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

const TRY_CRITERIA_MAX = 4;

// `findCIEKnowledgeCards` filters by exact `audience` match. The
// CIE architecture allows cross-cutting cards (e.g. the safety
// note carrying audience="visitor") to apply to every audience
// on the surfaces it lists. The planner therefore queries the
// registry on (surface, intentKind) only and applies a
// permissive audience filter at this layer: keep a card if its
// audience equals the input audience OR equals "visitor".
function selectCards(input: CIEPlannerInput): ReadonlyArray<CIEKnowledgeCard> {
  const allOnSurface = findCIEKnowledgeCards({
    surface: input.surface,
    ...(input.intentKind ? { intentKind: input.intentKind } : {}),
  });
  if (!input.audience) return allOnSurface;
  return allOnSurface.filter(
    (c) => c.audience === input.audience || c.audience === "visitor",
  );
}

function safeRawInput(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function deriveCriteriaForCategory(
  category: CategoryId | null | undefined,
): ReadonlyArray<string> {
  if (!category) return [];
  const card = deriveTryBeforeBuyReadiness({
    category,
    pickupArea: "",
    condition: "",
    estimatedValue: 0,
  });
  return card.tryBeforeBuyPoints.slice(0, TRY_CRITERIA_MAX);
}

// Stable string key for dedupe — JSON of the recipe's payload
// fields excluding `sourceCardId`. Two cards may suggest the
// same recipe shape; we want a single emission.
function recipeDedupeKey(r: CIEBlockRecipe): string {
  // Each branch lists payload fields explicitly so a future
  // recipe gets a deliberate dedupe rule rather than a permissive
  // JSON.stringify of an unknown shape.
  switch (r.type) {
    case "intent_summary":
      return `intent_summary:${r.title}:${r.summary}`;
    case "try_criteria":
      return `try_criteria:${r.criteria.join("|")}`;
    case "listing_matches":
      return `listing_matches:${r.mode}`;
    case "wanted_request_cta":
      return `wanted_request_cta:${r.enabled}:${r.reason}`;
    case "listing_readiness":
      return `listing_readiness:${r.category}`;
    case "request_status":
      return `request_status:${r.status}`;
    case "seller_readiness":
      return `seller_readiness`;
    case "founder_feedback_review":
      return `founder_feedback_review`;
    case "safety_note":
      return `safety_note:${r.copy}`;
  }
}

function pickFirstAllowedClaim(card: CIEKnowledgeCard): string {
  return card.allowedClaims[0] ?? card.safeSummary;
}

// ---------------------------------------------------------------
// Planner
// ---------------------------------------------------------------

export function planCIEExperience(input: CIEPlannerInput): CIEPlan {
  const cards = selectCards(input);
  const rawInput = safeRawInput(input.rawInput);
  const criteria = deriveCriteriaForCategory(input.category);

  const seen = new Set<string>();
  const blocks: CIEBlockRecipe[] = [];
  const pushUnique = (recipe: CIEBlockRecipe) => {
    const key = recipeDedupeKey(recipe);
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(recipe);
  };

  for (const card of cards) {
    for (const blockType of card.suggestedBlocks) {
      const recipe = buildBlock(blockType, card, input, rawInput, criteria);
      if (recipe) pushUnique(recipe);
    }
  }

  const relatedActions = collectRelatedActions(cards);

  return {
    kind: "planned",
    cards,
    blocks,
    relatedActions,
    provenance: "deterministic",
  };
}

function buildBlock(
  blockType: CIEAllowedBlock,
  card: CIEKnowledgeCard,
  input: CIEPlannerInput,
  rawInput: string,
  criteria: ReadonlyArray<string>,
): CIEBlockRecipe | null {
  switch (blockType) {
    case "intent_summary": {
      // Only emit when the user has actually expressed intent.
      // An empty surface (no rawInput, no parsed intent) keeps the
      // surface's default copy.
      if (rawInput.length === 0) return null;
      return {
        type: "intent_summary",
        title: card.title,
        summary: card.safeSummary,
        sourceCardId: card.id,
      };
    }
    case "try_criteria": {
      // No category → no criteria block. The surface's default
      // fallback copy (e.g. SearchIntentSummary's
      // "카테고리는 아직 확실하지 않아요…") covers this case.
      if (criteria.length === 0) return null;
      return {
        type: "try_criteria",
        criteria,
        sourceCardId: card.id,
      };
    }
    case "listing_matches": {
      // Listings layer not asked yet → render the surface's
      // default. Loaded + present → "show_results". Loaded +
      // empty → suppressed (the wanted_request_cta path covers
      // the empty branch).
      if (input.hasListings === true) {
        return {
          type: "listing_matches",
          mode: "show_results",
          sourceCardId: card.id,
        };
      }
      if (input.hasListings === false) return null;
      return {
        type: "listing_matches",
        mode: "none",
        sourceCardId: card.id,
      };
    }
    case "wanted_request_cta": {
      // The CTA's enabled state is driven by the listings layer's
      // signal. On surfaces with no listings layer (anything
      // other than "search"), the CTA is wanted_form_default —
      // a neutral pointer the surface can ignore until wired.
      if (input.surface !== "search") {
        return {
          type: "wanted_request_cta",
          enabled: false,
          reason: "wanted_form_default",
          sourceCardId: card.id,
        };
      }
      if (input.hasListings === false) {
        return {
          type: "wanted_request_cta",
          enabled: true,
          reason: "no_listings",
          sourceCardId: card.id,
        };
      }
      if (input.hasListings === true) {
        return {
          type: "wanted_request_cta",
          enabled: false,
          reason: "listings_present",
          sourceCardId: card.id,
        };
      }
      return {
        type: "wanted_request_cta",
        enabled: false,
        reason: "neutral",
        sourceCardId: card.id,
      };
    }
    case "listing_readiness": {
      // Only meaningful on listing_detail surfaces and only
      // when the caller knows the category.
      if (input.surface !== "listing_detail") return null;
      if (!input.category) return null;
      return {
        type: "listing_readiness",
        category: input.category,
        sourceCardId: card.id,
      };
    }
    case "request_status": {
      const status = (input.requestStatus ?? "").trim();
      if (!status) return null;
      return {
        type: "request_status",
        status,
        sourceCardId: card.id,
      };
    }
    case "seller_readiness":
      if (input.surface !== "dashboard") return null;
      return { type: "seller_readiness", sourceCardId: card.id };
    case "founder_feedback_review":
      if (input.surface !== "admin_cockpit") return null;
      return { type: "founder_feedback_review", sourceCardId: card.id };
    case "safety_note":
      return {
        type: "safety_note",
        copy: pickFirstAllowedClaim(card),
        sourceCardId: card.id,
      };
  }
}

function collectRelatedActions(
  cards: ReadonlyArray<CIEKnowledgeCard>,
): ReadonlyArray<CIERelatedAction> {
  const set = new Set<CIERelatedAction>();
  for (const c of cards) {
    for (const a of c.relatedActions) set.add(a);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

const ALLOWED_BLOCK_SET = new Set<CIEAllowedBlock>(CIE_ALLOWED_BLOCKS);
const ALLOWED_ACTION_SET = new Set<CIERelatedAction>(CIE_RELATED_ACTIONS);

export type CIEPlanValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

export function validateCIEPlan(plan: CIEPlan): CIEPlanValidationResult {
  const errors: string[] = [];

  if (plan.kind !== "planned") errors.push("plan.kind must be 'planned'");
  if (plan.provenance !== "deterministic") {
    errors.push("plan.provenance must be 'deterministic'");
  }
  if (!Array.isArray(plan.cards)) errors.push("plan.cards must be an array");
  if (!Array.isArray(plan.blocks)) errors.push("plan.blocks must be an array");
  if (!Array.isArray(plan.relatedActions)) {
    errors.push("plan.relatedActions must be an array");
  }

  for (let i = 0; i < plan.blocks.length; i++) {
    const block = plan.blocks[i]!;
    if (!ALLOWED_BLOCK_SET.has(block.type)) {
      errors.push(`blocks[${i}].type '${block.type}' is not allowed`);
    }
    if (!block.sourceCardId || typeof block.sourceCardId !== "string") {
      errors.push(`blocks[${i}].sourceCardId is empty/invalid`);
      continue;
    }
    if (!getCIEKnowledgeCard(block.sourceCardId)) {
      errors.push(
        `blocks[${i}].sourceCardId '${block.sourceCardId}' does not resolve to a registry card`,
      );
    }
    // Per-recipe field guards. These belt-and-suspender the
    // type system at runtime.
    switch (block.type) {
      case "intent_summary":
        if (!block.title.trim()) errors.push(`blocks[${i}].title empty`);
        if (!block.summary.trim()) errors.push(`blocks[${i}].summary empty`);
        break;
      case "try_criteria":
        if (!Array.isArray(block.criteria) || block.criteria.length === 0) {
          errors.push(`blocks[${i}].criteria must be a non-empty array`);
        }
        break;
      case "request_status":
        if (!block.status.trim()) errors.push(`blocks[${i}].status empty`);
        break;
      case "safety_note":
        if (!block.copy.trim()) errors.push(`blocks[${i}].copy empty`);
        break;
      // listing_matches / wanted_request_cta / listing_readiness /
      // seller_readiness / founder_feedback_review carry only typed
      // enums or no extra slots — covered by the discriminant
      // checks above.
      default:
        break;
    }
  }

  // Forbidden authority / PII slots — runtime sweep so a future
  // recipe variant cannot accidentally add one.
  const FORBIDDEN_SLOTS = [
    "rawPrompt",
    "prompt",
    "rawBody",
    "body",
    "messages",
    "system",
    "contactEmail",
    "contact_email",
    "profileId",
    "profile_id",
    "borrowerId",
    "borrower_id",
    "sellerId",
    "seller_id",
    "exactAddress",
    "exact_address",
    "address",
    "trustScore",
    "trust_score",
    "payment",
    "settlement",
    "founderEmail",
    "is_admin",
    "role",
    "capability",
  ];
  for (let i = 0; i < plan.blocks.length; i++) {
    const block = plan.blocks[i] as unknown as Record<string, unknown>;
    for (const slot of FORBIDDEN_SLOTS) {
      if (Object.prototype.hasOwnProperty.call(block, slot)) {
        errors.push(`blocks[${i}] contains forbidden slot '${slot}'`);
      }
    }
  }

  for (const a of plan.relatedActions) {
    if (!ALLOWED_ACTION_SET.has(a)) {
      errors.push(`relatedActions includes out-of-vocab '${a}'`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Banlist scan over every string slot in the plan. Caller owns
// the banlist data. Throws on hit so the test layer can pin the
// invariant.
export function assertNoBannedClaimsInCIEPlan(
  bannedPhrases: ReadonlyArray<string>,
  plan: CIEPlan,
): void {
  const hits: string[] = [];
  for (const c of plan.cards) {
    const fields: ReadonlyArray<{ label: string; value: string }> = [
      { label: `cards[${c.id}].title`, value: c.title },
      { label: `cards[${c.id}].safeSummary`, value: c.safeSummary },
      ...c.allowedClaims.map((claim, i) => ({
        label: `cards[${c.id}].allowedClaims[${i}]`,
        value: claim,
      })),
      ...c.forbiddenClaims.map((claim, i) => ({
        label: `cards[${c.id}].forbiddenClaims[${i}]`,
        value: claim,
      })),
    ];
    for (const f of fields) {
      for (const phrase of bannedPhrases) {
        if (f.value.includes(phrase)) {
          hits.push(`${f.label} contains banned phrase: ${phrase}`);
        }
      }
    }
  }
  for (let i = 0; i < plan.blocks.length; i++) {
    const block = plan.blocks[i]!;
    const blockStrings: string[] = [];
    switch (block.type) {
      case "intent_summary":
        blockStrings.push(block.title, block.summary);
        break;
      case "try_criteria":
        blockStrings.push(...block.criteria);
        break;
      case "request_status":
        blockStrings.push(block.status);
        break;
      case "safety_note":
        blockStrings.push(block.copy);
        break;
      case "listing_matches":
      case "wanted_request_cta":
      case "listing_readiness":
      case "seller_readiness":
      case "founder_feedback_review":
        // No free-text user-facing slots on these recipes.
        break;
    }
    for (const value of blockStrings) {
      for (const phrase of bannedPhrases) {
        if (value.includes(phrase)) {
          hits.push(
            `blocks[${i}].${block.type} contains banned phrase: ${phrase}`,
          );
        }
      }
    }
  }
  if (hits.length > 0) {
    throw new Error(
      `CIE plan contains banned phrases:\n  - ${hits.join("\n  - ")}`,
    );
  }
}

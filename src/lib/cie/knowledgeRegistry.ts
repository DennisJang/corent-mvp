// CoRent Interactive Experience — Knowledge Registry v1.
//
// Plan:
//   docs/corent_interactive_experience_architecture.md (§4.3
//   "Knowledge layer", §5 "Knowledge sources", §6 "UI block
//   orchestration", §7 "Tool orchestration").
//
// Purpose:
//
//   A typed, deterministic, server-and-client-safe registry of
//   safe product knowledge cards. Each card declares (a) the
//   product's allowed framing for one audience × surface × intent
//   triple, (b) the bounded set of UI blocks the surface may
//   render, and (c) the bounded set of related actions. The
//   registry is the static foundation that future CIE
//   orchestrators (deterministic planner first, mock LLM
//   afterwards) read to decide what to render and what tools to
//   propose.
//
// Hard rules pinned in this file:
//
//   - Pure data + pure helpers. No I/O, no env reads, no network,
//     no Supabase, no LLM provider, no payment / claim / trust /
//     handoff / notifications. The registry is a TypeScript
//     module; importing it is free.
//   - Closed vocabularies. Audience / Surface / Intent /
//     AllowedBlock / RelatedAction are `as const` arrays whose
//     members type-narrow at the boundary. Adding a new value is
//     a deliberate edit reviewed in PR.
//   - Banlist clean. Every `title` / `safeSummary` / member of
//     `allowedClaims` and `forbiddenClaims` is scanned against
//     the closed-alpha banlist by the registry test. The
//     `forbiddenClaims` field describes forbidden CONCEPTS (e.g.
//     "active payment-completion phrasing") in language that
//     itself avoids the literal banned phrases — so the registry
//     is unconditionally safe to load anywhere, including a
//     future LLM context window.
//   - DTO discipline. The registry never carries raw prompts /
//     bodies / messages / system fields; never carries
//     borrowerId / sellerId / profileId / contactEmail /
//     exactAddress / trustScore / payment / settlement slots.
//     The shape itself has no slot for any of those.
//   - Provenance: `"deterministic"` only. The CIE architecture
//     reserves `"llm_candidate"` for the LLM-channel candidates
//     elsewhere; this registry is on the deterministic side.
//
// What this module is NOT:
//
//   - It is NOT a runtime UI surface. The components on /, /search,
//     /listings/[id], /requests, /dashboard, /admin/cockpit do
//     not import this registry yet. Wiring is a future slice.
//   - It is NOT a vector DB or RAG pipeline. The architecture's
//     §11 "Phase A — structured registries (MVP)" is exactly
//     this. Embeddings + vector store are a future, separately
//     gated phase.

// ---------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------

export const CIE_AUDIENCES = [
  "visitor",
  "borrower",
  "seller",
  "founder",
] as const;
export type CIEAudience = (typeof CIE_AUDIENCES)[number];

export const CIE_SURFACES = [
  "home",
  "search",
  "listing_detail",
  "requests",
  "dashboard",
  "admin_cockpit",
] as const;
export type CIESurface = (typeof CIE_SURFACES)[number];

export const CIE_INTENT_KINDS = [
  "try_before_buy",
  "find_listing",
  "leave_wanted_request",
  "create_listing",
  "review_request_status",
  "seller_improve_listing",
  "founder_review_demand",
] as const;
export type CIEIntentKind = (typeof CIE_INTENT_KINDS)[number];

// Closed UI block ids — aligned with the architecture's §6.1
// allowed block-type vocabulary. The orchestrator emits block
// recipes typed by these ids; the deterministic renderer (future
// slice) is the only thing that turns a block id into DOM.
export const CIE_ALLOWED_BLOCKS = [
  "intent_summary",
  "try_criteria",
  "listing_matches",
  "wanted_request_cta",
  "listing_readiness",
  "request_status",
  "seller_readiness",
  "founder_feedback_review",
  "safety_note",
] as const;
export type CIEAllowedBlock = (typeof CIE_ALLOWED_BLOCKS)[number];

// Closed related-action ids — aligned with the architecture's §7
// tool list. Each id wraps an existing action OR a deferred
// future tool (suffixed `_future`). The orchestrator dispatches
// by id; this registry only declares which actions a card may
// reference.
export const CIE_RELATED_ACTIONS = [
  "search_listings",
  "derive_try_criteria",
  "create_wanted_request",
  "create_rental_request",
  "create_seller_draft",
  "show_request_status",
  "show_seller_demand_signals_future",
  "update_feedback_status",
] as const;
export type CIERelatedAction = (typeof CIE_RELATED_ACTIONS)[number];

export type CIEProvenance = "deterministic";

// ---------------------------------------------------------------
// Card shape
// ---------------------------------------------------------------

export type CIEKnowledgeCard = {
  // Stable, kebab/snake string. Caller-facing keys never include
  // user identity, secrets, or anything outside the closed
  // identifier vocabulary.
  id: string;
  audience: CIEAudience;
  surfaces: ReadonlyArray<CIESurface>;
  intentKind: CIEIntentKind;
  // Short Korean caption for the card's wedge framing. Banlist
  // clean.
  title: string;
  // 1–3 sentence Korean summary. Banlist clean. May negate banned
  // concepts (e.g. "지금 단계에서는 결제·픽업·정산이 시작되지
  // 않아요") but never contains the banned literal phrase itself.
  safeSummary: string;
  // Phrases the surface IS permitted to render to the user. Each
  // entry is closed-vocabulary Korean.
  allowedClaims: ReadonlyArray<string>;
  // Forbidden CONCEPTS, described in language that itself avoids
  // the literal banned phrase. Future surfaces reading the
  // registry can union these with the global banlist for stricter
  // outbound copy validation.
  forbiddenClaims: ReadonlyArray<string>;
  // Allowed UI blocks for this card's surface × intent. The
  // orchestrator may not emit a block whose id is not listed
  // here; the registry's narrowing is the second line of defense
  // after the global block-id allowlist.
  suggestedBlocks: ReadonlyArray<CIEAllowedBlock>;
  // Allowed related actions. Subset of `CIE_RELATED_ACTIONS`.
  // Empty array means "informational only — no tool dispatch".
  relatedActions: ReadonlyArray<CIERelatedAction>;
  provenance: CIEProvenance;
};

// ---------------------------------------------------------------
// v1 cards
// ---------------------------------------------------------------

const CARDS: ReadonlyArray<CIEKnowledgeCard> = [
  {
    id: "home_try_before_buy_entry",
    audience: "visitor",
    surfaces: ["home"],
    intentKind: "try_before_buy",
    title: "사기 전에 며칠 써보기",
    safeSummary:
      "홈에서 자연어로 무엇을 사기 전에 며칠 써보고 싶은지 적으면, 카테고리·기간·지역으로 정리해 검색으로 안내해요. 자동으로 매칭되거나 결제가 시작되지는 않아요.",
    allowedClaims: [
      "입력한 고민을 체험 기준으로 정리해요",
      "맞는 매물이 없으면 신호를 남길 수 있어요",
      "지금 단계에서는 결제·픽업·정산이 시작되지 않아요",
    ],
    forbiddenClaims: [
      "automatic matching promise",
      "active payment-completion phrasing",
      "regulated coverage vocabulary",
      "verified-seller-style language",
    ],
    suggestedBlocks: ["intent_summary", "try_criteria"],
    relatedActions: ["search_listings", "derive_try_criteria"],
    provenance: "deterministic",
  },
  {
    id: "search_intent_summary",
    audience: "visitor",
    surfaces: ["search"],
    intentKind: "find_listing",
    title: "입력한 고민을 체험 기준으로 정리",
    safeSummary:
      "검색 페이지 상단에서 입력한 자연어를 카테고리·기간·지역·예상 가격으로 보여주고, 카테고리에 맞는 구매 전 확인 항목을 함께 안내해요.",
    allowedClaims: [
      "입력한 고민을 체험 기준으로 정리했어요",
      "결과를 보면서 카테고리를 조정할 수 있어요",
      "맞는 매물이 없으면 아래에서 신호를 남길 수 있어요",
    ],
    forbiddenClaims: [
      "automatic matching promise",
      "active payment-completion phrasing",
      "exact pickup address",
      "borrower contact disclosure",
    ],
    suggestedBlocks: [
      "intent_summary",
      "try_criteria",
      "listing_matches",
      "wanted_request_cta",
    ],
    relatedActions: [
      "search_listings",
      "derive_try_criteria",
      "create_wanted_request",
    ],
    provenance: "deterministic",
  },
  {
    id: "search_empty_wanted_request",
    audience: "visitor",
    surfaces: ["search"],
    intentKind: "leave_wanted_request",
    title: "써보고 싶다고 알리기",
    safeSummary:
      "검색 결과가 없을 때 같은 물건을 가진 셀러가 보면 다시 안내드릴 수 있도록 신호를 남길 수 있어요. 자동으로 매칭되거나 결제가 시작되지는 않아요.",
    allowedClaims: [
      "같은 물건을 가진 셀러가 보면 다시 안내드려요",
      "응답이 있을 때만 이메일을 사용해요",
      "자동으로 매칭되거나 결제가 시작되지는 않아요",
    ],
    forbiddenClaims: [
      "seller-match assurance promise",
      "active payment-completion phrasing",
      "borrower contact exposure to sellers",
      "exact address collection",
    ],
    suggestedBlocks: ["wanted_request_cta", "intent_summary"],
    relatedActions: ["create_wanted_request"],
    provenance: "deterministic",
  },
  {
    id: "listing_readiness",
    audience: "borrower",
    surfaces: ["listing_detail"],
    intentKind: "try_before_buy",
    title: "구매 전 확인할 수 있는 것",
    safeSummary:
      "리스팅 상세에서 카테고리에 맞는 사용감 확인 항목과 요청 전 점검 항목, 책임 기준을 자동 정리해 보여줘요. 셀러 응답 전에 다시 확인할 수 있어요.",
    allowedClaims: [
      "사용 중 이상이나 분실이 발생하면 셀러와 책임 기준에 따라 협의해요",
      "정확한 책임 기준은 셀러 응답 후 다시 안내돼요",
      "지금 단계에서는 결제·픽업·정산이 시작되지 않아요",
    ],
    forbiddenClaims: [
      "regulated coverage vocabulary",
      "active payment-completion phrasing",
      "rental-confirmed phrasing",
      "exact pickup address",
      "borrower contact disclosure",
    ],
    suggestedBlocks: ["listing_readiness", "try_criteria", "safety_note"],
    relatedActions: ["derive_try_criteria", "create_rental_request"],
    provenance: "deterministic",
  },
  {
    id: "borrower_request_status",
    audience: "borrower",
    surfaces: ["requests"],
    intentKind: "review_request_status",
    title: "내 대여 요청 상태",
    safeSummary:
      "내가 보낸 요청의 셀러 응답 단계를 확인할 수 있어요. 셀러 수락 후에도 결제·픽업·정산은 별도 단계예요.",
    allowedClaims: [
      "셀러 응답을 기다리는 중",
      "셀러가 요청을 수락했어요",
      "아직 결제·픽업·정산은 시작되지 않았어요",
    ],
    forbiddenClaims: [
      "rental-confirmed phrasing",
      "active payment-completion phrasing",
      "settlement-completed phrasing",
      "deposit-amount disclosure",
    ],
    suggestedBlocks: ["request_status", "safety_note"],
    relatedActions: ["show_request_status"],
    provenance: "deterministic",
  },
  {
    id: "seller_listing_readiness",
    audience: "seller",
    surfaces: ["dashboard"],
    intentKind: "seller_improve_listing",
    title: "공개·요청 전 더 신뢰를 주려면",
    safeSummary:
      "셀러 대시보드에서 리스팅 상태에 맞춰 사진·구성품·수령 권역 점검 항목과 책임 기준 안내를 보여줘요. 보더의 신원이나 연락처는 보이지 않아요.",
    allowedClaims: [
      "사진·구성품·수령 권역을 먼저 확인해 주세요",
      "책임 기준은 예상 가치 기준으로 안내돼요",
      "보더의 신원이나 연락처는 이 화면에 보이지 않아요",
    ],
    forbiddenClaims: [
      "borrower contact disclosure on dashboard",
      "verified-seller-style language",
      "automatic matching promise",
      "active payment-completion phrasing",
    ],
    suggestedBlocks: ["seller_readiness", "safety_note"],
    relatedActions: ["create_seller_draft"],
    provenance: "deterministic",
  },
  {
    id: "founder_wanted_feedback_review",
    audience: "founder",
    surfaces: ["admin_cockpit"],
    intentKind: "founder_review_demand",
    title: "써보고 싶다는 신호 검토",
    safeSummary:
      "운영자 콕핏에서 wanted_item 행을 검토 완료 또는 보관 상태로 옮길 수 있어요. 보더 식별자와 이메일은 운영자에게만 보이고 셀러 화면에는 절대 노출되지 않아요.",
    allowedClaims: [
      "검토 완료",
      "보관",
      "보더의 연락 이메일은 운영자에게만 보여요",
      "셀러 화면에는 노출되지 않아요",
    ],
    forbiddenClaims: [
      "borrower contact disclosure to sellers",
      "automatic matching promise",
      "active payment-completion phrasing",
      "trust score language",
    ],
    suggestedBlocks: ["founder_feedback_review"],
    relatedActions: ["update_feedback_status"],
    provenance: "deterministic",
  },
  {
    id: "no_payment_yet_safety_note",
    audience: "visitor",
    surfaces: ["home", "search", "listing_detail", "requests", "dashboard"],
    intentKind: "try_before_buy",
    title: "지금 단계에서는 결제·정산이 시작되지 않아요",
    safeSummary:
      "베타에서는 결제·픽업·정산이 아직 연결되어 있지 않아요. 셀러 응답이 와도 다음 단계가 자동으로 시작되는 건 아니에요.",
    allowedClaims: [
      "베타에서는 결제·픽업·정산이 아직 연결되어 있지 않아요",
      "셀러 응답 이후 단계에서 안내돼요",
      "사용 중 이상이나 분실은 셀러와 책임 기준에 따라 협의해요",
    ],
    forbiddenClaims: [
      "active payment-completion phrasing",
      "rental-confirmed phrasing",
      "settlement-completed phrasing",
      "deposit-amount disclosure",
      "regulated coverage vocabulary",
    ],
    suggestedBlocks: ["safety_note"],
    relatedActions: [],
    provenance: "deterministic",
  },
];

// ---------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------

export function listCIEKnowledgeCards(): ReadonlyArray<CIEKnowledgeCard> {
  return CARDS;
}

export function getCIEKnowledgeCard(
  id: string,
): CIEKnowledgeCard | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return CARDS.find((c) => c.id === id) ?? null;
}

export type CIEKnowledgeCardFilter = {
  audience?: CIEAudience;
  surface?: CIESurface;
  intentKind?: CIEIntentKind;
};

export function findCIEKnowledgeCards(
  filter: CIEKnowledgeCardFilter = {},
): ReadonlyArray<CIEKnowledgeCard> {
  return CARDS.filter((c) => {
    if (filter.audience && c.audience !== filter.audience) return false;
    if (filter.surface && !c.surfaces.includes(filter.surface)) return false;
    if (filter.intentKind && c.intentKind !== filter.intentKind) return false;
    return true;
  });
}

export function listCIEAllowedBlocks(): ReadonlyArray<CIEAllowedBlock> {
  return CIE_ALLOWED_BLOCKS;
}

export function listCIERelatedActions(): ReadonlyArray<CIERelatedAction> {
  return CIE_RELATED_ACTIONS;
}

// ---------------------------------------------------------------
// Validators
// ---------------------------------------------------------------

export type CIEKnowledgeRegistryValidationResult =
  | { ok: true }
  | { ok: false; errors: ReadonlyArray<string> };

const ALLOWED_AUDIENCES = new Set<CIEAudience>(CIE_AUDIENCES);
const ALLOWED_SURFACES = new Set<CIESurface>(CIE_SURFACES);
const ALLOWED_INTENT_KINDS = new Set<CIEIntentKind>(CIE_INTENT_KINDS);
const ALLOWED_BLOCKS = new Set<CIEAllowedBlock>(CIE_ALLOWED_BLOCKS);
const ALLOWED_ACTIONS = new Set<CIERelatedAction>(CIE_RELATED_ACTIONS);

// Pure structural validator. Confirms (a) ids are unique +
// non-empty, (b) every audience / surface / intentKind / block /
// action membership is in the closed vocabulary, (c) title /
// safeSummary are non-empty, (d) provenance is exactly
// "deterministic". Returns a structured result so a future
// runtime caller can render its own degraded-mode message
// without throwing. The test layer calls this and asserts ok.
export function validateCIEKnowledgeRegistry(
  cards: ReadonlyArray<CIEKnowledgeCard> = CARDS,
): CIEKnowledgeRegistryValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const c of cards) {
    if (!c.id || typeof c.id !== "string") {
      errors.push("card has empty/invalid id");
      continue;
    }
    if (seenIds.has(c.id)) {
      errors.push(`duplicate card id: ${c.id}`);
    }
    seenIds.add(c.id);
    if (!c.title || c.title.trim().length === 0) {
      errors.push(`${c.id}: title is empty`);
    }
    if (!c.safeSummary || c.safeSummary.trim().length === 0) {
      errors.push(`${c.id}: safeSummary is empty`);
    }
    if (!ALLOWED_AUDIENCES.has(c.audience)) {
      errors.push(`${c.id}: audience '${c.audience}' is not allowed`);
    }
    if (!Array.isArray(c.surfaces) || c.surfaces.length === 0) {
      errors.push(`${c.id}: surfaces must be a non-empty array`);
    } else {
      for (const s of c.surfaces) {
        if (!ALLOWED_SURFACES.has(s)) {
          errors.push(`${c.id}: surface '${s}' is not allowed`);
        }
      }
    }
    if (!ALLOWED_INTENT_KINDS.has(c.intentKind)) {
      errors.push(`${c.id}: intentKind '${c.intentKind}' is not allowed`);
    }
    if (!Array.isArray(c.allowedClaims)) {
      errors.push(`${c.id}: allowedClaims must be an array`);
    }
    if (!Array.isArray(c.forbiddenClaims)) {
      errors.push(`${c.id}: forbiddenClaims must be an array`);
    }
    if (!Array.isArray(c.suggestedBlocks)) {
      errors.push(`${c.id}: suggestedBlocks must be an array`);
    } else {
      for (const b of c.suggestedBlocks) {
        if (!ALLOWED_BLOCKS.has(b)) {
          errors.push(`${c.id}: suggestedBlock '${b}' is not allowed`);
        }
      }
    }
    if (!Array.isArray(c.relatedActions)) {
      errors.push(`${c.id}: relatedActions must be an array`);
    } else {
      for (const a of c.relatedActions) {
        if (!ALLOWED_ACTIONS.has(a)) {
          errors.push(`${c.id}: relatedAction '${a}' is not allowed`);
        }
      }
    }
    if (c.provenance !== "deterministic") {
      errors.push(`${c.id}: provenance must be 'deterministic'`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Throws if any title / safeSummary / allowedClaim / forbidden-
// claim contains a literal banned phrase. The banlist is passed
// in by the caller — test files own the banlist data so the
// registry stays purely structural. A future runtime caller
// (e.g. an admin self-check page) can pass in the same banlist.
export function assertNoBannedClaimsInKnowledgeRegistry(
  bannedPhrases: ReadonlyArray<string>,
  cards: ReadonlyArray<CIEKnowledgeCard> = CARDS,
): void {
  const hits: string[] = [];
  for (const c of cards) {
    const fields: ReadonlyArray<{ label: string; value: string }> = [
      { label: "title", value: c.title },
      { label: "safeSummary", value: c.safeSummary },
      ...c.allowedClaims.map((claim, i) => ({
        label: `allowedClaims[${i}]`,
        value: claim,
      })),
      ...c.forbiddenClaims.map((claim, i) => ({
        label: `forbiddenClaims[${i}]`,
        value: claim,
      })),
    ];
    for (const f of fields) {
      for (const phrase of bannedPhrases) {
        if (f.value.includes(phrase)) {
          hits.push(`${c.id}.${f.label} contains banned phrase: ${phrase}`);
        }
      }
    }
  }
  if (hits.length > 0) {
    throw new Error(
      `CIE knowledge registry contains banned phrases:\n  - ${hits.join(
        "\n  - ",
      )}`,
    );
  }
}

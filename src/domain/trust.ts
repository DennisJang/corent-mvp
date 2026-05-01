// CoRent Return Trust Layer — foundation types.
//
// Status: types only. No write paths, no services, no UI yet. The
// shapes here are the contract a future PR can persist behind a real
// adapter without re-thinking the model.
//
// Read order:
//   1. docs/corent_return_trust_layer.md — product context
//   2. docs/mvp_security_guardrails.md — auth + write-path rules that
//      every future trust write must follow
//   3. src/lib/stateMachines/rentalIntentMachine.ts — the existing
//      19-state RentalIntent lifecycle these types attach to
//
// Hard rules these types preserve:
//   - No PII expansion. No phone, full address, RRN, GPS, or payment
//     credential is implied by any shape here.
//   - No regulated-language fields. There is no "insurance", "coverage",
//     "guarantee", "escrow" concept anywhere in this module.
//   - All ids are strings. The format depends on the persistence
//     backend; the in-memory adapter uses `<prefix>_<random>` and the
//     Phase 2 Supabase adapter requires UUIDs (its own validators
//     reject anything else).

import type { RentalIntentStatus } from "@/domain/intents";

// --------------------------------------------------------------
// HandoffPhase — the moment in the rental at which evidence is
// recorded. The pickup phase happens before `paid → pickup_confirmed`
// and the return phase happens around `return_pending → return_confirmed`.
// --------------------------------------------------------------

export type HandoffPhase = "pickup" | "return";

// --------------------------------------------------------------
// HandoffChecks — five boolean flags captured during a pickup or a
// return. Mirrors the user-facing labels in
// src/lib/copy/returnTrust.ts (HANDOFF_RITUAL_COPY.checklist). Kept
// flat so a future schema change can map each flag to a typed
// evidence row without renaming.
//
// Phase 1.2 ships these as transient (in-memory only). Persistence
// of HandoffRecord is intentionally deferred to keep this PR scoped
// to types + service helpers + copy.
// --------------------------------------------------------------

export type HandoffChecks = {
  mainUnit: boolean;     // 본체 확인
  components: boolean;   // 구성품 확인
  working: boolean;      // 작동 확인
  appearance: boolean;   // 외관 상태 확인
  preexisting: boolean;  // 기존 하자 확인
};

export const EMPTY_HANDOFF_CHECKS: HandoffChecks = {
  mainUnit: false,
  components: false,
  working: false,
  appearance: false,
  preexisting: false,
};

export const HANDOFF_CHECKLIST_KEYS = [
  "mainUnit",
  "components",
  "working",
  "appearance",
  "preexisting",
] as const satisfies ReadonlyArray<keyof HandoffChecks>;

export type HandoffChecklistKey = (typeof HANDOFF_CHECKLIST_KEYS)[number];

// --------------------------------------------------------------
// HandoffRecord — single record per (rentalIntent, phase). Holds the
// five checks plus per-actor confirmation flags and optional
// short-text note + manual evidence URL. There is intentionally no
// upload / file pipeline; manualEvidenceUrl is a bounded string that
// the seller or borrower may paste in if they captured evidence
// elsewhere. The future evidence pipeline replaces this slot.
// --------------------------------------------------------------

export type HandoffRecord = {
  id: string;
  rentalIntentId: string;
  phase: HandoffPhase;
  checks: HandoffChecks;
  confirmedBySeller: boolean;
  confirmedByBorrower: boolean;
  // Optional short-text note. Bounded by the handoff service.
  note?: string;
  // Optional URL to evidence stored elsewhere. Bounded; the service
  // requires `http://` or `https://`. There is no upload pipeline.
  manualEvidenceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

// --------------------------------------------------------------
// EvidenceType — the kind of artefact captured at a handoff. Mirrors
// the boolean flags already on `VerificationChecks` so a future schema
// change can promote each to a typed evidence row without renaming.
// `note_text` is bounded short-text only; the upload pipeline (photo
// blob storage) is gated by docs/corent_security_gate_note.md and is
// NOT in scope for this PR.
// --------------------------------------------------------------

export type EvidenceType =
  | "photo_front"
  | "photo_back"
  | "photo_components"
  | "photo_safety_code"
  | "photo_working_proof"
  | "photo_damage"
  | "note_text";

// --------------------------------------------------------------
// TrustEvent — append-only log of trust-relevant actions on a rental.
// Sibling concept to RentalEvent, which logs status transitions; a
// TrustEvent logs trust signals that may or may not coincide with a
// status change (e.g. the seller approved before payment, the
// borrower recorded pickup evidence, the seller reported a condition
// issue inside the claim window).
//
// `evidenceRefs` is an opaque list of ids the future evidence store
// can resolve. Today it is empty.
// --------------------------------------------------------------

export type TrustEventType =
  | "seller_approved_request"
  | "borrower_acknowledged_pickup"
  | "pickup_evidence_recorded"
  | "return_evidence_recorded"
  | "return_confirmed_by_seller"
  | "condition_match_recorded"
  | "condition_issue_reported"
  | "admin_review_started"
  | "admin_decision_recorded"
  | "claim_window_opened"
  | "claim_window_closed";

export type TrustEventActor = "seller" | "borrower" | "admin" | "system";

export type TrustEvent = {
  id: string;
  rentalIntentId: string;
  type: TrustEventType;
  at: string;
  actor: TrustEventActor;
  // Optional handoff phase — present on pickup/return-related events.
  handoffPhase?: HandoffPhase;
  // Forward-compatible references to evidence rows. Empty in Phase 1.
  evidenceRefs?: string[];
  // Short, bounded annotation. The future server-side validator will
  // cap this aggressively; the type stays a plain string here so the
  // in-memory and Phase 2 paths share the shape.
  notes?: string;
  // Bounded structured metadata for reconciliation. Used by
  // `admin_decision_recorded` to carry `claimReviewId`, `decision`,
  // and `decidedBy` so the audit log can be reconciled with the
  // claim review row without a join. Each entry is a string key →
  // string value; the service layer caps both. Phase 1.10.
  metadata?: Record<string, string>;
};

// --------------------------------------------------------------
// ClaimWindow — sibling concept to the rental status. Opens when a
// return is confirmed; closes either when the seller flags an issue
// or when the timer expires. The closure decides whether the rental
// proceeds straight to settlement or routes through admin review.
//
// This is NOT a rental status — the existing RentalIntent state
// machine already covers the post-return states. The window tracks
// the inspection period that runs in parallel.
// --------------------------------------------------------------

export type ClaimWindowStatus =
  | "open"
  | "closed_no_claim"
  | "closed_with_claim";

export type ClaimWindow = {
  id: string;
  rentalIntentId: string;
  status: ClaimWindowStatus;
  openedAt: string;
  // ISO 8601 timestamp at which the window auto-closes if no claim
  // arrives. Phase 1 default: openedAt + 24h. Future: tier-dependent.
  closesAt: string;
  closedAt?: string;
  // Bounded reason text on close. Optional. Never echoes PII.
  closeReason?: string;
};

// --------------------------------------------------------------
// ClaimReview — admin review skeleton. When a claim window closes
// with `closed_with_claim`, a ClaimReview row is opened so an admin
// can record a placeholder decision. The status vocabulary is
// intentionally small: `open` (waiting on admin), `approved` (claim
// upheld), `rejected` (claim dismissed), `needs_review` (admin asked
// for more information; treated as still-open at the dashboard).
//
// This is a SKELETON layer. A decision here:
//   - DOES NOT trigger any payment, deposit forfeiture, refund,
//     escrow movement, or PG call. There is no money path here.
//   - DOES NOT auto-advance the rental status. The existing
//     `rentalIntentMachine` is unchanged.
//   - DOES NOT auto-block, auto-limit, or auto-score the borrower
//     or seller. Only the `accountStanding` field on
//     `UserTrustSummary` reflects admin standing, and that is
//     manual-only.
//
// The decision is stored as state + emits a `TrustEvent` of type
// `admin_decision_recorded`. Real dispute automation, deposit
// handling, and legal adjudication are explicitly out of scope.
// --------------------------------------------------------------

export type ClaimReviewStatus =
  | "open"
  | "approved"
  | "rejected"
  | "needs_review";

export type ClaimReview = {
  id: string;
  rentalIntentId: string;
  // The ClaimWindow this review was opened from. A review without a
  // backing window is invalid; the service layer enforces the link.
  claimWindowId: string;
  status: ClaimReviewStatus;
  openedAt: string;
  // Bounded short-text reason supplied by the seller when opening
  // the claim. Optional. Never echoes PII.
  openedReason?: string;
  // Admin who recorded the decision. Today this is the founder email
  // resolved by the admin auth boundary; in a future PR it becomes a
  // server-resolved admin user id.
  decidedBy?: string;
  decidedAt?: string;
  // Bounded short-text annotation written by the admin. Optional.
  decisionNotes?: string;
};

// --------------------------------------------------------------
// BorrowerUnlockLevel — derived, not stored as a privilege. Drives
// copy variations and (later) the conditional-soft-hold decision.
// --------------------------------------------------------------

export type BorrowerUnlockLevel =
  | "new"
  | "verified_basic"
  | "returner"
  | "trusted";

// --------------------------------------------------------------
// RecommendedDepositTier — the *recommendation* surface for the
// conditional soft hold. Phase 1 ships no hold; this is a typed
// placeholder so a future PR can light up an admin recommendation UI
// without redesigning the trust profile shape. Any actual hold is
// delegated to a licensed PG partner; see
// docs/corent_legal_trust_architecture_note.md.
// --------------------------------------------------------------

export type RecommendedDepositTier =
  | "none"
  | "low"
  | "standard"
  | "high"
  | "manual_review";

// --------------------------------------------------------------
// UserTrustProfile — derived per-user summary. Treat every instance
// as advisory; never trust a client-submitted profile.
// --------------------------------------------------------------

export type UserTrustProfile = {
  userId: string;
  // Lifetime counts, derived from rental history.
  successfulReturns: number;
  // 0..1 — how often pickup and return evidence matched without
  // an admin escalation. Derived from TrustEvents.
  conditionMatchRate: number;
  // 0..1 — how often the user (typically the seller) responded to
  // a request inside the documented response window.
  responseRate: number;
  unlockLevel: BorrowerUnlockLevel;
  recommendedDepositTier: RecommendedDepositTier;
  // ISO 8601 timestamp of the most recent successful return; used
  // for the "최근 정상 반납" copy on a future profile/storefront.
  lastSuccessfulReturnAt?: string;
};

// --------------------------------------------------------------
// AccountStanding — manual administrative state for a user. The
// summary helper NEVER changes this automatically; only an admin
// surface (future PR) may move a user out of `"normal"`. The MVP
// posture is "process trust, not enforcement" — automatic blocking
// is explicitly out of scope.
// --------------------------------------------------------------

export type AccountStanding = "normal" | "limited" | "blocked";

// --------------------------------------------------------------
// UserTrustSummary — count-only derived view, intentionally smaller
// than `UserTrustProfile`. There is no scoring, no tier, no unlock
// level here. Phase 1.4 ships counts of known TrustEvent types so
// surfaces (seller dashboard, future storefront) can render simple
// "how many returns has this user successfully completed?" hints.
//
// The `userId` is the user the summary is computed for. Counts are
// scoped to events whose rental has the user as seller OR borrower.
// `damageReportsAgainst` is scoped to events tied to rentals where
// the user is the SELLER (i.e. the issue was reported about them).
// --------------------------------------------------------------

export type UserTrustSummary = {
  userId: string;
  successfulReturns: number;
  pickupConfirmedCount: number;
  returnConfirmedCount: number;
  conditionCheckCompletedCount: number;
  disputesOpened: number;
  damageReportsAgainst: number;
  accountStanding: AccountStanding;
};

export const EMPTY_USER_TRUST_SUMMARY: Omit<UserTrustSummary, "userId"> = {
  successfulReturns: 0,
  pickupConfirmedCount: 0,
  returnConfirmedCount: 0,
  conditionCheckCompletedCount: 0,
  disputesOpened: 0,
  damageReportsAgainst: 0,
  accountStanding: "normal",
};

// Visibility rule (Phase 1.8): both the seller dashboard and the
// public storefront render only the four success-side tiles
// (`successfulReturns`, `pickupConfirmedCount`, `returnConfirmedCount`,
// `conditionCheckCompletedCount`). They MUST share a single rule for
// "is the trust history block worth showing?" — using hidden metrics
// (`disputesOpened`, `damageReportsAgainst`) to decide visibility
// would render an all-zero block for visitors. The helper below is
// the single source of truth.
export function hasVisibleTrustHistory(
  summary: Pick<
    UserTrustSummary,
    | "successfulReturns"
    | "pickupConfirmedCount"
    | "returnConfirmedCount"
    | "conditionCheckCompletedCount"
  >,
): boolean {
  return (
    summary.successfulReturns +
      summary.pickupConfirmedCount +
      summary.returnConfirmedCount +
      summary.conditionCheckCompletedCount >
    0
  );
}

// --------------------------------------------------------------
// Re-export RentalIntentStatus so callers can write
// `import { type RentalIntentStatus } from "@/domain/trust";` when
// they need both trust types and rental status without two imports.
// --------------------------------------------------------------

export type { RentalIntentStatus };

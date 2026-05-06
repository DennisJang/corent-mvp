// Shared marketplace intelligence — domain types (Bundle 4, Slice 1).
//
// Why this module exists:
//
//   CoRent's matching surface — search, detail, future seller store,
//   future dashboard assistant — needs a single shape it can read
//   and render. Ship the SHAPE first, deterministic. The eventual
//   Listing LLM, Seller Store LLM, Renter Intent LLM, Dashboard
//   Assistant, and Matching Assistant all converge on the same
//   typed signals; only the upstream generator changes from
//   `deterministic` to `llm_candidate` (or `human_reviewed`).
//
// Ground rules — encoded in the type system, not just docs:
//
//   - Every signal carries a `provenance` field. Surfaces inspect
//     it so a deterministic hint never gets rendered with the same
//     authority as a human-reviewed one. Surfaces SHOULD soften copy
//     for `deterministic` and `llm_candidate` provenance.
//
//   - "Canonical facts" do NOT live in this module. Category, price,
//     pickup area, status — those stay on `PublicListing` /
//     `RentalIntent` / `Profile`. This module is for derived
//     signals only. The mapper guarantees we never re-emit a
//     canonical fact through an intelligence channel.
//
//   - No private fields. Generators run on already-sanitized DTOs
//     (`PublicListing`, `SearchIntent`, etc.) so by construction we
//     cannot leak `rawSellerInput`, `privateSerialNumber`,
//     `verification.*`, payment / settlement / admin notes, or
//     trust internals.
//
//   - No status / payment / verification authority. Tags and
//     reasons describe *fit*, never *guarantee*. The copy banlist
//     in the surfaces enforces this; the type system reinforces it
//     by not even having slots for "verified", "guaranteed",
//     "approved fee" etc.
//
//   - Persistence is OUT OF SCOPE for this slice. Nothing in this
//     module touches a database. A future slice may persist
//     `human_reviewed` signals; the type already names the channel
//     so that landing is a non-breaking add.

import type { CategoryId } from "@/domain/categories";

// Where a signal came from. Surfaces inspect this to choose copy
// strength and to decide whether to render the signal at all.
//
//   - `deterministic`     — pure-function output over safe DTOs.
//                           Stable, repeatable, cheap. Never claims
//                           authority. The default in this slice.
//   - `llm_candidate`     — proposed by an upstream LLM, NOT yet
//                           reviewed. Surfaces should mark these as
//                           candidates and never as facts.
//   - `human_reviewed`    — reviewed and accepted by a founder /
//                           ops human. Surfaces may render these
//                           with slightly stronger copy than
//                           `deterministic` — but never as
//                           guarantees.
//
// `llm_candidate` and `human_reviewed` channels are reserved here
// but never produced in this slice. The deterministic generator is
// the only producer.
export type SignalProvenance =
  | "deterministic"
  | "llm_candidate"
  | "human_reviewed";

// Bounded vocabulary for the kind of usage a listing supports. We
// keep this CLOSED so a generator can never invent a new tag at
// runtime and surfaces can render every tag with calm copy.
//
// Future categories may add tags here; new tags should always be
// reviewable in PR (no string-from-LLM admitted into this enum).
export type ListingUseCaseTag =
  | "try_before_buy"
  | "home_recovery"
  | "home_workout"
  | "home_care_routine"
  | "short_trial"
  | "weekly_trial";

// Coarse seller-side classification, derived from how many listings
// a seller has and how concentrated their category mix is. The
// intent is to power a future "store" surface; today it is a hint
// only.
//
//   - `casual`       — 0–1 active listing.
//   - `repeat_light` — 2–3 active listings.
//   - `micro_store`  — 4+ active listings, optionally
//                      concentrated in one category.
export type SellerStoreType = "casual" | "repeat_light" | "micro_store";

// Reasons a listing fits a renter's parsed intent. Free-text but
// strictly bounded by length so a copy regression cannot smuggle
// an authority phrase into the surface. Surfaces apply a banlist
// on top of this length cap.
export type MatchReason = {
  // Short Korean caption. Bounded length is enforced by the
  // generator (≤ 32 chars). Examples: "마포 픽업", "1일 체험에
  // 적합", "구매 전 체험".
  label: string;
  provenance: SignalProvenance;
};

// Things a renter should double-check before requesting. Same shape
// as `MatchReason` but a different channel — surfaces render them
// in a separate calm block ("확인할 점") so a renter is never
// misled into reading them as match reasons.
export type CautionReason = {
  label: string;
  provenance: SignalProvenance;
};

// Per-listing derived signal, computed from a sanitized
// `PublicListing` only. Never references private fields by
// construction.
export type ListingIntelligenceSignal = {
  publicListingId: string;
  category: CategoryId;
  useCases: ListingUseCaseTag[];
  // Coarse pickup area string, mirrored from the listing. We
  // duplicate it here so consumers can reason about pickup-fit
  // without re-reading the listing.
  pickupArea: string;
  provenance: SignalProvenance;
};

// Per-seller derived signal. Only requires the seller id and the
// list of that seller's already-sanitized public listings. No
// `profiles` row, no auth, no private contact info.
export type SellerStoreIntelligenceSignal = {
  sellerId: string;
  storeType: SellerStoreType;
  // Total of the seller's *public* listings counted into the
  // classification. Hidden / draft / rejected listings are NOT
  // counted because the generator only sees `PublicListing[]`.
  publicListingCount: number;
  // Categories represented in the seller's public listings, sorted
  // by frequency descending. Bounded to first 3 entries.
  categoryFocus: CategoryId[];
  // Pickup areas seen across the seller's public listings. Sorted
  // alphabetically; bounded to first 3 entries.
  pickupAreas: string[];
  provenance: SignalProvenance;
};

// Per-renter (or per-search) intent signal derived from a parsed
// `SearchIntent` only. Captures coarse renter intent tags that
// future matching can score against listing use-cases.
export type RenterIntentSignal = {
  // The intent id from the SearchIntent, echoed for debugging /
  // future analytics. Never a renter UUID.
  searchIntentId: string;
  intentTags: ListingUseCaseTag[];
  provenance: SignalProvenance;
};

// Per-(intent, listing) match explanation. Surfaces render the
// reasons + cautions side by side in calm copy. Order is
// stable (deterministic generator output is sorted by reason
// kind).
export type MatchExplanation = {
  publicListingId: string;
  searchIntentId: string;
  reasons: MatchReason[];
  cautions: CautionReason[];
  provenance: SignalProvenance;
};

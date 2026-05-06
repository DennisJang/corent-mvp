// Deterministic seller-side listing readiness card (Bundle 4 Slice 7).
//
// Sister surface to the borrower-facing
// `tryBeforeBuyReadinessService` — but rendered on /dashboard for
// the SELLER. Helps a seller see what would make their listings
// feel more trustworthy to a borrower BEFORE the borrower has to
// ask. The panel is advisory and category-aware; it never claims a
// listing is "approved" or "verified" beyond what its row status
// already says.
//
// What this slice deliberately does NOT do:
//
//   - It does NOT widen `SellerDashboardListing`. The DTO carries
//     `category` and `status` already; the panel renders advisory
//     RECOMMENDATIONS (which don't require knowing whether the
//     field is already filled) plus a status-aware caption. A
//     future slice can widen the DTO with `condition`,
//     `components`, `pickupArea`, `estimatedValue` for per-field
//     "ready vs missing" assessment — but only after a deliberate
//     scope decision.
//
//   - It does NOT include `보증` / `보험` / `보장` / `결제 완료` /
//     `대여 확정` / `환불` / `정산 완료` anywhere in its output.
//     The vocabulary is closed and reviewed in PR; tests pin the
//     banlist.
//
//   - It does NOT read raw seller input, the private serial
//     number, admin notes, listing secrets, payment / settlement
//     internals, borrower-side fields, or trust internals. The
//     input shape simply has no slot for any of them.

import { type CategoryId } from "@/domain/categories";
import type { ListingStatus } from "@/domain/intents";

export type SellerListingReadinessProvenance = "deterministic";

// Minimal allowlisted view of one seller-owned listing for the
// panel. Mirrors the subset of `SellerDashboardListing` that the
// generator actually reads. Adding a field here is a deliberate
// decision.
export type SellerListingReadinessListing = {
  category: CategoryId;
  status: ListingStatus;
};

export type SellerListingReadinessInput = {
  listings: ReadonlyArray<SellerListingReadinessListing>;
};

export type SellerListingReadinessCard = {
  // What the seller can already CONSIDER ready — informational
  // copy derived from row counts. Never makes a verification or
  // trust claim beyond what the row's `status` already says.
  readyChecks: string[];
  // Advisory recommendations grouped from category-specific +
  // universal nudges. Sorted alphabetically for byte-stable
  // output.
  missingOrRecommendedChecks: string[];
  // Static framing — "책임 기준은 예상 가치 기준으로 안내돼요."
  // Never references "보증금" / "보증" / "보험" / "보장".
  responsibilityBasisLabel: string;
  // Status-aware caption explaining where in the publication
  // pipeline the seller's listings are. Calm copy only.
  publicationReadinessCaption: string;
  provenance: SellerListingReadinessProvenance;
};

const PROVENANCE: SellerListingReadinessProvenance = "deterministic";

// Closed vocabulary of category-specific recommendations. Surfaces
// render whichever ones the seller's listing categories trigger.
// Adding a new category means adding a calm recommendation here
// and a corresponding test case.
const CATEGORY_RECOMMENDATIONS: Record<CategoryId, string> = {
  massage_gun: "충전 어댑터·파우치 등 구성품 사진을 함께 등록해 주세요.",
  home_care: "동봉되는 소모품·액세서리를 사진과 함께 명시해 주세요.",
  exercise: "조립이 필요하면 조립 후 사진을 함께 등록해 주세요.",
  vacuum: "흡입력·배터리 지속 시간을 사진과 함께 적어 주세요.",
  projector: "투사 거리·해상도를 사진과 함께 적어 주세요.",
  camera: "셔터 횟수·렌즈 호환 정보를 적어 주세요.",
  camping: "수납·이동 사진을 함께 등록해 주세요.",
};

// Universal recommendations always added regardless of category.
// Calm, advisory copy.
const UNIVERSAL_RECOMMENDATIONS: string[] = [
  "수령 권역을 역·동 단위로 명시해 주세요.",
  "사용감과 눈에 띄는 흠집을 솔직히 적어 주세요.",
  "사진은 정면·측면·구성품을 모두 포함하면 좋아요.",
];

// Calm caption used when listings array is empty.
const EMPTY_CAPTION =
  "리스팅을 1개 이상 등록한 뒤 공개 검토를 받게 돼요.";
// Calm caption used when at least one row is in any pre-approved
// pipeline state.
const PENDING_CAPTION =
  "검토 중·초안 리스팅이 있어요. 운영자 검토 후 공개되면 다시 안내돼요.";
// Calm caption used when every row has cleared the publication
// gate. We do NOT say "보증" / "보험" / "보장" here.
const ALL_APPROVED_CAPTION =
  "모든 리스팅이 공개되어 있어요. 추천 항목을 정기적으로 다시 확인해 주세요.";

const PRE_APPROVED_STATUSES: ReadonlySet<ListingStatus> = new Set<
  ListingStatus
>([
  "draft",
  "ai_extracted",
  "verification_incomplete",
  "human_review_pending",
]);

export function deriveSellerListingReadiness(
  input: SellerListingReadinessInput,
): SellerListingReadinessCard {
  const listings = input.listings ?? [];
  const total = listings.length;
  const approvedCount = listings.filter((l) => l.status === "approved").length;
  const preApprovedCount = listings.filter((l) =>
    PRE_APPROVED_STATUSES.has(l.status),
  ).length;
  const rejectedCount = listings.filter(
    (l) => l.status === "rejected",
  ).length;

  // Ready checks — informational only. Surfaces a count line and,
  // when relevant, a separate rejected-listing line so the seller
  // is not surprised.
  const readyChecks: string[] = [];
  if (total === 0) {
    readyChecks.push("아직 등록된 리스팅이 없어요.");
  } else {
    readyChecks.push(`${total}개 리스팅 중 ${approvedCount}개가 공개됐어요.`);
    if (rejectedCount > 0) {
      readyChecks.push(
        `${rejectedCount}개 리스팅은 운영자 검토에서 보류됐어요.`,
      );
    }
  }

  // Missing / recommended checks — category-specific + universal,
  // deduped + sorted for byte-stable output.
  const recommendations = new Set<string>(UNIVERSAL_RECOMMENDATIONS);
  const seenCategories = new Set<CategoryId>();
  for (const l of listings) {
    if (seenCategories.has(l.category)) continue;
    seenCategories.add(l.category);
    const rec = CATEGORY_RECOMMENDATIONS[l.category];
    if (rec) recommendations.add(rec);
  }
  const missingOrRecommendedChecks = [...recommendations].sort();

  // Publication caption — status-aware, calm copy.
  let publicationReadinessCaption: string;
  if (total === 0) {
    publicationReadinessCaption = EMPTY_CAPTION;
  } else if (preApprovedCount > 0) {
    publicationReadinessCaption = PENDING_CAPTION;
  } else {
    publicationReadinessCaption = ALL_APPROVED_CAPTION;
  }

  return {
    readyChecks,
    missingOrRecommendedChecks,
    responsibilityBasisLabel:
      "책임 기준은 예상 가치 기준으로 안내돼요.",
    publicationReadinessCaption,
    provenance: PROVENANCE,
  };
}

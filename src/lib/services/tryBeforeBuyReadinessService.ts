// Deterministic try-before-buy readiness card (Bundle 4 Slice 6).
//
// Pure function. No I/O, no env vars, no LLM call. Derives a small,
// non-authoritative card from the SAFE PublicListing-shaped fields
// the renter already sees (category / pickup area / free-text
// condition / estimated value). The card frames CoRent's wedge —
// "사기 전에 며칠 써보기" — by stating concretely what the renter
// can validate on this listing before deciding to buy, plus what
// they should double-check before requesting.
//
// Hard rules — encoded in this file:
//
//   - Inputs are SAFE FIELDS ONLY. The function never sees raw
//     seller input, private notes, exact address, listing
//     secrets, admin notes, payment / settlement internals, or
//     trust internals. The shape below has no slot for any of
//     them.
//
//   - Outputs are short Korean captions drawn from a closed
//     vocabulary. The category-specific points are reviewed in
//     PR; the surface applies a banlist on top.
//
//   - Banned phrases (regulated language, payment-completion
//     copy): "보증", "보험", "보장", "결제 완료", "대여 확정",
//     "환불", "정산 완료". Tests pin this; surfaces also re-assert.
//
//   - Provenance is `"deterministic"` only. The
//     `human_reviewed` and `llm_candidate` channels are reserved
//     in `@/domain/marketplaceIntelligence` for future slices.

import type { CategoryId } from "@/domain/categories";
import { formatKRW } from "@/lib/format";

export type TryBeforeBuyReadinessProvenance = "deterministic";

export type TryBeforeBuyReadinessInput = {
  category: CategoryId;
  // Coarse pickup area string (≤ 60 chars at the DB level).
  // Echoed into one of the "확인할 점" rows so the renter is
  // reminded to confirm reachability. Empty / whitespace falls
  // through to a generic copy.
  pickupArea: string;
  // Public free-text condition copy ("사용감 적음", "거의 새것",
  // …). Used only as a substring match for the wear-hint.
  condition: string;
  // Estimated value in KRW. Used as the responsibility-basis
  // anchor only — never as a deposit, never as a charge, never
  // as a payment authority.
  estimatedValue: number;
};

export type TryBeforeBuyReadinessCard = {
  // What the renter can VALIDATE during the trial (category-aware
  // sensory checks). Bounded length, calm Korean copy.
  tryBeforeBuyPoints: string[];
  // What the renter should DOUBLE-CHECK before submitting a
  // request (pickup, condition, fit). Bounded length.
  checkBeforeRequest: string[];
  // Calm responsibility framing. NEVER "보증", "보험", "보장".
  // Always references "책임 기준" instead of "보증금".
  responsibilityCaption: string;
  // The anchor label for the responsibility basis — always
  // derived from the SAFE `estimatedValue` field. Surfaces render
  // it as a small caption, not as a charge or balance.
  responsibilityBasisLabel: string;
  // Always-on non-payment caption. Surfaces render it directly so
  // a renter never reads the card as a guarantee.
  nonPaymentCaption: string;
  provenance: TryBeforeBuyReadinessProvenance;
};

const PROVENANCE: TryBeforeBuyReadinessProvenance = "deterministic";

// Closed vocabulary of category-specific try-before-buy points.
// Every supported category must appear here. Disabled / future
// categories carry safe generic copy until enabled. Adding a new
// category is a deliberate decision — surfaces and tests both key
// off this map.
const TRY_POINTS_BY_CATEGORY: Record<CategoryId, string[]> = {
  massage_gun: [
    "진동 강도와 소음을 직접 확인할 수 있어요.",
    "손에 쥐었을 때 무게감을 짧게 느껴볼 수 있어요.",
    "충전·배터리 지속 시간을 미리 확인할 수 있어요.",
  ],
  home_care: [
    "피부·두피에 닿는 감촉을 직접 확인할 수 있어요.",
    "강도 단계가 본인에게 맞는지 짧게 시도해볼 수 있어요.",
    "작동 소음을 미리 들어볼 수 있어요.",
  ],
  exercise: [
    "반복 동작에서 흔들림이나 미끄러짐을 확인할 수 있어요.",
    "보관 공간에 들어가는지 직접 확인할 수 있어요.",
    "관절 부담이 어느 정도인지 짧게 시도해볼 수 있어요.",
  ],
  vacuum: [
    "흡입력과 소음을 직접 확인할 수 있어요.",
    "배터리 지속 시간과 무게를 느껴볼 수 있어요.",
  ],
  projector: [
    "밝기와 화질을 직접 확인할 수 있어요.",
    "팬 소음과 발열을 짧게 확인할 수 있어요.",
  ],
  camera: [
    "실제로 들었을 때 무게와 그립감을 확인할 수 있어요.",
    "메뉴 조작감과 셔터 반응을 짧게 확인할 수 있어요.",
  ],
  camping: [
    "설치 난이도와 무게를 미리 확인할 수 있어요.",
    "수납 후 부피가 본인 차·공간에 맞는지 확인할 수 있어요.",
  ],
};

// Generic fallback used when a future schema change widens
// `CategoryId` without updating the map above. The map is
// already total at the type level; this is defense in depth.
const GENERIC_TRY_POINTS: string[] = [
  "직접 사용하면서 본인에게 맞는지 확인할 수 있어요.",
  "사진만으로는 알기 어려운 무게·소음·감촉을 확인할 수 있어요.",
];

// "사용감" / "거의" / "보통" / "오래" / "헌" — coarse markers in
// the public condition copy that hint at wear. We surface a
// component-check nudge when any appears.
const WEAR_MARKERS = ["사용감", "보통", "오래", "헌"];

export function deriveTryBeforeBuyReadiness(
  input: TryBeforeBuyReadinessInput,
): TryBeforeBuyReadinessCard {
  // Try-before-buy points: closed-vocabulary lookup with a generic
  // fallback. We never invent a category-specific point at runtime
  // beyond what's reviewed in PR.
  const tryBeforeBuyPoints =
    TRY_POINTS_BY_CATEGORY[input.category] ?? GENERIC_TRY_POINTS;

  // Check-before-request: deterministic projection of the safe
  // fields. Sorted only for stable React keys; copy stays calm.
  const checks: string[] = [];
  checks.push("구성품과 동봉 자료를 사진과 다시 비교해 주세요.");

  const condition = (input.condition ?? "").toString();
  if (WEAR_MARKERS.some((marker) => condition.includes(marker))) {
    checks.push("사용감 정도를 사진과 다시 비교해 주세요.");
  }

  const pickupArea = (input.pickupArea ?? "").toString().trim();
  if (pickupArea.length > 0) {
    checks.push(
      `픽업 권역(${pickupArea})까지 직접 이동 가능한지 확인해 주세요.`,
    );
  } else {
    checks.push("픽업 권역과 일정이 본인에게 가능한지 확인해 주세요.");
  }

  checks.push("1일·3일·7일 중 본인에게 맞는 기간을 골라 주세요.");

  // Responsibility basis label — anchor on the safe estimatedValue
  // only. NEVER claims this is a deposit, charge, or guarantee.
  const safeValue =
    typeof input.estimatedValue === "number" &&
    Number.isFinite(input.estimatedValue) &&
    input.estimatedValue > 0
      ? Math.floor(input.estimatedValue)
      : null;
  const responsibilityBasisLabel =
    safeValue !== null
      ? `책임 기준: 예상 가치 ${formatKRW(safeValue)}`
      : "책임 기준: 예상 가치 정보 없음";

  // Calm responsibility caption. Avoids regulated language by
  // construction; the test pins the banlist.
  const responsibilityCaption =
    "사용 중 이상이나 분실이 발생하면 셀러와 책임 기준에 따라 협의하게 돼요. 정확한 책임 기준은 셀러 응답 후 다시 안내돼요.";

  const nonPaymentCaption =
    "아직 결제·픽업·정산은 시작되지 않아요. 요청 전 책임 기준을 다시 확인해요.";

  return {
    tryBeforeBuyPoints: [...tryBeforeBuyPoints],
    checkBeforeRequest: checks,
    responsibilityCaption,
    responsibilityBasisLabel,
    nonPaymentCaption,
    provenance: PROVENANCE,
  };
}

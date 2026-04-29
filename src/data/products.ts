// Mock product fixtures. Re-exports types from the domain layer so existing
// imports (`@/data/products`) keep working while the canonical types live
// in `@/domain/*`.
//
// Prices are derived from `estimatedValue` via the canonical pricing
// formula so the borrower-facing card price, the product detail page, the
// listing recommendation, and any RentalIntent created from the product
// can never disagree.

export type { CategoryId as Category } from "@/domain/categories";
export { CATEGORY_LABEL } from "@/domain/categories";
export type { DurationKey } from "@/domain/durations";
export { DURATIONS, DEFAULT_DURATION } from "@/domain/durations";
export type { Product } from "@/domain/products";

import type { Product } from "@/domain/products";
import { calculateRecommendedPriceTable } from "@/lib/pricing";

type ProductSeed = Omit<Product, "prices">;

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    id: "theragun-mini-2",
    name: "Theragun Mini 2세대",
    category: "massage_gun",
    estimatedValue: 280000,
    pickupArea: "서울 마포구 합정",
    region: "seoul",
    condition: "사용감 적음",
    components: ["본체", "충전 케이블", "휴대용 파우치", "기본 헤드 1종"],
    defects: "외관 미세한 잔기스 1개. 작동 이상 없음.",
    sellerId: "seller_jisu",
    sellerName: "지수",
    sellerTrustNote: "최근 30일 내 등록, 본인 확인 완료",
    trust: {
      photoVerified: true,
      safetyCode: "B-428",
      humanReviewed: true,
      serialOnFile: true,
    },
    summary:
      "구매 전에 며칠 써보고 결정하기 좋은 모델. 휴대성 위주, 강한 진동보다는 일상 회복용.",
    hero: { initials: "TM" },
  },
  {
    id: "dyson-supersonic",
    name: "Dyson Supersonic 헤어드라이어",
    category: "home_care",
    estimatedValue: 520000,
    pickupArea: "서울 강남구 역삼",
    region: "seoul",
    condition: "거의 새것",
    components: ["본체", "스무딩 노즐", "스타일링 콘센트레이터", "디퓨저"],
    defects: "없음",
    sellerId: "seller_minho",
    sellerName: "민호",
    sellerTrustNote: "리뷰 12건, 평균 응답 18분",
    trust: {
      photoVerified: true,
      safetyCode: "C-194",
      humanReviewed: true,
      serialOnFile: true,
    },
    summary:
      "구매가 부담스러운 프리미엄 드라이어를 일주일 살아보기 좋은 옵션. 모발 손상 체감을 직접 확인.",
    hero: { initials: "DS" },
  },
  {
    id: "tonal-band-set",
    name: "스마트 저항밴드 세트",
    category: "exercise",
    estimatedValue: 110000,
    pickupArea: "서울 송파구 잠실",
    region: "seoul",
    condition: "사용감 보통",
    components: ["저항밴드 3종", "도어 앵커", "운동 가이드"],
    defects: "고무 표면에 작은 마찰 자국. 강도 변화 없음.",
    sellerId: "seller_sumin",
    sellerName: "수민",
    sellerTrustNote: "본인 확인 완료, 최근 7일 내 사진",
    trust: {
      photoVerified: true,
      safetyCode: "A-072",
      humanReviewed: true,
      serialOnFile: false,
    },
    summary:
      "홈트 입문자에게 적당. 사기 전에 3일 정도 써보고 본인 운동 루틴에 맞는지 점검.",
    hero: { initials: "RB" },
  },
  {
    id: "hyperice-hypervolt",
    name: "Hyperice Hypervolt Go 2",
    category: "massage_gun",
    estimatedValue: 240000,
    pickupArea: "서울 성동구 성수",
    region: "seoul",
    condition: "사용감 적음",
    components: ["본체", "충전 어댑터", "헤드 2종"],
    defects: "없음",
    sellerId: "seller_gayeong",
    sellerName: "가영",
    sellerTrustNote: "리뷰 6건, 모든 거래 정상 반납",
    trust: {
      photoVerified: true,
      safetyCode: "D-551",
      humanReviewed: true,
      serialOnFile: true,
    },
    summary:
      "테라건과 비교해보고 싶은 사용자에게 추천. 강도 3단계, 휴대성 우수.",
    hero: { initials: "HV" },
  },
  {
    id: "lg-styler",
    name: "LG 스타일러 미니",
    category: "home_care",
    estimatedValue: 690000,
    pickupArea: "서울 용산구 한남",
    region: "seoul",
    condition: "거의 새것",
    components: ["본체", "전용 옷걸이 2개"],
    defects: "없음",
    sellerId: "seller_eunwoo",
    sellerName: "은우",
    sellerTrustNote: "1회 사용, 본인 확인 완료",
    trust: {
      photoVerified: true,
      safetyCode: "E-302",
      humanReviewed: true,
      serialOnFile: true,
    },
    summary: "구매 전 일주일 살아보고 의류 관리 효과를 직접 확인.",
    hero: { initials: "LS" },
  },
  {
    id: "compact-rower",
    name: "컴팩트 로잉머신",
    category: "exercise",
    estimatedValue: 320000,
    pickupArea: "서울 영등포구 여의도",
    region: "seoul",
    condition: "사용감 보통",
    components: ["본체", "사용 가이드"],
    defects: "프레임 도색 가벼운 벗겨짐. 작동 이상 없음.",
    sellerId: "seller_dohyeon",
    sellerName: "도현",
    sellerTrustNote: "리뷰 4건",
    trust: {
      photoVerified: true,
      safetyCode: "F-118",
      humanReviewed: true,
      serialOnFile: false,
    },
    summary:
      "홈 카디오 장비를 구매 전 시험. 거주 공간에 어울리는지 7일 동안 검증.",
    hero: { initials: "CR" },
  },
];

export const PRODUCTS: Product[] = PRODUCT_SEEDS.map((seed) => ({
  ...seed,
  prices: calculateRecommendedPriceTable(seed.estimatedValue),
}));

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

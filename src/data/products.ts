export type Category = "massage_gun" | "home_care" | "exercise";

export const CATEGORY_LABEL: Record<Category, string> = {
  massage_gun: "마사지건",
  home_care: "홈케어 기기",
  exercise: "소형 운동기구",
};

export type DurationKey = "1d" | "3d" | "7d";

export const DURATIONS: { key: DurationKey; days: number; label: string }[] = [
  { key: "1d", days: 1, label: "1일" },
  { key: "3d", days: 3, label: "3일" },
  { key: "7d", days: 7, label: "7일" },
];

export const DEFAULT_DURATION: DurationKey = "3d";

export type Product = {
  id: string;
  name: string;
  category: Category;
  estimatedValue: number;
  prices: Record<DurationKey, number>;
  pickupArea: string;
  condition: string;
  components: string[];
  defects: string;
  sellerName: string;
  sellerTrustNote: string;
  trust: {
    photoVerified: boolean;
    safetyCode: string;
    humanReviewed: boolean;
    serialOnFile: boolean;
  };
  summary: string;
  hero: { initials: string };
};

export const PRODUCTS: Product[] = [
  {
    id: "theragun-mini-2",
    name: "Theragun Mini 2세대",
    category: "massage_gun",
    estimatedValue: 280000,
    prices: { "1d": 9800, "3d": 22400, "7d": 42000 },
    pickupArea: "서울 마포구 합정",
    condition: "사용감 적음",
    components: ["본체", "충전 케이블", "휴대용 파우치", "기본 헤드 1종"],
    defects: "외관 미세한 잔기스 1개. 작동 이상 없음.",
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
    prices: { "1d": 18200, "3d": 41600, "7d": 78000 },
    pickupArea: "서울 강남구 역삼",
    condition: "거의 새것",
    components: ["본체", "스무딩 노즐", "스타일링 콘센트레이터", "디퓨저"],
    defects: "없음",
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
    prices: { "1d": 3900, "3d": 8800, "7d": 16500 },
    pickupArea: "서울 송파구 잠실",
    condition: "사용감 보통",
    components: ["저항밴드 3종", "도어 앵커", "운동 가이드"],
    defects: "고무 표면에 작은 마찰 자국. 강도 변화 없음.",
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
    prices: { "1d": 8400, "3d": 19200, "7d": 36000 },
    pickupArea: "서울 성동구 성수",
    condition: "사용감 적음",
    components: ["본체", "충전 어댑터", "헤드 2종"],
    defects: "없음",
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
    prices: { "1d": 24000, "3d": 55200, "7d": 103500 },
    pickupArea: "서울 용산구 한남",
    condition: "거의 새것",
    components: ["본체", "전용 옷걸이 2개"],
    defects: "없음",
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
    prices: { "1d": 11200, "3d": 25600, "7d": 48000 },
    pickupArea: "서울 영등포구 여의도",
    condition: "사용감 보통",
    components: ["본체", "사용 가이드"],
    defects: "프레임 도색 가벼운 벗겨짐. 작동 이상 없음.",
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

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

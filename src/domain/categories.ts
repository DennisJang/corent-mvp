// Category registry. Adding a new category should never require rewriting the
// app — only flipping `enabled`, adding keywords, and seeding products.

export type CategoryId =
  | "massage_gun"
  | "home_care"
  | "exercise"
  | "vacuum"
  | "projector"
  | "camera"
  | "camping";

export type CategoryDef = {
  id: CategoryId;
  label: string;
  englishLabel: string;
  enabled: boolean;
  keywords: string[];
};

export const CATEGORIES: CategoryDef[] = [
  {
    id: "massage_gun",
    label: "마사지건",
    englishLabel: "Massage gun",
    enabled: true,
    keywords: [
      "마사지건",
      "마사지 건",
      "테라건",
      "theragun",
      "hypervolt",
      "하이퍼볼트",
      "massage gun",
    ],
  },
  {
    id: "home_care",
    label: "홈케어 기기",
    englishLabel: "Home-care device",
    enabled: true,
    keywords: [
      "홈케어",
      "ems",
      "저주파",
      "헤어드라이어",
      "스타일러",
      "다이슨",
      "dyson",
      "home care",
    ],
  },
  {
    id: "exercise",
    label: "소형 운동기구",
    englishLabel: "Small exercise equipment",
    enabled: true,
    keywords: [
      "운동기구",
      "폼롤러",
      "저항밴드",
      "로잉",
      "로잉머신",
      "fitness",
      "exercise",
      "rower",
    ],
  },
  // Future categories — disabled in MVP, structure already in place.
  {
    id: "vacuum",
    label: "청소기",
    englishLabel: "Vacuum cleaner",
    enabled: false,
    keywords: ["청소기", "vacuum"],
  },
  {
    id: "projector",
    label: "프로젝터",
    englishLabel: "Projector",
    enabled: false,
    keywords: ["프로젝터", "projector"],
  },
  {
    id: "camera",
    label: "카메라",
    englishLabel: "Camera",
    enabled: false,
    keywords: ["카메라", "camera"],
  },
  {
    id: "camping",
    label: "캠핑 장비",
    englishLabel: "Camping gear",
    enabled: false,
    keywords: ["캠핑", "camping"],
  },
];

export const ENABLED_CATEGORIES = CATEGORIES.filter((c) => c.enabled);

export const CATEGORY_LABEL: Record<CategoryId, string> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.id] = c.label;
    return acc;
  },
  {} as Record<CategoryId, string>,
);

export function getCategory(id: CategoryId): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function isCategoryEnabled(id: CategoryId): boolean {
  return getCategory(id)?.enabled ?? false;
}

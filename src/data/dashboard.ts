// Legacy demo fixture — only the listed-items table on /dashboard still
// reads from this file. Everything else (summary stats, pending requests,
// active rentals) is now derived from RentalIntents in the persistence
// adapter via `lib/services/dashboardService.ts`.
//
// Keep this around until per-product analytics (views, monthly rentals)
// have a real source; do not extend it.

export type ListedItem = {
  id: string;
  productName: string;
  status: "심사 중" | "게시됨" | "비공개";
  views: number;
  rentalsThisMonth: number;
};

export const LISTED_ITEMS: ListedItem[] = [
  {
    id: "lst_01",
    productName: "Theragun Mini 2세대",
    status: "게시됨",
    views: 142,
    rentalsThisMonth: 4,
  },
  {
    id: "lst_02",
    productName: "Hyperice Hypervolt Go 2",
    status: "게시됨",
    views: 88,
    rentalsThisMonth: 2,
  },
  {
    id: "lst_03",
    productName: "스마트 저항밴드 세트",
    status: "게시됨",
    views: 53,
    rentalsThisMonth: 1,
  },
  {
    id: "lst_04",
    productName: "휴대용 폼롤러",
    status: "심사 중",
    views: 0,
    rentalsThisMonth: 0,
  },
  {
    id: "lst_05",
    productName: "야외용 미니 트램펄린",
    status: "비공개",
    views: 12,
    rentalsThisMonth: 0,
  },
];

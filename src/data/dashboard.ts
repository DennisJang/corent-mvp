export type RentalStatus =
  | "요청"
  | "승인"
  | "결제 대기"
  | "결제 완료"
  | "수령 완료"
  | "반납 대기"
  | "반납 확인"
  | "정산 완료";

export type PendingRequest = {
  id: string;
  productName: string;
  borrowerName: string;
  duration: string;
  amount: number;
  requestedAt: string;
};

export type ActiveRental = {
  id: string;
  productName: string;
  borrowerName: string;
  status: RentalStatus;
  returnDue: string;
};

export type ListedItem = {
  id: string;
  productName: string;
  status: "심사 중" | "게시됨" | "비공개";
  views: number;
  rentalsThisMonth: number;
};

export const SELLER = {
  name: "지수",
  trustScore: 4.8,
  reviewCount: 18,
};

export const DASHBOARD_SUMMARY = {
  monthlyEarnings: 412000,
  pendingSettlement: 86400,
  activeRentals: 3,
  pendingRequests: 2,
  listedItems: 5,
  returnsDueSoon: 1,
};

export const PENDING_REQUESTS: PendingRequest[] = [
  {
    id: "req_001",
    productName: "Theragun Mini 2세대",
    borrowerName: "현우",
    duration: "3일",
    amount: 22400,
    requestedAt: "30분 전",
  },
  {
    id: "req_002",
    productName: "스마트 저항밴드 세트",
    borrowerName: "지영",
    duration: "7일",
    amount: 16500,
    requestedAt: "2시간 전",
  },
];

export const ACTIVE_RENTALS: ActiveRental[] = [
  {
    id: "rnt_101",
    productName: "Theragun Mini 2세대",
    borrowerName: "민지",
    status: "수령 완료",
    returnDue: "내일 오후 6시",
  },
  {
    id: "rnt_102",
    productName: "Hyperice Hypervolt Go 2",
    borrowerName: "재현",
    status: "결제 완료",
    returnDue: "3일 후",
  },
  {
    id: "rnt_103",
    productName: "스마트 저항밴드 세트",
    borrowerName: "수아",
    status: "반납 대기",
    returnDue: "오늘 오후 8시",
  },
];

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

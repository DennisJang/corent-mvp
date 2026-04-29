import type { Seller } from "@/domain/sellers";

export const SELLERS: Seller[] = [
  {
    id: "seller_jisu",
    name: "지수",
    region: "seoul",
    trustScore: 4.8,
    reviewCount: 18,
    joinedAt: "2025-08-12",
    trustNote: "최근 30일 내 등록, 본인 확인 완료",
  },
  {
    id: "seller_minho",
    name: "민호",
    region: "seoul",
    trustScore: 4.9,
    reviewCount: 12,
    joinedAt: "2025-04-01",
    trustNote: "리뷰 12건, 평균 응답 18분",
  },
  {
    id: "seller_sumin",
    name: "수민",
    region: "seoul",
    trustScore: 4.7,
    reviewCount: 9,
    joinedAt: "2025-09-22",
  },
];

// The "current" mock seller used by the dashboard.
export const CURRENT_SELLER: Seller = SELLERS[0];

export function getSellerById(id: string): Seller | undefined {
  return SELLERS.find((s) => s.id === id);
}

// Reference-only ledger view. The numbers are computed from the pricing
// module so a borrower can see what the rental price + the conceptual
// breakdown LOOK like, but no money is actually charged, held, deducted,
// refunded, or settled in the beta. The component intentionally avoids
// active-money wording — every label is framed as 참고용 (reference-only)
// and the surrounding caption states the beta posture explicitly.

import type { RentalAmounts } from "@/domain/intents";
import { formatKRW } from "@/lib/format";

type PriceBreakdownProps = {
  amounts: RentalAmounts;
  showSellerSide?: boolean;
};

export function PriceBreakdown({
  amounts,
  showSellerSide = false,
}: PriceBreakdownProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-[color:var(--ink-60)]">
        베타: 실제 결제·보증금·정산·환불은 아직 연결되어 있지 않아요. 아래는
        참고용 표시예요.
      </p>
      <ul className="flex flex-col">
        <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
          <span className="text-small text-[color:var(--ink-60)]">대여료</span>
          <span className="text-body">{formatKRW(amounts.rentalFee)}</span>
        </li>
        <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
          <span className="text-small text-[color:var(--ink-60)]">
            안전 표시 (참고용)
          </span>
          <span className="text-body">
            {amounts.safetyDeposit === 0
              ? "표시 없음"
              : `${formatKRW(amounts.safetyDeposit)} · 청구·보관 없음`}
          </span>
        </li>
        <li className="flex items-baseline justify-between py-3 border-t border-black">
          <span className="text-small text-[color:var(--ink-60)]">
            예상 합계 (참고용)
          </span>
          <span className="text-h3 tracking-tight">
            {formatKRW(amounts.borrowerTotal)}
          </span>
        </li>
        {showSellerSide ? (
          <>
            <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
              <span className="text-small text-[color:var(--ink-60)]">
                예상 플랫폼 비율 (참고용, 미부과)
              </span>
              <span className="text-body">
                − {formatKRW(amounts.platformFee)}
              </span>
            </li>
            <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
              <span className="text-small text-[color:var(--ink-60)]">
                예상 판매자 몫 (참고용, 미지급)
              </span>
              <span className="text-body">
                {formatKRW(amounts.sellerPayout)}
              </span>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}

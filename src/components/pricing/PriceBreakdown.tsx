// Ledger-style breakdown of what the borrower pays and how it splits. All
// values are calculated from the pricing module — this is purely a view.

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
    <ul className="flex flex-col">
      <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
        <span className="text-small text-[color:var(--ink-60)]">대여료</span>
        <span className="text-body">{formatKRW(amounts.rentalFee)}</span>
      </li>
      <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
        <span className="text-small text-[color:var(--ink-60)]">
          안전 보증금
        </span>
        <span className="text-body">
          {amounts.safetyDeposit === 0
            ? "보증 없음"
            : `${formatKRW(amounts.safetyDeposit)} (반납 후 환급)`}
        </span>
      </li>
      <li className="flex items-baseline justify-between py-3 border-t border-black">
        <span className="text-small text-[color:var(--ink-60)]">
          결제 합계
        </span>
        <span className="text-h3 tracking-tight">
          {formatKRW(amounts.borrowerTotal)}
        </span>
      </li>
      {showSellerSide ? (
        <>
          <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
            <span className="text-small text-[color:var(--ink-60)]">
              플랫폼 수수료 10%
            </span>
            <span className="text-body">
              − {formatKRW(amounts.platformFee)}
            </span>
          </li>
          <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
            <span className="text-small text-[color:var(--ink-60)]">
              판매자 정산
            </span>
            <span className="text-body">
              {formatKRW(amounts.sellerPayout)}
            </span>
          </li>
        </>
      ) : null}
    </ul>
  );
}

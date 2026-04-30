import Link from "next/link";
import { CATEGORY_LABEL, type Product } from "@/data/products";
import {
  LISTING_CARD_COPY,
  formatFromOneDayPrice,
  formatPriceBreakdown,
} from "@/lib/copy/returnTrust";

type ProductCardProps = {
  product: Product;
};

// Card hierarchy follows docs/corent_return_trust_layer.md §3:
//   1. Try-before-buy framing (small caption above the title)
//   2. Product identity (title + category)
//   3. Return trust signal (condition-check + verified safety code)
//   4. Rental price, visually secondary (text-title, not text-h3;
//      "1일 ₩X부터" lead + small breakdown line)
//   5. Request / approval condition (caption near pickup info)
//
// Existing design tokens only — no new colors, no new sizes, no
// shadows. The price still appears clearly; it is just no longer the
// largest element on the card.
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/items/${product.id}`}
      className="group block bg-white border border-[color:var(--ink-12)] hover:border-black transition-colors focus-ring"
    >
      <div className="flex items-center justify-center w-full aspect-[4/3] border-b border-[color:var(--ink-12)] group-hover:border-black transition-colors">
        <span className="text-h1 tracking-tight">{product.hero.initials}</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-caption text-[color:var(--ink-60)]">
          <span>{CATEGORY_LABEL[product.category]}</span>
          <span>VERIFIED</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            {LISTING_CARD_COPY.tryBeforeBuy}
          </span>
          <h3 className="text-title">{product.name}</h3>
        </div>

        <ul className="flex flex-col gap-1 text-small text-[color:var(--ink-60)]">
          <li>{LISTING_CARD_COPY.conditionCheck}</li>
          <li className="text-black">안전 코드 사진 검증 완료</li>
        </ul>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1">
          <span className="text-title tracking-tight">
            {formatFromOneDayPrice(product.prices["1d"])}
          </span>
          <span className="text-small text-[color:var(--ink-60)]">
            {formatPriceBreakdown({
              threeDays: product.prices["3d"],
              sevenDays: product.prices["7d"],
            })}
          </span>
        </div>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1">
          <span className="text-small text-[color:var(--ink-60)]">
            {product.pickupArea} · 직접 수령
          </span>
          <span className="text-small text-[color:var(--ink-60)]">
            {LISTING_CARD_COPY.approvalRequired}
          </span>
        </div>
      </div>
    </Link>
  );
}

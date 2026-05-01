import Link from "next/link";
import { CATEGORY_LABEL } from "@/data/products";
import type { PublicListing } from "@/domain/listings";
import {
  LISTING_CARD_COPY,
  formatFromOneDayPrice,
  formatPriceBreakdown,
} from "@/lib/copy/returnTrust";

type ProductCardProps = {
  listing: PublicListing;
};

// Card hierarchy follows docs/corent_return_trust_layer.md §3:
//   1. Try-before-buy framing (small caption above the title)
//   2. Product identity (title + category)
//   3. Return trust signal (condition-check + verified safety code)
//   4. Rental price, visually secondary (text-title, not text-h3;
//      "1일 ₩X부터" lead + small breakdown line)
//   5. Request / approval condition (caption near pickup info)
//
// Phase 1.12 — accepts `PublicListing` directly. The component
// renders as a `<Link>` only when `detailHref` is set (i.e. the
// listing was projected from a static product). Approved persisted
// listings carry `detailHref: undefined` and render as a non-clickable
// `<div>` with the same visual structure — no public detail route
// exists for them in this slice.
export function ProductCard({ listing }: ProductCardProps) {
  const sharedClass =
    "group block bg-white border border-[color:var(--ink-12)] hover:border-black transition-colors focus-ring";

  const body = (
    <>
      <div className="flex items-center justify-center w-full aspect-[4/3] border-b border-[color:var(--ink-12)] group-hover:border-black transition-colors">
        <span className="text-h1 tracking-tight">{listing.hero.initials}</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-caption text-[color:var(--ink-60)]">
          <span>{CATEGORY_LABEL[listing.category]}</span>
          <span>{listing.isPersistedProjection ? "APPROVED" : "VERIFIED"}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-caption text-[color:var(--ink-60)]">
            {LISTING_CARD_COPY.tryBeforeBuy}
          </span>
          <h3 className="text-title">{listing.title}</h3>
        </div>

        <ul className="flex flex-col gap-1 text-small text-[color:var(--ink-60)]">
          <li>{LISTING_CARD_COPY.conditionCheck}</li>
          <li className="text-black">안전 코드 사진 검증 완료</li>
        </ul>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1">
          <span className="text-title tracking-tight">
            {formatFromOneDayPrice(listing.prices["1d"])}
          </span>
          <span className="text-small text-[color:var(--ink-60)]">
            {formatPriceBreakdown({
              threeDays: listing.prices["3d"],
              sevenDays: listing.prices["7d"],
            })}
          </span>
        </div>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1">
          <span className="text-small text-[color:var(--ink-60)]">
            {listing.pickupArea} · 직접 수령
          </span>
          <span className="text-small text-[color:var(--ink-60)]">
            {LISTING_CARD_COPY.approvalRequired}
          </span>
        </div>
      </div>
    </>
  );

  if (listing.detailHref) {
    return (
      <Link href={listing.detailHref} className={sharedClass}>
        {body}
      </Link>
    );
  }
  return (
    <div
      className={sharedClass}
      aria-label={`${listing.title} (공개 카드 — 상세 페이지 준비 중)`}
    >
      {body}
    </div>
  );
}

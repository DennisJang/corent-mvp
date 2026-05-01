// Public seller storefront — read-only.
//
// Server component. Renders the seller's public-facing identity, a
// short intro, the seller's listing cards (existing `ProductCard`,
// reused unchanged), the read-only disclaimer, and a
// trust-history block (the trust block is a client island because
// counts come from local persistence in this MVP).
//
// What this surface does NOT do:
//   - No edit / save / delete actions on the seller or any listing.
//   - No booking, payment, deposit, escrow, refund, or settlement.
//   - No claim opening, no admin action, no rental status mutation.
//   - No phone, email, address, or GPS exposure beyond the public
//     `region` and the existing trust note copy already shown in
//     listing cards.
//
// The visitor's only outbound action is the existing per-product
// link rendered by `ProductCard`, which goes to `/items/[id]`.

import { Badge } from "@/components/Badge";
import { ProductCard } from "@/components/ProductCard";
import { SellerStorefrontProfileOverlay } from "@/components/SellerStorefrontProfileOverlay";
import { SellerStorefrontTrustBlock } from "@/components/SellerStorefrontTrustBlock";
import { STOREFRONT_COPY } from "@/lib/copy/returnTrust";
import type { StorefrontView } from "@/lib/services/storefrontService";

export function SellerStorefront({ view }: { view: StorefrontView }) {
  const { seller, products, isFallback } = view;
  const intro = seller.trustNote ?? STOREFRONT_COPY.defaultIntro;

  return (
    <div className="container-main py-16">
      <header className="border-b border-black pb-4 mb-12 flex items-baseline justify-between">
        <span className="text-caption">{STOREFRONT_COPY.pageTag}</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          {seller.region === "seoul" ? "Seoul beta" : seller.region}
        </span>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-12 mb-16 items-start">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-caption text-[color:var(--ink-60)]">
              {STOREFRONT_COPY.introTitle}
            </span>
            <SellerStorefrontProfileOverlay
              sellerId={seller.id}
              fallbackName={seller.name}
              fallbackIntro={intro}
              enabled={!isFallback}
            />
          </div>
          {isFallback ? (
            <div className="flex flex-col gap-2 border border-dashed border-[color:var(--line-dashed)] px-4 py-3">
              <Badge variant="dashed">{STOREFRONT_COPY.fallbackTag}</Badge>
              <span className="text-small text-[color:var(--ink-60)]">
                {STOREFRONT_COPY.fallbackHint}
              </span>
            </div>
          ) : null}
          <span className="text-small text-[color:var(--ink-60)] border-t border-[color:var(--ink-12)] pt-4">
            {STOREFRONT_COPY.readOnlyNote}
          </span>
        </div>

        <SellerStorefrontTrustBlock sellerId={seller.id} />
      </section>

      <section>
        <header className="flex items-baseline justify-between border-b border-black pb-3 mb-6">
          <h2 className="text-h3">{STOREFRONT_COPY.listingsHeading}</h2>
          <span className="text-caption text-[color:var(--ink-60)]">
            {products.length}건
          </span>
        </header>
        {products.length === 0 ? (
          <div className="border border-dashed border-[color:var(--line-dashed)] px-6 py-12">
            <p className="text-body text-[color:var(--ink-60)]">
              {STOREFRONT_COPY.emptyListings}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

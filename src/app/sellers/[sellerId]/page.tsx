// Public seller storefront route. Read-only server component.
//
// 404s when the seller id is unknown to both the `Seller` mock list
// and the product seed. Otherwise renders the storefront via
// `<SellerStorefront />`. The data flow stays inside
// `getStorefrontView` so route-level concerns (404, static params)
// stay separate from the surface code.

import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SellerStorefront } from "@/components/SellerStorefront";
import {
  getStorefrontView,
  listStorefrontSellerIds,
} from "@/lib/services/storefrontService";

export function generateStaticParams() {
  return listStorefrontSellerIds().map((sellerId) => ({ sellerId }));
}

type PageProps = {
  params: Promise<{ sellerId: string }>;
};

export default async function SellerStorefrontPage({ params }: PageProps) {
  const { sellerId } = await params;
  const view = getStorefrontView(sellerId);
  if (!view) notFound();

  return (
    <PageShell>
      <SellerStorefront view={view} />
    </PageShell>
  );
}

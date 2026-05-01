"use client";

// Client island that overlays the persisted public-profile override
// onto the server-rendered storefront. The base seller name and intro
// are server-rendered for SEO + initial paint; this component reads
// the local override after hydration and swaps in the merged value
// only when the seller is canonical (not a fallback) and an override
// exists.
//
// Why a client island here: the public storefront route is statically
// generated, but `SellerProfileOverride` lives in localStorage. The
// override therefore cannot exist at render time and must be merged
// after hydration. Fallback / product-only sellers never reach this
// code path because the storefront sets `enabled={false}` for them.

import { useEffect, useState } from "react";
import { sellerProfileService } from "@/lib/services/sellerProfileService";

export function SellerStorefrontProfileOverlay({
  sellerId,
  fallbackName,
  fallbackIntro,
  enabled,
}: {
  sellerId: string;
  fallbackName: string;
  fallbackIntro: string;
  enabled: boolean;
}) {
  const [name, setName] = useState(fallbackName);
  const [intro, setIntro] = useState(fallbackIntro);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    sellerProfileService.getOverrideForSeller(sellerId).then((override) => {
      if (cancelled || !override) return;
      if (override.displayName) setName(override.displayName);
      if (override.publicNote) setIntro(override.publicNote);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId, enabled]);

  return (
    <>
      <h1 className="text-h1">{name}</h1>
      <p className="text-body text-[color:var(--ink-80)] max-w-[640px]">
        {intro}
      </p>
    </>
  );
}

// Bundle 2, Slice 2 — public detail route for an approved
// server-backed listing.
//
// This route is server-mode only:
//
//   - In mock / default backend mode the page 404s. The local-MVP
//     demo continues to use `/items/[id]` against the static
//     `PRODUCTS` fixture; `/listings/[listingId]` is the dedicated
//     server-only path so static and server data stay disjoint.
//
//   - In supabase mode the page reads the canonical listing through
//     `getServerApprovedPublicListingAction` and 404s on:
//       - malformed uuid in the URL,
//       - missing row,
//       - any non-`approved` status (no enumeration of draft / in-
//         review / rejected rows by trying ids in the URL bar),
//       - rows that fail the projection mapper's minimum-shape gate.
//
//   - Approved rows are projected through the existing allowlist
//     mapper before reaching the client component. The client
//     component receives a sanitized `PublicListing` DTO — never
//     a raw `ListingIntent`. The DTO has no slot for
//     `rawSellerInput`, `privateSerialNumber`, verification
//     internals, internal review notes, or any other private
//     field, so a future component edit cannot accidentally
//     widen the renter-facing surface.
//
//   - `dynamic = "force-dynamic"` skips static prerendering. The
//     listing's status / pricing can change at any time (founder
//     publish, founder unpublish in a future slice); a stale
//     prerender would risk surfacing a row that has since been
//     pulled.

import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ServerListingDetailClient } from "@/components/ServerListingDetailClient";
import { getServerApprovedPublicListingAction } from "@/server/listings/listPublicListings";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function PublicListingDetailPage({
  params,
}: PageProps) {
  const { listingId } = await params;
  const result = await getServerApprovedPublicListingAction(listingId);

  if (result.mode === "local") {
    // Mock / default backend: this route is a server-only path and
    // 404s in mock mode by design. The local demo path is
    // `/items/[id]`.
    notFound();
  }
  if (!result.listing) {
    notFound();
  }

  return (
    <PageShell>
      <ServerListingDetailClient listing={result.listing} />
    </PageShell>
  );
}

"use server";

// Slice A PR 5G — server action that returns the authenticated
// seller's own listings for the SellerDashboard listings table.
//
// Replaces the per-render local-only read for the server-mode
// path. The probe-driven `chatIntakeMode` from PR 5F still gates
// the client; this action is the authoritative server-side gate.
//
// Hard rules:
//
//   - The payload is empty. The seller id is NEVER read from the
//     client. Any `sellerId` / `profileId` / `role` / `capability`
//     a forged caller attaches is ignored — the handler reads
//     `actor.sellerId` from the resolved server actor only.
//
//   - Defaults to `{ mode: "local" }` on every uncertain branch:
//       - backend mode is not supabase
//       - actor source is not supabase (defense in depth — the
//         resolver will not mint a mock-sourced actor in supabase
//         mode, but we re-check)
//
//   - The DTO is a tight allowlist of dashboard-rendered fields.
//     `rawSellerInput`, extraction internals, `privateSerialNumber`,
//     internal review notes, and any other private slot are NOT
//     part of the shape and are never copied. The repository
//     mapper already excludes `privateSerialNumber`; this DTO
//     also excludes `verification.*` and `rawSellerInput`
//     explicitly so a future repo edit cannot accidentally widen
//     what reaches the client.
//
//   - Errors are typed and non-secret. Repo / db throws fall
//     through to the runner's generic `internal` mapping; this
//     module never returns table names, env values, SQL, row
//     payloads, or service-role hints.
//
// References:
//   - PR 5F probe action `src/server/intake/getChatIntakeMode.ts`
//   - PR 5E listing-draft writer dispatcher (same `(mode, source)`
//     decision table)
//   - `src/server/intents/intentCommand.ts` runner
//   - `src/server/persistence/supabase/listingRepository.ts`
//     `listListingsBySeller`

import type { CategoryId } from "@/domain/categories";
import type { ListingIntent } from "@/domain/intents";
import { getBackendMode } from "@/server/backend/mode";
import { listListingsBySeller } from "@/server/persistence/supabase/listingRepository";
import { runIntentCommand } from "@/server/intents/intentCommand";
import {
  intentErr,
  intentOk,
  type IntentResult,
} from "@/server/intents/intentResult";

// Tight DTO — only the fields the SellerDashboard listings table
// actually renders. Adding a field here is a deliberate decision;
// growing the surface widens the privacy contract.
export type SellerDashboardListing = {
  id: string;
  itemName: string;
  status: ListingIntent["status"];
  category: CategoryId;
  prices: {
    oneDay: number;
    threeDays: number;
    sevenDays: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type SellerOwnedListingsResult =
  | { mode: "local" }
  | { mode: "server"; listings: SellerDashboardListing[] };

// Empty payload. The seller id is resolved server-side from the
// actor; any client-supplied field is ignored.
export type ListSellerOwnedListingsPayload = Record<string, never>;

function projectForDashboard(intent: ListingIntent): SellerDashboardListing {
  return {
    id: intent.id,
    itemName: intent.item.name,
    status: intent.status,
    category: intent.item.category,
    prices: {
      oneDay: intent.pricing.oneDay,
      threeDays: intent.pricing.threeDays,
      sevenDays: intent.pricing.sevenDays,
    },
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export async function listSellerOwnedListingsAction(): Promise<
  IntentResult<SellerOwnedListingsResult>
> {
  return runIntentCommand<
    ListSellerOwnedListingsPayload,
    SellerOwnedListingsResult
  >(
    async ({ actor }) => {
      // Mock / default backend: never reach Supabase. Local-mode
      // dashboards keep their existing read path.
      if (getBackendMode() !== "supabase") {
        return intentOk({ mode: "local" });
      }
      // Defense in depth: the resolver does not mint a mock-sourced
      // actor in supabase mode, but we re-check before issuing the
      // service-role read so a future drift cannot route a mock
      // identity into a shared-DB query.
      if (actor.source !== "supabase") {
        return intentOk({ mode: "local" });
      }
      if (actor.kind !== "seller") {
        // The runner already enforces `expectedActorKind: "seller"`
        // and would have returned `ownership` upstream; this is the
        // belt for the suspenders.
        return intentErr("ownership", "only sellers can list own listings");
      }
      try {
        const rows = await listListingsBySeller(actor.sellerId);
        return intentOk({
          mode: "server",
          listings: rows.map(projectForDashboard),
        });
      } catch {
        return intentErr("internal", "list_seller_listings_failed");
      }
    },
    {} as ListSellerOwnedListingsPayload,
    { expectedActorKind: "seller", prefer: "seller" },
  );
}

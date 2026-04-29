// Phase 2 server-only marketplace aggregate reader. Returns counts only,
// never row-level data. Used by the founder admin dashboard's optional
// "DB readiness" panel and the dev-only DB health route. PII is not
// touched; the schema does not expose PII at the count level.

import { getMarketplaceClient } from "./client";

export type MarketplaceAggregates = {
  listings: {
    total: number;
    byStatus: Record<string, number>;
  };
  rentalIntents: {
    total: number;
    byStatus: Record<string, number>;
  };
  rentalEvents: {
    total: number;
  };
  adminReviews: {
    total: number;
    byStatus: Record<string, number>;
  };
  profiles: {
    total: number;
  };
};

async function countAll(table: string): Promise<number> {
  const client = getMarketplaceClient();
  if (!client) return 0;
  const { count } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function tally(
  table: string,
  column: string,
): Promise<Record<string, number>> {
  const client = getMarketplaceClient();
  if (!client) return {};
  const { data, error } = await client.from(table).select(column).limit(50_000);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const r of data as unknown as Record<string, unknown>[]) {
    const v = r[column];
    if (typeof v === "string") {
      counts[v] = (counts[v] ?? 0) + 1;
    }
  }
  return counts;
}

export async function readMarketplaceAggregates(): Promise<MarketplaceAggregates | null> {
  const client = getMarketplaceClient();
  if (!client) return null;

  const [
    listingsTotal,
    rentalIntentsTotal,
    rentalEventsTotal,
    adminReviewsTotal,
    profilesTotal,
    listingsByStatus,
    rentalIntentsByStatus,
    adminReviewsByStatus,
  ] = await Promise.all([
    countAll("listings"),
    countAll("rental_intents"),
    countAll("rental_events"),
    countAll("admin_reviews"),
    countAll("profiles"),
    tally("listings", "status"),
    tally("rental_intents", "status"),
    tally("admin_reviews", "status"),
  ]);

  return {
    listings: { total: listingsTotal, byStatus: listingsByStatus },
    rentalIntents: { total: rentalIntentsTotal, byStatus: rentalIntentsByStatus },
    rentalEvents: { total: rentalEventsTotal },
    adminReviews: { total: adminReviewsTotal, byStatus: adminReviewsByStatus },
    profiles: { total: profilesTotal },
  };
}

export type DbHealth = {
  backendMode: "mock" | "supabase";
  envReady: boolean;
  clientReady: boolean;
  // Aggregate counts. Always null when clientReady is false.
  aggregates: MarketplaceAggregates | null;
};

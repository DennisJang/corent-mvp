// Server-only aggregate queries for the founder admin dashboard. Reads
// only via the service-role Supabase client. Returns aggregate numbers,
// never row-level data; PII fields are not present on the schema by design.
//
// Returns `null` if the Supabase client cannot be created (env missing) so
// the page can render a clear "disabled" state instead of crashing.

import { getServiceRoleClient } from "@/server/analytics/supabase";

export type DashboardSummary = {
  totalEvents24h: number;
  totalEvents7d: number;
  totalEvents30d: number;
  rejections24h: number;
  consentDenied30d: number;
  byEventKind7d: { event_kind: string; count: number }[];
  byCategory7d: { category: string | null; count: number }[];
  byRegionCoarse7d: { region_coarse: string | null; count: number }[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export async function readDashboardSummary(): Promise<DashboardSummary | null> {
  const client = getServiceRoleClient();
  if (!client) return null;

  const since24h = isoAgo(DAY_MS);
  const since7d = isoAgo(7 * DAY_MS);
  const since30d = isoAgo(30 * DAY_MS);

  // Counts. We use head:true so Supabase returns counts without rows.
  const [c24h, c7d, c30d, rj24h, denied30d] = await Promise.all([
    client.from("growth_events").select("*", { count: "exact", head: true }).gte("at", since24h),
    client.from("growth_events").select("*", { count: "exact", head: true }).gte("at", since7d),
    client.from("growth_events").select("*", { count: "exact", head: true }).gte("at", since30d),
    client.from("sanitizer_rejections").select("*", { count: "exact", head: true }).gte("at", since24h),
    client
      .from("growth_events")
      .select("*", { count: "exact", head: true })
      .gte("at", since30d)
      .eq("event_kind", "analytics_denied"),
  ]);

  // Aggregations by enum. Done as small selects + client-side group; Phase 1
  // volume does not justify SQL views yet.
  const [byKind, byCat, byRegion] = await Promise.all([
    client
      .from("growth_events")
      .select("event_kind")
      .gte("at", since7d)
      .limit(50_000),
    client
      .from("growth_events")
      .select("category")
      .gte("at", since7d)
      .limit(50_000),
    client
      .from("growth_events")
      .select("region_coarse")
      .gte("at", since7d)
      .limit(50_000),
  ]);

  function tally<T extends string | null>(
    rows: { [k: string]: T }[] | null,
    key: string,
  ): { value: T; count: number }[] {
    const map = new Map<T, number>();
    for (const row of rows ?? []) {
      const v = row[key] as T;
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    return Array.from(map, ([value, count]) => ({ value, count })).sort(
      (a, b) => b.count - a.count,
    );
  }

  const kindRows = tally<string | null>(byKind.data ?? [], "event_kind");
  const catRows = tally<string | null>(byCat.data ?? [], "category");
  const regRows = tally<string | null>(byRegion.data ?? [], "region_coarse");

  return {
    totalEvents24h: c24h.count ?? 0,
    totalEvents7d: c7d.count ?? 0,
    totalEvents30d: c30d.count ?? 0,
    rejections24h: rj24h.count ?? 0,
    consentDenied30d: denied30d.count ?? 0,
    byEventKind7d: kindRows.map((r) => ({
      event_kind: (r.value ?? "unknown") as string,
      count: r.count,
    })),
    byCategory7d: catRows.map((r) => ({
      category: r.value as string | null,
      count: r.count,
    })),
    byRegionCoarse7d: regRows.map((r) => ({
      region_coarse: r.value as string | null,
      count: r.count,
    })),
  };
}

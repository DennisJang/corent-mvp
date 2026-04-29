// Dev-only DB health route. Founder-gated. Returns aggregate counts and
// boolean readiness signals for the Phase 2 marketplace schema. Never
// returns row-level data, never returns PII, never echoes env values.
//
// Hard rules:
//   - Founder allowlist required, same as the main admin pages. Missing
//     session, missing email, or non-allowlisted email → 404.
//   - Production is fail-closed: even an allowlisted founder gets 404
//     in production unless `CORENT_BACKEND_MODE=supabase` AND
//     `NODE_ENV !== 'production'`. We deliberately do NOT light up the
//     route in prod.
//   - When `getBackendMode() !== 'supabase'`, the route returns 200 with
//     `{ backendMode: 'mock', clientReady: false, aggregates: null }` so
//     a founder running without env can still see "the route exists,
//     the DB just isn't wired up here".

import { NextResponse } from "next/server";
import { requireFounderSession } from "@/server/admin/auth";
import { getBackendMode } from "@/server/backend/mode";
import { readSupabaseServerEnv } from "@/server/analytics/env";
import {
  readMarketplaceAggregates,
  type DbHealth,
} from "@/server/persistence/supabase";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  // Hard prod gate: never reachable in production. Even a founder
  // session in prod gets 404. The Phase 2 schema is dev-only.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const session = await requireFounderSession();
  if (!session) {
    return new NextResponse(null, { status: 404 });
  }

  const backendMode = getBackendMode();
  const envResult = readSupabaseServerEnv();
  const envReady = envResult.ok;

  const body: DbHealth = {
    backendMode,
    envReady,
    clientReady: backendMode === "supabase" && envReady,
    aggregates:
      backendMode === "supabase" && envReady
        ? await readMarketplaceAggregates()
        : null,
  };

  return NextResponse.json(body, { status: 200 });
}

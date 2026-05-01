// Server-side admin identity boundary for the claim review queue.
//
// Phase 1.10. The `/admin/claims` page is gated by
// `requireFounderSession()` and renders an `<AdminClaimsConsole />`
// client island. Decisions persist locally (mock storage) — but the
// `decidedBy` value MUST come from the server, not from a
// client-supplied prop. Otherwise the audit trail is meaningless: a
// tampered client could send any string.
//
// This route re-validates the founder session on every request and
// returns ONLY the canonical email. Missing / non-allowlisted /
// otherwise-failed sessions return 404 (fail-closed, identical to
// the page route, never 401 to avoid disclosing the admin surface).
//
// The client island fetches this endpoint before each decision and
// uses the returned email as `decidedBy`. If the fetch fails, the
// decision buttons stay disabled.

import { NextResponse } from "next/server";
import { requireFounderSession } from "@/server/admin/auth";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await requireFounderSession();
  if (!session) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({ email: session.email });
}

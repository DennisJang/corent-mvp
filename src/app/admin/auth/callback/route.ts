// Phase 1.5 — Supabase magic-link callback for the founder admin.
//
// Supabase Auth sends the founder a magic link whose redirect URL points
// at this route with `?code=<one-time-code>`. We exchange that code for a
// session via the SSR client (which writes the session cookies via the
// `setAll` cookie handler), then redirect to `/admin/dashboard` (or to a
// safe `next` path under `/admin`).
//
// Security:
//   - Anon key only (via `createAdminAuthClient`). No service-role key.
//   - No tokens, codes, session data, or emails are logged. We log only
//     a coarse error code via the redacting logger.
//   - `next` is validated against `safeAdminNextPath` to prevent
//     open-redirects.
//   - Failure paths redirect to `/admin/login` with a generic error,
//     never surfacing whether the code was valid, expired, or unknown.
//   - We do **not** check the founder allowlist here; the dashboard's
//     `requireFounderSession()` does that on every request. Allowing
//     non-allowlisted users to land a session cookie is fine because the
//     dashboard remains 404 for them. This avoids leaking allowlist
//     membership at the callback step.

import { NextResponse } from "next/server";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { safeAdminNextPath } from "@/server/admin/redirect";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeAdminNextPath(url.searchParams.get("next"));

  if (!code) {
    logServerWarn("admin_auth_callback_missing_code");
    return NextResponse.redirect(
      new URL("/admin/login?e=1", url.origin),
      { status: 303 },
    );
  }

  const client = await createAdminAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("admin_auth_callback_no_client");
    return NextResponse.redirect(
      new URL("/admin/login?e=1", url.origin),
      { status: 303 },
    );
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    logServerWarn("admin_auth_callback_exchange_failed", {
      // Supabase error code (e.g. "otp_expired"). Renamed off `code` so
      // it doesn't shadow the log event name in the structured payload.
      err_code: error.code ?? "unknown",
    });
    return NextResponse.redirect(
      new URL("/admin/login?e=1", url.origin),
      { status: 303 },
    );
  }

  return NextResponse.redirect(new URL(nextPath, url.origin), { status: 303 });
}

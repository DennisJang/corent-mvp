// Slice A PR 5C — closed-alpha CoRent user magic-link callback.
//
// Supabase Auth sends the user a magic link whose redirect URL points
// at this route with `?code=<one-time-code>`. We exchange that code
// for a session via the SSR client (which writes the session cookies
// via the `setAll` cookie handler), then redirect to the safe `next`
// path or the public homepage.
//
// Security:
//   - Anon key only (via `createUserAuthClient`). No service-role.
//   - No tokens, codes, session data, or emails are logged. We log
//     only a coarse error code via the redacting logger.
//   - `next` is validated against `safeUserNextPath`, which rejects
//     `/admin/*` paths so a normal-user sign-in cannot land on the
//     admin surface.
//   - Failure paths redirect to `/login?e=1` with a generic error,
//     never surfacing whether the code was valid, expired, or
//     unknown.
//   - We do NOT decide seller / renter role here. Capability is
//     resolved by `resolveServerActor` against `profiles` +
//     `seller_profiles` / `borrower_profiles` row presence (PR 5A).
//   - We do NOT create profiles, seller_profiles, or
//     borrower_profiles rows. The closed-alpha provisioning
//     workflow is manual (PR 5B); this callback is purely about
//     establishing the auth cookie.

import { NextResponse } from "next/server";
import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { safeUserNextPath } from "@/server/auth/redirect";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeUserNextPath(url.searchParams.get("next"));

  if (!code) {
    logServerWarn("user_auth_callback_missing_code");
    return NextResponse.redirect(
      new URL("/login?e=1", url.origin),
      { status: 303 },
    );
  }

  const client = await createUserAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("user_auth_callback_no_client");
    return NextResponse.redirect(
      new URL("/login?e=1", url.origin),
      { status: 303 },
    );
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    logServerWarn("user_auth_callback_exchange_failed", {
      err_code: error.code ?? "unknown",
    });
    return NextResponse.redirect(
      new URL("/login?e=1", url.origin),
      { status: 303 },
    );
  }

  return NextResponse.redirect(new URL(nextPath, url.origin), { status: 303 });
}

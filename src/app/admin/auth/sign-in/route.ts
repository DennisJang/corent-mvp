// Phase 1.5 — Founder admin magic-link initiation.
//
// POST-only route. Accepts an email, normalizes it, checks the
// server-side `FOUNDER_ADMIN_EMAIL_ALLOWLIST` (the only authorization
// signal), and asks Supabase to send a magic link. The response is
// **identical** for allowlisted and non-allowlisted emails, so this
// route never reveals whether an email is on the allowlist.
//
// Security:
//   - Anon key only. No service-role key path.
//   - Missing or empty allowlist fails closed: `signInWithOtp` is never
//     called. The response is still the same generic message.
//   - Email is never logged. The logger redacts the `email` key as a
//     defense in depth, but we also avoid passing it in the first place.
//   - Magic-link redirect is hard-pinned to `/admin/auth/callback` on
//     the same origin as the request.
//   - `next` is validated against `safeAdminNextPath`; only same-origin
//     `/admin/...` paths survive.
//   - Form parses both `application/json` and standard form bodies so a
//     plain `<form>` works without client JS.

import { NextResponse } from "next/server";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { isAllowlistedFounder } from "@/server/analytics/env";
import { safeAdminNextPath } from "@/server/admin/redirect";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Generic response shown to the user regardless of allowlist status.
// Korean copy because the rest of the founder surface is Korean.
function genericResponse(): NextResponse {
  return NextResponse.json(
    { ok: true, message: "If your email is allowlisted, a sign-in link has been sent." },
    { status: 200 },
  );
}

async function readEmailFromRequest(
  request: Request,
): Promise<{ email: string | null; nextRaw: string | null }> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown> | null;
      const email = typeof body?.email === "string" ? body.email : null;
      const nextRaw = typeof body?.next === "string" ? body.next : null;
      return { email, nextRaw };
    }
    // application/x-www-form-urlencoded or multipart/form-data
    const form = await request.formData();
    const email = form.get("email");
    const nextRaw = form.get("next");
    return {
      email: typeof email === "string" ? email : null,
      nextRaw: typeof nextRaw === "string" ? nextRaw : null,
    };
  } catch {
    return { email: null, nextRaw: null };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { email: rawEmail, nextRaw } = await readEmailFromRequest(request);
  const email = (rawEmail ?? "").trim().toLowerCase();
  const nextPath = safeAdminNextPath(nextRaw);

  // Reject obviously bogus shapes (returns the same generic envelope so
  // we don't leak which validation rule failed). We do flag this in the
  // logger because a malformed payload is not interesting from a privacy
  // standpoint.
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return genericResponse();
  }

  if (!isAllowlistedFounder(email)) {
    return genericResponse();
  }

  const client = await createAdminAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("admin_auth_sign_in_no_client");
    return genericResponse();
  }

  const callbackUrl = new URL("/admin/auth/callback", url.origin);
  if (nextPath !== "/admin/dashboard") {
    callbackUrl.searchParams.set("next", nextPath);
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      // We do not auto-create users; the founder account must already
      // exist in the Supabase project. Phase 1 allows only the founder.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Log the Supabase error code only — never the email or message body.
    // Renamed off `code` so it doesn't shadow the log event name in the
    // structured payload.
    logServerWarn("admin_auth_sign_in_failed", {
      err_code: error.code ?? "unknown",
    });
  }

  return genericResponse();
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}
export async function PUT(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}
export async function PATCH(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}
export async function DELETE(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405 });
}

// Slice A PR 5C — closed-alpha CoRent user magic-link initiation.
//
// POST-only route. Accepts an email, normalizes it, and asks Supabase
// to send a magic link. Distinct from the founder admin flow:
//
//   - **No founder allowlist.** Login is not how seller / borrower
//     capability is granted; capability is row-presence in
//     `seller_profiles` / `borrower_profiles`, seeded manually by
//     the founder per `docs/corent_closed_alpha_provisioning_workflow.md`.
//     A user who can authenticate but has no `profiles` row (or no
//     capability row) still fails closed at PR 5A's resolver.
//
//   - **`shouldCreateUser: false`.** Closed-alpha posture: the
//     founder pre-creates the auth user (and the matching `profiles`
//     row + chosen capability rows) out of band. The route never
//     auto-provisions an `auth.users` row, never inserts into
//     `profiles`, never inserts into `seller_profiles`, never
//     inserts into `borrower_profiles`.
//
//   - **Generic envelope.** The response is identical regardless of
//     whether the email exists in Supabase Auth. This avoids
//     leaking which emails are provisioned.
//
//   - **Same SSR client.** Reuses `createUserAuthClient` (a
//     reference-equal alias of `createAdminAuthClient`) — the
//     anon-key cookie-bound SSR client. No service-role key path.
//
// The response is the same generic 200 for: invalid email shape,
// missing email, allowlist (n/a here, but the shape mirrors admin),
// SSR env missing, Supabase error. Failures are logged with a
// non-secret event code.

import { NextResponse } from "next/server";
import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { safeUserNextPath } from "@/server/auth/redirect";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Generic response shown regardless of whether the email is
// provisioned. Korean copy because the rest of the user surface is
// Korean.
function genericResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      message:
        "If your account is provisioned, a sign-in link has been sent.",
    },
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
  const nextPath = safeUserNextPath(nextRaw);

  // Reject obviously bogus shapes (returns the same generic envelope
  // so we don't leak which validation rule failed).
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return genericResponse();
  }

  const client = await createUserAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("user_auth_sign_in_no_client");
    return genericResponse();
  }

  const callbackUrl = new URL("/auth/callback", url.origin);
  if (nextPath !== "/") {
    callbackUrl.searchParams.set("next", nextPath);
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      // Closed-alpha posture: the founder pre-provisions the auth
      // user + profile + capability rows out-of-band. The route
      // MUST NOT auto-create an auth.users row.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Log a non-secret error code only — never the email or message.
    // Renamed off `code` so it doesn't shadow the log event name.
    logServerWarn("user_auth_sign_in_failed", {
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

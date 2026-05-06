// Founder admin email/password sign-in.
//
// Sister surface to `/admin/auth/sign-in` (magic-link). Magic-link
// stays the long-term path; this route is a foundation slice for
// the closed-alpha smoke window so the founder doesn't need to
// click a magic link every time.
//
// IMPORTANT — authority unchanged:
//
//   - Successful password sign-in establishes a Supabase session,
//     **nothing more**. It does NOT mark the session founder. The
//     founder authority gate stays on `requireFounderSession`,
//     which checks the server-side `FOUNDER_ADMIN_EMAIL_ALLOWLIST`
//     against the session email at every admin request.
//
//   - As defense in depth (mirroring `/admin/auth/sign-in`), this
//     route still runs the allowlist check **before** asking
//     Supabase to authenticate. A non-allowlisted email gets the
//     same generic `pe=invalid` redirect as a wrong password — no
//     allowlist disclosure.
//
// Hard rules:
//
//   - POST-only. GET / PUT / PATCH / DELETE return 405.
//
//   - Password is read from the request body and forwarded to the
//     Supabase SSR client's `signInWithPassword`. The password is
//     **never** logged, never echoed in the redirect URL, never
//     placed in any response body.
//
//   - The route does NOT auto-provision profiles or capability
//     rows. The founder pre-provisions out of band.
//
//   - `next` is validated against `safeAdminNextPath`. Hostile /
//     non-admin paths are downgraded to the admin default.
//
//   - Failures redirect to `/admin/login` with a calm `pe=` query
//     code:
//       - `pe=invalid`     — credentials rejected, or email not
//                             allowlisted (same envelope, no leak)
//       - `pe=unavailable` — SSR auth env missing
//
//   - Logger writes a non-secret reason code only. No email, no
//     password, no Supabase message body.

import { NextResponse } from "next/server";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import {
  safeAdminNextPath,
  DEFAULT_ADMIN_TARGET,
} from "@/server/admin/redirect";
import { isAllowlistedFounder } from "@/server/analytics/env";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

type ParsedBody = {
  email: string | null;
  password: string | null;
  nextRaw: string | null;
};

async function readBody(request: Request): Promise<ParsedBody> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown> | null;
      return {
        email: typeof body?.email === "string" ? body.email : null,
        password: typeof body?.password === "string" ? body.password : null,
        nextRaw: typeof body?.next === "string" ? body.next : null,
      };
    }
    const form = await request.formData();
    const email = form.get("email");
    const password = form.get("password");
    const nextRaw = form.get("next");
    return {
      email: typeof email === "string" ? email : null,
      password: typeof password === "string" ? password : null,
      nextRaw: typeof nextRaw === "string" ? nextRaw : null,
    };
  } catch {
    return { email: null, password: null, nextRaw: null };
  }
}

function failureRedirect(
  origin: string,
  reason: "invalid" | "unavailable",
  nextPath: string,
): NextResponse {
  const target = new URL("/admin/login", origin);
  target.searchParams.set("pe", reason);
  if (nextPath !== DEFAULT_ADMIN_TARGET) {
    target.searchParams.set("next", nextPath);
  }
  return NextResponse.redirect(target.toString(), { status: 303 });
}

function successRedirect(origin: string, nextPath: string): NextResponse {
  return NextResponse.redirect(new URL(nextPath, origin).toString(), {
    status: 303,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { email: rawEmail, password, nextRaw } = await readBody(request);
  const email = (rawEmail ?? "").trim().toLowerCase();
  const nextPath = safeAdminNextPath(nextRaw);

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return failureRedirect(url.origin, "invalid", nextPath);
  }
  if (!password || password.length === 0 || password.length > 1024) {
    return failureRedirect(url.origin, "invalid", nextPath);
  }

  // Allowlist gate, mirroring the magic-link route. Non-allowlisted
  // accounts return the same `pe=invalid` envelope as a wrong
  // password — same shape, no allowlist leak. The actual founder
  // authority gate is `requireFounderSession`, which is unchanged.
  if (!isAllowlistedFounder(email)) {
    return failureRedirect(url.origin, "invalid", nextPath);
  }

  const client = await createAdminAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("admin_auth_password_sign_in_no_client");
    return failureRedirect(url.origin, "unavailable", nextPath);
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    logServerWarn("admin_auth_password_sign_in_failed", {
      err_code: error?.code ?? "no_session",
    });
    return failureRedirect(url.origin, "invalid", nextPath);
  }

  return successRedirect(url.origin, nextPath);
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

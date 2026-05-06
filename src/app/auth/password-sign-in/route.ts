// Closed-alpha CoRent user email/password sign-in.
//
// Sister surface to `/auth/sign-in` (magic-link). Magic-link stays
// the long-term path; this route is a foundation for the closed-
// alpha smoke window so already-provisioned testers can sign in
// fast and keep moving.
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
//   - The route does NOT auto-provision profiles, seller_profiles,
//     borrower_profiles, or any capability row. Capability remains
//     row-presence per `corent_closed_alpha_provisioning_workflow.md`.
//
//   - The route does NOT consult the founder allowlist. That gate
//     stays on `/admin/auth/password-sign-in` and on
//     `requireFounderSession`.
//
//   - `next` is validated against `safeUserNextPath`. The default
//     `/` (homepage) is upgraded to `/dashboard` since this is a
//     post-sign-in surface, but only as the *post-success* default;
//     hostile / admin paths are still downgraded.
//
//   - Failures redirect to `/login` with a calm `pe=` query code:
//       - `pe=invalid`     — credentials rejected by Supabase
//       - `pe=unavailable` — SSR auth env missing (dev / preview
//                             misconfig). The tester sees a calm
//                             retry surface; we never leak whether
//                             the email exists.
//
//   - Logger writes a non-secret reason code only. No email, no
//     password, no Supabase message body.

import { NextResponse } from "next/server";
import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { safeUserNextPath, DEFAULT_USER_TARGET } from "@/server/auth/redirect";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Default post-sign-in landing surface. `safeUserNextPath` returns
// `/` when nothing else is supplied; for a post-login surface that
// is rarely the right destination, so we promote it to `/dashboard`
// only when no explicit safe next was provided.
const POST_LOGIN_DEFAULT = "/dashboard";

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
  const target = new URL("/login", origin);
  target.searchParams.set("pe", reason);
  if (nextPath !== DEFAULT_USER_TARGET) {
    target.searchParams.set("next", nextPath);
  }
  return NextResponse.redirect(target.toString(), { status: 303 });
}

function successRedirect(origin: string, nextPath: string): NextResponse {
  // Promote the homepage default to /dashboard for post-sign-in
  // landing — but only when the safe-next helper itself returned
  // the homepage default (i.e. no explicit safe next was given).
  const target =
    nextPath === DEFAULT_USER_TARGET ? POST_LOGIN_DEFAULT : nextPath;
  return NextResponse.redirect(new URL(target, origin).toString(), {
    status: 303,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const { email: rawEmail, password, nextRaw } = await readBody(request);
  const email = (rawEmail ?? "").trim().toLowerCase();
  const nextPath = safeUserNextPath(nextRaw);

  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return failureRedirect(url.origin, "invalid", nextPath);
  }
  if (!password || password.length === 0 || password.length > 1024) {
    return failureRedirect(url.origin, "invalid", nextPath);
  }

  const client = await createUserAuthClient({ mutable: true });
  if (!client) {
    logServerWarn("user_auth_password_sign_in_no_client");
    return failureRedirect(url.origin, "unavailable", nextPath);
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    logServerWarn("user_auth_password_sign_in_failed", {
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

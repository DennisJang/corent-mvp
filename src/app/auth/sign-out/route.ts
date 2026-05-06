// Closed-alpha sign-out route. Shared between user (`/login`) and
// founder admin (`/admin/login`) login surfaces because both auth
// flows ride the same Supabase SSR session — `createUserAuthClient`
// is a reference-equal alias of `createAdminAuthClient`. One
// `auth.signOut()` call clears the cookie for both.
//
// Hard rules:
//
//   - POST-only. GET / PUT / PATCH / DELETE return 405 — defense
//     against drive-by sign-out via `<img src=…>` or a forged
//     link, mirroring the existing sign-in route's posture.
//
//   - The route does NOT clear other users' sessions, only the
//     current request's cookie. Service-role key never touched.
//
//   - The `next` form field is constrained to the literal strings
//     `"/login"` and `"/admin/login"` — anything else falls back
//     to `"/login"`. This prevents an attacker from crafting a
//     sign-out form that sends the user to an arbitrary URL after
//     logout. It also keeps the founder-admin / normal-user
//     surface decision explicit.
//
//   - Logging uses the redacting server logger; never console.*.
//     Failure paths log a non-secret event code only — no email,
//     no token, no body.

import { NextResponse } from "next/server";
import { createUserAuthClient } from "@/server/admin/supabase-ssr";
import { logServerWarn } from "@/server/logging/logger";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

const ALLOWED_NEXT = new Set(["/login", "/admin/login"]);

function safeSignOutNext(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "/login";
  return ALLOWED_NEXT.has(raw) ? raw : "/login";
}

async function readNextFromRequest(request: Request): Promise<string | null> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown> | null;
      const next = typeof body?.next === "string" ? body.next : null;
      return next;
    }
    const form = await request.formData();
    const next = form.get("next");
    return typeof next === "string" ? next : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const nextRaw = await readNextFromRequest(request);
  const nextPath = safeSignOutNext(nextRaw);
  const target = new URL(nextPath, url.origin);
  target.searchParams.set("out", "1");

  const client = await createUserAuthClient({ mutable: true });
  if (!client) {
    // SSR env missing. The cookie cannot be cleared because the
    // factory could not construct a client; redirect anyway so
    // the user lands on a calm "you've signed out" surface even
    // when the session was never establishable in the first place.
    logServerWarn("user_auth_sign_out_no_client");
    return NextResponse.redirect(target.toString(), { status: 303 });
  }

  const { error } = await client.auth.signOut();
  if (error) {
    logServerWarn("user_auth_sign_out_failed", {
      err_code: error.code ?? "unknown",
    });
  }

  return NextResponse.redirect(target.toString(), { status: 303 });
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

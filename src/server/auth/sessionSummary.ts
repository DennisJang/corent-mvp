// Server-only session summary helper. Used by `/login` and
// `/admin/login` to render a calm "you are signed in as X" panel
// (or a sign-in form) without weakening any other auth gate.
//
// Hard rules:
//
//   - Read-only. Never inserts / updates / deletes. Never auto-
//     creates a profile, seller_profiles, or borrower_profiles row.
//
//   - Server-only. Imports `@/server/admin/supabase-ssr` and
//     `@/server/actors/profileLookup`; must never be imported from
//     `src/components/**` or any `"use client"` file.
//
//   - The output exposes ONLY the current viewer's own email +
//     capability flags + founder-allowlist match. Never another
//     user's data, never service-role keys, never raw rows.
//
//   - The `signed_in_no_profile` state is preserved as a distinct
//     case (rather than collapsed into `signed_out`) so the login
//     pages can render an honest "your account is not provisioned
//     yet" message instead of pretending the session does not
//     exist. The closed-alpha provisioning workflow forbids
//     auto-creating a profiles row; this helper surfaces that
//     state without leaking it to anonymous viewers.
//
//   - Never weakens the founder admin gate. The
//     `isAllowlistedFounder` flag is informational copy only —
//     `requireFounderSession` continues to guard `/admin/cockpit`
//     and other admin routes.

import { lookupProfileCapabilities } from "@/server/actors/profileLookup";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { isAllowlistedFounder } from "@/server/analytics/env";

export type CurrentSessionSummary =
  | { kind: "signed_out" }
  | { kind: "signed_in_no_profile"; email: string; isAllowlistedFounder: boolean }
  | {
      kind: "signed_in";
      email: string;
      hasSeller: boolean;
      hasBorrower: boolean;
      isAllowlistedFounder: boolean;
    };

export async function readCurrentSessionSummary(): Promise<CurrentSessionSummary> {
  const client = await createAdminAuthClient();
  if (!client) return { kind: "signed_out" };

  // `getUser()` re-validates the JWT against Supabase Auth (vs
  // `getSession`, which trusts the locally-stored token). Same
  // posture as `requireFounderSession` and `resolveServerActor`.
  const { data, error } = await client.auth.getUser();
  if (error) return { kind: "signed_out" };
  const user = data?.user;
  const authUserId = user?.id;
  const email = user?.email;
  if (!authUserId || !email) return { kind: "signed_out" };

  const allowlisted = isAllowlistedFounder(email);
  const profile = await lookupProfileCapabilities(authUserId);
  if (!profile) {
    return {
      kind: "signed_in_no_profile",
      email,
      isAllowlistedFounder: allowlisted,
    };
  }

  return {
    kind: "signed_in",
    email,
    hasSeller: profile.hasSeller,
    hasBorrower: profile.hasBorrower,
    isAllowlistedFounder: allowlisted,
  };
}

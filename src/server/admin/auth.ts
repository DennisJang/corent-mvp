// Founder admin auth boundary. The contract is:
//
// - magic-link issued by Supabase Auth is the actual auth boundary;
// - the email must additionally match `FOUNDER_ADMIN_EMAIL_ALLOWLIST`
//   (server-side, normalized);
// - empty / missing allowlist must fail closed (every admin request → 404);
// - non-allowlisted email returns 404 (not 401) so the admin surface is
//   not disclosed.
//
// Phase 1.5: this module now reads the real Supabase SSR session via
// `@supabase/ssr` (`createAdminAuthClient` in `./supabase-ssr.ts`). The
// authorization source is **only** the server-side allowlist — Supabase
// `user_metadata.role`, custom claims, and any client-supplied flags are
// ignored. If the SSR auth env is missing, the client factory returns
// null and we fail closed. If the session has no email, we fail closed.

import { isAllowlistedFounder } from "@/server/analytics/env";
import { createAdminAuthClient } from "./supabase-ssr";

export type FounderSession = {
  email: string;
};

// A `SessionReader` returns the session email (or null) without exposing
// any other Supabase user metadata. We deliberately surface only the
// email so callers can never accidentally trust `role` / custom claims.
export type SessionReader = () => Promise<{ email: string } | null>;

const defaultSessionReader: SessionReader = async () => {
  const client = await createAdminAuthClient();
  if (!client) return null;
  // `getUser()` re-validates the JWT against Supabase Auth (vs. `getSession`
  // which trusts the locally-stored token). This is the recommended path
  // for server-side auth checks per Supabase docs.
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  const email = data?.user?.email;
  if (!email) return null;
  return { email };
};

let activeReader: SessionReader = defaultSessionReader;

export function _setSessionReaderForTests(reader: SessionReader): void {
  activeReader = reader;
}
export function _resetSessionReaderForTests(): void {
  activeReader = defaultSessionReader;
}

export async function requireFounderSession(): Promise<FounderSession | null> {
  const session = await activeReader();
  if (!session) return null;
  if (!isAllowlistedFounder(session.email)) return null;
  return { email: session.email.toLowerCase() };
}

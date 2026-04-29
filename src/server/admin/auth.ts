// Founder admin auth boundary. The contract is:
//
// - magic-link issued by Supabase Auth is the actual auth boundary;
// - the email must additionally match `FOUNDER_ADMIN_EMAIL_ALLOWLIST`
//   (server-side, normalized);
// - empty / missing allowlist must fail closed (every admin request → 404);
// - non-allowlisted email returns 404 (not 401) so the admin surface is
//   not disclosed.
//
// **Phase 1 caveat:** the magic-link → session-cookie flow in Next.js App
// Router needs `@supabase/ssr` (or equivalent SSR helpers) to bridge the
// Supabase auth cookie format. That package is **not** installed in this
// PR — the security review explicitly cleared only `@supabase/supabase-js`.
//
// As a result, `requireFounderSession()` always fails closed today: the
// admin surface is provably unreachable until the SSR helpers are added in
// a separate approved PR. The allowlist + comparator logic is fully
// implemented and unit-tested so the follow-up PR is small and reviewable.

import { isAllowlistedFounder } from "@/server/analytics/env";

export type FounderSession = {
  email: string;
};

// Implementation seam: a future PR will replace this with the real Supabase
// SSR session reader. Until then, this returns null and the admin route
// 404s. The decision to keep the boundary closed by default is intentional;
// see Phase 1 security review §3.4 and §3.13.
export type SessionReader = () => Promise<{ email: string } | null>;

const closedSessionReader: SessionReader = async () => null;
let activeReader: SessionReader = closedSessionReader;

export function _setSessionReaderForTests(reader: SessionReader): void {
  activeReader = reader;
}
export function _resetSessionReaderForTests(): void {
  activeReader = closedSessionReader;
}

export async function requireFounderSession(): Promise<FounderSession | null> {
  const session = await activeReader();
  if (!session) return null;
  if (!isAllowlistedFounder(session.email)) return null;
  return { email: session.email.toLowerCase() };
}

// Server-side actor resolver — the single seam between the request
// (or test) context and the identity that downstream services trust.
//
// CRITICAL — read before editing:
//
//   1. This is the ONLY module under `src/server/**` that may import
//      from `@/lib/auth/mockSession`. The static-text guardrail in
//      `src/server/actors/import-boundary.test.ts` enforces that
//      rule; adding a second importer fails the test.
//
//   2. Two branches:
//
//      - **Mock branch (default).** When `getBackendMode() !== "supabase"`,
//        the resolver returns the hardcoded mock seller session. This
//        keeps the local browser demo behavior identical to pre-PR-5A.
//        The mock branch is the canary the import-boundary test
//        watches; until it disappears, the allowlist stays at one.
//
//      - **Supabase branch (closed-alpha, PR 5A).** When
//        `getBackendMode() === "supabase"`, the resolver reads the
//        Supabase SSR session via the existing `createAdminAuthClient`
//        (anon key + cookie store), then looks up the matching
//        `profiles` + capability rows via `lookupProfileCapabilities`.
//        The actor source is `"supabase"` only when an `auth.users.id`
//        maps to an existing `profiles` row AND the requested
//        capability row exists. No auto-provisioning.
//
//   3. Server actions and command handlers must NEVER trust a
//      caller-supplied actor id. They MUST call this resolver
//      instead. The `IntentCommand` runner and the chat intake
//      actions enforce that pattern by construction (no
//      `actorSellerId` field on any payload type).
//
//   4. Returns `null` when no actor can be resolved. Closed-alpha
//      fail-closed cases:
//        - no Supabase auth session → null
//        - auth user has no `profiles` row → null
//        - auth user has neither `seller_profiles` nor `borrower_profiles`
//          → null
//        - SSR auth env or marketplace env is missing → null

import { getMockSellerSession } from "@/lib/auth/mockSession";
import { lookupProfileCapabilities } from "@/server/actors/profileLookup";
import { createAdminAuthClient } from "@/server/admin/supabase-ssr";
import { getBackendMode } from "@/server/backend/mode";

export type ServerActorKind = "seller" | "renter" | "admin";
export type ServerActorSource = "mock" | "supabase";

export type ServerActor =
  | {
      kind: "seller";
      // Internal id used by the existing services (e.g. `seller_jisu`)
      // in mock mode; the canonical `profiles.id` (UUID) in supabase
      // mode. The dispatcher / writer treat this as opaque.
      sellerId: string;
      displayName: string;
      source: ServerActorSource;
    }
  | {
      kind: "renter";
      borrowerId: string;
      displayName: string;
      source: ServerActorSource;
    }
  | {
      kind: "admin";
      adminId: string;
      displayName: string;
      source: ServerActorSource;
    };

// Optional route preference for actors with multiple capabilities.
// One profile may be both seller and borrower (closed-alpha account
// model). The action layer requests the kind it needs:
//   - seller chat intake → `prefer: "seller"`
//   - future renter flows → `prefer: "renter"`
// When omitted, defaults to "seller" — most existing call sites
// today are seller-side. The handler still asserts `actor.kind`
// via `expectedActorKind`, so a wrong-kind actor maps to a typed
// `ownership` error rather than silently succeeding.
export type ResolveServerActorOptions = {
  prefer?: "seller" | "renter";
};

// Resolve the actor for the current server invocation. The two
// branches (mock / supabase) are selected by `getBackendMode()`.
// The mock branch keeps the local-MVP demo working without auth.
// The supabase branch reads the SSR session and the profile /
// capability rows; nothing is auto-created.
export async function resolveServerActor(
  options: ResolveServerActorOptions = {},
): Promise<ServerActor | null> {
  if (getBackendMode() !== "supabase") {
    // SUPABASE-AUTH-SWAP-POINT
    //
    // Mock branch is intentionally unchanged from pre-PR-5A. When the
    // local browser demo is retired, this body — including the import
    // of `@/lib/auth/mockSession` above — disappears, and the
    // import-boundary canary in `import-boundary.test.ts` flips to
    // an empty allowlist.
    const session = getMockSellerSession();
    if (!session) return null;
    return {
      kind: "seller",
      sellerId: session.sellerId,
      displayName: session.displayName,
      source: "mock",
    };
  }

  // Supabase branch — closed-alpha auth-bound resolution.
  const client = await createAdminAuthClient();
  if (!client) return null;
  // `getUser()` re-validates the JWT against Supabase Auth (vs.
  // `getSession`, which trusts the locally-stored token).
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  const authUserId = data?.user?.id;
  if (!authUserId) return null;

  const profile = await lookupProfileCapabilities(authUserId);
  if (!profile) return null;

  const prefer = options.prefer ?? "seller";

  // Per-kind display name precedence: capability-row display name
  // wins over the profile-level one. If neither is set, fall back
  // to a stable Korean placeholder so downstream UIs always have
  // *something* to render. The resolver never reads or returns the
  // user's email.
  const sellerDisplayName =
    profile.sellerDisplayName ?? profile.displayName ?? "셀러";
  const borrowerDisplayName =
    profile.borrowerDisplayName ?? profile.displayName ?? "빌리는 사람";

  if (prefer === "seller") {
    if (profile.hasSeller) {
      return {
        kind: "seller",
        sellerId: profile.profileId,
        displayName: sellerDisplayName,
        source: "supabase",
      };
    }
    // Borrower-only profile under a seller-preferred call: return
    // the renter actor so the action's `expectedActorKind: "seller"`
    // produces a typed `ownership` error (capability mismatch),
    // distinct from the `unauthenticated` error returned when no
    // capability row exists at all. Both fail closed for seller
    // chat intake.
    if (profile.hasBorrower) {
      return {
        kind: "renter",
        borrowerId: profile.profileId,
        displayName: borrowerDisplayName,
        source: "supabase",
      };
    }
    return null;
  }

  // prefer === "renter"
  if (profile.hasBorrower) {
    return {
      kind: "renter",
      borrowerId: profile.profileId,
      displayName: borrowerDisplayName,
      source: "supabase",
    };
  }
  if (profile.hasSeller) {
    return {
      kind: "seller",
      sellerId: profile.profileId,
      displayName: sellerDisplayName,
      source: "supabase",
    };
  }
  return null;
}

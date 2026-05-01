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
//   2. The current implementation reads from `getMockSellerSession()`
//      so the local-MVP demo continues to work without auth. **This
//      is the Supabase Auth swap point**: when real auth ships, the
//      mock import goes away and a server-resolved cookie/JWT-based
//      session takes its place. Every server action that calls
//      `resolveServerActor()` becomes auth-bound automatically.
//
//   3. Server actions and command handlers must NEVER trust a
//      caller-supplied actor id. They MUST call this resolver
//      instead. The `IntentCommand` runner and the chat intake
//      actions enforce that pattern by construction (no
//      `actorSellerId` field on any payload type).
//
//   4. Returns `null` when no actor can be resolved. Today that
//      branch is unreachable (the mock helper is hardcoded), but
//      leaving the contract honest costs nothing and prevents the
//      "unauthenticated" path from being a refactor when auth lands.

import { getMockSellerSession } from "@/lib/auth/mockSession";

export type ServerActorKind = "seller" | "renter" | "admin";
export type ServerActorSource = "mock" | "supabase";

export type ServerActor =
  | {
      kind: "seller";
      // Internal id used by the existing services (e.g. `seller_jisu`).
      // When auth lands this maps to `auth.uid → seller_profile.id`.
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

// Resolve the actor for the current server invocation. Today this
// always returns the mock seller session because the local MVP has
// no real auth. The function is async so the future Supabase swap
// (`createServerClient(...).auth.getUser()`) drops in without a
// signature change at every call site.
export async function resolveServerActor(): Promise<ServerActor | null> {
  // SUPABASE-AUTH-SWAP-POINT
  //
  // When real auth ships, replace this body with:
  //   const supabase = await createServerSupabase();
  //   const { data, error } = await supabase.auth.getUser();
  //   if (error || !data.user) return null;
  //   const profile = await loadProfile(data.user.id);
  //   return profileToServerActor(profile);
  //
  // The mock import below disappears alongside that change, and the
  // import-boundary test then guards the empty allowlist.
  const session = getMockSellerSession();
  if (!session) return null;
  return {
    kind: "seller",
    sellerId: session.sellerId,
    displayName: session.displayName,
    source: "mock",
  };
}

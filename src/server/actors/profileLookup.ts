// Server-only profile / capability lookup.
//
// Slice A PR 5A: this is the read-only seam between a Supabase
// Auth user id and the CoRent capability rows it owns. Given a
// Supabase `auth.users.id`, it returns the matching `profiles`
// row plus boolean flags for `seller_profiles` / `borrower_profiles`
// presence — enough for `resolveServerActor` to decide which kind
// of `ServerActor` to mint.
//
// Hard rules — read before editing:
//
//   1. READ-ONLY. This module never inserts, updates, or upserts.
//      Closed-alpha posture: a profile / seller capability / borrower
//      capability row is created **only** by an out-of-band founder
//      seed or a future explicit onboarding flow. The server never
//      auto-provisions on first login or first action.
//   2. Server-only. Imports the Phase 2 marketplace service-role
//      client. It must not be imported by `src/components/**` or any
//      `"use client"` file. The static-text guard in
//      `src/server/admin/import-boundary.test.ts` covers components;
//      this PR adds an explicit guard against this module being
//      imported outside `src/server/**`.
//   3. UUID validated at the boundary. `auth.users.id` is a UUID by
//      Supabase's contract, but a forged caller cannot reach this
//      function without going through `resolveServerActor` — and even
//      so, we revalidate the shape before any DB call.
//   4. Returns `null` (not throws) when the marketplace client is
//      unavailable (mock backend mode, or missing env). Callers
//      treat `null` as "no capability resolvable" and fail closed.
//
// References:
//   - supabase/migrations/20260430120000_phase2_marketplace_draft.sql
//     (profiles, seller_profiles, borrower_profiles)
//   - src/server/actors/resolveServerActor.ts (the only caller)
//   - docs/corent_closed_alpha_actor_resolver_note.md (PR 5A doc)

import { getMarketplaceClient } from "@/server/persistence/supabase/client";
import { validateUuid } from "@/server/persistence/supabase/validators";

export type ProfileLookupResult = {
  // The profile id is the same value as `auth.users.id` by schema
  // convention (see the parent migration's `profiles` table comment).
  profileId: string;
  // `display_name` from the `profiles` row, if present. May be null
  // when the row was seeded without a display name. Capability-row
  // display names take precedence in the resolver.
  displayName: string | null;
  hasSeller: boolean;
  hasBorrower: boolean;
  // Capability-specific display names. Either may be null when the
  // capability row exists but did not set a display name; in that
  // case the resolver falls back to the profile-level display name.
  sellerDisplayName: string | null;
  borrowerDisplayName: string | null;
};

// Read the profile + capability rows for a Supabase auth user id.
// Returns `null` when:
//   - the input is not a well-formed UUID,
//   - the marketplace client is unavailable (mock mode / missing env),
//   - no `profiles` row exists for that id.
//
// Must NOT auto-create rows. Closed-alpha posture is "manual seed
// only"; an automatic insert here would silently grant capabilities
// the founder did not approve.
export async function lookupProfileCapabilities(
  authUserId: string,
): Promise<ProfileLookupResult | null> {
  const idRes = validateUuid(authUserId);
  if (!idRes.ok) return null;
  const client = getMarketplaceClient();
  if (!client) return null;
  const id = idRes.value;

  const profileQ = await client
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .maybeSingle();
  if (profileQ.error || !profileQ.data) return null;
  const profileRow = profileQ.data as unknown as {
    id: string;
    display_name: string | null;
  };

  const sellerQ = await client
    .from("seller_profiles")
    .select("profile_id, display_name")
    .eq("profile_id", id)
    .maybeSingle();
  // Treat a query error the same as "no capability". Failing closed
  // is preferable to surfacing a transient DB error as "user has
  // seller capability".
  const sellerRow =
    sellerQ.error || !sellerQ.data
      ? null
      : (sellerQ.data as unknown as {
          profile_id: string;
          display_name: string | null;
        });

  const borrowerQ = await client
    .from("borrower_profiles")
    .select("profile_id, display_name")
    .eq("profile_id", id)
    .maybeSingle();
  const borrowerRow =
    borrowerQ.error || !borrowerQ.data
      ? null
      : (borrowerQ.data as unknown as {
          profile_id: string;
          display_name: string | null;
        });

  return {
    profileId: profileRow.id,
    displayName: profileRow.display_name ?? null,
    hasSeller: sellerRow !== null,
    hasBorrower: borrowerRow !== null,
    sellerDisplayName: sellerRow?.display_name ?? null,
    borrowerDisplayName: borrowerRow?.display_name ?? null,
  };
}

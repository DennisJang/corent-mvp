# Closed-alpha provisioning workflow (Slice A PR 5B)

This note defines the **founder-controlled, manual** provisioning
workflow that gives PR 5A's actor resolver a safe data model to
read. It is documentation only. PR 5B does not implement login,
onboarding, magic-link routes, callback routes, RLS policies, or
runtime flips — those remain future work.

## Identity model

A CoRent user is **one profile, multiple capabilities**. Concretely:

- One row in `public.profiles`. The PK is the Supabase
  `auth.users.id` (uuid). The `profiles.id` value **must equal**
  the corresponding `auth.users.id`. The convention is documented
  in the parent migration's `profiles` table comment; there is no
  `auth_user_id` shim column and no FK to `auth.users` (cross-
  schema).
- `profiles` is the canonical account / person row. Email is the
  only PII column allowed; phone, full address, and RRN are
  forbidden by schema CHECK and by policy.
- Capability rows live in two **separate 1:1 tables**, both keyed
  by `profile_id` referencing `profiles(id)`:
  - `public.seller_profiles`  → seller capability
  - `public.borrower_profiles` → borrower capability
- The same `profiles.id` may appear in **both** capability tables
  simultaneously. Buyer and seller are orthogonal capabilities
  attached to a single profile, not separate accounts.

Capability presence is **row-presence**. There is no boolean
column ("is_seller") and no role enum.

## Provisioning rules (closed-alpha)

These rules are normative for the closed-alpha window
(pre-revenue, until 2026-07-13 + readiness — see
[`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)):

1. **`profiles` row alone grants no capability.** Without a
   matching `seller_profiles` row, a profile cannot start chat
   intake, cannot create listings, cannot perform any seller
   action. Same for borrower-only flows (when those land) and
   `borrower_profiles`.
2. **Seller capability is founder-seeded only.** A
   `seller_profiles` row is inserted manually by the founder, out
   of band, against `corent-dev` (and only `corent-dev` during
   closed-alpha). Inserts happen via the Supabase SQL editor or
   an explicit human-driven `psql` step — never via an automated
   migration, never via an automatic seed file picked up by
   `supabase db reset`.
3. **No auto-provisioning exists or is approved.** The server
   never inserts a profile, seller_profiles, or borrower_profiles
   row in response to:
   - first sign-in
   - first chat intake action
   - first seller action of any kind
   - any client-side request shape
   The static-text guard
   [`src/server/actors/import-boundary.test.ts`](../src/server/actors/import-boundary.test.ts)
   verifies that
   [`src/server/actors/profileLookup.ts`](../src/server/actors/profileLookup.ts)
   contains no `.insert` / `.upsert` / `.update` / `.delete` calls.
4. **Missing rows fail closed.** `resolveServerActor`'s supabase
   branch returns `null` (→ `code: "unauthenticated"`) when the
   auth user has no `profiles` row, or has a `profiles` row but
   no capability row. A borrower-only profile under the seller
   chat intake call returns a renter actor that the action's
   `expectedActorKind: "seller"` maps to `code: "ownership"`
   (capability mismatch). Both fail closed for seller chat
   intake. Full fail-closed semantics:
   [`docs/corent_closed_alpha_actor_resolver_note.md`](corent_closed_alpha_actor_resolver_note.md).
5. **Remote `corent-dev` may not be seeded without explicit
   founder approval.** Every founder-side seed step against
   `corent-dev` is gated by:
   - the security review note
     ([`docs/corent_security_gate_note.md`](corent_security_gate_note.md)),
   - the pre-revenue beta posture
     ([`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)),
   - and the agent-loop approval gates
     ([`docs/agent_loop.md`](agent_loop.md)).
   Claude Code, Codex, or any agent **may not** run remote
   Supabase commands (`supabase login`, `supabase link`,
   `supabase db push`, `--db-url`, the SQL editor on the founder
   account) on behalf of the founder. These steps are executed
   only by the founder, on the founder's machine, with explicit
   intent.
6. **No automatic seed file is added or permitted to auto-run.**
   The Supabase CLI's default `seed.sql` filename is
   intentionally not used. The existing dev fixture lives at
   `supabase/seed.phase2_dev.sql` (non-standard name; see the
   header of that file). The provisioning template introduced by
   PR 5B lives under `docs/sql_templates/` — outside any path the
   CLI scans — to make accidental auto-application impossible.

## Provisioning steps (when the founder approves a tester)

For one closed-alpha tester:

1. **Create the auth user** via the Supabase Auth UI on
   `corent-dev` (or magic-link sign-in once the route ships). The
   Supabase-issued `auth.users.id` is the value that will become
   `profiles.id`.
2. **Open the SQL template** at
   [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql).
   The template is marked `TEMPLATE ONLY — DO NOT RUN AS-IS` and
   uses placeholders for every value.
3. **Substitute placeholders** with the tester's actual values:
   - `<<AUTH_USER_ID_UUID>>` → the `auth.users.id` from step 1
   - `<<TESTER_EMAIL>>` → the tester's contact email (must match
     the value in `auth.users` for consistency)
   - `<<TESTER_DISPLAY_NAME>>` → a short bounded display name
     (≤ 60 chars; placeholder example: `DEMO 셀러 A`)
   - other placeholders documented inline in the template
4. **Run the substituted SQL** against `corent-dev` via the
   Supabase SQL editor. Pick exactly one of the three example
   blocks: seller-only, borrower-only, or dual-capability. The
   inserts use `on conflict do nothing` so they are safe to
   re-run.
5. **Verify** with the SELECT queries at the bottom of the
   template. Confirm:
   - one row in `profiles` with the tester's id
   - the expected capability rows present (and only those)
6. **Hand the tester their sign-in path**: `/login`. Posts to
   `/auth/sign-in` (magic-link initiation, no allowlist, no
   auto-create) and exchanges the code at `/auth/callback`. PR 5C
   shipped the route; see
   [`docs/corent_closed_alpha_user_auth_note.md`](corent_closed_alpha_user_auth_note.md)
   for the full flow.

## Rollback

Closed-alpha testers may need to be revoked or rotated. The
template includes rollback snippets that:
- delete the `seller_profiles` and/or `borrower_profiles` rows by
  `profile_id`
- delete the `profiles` row by `id`
- list everything keyed to the tester's profile id so the founder
  can confirm fan-out before deletion

`on delete cascade` from the parent migration takes care of
intake sessions, intake messages, listing versions, etc., that
reference the tester's profile id. The rollback snippets call
this out explicitly.

## What PR 5B does NOT do

| Concern | Status in PR 5B |
| --- | --- |
| Seller / renter sign-in routes (magic-link, callback) | not added |
| Seller / renter onboarding UI | not added |
| Auto-create on first login or first action | not added; explicitly forbidden |
| RLS policies on `profiles` / `seller_profiles` / `borrower_profiles` | not added; deny-by-default RLS stays |
| Schema migrations | not added |
| Runtime flip — `SHARED_SERVER_MODE` in `chatIntakeClient.ts` | not flipped |
| Remote apply against `corent-dev` | not run; founder-only |
| Changes to `supabase/seed.sql` / `supabase/seeds/` | none; those paths are intentionally avoided |

## What lands next

PR 5C **landed**: a single shared closed-alpha CoRent user
sign-in / callback route. See
[`docs/corent_closed_alpha_user_auth_note.md`](corent_closed_alpha_user_auth_note.md)
for the route layout (`/login` → `/auth/sign-in` → `/auth/callback`),
the `shouldCreateUser: false` posture, and the assertion that
the founder allowlist is not consulted on the user surface.

PR 5D + 5E both landed afterward: PR 5D added the server-backed
intake dispatch smoke (with a temporary
`supabase_listing_draft_not_yet_wired` guard for createDraft);
PR 5E externalized listing-draft persistence and removed that
guard, so `createIntakeListingDraftAction` now succeeds
end-to-end in supabase mode + supabase actor. See
[`docs/corent_closed_alpha_intake_dispatch_smoke_note.md`](corent_closed_alpha_intake_dispatch_smoke_note.md)
and
[`docs/corent_closed_alpha_listing_draft_externalization_note.md`](corent_closed_alpha_listing_draft_externalization_note.md).

The remaining slice is the **visible client adapter flip**
(`SHARED_SERVER_MODE` in `chatIntakeClient.ts` → runtime probe /
per-session opt-in cookie / founder-controlled gate). Until that
lands, the visible browser chat intake stays on local persistence
even though every server-side prerequisite is in place — exactly
the fail-closed posture the pre-revenue beta plan requires.

## References

- `src/server/actors/resolveServerActor.ts`
- `src/server/actors/profileLookup.ts`
- `src/server/actors/import-boundary.test.ts` (no-auto-create
  static guard)
- `supabase/migrations/20260430120000_phase2_marketplace_draft.sql`
  (`profiles`, `seller_profiles`, `borrower_profiles`)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/sql_templates/closed_alpha_profile_capabilities.sql`
  (PR 5B template — this PR)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5 prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_externalization_architecture_v1.md`
- `docs/agent_loop.md`

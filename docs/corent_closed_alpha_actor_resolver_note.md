# Closed-alpha actor resolver note (Slice A PR 5A)

This note records the closed-alpha identity rule that landed in
Slice A PR 5A. It is the smallest change that makes the
server-side actor resolver *capable* of resolving a Supabase-
authenticated user into a seller / renter actor against the
existing `profiles` + capability tables, without flipping the
visible client runtime, without provisioning anything
automatically, and without touching `corent-dev`.

## Identity rule

A CoRent user is **one profile, multiple capabilities**:

- One row in `public.profiles`. The PK is the Supabase
  `auth.users.id` (uuid). There is no separate `auth_user_id`
  column and no FK shim — the convention is enforced in code,
  documented in the parent migration's `profiles` table comment.
- Capability rows live in two separate 1:1 tables, both keyed by
  `profile_id` referencing `profiles(id)`:
  - `public.seller_profiles`  → seller capability
  - `public.borrower_profiles` → borrower capability
- The same `profiles.id` may appear in **both** capability tables
  simultaneously. The closed-alpha account model treats buyer and
  seller as orthogonal capabilities attached to a single profile,
  not as separate accounts.

There is no boolean column on `profiles` ("is_seller", etc.).
Capability is **row presence**, full stop.

## Auto-provisioning rule

PR 5A does **not** auto-create rows. Specifically:

- No `profiles` insert on first login.
- No `seller_profiles` insert on first seller action, first
  intake message, or any other server-side trigger.
- No `borrower_profiles` insert on first borrower action.

A `seller_profiles` row exists for a closed-alpha tester only
when the founder has inserted it out-of-band (manual seed against
`corent-dev`, executed by the founder against the security-
review-gated path described in
`docs/corent_security_gate_note.md`). Same for `borrower_profiles`
once buyer onboarding lands.

This is the closed-alpha posture: capability is granted, never
inferred.

## Resolver behavior

`resolveServerActor()` (in `src/server/actors/resolveServerActor.ts`)
has two branches selected by `getBackendMode()`:

### Mock branch (default)

Unchanged from pre-PR-5A. `getMockSellerSession()` is the source
of truth and the actor's `source` is `"mock"`. The local browser
demo and the same-browser MVP continue to work without auth. The
import-boundary canary in
`src/server/actors/import-boundary.test.ts` keeps watch — when
this branch eventually disappears, the allowlist for the mock
session import shrinks to an empty set.

### Supabase branch (closed-alpha, PR 5A)

Active when `CORENT_BACKEND_MODE=supabase`. Reads the SSR session
via the existing `createAdminAuthClient` helper (anon key + Next
cookie store, server-side) and looks up profile / capability
rows via `lookupProfileCapabilities`
(`src/server/actors/profileLookup.ts`).

| Case | Returned actor |
| --- | --- |
| no auth user, or auth.getUser errors, or SSR env missing | `null` |
| auth user, no `profiles` row | `null` |
| profile row, no `seller_profiles`, no `borrower_profiles` | `null` |
| profile + `seller_profiles` (any prefer) | `{ kind: "seller", sellerId: profile_id, source: "supabase" }` |
| profile + `borrower_profiles` only, prefer="seller" (default for chat intake) | `{ kind: "renter", borrowerId: profile_id, source: "supabase" }` — downstream `expectedActorKind: "seller"` maps to `ownership` |
| profile + `borrower_profiles` only, prefer="renter" | `{ kind: "renter", borrowerId: profile_id, source: "supabase" }` |
| profile + both capabilities, prefer="seller" | `{ kind: "seller", sellerId: profile_id, source: "supabase" }` |
| profile + both capabilities, prefer="renter" | `{ kind: "renter", borrowerId: profile_id, source: "supabase" }` |

The `prefer` option is plumbed through `runIntentCommand` so an
action declares the capability it expects:

```ts
runIntentCommand(handler, payload, {
  expectedActorKind: "seller",
  prefer: "seller",
});
```

The chat intake server actions (Slice A) all pass `prefer:
"seller"`. The double gate (`prefer` selects which capability the
resolver minted; `expectedActorKind` enforces the kind at the
runner) ensures a borrower-only profile cannot perform seller
chat intake, and that the failure is a typed `ownership` error
rather than `unauthenticated` — distinguishable from the
"no profile / no capability" case at the client.

## Why renter actor (not null) for borrower-only + prefer=seller

Two failure modes are possible for a borrower-only profile that
hits a seller route:

- **Return `null`** → `runIntentCommand` returns
  `code: "unauthenticated"`. Client cannot distinguish "you are
  not signed in" from "you are signed in but lack seller
  capability".
- **Return renter actor** (chosen) → `runIntentCommand`'s
  `expectedActorKind` returns `code: "ownership"`. The client
  branch can show the right copy: "you need seller capability".

Both fail closed for seller chat intake. The renter-actor
variant preserves more information for future capability-aware
UX without expanding the actor union or weakening the gate.

When the `null` branch fires (no auth, no profile, no
capability), the client still sees `unauthenticated` and the
server has emitted no row.

## What this PR does NOT do

PR 5A is the resolver-shape PR only. The following remain future
work, each gated by `docs/corent_security_gate_note.md` plus
`docs/corent_pre_revenue_beta_plan.md`:

- Seller / renter sign-in UI. Magic-link route handlers
  (mirroring the founder admin pattern in
  `src/server/admin/auth.ts` + `src/server/admin/supabase-ssr.ts`)
  are not added.
- Self-serve seller onboarding (`seller_profiles` registration
  flow, founder approval UX).
- Self-serve borrower onboarding.
- RLS policies on `profiles` / `seller_profiles` /
  `borrower_profiles`. The Phase 2 deny-by-default RLS posture
  stays in place; the resolver and the lookup helper run under
  the marketplace service-role client.
- Flipping `SHARED_SERVER_MODE` in
  `src/lib/client/chatIntakeClient.ts`. The client still defaults
  to local in-memory + localStorage adapters. Server-mode wiring
  ships in a separate PR (5B in the externalization sequence).
- Removing the mock branch from `resolveServerActor.ts` and
  shrinking the allowlist in the actor import-boundary test.
- Applying anything to `corent-dev` or production. PR 5A is code +
  tests + docs only.

## Closed-alpha fail-closed semantics

For closed-alpha, every chat intake call produces one of:

- `ok: true` — profile exists, seller capability present,
  resolved as a `source: "supabase"` seller actor.
- `code: "unauthenticated"` — no auth user, no profile, no
  capability rows, env missing, or SSR client unavailable.
- `code: "ownership"` — auth user has only the borrower
  capability (or no capability at all when chained through PR 4's
  dispatcher decision table) and the action expected a seller.
- `code: "input"` / `not_found` / `conflict` — domain-level
  errors unrelated to identity. Same shape as before PR 5A.
- `code: "internal"` — unexpected throw inside the runner; the
  message is a generic non-secret string.

A forged payload cannot grant access. The action types do not
declare `profileId`, `sellerId`, `sellerProfileId`, `role`,
`source`, or `capability` keys; the runtime reads only
`sessionId` / `content`. The resolver is the single source of
ownership.

## References

- `src/server/actors/resolveServerActor.ts`
- `src/server/actors/profileLookup.ts`
- `src/server/actors/profileLookup.test.ts`
- `src/server/actors/resolveServerActor.test.ts`
- `src/server/actors/import-boundary.test.ts` (PR 5A boundary
  additions)
- `src/server/intake/actions.capability.test.ts`
- `src/server/intents/intentCommand.ts` (`prefer` plumbing)
- `supabase/migrations/20260430120000_phase2_marketplace_draft.sql`
  (`profiles`, `seller_profiles`, `borrower_profiles`)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5 prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/corent_externalization_architecture_v1.md`

# Closed-alpha user auth entry note (Slice A PR 5C)

PR 5C adds the **closed-alpha CoRent user sign-in entry path**: a
single shared, non-admin Supabase Auth magic-link route a
provisioned tester can use to establish a server-side auth
session. It is the third prerequisite for PR 5's dispatch flip
(after PR 5A's actor resolver and PR 5B's manual provisioning
workflow), and it does **not** flip the visible chat intake
runtime.

## What PR 5C adds

| Surface | File | Behavior |
| --- | --- | --- |
| Login page | `src/app/login/page.tsx` | Server component; minimal email field; posts to `/auth/sign-in`. No client JS. Marked `noindex,nofollow`. |
| Sign-in route | `src/app/auth/sign-in/route.ts` | POST-only. Accepts `email` (and optional `next`). Calls Supabase `signInWithOtp` with `shouldCreateUser: false`. Returns the same generic 200 envelope on every branch. |
| Callback route | `src/app/auth/callback/route.ts` | GET-only. Exchanges the `code` for a session via the SSR client (writes session cookies). Redirects to `safeUserNextPath` on success, `/login?e=1` on failure. |
| Open-redirect helper | `src/server/auth/redirect.ts` | `safeUserNextPath` constrains `next` to relative same-origin paths and explicitly rejects anything under `/admin/*`. |
| SSR client alias | `src/server/admin/supabase-ssr.ts` | New export `createUserAuthClient` — reference-equal to `createAdminAuthClient`. The factory is generic (anon-key SSR client); the alias makes the user-route call sites read clearly. |

## What PR 5C does NOT do

| Concern | Status |
| --- | --- |
| Auto-create `auth.users` rows on sign-in | **Not done.** `shouldCreateUser: false` is enforced by route + asserted by test. |
| Auto-create `profiles` rows | **Not done.** No insert path exists; the import-boundary test forbids one. |
| Auto-create `seller_profiles` / `borrower_profiles` rows | **Not done.** Same — manual provisioning per PR 5B. |
| Decide seller / renter role at login time | **Not done.** Login authenticates only. Capability is row-presence, resolved later by `resolveServerActor` (PR 5A). |
| Founder allowlist on the user surface | **Not consulted.** `isAllowlistedFounder` / `requireFounderSession` / `FOUNDER_ADMIN_EMAIL_ALLOWLIST` references are forbidden in the user routes and asserted absent by test. |
| Admin access from the user route | **Not granted.** `safeUserNextPath` rejects `/admin/*`; the admin gate (founder allowlist) is unchanged and still 404s for non-founders. |
| Self-serve seller onboarding | **Not added.** |
| Public listing publication / rental lifecycle / payment / settlement | **Not wired.** |
| RLS policies on `profiles` / `seller_profiles` / `borrower_profiles` | **Not added.** Deny-by-default RLS stays. |
| Schema migrations | **None.** |
| `SHARED_SERVER_MODE` flip in `chatIntakeClient.ts` | **Not flipped.** Asserted by test — the visible chat intake demo continues to use local persistence. |
| Remote `corent-dev` apply | **Not run.** |

## How a closed-alpha tester actually signs in

1. **Founder seeds the tester** per
   [`docs/corent_closed_alpha_provisioning_workflow.md`](corent_closed_alpha_provisioning_workflow.md):
   creates the `auth.users` row in `corent-dev`, runs the
   substituted SQL from
   [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](sql_templates/closed_alpha_profile_capabilities.sql)
   to insert the `profiles` row and chosen capability rows
   (`seller_profiles`, `borrower_profiles`, or both).
2. **Founder hands the tester the sign-in URL**: `/login`.
3. **Tester enters their email**, posts to `/auth/sign-in`, and
   receives a magic link via Supabase Auth. If the email is not
   provisioned, Supabase silently no-ops (because
   `shouldCreateUser: false`); the response shape is identical
   either way.
4. **Tester clicks the magic link** → `/auth/callback?code=...`
   exchanges the code for a session and redirects to the safe
   `next` path (default: `/`).
5. **Tester reaches a page that resolves an actor.** PR 5A's
   resolver runs against `auth.users.id` → `profiles` →
   capability rows. The `source: "supabase"` actor is reachable
   only when the manual provisioning has set up the corresponding
   rows. A tester with no `profiles` row, or no capability row,
   fails closed.

## Why one shared `/auth/*` route, not separate seller/renter routes

The closed-alpha account model is "one profile, multiple
capabilities" (see
[`docs/corent_closed_alpha_actor_resolver_note.md`](corent_closed_alpha_actor_resolver_note.md)).
A user is not a "seller account" or a "renter account"; a user
is a profile that may have either or both capabilities. Splitting
auth into two parallel routes would impose a role choice at the
identity layer, which is exactly what the resolver's `prefer`
option deliberately avoids. The shared route lands a session;
the resolver decides which capability the current request needs.

## Relationship to PR 5A and PR 5B

```
       ┌─────────────────────────────────────────┐
       │   PR 5B — manual provisioning workflow  │
       │   (founder-driven SQL template, manual) │
       └─────────────────────────────────────────┘
                          │
                          │ produces rows in
                          ▼
   profiles  +  seller_profiles  /  borrower_profiles
                          │
                          │ read by
                          ▼
       ┌─────────────────────────────────────────┐
       │   PR 5A — closed-alpha actor resolver    │
       │   (auth.users.id → ServerActor)          │
       └─────────────────────────────────────────┘
                          ▲
                          │ session established by
                          │
       ┌─────────────────────────────────────────┐
       │   PR 5C — closed-alpha user sign-in     │  ← this PR
       │   /login → /auth/sign-in → /auth/callback│
       │   (no allowlist, no auto-create)         │
       └─────────────────────────────────────────┘
```

PR 5A reads what PR 5B writes. PR 5C is what makes the
`auth.users.id` available to PR 5A's resolver in the first
place. None of the three flips the chat intake runtime — that
remains PR 5D.

## What lands next

PR 5D and PR 5E both **landed**:

- **PR 5D** — server-backed intake dispatch smoke + temporary
  split-brain guard. See
  [`docs/corent_closed_alpha_intake_dispatch_smoke_note.md`](corent_closed_alpha_intake_dispatch_smoke_note.md).
- **PR 5E** — listing draft externalization via
  `ListingDraftWriter`. PR 5D's `unsupported` guard is removed;
  `createIntakeListingDraftAction` now completes end-to-end in
  supabase mode + supabase actor. See
  [`docs/corent_closed_alpha_listing_draft_externalization_note.md`](corent_closed_alpha_listing_draft_externalization_note.md).

The only remaining slice is the **visible client adapter flip** —
replacing `SHARED_SERVER_MODE` in
[`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts)
with a runtime probe / per-session opt-in cookie /
founder-controlled gate. Until that lands, the visible browser
chat intake stays on the local-persistence demo path even though
every server-side prerequisite is now in place.

## References

- `src/app/login/page.tsx`
- `src/app/auth/sign-in/route.ts` + `route.test.ts`
- `src/app/auth/callback/route.ts` + `route.test.ts`
- `src/server/auth/redirect.ts` + `redirect.test.ts`
- `src/server/admin/supabase-ssr.ts` (`createUserAuthClient` alias)
- `src/server/admin/import-boundary.test.ts` (PR 5C boundary
  additions)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B)
- `docs/sql_templates/closed_alpha_profile_capabilities.sql`
- `docs/phase2_marketplace_schema_draft.md` §"PR 5 prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
- `docs/agent_loop.md`

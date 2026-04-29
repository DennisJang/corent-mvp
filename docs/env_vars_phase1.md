# CoRent — Phase 1 Env Var Manifest

_Recorded: 2026-04-30_

This manifest lists every env var the Phase 1 implementation reads. Each
row identifies scope (server-only vs. browser-shipped), purpose, fail
behavior, and ownership. **No real secret values appear in this file or
in `.env.example`** — see [`corent_security_review_phase1_2026-04-30.md` §3.19](corent_security_review_phase1_2026-04-30.md).

## Server-only

| Name | Purpose | Read by | If missing |
|---|---|---|---|
| `ENABLE_ANALYTICS_BETA` | Phase 1 feature flag. Only the literal string `"true"` enables the `/api/events` write path. | `src/server/analytics/env.ts` | Default off. `/api/events` returns 204 with no write. |
| `SUPABASE_URL` | Supabase project URL (Seoul `ap-northeast-2`). Read by both the analytics writer and the SSR auth client. | `src/server/analytics/supabase.ts`, `src/server/admin/supabase-ssr.ts` | Service-role client returns `null` → analytics writer fails closed (`/api/events` returns 503), admin dashboard renders disabled state. SSR auth client returns `null` → `requireFounderSession()` fails closed (admin returns 404). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Bypasses RLS. Used by analytics writer + admin reader **only**. **Never `NEXT_PUBLIC_*`. Never used for user session / auth.** | `src/server/analytics/supabase.ts` | Service-role client returns `null` → fail closed as above. |
| `SUPABASE_ANON_KEY` | Anon key, server-only. Used **only** by the SSR auth client (`createAdminAuthClient`) to validate the magic-link session cookie via `@supabase/ssr`. Browser-safe in principle but un-prefixed so the auth path stays server-only in Phase 1.5. | `src/server/admin/supabase-ssr.ts` | SSR client returns `null` → admin returns 404. |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | Comma-separated email allowlist for the founder admin dashboard. **Only authorization signal** — `user_metadata.role` and any client-supplied flags are ignored. | `src/server/analytics/env.ts` (read by `src/server/admin/auth.ts` and `src/app/admin/auth/sign-in/route.ts`) | Empty / missing → every admin request fails closed (returns 404). Sign-in route never calls Supabase `signInWithOtp`. |
| `ANALYTICS_INGEST_SHARED_SECRET` | Optional cheap forgery defense for `/api/events`. **Not** a security boundary. | (reserved; not consumed by current code) | No effect. Documented for forward use. |

## Browser-shipped (`NEXT_PUBLIC_*`)

| Name | Purpose | Read by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase URL. | (reserved; Phase 1 does not invoke a Supabase client from the browser) | Audited as non-sensitive. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. | (reserved) | Anon key alone cannot reach Phase 1 tables; RLS is deny-by-default. |

## Vercel project setting (not an app env var)

| Name | Purpose | Where it lives | Notes |
|---|---|---|---|
| Vercel Deployment Protection password | Soft outer gate on `/admin/*`. | Vercel project dashboard. | **Not the auth boundary.** The actual boundary is the Supabase magic-link + email allowlist check. |

## Hard rules

- **No `NEXT_PUBLIC_*` variable** matches the deny-list regex
  `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI|ADMIN|ALLOWLIST)`.
- **No service-role key** is read outside `src/server/**` modules.
- **No service-role key** is used for user session / auth. Auth uses the
  Supabase **anon** key (`SUPABASE_ANON_KEY`) via the SSR client only.
- **No fallback** invents a default credential. Missing env → fail closed.

## Supabase Auth — magic-link session settings

These are configured in the **Supabase Auth** project console, not in
this repository's env vars. The smoke runbook
([`phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md))
documents the exact UI steps. Setting these is a human-required step.

| Setting | Required value | Why |
|---|---|---|
| Email auth provider | Enabled | Magic-link is the founder admin auth path. |
| Email confirmation / sign-up | Disabled (manual founder account creation) | Prevents anyone from creating an account. The sign-in route also passes `shouldCreateUser: false`. |
| Site URL | The production origin | Anchor for redirect URL allowlist. |
| Additional redirect URLs | `https://<prod-origin>/admin/auth/callback`, `https://<dev-origin>/admin/auth/callback` | Locks magic-link redirects to the founder admin callback. |
| Session lifetime / JWT expiry | **12 hours** | Per Phase 1 security review §3.6. Source of truth is the Supabase Auth project setting; the app code does not enforce expiry beyond what Supabase issues. |

## Where to set values

| Environment | Where | Notes |
|---|---|---|
| Local development | `.env.local` (gitignored) | Use placeholder Supabase project keys; do not paste production secrets. |
| Vercel `prod` | Vercel project → Settings → Environment Variables → Production | Set by the founder, not by an agent. |
| Vercel `dev` (preview/dev project) | Same dashboard, Development scope | Set by the founder. |
| CI | GitHub Actions / Vercel — only when CI ships | Not in Phase 1. |

The manual smoke runbook ([`phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md)) is the canonical procedure for setting these values for the first time.

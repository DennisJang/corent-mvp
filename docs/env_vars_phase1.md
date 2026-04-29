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
| `SUPABASE_URL` | Supabase project URL (Seoul `ap-northeast-2`). | `src/server/analytics/supabase.ts` | Service-role client returns `null` → analytics writer fails closed (`/api/events` returns 503), admin dashboard renders disabled state. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Bypasses RLS. Used by analytics writer + admin reader. **Never `NEXT_PUBLIC_*`.** | `src/server/analytics/supabase.ts` | Same fail-closed behavior as above. |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | Comma-separated email allowlist for the founder admin dashboard. | `src/server/analytics/env.ts` (read by `src/server/admin/auth.ts`) | Empty / missing → every admin request fails closed (returns 404). |
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
- **No fallback** invents a default credential. Missing env → fail closed.

## Where to set values

| Environment | Where | Notes |
|---|---|---|
| Local development | `.env.local` (gitignored) | Use placeholder Supabase project keys; do not paste production secrets. |
| Vercel `prod` | Vercel project → Settings → Environment Variables → Production | Set by the founder, not by an agent. |
| Vercel `dev` (preview/dev project) | Same dashboard, Development scope | Set by the founder. |
| CI | GitHub Actions / Vercel — only when CI ships | Not in Phase 1. |

The manual smoke runbook ([`phase1_analytics_smoke_test.md`](phase1_analytics_smoke_test.md)) is the canonical procedure for setting these values for the first time.

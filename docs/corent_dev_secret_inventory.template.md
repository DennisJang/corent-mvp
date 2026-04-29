# CoRent Dev Secret Inventory — Redacted

Do not paste secret values into this file.

This is a **template**. Copy it to a working filename that is **not**
committed (e.g. `corent_dev_secret_inventory.local.md`, or copy it
outside the repo entirely) and fill yes/no answers only. The committed
template stays redacted forever.

The inventory exists so the founder can audit "is this set in the
right place?" without ever writing down a real value.

Do **not**:

- write any anon key, service-role key, JWT, or password into this
  file or its copies,
- paste the contents of `.env.local` here,
- paste real Supabase URLs or refs unless explicitly OK with that
  (refs are low-sensitivity but still uniquely identify the project).

Cross-references:
[`docs/corent_dev_environment_setup.md`](corent_dev_environment_setup.md),
[`docs/env_vars_phase1.md`](env_vars_phase1.md).

---

## Supabase Dev

- Project name:
- Project ref:
- Region:
- Project URL stored in:
  - `.env.local`: yes/no
  - Vercel Development: yes/no
  - Vercel Preview: yes/no
- Anon key stored in:
  - `.env.local`: yes/no
  - Vercel Development: yes/no
  - Vercel Preview: yes/no
- Service role key stored in:
  - `.env.local`: yes/no
  - Vercel Development: yes/no
  - Vercel Preview: yes/no
- Service role key exposed as `NEXT_PUBLIC_*`:
  - must be no
- Service role key reachable from any file under `src/components/**`:
  - must be no
- Phase 1 migration applied to dev project:
  - yes/no
- RLS enabled on `growth_events`:
  - must be yes
- RLS enabled on `sanitizer_rejections`:
  - must be yes
- Anon-role `select`/`insert` on either table denied (verified):
  - yes/no

## Vercel Dev

- Project name:
- Project id or slug:
- Production env touched:
  - must be no
- `ENABLE_ANALYTICS_BETA` value in Development:
  - must be `false`
- `ENABLE_ANALYTICS_BETA` value in Preview:
  - must be `false` (or unset)
- `ENABLE_ANALYTICS_BETA` value in Production:
  - must be unset / `false`
- Vercel Deployment Protection enabled on `/admin/*`:
  - yes/no
- Vercel Deployment Protection treated as the auth boundary:
  - must be no (it is the soft outer gate only; magic-link + allowlist is the boundary)

## Auth

- Founder email allowlist configured:
  - yes/no
- Founder email allowlist contains exactly one entry:
  - yes/no
- Founder user created in Supabase Auth:
  - yes/no
- Founder user marked email-confirmed:
  - yes/no
- Public sign-ups disabled in Supabase Auth:
  - must be yes
- Email auth provider enabled:
  - yes/no
- Other auth providers (GitHub, Google, phone, etc.) enabled:
  - must be no for Phase 1
- Local callback URL `http://localhost:3000/admin/auth/callback` allowlisted:
  - yes/no
- Vercel preview/dev callback URL `https://<corent-dev>.vercel.app/admin/auth/callback` allowlisted:
  - yes/no
- JWT / session expiry set to 12h:
  - yes/no

## `.env.local`

- File created from `.env.local.example`:
  - yes/no
- File is gitignored (run `git check-ignore .env.local`):
  - must be yes
- File contains real values for all five env vars in §1 of the dev
  environment setup doc:
  - yes/no
- `ENABLE_ANALYTICS_BETA=false` is the only value for that variable in
  the file:
  - must be yes

## Smoke verification (high-level)

- Local `npm run dev` starts cleanly:
  - yes/no
- Unauthenticated `/admin/dashboard` returns 404:
  - must be yes
- Allowlisted founder magic-link sign-in succeeds end-to-end:
  - yes/no
- Non-allowlisted email sign-in returns identical generic response and
  no email arrives:
  - must be yes
- `/admin/auth/callback` rejects open-redirect `next` values:
  - must be yes
- `/api/events` returns 204 with `ENABLE_ANALYTICS_BETA=false`:
  - must be yes
- `/privacy` and `/terms` render and contain no banned regulated
  language (`insurance` / `보험` / `보장`):
  - must be yes

## Notes

- Pending manual actions:
- Last verified date:
- Verified by:
- Anything that should rotate within 90 days (key rotation reminder):

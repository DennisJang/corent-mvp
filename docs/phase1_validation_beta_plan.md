# CoRent Phase 1 — Instrumented Validation Beta Plan

_Recorded: 2026-04-30_

**Inputs that govern this plan** (priority order on conflict):
[`db_readiness_audit_v1.md`](db_readiness_audit_v1.md) (Phases / Risk model / Schema),
[`corent_product_direction_v2.md`](corent_product_direction_v2.md) (Korea-wide, fee model, design maturity, flow-first),
[`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) (no-revenue posture, runtime modes, metrics),
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) (intermediary role, no wallet, regulated-language ban),
[`corent_security_gate_note.md`](corent_security_gate_note.md) (DB integration triggers a security review),
[`corent_defensibility_note.md`](corent_defensibility_note.md) (private vs. public assets).

**Repo state at write time:** `main`, 18 commits ahead of `origin/main`, working tree clean. Latest commit `e1dcec3 docs: add db readiness audit v1`.

**This plan is docs-only.** No code, no DB, no auth, no payment, no upload, no location, no dependencies, no migrations, no app behavior changes are produced by this commit. Every implementation item below is **gated** on:

1. acceptance of this plan,
2. a security-review note per [`corent_security_gate_note.md`](corent_security_gate_note.md) (Phase 1 trips the **real DB integration** trigger and the **AI/admin tooling** trigger), and
3. explicit user approval of the resulting implementation PR.

---

## 0. Purpose

Translate Phase 1 from [`db_readiness_audit_v1.md` §13](db_readiness_audit_v1.md) into the smallest possible **execution plan** that can be picked up by a single implementation PR after the security-review note clears.

Phase 1 is the **first** time CoRent leaves the user's browser tab. It must do exactly one new thing — write sanitized, anonymized funnel events to a server-side store and read aggregates back into a founder-only dashboard — and nothing else.

If during implementation any item in this plan grows beyond one route handler, one table, one server module, and one admin page, **stop and revise the plan, do not expand the PR**.

---

## 1. Phase 1 Goal & Boundary

### Goal

Collect sanitized demand signals from real public-traffic visitors so the next set of product decisions (categories, regions, deposit acceptance, registration friction) can be made against data, not opinion. Per [`corent_pre_revenue_beta_plan.md` §2](corent_pre_revenue_beta_plan.md), this is the source of CoRent's defensible asset.

### What Phase 1 explicitly is

- One Supabase project (Seoul region) holding **one analytics table** (`growth_events`), one sanitizer module, one ingestion endpoint, one founder admin dashboard with read-only aggregate views.
- A privacy/terms copy surface visible from the first public load.

### What Phase 1 explicitly is NOT

- Not a real user database. No `users`, no `profiles`, no `listings`, no `rental_intents` server-side. Listings, rentals, and search persistence stay in `localStorage` exactly as today.
- Not auth for end users. No sign-in surface for borrowers or lenders. The only authenticated identity is the founder, scoped to the admin dashboard.
- Not payment, not deposit, not settlement, not upload, not location, not LLM, not partner integration.
- Not the external partner/investor dashboard. That is Phase 2+ and depends on materialized snapshots after the funnel has data.

### The flag posture

Per [`corent_pre_revenue_beta_plan.md` §3](corent_pre_revenue_beta_plan.md), the runtime is `PRE_REVENUE_BETA = on` and every `ENABLE_*` flag is off. **Phase 1 does not change this.** The only "new" behavior — analytics writes — is gated on a new flag introduced in Phase 1:

- `ENABLE_ANALYTICS_BETA` — defaults **off**. Turning it on enables the client→server event POST path. Founder admin dashboard authentication is independent (see §7 below).

The flag is documented here as a Phase 1 specification; **its actual implementation is part of the Phase 1 code PR**, not this docs PR.

---

## 2. Stack & Hosting Decisions

These pin choices that the audit deliberately deferred.

### Database host

- **Supabase**, **single project**, **`ap-northeast-2` (Seoul) region**. Picked for in-Korea data residency, matching Korea-wide product direction and reducing the legal posture for Phase 2 PII expansion.
- One project for `dev` (ephemeral, anyone can recreate locally via Supabase CLI), one project for `prod`. **No staging in Phase 1** — concierge ops scale doesn't justify a third environment yet, and an "almost-prod" project is itself a leak surface. Add staging at Phase 2.

### Server runtime

- **Vercel**, single Next.js App Router project (the existing `corent-mvp` repo).
- **Region:** Vercel functions auto-route; explicitly pin `seoul1` (or `icn1`) for the analytics route handler so the round-trip stays in-region.

### Database client

- **`@supabase/supabase-js`** server-side, imported only from `src/server/**`.
- **No Supabase client on the browser.** The browser POSTs to `/api/events`; the route handler is the only writer.
- **Service-role key** kept server-side, used only by the analytics writer (which needs to bypass any RLS during insert) and by admin dashboard reads. Never imported from `src/app/**` outside of route handlers / server actions, never imported from `src/components/**`.

### Environment variable split

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Public Supabase URL. Audited as non-sensitive. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon key. Browser **does not** read or write Supabase directly in Phase 1, but the constant is kept for future use. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Used by the analytics writer module and admin dashboard server module. |
| `ANALYTICS_INGEST_SHARED_SECRET` | **server only** + browser via build-time public env | Cheap forgery defense on `/api/events` (token rotates). Documented as **not** a security boundary; rate limit + sanitizer are the actual defense. |
| `FOUNDER_ADMIN_EMAIL_ALLOWLIST` | **server only** | Comma-separated email allowlist for the magic-link admin login (single email at first). |
| `VERCEL_DEPLOYMENT_PROTECTION_PASSWORD` | Vercel project setting | Optional outer gate on `/admin/*` routes during Phase 1. Not the auth layer. |

CI rule (documented; CI itself is Phase 4 work): a build that introduces any `NEXT_PUBLIC_*` matching the deny-list `(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI)` fails.

### Hosting portability

- The choice of Supabase + Vercel is preferred but every code path that writes to the DB lives behind the existing `PersistenceAdapter`-style boundary. A future migration to Postgres-on-Cloud-Run or any other host requires re-implementing the writer, not the application.
- **Phase 1 does not attempt full portability.** It uses Supabase APIs directly; if portability becomes critical, Phase 2 introduces a thin repository layer.

---

## 3. Allowed Sanitized Analytics Events

The full event-type list. Each row is a `growth_event_type` enum value (per [`db_readiness_audit_v1.md` §5.2](db_readiness_audit_v1.md)). **No other event types are permitted in Phase 1.** Adding one requires a docs PR updating this table.

| `growth_event_type` | When fired | Allowed properties (sanitized) |
|---|---|---|
| `landing_visited` | Any visit to `/`. | `referrer_kind`, `device_class`, `language` |
| `search_submitted` | Form submit on `AISearchInput`. | `category`, `duration_days`, `region_coarse`, `price_band`, `had_query` (bool) |
| `search_filter_changed` | Filter chip / duration radio click on `/search`. | `filter_kind`, `category`, `duration_days` |
| `category_chip_clicked` | Category chip click on landing or `/search`. | `category` |
| `listing_view` | Server render of `/items/[id]` server-component (or client mount of `ItemDetailClient`). | `category`, `duration_days_default`, `price_band_3d` |
| `duration_selected` | Duration change on item detail page. | `category`, `duration_days` |
| `request_clicked` | The "대여 요청하기" button is clicked, before submission. | `category`, `duration_days`, `price_band` |
| `request_submitted` | `rentalService.create(...)` succeeds locally (Phase 1: localStorage write). | `category`, `duration_days`, `price_band`, `had_pickup_label` (bool) |
| `seller_registration_started` | First open of `/sell` route. | `device_class` |
| `seller_registration_submitted` | `listingService.submitForReview(...)` succeeds locally. | `category`, `condition`, `price_band_3d`, `pickup_region_coarse` |
| `dashboard_cta_clicked` | Any `/dashboard` action button. | `cta_kind` |
| `trust_explanation_opened` | Click on a trust panel reveal. | `panel_kind` |
| `waitlist_opt_in` | Form submit on a future waitlist surface. | `referrer_kind` |

### Property dictionaries (closed sets)

- `referrer_kind`: `direct | search | social | other`. (Coarse; never the raw URL.)
- `device_class`: `mobile | tablet | desktop`. From a server-side UA parse; UA string itself is not stored.
- `language`: ISO code top match from `Accept-Language`, restricted to `ko | en | other`.
- `category`: any enabled `CategoryId` from `src/domain/categories.ts`, plus `unknown`.
- `duration_days`: `1 | 3 | 7 | unknown`.
- `region_coarse`: `seoul | busan | incheon | gyeonggi | other_metro | non_metro | unknown`. **Never** below this granularity. District / address / neighborhood is **not** stored on a `growth_events` row.
- `price_band`: closed set of fixed bands (e.g. `under_10k | 10k_30k | 30k_70k | 70k_150k | over_150k | unknown`). Fixed at write time; never an exact KRW number.
- `filter_kind`: `category | duration | price | reset`.
- `cta_kind`, `panel_kind`: closed enums maintained next to this doc when those surfaces ship.
- `condition`: any `ItemCondition`.
- `pickup_region_coarse`: same set as `region_coarse`.
- `had_query`, `had_pickup_label`: boolean.

### Always-attached row fields

Every event row, regardless of type, carries:

- `id` (uuid).
- `event_kind` (the type above).
- `properties` (jsonb, restricted to the dictionary for that type).
- `region_coarse`, `category` (nullable promoted columns for fast aggregation).
- `at` (server timestamp; **not** the client clock).
- `session_hash` (HMAC-SHA-256 of `(session_cookie_random + server_secret)`, **not** a stable user id).
- `consent_state` (`granted | denied | unknown`).
- `event_schema_version` (string, currently `"v1"`).

### Defaults

- Whenever a property is missing, fill `unknown` rather than dropping the row.
- Whenever a property would fail dictionary validation, the sanitizer **drops the property** and logs a sanitizer-rejection event (admin-readable; the original event still goes through with the offending key removed).

---

## 4. Forbidden Data

The Phase 1 contract is **strictly anonymized funnel events**. The following are **never** stored, in any column, in any table, by any code path Phase 1 introduces.

### Identity

- Names (display name or otherwise).
- Emails.
- Phone numbers.
- National ID / Resident Registration Number / 주민등록번호 / any government identifier.
- Any partner / third-party account id that can re-identify a user.

### Contact

- Addresses (line 1, line 2, postal code, full street name).
- District-level location more granular than `region_coarse`. **No 구, 동, 읍, 면 in `growth_events`.**
- IP addresses (raw or hashed-to-stable). The cookie-derived `session_hash` is the only correlator.
- User-agent strings (raw). Server-side `device_class` parse is the only allowed extract.

### Financial

- Card numbers, BINs, last-4, CVV, expiry — **none of these can ever appear because no payment runs in Phase 1**, but the deny-list is documented so a future PR cannot accidentally reuse the events table for payment metadata.
- Bank account numbers / payout details.
- Exact amounts in KRW. Use `price_band` only.

### Trust / verification

- Serial numbers (private — separate column on a separate Phase 2 table).
- Raw verification photo bytes or thumbnails.
- Verification status tied to a real user (Phase 2+).

### Free text

- **Raw search input strings.** The user's natural-language query is the most defensible asset CoRent will collect (per [`corent_defensibility_note.md` §2](corent_defensibility_note.md)) **and** the most likely to contain unintended PII. Phase 1 stores only the **parsed structured outputs** (`category`, `duration_days`, `region_coarse`, `price_band`) — not the raw text.
- Any "notes", "comments", "messages" surface. None ship in Phase 1.

### Behavior

- Per-event coordinates (no GPS, no continuous location tracking).
- Cross-domain identifiers (no Google Analytics ids, no Meta Pixel ids, no third-party fingerprinting).

---

## 5. Event Schema Draft

Concrete shape of `growth_events`. **This is a specification only.** No SQL is written in this commit.

### Table

`public.growth_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `event_kind` | `growth_event_type` (PG enum) | Restricted to §3 list. Adding a value requires a docs PR + migration. |
| `event_schema_version` | `text` not null default `'v1'` | Forward compatibility. |
| `category` | `category_id` enum, nullable | Promoted from properties. |
| `region_coarse` | `region_coarse` enum, nullable | Promoted from properties. |
| `properties` | `jsonb` not null default `'{}'::jsonb` | Sanitizer-validated. |
| `at` | `timestamptz` not null default `now()` | Server clock. |
| `session_hash` | `text` not null | HMAC of session cookie + server secret. |
| `consent_state` | `consent_state` enum not null default `'unknown'` | `granted | denied | unknown`. |

### Constraints

- Check: `properties` must be a JSON object, not array or scalar.
- Check: `event_schema_version IN ('v1')`.
- Index: `(event_kind, at desc)` for most aggregations.
- Index: `(category, at desc)` for category funnel cuts.
- Index: `(region_coarse, at desc)` for regional cuts.
- Index: `(session_hash, at)` for session-pathing queries (admin only).
- **No** index on `properties` jsonb in Phase 1; revisit if a specific aggregation gets slow.

### RLS

- RLS **enabled** on the table.
- **No public read** policy. **No authenticated read** policy. **No public write** policy. **No authenticated write** policy.
- Reads happen only via the service-role key from the admin dashboard server module.
- Writes happen only via the service-role key from the analytics writer server module.
- The anon key cannot select from or insert into this table. **Verified by a unit test** that uses an anon Supabase client and asserts both `select` and `insert` fail.

### Other Phase 1 tables

- `public.sanitizer_rejections` — admin-only audit log for properties dropped by the sanitizer. Same RLS posture. Columns: `id`, `at`, `event_kind`, `dropped_keys text[]`, `reason`, `client_request_hash`. Helps diagnose whether the front-end is sending data the sanitizer is dropping.
- **No other tables in Phase 1.** Specifically, no `users`, no `sessions`, no `consents`. Consent acceptance is recorded inside `growth_events` rows (`consent_state`); a dedicated `consents` table waits for Phase 2 when there are user identities to attach it to.

---

## 6. Sanitizer Specification

The sanitizer is a single server-only module: `src/server/analytics/sanitize.ts` (proposed path). It is the **only** writer to `growth_events`.

### Allow-list per event type

Per `growth_event_type`, an explicit list of permitted property keys (matching §3). Any other key in the incoming payload is **dropped** and recorded in `sanitizer_rejections`. The event is still written with whatever survived plus the always-attached fields from §3.

Implementation note: the allow-list lives as a static const in the sanitizer module, **not** in the database. Schema validation is done in TypeScript before insert.

### Dictionary validation

Each allowed property has a closed set of acceptable values (§3 dictionaries). Values outside the set are coerced to `unknown` for enums or **dropped** for booleans / closed strings, with a `sanitizer_rejections` entry.

### Deny-list patterns

Even after the allow-list reduces the payload to an empty / minimal object, the sanitizer runs a final regex pass over **every string value** in the surviving `properties` and rejects (drops the property, records rejection):

- email pattern: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
- phone pattern (Korean shapes): `0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}`, `\+82[-.\s]?\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}`
- RRN pattern: `\d{6}[-\s]?\d{7}`
- card-like 16-digit pattern: `\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}`
- any string longer than 64 characters (raw text suspected)

**These patterns are belt-and-suspenders.** The allow-list per event type is the primary defense; the deny-list catches drift if the allow-list is widened carelessly.

### Test fixtures (future implementation; specified here)

The Phase 1 code PR must include tests that feed each of the following payloads through the sanitizer and assert both the resulting row shape and the `sanitizer_rejections` outcome.

1. **Clean** — every allowed property within dictionary, no surprises. Assert: row written verbatim, no rejection.
2. **Extra key** — payload includes `email: "user@example.com"`. Assert: key dropped, rejection logged with reason `not_in_allowlist`, row still written without the email.
3. **Out-of-dictionary value** — `category: "weapons"`. Assert: coerced to `unknown`, rejection logged with reason `out_of_dictionary`.
4. **Embedded PII in long string** — properties contain `note: "call me at 010-1234-5678 in 강남구"`. Assert: `note` dropped (not in allow-list anyway, plus deny-list match), rejection logged.
5. **Padded payload** — payload has 200 keys all named `__attempt_n`. Assert: payload size cap (e.g. 4 KB pre-sanitize) returns 413 from the route handler; nothing written.
6. **Wrong event_kind** — `event_kind: "secret_data_export"`. Assert: route handler returns 400; nothing written.
7. **Replay** — same `(session_hash, event_kind, properties hash, minute bucket)` posted twice. Assert: second write either deduped server-side or accepted as a separate event, **decision pinned in the code PR's docs**. (Phase 1 plan recommends accepting both — replays are part of the funnel.)
8. **Missing consent** — `consent_state: 'denied'`. Assert: row is written with `consent_state = 'denied'` but **the event_kind is forced to a single `analytics_denied` event**, no other properties stored. This way we can count refusals without recording behavior of refusers.

### Forbidden sanitizer behaviors

- **Sanitizer must never log the raw input** to `console`, to a file, or to any logger that ships off the box. If a rejection needs the original key for triage, it logs only the **key name**, not the value.
- Sanitizer must never persist a `properties` larger than a documented byte cap (initial: 2 KB serialized).
- Sanitizer must run **server-side only**. Importing it from `src/app/**/page.tsx` or `src/components/**` is a build-fail.

---

## 7. Internal Founder Dashboard v0

A single admin page with read-only aggregate views over `growth_events`. **No row-level browsing** in v0; only aggregates.

### Route

`app/admin/dashboard/page.tsx` — server component reading aggregates via the server-side admin Supabase client. **All data fetching server-side.** No client component imports the admin client.

### Auth

Two layers. The dashboard is **not** a public-traffic surface and a single mistake here would leak the most defensible asset CoRent has, so defense in depth is required.

1. **Outer gate:** Vercel Deployment Protection password (project setting). Phase 1 v0 ships with this enabled on `/admin/*`. Documented as a soft gate, not the auth boundary.
2. **Inner gate:** Supabase Auth magic-link, restricted to a server-side env allowlist (`FOUNDER_ADMIN_EMAIL_ALLOWLIST`, comma-separated, single email at first). The magic-link redirect lands on a server action that checks the email against the allowlist; non-matches are 404'd (not 401, to avoid disclosing the admin surface exists).

The session token issued by Supabase Auth is the actual auth boundary. Vercel Deployment Protection alone is **not** sufficient.

### Metrics shown in v0

Plain HTML/CSS list (Swiss BW grid, matches existing design system). No charts, no JS data fetching after first paint.

| Tile | Aggregation | Period |
|---|---|---|
| Search volume | `count(*)` where `event_kind = 'search_submitted'` | last 24h, last 7d, last 30d |
| Top categories by search | `count(*)` grouped by `category` | last 7d, last 30d |
| Top regions by search | `count(*)` grouped by `region_coarse` | last 7d, last 30d |
| Listing-view CTR | `count(listing_view) / count(search_submitted)` | last 7d |
| Request submission rate | `count(request_submitted) / count(listing_view)` | last 7d |
| Seller registration funnel | `started → submitted` % | last 30d |
| Trust panel opens | `count(trust_explanation_opened)` | last 7d |
| Sanitizer rejection rate | `count(sanitizer_rejections) / count(growth_events)` | last 24h |
| Consent state mix | breakdown of `consent_state` | last 30d |

### Hard requirements

- **No row-level data is rendered.** No "click to see the 25 events behind this number" affordance in v0. Add it only when there is a documented operator workflow that requires it, with admin-action audit logging.
- **No PII fields**. The schema does not contain any, but the dashboard must additionally never reconstruct PII (e.g. by joining to another data source).
- **No exports**. No "download CSV" button in v0. Add only after admin-action audit logging exists.
- **Session timeout**: 12 hours.
- **Admin action audit log** is **deferred to Phase 2** because v0 is read-only. The moment a "delete event" / "merge sessions" / "edit row" affordance is contemplated, an `admin_actions` table from [`db_readiness_audit_v1.md` §5.1](db_readiness_audit_v1.md) becomes a hard prerequisite.

---

## 8. External Dashboard — Out of Phase 1

The partner / investor dashboard from [`db_readiness_audit_v1.md` §9.2](db_readiness_audit_v1.md) is **not** in Phase 1.

Reasons:

- There is no funnel data yet to publish. A two-week-old "external dashboard" with sparse rows is worse than no dashboard.
- The materialized snapshot table + manual approval gate is non-trivial. Building it before there is data inevitably means re-building it once the data shape stabilizes.
- The defensibility note explicitly restrains public exposure of category rankings and conversion data; Phase 1 does not need to expose any of that.

When Phase 2 considers the external dashboard, it will follow [`db_readiness_audit_v1.md` §9.2](db_readiness_audit_v1.md) and §14 ("Before external dashboard") gates verbatim.

---

## 9. Privacy / Legal Copy Requirements

The first time CoRent serves a public visitor with `ENABLE_ANALYTICS_BETA = on`, the following must be present.

### Banner

- First-load **dismissible** privacy banner (Korean + English).
- Two affordances: "동의 (granted)" / "거부 (denied)". A third "닫기" defaults to `consent_state: unknown` for that session.
- Dismiss state stored in a session cookie (no LocalStorage; the cookie is httpOnly-not-required — it is the consent record itself, not a credential).
- Re-shown when the privacy version changes (string `privacy_version`).

### Privacy notice page

- Route `/privacy`, statically generated.
- Discloses, in plain Korean and English:
  - what data is collected (sanitized funnel events from §3, with the deny-list from §4 stated explicitly);
  - that **no personally identifiable information** is collected, stored, or shared during the validation beta;
  - the data controller identity (CoRent + the founder, contact email);
  - retention windows (§10 below);
  - how a visitor can opt out (banner deny + browser-level "Do Not Track" honored as `consent_state: denied`);
  - that data is held in a Supabase project in the Seoul region;
  - that **no advertising trackers, no cross-site cookies, and no third-party analytics** are used.

### Terms page

- Route `/terms`, statically generated.
- States CoRent's **role**: C2C rental marketplace and transaction-state / trust-workflow layer; not the direct counterparty (per [`corent_legal_trust_architecture_note.md` §2](corent_legal_trust_architecture_note.md)).
- States the pre-revenue beta posture per [`corent_pre_revenue_beta_plan.md` §1](corent_pre_revenue_beta_plan.md): no platform fee, no payment integration, no deposit collection, no settlement/payout, no CoRent wallet, no advertising monetization, no subscription, no active paid-brokerage during the validation window.
- Includes the **regulated-language ban** explicitly: phrases like "insurance", "보험", "보장" do not appear on any page.

### Korean compliance posture

- Phase 1 collects **no PII** by contract. Under PIPA (개인정보 보호법), this falls below the threshold that requires written consent of identifiable users, but the disclosure obligation still applies. The privacy notice covers it.
- A **legal review of the privacy notice and terms by external counsel** is **strongly recommended before the first public-traffic load**, but is gated on user approval of cost. Documented as a Phase 1 acceptance gate (§12).
- If the legal review identifies a gap, the implementation PR must address the gap or roll back the public-traffic enablement.

---

## 10. Retention Policy

Concrete numbers, applied via a documented job (the job itself is implemented in the Phase 1 code PR; this plan only fixes the numbers).

| Surface | Retention | Mechanism |
|---|---|---|
| Raw `growth_events` rows | **18 months rolling** | Daily Vercel Cron deletes rows where `at < now() - interval '18 months'`. |
| `sanitizer_rejections` rows | **90 days rolling** | Same job. Short retention because they are diagnostic, not analytical. |
| Aggregated dashboard reads | indefinite | Computed live; not stored separately in Phase 1. |
| Privacy banner consent (cookie) | **365 days** or until version bump | Cookie expiry; no server record. |
| Founder admin session | **12 hours** | Supabase Auth session lifetime. |

A row that is **deleted by retention is gone**. There is no soft-delete in Phase 1.

If a partner / investor / journalist requests the underlying data, the answer is "we hold sanitized aggregates only, by policy, with the retention windows above". This is the position [`corent_defensibility_note.md` §3](corent_defensibility_note.md) calls for: **lead with validated demand data, not raw event logs.**

---

## 11. Implementation Gates Before Any Future Code PR

Each gate is binary — pass / not pass. **Every gate must pass before a code PR for Phase 1 is merged.** The code PR may be **drafted** while these are in flight, but not merged.

### Documentation gates

- [ ] This plan (`docs/phase1_validation_beta_plan.md`) is committed and approved.
- [ ] A dedicated **security review note** for Phase 1 surfaces is committed at `docs/corent_security_review_phase1_<date>.md`, structured per [`corent_security_gate_note.md` §3](corent_security_gate_note.md). Triggers tripped: **real DB integration** (Supabase + new table), **real auth/session** (founder admin magic-link).
- [ ] The privacy notice copy and terms copy (Korean + English) are reviewed by external counsel **or** an explicit user decision is recorded that legal review is deferred until Phase 2 with documented residual risk.
- [ ] The sanitizer specification (§6) is approved as the contract; the code PR's tests must implement every fixture from §6 verbatim before merge.

### Project / hosting gates

- [ ] A Supabase project is created in `ap-northeast-2` (Seoul), separate from any other CoRent project, by the user (not by an agent).
- [ ] The Vercel project's Deployment Protection password is set on the `/admin/*` route group.
- [ ] `FOUNDER_ADMIN_EMAIL_ALLOWLIST` is set to the founder's email only.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set as a server-only env var on Vercel.
- [ ] A docs-only env var manifest (`docs/env_vars_phase1.md` or similar) exists listing every env var, scope, and purpose.

### Code-shape gates (specified here, verified during code review)

- [ ] Server-only modules live under `src/server/**`. The build fails if any `src/app/**/page.tsx` or `src/components/**` imports `src/server/**`.
- [ ] Service-role Supabase client is imported only from `src/server/supabase/admin.ts` and is reachable from at most two call sites: the analytics writer and the admin dashboard reader.
- [ ] `RLS` is enabled on `growth_events` and `sanitizer_rejections`. A unit test creates an anon client and asserts both tables refuse `select` and `insert`.
- [ ] An integration test asserts that posting a forged `event_kind` returns 400; posting a payload over 4 KB returns 413; posting an unknown property is dropped (not rejected as a whole event).
- [ ] No `process.env.NEXT_PUBLIC_*` variable matches the deny-list regex `/(SERVICE_ROLE|SECRET|PRIVATE|TOSS|OPENAI)/i`. CI grep gate.
- [ ] No `console.log` of raw request bodies in `src/server/**`. The logger module (proposed) is the only allowed log path.

### Validation gates

- [ ] `npm run lint`, `npm run build`, `npm test` all green on the Phase 1 code PR before merge.
- [ ] Sanitizer test fixtures from §6 all pass.
- [ ] RLS denial test passes.
- [ ] Manual smoke test: open `/`, accept consent, submit a search, observe a single `search_submitted` row appears in the founder dashboard's last-24h tile within one minute, with `consent_state = 'granted'` and no PII.
- [ ] Manual smoke test: open `/`, decline consent, submit a search, observe a single `analytics_denied` row appears (per §6 fixture #8) with no other properties.

### Hard rejections

A code PR that does **any** of the following is rejected at review and rebased without merge:

- Adds a `users` / `profiles` / `listings` / `rental_intents` table or any equivalent persisting actual user data.
- Stores raw search text or any free-text payload field on a `growth_events` row.
- Imports the service-role Supabase client from `src/components/**` or any client component.
- Ships any `NEXT_PUBLIC_*` matching the deny-list.
- Changes any pricing / fee / domain logic in `src/`.
- Ships any insurance / 보험 / coverage language.
- Adds a dependency that is not strictly necessary for the analytics writer + admin reader (i.e. nothing beyond `@supabase/supabase-js` and possibly a small zod-like validator if one is introduced under separate approval).

---

## 12. Acceptance Checklist

The Phase 1 release is **accepted** (i.e. ready to receive public traffic with `ENABLE_ANALYTICS_BETA = on`) only when **all** of the following are true.

### Technical

- [ ] All gates in §11 are passed.
- [ ] The sanitizer is the only writer to `growth_events`. (`grep` test.)
- [ ] The admin dashboard renders all v0 tiles without errors against either an empty table or a seeded fixture set.
- [ ] Retention job is scheduled and has run at least once successfully on the dev project.
- [ ] Consent banner is reachable, dismissible, accessible (keyboard + screen reader pass on the banner and footer).
- [ ] Privacy and terms pages are statically generated and reachable from every public page footer.

### Operational

- [ ] Founder has logged into the admin dashboard via magic-link at least once and read each tile.
- [ ] The Supabase project's `prod` snapshot policy is enabled (daily backups for 7 days minimum).
- [ ] The Vercel deployment has the password protection on `/admin/*` confirmed by an unauthenticated visit.
- [ ] At least one full **incident runbook entry** exists in `docs/` for the case "the analytics endpoint starts returning 5xx" (the implementation PR may include the runbook as a sub-document).

### Privacy / legal

- [ ] Privacy notice version `v1` is committed, dated, and matches the deployed copy.
- [ ] Terms page version `v1` is committed, dated, and matches the deployed copy.
- [ ] External legal review either complete or deferred-with-documented-decision.
- [ ] No regulated-language ("insurance", "보험", "보장", etc.) appears anywhere on the deployed site.

### Defensibility

- [ ] Founder admin dashboard is **not** publicly reachable (verified by an unauthenticated visit returning a 404 / Vercel auth wall).
- [ ] No partner / investor dashboard surface is deployed.
- [ ] No category ranking, scoring model, or fee logic is published.

---

## 13. Recommended Next PR After This Plan

A single docs-only PR: **`docs: add phase 1 security review`**.

- File: `docs/corent_security_review_phase1_2026-04-30.md` (date set when written).
- Format: per [`corent_security_gate_note.md` §3](corent_security_gate_note.md).
- Triggers it covers: real DB integration (Supabase + analytics table), real auth/session (founder admin magic-link).
- Areas it must address (subset of [`corent_security_gate_note.md` §2](corent_security_gate_note.md)) — for the Phase 1 surfaces only, with each non-applicable area marked "not in scope of this gate; revisit at Phase 2":
  - **Auth / session model**: Supabase magic-link + email allowlist; rotation; revocation on env removal.
  - **DB row-level access**: RLS deny-by-default on the two new tables.
  - **Renter / lender private data separation**: not in scope (no users in Phase 1).
  - **Contact / address reveal rules**: not in scope.
  - **Photo proof file access control**: not in scope.
  - **Payment webhook verification**: not in scope.
  - **Admin permission separation**: yes — founder is the only admin role; no per-action distinctions in v0.
  - **Audit logs**: read-only dashboard; admin-action audit deferred to Phase 2 with documented justification.
  - **Rate limiting**: yes — `/api/events` per-IP and per-session-hash limits.
  - **Abuse / spam prevention**: yes — the rate limit + sanitizer are the defense; external bot defense (Cloudflare Turnstile or similar) is **not** in Phase 1.
  - **Privacy retention / deletion policy**: yes — §10 above.
- Approval gate: per [`agent_loop.md`](agent_loop.md), the user is the only final approver. The security review note must be explicitly approved before the implementation PR is merged.

After the security review note is approved, the **next** PR is the implementation PR for Phase 1 itself. **That PR will be a code PR**, not docs-only, and is the first time this repo introduces server-side persistence.

---

## 14. Out of Scope

Items that look like they might belong here but **do not**.

- Mock-AI-parser tests (`codex/mock-ai-parser-tests`) — still queued in [`today_queue.md`](today_queue.md). Independent of Phase 1; runs on Codex without user approval, but cannot be merged without user approval. Order is your choice.
- Domain `region` literal type widening (`"seoul"` → enum). Tracked in [`db_readiness_audit_v1.md` §2](db_readiness_audit_v1.md) as a Phase 2 alignment item. Phase 1 does not need it because `growth_events` carries `region_coarse` independently.
- `CURRENT_SELLER` retirement. Tracked in [`db_readiness_audit_v1.md` §2](db_readiness_audit_v1.md). Cannot be retired in Phase 1 — it is the only "logged-in identity" the app has, and the app continues to operate in `localStorage`-only mode for end users.
- Fee-formula alignment in [`src/lib/pricing.ts`](../src/lib/pricing.ts) (`COMMISSION_RATE = 0.1` vs. v2 target `3% + fixed`). Tracked in audit §2 as intentional debt; updated only as part of the launch-mode PR with `fee_version` per-row pinning.
- Real waitlist surface UI. Even though `waitlist_opt_in` is in §3's event list, the waitlist form itself is **a separate small surface PR** that the implementation PR may or may not include.
- `external_dashboard_snapshots` table (Phase 2+).
- `admin_actions` audit table (Phase 2+, when admin writes exist).
- AI parser real LLM swap (Phase 3+).
- Toss Payments wiring (Phase 3+).
- `npm run typecheck` / dedicated CI workflow — Phase 4+ unless a Phase 1 failure mode justifies it earlier.

---

## 15. Final Notes

### What this plan declares

Phase 1 is **one Supabase project, one analytics table, one sanitizer module, one ingestion endpoint, one founder admin dashboard, two static legal pages**. Anything bigger than this is not Phase 1.

### What this plan does not declare

This plan does not specify:

- the exact CSS / layout of the founder dashboard tiles (BW Swiss Grid foundation per [`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md));
- the precise JSON shape of every `properties` payload (the dictionaries in §3 + sanitizer in §6 are sufficient; the code PR may finalize names);
- the rate-limit numbers (the security review note pins them);
- the exact wording of the privacy / terms copy (the implementation PR drafts; legal reviews).

### What this plan accepts as residual risk

- **Soft outer auth gate** on `/admin/*` (Vercel Deployment Protection) is not the boundary; the magic-link is. If the magic-link auth path has a bug, the soft gate is the only thing standing. Risk is acknowledged; mitigation is the security review note.
- **No external bot defense.** Phase 1 relies on the rate limiter + the sanitizer. A motivated bot could pollute the funnel; aggregates would still be useful but distorted. Acceptable for the validation goal; Phase 2 reconsiders.
- **No 3rd-party analytics, no marketing tools.** This is a feature, not a gap.

### What happens if a hard problem appears mid-Phase-1

The Phase 1 code PR is small enough to revert in a single commit. If the implementation hits a real obstacle (a sanitizer pattern that misclassifies a major user input shape, a Supabase region issue, an auth flow that loops), the response is **stop, document, revise this plan, then resume**, not "expand the PR".

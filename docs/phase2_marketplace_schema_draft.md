# Phase 2 Marketplace Schema Draft

Status: **DRAFT**, dev-only.
Source migration: [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql)
Target project: `corent-dev` (region `ap-northeast-2`).
Production: NEVER applied.

This document is the prose companion to the Phase 2 SQL migration. It
describes each table's purpose, sensitivity level, intended read/write
posture, and the future-policy direction. The migration itself enables
RLS on every table and adds **no permissive policies** — every read and
write today goes through the server-only service-role client.

The Phase 2 draft is intentionally narrow. It does not include:

- payments, deposit holds, settlements, payouts (see
  `docs/corent_legal_trust_architecture_note.md` §1, §3)
- identity documents / RRN / phone numbers (see
  `docs/corent_security_gate_note.md`)
- photo/file storage (see security gate)
- exact pickup location / GPS (see legal/trust note §5)
- AI parser logs (forward-only target)
- external partner / investor dashboard snapshots (defensibility note)

If a future Phase 2.x increment requires any of those, it must come with
a security review note first.

---

## Table inventory

| Table                   | Purpose                                                  | Sensitivity | Default RLS    | Future direction |
| ----------------------- | -------------------------------------------------------- | ----------- | -------------- | --------------- |
| `profiles`              | 1:1 with `auth.users`. Email + display name only.        | Medium      | Deny all       | Owner reads self via `auth.uid()` |
| `seller_profiles`       | Seller-specific metadata.                                | Low         | Deny all       | Owner reads/writes self           |
| `borrower_profiles`     | Borrower-specific metadata.                              | Low         | Deny all       | Owner reads/writes self           |
| `listings`              | Public-facing rentable item.                             | Low         | Deny all       | Public read where `status='approved'` via `listings_public` view |
| `listing_secrets`       | Owner+admin-only listing data (private serial, internal pickup hint). | High | Deny all | Admin-only reads; owner read via dedicated server endpoint |
| `listing_versions`      | Append-only listing edit history.                        | Low         | Deny all       | Admin-only reads                  |
| `listing_verifications` | Per-listing verification state + safety code + checks.   | Low         | Deny all       | Owner reads self listing's row    |
| `rental_intents`        | Central transactional row for a rental.                  | Medium      | Deny all       | Borrower/seller read own; admin read all |
| `rental_events`         | Append-only state-transition log.                        | Low         | Deny all       | Borrower/seller read own intent's events |
| `admin_reviews`         | Founder/admin review queue (listings, rental_intents).   | Low         | Deny all       | Admin-only                        |
| `admin_actions`         | Append-only admin action audit log.                      | Low         | Deny all       | Admin-only                        |

Plus one view:

| View                | Purpose                                  | Granted? | Notes |
| ------------------- | ---------------------------------------- | -------- | ----- |
| `listings_public`   | Sanitized public read shape for listings. | **Not granted to anon in Phase 2.** Granting requires a passing security review. |

---

## Sensitivity model

PII and trust-relevant fields by table:

- `profiles.email` — PII (email). Today: never read by anon. Tomorrow:
  may be read only by the row owner (matched on `auth.uid() = id`) and
  by the founder admin role. Never exposed in `listings_public`.
- `profiles.display_name` — soft PII (handle). Bounded length. May
  appear on a future public listing card.
- `listing_secrets.private_serial_number` — HIGH sensitivity. Never
  joined into a public read. Admin-and-owner only.
- `listing_secrets.pickup_area_internal` — internal-only coarse pickup
  hint. NOT a full address. NOT GPS. Never joined into a public read.
- `rental_intents.borrower_display_name` / `seller_display_name` — soft
  PII; cached for admin UIs. Bounded to 60 chars.
- `rental_intents.pickup_location_label` — coarse pickup label, not an
  address. Bounded to 60 chars. May surface to the borrower/seller of a
  given intent in a future read policy; not exposed in any public view.
- `admin_actions.actor_email` — admin email captured redundantly so the
  audit log survives if the actor's profile is later deleted.

Fields **deliberately not present** in this schema:

- phone number
- full street address
- national ID / RRN / KYC document references
- payment / card / bank account credentials
- exact GPS coordinates
- session tokens / refresh tokens
- raw AI parser prompts/responses

---

## RLS posture

Every Phase 2 table has RLS enabled and **no permissive policies** in
this draft. anon and authenticated roles are denied by default; the
service-role client (server-only) bypasses RLS for reads/writes. As
defense in depth, the migration also explicitly `revoke all` from anon
and authenticated on every Phase 2 relation.

Why "deny all" and not "owner can read self":

- Phase 2 is a draft. The owner-read-self policy depends on the auth
  surface being fully active across the marketplace — which it is not
  yet (only the founder admin route uses Supabase Auth).
- A future migration adds the narrow policies in one reviewable step,
  after the security review for owner-read flows is on file.
- Deny-by-default is consistent with the Phase 1 analytics tables
  (`growth_events`, `sanitizer_rejections`) which are also deny-all.

### Future policy sketches (NOT applied)

These are intentional placeholders. They are documented so the next
migration is a small diff rather than a redesign.

```sql
-- profiles: owner reads self
create policy profiles_owner_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- listings: public read of approved rows via the sanitized view
grant select on public.listings_public to anon, authenticated;
-- (The view's underlying query is already restricted to status=approved.)

-- listing_verifications: owner reads self listing's row
create policy listing_verifications_owner_read on public.listing_verifications
  for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_verifications.listing_id
        and l.seller_id = auth.uid()
    )
  );

-- rental_intents: borrower or seller reads own
create policy rental_intents_party_read on public.rental_intents
  for select to authenticated
  using (borrower_id = auth.uid() or seller_id = auth.uid());

-- rental_events: party can read events for their own rental_intent
create policy rental_events_party_read on public.rental_events
  for select to authenticated
  using (
    exists (
      select 1 from public.rental_intents ri
      where ri.id = rental_events.rental_intent_id
        and (ri.borrower_id = auth.uid() or ri.seller_id = auth.uid())
    )
  );
```

Each policy above must be reviewed individually before being applied.
The view-grant is the only one that touches anon and is the single
biggest blast radius in the future migration.

---

## Constraints summary

The schema leans on Postgres CHECK constraints rather than only on
adapter-side validation. Defense in depth: even if a trusted client is
ever added later, the database itself rejects:

- negative or unbounded prices / amounts
- enum values outside the explicit set
- emails that obviously don't match `local@host`
- safety codes that don't match the `LETTER-DIGITS` shape
- arrays larger than the documented cap
- `text` columns longer than the documented cap
- malformed JSON shapes (non-object metadata / snapshot)

These constraints exist because **the Phase 2 adapters do not trust
client-supplied numeric/enum/text values**. Tests under
`src/server/persistence/supabase/*.test.ts` assert this from the
adapter side; the constraints catch any drift.

---

## Forward-compatibility notes

- The `rental_intent_status` enum carries the full Stripe-style state
  set including failure states even though Phase 2 draft only writes a
  small subset. Adding states later is an `alter type ... add value`,
  which is forward-compatible.
- `payment_provider`, `payment_status`, settlement, and pickup status
  columns are kept as `text` with explicit `check (... in (...))`
  constraints rather than enums. This keeps the migration smaller and
  lets the Phase 3 payment-integration migration replace them with
  enums in one reviewable step.
- `listing_versions.snapshot_version` is a free-text column with a
  current allowed value of `'v1'`. Adding `'v2'` is a one-line check
  constraint update.

---

## What this schema does NOT do

- It does not delete or alter the Phase 1 analytics tables
  (`growth_events`, `sanitizer_rejections`).
- It does not grant any privilege to anon.
- It does not run any DELETE / TRUNCATE.
- It does not write any seed data.
- It does not register any external-system dependency.

---

## Rollback notes

The migration is additive. A rollback path is:

```sql
drop view if exists public.listings_public;
drop table if exists public.admin_actions cascade;
drop table if exists public.admin_reviews cascade;
drop table if exists public.rental_events cascade;
drop table if exists public.rental_intents cascade;
drop table if exists public.listing_verifications cascade;
drop table if exists public.listing_versions cascade;
drop table if exists public.listing_secrets cascade;
drop table if exists public.listings cascade;
drop table if exists public.borrower_profiles cascade;
drop table if exists public.seller_profiles cascade;
drop table if exists public.profiles cascade;
drop function if exists public.set_updated_at();
drop type if exists public.region_coarse_marketplace;
drop type if exists public.item_condition;
drop type if exists public.admin_action_type;
drop type if exists public.admin_review_status;
drop type if exists public.rental_intent_status;
drop type if exists public.listing_verification_status;
drop type if exists public.listing_status;
```

Rollback is dev-only and requires explicit founder approval. **Phase 1
analytics tables and types must not be dropped by a Phase 2 rollback.**

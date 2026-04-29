-- Phase 2 marketplace schema DRAFT (dev-only).
--
-- Purpose
--   Lay down the Postgres / Supabase shape of the core CoRent marketplace
--   domain so a Concierge DB Beta has a real backend to point at. This is
--   a DRAFT: it intentionally excludes payments, deposits, settlements,
--   payouts, identity documents, photo uploads, exact pickup locations,
--   external-dashboard snapshots, and AI-parser logs — all of which are
--   gated by the security review (docs/corent_security_gate_note.md) and
--   the pre-revenue beta plan (docs/corent_pre_revenue_beta_plan.md).
--
-- Posture
--   - Applied only to the dev project `corent-dev` (region ap-northeast-2).
--     Never to a production project.
--   - RLS enabled on every table with NO permissive policies. anon and
--     authenticated roles are denied by default. The service-role client
--     (server-only) bypasses RLS for reads/writes.
--   - Public listing reads will eventually go through a sanitized view +
--     a narrow SELECT policy. For Phase 2 draft, that view is documented
--     but not granted to anon.
--   - PII is minimized. No phone numbers, no full addresses, no exact
--     pickup coordinates, no national IDs / RRN, no payment credentials.
--     Private serial numbers, when stored, live in `listing_secrets`
--     which is service-role-only and never joined into public reads.
--
-- References
--   - docs/db_readiness_audit_v1.md
--   - docs/phase2_marketplace_schema_draft.md (companion doc)
--   - docs/phase2_backend_integration_draft.md (overview)
--   - docs/corent_security_gate_note.md
--   - docs/corent_security_review_phase1_2026-04-30.md
--   - docs/corent_legal_trust_architecture_note.md
--   - docs/corent_pre_revenue_beta_plan.md
--   - docs/corent_functional_mvp_intent_rules.md (RentalIntent state shape)
--   - src/domain/intents.ts (TypeScript domain model)

-- =====================================================================
-- Idempotency guards
--
-- This migration is safe to re-apply against an empty dev project. It
-- does NOT drop existing Phase 1 tables (`growth_events`,
-- `sanitizer_rejections`) and never alters them.
-- =====================================================================

-- =====================================================================
-- Enums
-- =====================================================================

-- Mirrors src/domain/intents.ts ListingStatus.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum (
      'draft',
      'ai_extracted',
      'verification_incomplete',
      'human_review_pending',
      'approved',
      'rejected'
    );
  end if;
end $$;

-- Mirrors src/domain/intents.ts VerificationStatus.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'listing_verification_status') then
    create type public.listing_verification_status as enum (
      'not_started',
      'pending',
      'submitted',
      'ai_checked',
      'human_review_pending',
      'verified',
      'rejected'
    );
  end if;
end $$;

-- Mirrors src/domain/intents.ts RentalIntentStatus, including failure
-- states. Even though payment is not implemented, the enum carries
-- payment-related states so future transitions are forward-compatible.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rental_intent_status') then
    create type public.rental_intent_status as enum (
      'draft',
      'requested',
      'seller_approved',
      'payment_pending',
      'paid',
      'pickup_confirmed',
      'return_pending',
      'return_confirmed',
      'settlement_ready',
      'settled',
      'cancelled',
      'payment_failed',
      'seller_cancelled',
      'borrower_cancelled',
      'pickup_missed',
      'return_overdue',
      'damage_reported',
      'dispute_opened',
      'settlement_blocked'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'admin_review_status') then
    create type public.admin_review_status as enum (
      'pending',
      'in_review',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'admin_action_type') then
    create type public.admin_action_type as enum (
      'listing_approved',
      'listing_rejected',
      'rental_intervened',
      'dispute_resolved',
      'settlement_blocked',
      'settlement_unblocked',
      'note'
    );
  end if;
end $$;

-- Coarse region. Distinct from analytics' `region_coarse` so the two
-- enums can evolve independently. Matches docs/corent_legal_trust_architecture_note.md
-- §5 (no exact pickup location).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'region_coarse_marketplace') then
    create type public.region_coarse_marketplace as enum (
      'seoul',
      'busan',
      'incheon',
      'gyeonggi',
      'other_metro',
      'non_metro',
      'unknown'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'item_condition') then
    create type public.item_condition as enum (
      'new',
      'like_new',
      'lightly_used',
      'used'
    );
  end if;
end $$;

-- Reuses the Phase 1 `category_id` enum if already created. Phase 1
-- created it via supabase/migrations/20260430000000_phase1_analytics.sql.
-- Phase 2 does NOT redefine it; cross-table references work because the
-- type is in the same `public` schema.

-- =====================================================================
-- profiles
--   One row per Supabase Auth user. Email is the only identity column;
--   we deliberately do not store phone, full name, or any address. The
--   row id is the auth.users.id (uuid) so RLS policies can be expressed
--   in terms of `auth.uid()` without an extra join.
--
-- Sensitivity: medium. Email is PII; no other PII fields are present.
-- Read: service-role only at this stage. Future: owner can read self.
-- Write: service-role only at this stage.
-- =====================================================================

create table if not exists public.profiles (
  id            uuid primary key,
  email         text,
  display_name  text,
  region_coarse public.region_coarse_marketplace not null default 'unknown',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_email_shape
    check (email is null or email ~ '^[^@\s]{1,128}@[^@\s]{1,128}$'),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 60)
);

comment on table public.profiles is
  'CoRent profile (Phase 2 draft). 1:1 with auth.users by id. Email is the '
  'only PII column; phone/address/RRN are forbidden. RLS enabled, no '
  'public policy. dev-only.';

create index if not exists profiles_region_idx on public.profiles (region_coarse);

alter table public.profiles enable row level security;

-- =====================================================================
-- seller_profiles
--   Seller-specific metadata layered on top of `profiles`. A profile row
--   can have at most one seller_profile.
--
-- Sensitivity: low. No PII beyond what is already on profiles.
-- =====================================================================

create table if not exists public.seller_profiles (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,
  trust_note     text,
  trust_score    numeric(3,2),
  review_count   integer not null default 0,
  joined_at      date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint seller_profiles_trust_score_bounds
    check (trust_score is null or (trust_score >= 0 and trust_score <= 5)),
  constraint seller_profiles_review_count_nonneg
    check (review_count >= 0),
  constraint seller_profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 60),
  constraint seller_profiles_trust_note_length
    check (trust_note is null or char_length(trust_note) <= 240)
);

comment on table public.seller_profiles is
  'Seller-side metadata (Phase 2 draft). 1:1 with profiles. RLS enabled, '
  'no public policy. dev-only.';

alter table public.seller_profiles enable row level security;

-- =====================================================================
-- borrower_profiles
--   Borrower-specific metadata. Mirrors seller_profiles. Distinct table
--   so future borrower-only fields (preferred trust signal, default
--   region) can be added without touching seller rows.
--
-- Sensitivity: low.
-- =====================================================================

create table if not exists public.borrower_profiles (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,
  preferred_trust_signal text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint borrower_profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 60),
  constraint borrower_profiles_preferred_trust_signal_values
    check (preferred_trust_signal is null or preferred_trust_signal in
      ('verified_first', 'low_deposit', 'closest'))
);

comment on table public.borrower_profiles is
  'Borrower-side metadata (Phase 2 draft). 1:1 with profiles. RLS enabled, '
  'no public policy. dev-only.';

alter table public.borrower_profiles enable row level security;

-- =====================================================================
-- listings
--   Public-facing rentable item. The columns here are the ones a future
--   public read view would expose (after sanitization). Private items
--   (serial number, pickup address) live in `listing_secrets`, never on
--   this table, so a future public read policy can be added safely.
--
-- Sensitivity: low for `status='approved'` rows; medium otherwise.
-- Pricing is plaintext integer KRW.
-- =====================================================================

create table if not exists public.listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references public.profiles(id) on delete restrict,
  status          public.listing_status not null default 'draft',

  raw_seller_input text,
  item_name        text not null,
  category         public.category_id not null,
  estimated_value  integer not null,
  condition        public.item_condition not null default 'lightly_used',
  components       text[] not null default '{}',
  defects          text,
  pickup_area      text,
  region_coarse    public.region_coarse_marketplace not null default 'unknown',

  price_one_day    integer not null,
  price_three_days integer not null,
  price_seven_days integer not null,
  seller_adjusted_pricing boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Pricing must be non-negative and bounded — defends against the
  -- client-trusting adapter accidentally accepting a negative or
  -- absurd price.
  constraint listings_estimated_value_bounds
    check (estimated_value >= 0 and estimated_value <= 100000000),
  constraint listings_price_one_day_bounds
    check (price_one_day >= 0 and price_one_day <= 10000000),
  constraint listings_price_three_days_bounds
    check (price_three_days >= 0 and price_three_days <= 10000000),
  constraint listings_price_seven_days_bounds
    check (price_seven_days >= 0 and price_seven_days <= 10000000),
  constraint listings_item_name_length
    check (char_length(item_name) between 1 and 80),
  constraint listings_pickup_area_length
    check (pickup_area is null or char_length(pickup_area) <= 60),
  constraint listings_components_size
    check (array_length(components, 1) is null or array_length(components, 1) <= 12)
);

comment on table public.listings is
  'Public-facing listings (Phase 2 draft). NO private fields here — those '
  'live in listing_secrets. RLS enabled with NO permissive public policy '
  'in this draft; future read policy will be scoped to status=approved. '
  'dev-only.';

create index if not exists listings_status_updated_at_idx
  on public.listings (status, updated_at desc);
create index if not exists listings_category_status_idx
  on public.listings (category, status);
create index if not exists listings_seller_status_idx
  on public.listings (seller_id, status);

alter table public.listings enable row level security;

-- =====================================================================
-- listing_secrets
--   Private, owner-and-admin-only listing data. Kept in a separate table
--   so RLS posture differs cleanly from `listings`. The companion design
--   for serial numbers in docs/corent_functional_mvp_intent_rules.md is
--   "private storage; visible only to admin". This is the place.
--
-- Sensitivity: HIGH. Private serial number is admin-only.
-- =====================================================================

create table if not exists public.listing_secrets (
  listing_id            uuid primary key references public.listings(id) on delete cascade,
  private_serial_number text,
  -- Coarse pickup hint for concierge ops. NOT exact location, NOT GPS,
  -- NOT a full address. Cap is short to discourage drift.
  pickup_area_internal  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint listing_secrets_serial_length
    check (private_serial_number is null or char_length(private_serial_number) <= 80),
  constraint listing_secrets_pickup_area_internal_length
    check (pickup_area_internal is null or char_length(pickup_area_internal) <= 80)
);

comment on table public.listing_secrets is
  'Owner+admin-only secrets for a listing (Phase 2 draft). Holds private '
  'serial number and an internal-only coarse pickup hint. Never joined '
  'into public listing reads. RLS enabled, no public policy. dev-only.';

alter table public.listing_secrets enable row level security;

-- =====================================================================
-- listing_versions
--   Append-only audit history of listing edits. Used by admin and
--   founder review to see how a listing evolved.
--
-- Sensitivity: low (no private fields stored here).
-- =====================================================================

create table if not exists public.listing_versions (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  edited_at       timestamptz not null default now(),
  edited_by       uuid references public.profiles(id) on delete set null,
  -- Snapshot of editable fields at this version. JSON shape mirrors the
  -- `listings` row but excludes `id`, `seller_id`, audit columns. Schema
  -- versioning is via the `snapshot_version` text.
  snapshot_version text not null default 'v1',
  snapshot         jsonb not null default '{}'::jsonb,
  reason           text,

  constraint listing_versions_snapshot_object
    check (jsonb_typeof(snapshot) = 'object'),
  constraint listing_versions_snapshot_version
    check (snapshot_version in ('v1')),
  constraint listing_versions_reason_length
    check (reason is null or char_length(reason) <= 240)
);

comment on table public.listing_versions is
  'Append-only history of listing edits (Phase 2 draft). RLS enabled, no '
  'public policy. dev-only.';

create index if not exists listing_versions_listing_idx
  on public.listing_versions (listing_id, edited_at desc);

alter table public.listing_versions enable row level security;

-- =====================================================================
-- listing_verifications
--   Per-listing verification state. The current TypeScript domain has a
--   single nested VerificationIntent on the listing; promoting it to a
--   table makes it easier to audit and to attach future per-step
--   timestamps without bloating the listings row.
--
-- Sensitivity: low. The safety code itself is not secret (rotates daily).
-- =====================================================================

create table if not exists public.listing_verifications (
  id                    uuid primary key default gen_random_uuid(),
  listing_id            uuid not null unique references public.listings(id) on delete cascade,
  status                public.listing_verification_status not null default 'not_started',
  safety_code           text not null,

  front_photo           boolean not null default false,
  back_photo            boolean not null default false,
  components_photo      boolean not null default false,
  working_proof         boolean not null default false,
  safety_code_photo     boolean not null default false,
  private_serial_stored boolean not null default false,

  ai_notes              text[] not null default '{}',
  human_review_notes    text[] not null default '{}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint listing_verifications_safety_code_shape
    check (safety_code ~ '^[A-Z]-[0-9]{3}$'),
  constraint listing_verifications_ai_notes_size
    check (array_length(ai_notes, 1) is null or array_length(ai_notes, 1) <= 24),
  constraint listing_verifications_human_review_notes_size
    check (array_length(human_review_notes, 1) is null or array_length(human_review_notes, 1) <= 24)
);

comment on table public.listing_verifications is
  'Per-listing verification state (Phase 2 draft). Safety code is rotating, '
  'not a secret. RLS enabled, no public policy. dev-only.';

create index if not exists listing_verifications_status_idx
  on public.listing_verifications (status, updated_at desc);

alter table public.listing_verifications enable row level security;

-- =====================================================================
-- rental_intents
--   The central transactional row. Mirrors src/domain/intents.ts
--   RentalIntent. Money-movement columns (deposit_held_at, refunded_at,
--   payout_at) are deliberately absent — those are gated by the security
--   review and the legal/trust note (no CoRent wallet).
--
-- Sensitivity: medium. Borrower/seller display names are PII (names).
-- Amounts are integer KRW.
-- =====================================================================

create table if not exists public.rental_intents (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.listings(id) on delete restrict,
  seller_id           uuid not null references public.profiles(id) on delete restrict,
  borrower_id         uuid references public.profiles(id) on delete set null,
  -- Cached display names so admin UIs can render without joining; safe
  -- because both are short bounded text and never contain PII beyond a
  -- handle. Borrower display name may be null while still in `draft`.
  borrower_display_name text,
  seller_display_name   text,
  product_name        text not null,
  product_category    public.category_id not null,

  status              public.rental_intent_status not null default 'draft',
  duration_days       smallint not null,

  -- Amounts. Integers are fine for KRW; deliberately no decimal type.
  rental_fee          integer not null,
  safety_deposit      integer not null default 0,
  platform_fee        integer not null default 0,
  seller_payout       integer not null default 0,
  borrower_total      integer not null,

  -- Payment provider/state mirror the domain shape. No real session id
  -- is ever written through the Phase 2 adapter; this column exists for
  -- forward compatibility only.
  payment_provider    text not null default 'mock',
  payment_session_id  text,
  payment_status      text not null default 'not_started',
  payment_failure_reason text,

  pickup_method       text not null default 'direct',
  pickup_status       text not null default 'not_scheduled',
  pickup_location_label text,

  return_status       text not null default 'not_due',
  return_due_at       timestamptz,
  return_confirmed_at timestamptz,

  settlement_status   text not null default 'not_ready',
  settlement_blocked_reason text,
  settlement_settled_at timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint rental_intents_duration_days_values
    check (duration_days in (1, 3, 7)),
  constraint rental_intents_amounts_nonneg
    check (
      rental_fee >= 0
      and safety_deposit >= 0
      and platform_fee >= 0
      and seller_payout >= 0
      and borrower_total >= 0
    ),
  constraint rental_intents_amount_bounds
    check (
      rental_fee <= 10000000
      and safety_deposit <= 10000000
      and platform_fee <= 10000000
      and seller_payout <= 10000000
      and borrower_total <= 100000000
    ),
  constraint rental_intents_payment_provider_values
    check (payment_provider in ('mock', 'toss')),
  constraint rental_intents_payment_status_values
    check (payment_status in (
      'not_started','pending','authorized','paid','failed','refunded'
    )),
  constraint rental_intents_pickup_method_values
    check (pickup_method in ('direct')),
  constraint rental_intents_pickup_status_values
    check (pickup_status in (
      'not_scheduled','scheduled','confirmed','missed'
    )),
  constraint rental_intents_return_status_values
    check (return_status in (
      'not_due','pending','confirmed','overdue','damage_reported'
    )),
  constraint rental_intents_settlement_status_values
    check (settlement_status in ('not_ready','ready','blocked','settled')),
  constraint rental_intents_pickup_location_label_length
    check (pickup_location_label is null or char_length(pickup_location_label) <= 60),
  constraint rental_intents_borrower_display_name_length
    check (borrower_display_name is null or char_length(borrower_display_name) <= 60),
  constraint rental_intents_seller_display_name_length
    check (seller_display_name is null or char_length(seller_display_name) <= 60),
  constraint rental_intents_product_name_length
    check (char_length(product_name) between 1 and 80),
  constraint rental_intents_payment_session_id_length
    check (payment_session_id is null or char_length(payment_session_id) <= 80),
  constraint rental_intents_payment_failure_reason_length
    check (payment_failure_reason is null or char_length(payment_failure_reason) <= 240),
  constraint rental_intents_settlement_blocked_reason_length
    check (settlement_blocked_reason is null or char_length(settlement_blocked_reason) <= 240)
);

comment on table public.rental_intents is
  'Central rental transactional state (Phase 2 draft). Mirrors '
  'src/domain/intents.ts RentalIntent. No real money moves through this '
  'row in Phase 2 — payment_status defaults to not_started and the only '
  'write path is server-side. RLS enabled, no public policy. dev-only.';

create index if not exists rental_intents_status_updated_idx
  on public.rental_intents (status, updated_at desc);
create index if not exists rental_intents_seller_idx
  on public.rental_intents (seller_id, updated_at desc);
create index if not exists rental_intents_borrower_idx
  on public.rental_intents (borrower_id, updated_at desc);
create index if not exists rental_intents_listing_idx
  on public.rental_intents (listing_id, updated_at desc);

alter table public.rental_intents enable row level security;

-- =====================================================================
-- rental_events
--   Append-only lifecycle log for a rental intent. Each row is one
--   transition (or admin annotation). Immutable in design — the adapter
--   never updates or deletes.
--
-- Sensitivity: low. metadata is jsonb, but the adapter is responsible
-- for not putting PII in it (asserted by tests).
-- =====================================================================

create table if not exists public.rental_events (
  id                uuid primary key default gen_random_uuid(),
  rental_intent_id  uuid not null references public.rental_intents(id) on delete cascade,
  from_status       public.rental_intent_status,
  to_status         public.rental_intent_status not null,
  at                timestamptz not null default now(),
  reason            text,
  actor             text,
  metadata          jsonb not null default '{}'::jsonb,

  constraint rental_events_actor_values
    check (actor is null or actor in ('system','seller','borrower','admin')),
  constraint rental_events_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint rental_events_reason_length
    check (reason is null or char_length(reason) <= 240)
);

comment on table public.rental_events is
  'Append-only state-transition log for rental_intents (Phase 2 draft). '
  'RLS enabled, no public policy. dev-only.';

create index if not exists rental_events_intent_at_idx
  on public.rental_events (rental_intent_id, at);
create index if not exists rental_events_to_status_at_idx
  on public.rental_events (to_status, at desc);

alter table public.rental_events enable row level security;

-- =====================================================================
-- admin_reviews
--   Founder/admin review queue for listings (and, later, disputes). One
--   row per submission. Status columns mirror the verification flow but
--   are scoped to the admin queue, not the public listing status.
--
-- Sensitivity: low.
-- =====================================================================

create table if not exists public.admin_reviews (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid references public.listings(id) on delete cascade,
  rental_intent_id uuid references public.rental_intents(id) on delete cascade,
  status          public.admin_review_status not null default 'pending',
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewer_id     uuid references public.profiles(id) on delete set null,
  notes           text,

  constraint admin_reviews_target_check
    check (
      (listing_id is not null and rental_intent_id is null)
      or
      (listing_id is null and rental_intent_id is not null)
    ),
  constraint admin_reviews_notes_length
    check (notes is null or char_length(notes) <= 1000)
);

comment on table public.admin_reviews is
  'Founder/admin review queue (Phase 2 draft). Each row references either '
  'a listing or a rental_intent, never both. RLS enabled, no public policy. '
  'dev-only.';

create index if not exists admin_reviews_status_submitted_idx
  on public.admin_reviews (status, submitted_at desc);

alter table public.admin_reviews enable row level security;

-- =====================================================================
-- admin_actions
--   Append-only log of actions taken by an admin. Distinct from
--   admin_reviews because actions can happen outside of a queued review
--   (ad-hoc dispute resolution, settlement intervention).
-- =====================================================================

create table if not exists public.admin_actions (
  id                uuid primary key default gen_random_uuid(),
  at                timestamptz not null default now(),
  actor_id          uuid references public.profiles(id) on delete set null,
  actor_email       text,
  action_type       public.admin_action_type not null,
  listing_id        uuid references public.listings(id) on delete set null,
  rental_intent_id  uuid references public.rental_intents(id) on delete set null,
  notes             text,
  metadata          jsonb not null default '{}'::jsonb,

  constraint admin_actions_actor_email_shape
    check (
      actor_email is null
      or actor_email ~ '^[^@\s]{1,128}@[^@\s]{1,128}$'
    ),
  constraint admin_actions_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint admin_actions_notes_length
    check (notes is null or char_length(notes) <= 1000)
);

comment on table public.admin_actions is
  'Append-only admin action audit log (Phase 2 draft). actor_email is '
  'redundantly captured because the actor profile may later be deleted. '
  'RLS enabled, no public policy. dev-only.';

create index if not exists admin_actions_at_idx
  on public.admin_actions (at desc);
create index if not exists admin_actions_action_type_at_idx
  on public.admin_actions (action_type, at desc);

alter table public.admin_actions enable row level security;

-- =====================================================================
-- updated_at triggers
--
-- A single shared trigger function keeps `updated_at` fresh across the
-- mutable Phase 2 tables. Append-only tables (listing_versions,
-- rental_events, admin_actions) deliberately do not get this trigger.
-- =====================================================================

-- `search_path = ''` defends against the trigger function being run with
-- a caller-controlled search path that resolves `now()` or `=` to a
-- shadowed object. Supabase's database linter flags any function
-- without an explicit search_path (`function_search_path_mutable`).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'profiles_set_updated_at'
  ) then
    create trigger profiles_set_updated_at
      before update on public.profiles
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'seller_profiles_set_updated_at'
  ) then
    create trigger seller_profiles_set_updated_at
      before update on public.seller_profiles
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'borrower_profiles_set_updated_at'
  ) then
    create trigger borrower_profiles_set_updated_at
      before update on public.borrower_profiles
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'listings_set_updated_at'
  ) then
    create trigger listings_set_updated_at
      before update on public.listings
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'listing_secrets_set_updated_at'
  ) then
    create trigger listing_secrets_set_updated_at
      before update on public.listing_secrets
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'listing_verifications_set_updated_at'
  ) then
    create trigger listing_verifications_set_updated_at
      before update on public.listing_verifications
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'rental_intents_set_updated_at'
  ) then
    create trigger rental_intents_set_updated_at
      before update on public.rental_intents
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- =====================================================================
-- RLS posture (Phase 2 draft)
--
-- Every Phase 2 table has RLS enabled and NO permissive policies. anon
-- and authenticated roles are denied by default; only the service-role
-- client (server-only) can read/write. Future, more permissive policies
-- (e.g. owner-can-read-self, public-listing-read-where-status-approved)
-- are documented in docs/phase2_marketplace_schema_draft.md and will be
-- added in a follow-up migration after a security review.
--
-- We deliberately do NOT add policies like `using (true)` to "make local
-- testing easier". Local testing uses the service-role client which
-- bypasses RLS.
-- =====================================================================

-- =====================================================================
-- Public-listing read view (documented, NOT granted to anon in Phase 2)
--
-- This view is the eventual surface for unauthenticated reads. It
-- excludes private columns (no listing_secrets join) and is filtered to
-- approved listings only. We create it now so the adapter / docs can
-- reference a stable shape, but we do NOT grant SELECT to anon yet —
-- granting requires a passing security review.
-- =====================================================================

create or replace view public.listings_public as
select
  l.id,
  l.seller_id,
  l.item_name,
  l.category,
  l.estimated_value,
  l.condition,
  l.components,
  l.defects,
  l.pickup_area,
  l.region_coarse,
  l.price_one_day,
  l.price_three_days,
  l.price_seven_days,
  l.created_at,
  l.updated_at
from public.listings l
where l.status = 'approved';

comment on view public.listings_public is
  'Sanitized public listing read shape (Phase 2 draft). No private '
  'columns. Not granted to anon yet — granting waits on a security '
  'review.';

-- Defense in depth: explicitly REVOKE every privilege from anon and
-- authenticated on the new tables, on top of RLS. RLS denies row access
-- without a policy; revoking SELECT/INSERT/UPDATE/DELETE denies even
-- the relation-level access. Re-granting in a future migration is a
-- single, reviewable line.
revoke all on public.profiles               from anon, authenticated;
revoke all on public.seller_profiles        from anon, authenticated;
revoke all on public.borrower_profiles      from anon, authenticated;
revoke all on public.listings               from anon, authenticated;
revoke all on public.listing_secrets        from anon, authenticated;
revoke all on public.listing_versions       from anon, authenticated;
revoke all on public.listing_verifications  from anon, authenticated;
revoke all on public.rental_intents         from anon, authenticated;
revoke all on public.rental_events          from anon, authenticated;
revoke all on public.admin_reviews          from anon, authenticated;
revoke all on public.admin_actions          from anon, authenticated;
revoke all on public.listings_public        from anon, authenticated;

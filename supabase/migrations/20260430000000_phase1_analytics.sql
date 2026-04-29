-- Phase 1 analytics migration. Adds the two analytics tables referenced by
-- docs/phase1_validation_beta_plan.md and the security review note. Both
-- tables have RLS enabled with NO policies — anon and authenticated roles
-- are denied by default. The service-role client (server-only) bypasses
-- RLS for inserts and reads from the founder admin dashboard.
--
-- This migration is checked into the repo as a SPECIFICATION. It is NOT
-- applied to any hosted Supabase project by this PR. Applying it requires
-- a separate human-approved step, documented in
-- docs/phase1_analytics_smoke_test.md.

-- =====================================================================
-- Enums
-- =====================================================================

create type public.growth_event_type as enum (
  -- Allowed event types posted by the client.
  'landing_visited',
  'search_submitted',
  'search_filter_changed',
  'category_chip_clicked',
  'listing_view',
  'duration_selected',
  'request_clicked',
  'request_submitted',
  'seller_registration_started',
  'seller_registration_submitted',
  'dashboard_cta_clicked',
  'trust_explanation_opened',
  'waitlist_opt_in',
  -- Sentinel events emitted by the sanitizer itself. Clients cannot post
  -- these; the sanitizer is the only producer.
  'analytics_denied',
  'analytics_oversized'
);

create type public.consent_state as enum ('granted', 'denied', 'unknown');

create type public.region_coarse as enum (
  'seoul',
  'busan',
  'incheon',
  'gyeonggi',
  'other_metro',
  'non_metro',
  'unknown'
);

create type public.category_id as enum (
  'massage_gun',
  'home_care',
  'exercise',
  'vacuum',
  'projector',
  'camera',
  'camping',
  'unknown'
);

-- =====================================================================
-- growth_events
-- =====================================================================

create table public.growth_events (
  id                    uuid primary key default gen_random_uuid(),
  event_kind            public.growth_event_type not null,
  event_schema_version  text not null default 'v1',
  category              public.category_id,
  region_coarse         public.region_coarse,
  properties            jsonb not null default '{}'::jsonb,
  at                    timestamptz not null default now(),
  session_hash          text not null,
  consent_state         public.consent_state not null default 'unknown',

  constraint growth_events_properties_object
    check (jsonb_typeof(properties) = 'object'),
  constraint growth_events_schema_version
    check (event_schema_version in ('v1')),
  constraint growth_events_session_hash_shape
    check (session_hash ~ '^[A-Za-z0-9_-]{16,128}$')
);

comment on table public.growth_events is
  'Phase 1 sanitized funnel events. RLS enabled; service-role-only writes; '
  '18 month retention enforced by a scheduled job. See '
  'docs/phase1_validation_beta_plan.md.';

create index growth_events_kind_at_idx
  on public.growth_events (event_kind, at desc);

create index growth_events_category_at_idx
  on public.growth_events (category, at desc);

create index growth_events_region_at_idx
  on public.growth_events (region_coarse, at desc);

create index growth_events_session_at_idx
  on public.growth_events (session_hash, at);

alter table public.growth_events enable row level security;

-- No policies = deny-by-default for anon and authenticated roles.
-- Service role bypasses RLS.

-- =====================================================================
-- sanitizer_rejections
-- =====================================================================

create table public.sanitizer_rejections (
  id                  uuid primary key default gen_random_uuid(),
  at                  timestamptz not null default now(),
  event_kind          text not null,
  dropped_keys        text[] not null default '{}',
  reason              text not null,
  client_request_hash text
);

comment on table public.sanitizer_rejections is
  'Phase 1 audit log for sanitizer-dropped properties. Stores only key '
  'names and reason codes — never raw rejected values. RLS enabled; '
  'service-role-only writes. 90 day retention.';

create index sanitizer_rejections_at_idx
  on public.sanitizer_rejections (at desc);

alter table public.sanitizer_rejections enable row level security;

-- =====================================================================
-- Retention helper (operator runs this from a scheduled job; no policy)
-- =====================================================================

-- A schedule (Vercel Cron / Supabase Edge Function) runs the equivalent of:
--
--   delete from public.growth_events       where at < now() - interval '18 months';
--   delete from public.sanitizer_rejections where at < now() - interval '90 days';
--
-- This statement is intentionally left as a comment; no DELETE clause runs
-- as part of the migration itself. The job is documented in
-- docs/phase1_analytics_smoke_test.md.

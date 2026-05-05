-- Phase 2 feedback / wishlist intake schema (dev-only).
--
-- Validation Bundle 1, Part 2. The closed-alpha validation loop needs
-- a structured place to capture three small categories of signal:
--   - wanted_item   — a renter says "I'd want to try X before buying"
--   - can_lend_item — an owner says "I have X and would lend it"
--   - feature_request / bug / general — open-text product feedback
--
-- Schema-only migration: it creates the `feedback_submissions` table
-- and supporting enums. The application surface (server action, client
-- form) lands in the same commit but does not require this DDL to be
-- applied for the build / lint / test pipeline to pass — runtime
-- writes remain gated behind `CORENT_BACKEND_MODE=supabase` and the
-- service-role client.
--
-- Posture
--   - Applied only to the dev project `corent-dev` (region
--     ap-northeast-2). Never to production.
--   - RLS enabled with NO permissive policies. anon and authenticated
--     are denied by default; the server-only service-role client is
--     the sole writer / reader at this stage.
--   - Bounded text fields. CHECK constraints cap message and other
--     text lengths so a forged client cannot blow up the row.
--   - Optional `profile_id` reference allows attribution when the
--     submitter has a closed-alpha profile, but is NEVER required.
--     Anonymous submissions land with `profile_id = null`.
--   - `contact_email` is OPTIONAL. The migration intentionally
--     accepts free-text email-shaped strings without strict format
--     validation at the DB level (the application validator handles
--     shape); the cap keeps the column small.
--   - No PII beyond the optional contact email. No phone, no full
--     address, no national ID, no payment / credentials.
--
-- References
--   - supabase/migrations/20260430120000_phase2_marketplace_draft.sql
--     (parent migration: profiles, set_updated_at, category_id enum)
--   - docs/corent_security_gate_note.md
--   - docs/corent_pre_revenue_beta_plan.md
--
-- =====================================================================
-- Idempotency guards
--
-- Safe to re-apply against an empty dev project. Does NOT alter
-- existing Phase 1 / Phase 2 marketplace / intake tables. The
-- `set_updated_at` helper from the parent migration is reused.
-- =====================================================================

-- =====================================================================
-- Enums
-- =====================================================================

-- The closed-alpha feedback shape. `wanted_item` and `can_lend_item`
-- drive the wishlist / supply signals; the other three drive the
-- product feedback channel. Adding a new value is a deliberate enum
-- change; we prefer the constrained shape over a free-text `kind`.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'feedback_kind') then
    create type public.feedback_kind as enum (
      'wanted_item',
      'can_lend_item',
      'feature_request',
      'bug',
      'general'
    );
  end if;
end $$;

-- Founder review pipeline. `new` is the default; an admin moves rows
-- to `reviewed` after looking at them and to `archived` once the
-- signal is captured elsewhere. There is no destructive state at this
-- stage — no delete, no edit-message — so a future review surface can
-- always reconstruct the chronological list.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'feedback_status') then
    create type public.feedback_status as enum (
      'new',
      'reviewed',
      'archived'
    );
  end if;
end $$;

-- =====================================================================
-- feedback_submissions
--   One row per feedback / wishlist signal. The submitter is
--   OPTIONALLY linked to a `profiles.id` (when the closed-alpha
--   tester is signed in); otherwise the row stands alone with
--   `profile_id = null`.
--
--   `category` reuses the existing `public.category_id` enum from
--   the parent migration so the wishlist signal can drive item
--   coverage decisions without inventing a parallel taxonomy.
--
-- Sensitivity: low. Free-text feedback + optional email + optional
--   item name. No payment data, no identifiers beyond email.
-- Read: service-role only at this stage. Future: founder/admin
--   reads all via a server-only review surface (deferred).
-- Write: service-role only at this stage; the application server
--   action calls into this table.
-- =====================================================================

create table if not exists public.feedback_submissions (
  id              uuid primary key default gen_random_uuid(),
  kind            public.feedback_kind not null,
  message         text not null,
  item_name       text,
  category        public.category_id,
  contact_email   text,
  profile_id      uuid references public.profiles(id) on delete set null,
  source_page     text,
  status          public.feedback_status not null default 'new',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint feedback_submissions_message_length
    check (char_length(message) between 1 and 2000),
  constraint feedback_submissions_item_name_length
    check (item_name is null or char_length(item_name) between 1 and 80),
  constraint feedback_submissions_contact_email_length
    check (contact_email is null or char_length(contact_email) between 3 and 254),
  constraint feedback_submissions_source_page_length
    check (source_page is null or char_length(source_page) between 1 and 80)
);

comment on table public.feedback_submissions is
  'Closed-alpha feedback / wishlist intake (Phase 2, Bundle 1). Free-text '
  'message plus structured kind + optional item_name / category / contact / '
  'profile / source_page. RLS enabled, no public policy. dev-only.';

-- Founder review surface will sort by created_at desc filtered on
-- status. The composite index covers both the unfiltered
-- chronological view and the per-status filter.
create index if not exists feedback_submissions_status_created_idx
  on public.feedback_submissions (status, created_at desc);

-- Per-profile lookup for the rare case where the founder wants to
-- see "every signal this tester sent us." Partial index keeps it
-- small — anonymous rows do not bloat it.
create index if not exists feedback_submissions_profile_idx
  on public.feedback_submissions (profile_id)
  where profile_id is not null;

alter table public.feedback_submissions enable row level security;

-- =====================================================================
-- updated_at trigger
-- =====================================================================

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'feedback_submissions_set_updated_at'
  ) then
    create trigger feedback_submissions_set_updated_at
      before update on public.feedback_submissions
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- =====================================================================
-- Privilege revokes (defense in depth on top of RLS)
--
-- RLS denies row access without a policy; revoking SELECT / INSERT /
-- UPDATE / DELETE denies even the relation-level access. Re-granting
-- in a future migration (founder review policy) is a single,
-- reviewable line.
-- =====================================================================

revoke all on public.feedback_submissions from anon, authenticated;

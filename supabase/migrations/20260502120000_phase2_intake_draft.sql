-- Phase 2 chat-to-listing intake schema DRAFT (dev-only).
--
-- Slice A, PR 1 of the Backend / DB Readiness migration sequence.
-- Schema-only: no service wiring, no client adapter changes, no
-- Supabase repository implementations yet. Runtime behavior is
-- unchanged after this migration applies — `getPersistence()` still
-- returns the local memory / localStorage adapter pair.
--
-- Mirrors the TypeScript domain in `src/domain/intake.ts`
-- (`IntakeSession`, `IntakeMessage`, `IntakeExtraction`) and the
-- chat intake service contract in
-- `src/lib/services/chatListingIntakeService.ts`.
--
-- Posture
--   - Applied only to the dev project `corent-dev` (region
--     ap-northeast-2). Never to production.
--   - RLS enabled on every new table with NO permissive policies.
--     anon and authenticated roles are denied by default. The
--     service-role client (server-only) bypasses RLS for
--     reads/writes.
--   - `listing_intake_messages` is append-only at the database
--     level — a trigger raises on UPDATE / DELETE so a future bug
--     in the application path cannot silently rewrite history.
--   - Raw seller chat is private. It is never copied into any
--     public projection (the executable contract lives in
--     `src/lib/services/publicListingService.test.ts`).
--   - Raw chat retention is NOT yet implemented. The proposal in
--     `docs/corent_externalization_architecture_v1.md` §11 is 90
--     days from `listing_intake_sessions.created_at`. A scheduled
--     retention job is a separate later PR.
--
-- References
--   - docs/corent_externalization_architecture_v1.md §5
--   - docs/phase2_marketplace_schema_draft.md (companion doc)
--   - supabase/migrations/20260430120000_phase2_marketplace_draft.sql
--     (parent migration: profiles, listings, etc.)
--   - src/domain/intake.ts (TypeScript domain model)
--   - src/lib/services/chatListingIntakeService.ts (write path)
--   - src/lib/services/chatIntakeExtractor.test.ts (extraction shape)
--   - src/lib/adapters/persistence/persistence.test.ts (snapshot
--     parity contract; the future Supabase repo must satisfy the
--     same contract)
--   - src/server/intake/actions.test.ts (server actor boundary)
--
-- =====================================================================
-- Idempotency guards
--
-- Safe to re-apply against an empty dev project. Does NOT alter
-- existing Phase 1 / Phase 2 marketplace tables. The `set_updated_at`
-- helper from the parent migration is reused as-is and not
-- redefined.
-- =====================================================================

-- =====================================================================
-- Enums
-- =====================================================================

-- Mirrors src/domain/intake.ts IntakeSessionStatus.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'intake_session_status') then
    create type public.intake_session_status as enum (
      'drafting',
      'draft_created',
      'abandoned'
    );
  end if;
end $$;

-- Mirrors src/domain/intake.ts IntakeMessageRole.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'intake_message_role') then
    create type public.intake_message_role as enum (
      'seller',
      'assistant',
      'system'
    );
  end if;
end $$;

-- =====================================================================
-- Helper: reject_modify()
--
-- Generic before-update / before-delete trigger function that raises
-- an exception. Used to enforce append-only semantics at the
-- database level for tables whose service-layer contract is also
-- append-only. The same function is intended for future
-- `rental_events`, `trust_events`, and `notification_events`
-- migrations.
--
-- `set search_path = ''` matches the posture of `public.set_updated_at`
-- from the parent migration so Supabase's database linter does not
-- flag `function_search_path_mutable`.
-- =====================================================================
create or replace function public.reject_modify()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append_only_table_rejects_modify: table=% op=%',
    TG_TABLE_NAME, TG_OP
    using errcode = 'P0001';
end;
$$;

-- =====================================================================
-- listing_intake_sessions
--   One row per chat-to-listing session. The seller drives the
--   session; status walks `drafting` → (`draft_created` |
--   `abandoned`). When a `ListingIntent` draft is produced, the
--   session row keeps a pointer at it for the audit trail.
--
--   The TS domain (`IntakeSession`) carries a `sellerId`. In SQL
--   that maps to `profiles.id` directly; the service layer's
--   `actorSellerId` becomes `auth.uid()` once real auth ships and
--   the resolver in `src/server/actors/resolveServerActor.ts` reads
--   the Supabase session.
--
--   `listing_intent_id` references `public.listings(id)`. The TS
--   domain calls these "listing intents"; the parent migration
--   chose `listings` for the SQL table name. Naming difference is
--   intentional — the SQL table holds the same shape the TS code
--   refers to as `ListingIntent`.
--
-- Sensitivity: medium — the session is private to the seller.
-- Read: service-role only at this stage. Future: seller reads own;
-- admin reads all.
-- Write: service-role only at this stage.
-- =====================================================================

create table if not exists public.listing_intake_sessions (
  id                   uuid primary key default gen_random_uuid(),
  seller_id            uuid not null references public.profiles(id) on delete restrict,
  status               public.intake_session_status not null default 'drafting',
  listing_intent_id    uuid references public.listings(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.listing_intake_sessions is
  'Chat-to-listing intake sessions (Phase 2 draft, Slice A). One row per '
  'seller chat session. RLS enabled, no public policy. dev-only.';

create index if not exists listing_intake_sessions_seller_status_idx
  on public.listing_intake_sessions (seller_id, status);
create index if not exists listing_intake_sessions_listing_intent_idx
  on public.listing_intake_sessions (listing_intent_id)
  where listing_intent_id is not null;

alter table public.listing_intake_sessions enable row level security;

-- =====================================================================
-- listing_intake_messages
--   Append-only chat log per session. The TS domain
--   (`IntakeMessage`) carries `role` ∈ {seller, assistant, system}
--   and free-text `content`. The application service caps content
--   at 2,000 chars (matches `RAW_INPUT_MAX` in
--   `src/lib/validators/listingInput.ts`); we mirror that cap here
--   as a CHECK constraint.
--
--   Append-only is enforced by:
--     1. service-layer convention (no update/delete call sites
--        exist), and
--     2. a database trigger that raises on any UPDATE or DELETE.
--
--   `on delete cascade` from the session row is the only path that
--   removes message rows — and even that is server-role only.
--
-- Sensitivity: HIGH — raw chat is private. Never projected publicly.
-- Read: service-role only. Future: session owner reads own; admin
-- reads all (review).
-- Write: service-role only, INSERT only (trigger blocks UPDATE /
-- DELETE).
-- =====================================================================

create table if not exists public.listing_intake_messages (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.listing_intake_sessions(id) on delete cascade,
  role         public.intake_message_role not null,
  content      text not null,
  created_at   timestamptz not null default now(),

  constraint listing_intake_messages_content_length
    check (char_length(content) between 1 and 2000)
);

comment on table public.listing_intake_messages is
  'Chat-to-listing append-only message log (Phase 2 draft, Slice A). '
  'Raw seller chat — never projected to public surfaces. RLS enabled, '
  'no public policy. UPDATE / DELETE rejected at the trigger level. '
  'dev-only.';

create index if not exists listing_intake_messages_session_created_idx
  on public.listing_intake_messages (session_id, created_at);

alter table public.listing_intake_messages enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'listing_intake_messages_reject_modify'
  ) then
    create trigger listing_intake_messages_reject_modify
      before update or delete on public.listing_intake_messages
      for each row execute function public.reject_modify();
  end if;
end $$;

-- =====================================================================
-- listing_extractions
--   The deterministic local extractor's output for a session. One
--   extraction per session in the skeleton phase (PK = session_id).
--
--   Field columns mirror `IntakeExtraction` in
--   `src/domain/intake.ts`. Numeric fields share the same caps as
--   `listings` (estimated_value ≤ 100,000,000 KRW; price ≤
--   10,000,000 KRW). String caps mirror the listing validator
--   (item_name ≤ 120, pickup_area ≤ 60, defects ≤ 240).
--
--   `missing_fields` is a `jsonb` array of string field names. We
--   keep it as jsonb (per the externalization plan §5) rather than
--   `text[]` so the future repo can encode richer metadata
--   (confidence per field, why-missing reason) without a schema
--   change. A CHECK constraint enforces the array shape today.
--
-- Sensitivity: medium — the extraction is derived from raw chat
-- but does not contain the raw chat itself. Still session-private.
-- Read/write: service-role only.
-- =====================================================================

create table if not exists public.listing_extractions (
  session_id            uuid primary key references public.listing_intake_sessions(id) on delete cascade,
  item_name             text,
  category              public.category_id,
  pickup_area           text,
  condition             public.item_condition,
  defects               text,
  components            text[] not null default '{}',
  estimated_value       integer,
  one_day_price         integer,
  three_days_price      integer,
  seven_days_price      integer,
  missing_fields        jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint listing_extractions_item_name_length
    check (item_name is null or char_length(item_name) between 1 and 120),
  constraint listing_extractions_pickup_area_length
    check (pickup_area is null or char_length(pickup_area) <= 60),
  constraint listing_extractions_defects_length
    check (defects is null or char_length(defects) <= 240),
  constraint listing_extractions_components_size
    check (array_length(components, 1) is null or array_length(components, 1) <= 12),
  constraint listing_extractions_estimated_value_bounds
    check (estimated_value is null or (estimated_value >= 0 and estimated_value <= 100000000)),
  constraint listing_extractions_one_day_price_bounds
    check (one_day_price is null or (one_day_price >= 0 and one_day_price <= 10000000)),
  constraint listing_extractions_three_days_price_bounds
    check (three_days_price is null or (three_days_price >= 0 and three_days_price <= 10000000)),
  constraint listing_extractions_seven_days_price_bounds
    check (seven_days_price is null or (seven_days_price >= 0 and seven_days_price <= 10000000)),
  -- missing_fields must be a jsonb array. Each entry should be a
  -- string but we keep the shape check to "is array" so the future
  -- repo can append entries with a richer shape later without an
  -- alter.
  constraint listing_extractions_missing_fields_array
    check (jsonb_typeof(missing_fields) = 'array')
);

comment on table public.listing_extractions is
  'Chat-to-listing extraction snapshot (Phase 2 draft, Slice A). One '
  'row per session. Fields mirror src/domain/intake.ts IntakeExtraction. '
  'RLS enabled, no public policy. dev-only.';

alter table public.listing_extractions enable row level security;

-- =====================================================================
-- updated_at triggers
--
-- `listing_intake_messages` is append-only and has no updated_at
-- column. `listing_intake_sessions` and `listing_extractions` get
-- the standard `set_updated_at` trigger introduced by the parent
-- migration.
-- =====================================================================

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'listing_intake_sessions_set_updated_at'
  ) then
    create trigger listing_intake_sessions_set_updated_at
      before update on public.listing_intake_sessions
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'listing_extractions_set_updated_at'
  ) then
    create trigger listing_extractions_set_updated_at
      before update on public.listing_extractions
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- =====================================================================
-- Privilege revokes (defense in depth on top of RLS)
--
-- RLS denies row access without a policy; revoking SELECT / INSERT /
-- UPDATE / DELETE denies even the relation-level access. Re-granting
-- in a future migration is a single, reviewable line.
-- =====================================================================

revoke all on public.listing_intake_sessions  from anon, authenticated;
revoke all on public.listing_intake_messages  from anon, authenticated;
revoke all on public.listing_extractions      from anon, authenticated;

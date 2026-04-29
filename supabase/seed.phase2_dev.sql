-- Phase 2 dev-only seed.
--
-- Purpose: pre-populate corent-dev with obviously-fake demo rows so
-- founder-side concierge flows have something to look at. Every row
-- here is fake by design. There are NO real names, NO real emails, NO
-- phone numbers, NO addresses, NO GPS coordinates, NO payment data.
--
-- Safety
--   - dev-only. Run only against the corent-dev project, never prod.
--   - Idempotent: uses fixed UUIDs and `on conflict do nothing` so
--     re-running does not duplicate rows.
--   - No DELETE / TRUNCATE.
--   - No grants / role changes.
--
-- How to apply (when ready, not part of the automated migration set):
--   - Run via the Supabase SQL editor against corent-dev.
--   - Or via supabase db push with the file in `seeds/` (consult the
--     project's runbook before doing this — no guarantees that the
--     CLI is configured here).
--
-- Why the file lives at supabase/seed.phase2_dev.sql rather than
-- supabase/seed.sql: the default `seed.sql` filename can be picked up
-- automatically by some CLI flows. We deliberately use a non-standard
-- name so this file is only ever applied by an explicit human step.

-- Stable UUIDs so foreign keys line up across runs.
-- Profiles ----------------------------------------------------------------
insert into public.profiles (id, email, display_name, region_coarse)
values
  ('00000000-0000-4000-8000-000000000001', 'demo-seller-a@corent.invalid', 'DEMO 셀러 A', 'seoul'),
  ('00000000-0000-4000-8000-000000000002', 'demo-seller-b@corent.invalid', 'DEMO 셀러 B', 'gyeonggi'),
  ('00000000-0000-4000-8000-000000000003', 'demo-borrower@corent.invalid', 'DEMO 빌리는사람', 'seoul')
on conflict (id) do nothing;

insert into public.seller_profiles (profile_id, display_name, trust_note, trust_score, review_count, joined_at)
values
  ('00000000-0000-4000-8000-000000000001', 'DEMO 셀러 A', '데모 데이터', 4.8, 18, '2025-08-12'),
  ('00000000-0000-4000-8000-000000000002', 'DEMO 셀러 B', '데모 데이터', 4.7,  9, '2025-09-22')
on conflict (profile_id) do nothing;

insert into public.borrower_profiles (profile_id, display_name, preferred_trust_signal)
values
  ('00000000-0000-4000-8000-000000000003', 'DEMO 빌리는사람', 'verified_first')
on conflict (profile_id) do nothing;

-- Listings ---------------------------------------------------------------
insert into public.listings (
  id, seller_id, status,
  raw_seller_input, item_name, category, estimated_value, condition,
  components, defects, pickup_area, region_coarse,
  price_one_day, price_three_days, price_seven_days, seller_adjusted_pricing
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'approved',
    'DEMO 마사지건 거의 안 썼어. 3일 정도 빌려주고 싶어.',
    'DEMO 마사지건 미니',
    'massage_gun',
    220000,
    'like_new',
    array['본체', '충전 케이블', '파우치'],
    null,
    'DEMO 권역',
    'seoul',
    9000, 21000, 39000,
    false
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000002',
    'human_review_pending',
    'DEMO 홈케어 디바이스, 1년 사용. 판매보다는 잠깐 빌려줘 보고 싶어.',
    'DEMO 홈케어 디바이스',
    'home_care',
    340000,
    'lightly_used',
    array['본체', '어댑터'],
    'DEMO 결함 없음',
    'DEMO 권역',
    'gyeonggi',
    14000, 33000, 60000,
    false
  )
on conflict (id) do nothing;

-- Listing verifications --------------------------------------------------
insert into public.listing_verifications (
  id, listing_id, status, safety_code,
  front_photo, back_photo, components_photo, working_proof, safety_code_photo, private_serial_stored,
  ai_notes, human_review_notes
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'verified',
    'B-428',
    true, true, true, true, true, false,
    array['DEMO ai note'],
    array['DEMO human review note']
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000102',
    'human_review_pending',
    'C-731',
    true, true, true, false, true, false,
    array['DEMO ai note'],
    array['DEMO needs working proof']
  )
on conflict (listing_id) do nothing;

-- Rental intents (no real money) -----------------------------------------
insert into public.rental_intents (
  id, listing_id, seller_id, borrower_id,
  borrower_display_name, seller_display_name, product_name, product_category,
  status, duration_days,
  rental_fee, safety_deposit, platform_fee, seller_payout, borrower_total,
  payment_provider, payment_status,
  pickup_method, pickup_status, pickup_location_label,
  return_status, settlement_status
)
values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'DEMO 빌리는사람', 'DEMO 셀러 A',
    'DEMO 마사지건 미니', 'massage_gun',
    'requested', 3,
    21000, 100000, 0, 21000, 121000,
    'mock', 'not_started',
    'direct', 'not_scheduled', 'DEMO 픽업 라벨',
    'not_due', 'not_ready'
  )
on conflict (id) do nothing;

-- Rental events ----------------------------------------------------------
insert into public.rental_events (
  id, rental_intent_id, from_status, to_status, reason, actor, metadata
)
values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000301',
    null, 'requested', 'demo seed', 'system', '{}'::jsonb
  )
on conflict (id) do nothing;

-- Admin reviews ----------------------------------------------------------
insert into public.admin_reviews (id, listing_id, status, notes)
values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000102',
    'pending',
    'DEMO 검수 대기 — working proof 추가 요청'
  )
on conflict (id) do nothing;

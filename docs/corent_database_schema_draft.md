# CoRent Database Schema Draft

_Last updated: 2026-04-29_

This is a **planning document only**. No real database is connected. The
current implementation persists everything via `LocalStoragePersistenceAdapter`
behind the `PersistenceAdapter` interface in
`src/lib/adapters/persistence/`. When Supabase or Postgres is introduced,
the same interface should be implemented by a new adapter and dropped in
without any UI changes.

---

## 1. Design principle

- **`rental_intents` is the central transactional table.** Everything
  else either describes the world that produced the intent (users, products,
  listings) or describes what happened to it (rental_events, payments,
  settlements, disputes).
- **`rental_events` is the append-only lifecycle log.** Every transition
  the state machine emits should write one row. The current `RentalIntent`
  status is derivable from the latest event.
- **Provider-agnostic payments and settlements.** The `payments` table
  carries a `provider` column so the same row can describe a mock or a
  real Toss session.
- **Disputes are modeled now, not resolved now.** The MVP sets up the
  table, but the resolution flow stays manual.

---

## 2. Proposed tables

### 2.1 `users`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | text unique | nullable until auth lands |
| display_name | text | |
| role | enum('borrower','seller','admin') | a user can have many roles via a join in the future |
| created_at | timestamptz | |

### 2.2 `sellers`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users(id) | |
| region | enum('seoul') | extensible |
| trust_score | numeric(3,2) | |
| review_count | int | |
| joined_at | timestamptz | |
| trust_note | text | |

### 2.3 `categories`

| column | type | notes |
|---|---|---|
| id | text pk | matches `CategoryId` ('massage_gun', 'home_care', …) |
| label | text | Korean label |
| english_label | text | |
| enabled | boolean | mirror of MVP gating |

### 2.4 `products`

| column | type | notes |
|---|---|---|
| id | text pk | |
| name | text | |
| category_id | text fk → categories(id) | |
| seller_id | uuid fk → sellers(id) | |
| estimated_value | int | KRW, integer |
| pickup_area | text | |
| region | enum('seoul') | |
| condition | text | |
| components | text[] | |
| defects | text | |
| summary | text | |
| hero_initials | text | |
| created_at | timestamptz | |

Pricing is **derived** from the listing rather than stored on the product
itself, but a `price_overrides` JSON column or sibling table is fine.

### 2.5 `listings`

| column | type | notes |
|---|---|---|
| id | uuid pk | matches `ListingIntent.id` |
| seller_id | uuid fk → sellers(id) | |
| product_id | text fk → products(id) | nullable until verification approves |
| status | enum (see §3) | |
| raw_seller_input | text | |
| item_name | text | |
| item_category_id | text | |
| item_estimated_value | int | |
| item_condition | enum('new','like_new','lightly_used','used') | |
| item_components | text[] | |
| item_defects | text | nullable |
| item_private_serial_number | text | encrypted at rest |
| pricing_one_day | int | |
| pricing_three_days | int | |
| pricing_seven_days | int | |
| pricing_seller_adjusted | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.6 `listing_verifications`

| column | type | notes |
|---|---|---|
| id | uuid pk | matches `VerificationIntent.id` |
| listing_id | uuid fk → listings(id) | |
| safety_code | text | |
| status | enum (see §3) | |
| check_front_photo | boolean | |
| check_back_photo | boolean | |
| check_components_photo | boolean | |
| check_working_proof | boolean | |
| check_safety_code_photo | boolean | |
| check_private_serial_stored | boolean | |
| ai_notes | text[] | |
| human_review_notes | text[] | |

### 2.7 `rental_intents` — the central transaction

| column | type | notes |
|---|---|---|
| id | uuid pk | matches `RentalIntent.id` |
| product_id | text fk → products(id) | |
| seller_id | uuid fk → sellers(id) | denormalized for fast queries |
| borrower_id | uuid fk → users(id) | nullable until auth |
| status | enum (see §3) | |
| duration_days | int | constrained: {1,3,7} |
| amount_rental_fee | int | |
| amount_safety_deposit | int | |
| amount_platform_fee | int | |
| amount_seller_payout | int | |
| amount_borrower_total | int | |
| pickup_method | enum('direct') | |
| pickup_status | enum('not_scheduled','scheduled','confirmed','missed') | |
| pickup_location_label | text | |
| return_status | enum('not_due','pending','confirmed','overdue','damage_reported') | |
| return_due_at | timestamptz | |
| return_confirmed_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes:
- `(seller_id, status)` for seller dashboard queries.
- `(borrower_id, status)` once borrower-side history exists.
- `(status, updated_at desc)` for admin/ops queues.

### 2.8 `rental_events` — append-only lifecycle log

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| rental_intent_id | uuid fk → rental_intents(id) | |
| from_status | text | nullable for first event |
| to_status | text | |
| at | timestamptz | |
| reason | text | |
| actor | enum('system','seller','borrower','admin') | |
| metadata | jsonb | adapter-specific context |

The current `RentalIntent.status` is *redundant* with the latest event; it
is denormalized for query speed. Truth lives in events.

### 2.9 `payments`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| session_id | text unique | provider-issued |
| rental_intent_id | uuid fk → rental_intents(id) | |
| provider | enum('mock','toss') | |
| amount | int | |
| status | enum('not_started','pending','authorized','paid','failed','refunded') | |
| failure_reason | text | nullable |
| created_at | timestamptz | |
| authorized_at | timestamptz | |
| paid_at | timestamptz | |
| refunded_at | timestamptz | |

### 2.10 `settlements`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| rental_intent_id | uuid fk → rental_intents(id) | unique |
| status | enum('not_ready','ready','blocked','settled') | |
| seller_payout | int | |
| blocked_reason | text | nullable |
| settled_at | timestamptz | nullable |

Delayed-settlement guarantee: a row only moves to `settled` once the
matching rental_intent is `return_confirmed` or `settlement_ready`.

### 2.11 `disputes`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| rental_intent_id | uuid fk → rental_intents(id) | |
| opened_by | enum('seller','borrower','admin') | |
| status | enum('open','investigating','resolved') | |
| reason | text | |
| resolution_notes | text | nullable |
| opened_at | timestamptz | |
| resolved_at | timestamptz | nullable |

---

## 3. Status enums

### `rental_intents.status`

`draft, requested, seller_approved, payment_pending, paid,
pickup_confirmed, return_pending, return_confirmed, settlement_ready,
settled, cancelled, payment_failed, seller_cancelled, borrower_cancelled,
pickup_missed, return_overdue, damage_reported, dispute_opened,
settlement_blocked`

(matches `RentalIntentStatus` in `src/domain/intents.ts`)

### `listings.status`

`draft, ai_extracted, verification_incomplete, human_review_pending,
approved, rejected`

### `listing_verifications.status`

`not_started, pending, submitted, ai_checked, human_review_pending,
verified, rejected`

### `payments.status`

`not_started, pending, authorized, paid, failed, refunded`

### `settlements.status`

`not_ready, ready, blocked, settled`

### `disputes.status`

`open, investigating, resolved`

---

## 4. Relationships

```
users 1 ─── 0..* sellers
sellers 1 ─── 0..* listings
sellers 1 ─── 0..* products
products 1 ─── 0..* rental_intents
listings 1 ─── 1 listing_verifications
rental_intents 1 ─── 0..* rental_events
rental_intents 1 ─── 0..* payments
rental_intents 1 ─── 0..1 settlements
rental_intents 1 ─── 0..* disputes
categories 1 ─── 0..* products
```

---

## 5. Mapping from current localStorage → tables

| localStorage key | future table |
|---|---|
| `corent:rentalIntents` | `rental_intents` |
| `corent:listingIntents` | `listings` (+ embedded `listing_verifications`) |
| `corent:searchIntents` | `search_intents` (optional; transient by design — keep for analytics only) |
| `corent:rentalEvents` | `rental_events` |

`PaymentSession` from the mock adapter maps to `payments`.
`SettlementState` embedded in a RentalIntent maps to `settlements`.

---

## 6. Notes for future Supabase / Postgres adapter

1. Implement `SupabasePersistenceAdapter implements PersistenceAdapter`
   (interface in `src/lib/adapters/persistence/types.ts`). Methods map
   1:1 to the table actions above.
2. `appendRentalEvent` should be the only path that mutates
   `rental_intents.status`. Wrap it in a Postgres function (or RLS
   policy) so direct status writes are denied.
3. Use Supabase Row Level Security: a seller can only read their own
   `rental_intents`, `listings`, `listing_verifications`, and
   `settlements`. A borrower can only read their own rental intents.
4. Treat `private_serial_number` as a write-only field for non-admins —
   read it only inside the dispute resolution flow.
5. Add a `created_by` column to `rental_events` once auth is wired so the
   `actor` enum can be cross-checked against the authenticated user.
6. For Toss reconciliation: `payments.session_id` is what the Toss webhook
   uses to look up the matching rental — keep it indexed.

---

## 7. What this draft does not cover

- Reviews / ratings.
- Borrower side trust score.
- Image storage (Supabase Storage bucket per listing-id is the natural fit).
- Tax invoicing.
- Insurance.
- Multi-region (only Seoul for now).

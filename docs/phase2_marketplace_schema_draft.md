# Phase 2 Marketplace Schema Draft

Status: **DRAFT**, dev-only.
Source migrations:
- [`supabase/migrations/20260430120000_phase2_marketplace_draft.sql`](../supabase/migrations/20260430120000_phase2_marketplace_draft.sql) — profiles, listings, rental_intents, etc.
- [`supabase/migrations/20260502120000_phase2_intake_draft.sql`](../supabase/migrations/20260502120000_phase2_intake_draft.sql) — chat-to-listing intake (Slice A, PR 1)

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
| `listing_intake_sessions` | Slice A: one row per chat-to-listing seller session.   | Medium      | Deny all       | Seller reads own; admin reads all |
| `listing_intake_messages` | Slice A: append-only chat log per session (raw chat).  | High        | Deny all       | Seller reads own; admin reads on review |
| `listing_extractions`   | Slice A: deterministic extractor snapshot per session.   | Medium      | Deny all       | Seller reads own; admin reads on review |

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

## Slice A — chat-to-listing intake (PR 1, schema-only)

Source migration:
[`supabase/migrations/20260502120000_phase2_intake_draft.sql`](../supabase/migrations/20260502120000_phase2_intake_draft.sql)

This is the first DB-backed slice from the externalization plan
([`docs/corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
§13 task 1). It is **schema-only**: no service code is wired to the
new tables in this PR. Runtime behavior after this migration applies
is unchanged — `getPersistence()` continues to return the local
memory / localStorage adapter pair.

### Tables

| Table | Mirrors TS type | Append-only? | Cap notes |
| --- | --- | --- | --- |
| `listing_intake_sessions` | `IntakeSession` (`src/domain/intake.ts`) | no | status enum: `drafting` / `draft_created` / `abandoned` |
| `listing_intake_messages` | `IntakeMessage` | **yes** (DB trigger) | `content` capped at 2,000 chars (mirrors `RAW_INPUT_MAX`) |
| `listing_extractions` | `IntakeExtraction` | upsert by `session_id` | numeric / text caps mirror the listing validator |

### Append-only enforcement

`listing_intake_messages` has a `before update or delete` trigger
that calls a new generic `public.reject_modify()` function. The
function raises `append_only_table_rejects_modify` so a future bug
in the application path cannot silently rewrite history. The same
helper is intended for future `rental_events`, `trust_events`, and
`notification_events` migrations.

### Foreign-key directions

- `listing_intake_sessions.seller_id → profiles(id) ON DELETE RESTRICT`
  — sellers cannot be deleted while sessions exist; matches the
  posture of `listings.seller_id`.
- `listing_intake_sessions.listing_intent_id → listings(id) ON DELETE
  SET NULL` — an audit trail survives a hard-delete of the listing.
  The TS code calls these "listing intents"; the SQL table is named
  `listings`.
- `listing_intake_messages.session_id → listing_intake_sessions(id)
  ON DELETE CASCADE` — server-role-only deletes propagate.
- `listing_extractions.session_id → listing_intake_sessions(id) ON
  DELETE CASCADE` — same posture.

### RLS posture

RLS is enabled on every new table with **no permissive policies**.
Anon and authenticated are denied by default; the service-role
client (server-only) bypasses RLS for reads/writes. Future
seller-reads-own + admin-reads-all policies are deferred to a later
PR after the Supabase intake repository lands and an auth-bound
actor is in place.

### Migration apply status

**Not tested.** The Slice A migration was authored and statically
reviewed in an environment that has neither the `supabase` CLI nor
`psql` available. The migration has NOT been applied to a real
Postgres / Supabase project, and its SQL has NOT been validated by a
parser. It has been:

- statically read against the existing parent migration
  (`20260430120000_phase2_marketplace_draft.sql`) for style and
  pattern alignment;
- structurally sanity-checked (balanced `do $$ begin … end $$;`
  blocks, 4 / 4; one `as $$ … $$;` function body);
- cross-checked against the TypeScript domain in
  `src/domain/intake.ts` and the service caps in
  `src/lib/services/chatListingIntakeService.ts` /
  `src/lib/validators/listingInput.ts`.

Before Slice A PR 2 (the Supabase intake repository) lands, this
migration must be applied to the dev project (`corent-dev`) at
least once and the resulting tables / enums / triggers / function
must be verified to exist as designed. The repository implementation
in PR 2 will then be tested against that real DB.

### What is intentionally NOT in this PR

- No Supabase intake repository (`src/server/persistence/supabase/intakeRepository.ts`).
  *(Status updated: now landed in PR 2 — see "Slice A PR 2" below.)*
- No service wiring; `chatListingIntakeService` continues to call
  `getPersistence()`.
- No client adapter changes; `src/lib/client/chatIntakeClient.ts`
  keeps `SHARED_SERVER_MODE = false`.
- No authenticated RLS policies.
- No raw chat retention job. Target retention remains **90 days**
  per [`docs/corent_externalization_architecture_v1.md`](corent_externalization_architecture_v1.md)
  §11; implementation is a separate later PR.
- No public listing publication table, no rental / handoff / claim /
  trust / notification schema. Each is a later slice.

---

## Slice A — PR 2: Supabase intake repository (server-only)

Source files:
- [`src/server/persistence/supabase/intakeRepository.ts`](../src/server/persistence/supabase/intakeRepository.ts)
- [`src/server/persistence/supabase/intakeRepository.test.ts`](../src/server/persistence/supabase/intakeRepository.test.ts)
- [`src/server/persistence/supabase/validators.ts`](../src/server/persistence/supabase/validators.ts)
  (extended with intake validators)

PR 2 adds the **server-only** repository layer that the future PR 3
will wire `chatListingIntakeService` to. Today nothing in the running
app calls it — `getPersistence()` continues to return the local
memory / localStorage adapter pair, the chat intake server actions
unchanged, and `src/lib/client/chatIntakeClient.ts` still has
`SHARED_SERVER_MODE = false`.

### Methods exposed

Mirrors the chat intake slice of `PersistenceAdapter`:

| Repo function | Domain method it backs |
| --- | --- |
| `saveIntakeSession(session)` | `saveIntakeSession` |
| `getIntakeSession(id)` | `getIntakeSession` |
| `listIntakeSessions(limit?)` | `listIntakeSessions` |
| `appendIntakeMessage(message)` | `appendIntakeMessage` (insert-only) |
| `listIntakeMessagesForSession(sessionId)` | `listIntakeMessagesForSession` |
| `saveIntakeExtraction(extraction)` | `saveIntakeExtraction` |
| `getIntakeExtractionForSession(sessionId)` | `getIntakeExtractionForSession` |

### Row → domain normalization

- Sessions, messages: 1:1 column ↔ field mapping; `listing_intent_id`
  null ↔ `listingIntentId` undefined.
- Extraction `components`: empty `text[]` is folded to `undefined` on
  read so the round-trip matches the in-memory shape produced by
  `chatIntakeExtractor.ts`.
- Extraction `missing_fields` (jsonb):
  - **Write-path strict**: `validateMissingFieldsForWrite` rejects
    any unknown / wrong-typed entry; duplicates are dropped. Fail
    closed.
  - **Read-path tolerant**: `normalizeMissingFieldsForRead` filters
    unknown / wrong-typed entries silently and preserves order. Read
    tolerance is intentional — extraction is best-effort metadata
    that can be recomputed from the raw chat; failing a whole row
    on enum drift would be worse than dropping a stray entry.

The decision is documented in
[`src/server/persistence/supabase/validators.ts`](../src/server/persistence/supabase/validators.ts)
above the helper functions.

### Validation boundary (shape-only)

The repository is shape validation only. It does **not**:

- resolve actor identity (the intake server actions do, via
  `resolveServerActor`),
- enforce ownership / role policy,
- enforce status transitions (`drafting → draft_created` etc.),
- expose any raw-chat read path to the public projection layer.

Every input is run through validators in
[`src/server/persistence/supabase/validators.ts`](../src/server/persistence/supabase/validators.ts).
Untrusted shapes (non-UUID ids, unknown enums, oversized text,
out-of-bound numerics, unknown extraction fields) are rejected
before any DB call.

### Append-only enforcement

`appendIntakeMessage` exposes only `.insert(...)` — there is no
update / upsert / delete path. The DB-level trigger
`listing_intake_messages_reject_modify` (added by Slice A PR 1) is
the durable backstop.

### Test strategy

Default `npm test` runs against a mocked marketplace client. The
test file `intakeRepository.test.ts`:

- mocks `getMarketplaceClient` so no env / network is required;
- asserts the client-unavailable safe path (returns `null` / `[]` /
  `{ ok: false }`) for every method;
- asserts validator boundaries on every `save*` / `appendIntakeMessage`
  call;
- asserts row → domain mappers via the `_mappers` test seam;
- asserts JSONB write-strictness vs read-tolerance for `missing_fields`;
- asserts `appendIntakeMessage` uses INSERT and never UPSERT.

**Integration tests against a real Supabase project are NOT in
this PR.** When PR 3 lands and the migration has been applied to a
dev project, an env-gated `*.integration.test.ts` will skip cleanly
when the SUPABASE_* env vars are missing.

### Migration apply status

**Still UNVERIFIED in this environment.** The Slice A PR 1
migration (`20260502120000_phase2_intake_draft.sql`) has not been
applied to a real Postgres / Supabase project from this machine
because the canonical environment lacks the `supabase` CLI, `psql`,
and any container runtime. PR 2's repository code therefore
conforms to the documented schema by static review only — the
columns, constraints, triggers, and enum values it expects are
those declared in the PR 1 migration source, but no live insert /
read has been exercised against them.

PR 3 wiring (the chat intake service flipping to the repo behind
`CORENT_BACKEND_MODE=supabase`) **remains blocked** until the
migration has been applied to the dev DB and the repo's
client-available calls have been exercised against real rows.

### Related executable contracts (must continue to pass)

- Persistence snapshot parity contract —
  [`src/lib/adapters/persistence/persistence.test.ts`](../src/lib/adapters/persistence/persistence.test.ts).
  The future Supabase intake repository must satisfy the same
  snapshot semantics (read returns a snapshot, mutation-after-save
  cannot corrupt persisted state).
- Public projection privacy contract —
  [`src/lib/services/publicListingService.test.ts`](../src/lib/services/publicListingService.test.ts).
  No raw chat / extraction internals / intake session ids may leak
  through any public surface, even after a forced approval.
- Chat intake server actor boundary —
  [`src/server/intake/actions.test.ts`](../src/server/intake/actions.test.ts).
  Server actions resolve the actor server-side; the payload never
  carries an `actorSellerId`. The future Supabase repo continues to
  honor this — actor identity is a server-only field, never a
  payload column.

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

The migration is additive. Slice A's intake schema rolls back first,
then the parent marketplace migration. A rollback path is:

```sql
-- Slice A intake (20260502120000_phase2_intake_draft.sql)
drop table if exists public.listing_extractions       cascade;
drop table if exists public.listing_intake_messages   cascade;
drop table if exists public.listing_intake_sessions   cascade;
drop function if exists public.reject_modify();
drop type if exists public.intake_message_role;
drop type if exists public.intake_session_status;

-- Phase 2 marketplace (20260430120000_phase2_marketplace_draft.sql)
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

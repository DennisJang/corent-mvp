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

**Verified locally as of Slice A PR 3.** The three Slice A
migrations have been applied to a disposable local Supabase stack
(Supabase CLI 2.95.4 + Docker via OrbStack) via `supabase start` +
`supabase db reset`. The applied set:

- `20260430000000_phase1_analytics.sql`
- `20260430120000_phase2_marketplace_draft.sql`
- `20260502120000_phase2_intake_draft.sql`

Verified locally against the running stack: the new enums, the
three intake tables, RLS enabled with no permissive policies, the
append-only trigger on `listing_intake_messages`. The remote
`corent-dev` project has NOT been touched; `supabase db push` was
not run.

---

## Slice A — PR 3: chat intake supabase runtime gate (server-only)

Source files:
- [`src/server/intake/actions.ts`](../src/server/intake/actions.ts)
  (extended with `assertSupabaseAuthority` helper)
- [`src/server/intake/actions.test.ts`](../src/server/intake/actions.test.ts)
  (extended with explicit forged-authority-field coverage)
- [`src/server/intake/actions.backendMode.test.ts`](../src/server/intake/actions.backendMode.test.ts)
  (new file — backend-mode + actor-source branches)

PR 3 introduces the **runtime gate** between the chat intake server
actions and the Supabase intake repository. It does **not** dispatch
to the repository in this PR — the dispatch waits for a later PR
that lands real auth + a Supabase-resolved actor. The gate fails
closed in two layers; default behavior is unchanged.

### Mode behavior

| `CORENT_BACKEND_MODE` | Resolved actor source | Result |
| --- | --- | --- |
| unset / `mock` / unknown | mock | ✅ proceeds — local persistence path via `chatListingIntakeService` (the same path the same-browser demo has always used) |
| `supabase` | `mock` | ❌ `{ ok: false, code: "unauthenticated", message: "supabase_mode_requires_auth_bound_actor" }` |
| `supabase` | `supabase` (future state) | ❌ `{ ok: false, code: "internal", message: "supabase_runtime_not_yet_wired" }` |

### Why two-layer fail-closed

- **Mock actor in supabase mode.** Today every production resolver
  call returns a mock-sourced actor (the body of
  `resolveServerActor` still reads `getMockSellerSession`). Letting
  a mock identity authorize a shared-DB write would violate the
  externalization plan §3 principle "no client-supplied actor /
  status / amount trust" plus its corollary "mock actor identity
  must never authorize an external/shared-DB write". The
  `unauthenticated` code surfaces this clearly.
- **Supabase-sourced actor in supabase mode.** This is the future
  state once real auth lands. The dispatch from the gate to the
  Supabase intake repository is intentionally NOT in this PR —
  honest fail-closed beats unreachable code that pretends to work.
  The `internal` code with `supabase_runtime_not_yet_wired` makes
  the deferral explicit.

### Default user-visible behavior unchanged

- `CORENT_BACKEND_MODE` is unset by default → `getBackendMode()`
  returns `"mock"`.
- The `ChatToListingIntakeCard` continues to call the client
  adapter at `src/lib/client/chatIntakeClient.ts`, which keeps
  `SHARED_SERVER_MODE = false` and routes writes through the local
  `chatListingIntakeService` against browser localStorage.
- The seller dashboard refreshes from the same browser-local
  persistence and sees those writes immediately.

### What the gate does NOT do

- It does NOT dispatch to the Supabase intake repository in any
  branch. The repo exists (PR 2) and is callable from server-only
  code, but no production code path reaches it after PR 3.
- It does NOT touch the public listing projection, rental
  lifecycle, handoff records, claim windows, claim reviews, trust
  events, notification events, admin actions, payment, deposit,
  refund, or settlement paths.
- It does NOT change the client adapter or the seller dashboard.
  No UI or motion change.
- It does NOT add authenticated RLS policies. The deny-by-default
  posture from PR 1 is unchanged.
- It does NOT implement real auth. `resolveServerActor` still reads
  `getMockSellerSession`; the auth swap is deferred.

### Coverage added

- Existing forged-payload tests now also assert that
  `status` / `listingIntentId` / `role` / `adminId` / `trustScore`
  / `sellerOverride` injected via cast are runtime no-ops. The
  underlying invariant ("payload never carries authority") was
  already in place; PR 3 just makes the test explicit so a future
  payload-shape regression fires loudly.
- New `actions.backendMode.test.ts` covers the mock-mode default,
  the supabase-mode + mock-actor branch (per action), the
  supabase-mode + supabase-actor branch (per action, with the
  resolver mocked to synthesize the future state), and the
  non-secret-message guarantee on the failure path.

### Future PR (not in PR 3)

A later PR will:

1. Land real auth via Supabase Auth (replace `resolveServerActor`'s
   body so it returns a `source: "supabase"` actor).
2. Replace the `supabase_runtime_not_yet_wired` branch with the
   actual dispatch to `intakeRepository`.
3. Flip `SHARED_SERVER_MODE` in the client adapter (or replace the
   constant with a runtime probe of the server's mode) so a
   production-mode browser routes writes to the server actions.

Until those land, **`CORENT_BACKEND_MODE=supabase` is intentionally
inert from a chat-intake user-flow perspective** — the operator can
set it without breaking the same-browser demo, and any caller that
reaches the server actions in supabase mode receives a typed
fail-closed response instead of a write that would silently land
in the wrong persistence layer.

---

## Slice A — PR 4: intake writer + dispatcher seam

Source files:
- [`src/lib/intake/intakeWriter.ts`](../src/lib/intake/intakeWriter.ts)
  (NEW — interface + `localIntakeWriter`, browser-safe)
- [`src/server/intake/supabaseIntakeWriter.ts`](../src/server/intake/supabaseIntakeWriter.ts)
  (NEW — adapts the Supabase intake repository to the writer
  interface, server-only)
- [`src/server/intake/intakeWriterDispatcher.ts`](../src/server/intake/intakeWriterDispatcher.ts)
  (NEW — `getIntakeWriter(actor)` decision function, server-only)
- [`src/server/intake/intakeWriterDispatcher.test.ts`](../src/server/intake/intakeWriterDispatcher.test.ts)
  (NEW — pure unit tests for the dispatcher)
- [`src/lib/services/chatListingIntakeService.ts`](../src/lib/services/chatListingIntakeService.ts)
  (refactored to a `createChatListingIntakeService(writer)`
  factory; `chatListingIntakeService` const is the
  `localIntakeWriter`-backed default — every existing caller is
  unchanged)
- [`src/server/intake/actions.ts`](../src/server/intake/actions.ts)
  (uses the dispatcher; the PR 3 `supabase_runtime_not_yet_wired`
  fail-closed branch is replaced with real dispatch to the supabase
  writer when both mode and actor source are `supabase`; the
  mock-actor + supabase-mode branch still fails closed with
  `unauthenticated`)
- [`src/server/intake/actions.backendMode.test.ts`](../src/server/intake/actions.backendMode.test.ts)
  (supabase + supabase-actor tests now verify dispatch to a
  module-mocked `supabaseIntakeWriter` rather than the PR 3
  `not_yet_wired` failure)

PR 4 introduces the dispatcher seam **without unlocking any
shared-DB writes**. Default same-browser demo behavior is
byte-identical to pre-PR-4 because `localIntakeWriter` is a thin
pass-through to `getPersistence()`. Production cannot reach the
supabase branch today: `resolveServerActor`'s body still wraps
`getMockSellerSession()` and always returns `source: "mock"`.

### Decision table (current production behavior)

| `CORENT_BACKEND_MODE` | actor.source | Dispatcher returns | Action result |
| --- | --- | --- | --- |
| unset / `mock` / unknown / production | mock | `localIntakeWriter` | proceeds — writes to local persistence (browser localStorage / SSR memory) |
| `supabase` (dev only) | mock | `null` | `{ ok: false, code: "unauthenticated", message: "supabase_mode_requires_auth_bound_actor" }` |
| `supabase` (dev only) | supabase (test-mocked only) | `supabaseIntakeWriter` | dispatch to repository — unreachable from production until PR 5 lands real auth |

### What the writer covers

The `IntakeWriter` interface mirrors the seven chat intake methods
on the persistence adapter: `saveIntakeSession`, `getIntakeSession`,
`listIntakeSessions`, `appendIntakeMessage`,
`listIntakeMessagesForSession`, `saveIntakeExtraction`,
`getIntakeExtractionForSession`. Saves return `Promise<void>`;
the supabase writer adapts the repository's `RepoResult` shape by
throwing `IntakeRepoWriteError` on failure so the chat intake
service's existing try/catch surfaces it via the runner's
`internal` mapping.

### What the writer does NOT cover

- **Listing-side persistence inside `createListingDraftFromIntake`.**
  The service still calls `getPersistence().getListingIntent(...)`
  and `listingService.saveDraft(...)` directly. In the
  unreachable-today supabase + supabase branch, that means the
  intake row goes to Supabase but the listing draft itself goes to
  local persistence. Documented as a known limitation; extending
  the writer to listings is a future slice (most likely combined
  with the `public_listing_publications` boundary).
- **Trust events, claim windows, rental events, notification
  events, admin actions.** None of those are touched by chat
  intake; they remain on `getPersistence()` until each domain ships
  its own writer + dispatcher.

### What PR 4 explicitly does NOT do

- Does NOT implement seller / renter auth.
- Does NOT add a seller / renter sign-in route.
- Does NOT touch `profiles`, `seller_profiles`, or
  `borrower_profiles` (no reads, no writes).
- Does NOT change `resolveServerActor`'s body — it still wraps
  `getMockSellerSession()`. No production code path produces an
  actor with `source: "supabase"`.
- Does NOT flip `SHARED_SERVER_MODE` in
  [`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts) — browser writes still go through the local
  service path. The chat-to-listing card on the seller dashboard
  is unchanged.
- Does NOT add authenticated RLS policies. The deny-by-default
  posture from PR 1 stays.
- Does NOT add schema migrations.
- Does NOT touch the remote `corent-dev` Supabase project. No
  `supabase login`, `supabase link`, `supabase db push`, no
  `--db-url` flag. Local migration apply against the disposable
  Supabase + OrbStack stack remains the verification path.

### Tests (PR 4 totals: 596 / 41 files)

- **Existing chat intake service tests** keep passing unchanged
  because the default const `chatListingIntakeService` still
  exists with byte-identical behavior (it's
  `createChatListingIntakeService()` with the default writer).
- **Existing forged-payload tests** in
  [`actions.test.ts`](../src/server/intake/actions.test.ts) keep
  passing — the action's payload validation is upstream of the
  dispatcher.
- **New dispatcher unit tests** ([dispatcher.test.ts](../src/server/intake/intakeWriterDispatcher.test.ts))
  cover every cell of the decision table without touching
  persistence: mock mode → local; supabase + mock → null;
  supabase + supabase → supabase writer; identity invariants
  (`localIntakeWriter !== supabaseIntakeWriter`); dispatcher
  ignores forged actor fields beyond `kind` / `source`.
- **Updated supabase-actor tests** in
  [`actions.backendMode.test.ts`](../src/server/intake/actions.backendMode.test.ts)
  mock the supabase writer module so the test verifies dispatch
  reached it (not the local path), without standing up a real
  Supabase client. The test also asserts the mock-actor + supabase
  combination never reaches the writer.

### PR 5 prerequisites (PR 5A + 5B landed — actor resolution + manual provisioning workflow)

PR 5 is the auth + dispatch-flip slice. PR 5A landed the
**closed-alpha actor resolution** prerequisite. PR 5B added the
**manual closed-alpha provisioning workflow** as documentation +
template (the founder-only path that gives PR 5A's resolver a
data model to read). The remaining items still gate the dispatch
flip.

1. **Seller / renter auth route** — magic-link + callback,
   mirroring the founder-admin pattern in
   [`src/server/admin/auth.ts`](../src/server/admin/auth.ts) +
   [`src/server/admin/supabase-ssr.ts`](../src/server/admin/supabase-ssr.ts).
   *Tracked as PR 5C.* Not in PR 5A or 5B.
2. ✅ **Closed-alpha provisioning workflow (manual, founder-only)** —
   landed in PR 5B as documentation. The provisioning path is
   founder-driven: a manual SQL template at
   [`docs/sql_templates/closed_alpha_profile_capabilities.sql`](./sql_templates/closed_alpha_profile_capabilities.sql)
   the founder substitutes per tester and applies via the Supabase
   SQL editor. PR 5B explicitly does **not** auto-create
   `profiles` / `seller_profiles` / `borrower_profiles`, does not
   add an auth route, does not flip the runtime, and does not
   apply anything against `corent-dev`. See
   [`docs/corent_closed_alpha_provisioning_workflow.md`](./corent_closed_alpha_provisioning_workflow.md).
3. ✅ **`auth.uid → profiles + capability` resolver** — landed in
   PR 5A. `resolveServerActor` reads the SSR session via
   [`createAdminAuthClient`](../src/server/admin/supabase-ssr.ts),
   then [`lookupProfileCapabilities`](../src/server/actors/profileLookup.ts)
   reads `profiles` + `seller_profiles` + `borrower_profiles` and
   returns a normalized capability shape. The resolver picks
   between seller/renter actors via the new `prefer` option that
   `runIntentCommand` forwards. See
   [`docs/corent_closed_alpha_actor_resolver_note.md`](./corent_closed_alpha_actor_resolver_note.md).
4. **Client adapter flip** — flip `SHARED_SERVER_MODE` in
   `chatIntakeClient.ts` (or replace it with a runtime probe of
   the server's mode). *Tracked as PR 5D.* Not in PR 5A or 5B.

Once items 1 and 4 are in place (PR 5C, then PR 5D), PR 4's
dispatcher seam goes live without further changes to the chat
intake actions or service — the wiring is already in place and
PR 5A's resolver fulfills the auth-bound `source: "supabase"`
actor contract using profile / capability rows seeded via the
PR 5B workflow.

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

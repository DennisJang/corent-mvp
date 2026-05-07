# CoRent Externalization Architecture v1

> **Status:** Historical / Former Vertical Externalization Plan
> **Scope:** the local-mock → Supabase externalization plan for
> the CoRent rental-marketplace vertical.
> **Superseded by:** [`platform_thesis_ai_interaction_layer.md`](platform_thesis_ai_interaction_layer.md)
> + [`platform_pivot_note_2026-05-07.md`](platform_pivot_note_2026-05-07.md)
> as the active product direction. The patterns it captures
> (typed adapter seam, deny-by-default RLS, server-only
> projection, mock-first / real-server gated) remain reusable
> for future platform-side persistence work.
> **Last reviewed:** 2026-05-07 (demoted to Historical per the
> 2026-05-07 platform pivot).
> **Read before:** nothing on the active roadmap. Read for
> orientation when designing platform persistence shape later.
> **Do not use for:** current roadmap, marketplace launch
> sequencing, KYC, public beta, mobile apps. Body unchanged.

_Original metadata, retained for context:_

Status: docs-only architecture plan
Scope: same-browser local MVP → closed-alpha external-tester architecture
Not in scope: production launch, payments, KYC, public beta, mobile apps

Companion documents:

- [`docs/corent_ux_system_v1.md`](corent_ux_system_v1.md) — UX route this architecture must serve
- [`docs/corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md) — visual material rules
- [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md) — pre-revenue beta posture and feature flags
- [`docs/corent_security_gate_note.md`](corent_security_gate_note.md) — security review gate (DB / auth / payment / upload / location)
- [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md) — C2C posture, no wallet, banned regulated language
- [`docs/corent_database_schema_draft.md`](corent_database_schema_draft.md) — earlier marketplace schema draft
- [`docs/phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md) — Phase 2 dev-only schema draft
- [`docs/phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md) — Phase 2 dev-only adapter wiring
- [`docs/db_readiness_audit_v1.md`](db_readiness_audit_v1.md), [`docs/mvp_security_guardrails.md`](mvp_security_guardrails.md)
- [`docs/corent_return_trust_layer.md`](corent_return_trust_layer.md) — handoff / claim / trust event posture

---

## 1. Purpose

The CoRent MVP runs entirely inside one browser profile today: mock
identities, localStorage persistence, no notifications. That is the
right shape for the guided local demo and for design / flow
iteration, but it is wrong for any external tester who is on a
different device, in a different browser, or unable to confirm what
the seller saw a minute ago.

This document is a docs-only **architecture plan** for the smallest
coherent step away from same-browser localStorage:

- a shared DB as the source of truth for state that two parties need
  to see at the same time,
- server-resolved identity (no caller-supplied `actorSellerId`
  trusted in writes),
- a server write boundary that preserves the existing ownership /
  status / append-only invariants,
- a durable publication boundary so renter requests target a
  *published* listing snapshot, not a private draft,
- a notification event model so a request, an approval, or an admin
  decision can reach the relevant party,
- a privacy posture for raw chat text and listing secrets.

What this document is NOT:

- not a production launch plan,
- not a payment / deposit / settlement / refund / Toss-PG plan,
- not a delivery / logistics plan,
- not a marketing / public beta plan,
- not a real migration — no SQL, no source code, no schema files.

It is the plan that the next several implementation tasks will draw
from. Implementation steps still go through the security review gate
in [`corent_security_gate_note.md`](corent_security_gate_note.md)
and are individually approved by the founder per the agent loop in
[`agent_loop.md`](agent_loop.md).

## 2. Current Local Architecture

The local MVP today has the following moving parts. Every record is
client-only unless noted; nothing is shared between browsers.

| Object | Where it lives now | Notes |
|---|---|---|
| Mock seller identity | `src/lib/auth/mockSession.ts` (`getMockSellerSession`) | Hardcoded `seller_jisu`. Not real auth. |
| Mock renter identity | `src/lib/auth/mockSession.ts` (`getMockRenterSession`) | Hardcoded `borrower_local_mvp`. Not real auth. |
| Memory persistence | `src/lib/adapters/persistence/memoryAdapter.ts` | Used during SSR and as base class for localStorage adapter. |
| Local persistence | `src/lib/adapters/persistence/localStorageAdapter.ts` | The user-facing path. Single browser. |
| Seller profile overrides | `seller_profile_overrides` collection in adapter | Override only; static `SELLERS` fixture is never mutated. |
| Listing intents | `listing_intents` collection in adapter | Status-machined draft → human_review_pending → approved. |
| Chat intake sessions | `intake_sessions` collection (added in `523673a`) | Owned by `actorSellerId`. |
| Chat intake messages | `intake_messages` collection | Append-per-session. |
| Chat intake extractions | `intake_extractions` collection | One extraction per session in skeleton. |
| Public listing projection | `src/lib/services/publicListingService.ts` | Pure projection — no durable publication record. |
| Rental intents | `rental_intents` collection | Created from canonical `PRODUCTS` via `rentalService.createRequestFromProductId`. |
| Rental events | `rental_events` collection | Append-only lifecycle log per rental. |
| Handoff records | `handoff_records` collection | At most one per `(rentalIntentId, phase)`. |
| Claim windows | `claim_windows` collection | At most one per rental. |
| Claim reviews | `claim_reviews` collection | Admin queue surface in beta. |
| Trust events | `trust_events` collection | Append-only; duplicate-id rejected. |
| Admin decisions | Local persistence today; partial server validators in `src/server/persistence/supabase/` | Server validation skeleton exists; persistence still client-side. |
| Guided local demo | `src/components/LocalDemoGuide.tsx`, `src/lib/demo/localDemoGuide.ts` | Surfaces mock roles + recommended demo product. Same-browser only. |
| UX system | [`docs/corent_ux_system_v1.md`](corent_ux_system_v1.md) | The UX route this architecture must serve. |

What is missing for any external tester:

- no shared DB → cross-device tests are impossible;
- no real auth → ownership cannot be defended outside the browser;
- no durable publication record → renter requests target the same
  static / draft surface the seller is editing;
- no notifications → seller has no way to know a request arrived;
- raw chat text retention is undefined;
- trust event emission and state writes are not transactional.

## 3. Externalization Principles

These principles bind every implementation task that derives from
this document.

1. **Server derives actor identity.** Once auth ships, no write path
   trusts a client-supplied `actorSellerId` / `actorBorrowerId` /
   `adminId`. The server resolves the session, then runs the same
   ownership guards the client already has, against the canonical
   record loaded from the DB.
2. **No client-supplied actor / status / amount trust.** The Phase
   1.11 rule that renter requests must derive seller / product /
   price / status from canonical sources stays. The server-side
   write boundary enforces it as a hard rule.
3. **Shared DB is source of truth.** When two parties (seller +
   renter, seller + admin, renter + admin) need to see the same
   state, the DB row is the truth. The client never invents state.
4. **Append-only logs stay append-only.** `rental_events`,
   `trust_events`, `admin_actions` cannot be rewritten. Re-saving
   the same id is rejected. Cascading deletes (e.g.
   `deleteRentalIntent`) preserve the audit invariants of the local
   adapters.
5. **Public data is publication, not raw draft.** Renter-facing
   surfaces read from a durable publication snapshot. Drafts,
   private fields, and raw chat are never projected to public
   surfaces, even by accident.
6. **Notifications are transaction infrastructure.** They exist to
   make a real event reach the right party. They are not marketing
   and never manufacture urgency. (UX system §11 is the policy
   source.)
7. **Beta honesty remains mandatory.** No payment, deposit, refund,
   settlement, escrow, insurance, or legal adjudication copy ships
   with externalization. The forbidden-phrase list in
   `src/lib/copy/copyGuardrails.test.ts` is the executable form.
8. **No payment / deposit / settlement implementation in this
   phase.** Externalization is identity + persistence + publication
   + notifications. Money is a separate phase, gated by the security
   review and partner contract.

## 4. Durable Data Classification

| Object | Current source | Future storage | Visibility | Sensitivity | Notes |
|---|---|---|---|---|---|
| `users` / `profiles` | mock session | DB; `auth.users` provides id | private (own) / derived (display name on storefront) | high | server-resolved auth.uid as the only id source. |
| `seller_profiles` | static `SELLERS` + `SellerProfileOverride` | DB; static fixture stays read-only seed | derived public | medium | display name + public note are public; standing/score is derived. |
| `borrower_profiles` | mock renter session | DB | private | medium | no public projection. |
| `listing_intake_sessions` | local adapter | DB | private to seller | medium | session lifecycle: drafting → draft_created / abandoned. |
| `listing_intake_messages` | local adapter | DB | private to seller | high (raw chat) | append-only per session; retention policy required (see §11). |
| `listing_extractions` | local adapter | DB | private to seller | medium | derived; recomputable from messages. |
| `listing_intents` | local adapter | DB | private until approved | medium | source of approved publication. |
| `listing_private_fields` / `listing_secrets` | nested in listing today (`privateSerialNumber`) | DB; separate row, server-only read | private | high | never projected publicly; future server-only access. |
| `public_listing_publications` | not yet a record (live projection) | DB | public | low | snapshot of an approved listing at publish time. |
| `rental_intents` | local adapter | DB | scoped to parties + admin | medium | references `public_listing_publications.id` going forward. |
| `rental_events` | local adapter | DB | scoped + audit | medium | append-only; `(rental_id, at)` indexed. |
| `handoff_records` | local adapter | DB | scoped to parties | medium | unique per `(rental_id, phase)`. |
| `claim_windows` | local adapter | DB | scoped + admin | medium | one per rental. |
| `claim_reviews` | local adapter | DB | admin + parties (status only) | medium | review notes private to admin. |
| `trust_events` | local adapter | DB | derived (counts only public) | medium | append-only; emission must be transactional with state writes. |
| `admin_actions` | partial server validators | DB | admin + party-visible status | high (audit) | append-only; persists every founder/admin write. |
| `notification_events` | none | DB | scoped to recipient + audit | medium | event row created when a real state change demands a notice. |
| `notification_deliveries` | none | DB | scoped + audit | medium | per-channel attempt log. |
| `notification_preferences` | none | DB | private | low | per-user, per-event, per-channel opt-out. |
| `push_subscriptions` | none | DB | private | high (endpoints + keys) | server-only, encrypted at rest where practical. |

Visibility codes: **private** = only the owning user can read; **scoped** = the
two parties on the rental and the admin can read; **derived public** = a
projection (allowlist) is public; **audit** = retained for review even when no
party is reading.

## 5. Proposed Shared Schema Outline

This section is **descriptive**, not SQL. The actual migration draft
should land as a separate, reviewable file (the `phase2_*` drafts
linked above are the closest existing precedent).

### `profiles` / `users`

- one row per auth.uid; display_name, role (`seller` / `renter` /
  `admin`), created_at;
- the only place the system maps `auth.uid` to the seller / renter
  ids that the existing services use;
- unique on `auth.uid`;
- RLS deny-all by default; a user can read their own row; admins can
  read all.

### `seller_profiles`

- one row per seller; references `profiles.id`;
- columns: display_name override, public_note, region (Korea-wide
  per Direction v2 §2);
- unique per `profile_id`;
- public read of `(display_name override, public_note, region)`
  through a view; everything else server-only.

### `borrower_profiles`

- one row per borrower; references `profiles.id`;
- columns: display_name (mock-aligned), preferences placeholder;
- no public projection.

### `listing_intake_sessions`

- one row per session; `seller_id` references `profiles.id`;
- columns: status (`drafting` / `draft_created` / `abandoned`),
  listing_intent_id (nullable), created_at, updated_at;
- index on `(seller_id, status)`;
- unique on `id`.

### `listing_intake_messages`

- append-only per session;
- columns: id, session_id, role (`seller` / `assistant` /
  `system`), content, created_at;
- index on `(session_id, created_at)`;
- retention: see §11.

### `listing_extractions` / `listing_draft_versions`

- one extraction per session in skeleton phase;
- if we later support multi-turn drafts, this becomes
  `listing_draft_versions` with a `(session_id, version)` unique
  index;
- columns: extracted fields, missing_fields jsonb, created_at;
- private to the owning seller.

### `listing_intents`

- the seller's draft / approved listing record;
- columns mirror the existing `ListingIntent` type minus the
  fields that move to `listing_private_fields`;
- status enum: `draft` / `human_review_pending` / `approved` /
  `rejected` (`ai_extracted` collapses into `draft` for storage);
- index on `(seller_id, status, updated_at desc)` for the dashboard
  table.

### `listing_private_fields` / `listing_secrets`

- one row per listing; columns: private_serial_number, raw_seller_input;
- server-only read; never returned by the public projection
  service;
- retention separate from the listing row.

### `public_listing_publications`

- one row per publication; references `listing_intent_id`;
- columns: snapshot of allowlisted public fields (title, category,
  pickup_area, prices, hero, condition_label, seller_display_name);
- columns: published_at, retracted_at (nullable);
- unique on `listing_intent_id` for the active publication;
- the renter request boundary references `publication_id`, not
  `listing_intent_id`.

### `rental_intents`

- one row per rental request;
- columns: id, publication_id, product_source (`static_product` |
  `approved_listing_intent`), product_id, product_name, category,
  duration_days, amounts (subset for display only — beta does not
  charge), seller_id, borrower_id, status, payment.* (still
  `mock`), pickup, return, settlement (still `not_ready`),
  created_at, updated_at;
- index on `(seller_id, status, created_at desc)` for the seller
  dashboard;
- index on `(borrower_id, created_at desc)` for the renter status.

### `rental_events`

- append-only;
- columns: id, rental_intent_id, from_status, to_status, at,
  reason, actor, metadata jsonb;
- index on `(rental_intent_id, at)`.

### `handoff_records`

- unique per `(rental_intent_id, phase)`;
- columns: checks (5 booleans), confirmed_by_seller,
  confirmed_by_borrower, note, created_at, updated_at.

### `claim_windows`

- one per rental;
- columns: status (`open` / `closed_no_claim` / `closed_with_claim`
  / `expired`), opened_at, closes_at, closed_at.

### `claim_reviews`

- one per claim window; columns: status, opened_reason, decision,
  decided_by (admin profile), decided_at, notes (admin-only read).

### `trust_events`

- append-only; columns: id, rental_intent_id, type, at, actor,
  handoff_phase (nullable), notes (nullable);
- duplicate id rejected at write time;
- emission must occur **inside the same transaction** as the state
  write that triggered it (see §6 + §9).

### `admin_actions`

- append-only; columns: id, admin_id, target_kind, target_id,
  action, recorded_state jsonb, notes, at;
- the audit spine for everything an admin does.

### `notification_events`

- one row per logical event (e.g. "rental r123 was requested");
- columns: id, type, target_kind, target_id (e.g. rental id or
  listing id), recipient_profile_id, payload (jsonb,
  copy-safe), idempotency_key, created_at;
- unique on `idempotency_key` to prevent double-fan-out.

### `notification_deliveries`

- per-channel attempt log;
- columns: id, event_id, channel (`in_app` / `email` / `web_push`
  / `mobile_push`), status (`queued` / `delivered` / `failed` /
  `suppressed`), attempt, last_error, delivered_at;
- index on `(event_id, channel)`.

### `notification_preferences`

- per `(profile_id, event_type, channel)`;
- columns: enabled boolean, updated_at;
- trust-critical events ignore opt-out (UX system §11 — admin
  decisions affecting the user always reach them).

### `push_subscriptions`

- per `(profile_id, endpoint)`;
- columns: endpoint, public_key, auth_key (encrypted), user_agent,
  created_at, expired_at;
- server-only read.

## 6. Auth / Ownership Matrix

The matrix below documents the contract every server write action
must satisfy. "Current local gap" describes what the in-browser
implementation currently lacks.

| Write path | Required actor | Canonical load | Server-side checks | Event / audit side effects | Current local gap |
|---|---|---|---|---|---|
| Chat intake start | seller (auth.uid) | new row | actor exists; one active drafting session per seller (optional) | none | actor is mock-supplied; trust-on-trust |
| Append intake message | seller | reload session | session.seller_id == auth.uid; status != draft_created | append message | actor mock-supplied |
| Create listing draft from intake | seller | reload session + extraction | session ownership; idempotency on already-finalized | save listing_intent; update session status | actor mock-supplied |
| Seller profile edit | seller | reload existing override | actor matches sellerId in override | none | actor mock-supplied |
| Listing draft edit | seller | reload listing | actor == listing.seller_id; status in editable set | none | actor mock-supplied |
| Listing submit for review | seller | reload listing | actor ownership; verification complete | rental-event-style listing_review_event (future) | actor mock-supplied |
| Admin listing publish / reject (future) | admin | reload listing | actor.role == admin | admin_action append; trust event possibly | path mostly absent locally |
| Renter request creation | renter | reload publication | publication exists & active; duration valid; price derived from publication | rental_event request; notification_event to seller | publication boundary missing |
| Seller approve / decline | seller | reload rental | actor == rental.seller_id; status transition allowed | rental_event; trust_event; notification_event to renter | actor mock-supplied |
| Pickup / return / handoff | seller or renter | reload rental + handoff | actor is a party on the rental; phase matches status | handoff_record upsert; trust_event; notification_event | actor mock-supplied |
| Claim open / close | seller, renter, or admin | reload window | actor is a party (or admin) | claim_window update; trust_event; notification_event | actor mock-supplied |
| Admin claim decision | admin | reload review | actor.role == admin | claim_review update; admin_action; trust_event; notification_event | persistence still local-side after server validation |
| Trust event append | system (transactional) | n/a | called only inside a transaction that just committed a real state change | row insert; idempotent via duplicate id reject | currently emitted outside transactions |
| Notification event enqueue | system (post-commit) | n/a | only after the state change is durably committed | idempotency key prevents fan-out twice | not implemented |

## 7. Public Listing Publication Boundary

Today, `publicListingService` projects from two sources at read
time: static `PRODUCTS` and `ListingIntent` rows where status is
`approved`. The projection is correct (allowlist, no raw input, no
private serial), but it is a *live function*, not a *durable
record*.

Why externalization needs a durable publication record:

- **Renter requests must target a stable id.** If a renter requests
  an "approved listing intent" and the seller then re-edits the
  draft, the projection silently shifts under a request that has
  already been sent. A durable `public_listing_publications` row
  freezes the public surface at publish time.
- **Retraction is a real state.** Today there is no way to take
  down an approved listing without unapproving it (which is also
  not a real flow). A `retracted_at` timestamp on the publication
  row makes "no longer publicly listed" first-class.
- **Static products as demo fallback.** Static `PRODUCTS` continue
  to project directly because they are seed data, not seller-edited
  drafts. Renter requests against static products still go through
  `rentalService.createRequestFromProductId`. This path stays
  unchanged for the closed alpha.
- **Approved ListingIntent → publication snapshot.** When an admin
  approves a listing, the server writes one
  `public_listing_publications` row capturing the allowlisted public
  fields at that moment. Subsequent draft edits do *not* re-publish
  unless approved again.
- **Renter requests target publication id, not raw draft id.** The
  rental_intents row carries `publication_id` (and a snapshot of
  `product_source`, `product_id`, `product_name`) so the rental's
  identity is independent of any later listing edits.
- **No seller self-publish.** Sellers cannot move a draft to
  `approved` themselves. The publish action is admin-only.
- **No draft / rejected / private fields public.** The publication
  row shape is the *only* surface the public projection reads from
  (alongside static products). The draft listing remains private.

Migration order for this boundary lives in §9.

## 8. Notification Event Architecture

### Conceptual model

```
state change → notification_events (one row per logical event)
            └→ notification_deliveries (one row per channel attempt)
```

### Initial triggers

| Trigger | Recipient | Channel priority | Idempotency key | Sync vs queued | Copy safety |
|---|---|---|---|---|---|
| `rental_requested` | seller | in_app, email | `rental:<id>:requested` | queued | "새 요청이 도착했어요" — never "결제 완료" |
| `seller_approved` | renter | in_app, email | `rental:<id>:seller_approved` | queued | "셀러가 승인했어요" — must not imply payment |
| `seller_declined` | renter | in_app, email | `rental:<id>:seller_declined` | queued | calm, no urgency |
| `pickup_action_needed` | counterparty | in_app | `rental:<id>:pickup_action_needed` | queued | structured checklist reminder |
| `return_action_needed` | counterparty | in_app | `rental:<id>:return_action_needed` | queued | structured checklist reminder |
| `claim_opened` | counterparty + admin | in_app, email | `claim:<id>:opened` | queued | procedural; not "분쟁" |
| `admin_decision_recorded` | parties | in_app, email | `claim:<id>:decided` | queued | "운영자 결정이 기록됐어요" — never "보상" |
| `listing_draft_created` | seller (self-confirmation) | in_app | `intake:<session>:draft_created` | sync | "초안이 저장됐어요" |
| `listing_review_needed` | admin | in_app, email | `listing:<id>:review_needed` | queued | review queue ping |
| `listing_review_approved` / `…_rejected` | seller | in_app, email | `listing:<id>:approved` / `…rejected` | queued | calm; rejection includes reason text |

Idempotency keys prevent the same logical event from fanning out
twice when a write retries. Channels respect `notification_preferences`
except for trust-critical events (admin decisions affecting the
recipient always reach in_app + email).

### Channel rollout order

| Tier | Channel | When |
|---|---|---|
| 0 | `in_app` | first; the source of truth notification surface |
| 1 | `email` | once an email transport is contracted; opt-out per type |
| 2 | `web_push` | once user grants permission; mostly seller-side |
| 3 | `mobile_push` | post-mobile-app shell; seller approval inbox first |
| 4 | `webhook` | partner integrations only, never in beta |

### Posture rules (UX system §11 binds these)

- no marketing pushes ever;
- no urgency manufacturing — no countdown timers, no "지금 응답" copy;
- per-event opt-out via `notification_preferences`;
- mobile push opt-in by default;
- no SMS in beta (regulatory load).

### Sync vs queued

- **Sync** notifications run inside the same request as the state
  write (e.g. self-confirmation toast on draft save). They cannot
  fail the state write.
- **Queued** notifications are enqueued *after* the state-write
  transaction commits. A separate worker processes the queue and
  records `notification_deliveries`. Queue processing is idempotent
  via the event row's idempotency key.

## 9. Server Write Boundary Migration Order

Recommended sequence. Each step is its own approved task; do not
collapse two steps into one PR.

1. **Schema draft / repository interface.** Land the SQL migration
   draft alongside an updated `phase2_*` doc. Define the repository
   interface (the server-side counterpart of
   `PersistenceAdapter`). No app behavior changes.
2. **DB adapter / repository skeleton.** Implement the repository
   against the migration. Behind a runtime flag, identical to the
   existing `CORENT_BACKEND_MODE=supabase` gate. Default app
   behavior unchanged.
3. **Auth-backed actor resolution.** A server helper that resolves
   `auth.uid` → seller / renter / admin role. Replaces
   `getMockSellerSession` for server-only writes; mock helpers stay
   as the migration site for any caller still on the local path.
4. **Chat intake server actions.** Move `chatListingIntakeService`
   writes behind a server boundary that enforces actor identity
   from auth. Read paths stay local until the seller has logged in.
5. **Seller listing / profile server actions.** Same shape as #4 for
   `listingService.updateOwnListingDraft` and
   `sellerProfileService.updateOwnProfile`.
6. **Public publication boundary.** Add `public_listing_publications`
   table and the admin publish action. `publicListingService`
   reads from publications + static products instead of approved
   `ListingIntent` rows.
7. **Renter request from publication id.** Update
   `rentalService.createRequestFromProductId` to support
   `createRequestFromPublicListingId` (publication or static
   product). Forbid creating requests from raw draft ids.
8. **Seller approval / decline server actions.** Move the rental
   state machine writes server-side; emit trust events
   transactionally inside the same DB transaction.
9. **Handoff / return / claim server actions.** Same shape as #8
   for handoff / return / claim window.
10. **Admin decision server action.** Persist admin decisions
    server-side, finishing the work the existing
    `src/server/persistence/supabase/` validators started.
11. **Trust event append inside transactions.** Audit every state
    write to confirm the trust event row is created inside the
    same transaction as the state row, not as a separate call.
12. **Notification event enqueue after committed state changes.**
    The notification_events table comes online and the in_app
    channel is wired. Email follows once a transport is contracted.

## 10. External Tester Readiness Tiers

| Tier | Description | Min auth | Min DB | Min notifications | Admin recovery / reset | Acceptable limits |
|---|---|---|---|---|---|---|
| Tier 0 — same-browser guided demo | today | mock | localStorage | none | "로컬 데이터 비우기" | single browser; no cross-device |
| Tier 1 — closed alpha | known testers, real devices | server-resolved auth (Supabase Auth) | shared DB (Postgres) | `in_app` + `email` for trigger list in §8 | admin-side data wipe per tester (script, not UI) | invite-only; no public sign-up; no payments |
| Tier 2 — broader external beta | wider invite list | + email verification + role enforcement | + RLS + retention policy implemented | + `web_push` opt-in | admin queue triage in UI | still no real money; still no SMS |

Tier 1 is the immediate target of this plan. Tier 2 happens after
Tier 1 has soaked and the security review for it has cleared. The
production / public-launch tier is intentionally out of scope here.

## 11. Raw Chat / Privacy Policy Draft

CoRent's chat-to-listing intake produces text that is intentionally
private to the seller. Treating it as a long-lived corpus is wrong
for both legal and trust reasons.

Rules:

- **Raw seller messages are private / internal.** Never appear on
  any public surface. Only the seller and the system processing
  the messages can read them.
- **Extracted structured fields can become listing drafts.** The
  extraction is the bridge from private chat to a draft the public
  projection might later read (after admin approval) — and even
  then, only via an explicit allowlist.
- **Public projections never include raw messages.**
  `public_listing_publications` shape forbids `raw_seller_input` /
  `raw_messages` columns by construction.
- **Retention policy required.** Default proposal: raw messages
  retained 90 days from session creation, then hard-deleted from
  the DB; structured extraction retained as long as the listing is
  active (deletion when the listing is hard-deleted). Final
  retention numbers approved with the founder before Tier 1.
- **Future AI provider logs must be controlled.** When a real LLM
  provider replaces the local deterministic extractor, the API
  call must run with provider-side data-retention disabled where
  the provider supports it (e.g. zero-data-retention mode). Logs
  the provider keeps despite that must be documented in the
  privacy posture.
- **Forbidden in the chat surface (this phase):** private serial
  numbers, full street addresses, GPS coordinates, phone numbers,
  resident registration numbers (RRN / 주민등록번호), payment
  credentials. The chat input must reject obvious matches and the
  storage layer must redact suspected matches at write time.

The privacy posture inherits the regulated-language ban from
[`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md):
no "보장", "보험", "안전거래", "에스크로", or comparable copy.

## 12. Risks / Open Decisions

| # | Risk / Decision | Notes |
|---|---|---|
| 1 | DB choice — Supabase vs other Postgres | Phase 2 drafts assume Supabase; alternative is bring-your-own-Postgres + a managed auth (e.g. Clerk). Decision should consider RLS ergonomics and existing migration drafts. |
| 2 | RLS policy timing | RLS deny-all by default + per-table allow-policies. Open question: ship Tier 1 with permissive server-key writes and RLS-enforced reads only, or full RLS from day one. |
| 3 | Publication snapshot vs live projection | Plan recommends snapshot. Live projection is simpler but breaks the "stable id" invariant when a seller edits an approved listing. |
| 4 | Raw chat retention length | 90-day default proposed in §11; founder/legal review needed. |
| 5 | Notification provider choice | Email transport (Resend / Postmark / SES) + push provider (Web Push / FCM). Picking late is fine; reserve the abstraction now. |
| 6 | Push subscription privacy | Endpoints + auth keys are sensitive; encrypt at rest, server-only read, document deletion path. |
| 7 | Local reset vs real data reset | The dashboard's "로컬 데이터 비우기" button cannot survive externalization unchanged. Tier 1 needs an admin-side per-tester wipe script. |
| 8 | Trust event transactionality | Today some trust events are emitted from service code separate from the state write. Audit and fix inside Step #11 of §9. |
| 9 | Legacy local helpers quarantine | `getMockSellerSession` / `getMockRenterSession` must be inert on server-only paths once auth ships. Imports from server code must be banned by lint. |
| 10 | AI provider integration boundary | When a real LLM replaces the deterministic extractor, the call must be a server-side action with explicit allowlist on what is sent and what is logged. Not in this phase. |
| 11 | Idempotency key generation | Notification idempotency keys must be deterministic from the state change so retries collapse, not duplicate. Document key formats per trigger before #12 in §9. |

## 13. Recommended Next Implementation Tasks

These are the immediate follow-ups this document enables. Each
should be a separate, scoped task with its own approval gate.

1. **Server-side Chat Intake Boundary Skeleton.** A
   server-action wrapper around `chatListingIntakeService` that
   enforces actor identity and prepares the path to DB-backed
   intake_sessions / intake_messages. No DB yet — interface only.
2. **Shared DB Schema Draft / Supabase Migration Draft.** A new
   migration draft + companion doc covering every table in §5.
   Behind the existing `CORENT_BACKEND_MODE=supabase` gate.
3. **Public Publication Boundary Skeleton.** Add
   `public_listing_publications` to the schema draft and a
   read-side adapter that prefers publications over live projection
   when the table exists. No publish action yet.
4. **Notification Event Model Skeleton.** Add the notification
   tables to the schema draft + a stub repository that records
   `notification_events` rows but does not yet deliver. Verifies
   the post-commit enqueue contract end-to-end.
5. **Auth-backed role resolution.** A server helper that resolves
   `auth.uid` → role. Mock helpers stay client-side; server code
   stops importing them. Lint rule + audit.

## 14. Explicit Non-Goals

This plan does NOT implement, design, or schedule any of:

- real payment integration (Toss / PG / card)
- deposit holds
- refunds
- settlement payouts
- escrow
- insurance
- legal adjudication / dispute arbitration
- delivery / logistics
- KYC / RRN / phone verification
- public beta
- mobile app implementation
- UI / visual redesign

Each of those has its own gate. Externalization is identity +
persistence + publication + notifications, and that is enough work
on its own.

---

## Appendix: relationship to existing docs

- **UX system v1** ([`corent_ux_system_v1.md`](corent_ux_system_v1.md))
  is the route this architecture must serve. Notification posture
  here implements UX system §11; trust UX rules in UX system §10
  bind the trust_events transactionality requirement.
- **Design system v1**
  ([`corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md))
  is unaffected — externalization changes persistence, identity, and
  notifications, not visual material.
- **Pre-revenue beta plan**
  ([`corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md))
  governs the feature flags this work plugs into. `ENABLE_REAL_DB`
  gates the DB adapter; `ENABLE_PAYMENTS` / `ENABLE_DEPOSITS` /
  `ENABLE_FEES` stay off.
- **Legal / trust architecture note**
  ([`corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md))
  bans the regulated language this plan refuses to introduce, even
  in notification copy.
- **Phase 2 schema / backend drafts**
  ([`phase2_marketplace_schema_draft.md`](phase2_marketplace_schema_draft.md),
  [`phase2_backend_integration_draft.md`](phase2_backend_integration_draft.md))
  are the closest existing precedents. This plan supersedes their
  scope where they conflict (publication boundary, notifications,
  raw chat retention) and inherits where they agree (Postgres on
  Supabase, deny-by-default RLS, server-only writes).
- **Security gate note**
  ([`corent_security_gate_note.md`](corent_security_gate_note.md))
  remains the per-step approval gate. Every implementation task
  derived from §13 must clear it before merge.

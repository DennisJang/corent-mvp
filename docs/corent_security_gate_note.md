# CoRent Security Gate Note

_Recorded: 2026-04-30_

## 0. Posture

**Security is a gate, not a current feature sprint.**

CoRent's MVP v1 ([`corent_mvp_v1_completion_note.md`](corent_mvp_v1_completion_note.md))
deliberately has **none** of the surfaces that require a security
review:

- no real auth or session model (no sign-in, no cookies, no JWT, no
  device binding);
- no real database (persistence is `localStorage` via
  `LocalStoragePersistenceAdapter` with `MemoryPersistenceAdapter`
  as SSR fallback);
- no real payment integration (Toss / PG live wiring is gated, see
  [`corent_legal_trust_architecture_note.md` §3](corent_legal_trust_architecture_note.md));
- no real file/photo upload (verification photos are placeholder
  fixtures only);
- no GPS or location-based matching (geography is user-entered
  text, see
  [`corent_legal_trust_architecture_note.md` §5](corent_legal_trust_architecture_note.md)).

Because none of these surfaces exist yet, there is **no security
attack surface to harden in this codebase right now**. Treating
security as a feature sprint at this stage would produce
defenses-in-search-of-threats and would not improve the actual risk
posture.

The correct posture is:

> **Security is a gate. Each of the surfaces above triggers a
> structured review before its implementation lands.**

This note defines the gate.

## 1. Trigger Conditions

A security review **must** be completed and recorded as a
docs-only readiness note before any of the following changes are
merged:

- **Real DB integration** — replacing or augmenting
  `LocalStoragePersistenceAdapter` /
  `MemoryPersistenceAdapter` with a network-backed datastore
  (Supabase, Postgres, or any service that holds CoRent data
  off-device).
- **Real auth / session** — any sign-in flow, identity provider
  integration, session token issuance, or persistent user record
  creation.
- **Real payment partner integration** — live PG / Toss
  Payments wiring, real session creation, real webhook handling,
  any code path that can move money off the mock adapter.
- **Real file / photo upload** — accepting bytes from the user
  and persisting them to a backend or third-party object store
  (verification photos, condition photos, listing imagery).
- **Location-based matching** — GPS reads, geofenced search,
  distance-ranked recommendations, or any feature that ingests
  location-information data subject to 위치정보의 보호 및 이용 등에
  관한 법률.
- **Partner-protection wiring** — connecting a licensed insurance
  / guarantee / indemnity partner per
  [`corent_legal_trust_architecture_note.md` §4](corent_legal_trust_architecture_note.md).

Triggers are **inclusive**: a single PR that touches more than one
surface (e.g. real DB + real auth) requires the review to cover
**all** triggered areas, not the most prominent one.

## 2. Required Review Areas

When the gate is invoked, the review must cover **at minimum** the
following areas. Areas that the triggering change does not touch
must still be acknowledged ("not in scope of this gate, last
reviewed: …") so the next reviewer knows the historical state.

- **Auth / session model** — identity issuance, session lifetime,
  rotation, revocation, multi-device behavior, server-side
  validation.
- **Database row-level access** — which rows each role can read /
  write; how borrower-vs-lender separation is enforced at the
  query layer, not just the UI.
- **Renter / lender private data separation** — what each side can
  see about the other, and at which lifecycle stages that
  visibility changes (e.g. contact details revealed only after
  approval).
- **Contact / address reveal rules** — phone numbers, addresses,
  pickup locations: when revealed, to whom, with what audit trail.
- **Photo proof file access control** — which photos are private,
  which are shared, who can request originals vs. thumbnails,
  retention windows.
- **Payment webhook verification** — signature verification on
  partner callbacks, replay protection, idempotency keys, source
  IP allow-listing where applicable.
- **Admin permission separation** — internal / operator surfaces
  must not share the user-side authentication context; principle
  of least privilege; auditability of admin actions.
- **Audit logs** — what is logged, retention, tamper resistance,
  PII redaction, who can read the logs.
- **Rate limiting** — per-account, per-IP, per-action limits;
  burst handling; abuse-trigger thresholds.
- **Abuse / spam prevention** — multi-account detection,
  registration friction, listing-spam controls, scraping defense.
- **Privacy retention / deletion policy** — retention windows by
  data class, user-initiated deletion paths, partner-side deletion
  propagation, legal-hold behavior.

## 3. Output Format

A security gate clearance is itself a **docs-only readiness note**
under `docs/`, produced **before** the triggering integration commit
lands. Pattern matches the upcoming DB readiness audit and the
existing direction notes:

- Filename pattern:
  `docs/corent_security_review_<surface>_<YYYY-MM-DD>.md` (e.g.
  `corent_security_review_db_2026-08-01.md`).
- Sections: posture, threat model for the triggering surface,
  per-area findings (the eleven areas in §2), residual risks,
  approvals, follow-up work.
- The note must be **explicitly approved by the user** before the
  triggering integration commit can be merged. Per
  [`agent_loop.md`](agent_loop.md), the user is the only final
  approver.
- One review note per integration. Do not merge multiple
  unrelated triggers under a single review.

## 4. Out of Scope (this note)

- **No security implementation.** This note does not write auth
  code, DB policies, webhook handlers, rate limiters, or any other
  defensive code.
- **No specific tooling choice.** No vendor (Supabase Auth,
  Auth0, Clerk, NextAuth, etc.) is endorsed here. Tooling
  selection is part of the per-surface review.
- **No auth library decision.** Library selection follows tooling
  discussion, which follows the trigger.
- All implementation items above remain gated on explicit user
  approval per [`agent_loop.md`](agent_loop.md).

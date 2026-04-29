# CoRent Defensibility Note

_Recorded: 2026-04-30_

## 0. Posture

CoRent does **not** rely on the secrecy of the raw rental-marketplace
idea for its defensibility.

The idea — "borrow personal items before buying, with trust, photo
proof, deposit, and lender payout" — is straightforward to describe,
straightforward to copy on a slide, and not a moat. Anyone reading
the public beta can repeat the concept.

Defensibility comes from things a competitor cannot copy by reading
the marketing site:

- **operational learnings** (what actually breaks during real
  rentals)
- **validated demand data** (which categories convert, at what
  price, in which regions)
- **trusted supply** (lenders we have onboarded and whose pickup
  /return discipline we have observed)
- **partner pipeline** (PG, protection, logistics, identity
  partners we are talking to)

Strategy in this window is to **expose the high-level concept
publicly** to validate demand while **keeping the operational
substrate private**.

## 1. What Public Beta May Expose

The following are acceptable public exposure for the pre-revenue
beta window
([`corent_pre_revenue_beta_plan.md` §0](corent_pre_revenue_beta_plan.md)):

- **High-level concept** — what CoRent is, what problem it solves
  for borrowers and lenders.
- **Brand** — name, tagline, Korean and English positioning copy.
- **Basic mechanics** — that there is a rental request flow,
  duration selection, pickup/return, deposit-style trust, lender
  approval, and a settlement step.
- **No-revenue beta positioning** — explicit framing of the
  current product as validation, not a paid service.

These are public. A copycat reading them learns nothing they
couldn't have inferred from the category itself.

## 2. Defensible Assets to Keep Private

The following are **not** for public disclosure and are not for
casual partner conversations either. They are the actual moat.

- **Category scoring data** — internal ranking of which categories
  validate, at what conversion rates, with what damage / hygiene /
  legal risk profiles.
- **Demand / supply conversion data** — funnel numbers from search
  to request to confirmed handover.
- **Price sensitivity data** — at which displayed prices users
  drop off, by category and duration.
- **Deposit acceptance data** — tolerance for deposit shape,
  amount, and authorization mechanism.
- **Lender preference data** — what lenders actually want from the
  workflow (approval latency, evidence burden, payout timing,
  refusal patterns).
- **Partner pipeline** — names, stages, and terms of conversations
  with PG, protection, logistics, and identity partners.
- **Dispute / trust workflow learnings** — which evidence types
  resolve disputes cheaply, which paths are actually abused, which
  copy reduces friction.
- **Operational playbooks** — how onboarding, dispute intake,
  recovery, and quality control actually run day-to-day.

The discipline to keep these private is what survives a competitor
launch.

## 3. Partnership Conversation Stance

When approaching partners (PG, protection, logistics, identity,
distribution, retail, brand) the conversation should lead with
**validated demand data**, not with the raw idea pitch.

- **Lead with**: "Here is the conversion data, the price-acceptance
  curve, the regional distribution, and the lender supply we have
  validated."
- **Do not lead with**: "We are building a rental marketplace; do
  you want to integrate?"

The data is the leverage. The pitch without data is the same
conversation any competitor can have, and partners discount it
accordingly.

If a partner conversation requires sharing private data from §2,
that share must:

- be scoped to the data the partner specifically needs for the
  decision,
- be documented (what was shared, when, with whom),
- and where appropriate be NDA-gated. NDA template choice is **out
  of scope of this note**.

## 4. Public Disclosure Restraint

The following must **not** be published until commercially
necessary, and even then only in summarized form:

- **Category rankings** — do not publish lists like "top categories
  by demand" or "categories we are skipping".
- **Scoring models** — do not publish the methodology used to score
  categories, lenders, items, or borrowers.
- **Detailed trust / fee logic** — do not publish the precise fee
  formula (3% + fixed TBD), the deposit threshold table, or the
  internal rules that drive verification states.

"Commercially necessary" means a specific business reason exists
(e.g. partner due diligence, a public-market disclosure, a
contractually required statement). It does not mean "useful for
content marketing".

This restraint applies to:

- public-facing pages on the product
- press / media coverage
- conference talks / podcasts
- blog posts
- investor updates that may be forwarded
- any partnership conversation without a confidentiality scope

## 5. Brand / Domain / Social Reservation

Reserve brand-adjacent assets where possible during the pre-revenue
window:

- domain names (primary `.com` / `.kr` and obvious adjacents)
- social handles (the major Korean and global platforms)
- app store identifiers (when the eventual app surfaces are
  decided)

This note does **not** prescribe a specific platform list, a
specific timing, or a specific budget for these reservations. The
purpose is only to record that the reservation work is part of
defensibility hygiene and should not be deferred until launch
mode.

## 6. Out of Scope (this note)

- **No marketing campaign plan.** No channel mix, no spend, no
  launch sequence is decided here.
- **No contract terms.** No partner contract drafts, no commercial
  terms, no exclusivity decisions are recorded here.
- **No PR plan.** No press strategy, no publication targets, no
  embargo schedule.
- **No NDA templates.** Standard NDAs are appropriate for some
  partner conversations but template selection / legal review is
  out of scope.
- **No specific platform decisions.** Where this note refers to
  social handles, app store identifiers, etc., it does so
  generically; specific platforms are decided elsewhere.

All implementation and commercial actions above remain gated on
explicit user approval per [`agent_loop.md`](agent_loop.md).

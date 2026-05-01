# CoRent UX System v1

Status: docs-only, founder-approved scope
Companion to: [`docs/corent_design_system_bw_v1.md`](corent_design_system_bw_v1.md)
Pre-revenue beta posture: [`docs/corent_pre_revenue_beta_plan.md`](corent_pre_revenue_beta_plan.md)
Legal / trust framing: [`docs/corent_legal_trust_architecture_note.md`](corent_legal_trust_architecture_note.md)
Product direction: [`docs/corent_product_direction_v2.md`](corent_product_direction_v2.md)

---

## 1. Purpose

This document defines the **UX system** for CoRent. It is intentionally
separated from the visual design system.

- The visual system (`corent_design_system_bw_v1.md`) owns *material*:
  palette, typography base, grid, line weight, spacing, radius, the
  black-and-white aesthetic, and the visual rules each component must
  obey.
- This UX system owns *route*: user intent, role-based flows,
  interaction rhythm, motion principles, typography motion rules,
  trust-layer experience, notification posture, device strategy, and
  the things the product must not imply.

If the visual system is the **brick**, this is the **walk-through**.
Visual polish is last-mile expression. UX defines the path the user
walks before the polish is even visible.

A future visual or motion redesign must respect this UX system; a
visual change that breaks a UX principle here is not a visual change,
it is a product change and goes through the same approval gate as
flow / business work in [`docs/agent_loop.md`](agent_loop.md).

## 2. Product Experience Thesis

> AI turns rough personal-asset input into a structured, trustable
> try-before-buy storefront. Renters request a low-risk trial.
> Sellers keep control. The trust layer makes the transaction
> legible before, during, and after handoff.

Three implications follow:

1. **Chat-to-listing is the seller core.** A seller's first
   experience is not a long form. It is a conversation that turns
   "I have a Theragun Mini I barely use, near 강남" into a structured
   listing draft. The form lives behind the chat as a fall-back
   editor, not in front of it.
2. **Try-before-buy is the renter core.** Renters do not browse to
   buy. They browse to *trial*. The CTA, the duration picker, and
   the request copy must all read as "borrow for a few days, decide
   later" — never as a sale or a long commitment.
3. **Trust is procedural, not decorative.** The trust layer is a
   sequence of recorded events (request → approval → handoff →
   return → claim window → admin review → trust event). It is not a
   decorative badge or a marketing-style "검증 완료" sticker. The UI
   shows the *sequence the transaction has traveled*, and that is
   what generates confidence.

Everything in this document follows from those three.

## 3. UX Principles

These are the load-bearing rules. When two principles conflict on a
specific surface, the higher-numbered one yields.

1. **Chat is creation.** The seller produces value by describing,
   not by filling 12 form fields. Chat-first UI is non-negotiable
   on the seller registration / new-listing path.
2. **Rough input, refined output.** The user's input may be casual,
   incomplete, or noisy. The system's output (the structured draft,
   the public storefront card, the trust summary) must be
   consistently calm and well-formed. Stabilization is the
   product's job, not the user's.
3. **Trust is procedural, not decorative.** No "안전 보장" sticker,
   no insurance badge, no escrow seal. Trust is what the sequence
   of recorded events says happened.
4. **Every state must answer "what happens next?"** A state without
   a next-step affordance is a bug. Empty states, failure states,
   pending states, and approved states all carry a single
   one-sentence "다음 단계" hint.
5. **Rhythm over noise.** The product alternates between burst
   moments (chat extraction, draft generated, request arrived,
   approval recorded, trust summary updated) and breathing spaces
   (draft review, listing detail, status timeline, trust
   explanation). Every screen is one or the other; not both.
6. **Constraint becomes signature.** C2C input quality is uneven by
   nature, and the beta posture forbids paid PG and real
   notifications. Treat those as design opportunities — typographic
   placeholders, structured fallbacks, calm "베타: 실제 송금 없음"
   disclosure — not as gaps to apologize for.
7. **Motion reveals state and intent; it must not decorate
   uncertainty.** A status changing from "요청됨" → "승인됨" is a
   motion moment. A spinner pretending the AI is "thinking" while
   a deterministic local extractor runs is not. See §7.
8. **Beta honesty.** UX never implies payment, deposit, refund,
   settlement, insurance, escrow, legal adjudication, automatic
   compensation, or guaranteed safety. The forbidden-phrase list in
   `src/lib/copy/copyGuardrails.test.ts` is the executable form of
   this principle; this document is the source.

## 4. Role-Based UX

### Seller

The seller's product is **time and trust**, not retail listings.

Surfaces:

- **Chat-to-listing**: single chat input → structured draft +
  assistant summary + missing-field list. No mid-flow form. Source
  of truth: `src/components/ChatToListingIntakeCard.tsx`.
- **Draft review / edit**: every extracted field is editable. The
  seller is always the final author of the listing. Public
  projection requires a separate approval step that the seller
  cannot self-trigger in beta.
- **Dashboard task handling**: the dashboard is a task inbox, not a
  metrics dashboard. Pending requests, active rentals, handoff
  actions, claim windows, and failures are all *things to do*,
  ordered by urgency.
- **Request approval / decline**: one-click 승인 / 거절 with copy
  that explains "결제는 베타에서 진행되지 않아요" before any
  irreversible action.
- **Handoff / return / claim**: structured checklists, never free
  text alone. The seller's input becomes a trust event the renter
  and the admin can both rely on.

The seller never sees the admin's claim review notes or another
seller's data, even in a same-browser local demo.

### Renter

The renter's product is **a few days of low-risk trial**, not a
purchase.

Surfaces:

- **Browse**: public storefront and search. Cards show pickup area,
  duration price triple (1d / 3d / 7d), and seller display name —
  not aggressive social-proof signals.
- **Request**: duration picker → 요청 보내기. The CTA copy must
  preview "셀러 승인 후 다음 단계로 이동해요. 베타에서는 실제 결제가
  진행되지 않아요."
- **Status tracking**: one timeline per rental request. Each
  transition is a recorded event. The renter sees what happened,
  what is pending, and what they can do next.
- **Pickup / return guidance**: the structured checklist mirror of
  what the seller sees. Both parties confirm the same five items
  (mainUnit, components, working, appearance, preexisting).
- **Claim visibility**: if a claim window opens or the seller
  reports an issue, the renter sees the procedural status — not the
  internal review notes.

The renter never sees other renters' history, the admin queue, or
seller-private fields (private serial number, raw seller input).

### Founder / Admin

The admin's product is **review consistency and audit posture**, not
adjudication or money movement.

Surfaces:

- **Review queue**: claims and trust-relevant events ordered by
  age. The admin works the queue; the queue does not work the
  admin.
- **Claim decisions**: structured outcomes (approve / reject /
  needs-more-info) with required notes. The decision creates an
  audit record. It does not move money, levy a penalty, or trigger
  a refund — beta posture forbids all three.
- **Audit posture**: every admin action emits a TrustEvent the
  affected parties can later see in summary form (not the notes).
- **No money / legal adjudication implication**: admin copy never
  uses "보상", "환불", "지급", "법적", "보증", "에스크로", or
  comparable phrases. The admin records *what they decided about
  the transaction state*, not *who pays whom*.

## 5. Core Flow UX

Each flow below is documented at the *experience* level. Code
references are the canonical implementation pointers.

### Seller chat-to-listing flow

`ChatToListingIntakeCard` → `chatListingIntakeService.startSession`
→ `appendSellerMessage` (deterministic local extractor) →
`createListingDraftFromIntake` → `ListingIntent` at status
`"draft"`.

UX rhythm: burst (chat extraction reveal) → breathing space (draft
review and edit). The reveal moment is the product's first WOW; do
not bury it under loading skeletons.

### Seller listing draft / edit / submit flow

Draft is editable per-field. Status transitions are
`draft → human_review_pending → approved | rejected`. The seller
cannot move themselves to `approved`; the admin path enforces this.

UX rhythm: breathing space throughout. The seller is reading,
correcting, and confirming, not creating.

### Public listing / storefront projection flow

`publicListingService` projects a `ListingIntent` only when status
is `"approved"` and shape passes the safe-allowlist check. Raw
seller input, private serial, and verification details never appear
publicly. The renter-facing card is built from a small explicit
allowlist.

UX rhythm: breathing space. The card is calm, structured, and
identical regardless of seller input quality (see §8).

### Renter request flow

Item detail → duration picker → request CTA → request created via
`rentalService.createRequestFromProductId` (canonical product as
truth source) → `RentalIntent` at status `"requested"`.

UX rhythm: short burst (request created, status badge changes) →
breathing space (status timeline waiting on seller).

### Seller approval flow

Pending request row → 승인 / 거절. On approval: status moves through
the rental state machine; a TrustEvent records the approval; the
renter's status timeline updates.

UX rhythm: short burst on the seller side; status update on the
renter side. No celebratory motion — approval is procedural.

### Handoff / return flow

Five-item checklist for both pickup and return. Both seller and
renter confirm; the system records `HandoffRecord`s and emits
TrustEvents.

UX rhythm: structured action. Each checklist item is a small
breathing space; the final confirm is a small burst.

### Claim / admin review flow

After return, a claim window opens. Either party can open a claim
within the window or close it as no-claim. An open claim becomes a
`ClaimReview` for admin work. The admin records a decision; the
parties see the procedural status.

UX rhythm: deliberately calm. Claim UX must never feel like a
dispute escalation; it is record-keeping.

### Trust summary flow

`trustEventService.summarizeUserTrust` aggregates real recorded
events into per-user counts (successful returns, pickup confirmed,
return confirmed, condition check completed). Hidden metrics
(`disputesOpened`, `damageReportsAgainst`) do not surface in the
public storefront's visible-history check.

UX rhythm: breathing space. The summary is shown after the action,
never as a pre-purchase trust badge.

### Guided local demo flow

`LocalDemoGuide` on the seller dashboard shows the 7-step story
and a recommended demo request item owned by the current mock
seller (`getRecommendedDemoProduct`). The flow exists so a tester
can experience the burst/breathing rhythm without a real backend.

## 6. Rhythm Model

CoRent's user journey is intentionally rhythmic. Treat every screen
as either a **burst** or a **breathing space**, not both.

### Burst moments

- chat extraction reveal (seller text → structured summary)
- listing draft generation
- rental request arrival on the seller dashboard
- seller approval / decline action
- trust summary count update after a real event

A burst is short, has a clear "before / after", and uses motion to
*show what changed*.

### Breathing spaces

- draft review and per-field edit
- listing detail page
- rental status timeline
- trust posture explanation
- admin review queue
- public storefront card grid

A breathing space is calm, dense in information, light in motion.
The user reads, decides, and acts at their own pace.

### Why this matters

If every screen is high-intensity, the user can't tell which
moments are real (an approval recorded, a trust event emitted) and
which are decoration. The rhythm model is the executable form of
"motion reveals state, never decorates uncertainty" (§3.7).

## 7. Motion & Typography Interaction System

### Typography is state, not decoration

Status labels, transition copy, and timeline entries use type as
the primary signal. A status change is a typographic change; that
change is the motion.

### Allowed motion patterns

- **Reveal motion** when information is being structured: the chat
  extraction summary appearing line-by-line as the deterministic
  extractor produces fields. Always within a burst moment.
- **Status label transitions**: badge text + line weight changes
  when a `RentalIntent` moves states. No color change required —
  the BW system uses line weight and dashed-vs-solid for the same
  semantic.
- **Timeline transitions**: a new event entry slides in at the top
  of the timeline. Old entries do not animate.
- **Count tick** on trust summary tiles: only when a real
  TrustEvent has been emitted. Never on hover, never on page load.

### Forbidden motion patterns

- Fake "AI thinking" spinners while a deterministic local
  extractor runs. The extractor is synchronous and free; pretending
  it is slow and magical is dishonest.
- Fake payment / settlement motion. There is no PG; there is no
  payout. A "₩ counting up" animation is forbidden until real
  money moves.
- Urgency pressure (countdown timers, "X명이 보고 있어요"). The
  product is a calm trial layer, not a flash sale.
- Guarantee-like motion (shimmering badges, animated checkmarks
  that imply protection). Trust is procedural; motion that
  decorates it lies.
- Hover-driven content reveals on critical action buttons. The
  preview must be inline and visible without hover, because mobile
  has no hover.

### Typography motion rules

- The scramble / type-in effect (where text resolves character by
  character) is permitted only for the chat extraction reveal and
  for the draft creation moment. It is not a generic effect.
- Default typography is static. Motion is the exception, not the
  baseline.
- A surface where the typography is animating must be the
  surface where the user's attention belongs at that moment. If
  the eye should be elsewhere, the type does not move.

## 8. Algorithmic Aesthetic Stability

The premise: **C2C input quality is uneven, and CoRent must look the
same whether the seller wrote two sentences or twenty.**

### Stabilization rules

- **Missing image** → typographic / initials / geometric card. The
  static `ProductCard` and the `PublicListing` projection both use
  the seller-supplied initials, never an "image missing" placeholder
  with broken-image semantics.
- **Poor description** → the structured summary is the visible
  surface. Raw seller input is private and never projected to the
  public listing.
- **Missing fields** → explicit "missing-field prompt" UX in the
  draft editor. The chat extractor lists `missingFields` so the
  seller can fill them in. Missing-data UI uses the design system's
  `--line-dashed` for "pending / inferred / suggested".
- **Uncertain category** → the listing service uses a safe fallback
  (`massage_gun` today). The seller can always re-categorize.
- **Low confidence extraction** → review-required state. The
  listing cannot move to `approved` while required fields are
  missing.

### What this means for design polish

The product must feel premium **before** any individual seller's
input is high quality. If the visual system depends on the seller
writing well, taking good photos, or pricing accurately, it is the
wrong visual system. The current BW Swiss Grid is calibrated for
this — minimal imagery, high typographic contrast, dashed-vs-solid
line semantics — and any future redesign must preserve the
stabilization invariant.

## 9. Interaction Feedback Rules

Every consequential action **previews its consequence inline**, in
plain Korean, before the user commits.

- **Renter request CTA**: "셀러 승인 후 다음 단계로 진행돼요.
  베타에서는 실제 결제가 진행되지 않아요."
- **Seller approval action**: "승인하면 인계 단계로 넘어가요.
  베타에서는 실제 송금이나 정산은 동작하지 않아요." (note: phrasing
  must avoid the forbidden phrases in the copy guardrail).
- **Claim action**: "신고를 열면 운영자가 검토하는 기록이 만들어져요.
  자동 보상이나 송금은 발생하지 않아요."
- **Draft save**: "초안은 로컬에 저장돼요. 자동 게시되지 않고
  공개 전 사람 검수가 필요해요."
- **Admin decision**: "이 결정은 거래 상태 기록을 만들어요.
  송금이나 법적 판단은 포함되지 않아요."

Buttons that lack an inline preview are buttons in the wrong place.
The preview is part of the button's UX, not a tooltip.

## 10. Trust UX Rules

### Sequence over signage

Trust is shown by the **sequence of recorded events**, not by
badges:

```
request → approval → handoff (pickup) → return → claim window
       → admin review (if opened) → trust event
```

Every transition is an event in the persistence layer. The UI
reads from those events. If a state didn't actually happen, no
copy implies it.

### Counting rules

The trust summary counts only **emitted, real events** for the
current user. There is no "starter trust score" that fades in over
time, no "추정 신뢰도" that the system invented.

### Forbidden trust copy

- insurance / 보험
- guaranteed / 보장됨
- automatic compensation / 자동 보상
- escrow / 에스크로 보호
- legal protection / 법적 보호
- "안전거래" (a regulated phrase in Korea)
- any "safe" word that implies a guarantor exists

The full executable list lives in `copyGuardrails.test.ts`; this
section is the policy.

### Claim / admin UX tone

Calm, procedural, serif-of-record. The admin is not a judge; the
admin is a record-keeper. UI copy reflects that.

## 11. Notification UX Posture

> Notifications are part of transaction reliability, not marketing
> decoration. Document the posture now; do not implement.

### First-class notification events (future)

- `rental_requested` → seller (you have a new request)
- `seller_approved` / `seller_declined` → renter (your request was
  answered)
- `pickup_confirmed` / `return_pending` / `return_confirmed` →
  the counterparty
- `claim_window_opened` / `claim_review_decided` → the parties
  involved
- `admin_decision_recorded` → the parties involved

### Suggested future channels

| channel | when |
|---|---|
| in-app | always; the source of truth |
| email | every notification event, opt-out per category |
| web push | when the user has granted permission, mostly seller-side |
| mobile push | post-mobile-app — seller approval inbox first |
| webhook | partner integrations later, never in beta |

### Posture rules

- **No marketing pushes.** Notifications exist for transactions.
- **No urgency manufacturing.** "지금 응답하세요" copy is forbidden.
- **Per-event opt-out.** A user who declines must still receive
  trust-critical events (admin decisions affecting them).
- **Quiet by default.** Mobile push is opt-in, not opt-out.
- **No SMS in beta.** Korean SMS messaging carries regulatory load
  the beta posture cannot meet.

### What not to ship until ready

- analytics-driven re-engagement notifications
- price-drop / "your watched item is back" notifications
- promotional / discount notifications

## 12. Device Strategy

Mobile is **not a shrunk web app**. Each device class is optimized
for the role-and-task most common on it.

### Web (desktop)

- Full seller dashboard, draft editing, admin review, public
  storefront, trust review.
- The reference surface for every flow.
- Visual density is highest here.

### Tablet

- Web-like spacious management and preview. The dashboard, listing
  draft editor, and admin queue should *feel* like the web app on
  tablet, not like a stretched mobile app.
- Touch targets follow mobile sizing; layout follows web.

### Mobile seller

- Task inbox is the first surface: pending requests, handoff
  actions, claim windows.
- Chat-to-listing and quick approval / decline must work
  one-handed.
- Pickup / return / claim management is a structured checklist
  flow, not a free-text editor.
- Long-form draft editing is acceptable to defer to web on mobile;
  the inbox is what matters on the go.

### Mobile renter

- Simplified browse → request → status tracking.
- Pickup / return guidance with the same five-item checklist as
  the seller.
- No admin surfaces, no analytics dashboards.
- Visual density is lowest here.

### Anti-pattern

Squeezing the seller dashboard's full table view onto a 375px
screen. The mobile seller surface is a different product (a task
inbox); it is not the desktop dashboard.

## 13. Local MVP vs External Tester UX

### Local MVP (today)

- Same browser profile, mock-role identities (`getMockSellerSession`,
  `getMockRenterSession`), localStorage persistence.
- Guided demo flow is explicit: `LocalDemoGuide` on the dashboard
  walks the tester through the 7-step story.
- UX must disclose "이 브라우저에만 저장돼요" everywhere local-only
  state is read.
- Reset path: the dashboard's "로컬 데이터 비우기" affordance.

### External tester UX (future, gated)

External testers exercise the system from real devices with real
identities. Pre-conditions for that mode are documented in
`docs/corent_security_gate_note.md` and require:

- real auth (server-resolved session, RLS-enforced writes)
- shared DB persistence (Supabase Phase 2 adapter)
- server write boundaries (the validators in
  `src/server/persistence/supabase/`)
- working notifications for at least the first-class events in §11

External tester UX cannot ship until those four are in place.
There is no "localStorage demo with shared link" middle path —
that would imply cross-device state CoRent does not have.

### Beta disclosure rule

While in local-MVP mode, every surface that *could* read as a
real marketplace must include a brief beta disclosure:
"베타: 실제 결제·정산 없음" or equivalent, in calm small-caption
type. This is the executable form of UX principle §3.8.

## 14. What UX Must Not Imply

Hard list. If a surface implies any of these, the surface is wrong.

- real payment
- deposit hold
- refund
- settlement payout
- escrow
- insurance
- legal adjudication
- automatic compensation
- guaranteed safety
- seller self-publishing (a seller cannot move their listing to
  `approved` without admin review)
- shared cross-device state (local-MVP is single-browser)
- multi-user real-time updates (a renter and a seller in two
  different browsers are not seeing the same state in the local
  MVP)
- trust scoring beyond what real events generated

The copy guardrail test (`copyGuardrails.test.ts`) is the executable
half of this list.

## 15. Implementation Notes / Future Work

The following are intentionally NOT implemented in this revision.
Each is a future track with its own approval gate.

- **Motion tokens / animation spec** — concrete duration / easing
  / stagger tokens for the allowed motion patterns in §7.
- **Chat-to-listing reveal prototype** — the burst-moment animation
  for chat extraction. Today the dashboard card shows the assistant
  summary as a static text block; the reveal is principle, not yet
  motion.
- **Notification event model** — TrustEvent → notification fan-out,
  per-channel envelope shape, opt-out registry. Documented in §11
  as posture only.
- **Mobile seller task inbox** — a dedicated mobile surface for
  pending requests, handoff actions, and claim windows. Today the
  desktop dashboard is the only seller surface.
- **Mobile renter status timeline** — a vertical timeline view
  optimized for one-handed reading. Today the renter status lives
  inside the item detail surface.
- **Tablet dashboard layout** — explicit tablet breakpoint
  optimized for management density without mobile compression.
- **Public storefront final design** — the storefront today is a
  rule-based projection. Final visual is deferred until flows are
  settled (per founder direction in
  [`docs/corent_product_direction_v2.md`](corent_product_direction_v2.md)).
- **DB / auth-backed external tester UX** — gated by the security
  review and Phase 2 backend integration.

When any of the above ships, this document is the source of truth
for *whether the implementation is faithful to the UX system*. The
visual design system stays the source of truth for *how it looks*.

---

## Appendix: Source references

- Founder NotebookLM summary (Maker Mindset / Algorithmic Aesthetic
  Stability / Defamiliarization / Constraint as Opportunity /
  Sensory Synchronization / Mathematical Harmony / Dynamic
  Hierarchy / Intentional User Flow / Emotional Pacing / Narrative
  Path / Scramble / Fluid Responsiveness).
- Founder notes on web / tablet / mobile differentiation,
  notification posture, and storefront-design deferral.
- Founder-supplied YouTube reference links, used as context only —
  no claims here are sourced beyond the NotebookLM summary above.

# CoRent Closed-Alpha Quality Gates

CoRent is an AI-assisted try-before-buy protocol for high-consideration
goods. The alpha should not read like a generic rental marketplace, a
payment product, an insurance product, or an LLM-authoritative system.

## Product Thesis

- Borrowers understand what they can validate before buying.
- Borrowers see what to check before requesting.
- Sellers see what to clarify before a listing feels trustworthy.
- Responsibility is explained as a basis for review, not as a deposit,
  guarantee, insurance, refund, settlement, or confirmed rental.
- LLM output is candidate/advisory only; deterministic server validation
  remains authority.

## Banned Copy Rules

Runtime user-facing copy must not imply active payment, deposit,
insurance, guarantee, refund, settlement, or confirmed rental. Guarded
phrases include `보증`, `보증금`, `보험`, `보장`, `결제 완료`, `결제 진행`,
`결제 처리`, `보증금 청구`, `대여 확정`, `환불`, `정산 완료`,
`guaranteed`, `insured`, `insurance`, and `verified seller`.

Negated beta posture may mention unavailable concepts when needed, but
prefer wording such as `책임 기준`, `참고용`, `아직 연결되어 있지 않아요`,
and `요청 단계`.

## Server / Local Separation

- `/search` must not seed static `PRODUCTS` before the server/local probe
  resolves. On server read failure, it should show a calm error, not demo
  products.
- `/listings/[listingId]` is server-only and renders only approved public
  projection DTOs.
- `/items/[id]` remains the static/local demo detail path.
- `/sell` routes through the probing chat intake card, not the legacy
  local-only `SellerRegistration` form.
- `/dashboard`, `/requests`, and `/admin/cockpit` must keep local/mock and
  server-backed states visibly separate.

## LLM Candidate-Only Rules

- `src/server/llm/**` stays server-only.
- Mock LLM modules must not read env vars, call network APIs, or import
  provider SDKs.
- LLM candidates must strip authority fields such as status, seller,
  borrower, price, payment, settlement, admin, role, capability, and trust.
- Cost estimates must contain counts and labels only, never prompt bodies,
  raw input, messages, or system text.

## DTO / Projection Rules

- Public listing DTOs are allowlist-only.
- Public/renter surfaces must never expose `rawSellerInput`,
  `privateSerialNumber`, extraction internals, listing secrets, admin notes,
  private pickup/contact details, payment internals, settlement internals,
  or trust/claim internals.
- Seller dashboard readiness should use seller-owned safe fields only.
  If it needs more precision later, add booleans/counts before raw text.

## Smoke Checklist Links

- Remote smoke ops: `docs/corent_closed_alpha_smoke_ops_checklist.md`
- Readiness flow template:
  `docs/smoke_runs/2026-05-06_readiness_flow_template.md`
- First remote smoke record:
  `docs/smoke_runs/2026-05-05_corent_dev_first_remote_e2e.md`

## Readiness Feedback Operations Kit

When a tester round produces verbatim feedback, run it through the
operations kit before patching anything:

- Tester-facing form: `docs/smoke_runs/tester_feedback_form_template.md`
- Round report template:
  `docs/smoke_runs/readiness_round_report_template.md`
- Quote → action triage:
  `docs/smoke_runs/readiness_feedback_decision_aid.md`
- Tagging vocabulary:
  `docs/smoke_runs/readiness_feedback_taxonomy.md`
- Pre-approved Korean copy variants:
  `docs/corent_readiness_copy_experiment_backlog.md`
- Category wedge prioritization:
  `docs/corent_category_wedge_research_checklist.md`

The kit is docs-only and does not relax any of the rules in this gate.

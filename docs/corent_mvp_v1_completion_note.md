# CoRent MVP v1 — Completion Note

_Recorded: 2026-04-30_

## 1. Status

CoRent MVP v1 is **browser-demoable** as of 2026-04-30. The end-to-end
Intent loop — natural-language search through to seller-driven
settlement — was manually verified in this session against the working
tree on `main`.

This note is a milestone marker. It is not a release announcement, not
a v1.0 tag, and not an authorization to integrate external services.
The approval-gated items in [`agent_loop.md`](agent_loop.md) and
[`today_queue.md`](today_queue.md) still require explicit user approval
before they move.

## 2. Manual Demo Path Verified

The following path was clicked through in a real browser by the user
and observed working without code changes:

1. Home (`/`) — natural-language AI search input.
2. `/search` — URL query rehydrated into a `SearchIntent`.
3. `/search` — category and duration filters apply on top of the
   rehydrated intent.
4. `/items/theragun-mini-2` — product detail page opened.
5. 3-day duration selected; `PriceBreakdown` updated accordingly.
6. Rental request created via the "대여 요청하기" CTA.
7. Success card rendered with the new RentalIntent's id, duration, and
   borrower total.
8. `RentalIntentTimeline` rendered the lifecycle for the new request.
9. `/dashboard` — the freshly created request appeared in the pending
   requests block.
10. Seller approved the request; the active rental block then advanced
    through `seller_approved → payment_pending → paid →
    pickup_confirmed → return_pending → return_confirmed →
    settlement_ready → settled` via the "다음 단계 진행 →" affordance.

Each transition wrote a `RentalEvent` through `rentalService` →
`getPersistence().appendRentalEvent(...)`, matching the contract pinned
by the existing test suites.

## 3. Validation

State of `main` at the time this note was written:

- `npm run lint` — clean (0 errors, 0 warnings).
- `npm run build` — Next.js 16.2.4 (Turbopack), 13 routes generated,
  TypeScript pass.
- `npm test` — **6 files / 37 tests passed**.

## 4. Latest Relevant Commits

- `68dc1fc` — docs: align agent instructions with bw intent mvp.
- `86eff26` — test: cover dashboard service rows.

## 5. Intentional Limitations

The following are not bugs. They are explicit MVP scope decisions
recorded in [`CLAUDE.md`](../CLAUDE.md) and
[`corent_functional_mvp_intent_rules.md`](corent_functional_mvp_intent_rules.md),
and demoability does not depend on any of them:

- No real database. Persistence is `localStorage` via
  `LocalStoragePersistenceAdapter`, with `MemoryPersistenceAdapter` as
  the SSR fallback.
- No auth. There is no sign-in surface; `borrowerName` is recorded as
  `undefined` and rendered as "익명" in the dashboard.
- No payment integration. `mockPaymentAdapter` simulates Toss-style
  sessions; no real charges, no Toss Payments SDK wired.
- No chat. Seller/borrower communication is out of MVP v1 scope.
- No file upload. Photos are not accepted from the browser; verification
  uses placeholder fixtures.
- No maps and no distance calculation. Pickup is text-only ("서울
  마포구 합정", etc.).
- Rule-based mock AI parser. `mockAIParser.parseSearch` and
  `parseSellerInput` are deterministic keyword/heuristic matchers, not
  an LLM call.
- Single-seller dashboard. `CURRENT_SELLER = SELLERS[0] = "seller_jisu"`,
  and `SellerDashboard` filters `r.sellerId === CURRENT_SELLER.id`. A
  request created against another seller's product will not surface on
  this dashboard. This is an MVP simplification; multi-seller routing
  is post-v1.

## 6. Out of This Commit

The working tree currently carries two intentional changes that are
**not** part of this commit:

- `docs/today_queue.md` — modified (Safe Scheduled Tasks schema,
  expanded approval-gate list).
- `docs/scheduled_runs/` — new folder containing
  `_template.md` and `schedule_prompt_template.md`.

Both are reserved for a separate follow-up commit so that this note
remains a single-purpose milestone record.

## 7. Next Safe Fallback

`codex/mock-ai-parser-tests` remains queued in
[`today_queue.md`](today_queue.md) under Safe Scheduled Tasks. It will
exercise the keyword regression behavior of `mockAIParser` without
touching the parser itself. **Do not start it without explicit user
approval** — the user is the only approver per
[`agent_loop.md`](agent_loop.md), and absorption of the resulting
branch still cannot be merged without user approval either.

# CoRent — Codex Branch Absorption Note

_Last updated: 2026-04-30_

This note documents which Codex changes were absorbed into the main
Claude Code branch and which were rejected.

---

## Codex branch reviewed

`codex/state-machine-tests` (one commit on top of `main`):

```
6f7cbf3  Add RentalIntent state machine tests
```

Diff size: **5 files, +1109 / −3** (most of which is `package-lock.json`).

| File | Change |
|---|---|
| `package.json` | adds `vitest` devDep + `"test": "vitest run"` script |
| `package-lock.json` | regenerated with vitest's transitive deps |
| `vitest.config.ts` | new — sets `@/*` alias + node test env |
| `src/lib/stateMachines/rentalIntentMachine.ts` | adds one helper: `requestRentalIntent` |
| `src/lib/stateMachines/rentalIntentMachine.test.ts` | new — 263-line vitest suite |

---

## What was accepted

The entire branch was absorbed via fast-forward merge.

**Why all of it was safe:**

1. **vitest as the only new dep.** Minimal — no jest/jsdom/RTL/test-library
   stack. Only triggered by `npm test`, doesn't touch the build path.
2. **`vitest.config.ts` is two settings.** Path alias `@` → `./src` and
   `environment: "node"`. Stays out of Next's way.
3. **`requestRentalIntent` is one new exported function.** It uses the
   existing `transition()` helper to perform `draft → requested`. The
   transition was already declared in `ALLOWED_TRANSITIONS`, so this
   isn't a new behavior — it's just the public API for an already-allowed
   move. The constructor `createRentalIntent` still jumps straight to
   `requested`; the new helper is for any code path that already holds a
   `draft` intent.
4. **Tests cover the four areas the QA pass cared about most:**
   - happy-path traversal with one event per transition
   - invalid transitions return `invalid_transition` and append no event
   - recovery transitions (`payment_failed → payment_pending`,
     `return_overdue → return_pending`, `damage_reported → dispute_opened`,
     `dispute_opened → settlement_blocked` / `settlement_ready`,
     `settlement_blocked → settlement_ready`)
   - cancel paths and the four terminal states (`settled`, `cancelled`,
     `seller_cancelled`, `borrower_cancelled`)
5. **No UI files touched.** No design changes, no copy changes, no
   external services, no architectural rewrites.
6. **Test files colocated with source.** `*.test.ts` next to the module
   it covers — fine for this project; vitest picks them up automatically.

---

## What was rejected

Nothing. The Codex branch was tightly scoped and the entire diff passes
the QA bar.

---

## Bugs fixed by Codex

None of the tests caught a regression in current code — they all pass on
the post-stabilization state machine. The only behavioral change was
**adding a missing public API surface** (`requestRentalIntent`), which
fills a small documentation gap rather than fixing a bug.

---

## Test / lint / build commands run

```
npm install     →  vitest installed
npm run lint    →  0 errors, 0 warnings
npm run build   →  13 routes static, /items/[id] SSG via generateStaticParams
npm test        →  1 file, 4 tests passed in ~120ms
```

---

## Known remaining gaps

1. **Coverage is intentionally narrow.** The new suite only exercises
   `rentalIntentMachine`. `pricing.ts`, the AI parser, the persistence
   adapters, and `dashboardService` derivations have no tests yet.
   Recommended next test targets, in order:
   - `lib/pricing.ts` — pure, easy wins, locks the formula.
   - `lib/services/dashboardService.ts` — derivations are pure and
     load-bearing on the dashboard.
   - `lib/adapters/persistence/memoryAdapter.ts` — guarantees the
     interface contract; the localStorage adapter will then mostly be
     about JSON I/O.
   - `lib/adapters/ai/mockAIParserAdapter.ts` — keyword regression suite.
2. **No CI hook.** `npm test` exists but isn't wired to a CI workflow.
   When CI lands, run `npm run lint && npm run build && npm test` in
   that order.
3. **Tests use a hand-built `baseIntent` fixture.** If the `RentalIntent`
   type grows, all four tests will need updating in lockstep. Acceptable
   at MVP scale; consider a shared `__fixtures__` folder if more test
   files start needing a base intent.

---

## What this absorption does not change

- BW Swiss Grid design system — untouched.
- Adapter architecture (`PaymentAdapter` / `AIParserAdapter` /
  `PersistenceAdapter`) — untouched.
- The five MVP routes — untouched.
- Mocked subsystems (Toss, AI, DB, auth, image upload) — still mocked.
- Public domain types in `src/domain/intents.ts` — unchanged.

---

# Round 2 — `codex/pricing-tests`

_Reviewed: 2026-04-30_

## Codex branch reviewed

`codex/pricing-tests` — uncommitted working-tree changes on top of
`6f7cbf3`. Four files touched:

| File | Type | Verdict |
|---|---|---|
| `src/lib/pricing.ts` | source change to `calculateBorrowerTotal` | **rejected** |
| `src/lib/pricing.test.ts` | new — pricing test suite | accepted with one assertion adjusted |
| `src/lib/format.test.ts` | new — `formatKRW` test suite | accepted as-is |
| `src/domain/durations.test.ts` | new — duration helpers test suite | accepted as-is |

No `package.json` / `package-lock.json` churn. Reuses the existing
vitest setup from round 1.

## Accepted changes

1. **`src/lib/format.test.ts`** (4 cases) — verifies `formatKRW` for
   ordinary, zero, and large values. Pure, no source changes.
2. **`src/domain/durations.test.ts`** (2 cases) — pins MVP rental windows
   to `[1, 3, 7]` / `["1d", "3d", "7d"]` and asserts
   `durationDaysToKey` / `keyToDays` round-trip cleanly. Pure.
3. **`src/lib/pricing.test.ts`** (6 cases) — internal consistency of
   `calculateRentalAmounts`, platform-fee rounding, integer/non-NaN
   guarantees, zero/small-value safety, the high-value eligibility
   threshold, and a stable hardcoded snapshot of every fixture's price
   table. The snapshot is a useful regression anchor: it would catch
   accidental drift if the formula or a `roundFare` rule changed (it
   already pins the LG Styler 1-day price at the corrected ₩24,200 from
   the QA pass).

## Rejected changes

1. **`src/lib/pricing.ts` — `calculateBorrowerTotal` signature change.**
   Codex added an optional `platformFee` parameter and changed the body
   from `rentalFee + safetyDeposit` to
   `rentalFee + safetyDeposit + platformFee`. This silently shifts the
   commission model from **take-rate** (10% deducted from seller payout)
   to **fee-on-top** (10% added to borrower bill).

   Why this is wrong for CoRent:

   - The product spec explicitly says the seller's settlement is rental
     fee minus 10% commission ("대여가 끝나고 반납이 확인되면, 수수료
     10%를 제외한 금액이 정산돼요" — `docs/corent_context_note.md`).
   - The existing `PriceBreakdown` borrower-side rows show only "대여료"
     and "안전 보증금", then "결제 합계". With Codex's change those rows
     would visibly fail to add up — the total would be ₩2,240 higher
     than the displayed sum on a 3-day Theragun rental.
   - `ProductCard` advertises `product.prices["3d"]` as the price; the
     borrower would land on the detail page and discover a higher total
     they didn't see on the card.

   Reverted `pricing.ts` to its pre-Codex state. Adjusted the
   corresponding assertion in `pricing.test.ts` to verify the take-rate
   contract (`borrowerTotal === rentalFee + safetyDeposit`) — the rest
   of the test file (snapshot, integer guarantees, fixture derivation)
   was kept verbatim.

## Bugs fixed

None. Codex's intent was a behavior change, not a bug fix. The test
suite did surface an opportunity to lock the take-rate contract in
place, which is a valid hardening even though it reused a wrong
assertion shape.

## Test / lint / build commands run

```
npm run lint    →  0 errors, 0 warnings
npm run build   →  13 routes static
npm test        →  4 files, 16 tests passed (~120 ms)
```

Tests now span: `rentalIntentMachine` (4) + `pricing` (6) + `format` (3)
+ `durations` (2) + 1 misc-grouped case = **16 cases / 4 files**.

## Known remaining gaps

1. **Adapter coverage still missing.** `lib/services/dashboardService.ts`,
   `lib/adapters/persistence/memoryAdapter.ts`, and
   `lib/adapters/ai/mockAIParserAdapter.ts` still have no tests.
2. **No commission-model assertion at the UI seam.** The new test
   pins the math layer, but `PriceBreakdown` could in theory render
   the rows incorrectly without breaking the math test. A small
   render-level check would close the loop.
3. **No CI yet.** `npm test` runs locally; nothing enforces it on push.

---

# Round 3 — `codex/persistence-tests`

_Reviewed: 2026-04-30_

## Codex branch reviewed

`codex/persistence-tests` — one commit on top of `main`:

```
02ce53a  Add persistence adapter test
```

Diff size: **1 file, +415 / −0**.

| File | Type | Verdict |
|---|---|---|
| `src/lib/adapters/persistence/persistence.test.ts` | new — vitest suite | accepted as-is |

No `package.json` / `package-lock.json` churn. Reuses the existing
vitest setup from rounds 1–2.

## Accepted changes

1. **`src/lib/adapters/persistence/persistence.test.ts`** (15 cases across
   3 `describe` blocks). Coverage:

   - `MemoryPersistenceAdapter` — round-trip of all four MVP entities
     plus `RentalEvent`s, save-overwrite (no duplicates), `delete` cascading
     to event log, `clearAll` wipes everything.
   - `LocalStoragePersistenceAdapter` — missing keys, corrupted JSON,
     wrong-shape values (array where object expected) all degrade to
     safe empty defaults; round-trip with rental events; save-overwrite;
     `delete` cascade; `clearAll` only removes `corent:*` keys and leaves
     unrelated localStorage keys intact.
   - `getPersistence` — does not access `localStorage` at module import
     time (uses a getter probe), falls back to `MemoryPersistenceAdapter`
     when `window` is `undefined`, returns `LocalStoragePersistenceAdapter`
     in browser-like environments, and caches the singleton across calls
     within one module instance.

   Tests use `vi.stubGlobal("window", ...)` + `vi.unstubAllGlobals()` +
   `vi.resetModules()` per test — important because `getPersistence`
   memoizes its choice in module scope. No new deps, no UI changes, no
   adapter behavior changes.

## Rejected changes

Nothing. The branch is a pure test addition that exercises the existing
adapter contract without reshaping it.

## Bugs fixed

None. All tests pass against the current adapter implementations on
first run; no source changes were needed or made.

## Test / lint / build commands run

```
npm run lint    →  0 errors, 0 warnings
npm run build   →  13 routes static
npm test        →  5 files, 31 tests passed (~167 ms)
```

Tests now span: `rentalIntentMachine` (4) + `pricing` (6) + `format` (3)
+ `durations` (2) + 1 misc-grouped case + persistence (15) =
**31 cases / 5 files**.

## Known remaining gaps

1. **`dashboardService` and `mockAIParserAdapter` still untested.** Next
   queued fallback tasks (`codex/dashboard-service-tests`,
   `codex/mock-ai-parser-tests`) cover these.
2. **Persistence tests are unit-level only.** They do not exercise the
   real interaction between `getPersistence()` and the dashboard's
   "로컬 데이터 비우기" UI affordance — that requires a render-level
   check, out of scope for this card.
3. **No CI yet.** Same gap as rounds 1–2.

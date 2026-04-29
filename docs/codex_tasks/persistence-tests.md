# Codex Task Card — Persistence Tests

## Branch

codex/persistence-tests

## Context

Claude Code owns the main CoRent MVP branch. Codex works only on isolated `codex/*` validation branches.

Claude has already absorbed:
- `codex/state-machine-tests`
- `codex/pricing-tests`

Vitest is already installed and configured. Use the existing test setup.

This task is for persistence adapter tests only.

## Goal

Add focused tests for CoRent persistence adapter behavior, especially SSR safety, memory fallback, localStorage corruption handling, `clearAll()`, and RentalIntent event-log preservation.

## Scope

Inspect:
- `src/lib/adapters/persistence/types.ts`
- `src/lib/adapters/persistence/localStorageAdapter.ts`
- `src/lib/adapters/persistence/memoryAdapter.ts`
- `src/lib/adapters/persistence/index.ts` or the file that exports `getPersistence()`
- `src/lib/services/dashboardService.ts` only if needed to understand seed/clear behavior
- `src/domain/intents.ts` only if needed for RentalIntent fixture shape

Allowed to modify:
- New or existing persistence test files
- Minimal source fix only if a test exposes a clear correctness bug
- `docs/corent_codex_absorption_note.md` only if explicitly useful for notes

Do not modify:
- Product UI
- Visual styling
- BW Swiss Grid design system
- Pricing logic
- State machine behavior
- Domain model shape unless a clear bug makes it unavoidable
- External service integrations
- Package dependencies unless absolutely necessary

## Required Coverage

### 1. Memory adapter

Test that the memory persistence adapter:

- Can save and read the MVP entities supported by the interface.
- Preserves `RentalIntent.events` when an intent is saved and read back.
- Updates an existing saved entity without duplicating it.
- Deletes or clears data according to the adapter contract.
- `clearAll()` removes all CoRent MVP data managed by the adapter.

### 2. LocalStorage adapter

Test that the localStorage persistence adapter:

- Does not crash when stored data is missing.
- Does not crash on corrupted JSON.
- Returns safe empty values when stored data has the wrong shape.
- Preserves `RentalIntent.events` when an intent is saved and read back.
- Updates existing saved entities without duplicating them.
- `clearAll()` removes all CoRent MVP keys owned by the adapter.
- Does not remove unrelated localStorage keys.

### 3. SSR / non-browser safety

Test that persistence code:

- Does not crash when `window` is unavailable.
- Falls back safely to memory persistence in SSR/test-like environments if that is the intended contract.
- Does not access `localStorage` at module import time in a way that breaks static build or server rendering.

### 4. getPersistence behavior

If `getPersistence()` exists, test that it:

- Returns a usable adapter.
- Uses localStorage in browser-like environments if supported by the current implementation.
- Falls back safely in SSR-like environments.
- Does not create inconsistent adapter state across repeated calls unless that is intentional and documented.

### 5. Seed / clear behavior

Only if the relevant service functions already exist and can be tested without UI:

- Seeding mock data should not duplicate records endlessly.
- Clearing local data should remove all CoRent MVP persistence keys.
- Rehydrated RentalIntents should preserve their lifecycle event logs.

## Rules

- Use the existing Vitest setup.
- Do not add or change test framework dependencies.
- Use `vi.stubGlobal`, a small in-test localStorage mock, or Vitest-supported environment techniques as needed.
- Keep tests focused on behavior, not implementation details.
- Do not add snapshots.
- Do not add broad UI tests.
- Do not change UI or visual design.
- Do not add Toss, Supabase, OpenAI, auth, image upload, or any external service.
- Do not perform broad refactors.
- Do not auto-merge.
- Keep source changes minimal.
- If the current adapter interface makes one of the requested cases impossible to test, document that clearly in the final response instead of redesigning the interface.

## Validation

Run:

```bash
npm run lint
npm run build
npm test

## Final Response

- Summary
- Test files added
- Bugs found/fixed
- Source files changed, if any
- Commands run and results
- Any coverage intentionally skipped and why
- Recommended follow-up
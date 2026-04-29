# Codex Task Card — <task-name>

## Branch

codex/<area>-<task>

## Context

<Why this task exists. Link the relevant area of the codebase and the prior conversation if any.>

## Goal

<One-sentence outcome. Narrow. Testable.>

## Scope

<Concrete, bounded list of what this task covers. Anything outside is out of scope.>

## Files to Inspect

- <relative/path/to/file.ts>

## Files Allowed to Modify

- <relative/path/to/test_or_doc>

## Files or Areas Not Allowed to Modify

- src/ product code (unless task explicitly says so)
- app UI / visual design
- BW Swiss Grid design system tokens
- package.json / dependency list
- external integrations (Toss, Supabase, OpenAI, auth, image upload)

## Required Coverage

<List the cases, branches, or contracts that the new tests/spike must cover.>

## Rules

- Use existing test setup.
- Do not add dependencies unless absolutely necessary.
- Do not change UI or visual design.
- Do not add external services.
- Do not perform broad refactors.
- Do not auto-merge.
- Keep changes minimal.

## Validation

- npm run lint
- npm run build
- npm test

## Final Response Format

- Summary
- Files added or modified
- Coverage delta
- Commands run and results
- Anything skipped, with reason
- Suggested next narrow task (no implementation)

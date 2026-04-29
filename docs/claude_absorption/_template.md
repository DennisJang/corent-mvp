# Claude Absorption Card — <task-name>

## Source Branch

codex/<area>-<task>

## Goal

<One-sentence outcome of the absorption. What does main look like after this is done?>

## Accept Criteria

- focused tests
- minimal test setup
- small obvious correctness fixes
- type or contract coverage improvements

## Reject Criteria

- visual changes
- broad refactors
- architecture rewrites
- duplicate abstractions
- external services
- package bloat
- snapshots
- unrelated formatting churn
- product copy changes unrelated to the task

## Hard Constraints

- Claude works on main.
- Codex branches are never blindly merged.
- User is final approver.
- Do not approve or merge without user approval.

## Review Checklist

- [ ] Diff is scoped to the declared area.
- [ ] No changes to src/ product code outside the declared scope.
- [ ] No changes to app UI or BW Swiss Grid tokens.
- [ ] No new dependencies and no package.json changes.
- [ ] No external services added or wired (Toss, Supabase, OpenAI, auth, image upload).
- [ ] No pricing policy, domain model, or visual system changes.
- [ ] Tests are deterministic and use the existing setup.
- [ ] Names and structure match existing conventions.

## Validation

- npm run lint
- npm run build
- npm test

## Documentation Update

- Append a short entry to `docs/corent_codex_absorption_note.md` describing what was absorbed and what was rejected.

## Final Response Format

- Summary
- Files absorbed
- Files rejected, with reason
- Commands run and results
- Open questions for the user
- Recommended next safe fallback task

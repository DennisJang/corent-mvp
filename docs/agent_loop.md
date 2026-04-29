# Agent Loop

This document describes the standard Claude ↔ Codex validation loop for the CoRent MVP.

It is workflow guidance only. It does not change product behavior, UI, design tokens, domain models, pricing, or external integrations.

## Roles

- **Claude Code** — main branch owner / implementation agent. Always works on `main`. Reviews and absorbs Codex output.
- **Codex** — validation branch worker. Always works on `codex/<area>-<task>` branches. Performs one narrow validation, test, or spike task at a time.
- **ChatGPT** — planning, prompt shaping, and result interpretation. Helps the user decide task scope and priority before Claude executes.
- **User** — final approver. The only role that can approve merges, external integrations, or policy/design changes.

## Branch Rules

- Claude works on `main`.
- Codex works on `codex/<area>-<task>` (e.g. `codex/pricing-tests`, `codex/persistence-tests`).
- Codex branches are never blindly merged.
- Long-lived feature branches outside this scheme are not part of the loop.

## Standard Loop

1. `main` is clean (no uncommitted changes).
2. Create a `codex/<area>-<task>` branch from `main`.
3. Codex performs **one** narrow validation, test, or spike task.
4. Run `npm run lint`, `npm run build`, `npm test` on the Codex branch.
5. Commit the Codex branch.
6. Claude reviews the Codex diff against `main`.
7. Claude absorbs **only safe, useful changes** into `main`.
8. Run `npm run lint`, `npm run build`, `npm test` again on `main` after absorption.
9. User gives final approval before any merge or follow-up that touches an approval gate.

## Approval Gates

The user is the only approver for:

- merge of any branch into `main`
- PR approval
- external integrations (Toss, Supabase, OpenAI, auth, image upload, etc.)
- pricing policy changes
- domain model changes
- visual system changes (BW Swiss Grid, palette, typography, spacing tokens)
- UX direction changes

## No-Response Fallback Rule

If user approval is required and the user does not respond within **20 minutes**:

- Do **not** approve, merge, or continue the approval-gated item.
- Mark the item as `pending_user_approval` in `docs/today_queue.md`.
- Move only to the next **safe fallback task** from `docs/today_queue.md`.

## Safe Fallback Task Examples

- pure function tests
- adapter contract tests
- documentation cleanup
- branch verification
- isolated spike branches

These can run on `codex/*` branches without user approval, but they still cannot be merged without user approval.

## Forbidden Autonomous Actions

Neither Claude nor Codex may:

- auto-merge any branch
- enable or call external services
- deploy to production
- change pricing policy
- change the design system
- perform broad refactors

Any of these require explicit user approval.

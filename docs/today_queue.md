# Today Queue

Date:

## Approval Required

- [ ] Commit accepted codex/pricing-tests absorption changes
  - status: approved_by_user
  - can proceed without user: no

## Main Claude Tasks

- [ ] Set up agent-loop workflow docs and scripts
  - status: ready
  - branch: main

## Safe Codex Fallback Tasks

- [ ] codex/persistence-tests
  - status: queued
  - can proceed without user: yes
  - can merge without user: no

- [ ] codex/dashboard-service-tests
  - status: queued
  - can proceed without user: yes
  - can merge without user: no

- [ ] codex/mock-ai-parser-tests
  - status: queued
  - can proceed without user: yes
  - can merge without user: no

## Blocked Until User Approval

- Supabase integration
- Toss Payments integration
- OpenAI adapter
- auth
- image upload
- pricing policy changes
- domain model changes
- visual system changes
- production deploy
- main merge
- PR approval

## Safe Scheduled Tasks

- [ ] codex/dashboard-service-tests
  - status: ready
  - can_schedule_run: yes
  - can_merge_without_user: no
  - task_card: docs/codex_tasks/dashboard-service-tests.md
  - expected_branch: codex/dashboard-service-tests
  - max_scope: tests_only

- [ ] codex/mock-ai-parser-tests
  - status: queued
  - can_schedule_run: yes
  - can_merge_without_user: no
  - task_card: docs/codex_tasks/mock-ai-parser-tests.md
  - expected_branch: codex/mock-ai-parser-tests
  - max_scope: tests_only
## Done Today

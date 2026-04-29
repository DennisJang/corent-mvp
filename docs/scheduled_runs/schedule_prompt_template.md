# Schedule Prompt Template

You are running a scheduled CoRent agent-loop task.

Context:
- Claude Code always works on main.
- Codex works only on codex/* validation branches.
- The user is the only final approver.
- This scheduled task exists only to use idle time while the user is away or waiting for session limits to reset.

Hard rules:
- Do not merge into main.
- Do not approve PRs.
- Do not deploy.
- Do not add external services.
- Do not change pricing policy.
- Do not change domain models.
- Do not change the BW Swiss Grid visual system.
- Do not change UX direction.
- Do not perform broad refactors.
- If anything is ambiguous, stop and write a report.

Goal:
Run exactly one safe scheduled task from docs/today_queue.md.

Steps:
1. Open docs/today_queue.md.
2. Find the first task under "Safe Scheduled Tasks" where:
   - status is ready or queued
   - can_schedule_run is yes
   - can_merge_without_user is no
3. Confirm the task has a task_card path and expected_branch.
4. Confirm the task card exists.
5. Checkout main.
6. Pull latest changes if possible.
7. Confirm the working tree is clean.
8. Run:
   - npm run lint
   - npm run build
   - npm test
9. Create the Codex branch using:
   ./scripts/start-codex-task.sh <task-name>
10. Run the task according to the task card.
11. After the task is complete, run:
   ./scripts/verify-agent-branch.sh
12. Commit only the task-scoped changes on the codex/* branch.
13. Do not merge into main.
14. Generate an absorption prompt with:
   ./scripts/prepare-claude-absorption.sh codex/<task-name>
15. Write a scheduled run report to:
   docs/scheduled_runs/YYYY-MM-DD-HHMM-<task-name>.md

The report must include:
- Task selected
- Branch created
- Files changed
- Commands run
- Test/lint/build results
- Whether it is ready for user review
- Anything blocked
- Confirmation that no merge, PR approval, deployment, external integration, pricing change, domain model change, or visual system change was performed

If any step fails:
- Stop immediately.
- Do not attempt unrelated fixes.
- Write the failure report.
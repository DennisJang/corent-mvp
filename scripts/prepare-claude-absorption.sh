#!/usr/bin/env bash
# Usage: ./scripts/prepare-claude-absorption.sh <codex-branch>
# Example: ./scripts/prepare-claude-absorption.sh codex/persistence-tests
#
# Prints repo state and a ready-to-copy Claude absorption prompt for the given
# Codex branch. Does NOT merge, push, or modify any files.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <codex-branch>" >&2
  echo "Example: $0 codex/persistence-tests" >&2
  exit 1
fi

CODEX_BRANCH="$1"
BASE_BRANCH="main"

if ! git show-ref --verify --quiet "refs/heads/${CODEX_BRANCH}"; then
  echo "Error: branch ${CODEX_BRANCH} does not exist locally." >&2
  exit 1
fi

echo "==> Current git status"
git status

echo
echo "==> Diff stat: ${BASE_BRANCH}...${CODEX_BRANCH}"
git diff --stat "${BASE_BRANCH}...${CODEX_BRANCH}"

echo
echo "==> Recent git log on ${CODEX_BRANCH} (last 10)"
git log --oneline -n 10 "${CODEX_BRANCH}"

cat <<EOF

==================================================================
Claude absorption prompt (copy below this line)
==================================================================

Review the Codex branch ${CODEX_BRANCH} against ${BASE_BRANCH}.

Goals:
- Review the Codex branch diff.
- Absorb only safe, useful changes into ${BASE_BRANCH}.
- Do not blindly merge the Codex branch.

Hard constraints:
- Preserve the BW Swiss Grid design system.
- Do not add external services (Toss, Supabase, OpenAI, auth, image upload).
- Do not change pricing policy, domain models, or the visual system without explicit user approval.
- Do not add dependencies.
- Do not modify package.json.
- Do not touch src/ product code outside the declared task scope.
- Do not touch app UI.
- Do not auto-merge anything.
- Claude and Codex cannot approve on the user's behalf — the user is the final approver.

Validation after absorption:
- npm run lint
- npm run build
- npm test

Documentation:
- Append a short entry to docs/corent_codex_absorption_note.md describing what was absorbed, what was rejected, and why.

Final response format:
- Summary
- Files absorbed
- Files rejected, with reason
- Commands run and results
- Items still pending user approval
- Recommended next safe fallback task
EOF

#!/usr/bin/env bash
# Usage: ./scripts/start-codex-task.sh <task-name>
# Example: ./scripts/start-codex-task.sh persistence-tests
#
# Prepares a clean codex/<task> branch from main and prints the next instruction.
# Does NOT auto-run Codex.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <task-name>" >&2
  echo "Example: $0 persistence-tests" >&2
  exit 1
fi

TASK="$1"
BRANCH="codex/${TASK}"

# Require clean git state.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  git status --short >&2
  exit 1
fi

# Move to main.
echo "==> Checking out main"
git checkout main

# Validate main before branching.
echo "==> npm run lint"
npm run lint

echo "==> npm run build"
npm run build

if node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.test ? 0 : 1)"; then
  echo "==> npm test"
  npm test
else
  echo "==> No test script in package.json, skipping npm test"
fi

# Refuse to clobber an existing branch.
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "Error: branch ${BRANCH} already exists." >&2
  exit 1
fi

echo "==> Creating branch ${BRANCH}"
git checkout -b "${BRANCH}"

CARD_PATH="docs/codex_tasks/${TASK}.md"

cat <<EOF

Branch ${BRANCH} is ready.

Next step (run manually, do not auto-run):

  codex

Suggested task card path:

  ${CARD_PATH}

If the card does not exist, copy docs/codex_tasks/_template.md to ${CARD_PATH} and fill it in before starting Codex.
EOF

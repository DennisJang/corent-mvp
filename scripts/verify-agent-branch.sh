#!/usr/bin/env bash
# Verifies the current agent branch by printing state and running lint/build/test.

set -euo pipefail

echo "==> Current branch"
git rev-parse --abbrev-ref HEAD

echo
echo "==> git status --short"
git status --short

echo
echo "==> git diff --stat"
git diff --stat

echo
echo "==> npm run lint"
npm run lint

echo
echo "==> npm run build"
npm run build

if node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.test ? 0 : 1)"; then
  echo
  echo "==> npm test"
  npm test
else
  echo
  echo "==> No test script in package.json, skipping npm test"
fi

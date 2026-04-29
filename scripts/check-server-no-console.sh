#!/usr/bin/env bash
# Phase 1 security gate: no direct console.* calls in src/server/**.
# The redacting logger at src/server/logging/logger.ts is the only allowed
# log path. Required by docs/corent_security_review_phase1_2026-04-30.md
# §3.12 ("Logging Redaction").
#
# Exit code:
#   0 — clean
#   1 — at least one disallowed call found

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT_DIR/src/server"

if [[ ! -d "$TARGET" ]]; then
  echo "scripts/check-server-no-console.sh: $TARGET not found; nothing to check"
  exit 0
fi

PATTERN='console\.(log|info|warn|error|debug|trace)\s*\('

# Allowlist: the logger module itself is permitted to emit (and even there
# it uses process.stdout.write rather than console.*).
if grep -RnE "$PATTERN" \
    --include='*.ts' --include='*.tsx' \
    "$TARGET" \
    | grep -v '/logging/logger.ts' \
    > /tmp/corent_server_console_hits.txt; then
  echo "FAIL: console.* calls found in src/server/**:"
  cat /tmp/corent_server_console_hits.txt
  exit 1
fi

echo "OK: no disallowed console.* calls under src/server/**"

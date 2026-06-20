#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec bash "${CLAW_EVAL_REPO_ROOT}/scripts/run_baseline.sh" \
  --scope t-general \
  --session-mode isolated \
  "$@"

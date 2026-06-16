#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_SUITE="${CLAW_EVAL_SUITE:-T014_meeting_notes,T018_ticket_triage,T024_crm_data_export}"

exec bash "${CLAW_EVAL_REPO_ROOT}/scripts/run_baseline.sh" \
  --scope suite \
  --suite "${DEFAULT_SUITE}" \
  --session-mode isolated \
  "$@"

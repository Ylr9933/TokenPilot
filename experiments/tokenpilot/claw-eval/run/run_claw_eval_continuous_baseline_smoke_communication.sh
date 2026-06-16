#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_SUITE="${CLAW_EVAL_SUITE:-T001zh_email_triage,T002_email_triage,T005zh_email_reply_draft,T006_email_reply_draft,T009zh_contact_lookup,T010_contact_lookup,T025zh_ambiguous_contact_email,T026_ambiguous_contact_email}"

exec bash "${CLAW_EVAL_REPO_ROOT}/scripts/run_baseline.sh" \
  --scope suite \
  --suite "${DEFAULT_SUITE}" \
  --session-mode continuous \
  "$@"

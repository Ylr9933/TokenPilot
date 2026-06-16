#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

TAIL_TASKS="${TAIL_TASKS:-task_gh_issue_triage,task_gws_email_triage,task_gws_cross_service,task_gws_task_management}"
TRANSCRIPT_MEMO_MIN_CALLS="${TRANSCRIPT_MEMO_MIN_CALLS:-4}"

cd "${REPO_ROOT}"

PINCHBENCH_ISOLATED_ABLATION_VARIANTS=with_reduction_pass \
PINCHBENCH_METHOD_MODEL=tokenpilot/gpt-5.4-mini \
PINCHBENCH_METHOD_JUDGE=gpt-5.4-mini \
PINCHBENCH_METHOD_SUITE="${TAIL_TASKS}" \
TOKENPILOT_TRANSCRIPT_MEMO_MIN_CALLS="${TRANSCRIPT_MEMO_MIN_CALLS}" \
TOKENPILOT_RUNS=1 \
TOKENPILOT_PARALLEL=1 \
TOKENPILOT_TIMEOUT_MULTIPLIER=1.0 \
./experiments/tokenpilot/pinchbench/scripts/run_method_isolated_reduction_ablation.sh

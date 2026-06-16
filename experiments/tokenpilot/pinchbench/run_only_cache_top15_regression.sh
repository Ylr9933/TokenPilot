#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUN_SCRIPT="${REPO_ROOT}/experiments/tokenpilot/pinchbench/scripts/run_method_isolated_reduction_ablation.sh"
ENV_FILE="${REPO_ROOT}/experiments/tokenpilot/pinchbench/.env"

DEFAULT_SUITE='task_contract_analysis,task_it_procurement,task_spreadsheet_summary,task_csv_stock_trend,task_deep_research,task_meeting_blog_post,task_meeting_council_upcoming,task_meeting_gov_speaker_summary,task_second_brain,task_selector_fix,task_blog,task_image_gen,task_csv_stations_filter,task_competitive_research,task_cve_security_triage'

METHOD_MODEL="${METHOD_MODEL:-tokenpilot/gpt-5.4-mini}"
METHOD_JUDGE="${METHOD_JUDGE:-gpt-5.4-mini}"
METHOD_SUITE="${METHOD_SUITE:-${DEFAULT_SUITE}}"
METHOD_RUNS="${METHOD_RUNS:-1}"
METHOD_PARALLEL="${METHOD_PARALLEL:-1}"
METHOD_TIMEOUT_MULTIPLIER="${METHOD_TIMEOUT_MULTIPLIER:-1.0}"
METHOD_DYNAMIC_CONTEXT_TARGET="${METHOD_DYNAMIC_CONTEXT_TARGET:-developer}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

echo "============================================================"
echo "only_cache top15 regression"
echo "model=${METHOD_MODEL}"
echo "judge=${METHOD_JUDGE}"
echo "suite=${METHOD_SUITE}"
echo "dynamic_context_target=${METHOD_DYNAMIC_CONTEXT_TARGET}"
echo "============================================================"

cd "${REPO_ROOT}"
PINCHBENCH_ISOLATED_ABLATION_VARIANTS=no_reduction_pass \
PINCHBENCH_METHOD_MODEL="${METHOD_MODEL}" \
PINCHBENCH_METHOD_JUDGE="${METHOD_JUDGE}" \
PINCHBENCH_METHOD_SUITE="${METHOD_SUITE}" \
TOKENPILOT_DYNAMIC_CONTEXT_TARGET="${METHOD_DYNAMIC_CONTEXT_TARGET}" \
TOKENPILOT_RUNS="${METHOD_RUNS}" \
TOKENPILOT_PARALLEL="${METHOD_PARALLEL}" \
TOKENPILOT_TIMEOUT_MULTIPLIER="${METHOD_TIMEOUT_MULTIPLIER}" \
"${RUN_SCRIPT}"


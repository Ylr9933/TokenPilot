#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RUN_SCRIPT="${REPO_ROOT}/experiments/tokenpilot/pinchbench/scripts/run_method_isolated_reduction_ablation.sh"
ENV_FILE="${REPO_ROOT}/experiments/tokenpilot/pinchbench/.env"

DEFAULT_SUITE='task_financial_ratio_calculation,task_meeting_advisory_timeline,task_csv_stock_best_worst,task_workflow,task_executive_lookup'

METHOD_MODEL="${METHOD_MODEL:-tokenpilot/gpt-5.4-mini}"
METHOD_JUDGE="${METHOD_JUDGE:-gpt-5.4-mini}"
METHOD_SUITE="${METHOD_SUITE:-${DEFAULT_SUITE}}"
METHOD_RUNS="${METHOD_RUNS:-1}"
METHOD_PARALLEL="${METHOD_PARALLEL:-1}"
METHOD_TIMEOUT_MULTIPLIER="${METHOD_TIMEOUT_MULTIPLIER:-1.0}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

run_variant() {
  local dynamic_target="$1"
  echo "============================================================"
  echo "only_cache A/B run"
  echo "dynamic_context_target=${dynamic_target}"
  echo "model=${METHOD_MODEL}"
  echo "judge=${METHOD_JUDGE}"
  echo "suite=${METHOD_SUITE}"
  echo "============================================================"

  (
    cd "${REPO_ROOT}"
    PINCHBENCH_ISOLATED_ABLATION_VARIANTS=no_reduction_pass \
    PINCHBENCH_METHOD_MODEL="${METHOD_MODEL}" \
    PINCHBENCH_METHOD_JUDGE="${METHOD_JUDGE}" \
    PINCHBENCH_METHOD_SUITE="${METHOD_SUITE}" \
    TOKENPILOT_DYNAMIC_CONTEXT_TARGET="${dynamic_target}" \
    TOKENPILOT_RUNS="${METHOD_RUNS}" \
    TOKENPILOT_PARALLEL="${METHOD_PARALLEL}" \
    TOKENPILOT_TIMEOUT_MULTIPLIER="${METHOD_TIMEOUT_MULTIPLIER}" \
    "${RUN_SCRIPT}"
  )
}

run_variant developer
run_variant user


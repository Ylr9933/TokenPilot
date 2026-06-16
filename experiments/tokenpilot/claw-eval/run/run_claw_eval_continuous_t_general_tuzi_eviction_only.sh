#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPERIMENT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=../scripts/common.sh
source "${EXPERIMENT_ROOT}/scripts/common.sh"

ce_import_runtime_envs
ce_normalize_runtime_env

TUZI_BASE_URL="${TUZI_BASE_URL:-https://coding.tu-zi.com/v1}"
TUZI_API_KEY="${TUZI_API_KEY:-}"
MODEL="${CLAW_EVAL_MODEL:-tuzi/gpt-5.4-mini}"
JUDGE_MODEL="${CLAW_EVAL_JUDGE_MODEL:-${MODEL}}"

if [[ -z "${TUZI_API_KEY}" ]]; then
  echo "Missing TUZI_API_KEY in environment." >&2
  exit 2
fi

echo "[0/2] ensure tuzi upstream provider in ${OPENCLAW_CONFIG_PATH}"
ce_ensure_openai_responses_provider "tuzi" "${TUZI_BASE_URL}" "${TUZI_API_KEY}"

echo "[1/2] run claw-eval continuous t-general with eviction+estimator only"
CLAW_EVAL_MODEL="${MODEL}" \
CLAW_EVAL_JUDGE_MODEL="${JUDGE_MODEL}" \
TOKENPILOT_ENABLE_REDUCTION=false \
TOKENPILOT_ENABLE_EVICTION=true \
TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED=true \
TOKENPILOT_EVICTION_REPLACEMENT_MODE="${TOKENPILOT_EVICTION_REPLACEMENT_MODE:-drop}" \
exec bash "${EXPERIMENT_ROOT}/scripts/run_method.sh" \
  --scope t-general \
  --session-mode continuous \
  --profile custom \
  "$@"

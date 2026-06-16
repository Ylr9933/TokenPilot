#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPERIMENT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=../scripts/common.sh
source "${EXPERIMENT_ROOT}/scripts/common.sh"

ce_import_runtime_envs
ce_normalize_runtime_env

CATEGORY="${1:-${CLAW_EVAL_CATEGORY:-productivity}}"
TUZI_BASE_URL="${TUZI_BASE_URL:-https://coding.tu-zi.com/v1}"
TUZI_API_KEY="${TUZI_API_KEY:-}"
MODEL="${CLAW_EVAL_MODEL:-tuzi/gpt-5.4-mini}"

if [[ -z "${TUZI_API_KEY}" ]]; then
  echo "Missing TUZI_API_KEY in environment." >&2
  exit 2
fi

echo "[0/3] ensure tuzi upstream provider in ${OPENCLAW_CONFIG_PATH}"
ce_ensure_openai_responses_provider "tuzi" "${TUZI_BASE_URL}" "${TUZI_API_KEY}"

echo "[1/3] install plugin"
ce_install_release_plugin

echo "[2/3] run claw-eval plugin smoke via tuzi responses upstream"
echo "category=${CATEGORY}"
echo "model=${MODEL}"
CLAW_EVAL_CATEGORY="${CATEGORY}" \
CLAW_EVAL_MODEL="${MODEL}" \
TOKENPILOT_EVICTION_REPLACEMENT_MODE="${TOKENPILOT_EVICTION_REPLACEMENT_MODE:-drop}" \
exec bash "${EXPERIMENT_ROOT}/run/run_claw_eval_continuous_general_by_category_plugin_tmpconfig.sh" \
  --foreground

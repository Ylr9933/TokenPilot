#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=../scripts/common.sh
source "${CLAW_EVAL_ROOT}/scripts/common.sh"

ce_import_runtime_envs
ce_normalize_runtime_env

CATEGORY="${CLAW_EVAL_CATEGORY:-synthesis}"
MODEL="${CLAW_EVAL_MODEL:-tokenpilot/gpt-5.4-mini}"

echo "[1/2] install plugin"
ce_install_release_plugin

echo "[2/2] run claw-eval category smoke"
CLAW_EVAL_CATEGORY="${CATEGORY}" \
CLAW_EVAL_MODEL="${MODEL}" \
exec bash "${SCRIPT_DIR}/run_claw_eval_continuous_general_by_category_plugin_tmpconfig.sh" \
  --foreground

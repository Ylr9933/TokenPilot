#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPERIMENT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL="${CLAW_EVAL_BASELINE_MODEL:-${CLAW_EVAL_MODEL:-kuaipao/gpt-5.4-mini}}"
JUDGE_MODEL="${CLAW_EVAL_BASELINE_JUDGE:-${CLAW_EVAL_JUDGE_MODEL:-${MODEL}}}"
SOURCE_OPENCLAW_HOME="${SOURCE_OPENCLAW_HOME:-${TOKENPILOT_OPENCLAW_HOME:-${HOME}}}"
SOURCE_OPENCLAW_STATE_DIR="${SOURCE_OPENCLAW_STATE_DIR:-${SOURCE_OPENCLAW_HOME}/.openclaw}"

disable_tokenpilot_in_tmp_home() {
  local tmp_home="$1"
  local config_path="${tmp_home}/.openclaw/openclaw.json"
  python3 - <<'PY' "${config_path}"
import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
doc = json.loads(config_path.read_text(encoding="utf-8"))
plugins = doc.setdefault("plugins", {})

allow = plugins.get("allow")
if isinstance(allow, list):
    allow = [item for item in allow if item != "tokenpilot"]
    if allow:
        plugins["allow"] = allow
    else:
        plugins.pop("allow", None)

entries = plugins.get("entries")
if isinstance(entries, dict):
    for key in ("tokenpilot",):
        if key in entries and isinstance(entries[key], dict):
            entries[key]["enabled"] = False

installs = plugins.get("installs")
if isinstance(installs, dict):
    installs.pop("tokenpilot", None)

config_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
}

echo "[1/1] run claw-eval isolated t-general baseline via kuaipao"
echo "model=${MODEL}"
export SOURCE_OPENCLAW_HOME
export SOURCE_OPENCLAW_STATE_DIR
export CLAW_EVAL_DEFAULT_OPENCLAW_HOME="${SOURCE_OPENCLAW_HOME}"
TMP_HOME="/tmp/claw-eval-openclaw-baseline-t-general-$(date +%Y%m%d_%H%M%S)_$$"
mkdir -p "${TMP_HOME}"
cp -a "${SOURCE_OPENCLAW_STATE_DIR}" "${TMP_HOME}/.openclaw"
disable_tokenpilot_in_tmp_home "${TMP_HOME}"
CLAW_EVAL_MODEL="${MODEL}" \
CLAW_EVAL_JUDGE_MODEL="${JUDGE_MODEL}" \
CLAW_EVAL_BASELINE_MODEL="${MODEL}" \
CLAW_EVAL_BASELINE_JUDGE="${JUDGE_MODEL}" \
TOKENPILOT_RUNTIME_ENABLED=false \
TOKENPILOT_ENABLE_REDUCTION=false \
TOKENPILOT_ENABLE_EVICTION=false \
TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED=false \
TOKENPILOT_OPENCLAW_HOME="${TMP_HOME}" \
OPENCLAW_CONFIG_PATH="${TMP_HOME}/.openclaw/openclaw.json" \
HOME="${TMP_HOME}" \
bash "${EXPERIMENT_ROOT}/scripts/run_baseline.sh" \
  --scope t-general \
  --session-mode isolated

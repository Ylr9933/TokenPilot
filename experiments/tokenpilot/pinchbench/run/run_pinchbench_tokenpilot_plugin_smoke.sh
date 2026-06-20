#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PINCHBENCH_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ESTIMATOR_ENV_FILE="${SCRIPT_DIR}/estimator.env"

if [[ -f "${ESTIMATOR_ENV_FILE}" ]]; then
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" ]] && continue
    [[ "${line}" == \#* ]] && continue
    [[ "${line}" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    if [[ -n "${!key+x}" ]]; then
      continue
    fi
    export "${key}=${value}"
  done < "${ESTIMATOR_ENV_FILE}"
fi

MEETING_FAMILY="${PINCHBENCH_MEETING_FAMILY:-tampa}"
case "${MEETING_FAMILY}" in
  tampa)
    DEFAULT_MEETING_SUITE="task_meeting_council_votes,task_meeting_council_public_comment,task_meeting_council_budget"
    ;;
  tech)
    DEFAULT_MEETING_SUITE="task_meeting_tech_action_items,task_meeting_tech_decisions,task_meeting_tech_competitors"
    ;;
  advisory)
    DEFAULT_MEETING_SUITE="task_meeting_advisory_attendees,task_meeting_advisory_stakeholders,task_meeting_advisory_technical"
    ;;
  gov)
    DEFAULT_MEETING_SUITE="task_meeting_gov_speaker_summary,task_meeting_gov_qa_extract,task_meeting_gov_recommendations"
    ;;
  *)
    echo "Unknown PINCHBENCH_MEETING_FAMILY=${MEETING_FAMILY}" >&2
    exit 1
    ;;
esac

MEETING_SUITE="${PINCHBENCH_MEETING_SUITE:-${DEFAULT_MEETING_SUITE}}"
OUTPUT_DIR="${PINCHBENCH_MEETING_OUTPUT_DIR:-${PINCHBENCH_ROOT}/save/continuous/method/plugin_smoke}"
PINCHBENCH_TMP_ROOT="${PINCHBENCH_TMP_ROOT:-/tmp/pinchbench_tokenpilot_plugin_smoke}"
SOURCE_OPENCLAW_HOME="${TOKENPILOT_OPENCLAW_HOME:-${HOME}}"
SOURCE_OPENCLAW_CFG="${OPENCLAW_CONFIG_PATH:-${SOURCE_OPENCLAW_HOME}/.openclaw/openclaw.json}"
RUNTIME_OPENCLAW_HOME="${PINCHBENCH_RUNTIME_OPENCLAW_HOME:-${PINCHBENCH_TMP_ROOT}/openclaw_home}"
OPENCLAW_HOME="${RUNTIME_OPENCLAW_HOME}"
OPENCLAW_CFG="${OPENCLAW_HOME}/.openclaw/openclaw.json"
OPENCLAW_STATE_DIR="${OPENCLAW_HOME}/.openclaw"
OPENCLAW_PROFILE="${PINCHBENCH_OPENCLAW_PROFILE:-pinchbench-plugin-smoke}"
OPENCLAW_GATEWAY_PORT="${TOKENPILOT_GATEWAY_PORT:-${PINCHBENCH_OPENCLAW_GATEWAY_PORT:-18889}}"
TOKENPILOT_PROXY_PORT="${TOKENPILOT_PROXY_PORT:-17688}"

METHOD_MODEL="${PINCHBENCH_METHOD_MODEL:-${TOKENPILOT_METHOD_MODEL:-tokenpilot/gpt-5.4-mini}}"
METHOD_JUDGE="${PINCHBENCH_METHOD_JUDGE:-${TOKENPILOT_METHOD_JUDGE:-gpt-5.4-mini}}"
METHOD_PARALLEL="${TOKENPILOT_PARALLEL:-1}"
METHOD_TIMEOUT="${TOKENPILOT_TIMEOUT_MULTIPLIER:-1.0}"
METHOD_RUNS="${TOKENPILOT_RUNS:-1}"

ESTIMATOR_BATCH_TURNS="${TOKENPILOT_TASK_STATE_ESTIMATOR_BATCH_TURNS:-2}"
ESTIMATOR_EVICTION_LOOKAHEAD_TURNS="${TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_LOOKAHEAD_TURNS:-2}"

dump_tokenpilot_config_snapshot() {
  local stage="$1"
  local config_path="$2"
  if [[ ! -f "${config_path}" ]]; then
    echo "[plugin-smoke][config:${stage}] missing config: ${config_path}"
    return 0
  fi
  python3 - "${stage}" "${config_path}" <<'PY'
import json
import sys

stage, config_path = sys.argv[1:3]
with open(config_path, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

plugins = cfg.get("plugins", {})
entries = plugins.get("entries", {})
installs = plugins.get("installs", {})
entry_cfg = ((entries.get("tokenpilot") or {}).get("config"))
install_cfg = ((installs.get("tokenpilot") or {}).get("config"))

def pick(section):
    if not isinstance(section, dict):
        return section
    return {
        "taskStateEstimator": section.get("taskStateEstimator"),
        "memory": section.get("memory"),
    }

snapshot = {
    "stage": stage,
    "entries.tokenpilot.config": pick(entry_cfg),
    "installs.tokenpilot.config": pick(install_cfg),
}
print("[plugin-smoke][config:%s] %s" % (stage, json.dumps(snapshot, ensure_ascii=False)))
PY
}

echo "[plugin-smoke] family=${MEETING_FAMILY}"
echo "[plugin-smoke] suite=${MEETING_SUITE}"
echo "[plugin-smoke] batch=${ESTIMATOR_BATCH_TURNS}"
echo "[plugin-smoke] output_dir=${OUTPUT_DIR}"
echo "[plugin-smoke] source_openclaw_home=${SOURCE_OPENCLAW_HOME}"
echo "[plugin-smoke] runtime_openclaw_home=${OPENCLAW_HOME}"
echo "[plugin-smoke] tmp_root=${PINCHBENCH_TMP_ROOT}"
echo "[plugin-smoke] gateway_port=${OPENCLAW_GATEWAY_PORT}"
echo "[plugin-smoke] proxy_port=${TOKENPILOT_PROXY_PORT}"

if [[ -d "${PINCHBENCH_TMP_ROOT}" ]]; then
  OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
  OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
  OPENCLAW_PROFILE="${OPENCLAW_PROFILE}" \
  OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
  openclaw --profile "${OPENCLAW_PROFILE}" gateway stop >/dev/null 2>&1 || true
  python3 - "${PINCHBENCH_TMP_ROOT}" <<'PY'
import shutil
import sys
from pathlib import Path

target = Path(sys.argv[1])
if target.exists():
    shutil.rmtree(target, ignore_errors=False)
PY
fi
mkdir -p "${PINCHBENCH_TMP_ROOT}"
mkdir -p "${OPENCLAW_HOME}"

if [[ -d "${SOURCE_OPENCLAW_HOME}/.openclaw" ]]; then
  cp -a "${SOURCE_OPENCLAW_HOME}/.openclaw" "${OPENCLAW_HOME}/.openclaw"
else
  echo "Missing source OpenClaw state dir: ${SOURCE_OPENCLAW_HOME}/.openclaw" >&2
  exit 1
fi

dump_tokenpilot_config_snapshot "after-copy" "${OPENCLAW_CFG}"

rm -rf "${OPENCLAW_STATE_DIR}/agents"
mkdir -p "${OPENCLAW_STATE_DIR}/agents"
rm -rf "${OPENCLAW_STATE_DIR}/extensions/tokenpilot"

python3 - "${OPENCLAW_CFG}" "${METHOD_MODEL}" <<'PY'
import json
import sys

config_path = sys.argv[1]
method_model = sys.argv[2]

with open(config_path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

agents = data.setdefault("agents", {})
defaults = agents.setdefault("defaults", {})
model_cfg = defaults.setdefault("model", {})
models_cfg = defaults.setdefault("models", {})

model_cfg["primary"] = method_model
model_cfg["fallbacks"] = []
if method_model not in models_cfg:
    models_cfg[method_model] = {}

plugins = data.setdefault("plugins", {})
plugins["allow"] = ["tokenpilot"]

entries = plugins.get("entries")
if isinstance(entries, dict):
    entries.pop("tokenpilot", None)
    if not entries:
        plugins.pop("entries", None)

installs = plugins.get("installs")
if isinstance(installs, dict):
    installs.pop("tokenpilot", None)
    if not installs:
        plugins.pop("installs", None)

load_cfg = plugins.get("load")
if isinstance(load_cfg, dict):
    paths = load_cfg.get("paths")
    if isinstance(paths, list):
        filtered = []
        for item in paths:
            if not isinstance(item, str):
                continue
            lowered = item.lower()
            if "/extensions/tokenpilot" in lowered:
                continue
            filtered.append(item)
        if filtered:
            load_cfg["paths"] = filtered
        else:
            plugins.pop("load", None)

entries = plugins.get("entries")
if isinstance(entries, dict):
    tokenpilot = entries.get("tokenpilot")
    if isinstance(tokenpilot, dict):
        tokenpilot_cfg = tokenpilot.get("config")
        if isinstance(tokenpilot_cfg, dict):
            task_state_estimator = tokenpilot_cfg.get("taskStateEstimator")
            if isinstance(task_state_estimator, dict):
                task_state_estimator["apiKey"] = ""

with open(config_path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY

dump_tokenpilot_config_snapshot "after-smoke-prepatch" "${OPENCLAW_CFG}"

(
  cd "${REPO_ROOT}"
  TOKENPILOT_OPENCLAW_HOME="${OPENCLAW_HOME}" \
  OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
  OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
  OPENCLAW_PROFILE="${OPENCLAW_PROFILE}" \
  OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
  TOKENPILOT_PROXY_PORT="${TOKENPILOT_PROXY_PORT}" \
  pnpm plugin:install:release
)

dump_tokenpilot_config_snapshot "after-install-release" "${OPENCLAW_CFG}"

dump_tokenpilot_config_snapshot "before-benchmark" "${OPENCLAW_CFG}"

TOKENPILOT_SESSION_MODE=continuous \
TOKENPILOT_RUNS="${METHOD_RUNS}" \
TOKENPILOT_ENABLE_REDUCTION=true \
TOKENPILOT_ENABLE_EVICTION=true \
TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED=true \
TOKENPILOT_TASK_STATE_ESTIMATOR_BATCH_TURNS="${ESTIMATOR_BATCH_TURNS}" \
TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_LOOKAHEAD_TURNS="${ESTIMATOR_EVICTION_LOOKAHEAD_TURNS}" \
TOKENPILOT_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE="${TOKENPILOT_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE:-decoupled}" \
TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_POLICY="${TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_POLICY:-fifo}" \
TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_HOT_TAIL_SIZE="${TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_HOT_TAIL_SIZE:-1}" \
TOKENPILOT_MEMORY_ENABLED="${TOKENPILOT_MEMORY_ENABLED:-true}" \
TOKENPILOT_MEMORY_AUTO_DISTILL="${TOKENPILOT_MEMORY_AUTO_DISTILL:-true}" \
TOKENPILOT_MEMORY_DISTILLER_TYPE="${TOKENPILOT_MEMORY_DISTILLER_TYPE:-prompting}" \
TOKENPILOT_MEMORY_BATCH_SIZE="${TOKENPILOT_MEMORY_BATCH_SIZE:-2}" \
TOKENPILOT_MEMORY_TOP_K="${TOKENPILOT_MEMORY_TOP_K:-0}" \
TOKENPILOT_MEMORY_INJECT_AS_SYSTEM_HINT="${TOKENPILOT_MEMORY_INJECT_AS_SYSTEM_HINT:-false}" \
TOKENPILOT_MEMORY_DISTILL_BASE_URL="${TOKENPILOT_MEMORY_DISTILL_BASE_URL:-${TOKENPILOT_TASK_STATE_ESTIMATOR_BASE_URL:-}}" \
TOKENPILOT_MEMORY_DISTILL_API_KEY="${TOKENPILOT_MEMORY_DISTILL_API_KEY:-${TOKENPILOT_TASK_STATE_ESTIMATOR_API_KEY:-}}" \
TOKENPILOT_MEMORY_DISTILL_MODEL="${TOKENPILOT_MEMORY_DISTILL_MODEL:-${TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL:-}}" \
TOKENPILOT_MEMORY_DISTILL_TIMEOUT_MS="${TOKENPILOT_MEMORY_DISTILL_TIMEOUT_MS:-600000}" \
TOKENPILOT_REDUCTION_PASS_REPEATED_READ_DEDUP="${TOKENPILOT_REDUCTION_PASS_REPEATED_READ_DEDUP:-false}" \
TOKENPILOT_REDUCTION_PASS_TOOL_PAYLOAD_TRIM="${TOKENPILOT_REDUCTION_PASS_TOOL_PAYLOAD_TRIM:-false}" \
TOKENPILOT_REDUCTION_PASS_HTML_SLIMMING="${TOKENPILOT_REDUCTION_PASS_HTML_SLIMMING:-false}" \
TOKENPILOT_REDUCTION_PASS_EXEC_OUTPUT_TRUNCATION="${TOKENPILOT_REDUCTION_PASS_EXEC_OUTPUT_TRUNCATION:-false}" \
TOKENPILOT_REDUCTION_PASS_AGENTS_STARTUP_OPTIMIZATION="${TOKENPILOT_REDUCTION_PASS_AGENTS_STARTUP_OPTIMIZATION:-false}" \
TOKENPILOT_EXEC_ASK="${TOKENPILOT_EXEC_ASK:-off}" \
TOKENPILOT_OPENCLAW_HOME="${OPENCLAW_HOME}" \
OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR}" \
OPENCLAW_PROFILE="${OPENCLAW_PROFILE}" \
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
TOKENPILOT_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT}" \
TOKENPILOT_PROXY_PORT="${TOKENPILOT_PROXY_PORT}" \
PINCHBENCH_TMP_ROOT="${PINCHBENCH_TMP_ROOT}" \
"${PINCHBENCH_ROOT}/scripts/run_method.sh" \
  --model "${METHOD_MODEL}" \
  --judge "${METHOD_JUDGE}" \
  --suite "${MEETING_SUITE}" \
  --runs "${METHOD_RUNS}" \
  --parallel "${METHOD_PARALLEL}" \
  --timeout-multiplier "${METHOD_TIMEOUT}" \
  --session-mode continuous \
  --output-dir "${OUTPUT_DIR}"

dump_tokenpilot_config_snapshot "after-benchmark" "${OPENCLAW_CFG}"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

METHOD_MODEL="${METHOD_MODEL:-gpt-5.4-mini}"
METHOD_JUDGE="${METHOD_JUDGE:-gpt-5.4-mini}"
METHOD_RUNS="${METHOD_RUNS:-1}"
METHOD_PARALLEL="${METHOD_PARALLEL:-1}"
CATEGORY_FILTER="${CATEGORY_FILTER:-}"
TASK_FILTER="${TASK_FILTER:-}"
NOHUP_LOG_DIR="${NOHUP_LOG_DIR:-/tmp}"

mkdir -p "${NOHUP_LOG_DIR}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_LOG="${NOHUP_LOG_DIR}/pinchbench_continuous_reduction_no_eviction_${TIMESTAMP}.out"
PID_FILE="${NOHUP_LOG_DIR}/pinchbench_continuous_reduction_no_eviction_${TIMESTAMP}.pid"

cd "${REPO_ROOT}"

INNER_SCRIPT="$(mktemp /tmp/pinchbench_cont_no_evict_XXXXXX.sh)"
cat > "${INNER_SCRIPT}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd '${REPO_ROOT}'
set -a
source '${REPO_ROOT}/experiments/tokenpilot/pinchbench/.env'
set +a
export TOKENPILOT_SESSION_MODE='continuous'
export PINCHBENCH_METHOD_MODEL='${METHOD_MODEL}'
export PINCHBENCH_METHOD_JUDGE='${METHOD_JUDGE}'
export TOKENPILOT_ENABLE_REDUCTION='true'
export TOKENPILOT_ENABLE_EVICTION='false'
export TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED='false'
export TOKENPILOT_MEMORY_ENABLED='false'
export TOKENPILOT_REDUCTION_PASS_REPEATED_READ_DEDUP='true'
export TOKENPILOT_REDUCTION_PASS_TOOL_PAYLOAD_TRIM='true'
export TOKENPILOT_REDUCTION_PASS_HTML_SLIMMING='true'
export TOKENPILOT_REDUCTION_PASS_EXEC_OUTPUT_TRUNCATION='true'
export TOKENPILOT_REDUCTION_PASS_AGENTS_STARTUP_OPTIMIZATION='true'
export TOKENPILOT_REDUCTION_PASS_FORMAT_SLIMMING='true'
export TOKENPILOT_REDUCTION_PASS_FORMAT_CLEANING='true'
export TOKENPILOT_REDUCTION_PASS_PATH_TRUNCATION='true'
export TOKENPILOT_REDUCTION_PASS_IMAGE_DOWNSAMPLE='true'
export TOKENPILOT_REDUCTION_PASS_LINE_NUMBER_STRIP='true'
export TOKENPILOT_RUNS='${METHOD_RUNS}'
export TOKENPILOT_PARALLEL='${METHOD_PARALLEL}'
EOF

if [[ -n "${CATEGORY_FILTER}" ]]; then
  printf "export PINCHBENCH_CATEGORY_FILTER='%s'\n" "${CATEGORY_FILTER}" >> "${INNER_SCRIPT}"
fi
if [[ -n "${TASK_FILTER}" ]]; then
  printf "export PINCHBENCH_TASK_FILTER='%s'\n" "${TASK_FILTER}" >> "${INNER_SCRIPT}"
fi

cat >> "${INNER_SCRIPT}" <<EOF
exec '${REPO_ROOT}/experiments/tokenpilot/pinchbench/scripts/run_method_by_category_continuous.sh'
EOF

chmod +x "${INNER_SCRIPT}"

nohup bash "${INNER_SCRIPT}" >"${OUT_LOG}" 2>&1 < /dev/null &

PID=$!
echo "${PID}" > "${PID_FILE}"

echo "Started continuous reduction-only run (no eviction)"
echo "PID: ${PID}"
echo "PID file: ${PID_FILE}"
echo "Log: ${OUT_LOG}"

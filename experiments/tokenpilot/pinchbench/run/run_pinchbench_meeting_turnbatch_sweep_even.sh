#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BATCHES="${PINCHBENCH_TURNBATCH_SWEEP_BATCHES:-2 4 6 8}"
SLEEP_SECONDS="${PINCHBENCH_TURNBATCH_SWEEP_SLEEP_SECONDS:-5}"

echo "[turnbatch-sweep-even] batches=${BATCHES}"
echo "[turnbatch-sweep-even] sleep_seconds=${SLEEP_SECONDS}"
echo "[turnbatch-sweep-even] suite=${PINCHBENCH_MEETING_SUITE:-meeting default}"

for batch in ${BATCHES}; do
  script_path="${SCRIPT_DIR}/run_pinchbench_meeting_turnbatch_${batch}.sh"
  if [[ ! -f "${script_path}" ]]; then
    echo "[turnbatch-sweep-even] missing script: ${script_path}" >&2
    exit 2
  fi

  echo
  echo "================================================================================"
  echo "[turnbatch-sweep-even] starting batch=${batch} at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================================================================"

  bash "${script_path}"

  echo "================================================================================"
  echo "[turnbatch-sweep-even] finished batch=${batch} at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================================================================"

  sleep "${SLEEP_SECONDS}"
done

echo "[turnbatch-sweep-even] all batches completed"

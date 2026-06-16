#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BATCHES="${PINCHBENCH_TURNBATCH_SWEEP_BATCHES:-1 3 5 7 9}"
SLEEP_SECONDS="${PINCHBENCH_TURNBATCH_SWEEP_SLEEP_SECONDS:-5}"

echo "[turnbatch-sweep] batches=${BATCHES}"
echo "[turnbatch-sweep] sleep_seconds=${SLEEP_SECONDS}"
echo "[turnbatch-sweep] suite=${PINCHBENCH_MEETING_SUITE:-meeting default}"

for batch in ${BATCHES}; do
  script_path="${SCRIPT_DIR}/run_pinchbench_meeting_turnbatch_${batch}.sh"
  if [[ ! -f "${script_path}" ]]; then
    echo "[turnbatch-sweep] missing script: ${script_path}" >&2
    exit 2
  fi

  echo
  echo "================================================================================"
  echo "[turnbatch-sweep] starting batch=${batch} at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================================================================"

  bash "${script_path}"

  echo "================================================================================"
  echo "[turnbatch-sweep] finished batch=${batch} at $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================================================================"

  sleep "${SLEEP_SECONDS}"
done

echo "[turnbatch-sweep] all batches completed"

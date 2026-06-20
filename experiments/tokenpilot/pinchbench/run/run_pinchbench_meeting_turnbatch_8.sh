#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PINCHBENCH_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ESTIMATOR_ENV_FILE="${SCRIPT_DIR}/estimator.env"

if [[ -f "${ESTIMATOR_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ESTIMATOR_ENV_FILE}"
fi

MEETING_SUITE="${PINCHBENCH_MEETING_SUITE:-task_meeting_advisory_acronyms,task_meeting_advisory_attendees,task_meeting_advisory_stakeholders,task_meeting_advisory_technical,task_meeting_advisory_timeline,task_meeting_blog_post,task_meeting_council_budget,task_meeting_council_contact_info,task_meeting_council_neighborhood,task_meeting_council_public_comment,task_meeting_council_upcoming,task_meeting_council_votes,task_meeting_executive_summary,task_meeting_follow_up_email,task_meeting_gov_controversy,task_meeting_gov_data_sources,task_meeting_gov_next_steps,task_meeting_gov_qa_extract,task_meeting_gov_recommendations,task_meeting_gov_speaker_summary,task_meeting_searchable_index,task_meeting_sentiment_analysis,task_meeting_tech_action_items,task_meeting_tech_competitors,task_meeting_tech_decisions,task_meeting_tech_messaging,task_meeting_tech_product_features,task_meeting_tldr}"
OUTPUT_DIR="${PINCHBENCH_MEETING_OUTPUT_DIR:-${PINCHBENCH_ROOT}/save/continuous/method/meeting_turnbatch_8}"
OPENCLAW_HOME="${TOKENPILOT_OPENCLAW_HOME:-${HOME}}"
OPENCLAW_CFG="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_HOME}/.openclaw/openclaw.json}"
PINCHBENCH_TMP_ROOT="${PINCHBENCH_TMP_ROOT:-/tmp/pinchbench_meeting_turnbatch_8}"
METHOD_MODEL="${TOKENPILOT_MODEL:-tokenpilot/gpt-5.4-mini}"
METHOD_JUDGE="${TOKENPILOT_JUDGE:-gpt-5.4-mini}"
METHOD_PARALLEL="${TOKENPILOT_PARALLEL:-1}"
METHOD_TIMEOUT="${TOKENPILOT_TIMEOUT_MULTIPLIER:-1.0}"
METHOD_RUNS="${TOKENPILOT_RUNS:-1}"

echo "[meeting-turnbatch] suite=meeting(28 tasks)"
echo "[meeting-turnbatch] batch=8"
echo "[meeting-turnbatch] output_dir=${OUTPUT_DIR}"
echo "[meeting-turnbatch] openclaw_home=${OPENCLAW_HOME}"
echo "[meeting-turnbatch] tmp_root=${PINCHBENCH_TMP_ROOT}"

rm -rf "${PINCHBENCH_TMP_ROOT}"
mkdir -p "${PINCHBENCH_TMP_ROOT}"

(
  cd "${REPO_ROOT}"
  TOKENPILOT_OPENCLAW_HOME="${OPENCLAW_HOME}" \
  OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
  pnpm plugin:install:release
)

TOKENPILOT_SESSION_MODE=continuous \
TOKENPILOT_RUNS="${METHOD_RUNS}" \
TOKENPILOT_ENABLE_REDUCTION=true \
TOKENPILOT_ENABLE_EVICTION=true \
TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED=true \
TOKENPILOT_TASK_STATE_ESTIMATOR_BATCH_TURNS=8 \
TOKENPILOT_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE=decoupled \
TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_POLICY=fifo \
TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_PROMOTION_HOT_TAIL_SIZE=1 \
TOKENPILOT_REDUCTION_PASS_REPEATED_READ_DEDUP=false \
TOKENPILOT_REDUCTION_PASS_TOOL_PAYLOAD_TRIM=false \
TOKENPILOT_REDUCTION_PASS_HTML_SLIMMING=false \
TOKENPILOT_REDUCTION_PASS_EXEC_OUTPUT_TRUNCATION=false \
TOKENPILOT_REDUCTION_PASS_AGENTS_STARTUP_OPTIMIZATION=false \
TOKENPILOT_EXEC_ASK=off \
TOKENPILOT_OPENCLAW_HOME="${OPENCLAW_HOME}" \
OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
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

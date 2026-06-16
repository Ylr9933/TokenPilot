#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PINCHBENCH_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MEETING_SUITE="${PINCHBENCH_MEETING_SUITE:-task_meeting_advisory_acronyms,task_meeting_advisory_attendees,task_meeting_advisory_stakeholders,task_meeting_advisory_technical,task_meeting_advisory_timeline,task_meeting_blog_post,task_meeting_council_budget,task_meeting_council_contact_info,task_meeting_council_neighborhood,task_meeting_council_public_comment,task_meeting_council_upcoming,task_meeting_council_votes,task_meeting_executive_summary,task_meeting_follow_up_email,task_meeting_gov_controversy,task_meeting_gov_data_sources,task_meeting_gov_next_steps,task_meeting_gov_qa_extract,task_meeting_gov_recommendations,task_meeting_gov_speaker_summary,task_meeting_searchable_index,task_meeting_sentiment_analysis,task_meeting_tech_action_items,task_meeting_tech_competitors,task_meeting_tech_decisions,task_meeting_tech_messaging,task_meeting_tech_product_features,task_meeting_tldr}"
OUTPUT_DIR="${PINCHBENCH_MEETING_OUTPUT_DIR:-${PINCHBENCH_ROOT}/save/continuous/baseline/meeting}"
OPENCLAW_HOME="${TOKENPILOT_OPENCLAW_HOME:-${HOME}}"
OPENCLAW_CFG="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_HOME}/.openclaw/openclaw.json}"
PINCHBENCH_TMP_ROOT="${PINCHBENCH_TMP_ROOT:-/tmp/pinchbench_meeting_baseline}"

echo "[meeting-baseline] suite=meeting(28 tasks)"
echo "[meeting-baseline] output_dir=${OUTPUT_DIR}"
echo "[meeting-baseline] openclaw_home=${OPENCLAW_HOME}"
echo "[meeting-baseline] tmp_root=${PINCHBENCH_TMP_ROOT}"

rm -rf "${PINCHBENCH_TMP_ROOT}"
mkdir -p "${PINCHBENCH_TMP_ROOT}"

BASELINE_MODEL="${BASELINE_MODEL:-gpt-5.4-mini}"
BASELINE_JUDGE="${BASELINE_JUDGE:-tokenpilot/gpt-5.4-mini}"
BASELINE_PROVIDER_PREFIX="${BASELINE_PROVIDER_PREFIX:-kuaipao}"
PINCHBENCH_STORE_LLM_CALL_IO="${PINCHBENCH_STORE_LLM_CALL_IO:-true}"

if [[ -n "${KUAIPAO_BASE_URL:-}" && -z "${BASELINE_BASE_URL:-}" ]]; then
  export BASELINE_BASE_URL="${KUAIPAO_BASE_URL}"
fi
if [[ -n "${KUAIPAO_API_KEY:-}" && -z "${BASELINE_API_KEY:-}" ]]; then
  export BASELINE_API_KEY="${KUAIPAO_API_KEY}"
fi

BASELINE_MODEL="${BASELINE_MODEL}" \
BASELINE_JUDGE="${BASELINE_JUDGE}" \
BASELINE_PROVIDER_PREFIX="${BASELINE_PROVIDER_PREFIX}" \
PINCHBENCH_STORE_LLM_CALL_IO="${PINCHBENCH_STORE_LLM_CALL_IO}" \
TOKENPILOT_OPENCLAW_HOME="${OPENCLAW_HOME}" \
OPENCLAW_CONFIG_PATH="${OPENCLAW_CFG}" \
PINCHBENCH_TMP_ROOT="${PINCHBENCH_TMP_ROOT}" \
"${PINCHBENCH_ROOT}/scripts/run_baseline.sh" \
  --model "${BASELINE_MODEL}" \
  --judge "${BASELINE_JUDGE}" \
  --suite "${MEETING_SUITE}" \
  --runs "${BASELINE_RUNS:-1}" \
  --parallel 1 \
  --timeout-multiplier "${BASELINE_TIMEOUT_MULTIPLIER:-1.0}" \
  --session-mode continuous \
  --output-dir "${OUTPUT_DIR}"

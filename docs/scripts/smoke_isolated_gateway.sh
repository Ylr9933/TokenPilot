#!/usr/bin/env bash
set -euo pipefail

# Smoke test for an isolated TokenPilot gateway runtime
# Sets up a local gateway with proxy for testing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SRC_HOME="${SRC_HOME:-$(dirname "${REPO_ROOT}")}"
SMOKE_HOME="${SMOKE_HOME:-/tmp/lightmem2-smoke-home}"
GATEWAY_PORT="${GATEWAY_PORT:-28890}"
PROXY_PORT="${PROXY_PORT:-17690}"
UPSTREAM_BASE_URL="${LIGHTMEM2_BASE_URL:-${TOKENPILOT_BASE_URL:-}}"
UPSTREAM_API_KEY="${LIGHTMEM2_API_KEY:-${TOKENPILOT_API_KEY:-}}"
UPSTREAM_HTTP_PROXY="${LIGHTMEM2_UPSTREAM_HTTP_PROXY:-${TOKENPILOT_UPSTREAM_HTTP_PROXY:-}}"
UPSTREAM_HTTPS_PROXY="${LIGHTMEM2_UPSTREAM_HTTPS_PROXY:-${TOKENPILOT_UPSTREAM_HTTPS_PROXY:-$UPSTREAM_HTTP_PROXY}}"
UPSTREAM_NO_PROXY="${LIGHTMEM2_UPSTREAM_NO_PROXY:-${TOKENPILOT_UPSTREAM_NO_PROXY:-127.0.0.1,localhost}}"
STAMP="$(date +%s)"
RUNTIME_HOME="${SMOKE_HOME}/${STAMP}"
LOG_FILE="${RUNTIME_HOME}/gateway.log"

if [[ -z "${UPSTREAM_BASE_URL}" || -z "${UPSTREAM_API_KEY}" ]]; then
  echo "Missing upstream config. Set LIGHTMEM2_BASE_URL and LIGHTMEM2_API_KEY first." >&2
  exit 2
fi

# Setup runtime home
mkdir -p "${RUNTIME_HOME}"
cp -a "${SRC_HOME}/.openclaw" "${RUNTIME_HOME}/.openclaw"
rm -f "${RUNTIME_HOME}/.openclaw/tokenpilot-plugin-state/tokenpilot/proxy-requests.jsonl"
rm -f "${RUNTIME_HOME}/.openclaw/tokenpilot-plugin-state/tokenpilot/provider-traffic.jsonl"
rm -f "${RUNTIME_HOME}/.openclaw/tokenpilot-plugin-state/tokenpilot/event-trace.jsonl"
rm -f "${RUNTIME_HOME}/.openclaw/tokenpilot-plugin-state/tokenpilot/upstream-transport-trace.jsonl"

# Configure openclaw.json
python3 - <<PY
import json
p = ${RUNTIME_HOME@Q} + '/.openclaw/openclaw.json'
with open(p, 'r', encoding='utf-8') as f:
    obj = json.load(f)
obj.setdefault('gateway', {})['port'] = int(${GATEWAY_PORT@Q})
plugins = obj.setdefault('plugins', {}).setdefault('entries', {})
tokenpilot = plugins.setdefault('tokenpilot', {}).setdefault('config', {})
tokenpilot['proxyPort'] = int(${PROXY_PORT@Q})
tokenpilot['proxyBaseUrl'] = ${UPSTREAM_BASE_URL@Q}
tokenpilot['proxyApiKey'] = ${UPSTREAM_API_KEY@Q}
providers = obj.setdefault('models', {}).setdefault('providers', {})
providers['tokenpilot'] = {
    'baseUrl': f"http://127.0.0.1:{int(${PROXY_PORT@Q})}/v1",
    'apiKey': 'tokenpilot-local',
    'api': 'openai-responses',
    'authHeader': False,
    'models': [
        {
            'id': 'gpt-5.4-mini',
            'name': 'gpt-5.4-mini',
            'api': 'openai-responses',
            'reasoning': False,
            'input': ['text', 'image'],
            'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0},
            'contextWindow': 128000,
            'maxTokens': 16384,
        },
    ],
}
providers['lightmem2'] = {
    'baseUrl': f"http://127.0.0.1:{int(${PROXY_PORT@Q})}/v1",
    'apiKey': 'tokenpilot-local',
    'api': 'openai-responses',
    'authHeader': False,
    'models': [
        {
            'id': 'gpt-5.4-mini',
            'name': 'gpt-5.4-mini',
            'api': 'openai-responses',
            'reasoning': False,
            'input': ['text', 'image'],
            'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0},
            'contextWindow': 128000,
            'maxTokens': 16384,
        },
    ],
}
obj.setdefault('agents', {}).setdefault('defaults', {}).setdefault('model', {})['primary'] = 'lightmem2/gpt-5.4-mini'
obj['agents']['defaults']['model']['fallbacks'] = []
with open(p, 'w', encoding='utf-8') as f:
    json.dump(obj, f, indent=2, ensure_ascii=False)
    f.write('\n')
print(p)
PY

# Start gateway
nohup env \
  HOME="${RUNTIME_HOME}" \
  XDG_CACHE_HOME="${RUNTIME_HOME}/.cache" \
  XDG_CONFIG_HOME="${RUNTIME_HOME}/.config" \
  LIGHTMEM2_UPSTREAM_HTTP_PROXY="${UPSTREAM_HTTP_PROXY}" \
  LIGHTMEM2_UPSTREAM_HTTPS_PROXY="${UPSTREAM_HTTPS_PROXY}" \
  LIGHTMEM2_UPSTREAM_NO_PROXY="${UPSTREAM_NO_PROXY}" \
  TOKENPILOT_UPSTREAM_HTTP_PROXY="${UPSTREAM_HTTP_PROXY}" \
  TOKENPILOT_UPSTREAM_HTTPS_PROXY="${UPSTREAM_HTTPS_PROXY}" \
  TOKENPILOT_UPSTREAM_NO_PROXY="${UPSTREAM_NO_PROXY}" \
  openclaw gateway run --force --port "${GATEWAY_PORT}" >"${LOG_FILE}" 2>&1 &
GW_PID=$!

echo "runtime_home=${RUNTIME_HOME}"
echo "gateway_pid=${GW_PID}"
echo "gateway_log=${LOG_FILE}"

# Wait for proxy to be ready
echo "waiting for proxy :${PROXY_PORT} ..."
for _ in $(seq 1 60); do
  if python3 - <<PY >/dev/null 2>&1
import socket
s = socket.socket()
s.settimeout(0.5)
s.connect(('127.0.0.1', int(${PROXY_PORT@Q})))
s.close()
PY
  then
    break
  fi
  sleep 1
done

echo "health check"
curl --noproxy '*' -sS -i "http://127.0.0.1:${PROXY_PORT}/health" || true

# Test response request
echo "response request"
python3 - <<PY
import json, urllib.request, urllib.error
url = f'http://127.0.0.1:{int(${PROXY_PORT@Q})}/v1/responses'
payload = {'model': 'gpt-5.4-mini', 'input': 'Reply with exactly: pong'}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'content-type': 'application/json'}, method='POST')
try:
    with opener.open(req, timeout=90) as resp:
        body = resp.read().decode('utf-8', 'replace')
        print('STATUS', resp.status)
        print(body[:1200])
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    print(e.read().decode('utf-8', 'replace')[:1200])
PY

echo "port status"
python3 - <<PY
import socket
for port in [int(${PROXY_PORT@Q}), int(${GATEWAY_PORT@Q})]:
    s = socket.socket()
    s.settimeout(0.5)
    try:
        s.connect(('127.0.0.1', port))
        print(port, 'open')
    except Exception as e:
        print(port, 'closed', e)
    finally:
        s.close()
PY

echo "=== main log tail ==="
tail -n 80 /tmp/openclaw/openclaw-$(date +%F).log || true

echo "=== trace files ==="
find "${RUNTIME_HOME}/.openclaw/tokenpilot-plugin-state/tokenpilot" -maxdepth 1 -type f | sort || true

#!/usr/bin/env bash
# OWASP ZAP against the local stack: a baseline scan of the web app (passive: it spiders and reads) and an API scan driven by
# the API's own OpenAPI file (active: it sends attack payloads). Only ever run this against your own local stack.
#
#   bash tests/security/zap/run-zap.sh            # both
#   bash tests/security/zap/run-zap.sh baseline   # or: api
#
# Start the stack first, with the rate limit off and a long token life, or the scan is mostly 429s and then 401s:
#   cd app && RATE_LIMIT_PER_MIN=0 ACCESS_TOKEN_TTL_SEC=7200 WEB_ALLOWED_HOSTS=host.docker.internal docker compose up --build -d
# Reports go to tests/security/zap/reports/. The rules in baseline-rules.tsv and api-rules.tsv say which alerts fail the run.
set -euo pipefail
cd "$(dirname "$0")/../../.."

mode="${1:-all}"
env_file() { grep -E "^$1=" app/.env 2>/dev/null | cut -d= -f2 || true; }
api_port="${API_PORT:-$(env_file API_PORT)}"; api_port="${api_port:-3000}"
web_port="${WEB_PORT:-$(env_file WEB_PORT)}"; web_port="${web_port:-5173}"
image="ghcr.io/zaproxy/zaproxy:${ZAP_VERSION:-2.17.0}"
zap_dir="tests/security/zap"
inside="http://host.docker.internal"

mkdir -p "$zap_dir/reports"
chmod a+w "$zap_dir/reports"   # ZAP runs as its own user inside the container
zap() { docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD/$zap_dir:/zap/wrk:rw" "$image" "$@"; }
status=0

if [ "$mode" = all ] || [ "$mode" = baseline ]; then
  echo "== ZAP baseline scan of the web app"
  zap zap-baseline.py -t "$inside:$web_port/" -j -c baseline-rules.tsv -r reports/baseline.html -J reports/baseline.json -w reports/baseline.md -I || status=$?
fi

if [ "$mode" = all ] || [ "$mode" = api ]; then
  echo "== ZAP API scan from the OpenAPI file"
  node "$zap_dir/prepare-openapi.mjs" "http://localhost:$api_port" "$zap_dir/reports/openapi-api.json" "$inside:$api_port"
  # An admin sees every operation. The scan runs as a throwaway admin, because a scanner's bad requests would lock a seeded account.
  token=$(curl -sf -X POST "http://localhost:$api_port/test/users" -H 'content-type: application/json' -d '{"role":"admin"}' |
    sed -E 's/.*"accessToken":"([^"]+)".*/\1/')
  [ -n "$token" ] || { echo "Could not create a test user: are the test hooks on?" >&2; exit 2; }
  zap zap-api-scan.py -t /zap/wrk/reports/openapi-api.json -f openapi -c api-rules.tsv -r reports/api.html -J reports/api.json -w reports/api.md -I \
    -z "-config replacer.full_list(0).description=auth -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=Authorization -config replacer.full_list(0).regex=false -config replacer.full_list(0).replacement=Bearer\ $token" || status=$?
fi

# ZAP exits 1 for a FAIL alert and 2 for warnings. -I stops warnings failing the run; a FAIL alert still does.
exit "$status"

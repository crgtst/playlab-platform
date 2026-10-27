#!/usr/bin/env bash
# Runs one k6 script against the perf stack, in Docker, and fails if any threshold or any extra check failed.
#
#   tests/k6/run.sh smoke | products | orders | soak | overload | stress | spike
#   RPS=5 DURATION=30s tests/k6/run.sh products        # a short run to try the script (an override is not evidence for an AC)
#   INJECT_LATENCY_MS=300 tests/k6/run.sh products     # the p95 threshold fails, and so does the run
#   PROMETHEUS_RW=1 tests/k6/run.sh orders             # also send k6's metrics to the stack's Prometheus (see README)
#
# Start the stack first:  cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d
# (the overload test needs PERF_RATE_LIMIT_PER_MIN=600 on that command). Results go to tests/k6/results/.
set -euo pipefail
cd "$(dirname "$0")/../.."

script="${1:-}"; shift || true
[ -f "tests/k6/scripts/$script.js" ] || { echo "Usage: tests/k6/run.sh smoke|products|orders|soak|overload|stress|spike" >&2; exit 2; }

env_file() { grep -E "^$1=" app/.env 2>/dev/null | cut -d= -f2 || true; }
api_port="${API_PORT:-$(env_file API_PORT)}"; api_port="${api_port:-3000}"
prom_port="${PROMETHEUS_PORT:-$(env_file PROMETHEUS_PORT)}"; prom_port="${prom_port:-9091}"
image="grafana/k6:${K6_VERSION:-2.3.0}"

curl -sf "http://localhost:${api_port}/api/v1/health" >/dev/null || { echo "The API is not answering on port ${api_port}: start the perf stack first" >&2; exit 2; }
mkdir -p tests/k6/results
rm -f "tests/k6/results/junit-$script.xml" "tests/k6/results/$script-"*

args=(run --quiet "scripts/$script.js")
envs=(-e "BASE_URL=http://host.docker.internal:${api_port}")
for name in RPS DURATION INJECT_LATENCY_MS BASELINE_WINDOW STEP RATES SURGE OVERLOAD_DURATION RECOVERY_SECONDS; do
  [ -n "${!name:-}" ] && envs+=(-e "$name=${!name}")
done
if [ "${PROMETHEUS_RW:-}" = 1 ]; then
  args+=(-o experimental-prometheus-rw --tag "testid=$script-$(date +%Y%m%d-%H%M%S)")
  envs+=(-e "K6_PROMETHEUS_RW_SERVER_URL=http://host.docker.internal:${prom_port}/api/v1/write" -e "K6_PROMETHEUS_RW_TREND_STATS=avg,p(95),p(99),max")
fi

started=$(date +%s)
status=0
docker run --rm --user "$(id -u):$(id -g)" --add-host=host.docker.internal:host-gateway \
  -v "$PWD:/repo" -w /repo/tests/k6 "${envs[@]}" "$image" "${args[@]}" "$@" || status=$?

# k6 exits 99 when a threshold fails. The soak's drift and memory checks are not thresholds, so read the JUnit file too.
if [ "$script" = soak ]; then
  PROMETHEUS_URL="http://localhost:${prom_port}" node tests/k6/lib/soak-memory.mjs "$started" "$(date +%s)" || true
fi
node tests/k6/lib/check-results.mjs "tests/k6/results/junit-$script.xml" || status=1
exit "$status"

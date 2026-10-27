#!/usr/bin/env bash
# Runs one JMeter plan against the perf stack, non-GUI, and fails if a pass mark is missed.
#
#   tests/jmeter/run.sh products | journey | soak | overload
#   RPS=5 DURATION=30s tests/jmeter/run.sh products     # a short run to try the plan (an override is not evidence for an AC)
#   PROMETHEUS_RW=1 tests/jmeter/run.sh products        # also send the results to the stack's Prometheus (the k6-vs-JMeter dashboard)
#
# Needs JMeter 5.6 on the PATH (brew install jmeter), or JMETER=/path/to/bin/jmeter.
# Start the stack first:  cd app && docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d
# (overload needs PERF_RATE_LIMIT_PER_MIN=600 on that command). Results go to tests/jmeter/results/<plan>/.
set -euo pipefail
cd "$(dirname "$0")/../.."

plan="${1:-}"; shift || true
case "$plan" in
  products | soak) jmx=products-load ;;
  journey) jmx=checkout-journey ;;
  overload) jmx=overload ;;
  *) echo "Usage: tests/jmeter/run.sh products|journey|soak|overload" >&2; exit 2 ;;
esac

env_file() { grep -E "^$1=" app/.env 2>/dev/null | cut -d= -f2 || true; }
api_port="${API_PORT:-$(env_file API_PORT)}"; api_port="${api_port:-3000}"
prom_port="${PROMETHEUS_PORT:-$(env_file PROMETHEUS_PORT)}"; prom_port="${prom_port:-9091}"
jmeter="${JMETER:-jmeter}"
command -v "$jmeter" >/dev/null || { echo "JMeter is not installed (brew install jmeter), or set JMETER=/path/to/bin/jmeter" >&2; exit 2; }
curl -sf "http://localhost:${api_port}/api/v1/health" >/dev/null || { echo "The API is not answering on port ${api_port}: start the perf stack first" >&2; exit 2; }

results="tests/jmeter/results/$plan"
rm -rf "$results" "tests/jmeter/results/junit-$plan.xml"
mkdir -p "$results"

if [ "$plan" = journey ]; then
  node tests/jmeter/lib/prepare-data.mjs "http://localhost:${api_port}" tests/jmeter/data --journey
else
  node tests/jmeter/lib/prepare-data.mjs "http://localhost:${api_port}" tests/jmeter/data
fi

# shellcheck disable=SC2046
properties=$(node tests/jmeter/lib/model.mjs "$plan")
started=$(date +%s)
status=0
# -e -o writes the HTML dashboard; -l the raw results the JUnit file is made from.
# shellcheck disable=SC2086
"$jmeter" -n -t "tests/jmeter/plans/$jmx.jmx" -l "$results/results.jtl" -e -o "$results/dashboard" \
  -j "$results/jmeter.log" -Jhost=localhost -Jport="$api_port" -Jdata_dir="$PWD/tests/jmeter/data" $properties \
  -Jjmeter.save.saveservice.output_format=csv -Jjmeter.save.saveservice.timestamp_format=ms \
  -Jjmeter.save.saveservice.assertion_results_failure_message=true ${@+"$@"} || status=$?

node tests/jmeter/lib/jtl-to-junit.mjs "$plan" "$results/results.jtl" "tests/jmeter/results/junit-$plan.xml" || status=1
if [ "$plan" = soak ]; then
  PROMETHEUS_URL="http://localhost:${prom_port}" node tests/jmeter/lib/soak-memory.mjs "$started" "$(date +%s)" || true
fi
# PROMETHEUS_RW=1 also sends the results to the stack's Prometheus, tagged like the k6 runs (tool, load, testid).
if [ "${PROMETHEUS_RW:-}" = 1 ]; then
  load="$plan"; [ "$plan" = journey ] && load=orders
  node tests/jmeter/lib/push-metrics.mjs "$load" "$plan-jmeter-$(date +%Y%m%d-%H%M%S)" "$results/results.jtl" "http://localhost:${prom_port}" || true
fi
node tests/jmeter/lib/check-results.mjs "tests/jmeter/results/junit-$plan.xml" || status=1
echo "Dashboard: $results/dashboard/index.html"
exit "$status"

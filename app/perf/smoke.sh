#!/usr/bin/env bash
# Checks the performance profile on a running perf stack (PLS-27.5). Start it first:
#   docker compose -f docker-compose.yml -f docker-compose.perf.yml up --build -d
# Reads the ports from app/.env (API_PORT, PROMETHEUS_PORT, GRAFANA_PORT) and exits non-zero on the first thing that is wrong.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
API="http://localhost:${API_PORT:-3000}"
PROM="http://localhost:${PROMETHEUS_PORT:-9091}"
GRAF="http://localhost:${GRAFANA_PORT:-3300}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.perf.yml"
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok:   $*"; }

curl -fsS "$API/api/v1/health" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if all(v=="up" for v in d["checks"].values()) else 1)' || fail "health is not all up"
ok "the stack is ready"

# The API runs as production, with the rate limit off.
env=$($COMPOSE exec -T api printenv NODE_ENV RATE_LIMIT_PER_MIN | tr '\n' ' ')
[ "$env" = "production 0 " ] || fail "api environment is '$env', expected 'production 0'"
ok "the API runs with NODE_ENV=production and no rate limit"
limited=0
for _ in $(seq 1 150); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/categories"); [ "$code" = 200 ] || limited=$((limited + 1))
done
[ "$limited" = 0 ] || fail "$limited of 150 requests were refused: the rate limit is on"
ok "150 requests in a row all succeeded"

# CPU and memory limits (nano-CPUs and bytes).
limits() { docker inspect "$($COMPOSE ps -q "$1")" --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}'; }
[ "$(limits api)" = "2000000000 1073741824" ] || fail "api limits are '$(limits api)', expected 2 CPUs and 1 GB"
[ "$(limits db)" = "2000000000 2147483648" ] || fail "db limits are '$(limits db)', expected 2 CPUs and 2 GB"
ok "the API has 2 CPUs and 1 GB, the database 2 CPUs and 2 GB"

# Prometheus scrapes the API.
for _ in $(seq 1 30); do
  up=$(curl -fsS "$PROM/api/v1/query?query=up%7Bjob%3D%22playlab-api%22%7D" 2>/dev/null | python3 -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "")' 2>/dev/null || true)
  [ "$up" = 1 ] && break; sleep 2
done
[ "$up" = 1 ] || fail "Prometheus does not see the API as up"
ok "Prometheus scrapes the API"

# Grafana has the provisioned dashboard, and its three panels have data after some traffic.
for _ in $(seq 1 60); do curl -fsS "$API/api/v1/products?limit=3" >/dev/null; done
sleep 12
title=$(curl -fsS "$GRAF/api/dashboards/uid/playlab-api" | python3 -c 'import sys,json; print(json.load(sys.stdin)["dashboard"]["title"])') || fail "Grafana has no dashboard playlab-api"
[ "$title" = "PlayLab API" ] || fail "dashboard title is '$title'"
ok "Grafana has the PlayLab API dashboard"
panel() {
  curl -fsS -G "$GRAF/api/datasources/proxy/uid/prometheus/api/v1/query" --data-urlencode "query=$1" | python3 -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; sys.exit(0 if r and r[0]["value"][1] not in ("NaN",) else 1)'
}
panel 'sum(rate(http_request_duration_seconds_count[1m]))' || fail "the request rate panel has no data"
panel 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))' || fail "the p95 panel has no data"
panel '(sum(rate(http_request_duration_seconds_count{status=~"5.."}[1m])) or vector(0)) / sum(rate(http_request_duration_seconds_count[1m]))' || fail "the error rate panel has no data"
ok "the request rate, p95 and error rate panels have data"
echo "Performance profile OK"

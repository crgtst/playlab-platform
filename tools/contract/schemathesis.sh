#!/usr/bin/env bash
# Runs Schemathesis against the running API (PLS-26.2): every response must match the OpenAPI file and no request may cause a 500.
#
#   bash tools/contract/schemathesis.sh                # the stack from app/.env, default 25 examples per operation
#   MAX_EXAMPLES=100 SEED=7 bash tools/contract/schemathesis.sh
#   ROLE=admin bash tools/contract/schemathesis.sh     # reaches the admin-only operations a customer only gets 403 from
#
# Start the stack with the rate limit off first, or the run is mostly 429s:
#   RATE_LIMIT_PER_MIN=0 docker compose up --build -d      (from app/)
# positive_data_acceptance is off: a request can match the schema and still break a business rule (minPrice above maxPrice, a
# discount code on an empty cart), and the API is right to refuse it with a documented 422.
# deleteUsersMe is left out: the fuzzer would delete the user whose token it is using, and every later request would be a 401.
# The test hooks (/test, /pay, /metrics) are left out: a fuzzer would call /test/reset in the middle of its own run.
set -euo pipefail
cd "$(dirname "$0")/../.."

port="${API_PORT:-$(grep -E '^API_PORT=' app/.env 2>/dev/null | cut -d= -f2 || true)}"
port="${port:-3000}"
host="http://localhost:${port}"
inside="http://host.docker.internal:${port}"
image="schemathesis/schemathesis:${SCHEMATHESIS_VERSION:-4.32.5}"
out="${OUT_DIR:-tools/contract/results}"
mkdir -p "$out"

curl -sf "${host}/api/v1/health" >/dev/null || { echo "The API is not answering on ${host}" >&2; exit 2; }

# Fuzzing needs a signed-in user. A throwaway one, because the fuzzer's bad logins would lock a seeded account.
# Schemathesis also sends bad tokens on purpose, to see that the API answers 401.
token=$(curl -sf -X POST "${host}/test/users" -H 'content-type: application/json' -d "{\"role\":\"${ROLE:-customer}\"}" |
  sed -E 's/.*"accessToken":"([^"]+)".*/\1/')
[ -n "$token" ] || { echo "Could not create a test user: are the test hooks on?" >&2; exit 2; }

docker run --rm --user "$(id -u):$(id -g)" --add-host=host.docker.internal:host-gateway -v "$PWD/${out}:/out" -v "$PWD/tools/contract/schemathesis.toml:/schemathesis.toml:ro" "$image" --config-file /schemathesis.toml run "${inside}/api/openapi.json" \
  --url "${inside}/api/v1" \
  -H "Authorization: Bearer ${token}" \
  --exclude-path-regex '^/(test|pay|metrics)' \
  --max-examples "${MAX_EXAMPLES:-25}" \
  --seed "${SEED:-1}" \
  --exclude-checks positive_data_acceptance \
  --exclude-operation-id deleteUsersMe \
  --report junit --report-dir /out \
  "$@"

#!/usr/bin/env bash
# API probe: sends a fixed set of requests and prints each status, content type and normalised body.
# Diff its output across a change to see exactly which responses moved. It resets the stack, so
# don't run it while tests are running.
#
#   tools/api-probe/probe.sh > after.txt && diff tools/api-probe/baseline-phase0.txt after.txt
#
# The API port comes from API_PORT, else app/.env, else 3000.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
port="${API_PORT:-$(sed -n 's/^API_PORT=//p' "$here/../../app/.env" 2>/dev/null | tail -1)}"
B="http://localhost:${port:-3000}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# A delivery date inside the allowed window (tomorrow to 30 days ahead).
D="$(python3 -c 'import datetime; print(datetime.date.today() + datetime.timedelta(days=5))')"

norm() {
  sed -E \
    -e 's/"(time|createdAt|updatedAt|expiresAt|placedAt|durationMs|accessToken|refreshToken|token|clientSecret|id|frameUrl|orderNumber|resetTime|correlationId)":("[^"]*"|[0-9]+)/"\1":X/g' \
    -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/TS/g' \
    -e 's/^Date: .*/Date: X/' \
    -e 's/^X-Correlation-Id: .*/X-Correlation-Id: X/' \
    -e 's/rule [0-9]+/rule N/g; s/"ruleId":[0-9]+/"ruleId":N/g'
}
p() {
  local label="$1"; shift
  echo "### $label"
  curl -s -g -o "$tmp/body" -w '%{http_code} ct=%{content_type}\n' "$@"
  head -c 600 "$tmp/body" | norm
  echo
}
curl -s -X POST "$B/test/reset" >/dev/null
p health "$B/api/v1/health"
p 404 "$B/api/v1/nope"
p 404-root "$B/nope"
p trailing-slash "$B/api/v1/products/?limit=1"
p case "$B/API/V1/products?limit=1"
p products-nested-query "$B/api/v1/products?limit=1&category[x]=1"
p products-array-query "$B/api/v1/products?limit=1&sort=price&sort=name"
p products-limit "$B/api/v1/products?limit=2&sort=price_asc"
p products-bad-limit "$B/api/v1/products?limit=abc"
p product-bad-id "$B/api/v1/products/abc"
p product-1 "$B/api/v1/products/1"
p head-products -I "$B/api/v1/products/1"
p options -X OPTIONS "$B/api/v1/products"
p login-nobody -X POST "$B/api/v1/auth/login"
p login-textplain -X POST -H 'Content-Type: text/plain' --data 'x' "$B/api/v1/auth/login"
p login-badjson -X POST -H 'Content-Type: application/json' --data '{bad' "$B/api/v1/auth/login"
p login-emptyjson -X POST -H 'Content-Type: application/json' --data '' "$B/api/v1/auth/login"
p login-array -X POST -H 'Content-Type: application/json' --data '[]' "$B/api/v1/auth/login"
python3 -c 'print("{\"a\":\"" + "x"*200000 + "\"}")' > "$tmp/big"
p login-toolarge -X POST -H 'Content-Type: application/json' --data @"$tmp/big" "$B/api/v1/auth/login"
p login-wrong -X POST -H 'Content-Type: application/json' --data '{"email":"customer@playlab.test","password":"nope"}' "$B/api/v1/auth/login"
TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' --data '{"email":"customer@playlab.test","password":"Password123!"}' "$B/api/v1/auth/login" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
A=(-H "Authorization: Bearer $TOKEN")
p me "${A[@]}" "$B/api/v1/auth/me"
p cart-add "${A[@]}" -X POST -H 'Content-Type: application/json' --data '{"productId":1,"quantity":1}' "$B/api/v1/cart/items"
p cart-add-nobody "${A[@]}" -X POST "$B/api/v1/cart/items"
p cart "${A[@]}" "$B/api/v1/cart"
p order-nobody "${A[@]}" -X POST "$B/api/v1/orders"
p order "${A[@]}" -X POST -H 'Content-Type: application/json' --data '{"shipping":{"fullName":"Craig Test","line1":"1 Main St","city":"Dublin","postcode":"D01 F5P2","country":"IE"},"deliveryDate":"'"$D"'","payment":{"cardNumber":"4242424242424242","expiry":"12/30","cvc":"123","nameOnCard":"Craig Test"}}' "$B/api/v1/orders"
p orders-list "${A[@]}" "$B/api/v1/orders?limit=1"
p orders-csv "${A[@]}" "$B/api/v1/orders/export.csv"
p intent-get-bad "${A[@]}" "$B/api/v1/payments/intents/nope?secret=x"
p mailbox "$B/test/mailbox/customer@playlab.test"
p bugs "$B/test/bugs"
p bugs-on -X POST -H 'Content-Type: application/json' --data '{"enable":["wrong-status-code"]}' "$B/test/bugs"
p bug-wrong-status "${A[@]}" -X POST -H 'Content-Type: application/json' --data '{}' "$B/api/v1/cart/items"
curl -s -X DELETE "$B/test/bugs" >/dev/null
p chaos -X POST -H 'Content-Type: application/json' --data '{"path":"/api/v1/categories","failNext":1,"status":503}' "$B/test/chaos"
p chaos-hit "$B/api/v1/categories"
p chaos-miss "$B/api/v1/categories"
curl -s -X DELETE "$B/test/chaos" >/dev/null
p openapi-json "$B/api/openapi.json"
p openapi-yaml "$B/api/openapi.yaml"
p docs "$B/api/docs"
p docs-slash "$B/api/docs/"
p pay-frame "$B/pay/frame"
p stores-suggest "$B/api/v1/stores/suggest?q=dub"
p stores-nearest "$B/api/v1/stores/nearest?lat=53.3&lng=-6.2"
p stock "$B/api/v1/stock?ids=1,2"
p offers "$B/api/v1/offers"
p config "$B/api/v1/config"
curl -s -X POST "$B/test/reset" >/dev/null

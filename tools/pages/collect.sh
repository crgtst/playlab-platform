#!/usr/bin/env bash
# Downloads the latest reports from main's successful pipeline runs into one folder, ready for build-site.mjs and the release gate.
#
#   GH_TOKEN=... tools/pages/collect.sh <out dir> [branch=main]
#
# For each pipeline it finds the newest successful run on the branch and downloads the report artifacts it uploaded. Writes:
#   <out>/site/<section>/...      the reports as they will be published
#   <out>/trace/tests/<suite>/... the same files laid out the way tools/traceability reads them (for the release gate)
#   <out>/site/runs.json          which run each report came from
set -euo pipefail

out="${1:?Usage: collect.sh <out dir> [branch]}"
branch="${2:-main}"
repo="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
mkdir -p "$out/site" "$out/trace/tests"
echo '[]' > "$out/runs.tmp.json"

# workflow file | artifact | site section | traceability suite ("-" when it holds no JUnit)
SOURCES=(
  "playwright.yml|playwright-report|playwright|playwright-ts"
  "postman.yml|newman-reports|newman|postman"
  "karate.yml|karate-reports|karate|karate"
  "rest-assured.yml|rest-assured-reports|rest-assured|rest-assured"
  "smoke.yml|smoke-report|smoke|-"
  "contract.yml|schemathesis-results|contract|-"
  "security.yml|security-owasp|security|security"
  "security.yml|security-zap|zap|-"
  "performance.yml|k6-results|k6|k6"
  "performance.yml|jmeter-results|jmeter|jmeter"
  "nightly.yml|nightly-sweep|nightly|-"
)

# The newest successful run of a workflow on the branch, as "id<TAB>created<TAB>url<TAB>sha". Cached in a file, so each workflow is asked once.
latest_run() {
  local cache="$out/.latest-$1"
  if [ ! -f "$cache" ]; then
    gh run list --repo "$repo" --workflow "$1" --branch "$branch" --status success --limit 1 \
      --json databaseId,createdAt,url,headSha --jq '.[0] // empty | [.databaseId, .createdAt, .url, .headSha] | @tsv' > "$cache" 2>/dev/null || : > "$cache"
  fi
  cat "$cache"
}

for source in "${SOURCES[@]}"; do
  IFS='|' read -r workflow artifact section suite <<< "$source"
  run=$(latest_run "$workflow")
  if [ -z "$run" ]; then echo "skip   $artifact: no successful $workflow run on $branch yet"; continue; fi
  IFS=$'\t' read -r id created url sha <<< "$run"
  dest="$out/site/$section"
  mkdir -p "$dest"
  # An artifact is missing when its step did not run (an `if: failure()` upload on a green run): not an error.
  if gh run download "$id" --repo "$repo" -n "$artifact" -D "$dest" >/dev/null 2>&1; then
    echo "got    $artifact from $workflow run $id"
    if [ "$suite" != "-" ]; then
      mkdir -p "$out/trace/tests/$suite"
      cp -R "$dest/." "$out/trace/tests/$suite/"
    fi
    node -e '
      const fs = require("fs");
      const [file, workflow, artifact, section, id, created, url, sha] = process.argv.slice(1);
      const runs = JSON.parse(fs.readFileSync(file, "utf8"));
      runs.push({ workflow, artifact, section, id, created, url, sha });
      fs.writeFileSync(file, JSON.stringify(runs, null, 2));
    ' "$out/runs.tmp.json" "$workflow" "$artifact" "$section" "$id" "$created" "$url" "$sha"
  else
    echo "skip   $artifact: $workflow run $id has no such artifact"
    rmdir "$dest" 2>/dev/null || true
  fi
done
rm -f "$out"/.latest-*
mv "$out/runs.tmp.json" "$out/site/runs.json"

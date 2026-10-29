#!/usr/bin/env bash
# Applies the merge rule in .github/rulesets/main-gates.json to the repository: a pull request cannot be merged until the required
# checks pass, and main cannot be deleted or force-pushed (PLS-29.1).
#
#   tools/ci/apply-ruleset.sh            # create the rule, or update it if it already exists
#
# Needs admin rights on the repository, and GitHub only allows rulesets on a public repository or a paid plan: on a private repository
# on the free plan GitHub answers "Upgrade to GitHub Pro or make this repository public". Run it when the repository goes public (v1.0.0).
set -euo pipefail
cd "$(dirname "$0")/../.."
node tools/ci/check-ruleset.mjs

repo="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
name=$(node -p "require('./.github/rulesets/main-gates.json').name")
id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null || true)
if [ -n "$id" ]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input .github/rulesets/main-gates.json >/dev/null
  echo "Updated the \"$name\" rule on $repo"
else
  gh api -X POST "repos/$repo/rulesets" --input .github/rulesets/main-gates.json >/dev/null
  echo "Created the \"$name\" rule on $repo"
fi

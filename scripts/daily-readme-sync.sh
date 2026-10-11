#!/usr/bin/env bash
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

max_attempts=3
for attempt in $(seq 1 "$max_attempts"); do
  if ! git fetch origin "$GITHUB_REF"; then
    echo "::error::Could not fetch ${GITHUB_REF}; README sync stopped without changing the remote."
    exit 1
  fi
  git reset --hard FETCH_HEAD

  # Re-read the source on every attempt in case it changed alongside the branch.
  cp -- replit.md README.md

  if git diff --quiet HEAD -- README.md; then
    echo "README.md is already synchronized."
    exit 0
  else
    diff_status=$?
    if [ "$diff_status" -ne 1 ]; then
      exit "$diff_status"
    fi
  fi

  git add -- README.md
  git commit --only README.md -m "chore: sync README from replit.md"

  changed_files="$(git diff-tree --no-commit-id --name-only -r HEAD)"
  if [ "$changed_files" != "README.md" ]; then
    echo "::error::Refusing to push a README sync commit that changes files other than README.md."
    exit 1
  fi

  if git push origin "HEAD:${GITHUB_REF}"; then
    echo "README.md sync pushed successfully."
    exit 0
  fi

  echo "Push attempt ${attempt}/${max_attempts} failed; the next attempt will fetch the latest branch and source."
done

echo "::error::README sync could not push after ${max_attempts} attempts. No remote commits were overwritten."
exit 1

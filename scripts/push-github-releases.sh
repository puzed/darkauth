#!/usr/bin/env bash
set -euo pipefail

for file in changelog/*.md; do
  [ -e "$file" ] || continue
  tag=$(basename "$file" .md)
  if grep -q '^---[[:space:]]*$' "$file"; then
    body=$(awk 'p{print} /^---[[:space:]]*$/{p=1}' "$file" | sed '/./,$!d')
  else
    body=$(cat "$file")
  fi
  remote=$(gh release view "$tag" --json body --jq '.body // ""' || echo "")
  local_norm=$(printf "%s" "$body" | tr -d '\r')
  remote_norm=$(printf "%s" "$remote" | tr -d '\r')
  if [ "${local_norm}" != "${remote_norm}" ]; then
    tmp=$(mktemp)
    printf "%s" "${body}" > "$tmp"
    gh release edit "$tag" --notes-file "$tmp"
    rm -f "$tmp"
  fi
done

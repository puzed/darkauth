#!/usr/bin/env bash
set -euo pipefail
mkdir -p changelog

gh api repos/:owner/:repo/releases --paginate --jq '.[].tag_name' | while read -r tag; do
  file="changelog/${tag}.md"
  body=$(gh release view "$tag" --json body --jq '.body // ""' || echo "")
  body=$(printf "%s" "$body" | sed -e '1{/^---[[:space:]]*$/d;}' -e '1{/^[[:space:]]*$/d;}')
  published=$(gh release view "$tag" --json publishedAt,createdAt --jq '.publishedAt // .createdAt // ""' || echo "")
  date=${published%%T*}
  name=$(gh release view "$tag" --json name --jq '.name // ""' || echo "")
  fallback_title=${tag#v}
  [ -n "$name" ] && title="$name" || title="$fallback_title"
  prerelease=$(gh release view "$tag" --json isPrerelease --jq '.isPrerelease // false' || echo false)
  sha=$(gh api repos/:owner/:repo/commits/"$tag" -q .sha 2>/dev/null | cut -c1-7)
  if [ -z "$sha" ]; then
    printf "%s\n" "Warning: Commit lookup failed for tag '$tag'" 1>&2
    sha="commit lookup failed"
  fi
  if [ "$prerelease" = true ]; then
    reviewed=false
  else
    reviewed=true
  fi
  {
    printf "date: %s\n" "$date"
    printf "title: %s\n" "$title"
    printf "commits: %s\n" "$sha"
    printf "reviewed: %s\n" "$reviewed"
    printf "%s\n\n" "---"
    printf "%s" "$body"
  } > "$file"
done

#!/usr/bin/env bash
set -euo pipefail
mkdir -p changelog

gh api repos/:owner/:repo/releases --paginate --jq '.[].tag_name' | while read -r tag; do
  file="changelog/${tag}.md"
  if [ ! -f "$file" ]; then
    body=$(gh release view "$tag" --json body --jq '.body // ""' || echo "")
    published=$(gh release view "$tag" --json publishedAt,createdAt --jq '.publishedAt // .createdAt // ""' || echo "")
    date=${published%%T*}
    name=$(gh release view "$tag" --json name --jq '.name // ""' || echo "")
    fallback_title=${tag#v}
    [ -n "$name" ] && title="$name" || title="$fallback_title"
    sha=$(gh api repos/:owner/:repo/commits/"$tag" -q .sha 2>/dev/null | cut -c1-7 || echo "")
    {
      printf "date: %s\n" "$date"
      printf "title: %s\n" "$title"
      printf "commits: %s\n" "$sha"
      printf "reviewed: true\n"
      printf "%s\n\n" "---"
      printf "%s" "$body"
    } > "$file"
  else
    name=$(gh release view "$tag" --json name --jq '.name // ""' || echo "")
    fallback_title=${tag#v}
    [ -n "$name" ] && title="$name" || title="$fallback_title"
    tmp=$(mktemp)
    awk -v t="$title" '
      BEGIN{hdr=1; seen_title=0}
      hdr && /^title:[[:space:]]*/ {seen_title=1; print; next}
      hdr && /^version:[[:space:]]*/ {
        if(!seen_title){ sub(/^version:[[:space:]]*/,"title: "); seen_title=1; print }
        next
      }
      hdr && /^---[[:space:]]*$/ { if(!seen_title){ print "title: " t } ; print; hdr=0; next }
      hdr { print; next }
      { print }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
    awk 'BEGIN{hdr=1} hdr && /^version:[[:space:]]*/{next} /^---[[:space:]]*$/ {hdr=0} {print}' "$file" > "$tmp"
    mv "$tmp" "$file"
  fi
done

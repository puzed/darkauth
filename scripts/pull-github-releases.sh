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
    sha=$(gh api repos/:owner/:repo/commits/"$tag" -q .sha 2>/dev/null | cut -c1-7)
    if [ -z "$sha" ]; then
      printf "%s\n" "Warning: Commit lookup failed for tag '$tag'" 1>&2
      sha="commit lookup failed"
    fi
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
    tmp_hdr=$(mktemp)
    tmp_body=$(mktemp)
    awk 'BEGIN{hdr=1} hdr{print} /^---[[:space:]]*$/ {hdr=0; print; exit}' "$file" > "$tmp_hdr"
    awk 'p{print} /^---[[:space:]]*$/{p=1}' "$file" > "$tmp_body"
    if grep -q '^title:[[:space:]]*' "$tmp_hdr"; then
      :
    else
      if grep -q '^version:[[:space:]]*' "$tmp_hdr"; then
        sed '0,/^version:[[:space:]]*/s//title: /' "$tmp_hdr" > "${tmp_hdr}.1"
        mv "${tmp_hdr}.1" "$tmp_hdr"
      else
        awk -v t="$title" '/^---[[:space:]]*$/ { print "title: " t; } { print }' "$tmp_hdr" > "${tmp_hdr}.1"
        mv "${tmp_hdr}.1" "$tmp_hdr"
      fi
    fi
    awk 'BEGIN{hdr=1} hdr && /^version:[[:space:]]*/{next} /^---[[:space:]]*$/ {hdr=0} {print}' "$tmp_hdr" > "${tmp_hdr}.2"
    mv "${tmp_hdr}.2" "$tmp_hdr"
    cat "$tmp_hdr" "$tmp_body" > "$file"
    rm -f "$tmp_hdr" "$tmp_body"
  fi
done

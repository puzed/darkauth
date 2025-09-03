#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="logos/generated"
DEST_DIRS=(
  "packages/admin-ui/public"
  "packages/user-ui/public"
)

if [ ! -d "$SRC_DIR" ]; then
  echo "Source directory not found: $SRC_DIR" >&2
  exit 1
fi

for dest in "${DEST_DIRS[@]}"; do
  mkdir -p "$dest"
  cp -f "$SRC_DIR/favicon.svg" "$dest/"
  cp -f "$SRC_DIR/favicon.ico" "$dest/"
  cp -f "$SRC_DIR/manifest.json" "$dest/"
  rm -rf "$dest/icons"
  mkdir -p "$dest/icons"
  cp -R "$SRC_DIR/icons/." "$dest/icons/"
  echo "Updated icons in $dest"
done

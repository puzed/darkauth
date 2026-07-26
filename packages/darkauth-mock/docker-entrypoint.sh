#!/bin/sh
set -eu

if [ -f "${DARKAUTH_MOCK_CONFIG:-}" ]; then
  node packages/darkauth-mock/src/init.ts
fi
exec su-exec node "$@"

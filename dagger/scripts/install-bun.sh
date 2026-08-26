#!/bin/sh
set -eu

cache_dir="${BUN_INSTALL_CACHE_DIR:-/root/.bun/install/cache}"
timeout_seconds="${BUN_INSTALL_TIMEOUT_SECONDS:-300}"
attempt=1
while [ "$attempt" -le 2 ]; do
  if timeout --signal=TERM --kill-after=10s "${timeout_seconds}s" bun install --frozen-lockfile; then
    exit 0
  fi
  if [ "$attempt" -eq 1 ]; then
    rm -rf node_modules "$cache_dir"
    echo "Bun install attempt failed; cleaning ephemeral state and retrying" >&2
  fi
  attempt=$((attempt + 1))
done
echo "Bun install failed after 2 attempts" >&2
exit 1

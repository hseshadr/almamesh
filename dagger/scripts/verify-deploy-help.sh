#!/usr/bin/env bash
set -euo pipefail

actual="$({
  sed $'s/\033\\[[0-9;]*m//g' |
    sed -n 's/^[[:space:]]*\(--[a-z0-9-]*\)[[:space:]].*/\1/p' |
    LC_ALL=C sort
})"
expected="$(LC_ALL=C sort <<'EOF'
--bundle-private-key-b-64
--bundle-public-key-b-64
--cloudflare-account-id
--cloudflare-api-token
--expected-sha
--github-token
--run-attempt
--workflow-run-id
EOF
)"

if [[ "$actual" != "$expected" ]]; then
  printf 'generated deploy CLI arguments differ\nexpected:\n%s\nactual:\n%s\n' \
    "$expected" "$actual" >&2
  exit 1
fi

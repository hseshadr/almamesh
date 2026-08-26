#!/bin/sh
set -eu

source_root="${SOURCE_ROOT:-/workspace}"
history_root="${HISTORY_ROOT:-/tmp/almamesh-history}"
repository_url="${ALMAMESH_REPOSITORY_URL:-https://github.com/hseshadr/almamesh.git}"
config="$source_root/.gitleaks.toml"

gitleaks dir "$source_root" --config "$config" --redact --no-banner --no-color
rm -rf "$history_root"
git clone --quiet --mirror "$repository_url" "$history_root"
gitleaks git "$history_root" --config "$config" --redact --no-banner --no-color

test -z "$(find "$source_root/backend" -maxdepth 1 \( -name 'keys*' -o -name 'origin*' \) -print -quit)"

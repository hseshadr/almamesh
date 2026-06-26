#!/usr/bin/env bash
# Compute a real sidereal Vedic chart entirely on your machine.
# No network, no account, no API key — the deterministic calc core runs locally
# via the edge-proc chart runtime. Same birth moment always yields the same chart.
#
#   bash examples/run_chart.sh
#
# Override the birth data by passing: <ISO-8601-UTC> <latitude> <longitude>
set -euo pipefail

cd "$(dirname "$0")/../backend"

DATETIME="${1:-1990-01-15T12:00:00+00:00}"
LATITUDE="${2:-40.7128}"
LONGITUDE="${3:--74.0060}"

echo "Computing sidereal chart for ${DATETIME} @ (${LATITUDE}, ${LONGITUDE}) — offline…" >&2
uv run almamesh-chart "${DATETIME}" "${LATITUDE}" "${LONGITUDE}"

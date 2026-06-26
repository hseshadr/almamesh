"""Offline chart CLI — birth data to a deterministic sidereal chart.

No network, no account, no API key: the calc core runs on-device via the
edge-proc chart runtime. This is the runnable proof of the local-first core.

    almamesh-chart 1990-01-15T12:00:00+00:00 40.7128 -74.0060
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence

from edgeproc import PrivacyMode, Task, TaskKind

from almamesh.edge import build_chart_engine


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="almamesh-chart",
        description="Compute a sidereal Vedic chart locally — no network, no account, no API key.",
    )
    parser.add_argument(
        "datetime_utc", help="Birth datetime, ISO-8601 UTC (e.g. 1990-01-15T12:00:00+00:00)"
    )
    parser.add_argument("latitude", type=float, help="Birth latitude in decimal degrees")
    parser.add_argument("longitude", type=float, help="Birth longitude in decimal degrees")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    task = Task(
        kind=TaskKind.DETERMINISTIC,
        payload={
            "datetime_utc": args.datetime_utc,
            "latitude": args.latitude,
            "longitude": args.longitude,
        },
        privacy_mode=PrivacyMode.LOCAL_ONLY,
    )
    result = asyncio.run(build_chart_engine().run(task))
    if not result.success:
        print(f"error: {result.error}", file=sys.stderr)
        return 1
    print(json.dumps(result.payload["chart"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

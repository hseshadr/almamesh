"""Golden parity regression for the transit engine (DE421 + pinned instant).

Mirrors test_chart_golden.py: the in-browser Pyodide engine must produce transit
output byte-identical to CPython. We pin a fixed `transit_instant` (analogous to
FIXED_REFERENCE_DATE) and canonicalize floats to 6 decimals so trivial last-bit
noise never trips the guard. The natal goldens are untouched — TransitContext is a
SEPARATE object, never nested in SiderealContext.

Regenerate (only on an intentional engine change):
    uv run python -m tests.test_transit_golden
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from almamesh.calculations import PlanetName, calculate_sidereal_context
from almamesh.schemas.astrology import SiderealContext
from almamesh.transits import calculate_transit_context

# Pinned transit instant — every fixture computes transits "as of" this moment.
FIXED_TRANSIT_INSTANT = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)
# Reproducible natal maha dasha (the chart's reference_date).
FIXED_REFERENCE_DATE = datetime(2024, 1, 1, 0, 0, 0, tzinfo=UTC)

# (iso birth, lat, lon) — a parity-clean subset of the natal canonical fixtures.
FIXTURES: list[tuple[str, float, float]] = [
    ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090),  # Delhi
    ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060),  # NYC
    ("2019-11-09T17:45:00+00:00", 35.6895, 139.6917),  # Tokyo (+09:00 instant)
]

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "transit_golden_de421.json"


def _canonicalize(value: object) -> object:
    """Recursively round floats to 6 decimals; preserve bool; sort dict keys."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _natal(iso_dt: str, lat: float, lon: float) -> SiderealContext:
    """The natal chart for one fixture (fixed reference_date)."""
    dt_utc = datetime.fromisoformat(iso_dt)
    return calculate_sidereal_context(dt_utc, lat, lon, reference_date=FIXED_REFERENCE_DATE)


def _canonical_transit(iso_dt: str, lat: float, lon: float) -> object:
    """Canonicalized JSON dump of one fixture's TransitContext at the pinned instant."""
    natal = _natal(iso_dt, lat, lon)
    birth = datetime.fromisoformat(iso_dt)
    ctx = calculate_transit_context(natal, birth, transit_instant=FIXED_TRANSIT_INSTANT)
    return _canonicalize(ctx.model_dump(mode="json"))


def _load_golden() -> dict[str, object]:
    loaded = json.loads(GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


def test_all_transit_fixtures_match_golden() -> None:
    """Every fixture's canonicalized TransitContext equals the committed golden."""
    golden = _load_golden()
    for iso_dt, lat, lon in FIXTURES:
        assert _canonical_transit(iso_dt, lat, lon) == golden[iso_dt]


def test_delhi_transit_is_astrologically_sane() -> None:
    """Human-sanity guard: a silently-wrong transit engine would shift these."""
    natal = _natal(*FIXTURES[0])
    birth = datetime.fromisoformat(FIXTURES[0][0])
    ctx = calculate_transit_context(natal, birth, transit_instant=FIXED_TRANSIT_INSTANT)
    # Delhi-1990 Moon is in Leo; Saturn (Pisces) is the 8th from it -> not Sade Sati.
    assert ctx.sade_sati.is_active is False
    # The active maha lord matches the natal chart's own current maha at the instant.
    assert natal.dashas.current_maha is not None
    assert ctx.fusion.maha_lord == natal.dashas.current_maha.lord.value
    assert ctx.gochara.placements[PlanetName.SATURN].sign == "Pisces"


def _generate_golden() -> None:
    """Regenerate the committed golden from the oracle (run via __main__)."""
    golden = {iso: _canonical_transit(iso, lat, lon) for iso, lat, lon in FIXTURES}
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {GOLDEN_PATH} ({GOLDEN_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    _generate_golden()

"""Golden parity + determinism regression for the Shodasavarga engine (DE421).

Mirrors test_transit_golden.py: the in-browser Pyodide engine must produce varga
output byte-identical to CPython. The natal goldens are untouched — VargaContext
is a SEPARATE object, never nested in SiderealContext. Floats are canonicalized
to 6 decimals (here only the Vimshopaka scores) so trivial last-bit noise never
trips the guard. A determinism re-run asserts the same inputs give the same bytes.

Regenerate (only on an intentional engine change):
    uv run python -m tests.test_varga_golden
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from almamesh.calculations import calculate_sidereal_context
from almamesh.schemas.astrology import SiderealContext
from almamesh.vargas import compute_varga_context

# Pinned reference_date so each fixture's natal dasha (and thus chart) is fixed.
FIXED_REFERENCE_DATE = datetime.fromisoformat("2026-01-01T00:00:00+00:00")

# (iso birth, lat, lon). Synthetic reference native (06:44 IST == 01:14Z, a
# Cancer/Leo cusp birth) + two canonical fixtures (Delhi, NYC).
FIXTURES: list[tuple[str, float, float]] = [
    ("1988-08-08T01:14:00+00:00", 12.9716, 77.5946),  # Bengaluru (reference native)
    ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090),  # Delhi
    ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060),  # NYC
]

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "varga_golden_de421.json"


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
    dt_utc = datetime.fromisoformat(iso_dt)
    return calculate_sidereal_context(dt_utc, lat, lon, reference_date=FIXED_REFERENCE_DATE)


def _canonical_varga(iso_dt: str, lat: float, lon: float) -> object:
    """Canonicalized JSON dump of one fixture's VargaContext."""
    ctx = compute_varga_context(_natal(iso_dt, lat, lon))
    return _canonicalize(ctx.model_dump(mode="json"))


def _load_golden() -> dict[str, object]:
    loaded = json.loads(GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


def test_all_varga_fixtures_match_golden() -> None:
    """Every fixture's canonicalized VargaContext equals the committed golden."""
    golden = _load_golden()
    for iso_dt, lat, lon in FIXTURES:
        assert _canonical_varga(iso_dt, lat, lon) == golden[iso_dt]


def test_varga_context_is_deterministic_on_rerun() -> None:
    """Same inputs -> byte-identical VargaContext across two independent runs."""
    for iso_dt, lat, lon in FIXTURES:
        assert _canonical_varga(iso_dt, lat, lon) == _canonical_varga(iso_dt, lat, lon)


def test_reference_native_d1_lagna_is_leo() -> None:
    """Human-sanity anchor: the reference native's D1 lagna is Leo (the cusp value)."""
    golden = _load_golden()
    reference = golden[FIXTURES[0][0]]
    assert isinstance(reference, dict)
    charts = reference["charts"]
    assert isinstance(charts, dict)
    assert charts["D1"]["lagna_sign"] == "Leo"


def _generate_golden() -> None:
    """Regenerate the committed golden from the oracle (run via __main__)."""
    golden = {iso: _canonical_varga(iso, lat, lon) for iso, lat, lon in FIXTURES}
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {GOLDEN_PATH} ({GOLDEN_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    _generate_golden()

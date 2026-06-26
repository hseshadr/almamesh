"""Generate the INDEPENDENT transit reference oracle (astropy, NOT the engine).

Tier-1 cross-check for the predictive transit engine, mirroring
`generate_reference_fixtures.py`:

  * Transit longitudes of all grahas on a fixed UTC date — astropy
    `get_body` + `GeocentricTrueEcliptic(equinox=t)` true-apparent geocentric
    ecliptic-of-date longitude, minus the engine's published Lahiri ayanamsa, on
    the SAME local DE421 (offline, no network, no Swiss Ephemeris). This is the
    exact method already CONFIRMED for the natal Delhi Sun (0.045 arcsec vs JPL
    Horizons; see reference_fixtures.json._provenance).

The published-panchanga ingress / Sade-Sati / return DATES are committed
separately (hand-entered with citations) in the test, not regenerated here, since
they come from third-party tables, not astropy.

    uv run python tools/generate_transit_reference_fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

from astropy import units as u
from astropy.coordinates import GeocentricTrueEcliptic, get_body, solar_system_ephemeris
from astropy.time import Time
from astropy.utils import iers

from almamesh.calculations import ayanamsa_calc

iers.conf.auto_download = False
_LOCAL_DE421 = Path("~/.skyfield-data/de421.bsp").expanduser()
_VENDORED_DE421 = Path(__file__).resolve().parents[1] / "de421.bsp"
_OUT = (
    Path(__file__).resolve().parents[1] / "tests" / "validation" / "transit_reference_fixtures.json"
)

# Fixed transit instant (well inside DE421; the gochara golden uses the same).
_TRANSIT_ISO = "2026-06-09T12:00:00+00:00"

# astropy body name -> engine planet key (matches the PlanetName enum values).
_BODIES = {
    "sun": "sun",
    "moon": "moon",
    "mars": "mars",
    "mercury": "mercury",
    "jupiter": "jupiter",
    "venus": "venus",
    "saturn": "saturn",
}


def _ephemeris_path() -> str:
    """The DE421 astropy should load (prefer the offline vendored copy)."""
    return str(_VENDORED_DE421 if _VENDORED_DE421.exists() else _LOCAL_DE421)


def _engine_ayanamsa(t: Time) -> float:
    """The engine's Lahiri ayanamsa at the instant (its own lookup table).

    The table is keyed by a TT Julian date; astropy exposes it as `t.tt.jd`.
    """
    return float(ayanamsa_calc.get_ayanamsa(t.tt.jd))


def _apparent_tropical(body: str, t: Time) -> float:
    """True apparent geocentric ecliptic-of-date longitude (deg) via astropy."""
    ecl = get_body(body, t).transform_to(GeocentricTrueEcliptic(equinox=t))
    return float(ecl.lon.to_value(u.deg)) % 360.0


def _sidereal_longitudes(t: Time, ayanamsa: float) -> dict[str, float]:
    """Independent sidereal longitudes for the seven standard grahas."""
    return {
        key: round((_apparent_tropical(body, t) - ayanamsa) % 360.0, 6)
        for body, key in _BODIES.items()
    }


def _build_document() -> dict[str, object]:
    """Assemble the committed transit-reference document with provenance."""
    t = Time(_TRANSIT_ISO.replace("+00:00", ""), scale="utc")
    ayanamsa = _engine_ayanamsa(t)
    return {
        "_provenance": {
            "oracle": "astropy get_body + GeocentricTrueEcliptic (true apparent), "
            "independent of Skyfield; SAME local DE421; no Swiss Ephemeris.",
            "sidereal_convention": "apparent_ecliptic_of_date minus engine Lahiri ayanamsa",
            "transit_instant": _TRANSIT_ISO,
            "ephemeris": "de421.bsp (vendored, offline)",
        },
        "transit_instant": _TRANSIT_ISO,
        "ayanamsa": round(ayanamsa, 6),
        "longitudes": _sidereal_longitudes(t, ayanamsa),
    }


def main() -> None:
    """Write the committed transit reference fixtures JSON."""
    with solar_system_ephemeris.set(_ephemeris_path()):
        document = _build_document()
    _OUT.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {_OUT} ({_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

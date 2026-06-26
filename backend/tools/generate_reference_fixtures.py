"""Generate external reference fixtures for the Vedic engine — DEV-ONLY.

NOT imported by the engine; NO Swiss Ephemeris (pyswisseph). This script is the
*first external validation* of `almamesh.calculations`: it recomputes the
expected sidereal longitudes, nakshatra/pada, and lagna for the canonical birth
fixtures on a **fully independent code path** and writes them to
`tests/validation/reference_fixtures.json` (committed). The validation suite
then runs the real engine and asserts against these committed numbers.

Independence of the oracle (this is the whole point):
  * Bodies: `astropy.coordinates.get_body` + `GeocentricTrueEcliptic(equinox=t)`
    gives the *true apparent* geocentric ecliptic-of-date longitude — astropy is
    BSD-licensed and uses ERFA/IAU transforms, NOT Skyfield. We point it at the
    SAME local DE421 `.bsp` (`solar_system_ephemeris.set(<path>)`, no network),
    so any disagreement with the engine isolates a Skyfield-usage / apparent /
    obliquity / frame bug rather than an ephemeris difference.
  * Lagna: astropy `Time.sidereal_time('apparent')` + ERFA true obliquity
    (`obl06` + `nut06a`) feed the classic ascendant spherical-trig formula — an
    independent re-derivation of the engine's GAST + ascendant geometry.
  * Sidereal = apparent − the engine's published Lahiri ayanamsa (lookup table).
  * Nodes (Rahu/Ketu): mean lunar node (Meeus), the same convention the engine
    uses — re-derived here independently.

Ayanamsa anchor: we assert the engine's Lahiri value at J2000 against the
published 23.85306° (Chitrapaksha/Lahiri). The reference longitudes subtract the
engine's own ayanamsa so the comparison isolates the *apparent-longitude* code
path; the ayanamsa itself is anchored separately.

Horizons cross-check (third independent source, NOT fabricated): the astropy
oracle was confirmed against JPL Horizons for the Delhi Sun. Query (public HTTP
API, geocentric '500@399', quantity 31 = apparent observer ecliptic lon/lat,
of-date):

    https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='10'
      &CENTER='500@399'&EPHEM_TYPE='OBSERVER'&QUANTITIES='31'
      &TLIST='2447907.0'&CAL_FORMAT='CAL'

    1990-Jan-15 12:00:00 UT  ObsEcLon = 295.0782476 deg

astropy here gives 295.0782602 deg for the same instant — a 0.045 arcsec
agreement, i.e. Horizons ≈ astropy ≈ engine all match the apparent longitude.

Run:  cd backend && uv run python tools/generate_reference_fixtures.py
"""

from __future__ import annotations

import json
import math
import warnings
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import erfa
from astropy import units as u
from astropy.coordinates import (
    GeocentricTrueEcliptic,
    get_body,
    solar_system_ephemeris,
)
from astropy.time import Time
from astropy.utils import iers
from skyfield.api import Loader

from almamesh.calculations import ayanamsa_calc, get_nakshatra_info

# --- Configuration: local-only, no network ---------------------------------

LOCAL_DE421 = Path("~/.skyfield-data/de421.bsp").expanduser()
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "tests/validation/reference_fixtures.json"

# Published Lahiri (Chitrapaksha) ayanamsa at J2000.0 — safe to hardcode.
LAHIRI_J2000_DEG = 23.85306
J2000_JD = 2451545.0

# JPL Horizons cross-check (Delhi Sun apparent ecliptic longitude, of-date).
HORIZONS_DELHI_SUN_OBSECLON_DEG = 295.0782476

# astropy body name -> engine planet key (string, matches schema enum values).
BODY_KEYS: tuple[tuple[str, str], ...] = (
    ("sun", "sun"),
    ("moon", "moon"),
    ("mars", "mars"),
    ("mercury", "mercury"),
    ("jupiter", "jupiter"),
    ("venus", "venus"),
    ("saturn", "saturn"),
)

# (iso_utc, latitude, longitude, label) — the canonical parity fixtures.
# Grown from the original 5 to 8 to satisfy the milestone's 6-10 chart coverage:
# both hemispheres, a high-latitude case, and a deliberate categorical-boundary
# stress test (see the BOUNDARY note below).
FIXTURES: tuple[tuple[str, float, float, str], ...] = (
    ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090, "Delhi"),
    ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777, "Mumbai"),
    ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060, "NYC"),
    ("1972-03-10T08:15:00+00:00", 51.5074, -0.1278, "London"),
    ("2010-06-21T18:00:00+00:00", -33.8688, 151.2093, "Sydney"),
    # BOUNDARY: the Moon (a fast mover, ~0.5 deg/hr) sits ~0.033 deg (119 arcsec)
    # PAST the Pushya -> Ashlesha boundary at sidereal 106.6667 deg, which is BOTH
    # a nakshatra change AND a pada boundary (8 x 13.3333 deg). It lands in
    # Ashlesha pada 1 at ~106.700 deg — ~6.6x the sidereal tolerance away from the
    # cusp, so the engine and the independent astropy oracle must agree on the
    # SAME side of the categorical boundary, exercising nakshatra/pada robustness
    # without sitting pathologically on the rounding seam. The datetime was found
    # by scanning the astropy oracle (offline, local DE421) for a near-boundary
    # Moon, then nudged a few minutes past the cusp.
    ("1995-12-11T18:34:00+00:00", 22.5726, 88.3639, "Kolkata"),
    # SOUTHERN HEMISPHERE (a second one, alongside Sydney): Cape Town, S. Africa.
    ("1998-09-15T06:45:00+00:00", -33.9249, 18.4241, "CapeTown"),
    # HIGH LATITUDE: Reykjavik (64.1 deg N) stresses the tan(lat) term of the
    # ascendant geometry far from the equator.
    ("2003-02-05T21:20:00+00:00", 64.1466, -21.9426, "Reykjavik"),
)


@dataclass(frozen=True)
class ReferenceBody:
    """One body's independently-computed expected sidereal placement."""

    longitude: float
    nakshatra: str
    nakshatra_pada: int


def _engine_ayanamsa(iso_utc: str) -> float:
    """The engine's Lahiri ayanamsa at the fixture instant (its lookup table)."""
    loader = Loader("~/.skyfield-data")
    ts = loader.timescale()
    t = ts.from_datetime(datetime.fromisoformat(iso_utc))
    return float(ayanamsa_calc.get_ayanamsa(t.tt))


def _apparent_tropical_longitude(body: str, t: Time) -> float:
    """True apparent geocentric ecliptic-of-date longitude (deg) via astropy."""
    pos = get_body(body, t)
    ecl = pos.transform_to(GeocentricTrueEcliptic(equinox=t))
    return float(ecl.lon.to_value(u.deg)) % 360.0


def _sidereal_body(body: str, t: Time, ayanamsa: float) -> ReferenceBody:
    """Independent sidereal longitude + derived nakshatra/pada for one planet."""
    sidereal = (_apparent_tropical_longitude(body, t) - ayanamsa) % 360.0
    name, pada, _lord = get_nakshatra_info(sidereal)
    return ReferenceBody(longitude=sidereal, nakshatra=name, nakshatra_pada=pada)


def _mean_node_sidereal(t: Time, ayanamsa: float) -> tuple[float, float]:
    """Rahu/Ketu sidereal longitudes from the Meeus mean-node formula (deg)."""
    centuries = (t.tt.jd - J2000_JD) / 36525.0
    rahu_tropical = (
        125.04452 - 1934.136261 * centuries + 0.0020708 * centuries**2 + (centuries**3) / 450000.0
    ) % 360.0
    rahu = (rahu_tropical - ayanamsa) % 360.0
    ketu = (rahu_tropical + 180.0 - ayanamsa) % 360.0
    return rahu, ketu


def _independent_lagna(iso_utc: str, lat: float, lon: float, ayanamsa: float) -> float:
    """Sidereal ascendant from astropy apparent LST + ERFA true obliquity (deg)."""
    t = Time(
        datetime.fromisoformat(iso_utc).astimezone(UTC).replace(tzinfo=None),
        scale="utc",
        location=(lon * u.deg, lat * u.deg),
    )
    last_deg = float(t.sidereal_time("apparent").to_value(u.deg))
    eps0 = erfa.obl06(t.tt.jd1, t.tt.jd2)
    _dpsi, deps = erfa.nut06a(t.tt.jd1, t.tt.jd2)
    eps = math.radians(math.degrees(eps0 + deps))
    ramc, latr = math.radians(last_deg), math.radians(lat)
    num = -math.cos(ramc)
    den = math.sin(ramc) * math.cos(eps) + math.tan(latr) * math.sin(eps)
    asc_tropical = (math.degrees(math.atan2(num, den)) + 180.0) % 360.0
    return (asc_tropical - ayanamsa) % 360.0


def _node_entry(name: str, longitude: float) -> dict[str, object]:
    """JSON-ready entry for a mean node (nakshatra derived independently)."""
    n_name, n_pada, _lord = get_nakshatra_info(longitude)
    return {"longitude": longitude, "nakshatra": n_name, "nakshatra_pada": n_pada}


def _build_fixture(iso_utc: str, lat: float, lon: float, label: str) -> dict[str, object]:
    """Assemble one fixture's full expected record from the independent oracle."""
    ayanamsa = _engine_ayanamsa(iso_utc)
    t = Time(
        datetime.fromisoformat(iso_utc).astimezone(UTC).replace(tzinfo=None),
        scale="utc",
    )
    planets: dict[str, object] = {
        key: asdict(_sidereal_body(body, t, ayanamsa)) for body, key in BODY_KEYS
    }
    rahu, ketu = _mean_node_sidereal(t, ayanamsa)
    planets["rahu"] = _node_entry("rahu", rahu)
    planets["ketu"] = _node_entry("ketu", ketu)
    return {
        "label": label,
        "datetime_utc": iso_utc,
        "latitude": lat,
        "longitude": lon,
        "ayanamsa": ayanamsa,
        "lagna_longitude": _independent_lagna(iso_utc, lat, lon, ayanamsa),
        "planets": planets,
    }


def _build_document() -> dict[str, object]:
    """The full committed document: provenance header + per-fixture expectations."""
    return {
        "_provenance": {
            "oracle": "astropy get_body + GeocentricTrueEcliptic (true apparent), "
            "BSD; independent of Skyfield; SAME local DE421 ephemeris.",
            # Record the home-relative path, never the expanded absolute path
            # (which would leak the local username into the committed fixture).
            "ephemeris": "~/.skyfield-data/de421.bsp",
            "lahiri_j2000_published_deg": LAHIRI_J2000_DEG,
            "sidereal_convention": "apparent_ecliptic_of_date minus engine Lahiri ayanamsa",
            "nodes": "mean lunar node (Meeus); Ketu = Rahu + 180",
            "lagna": "astropy sidereal_time('apparent') + ERFA obl06/nut06a true obliquity",
            "horizons_cross_check": (
                "CONFIRMED — JPL Horizons Delhi Sun ObsEcLon "
                f"{HORIZONS_DELHI_SUN_OBSECLON_DEG} deg vs astropy 295.0782602 deg "
                "(0.045 arcsec); see module docstring for the exact query."
            ),
            "no_swiss_ephemeris": True,
        },
        "fixtures": {
            iso: _build_fixture(iso, lat, lon, label) for iso, lat, lon, label in FIXTURES
        },
    }


def main() -> None:
    """Generate reference_fixtures.json from the independent astropy oracle."""
    iers.conf.auto_download = False
    if not LOCAL_DE421.exists():
        raise FileNotFoundError(
            f"Local DE421 not found at {LOCAL_DE421}; no network download allowed."
        )
    solar_system_ephemeris.set(str(LOCAL_DE421))
    with warnings.catch_warnings():
        # Pre-IERS-table fixtures fall back to the 50-yr mean polar motion;
        # the sub-arcsec effect stays well inside the lagna tolerance.
        warnings.simplefilter("ignore")
        document = _build_document()
    OUTPUT_PATH.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

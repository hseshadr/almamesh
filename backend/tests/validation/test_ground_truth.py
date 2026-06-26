"""External-reference validation of the real engine (first independent check).

Each canonical fixture is run through the REAL `calculate_sidereal_context` and
asserted against committed values produced on a fully independent code path —
astropy `get_body` + `GeocentricTrueEcliptic` (true apparent, BSD-licensed,
ERFA/IAU transforms) against the SAME local DE421 ephemeris (see
`tools/generate_reference_fixtures.py`). A failure here is a genuine correctness
finding, not flaky noise: the oracle shares no astronomy code with Skyfield.

Because the engine and the oracle both use true-apparent geocentric
ecliptic-of-date longitudes on the same ephemeris, agreement is at the
arcsecond level (measured max ~0.05 arcsec on planets), so the sidereal
tolerance is tight.

Tolerances:
  * ayanamsa anchor (J2000)  +-0.001 deg  (IAU2006 get_ayanamsa vs published)
  * per-fixture ayanamsa      +-0.001 deg  (engine table vs reference)
  * sidereal longitude        +-0.005 deg  (7 planets + mean Rahu/Ketu)
  * nakshatra + pada          EXACT
  * lagna                     +-0.05 deg
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from almamesh.calculations import (
    PlanetName,
    calculate_sidereal_context,
    get_ayanamsa,
)
from almamesh.schemas.astrology import SiderealContext
from tests.validation.comparators import normalize_longitude
from tests.validation.reference_fixtures_loader import (
    ExternalReferenceFixtures,
    ReferenceChart,
)

# Fixed so the (dasha-dependent) chart is reproducible; longitudes are unaffected.
FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

# Tolerances in degrees.
AYANAMSA_TOL = 0.001
SIDEREAL_TOL = 0.005
LAGNA_TOL = 0.05

LAHIRI_J2000_PUBLISHED = 23.85306
J2000_JD = 2451545.0

_FIXTURES = ExternalReferenceFixtures()
_INSTANTS = _FIXTURES.keys()


def _angular_delta(a: float, b: float) -> float:
    """Smallest absolute separation between two longitudes (deg, wrap-safe)."""
    return abs((normalize_longitude(a) - normalize_longitude(b) + 180.0) % 360.0 - 180.0)


def _engine_chart(reference: ReferenceChart) -> SiderealContext:
    """Run the real engine for one fixture with the fixed reference date."""
    dt = datetime.fromisoformat(reference.datetime_utc)
    return calculate_sidereal_context(
        dt, reference.latitude, reference.longitude, reference_date=FIXED_REFERENCE_DATE
    )


def test_no_swiss_ephemeris_in_provenance() -> None:
    """The reference oracle must be license-clean (no Swiss Ephemeris)."""
    assert _FIXTURES.provenance["no_swiss_ephemeris"] is True


def test_lahiri_ayanamsa_anchored_at_j2000() -> None:
    """The rigorous IAU2006 Lahiri ayanamsa at J2000 == published 23.85306 deg."""
    value = get_ayanamsa(J2000_JD)
    assert _angular_delta(value, LAHIRI_J2000_PUBLISHED) < AYANAMSA_TOL


@pytest.mark.parametrize("iso", _INSTANTS)
def test_ayanamsa_matches_reference(iso: str) -> None:
    """Engine ayanamsa equals the committed reference for each fixture."""
    reference = _FIXTURES.chart(iso)
    chart = _engine_chart(reference)
    assert _angular_delta(chart.ayanamsa_value, reference.ayanamsa) < AYANAMSA_TOL


@pytest.mark.parametrize("iso", _INSTANTS)
def test_sidereal_longitudes_match_reference(iso: str) -> None:
    """Each planet's sidereal longitude is within tolerance of the oracle."""
    reference = _FIXTURES.chart(iso)
    chart = _engine_chart(reference)
    for key, expected in reference.planets.items():
        actual = chart.planets[PlanetName(key)].longitude
        delta = _angular_delta(actual, expected.longitude)
        assert delta < SIDEREAL_TOL, (
            f"{iso} {key}: engine={actual:.5f} ref={expected.longitude:.5f} "
            f"delta={delta * 3600:.2f} arcsec exceeds {SIDEREAL_TOL} deg"
        )


@pytest.mark.parametrize("iso", _INSTANTS)
def test_nakshatra_and_pada_match_exactly(iso: str) -> None:
    """Nakshatra name and pada match the oracle EXACTLY for every body."""
    reference = _FIXTURES.chart(iso)
    chart = _engine_chart(reference)
    for key, expected in reference.planets.items():
        position = chart.planets[PlanetName(key)]
        assert position.nakshatra == expected.nakshatra, f"{iso} {key} nakshatra"
        assert position.nakshatra_pada == expected.nakshatra_pada, f"{iso} {key} pada"


@pytest.mark.parametrize("iso", _INSTANTS)
def test_lagna_matches_reference(iso: str) -> None:
    """The ascendant matches the independently-derived oracle lagna."""
    reference = _FIXTURES.chart(iso)
    chart = _engine_chart(reference)
    delta = _angular_delta(chart.lagna.longitude, reference.lagna_longitude)
    assert delta < LAGNA_TOL, (
        f"{iso} lagna: engine={chart.lagna.longitude:.5f} "
        f"ref={reference.lagna_longitude:.5f} delta={delta * 3600:.2f} arcsec"
    )

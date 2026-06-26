"""Apparent-position correctness for planetary longitudes.

Astrometric positions omit aberration (~20") and light deflection. Vedic
charts require the *apparent* position (true ecliptic & equinox of date), so
the engine must call ``.apparent()`` before reading ecliptic longitude. These
tests pin that behavior down with measurable, physics-based bounds rather than
brittle numeric snapshots.
"""

from datetime import UTC, datetime

import pytest

from almamesh.calculations import (
    SkyfieldAstronomy,
    ayanamsa_calc,
    calculate_sidereal_context,
)
from almamesh.constants.astrology import PlanetName

# A fixed instant keeps the assertions reproducible (no wall-clock drift).
_WHEN = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
_LAT = 40.7128
_LON = -74.0060


@pytest.fixture
def astro() -> SkyfieldAstronomy:
    return SkyfieldAstronomy()


def test_stored_sun_longitude_is_apparent_minus_ayanamsa(astro: SkyfieldAstronomy) -> None:
    """The engine's sidereal Sun = apparent_tropical - ayanamsa (within 1e-6 deg)."""
    context = calculate_sidereal_context(_WHEN, _LAT, _LON)
    t = astro.ts.from_datetime(_WHEN)
    ayanamsa = ayanamsa_calc.get_ayanamsa(t.tt)

    apparent_tropical = astro._apparent_tropical_longitude("sun", _WHEN)
    expected_sidereal = (apparent_tropical - ayanamsa) % 360

    stored = context.planets[PlanetName.SUN].longitude
    assert abs(((stored - expected_sidereal + 180) % 360) - 180) < 1e-6


def test_apparent_differs_from_astrometric_by_aberration_order(
    astro: SkyfieldAstronomy,
) -> None:
    """Apparent vs astrometric Sun longitude differs by the aberration order (~20")."""
    apparent = astro._apparent_tropical_longitude("sun", _WHEN)
    astrometric = astro._astrometric_tropical_longitude("sun", _WHEN)

    delta = abs(((apparent - astrometric + 180) % 360) - 180)
    assert 0.001 < delta < 0.05


def test_all_bodies_have_apparent_helper_agreement(astro: SkyfieldAstronomy) -> None:
    """Every standard body the engine stores is the apparent (not astrometric) value."""
    context = calculate_sidereal_context(_WHEN, _LAT, _LON)
    t = astro.ts.from_datetime(_WHEN)
    ayanamsa = ayanamsa_calc.get_ayanamsa(t.tt)
    targets = {
        PlanetName.SUN: "sun",
        PlanetName.MOON: "moon",
        PlanetName.MARS: "mars barycenter",
        PlanetName.MERCURY: "mercury barycenter",
        PlanetName.JUPITER: "jupiter barycenter",
        PlanetName.VENUS: "venus barycenter",
        PlanetName.SATURN: "saturn barycenter",
    }
    for name, target in targets.items():
        apparent = astro._apparent_tropical_longitude(target, _WHEN)
        expected = (apparent - ayanamsa) % 360
        stored = context.planets[name].longitude
        assert abs(((stored - expected + 180) % 360) - 180) < 1e-6

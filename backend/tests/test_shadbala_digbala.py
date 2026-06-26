"""Digbala (directional strength) — the BPHS maxima per graha.

A graha has full Digbala (60 Virupas) in its strong direction's angle and zero at
the opposite angle, tapering linearly with the longitudinal distance from the
point of maximum strength. Strong points (whole-sign house of maximum strength):
Jupiter/Mercury -> 1st (East), Sun/Mars -> 10th (South), Saturn -> 7th (West),
Moon/Venus -> 4th (North).
"""

from __future__ import annotations

import pytest

from almamesh.constants.astrology import PlanetName
from almamesh.strength.digbala import DIG_MAX_HOUSE, digbala_virupas


@pytest.mark.parametrize(
    ("planet", "house"),
    [
        (PlanetName.JUPITER, 1),
        (PlanetName.MERCURY, 1),
        (PlanetName.SUN, 10),
        (PlanetName.MARS, 10),
        (PlanetName.SATURN, 7),
        (PlanetName.MOON, 4),
        (PlanetName.VENUS, 4),
    ],
)
def test_should_define_the_classical_direction_of_maximum_strength(
    planet: PlanetName, house: int
) -> None:
    # Then each graha's point of full Digbala is its classical house
    assert DIG_MAX_HOUSE[planet] == house


def test_should_award_full_digbala_at_the_strong_angle() -> None:
    # Given Jupiter exactly on the strong point (1st-house cusp = lagna longitude)
    # When Digbala is computed with the planet on its maximum point
    bala = digbala_virupas(PlanetName.JUPITER, planet_longitude=100.0, lagna_longitude=100.0)
    # Then it earns the full 60 Virupas
    assert bala.virupas == pytest.approx(60.0, abs=1e-9)


def test_should_award_zero_digbala_at_the_opposite_angle() -> None:
    # Given Jupiter 180 deg from its strong point (the 7th-house cusp)
    bala = digbala_virupas(PlanetName.JUPITER, planet_longitude=280.0, lagna_longitude=100.0)
    # Then Digbala is zero
    assert bala.virupas == pytest.approx(0.0, abs=1e-9)


def test_should_award_half_digbala_at_ninety_degrees() -> None:
    # Given a graha a quarter-circle from its strong point
    bala = digbala_virupas(PlanetName.JUPITER, planet_longitude=190.0, lagna_longitude=100.0)
    # Then Digbala is half (30 Virupas), the linear taper
    assert bala.virupas == pytest.approx(30.0, abs=1e-9)


def test_should_stay_within_zero_to_sixty_virupas() -> None:
    # Then Digbala never exceeds the BPHS range for any longitude
    for lon in range(0, 360, 7):
        bala = digbala_virupas(PlanetName.SATURN, float(lon), 0.0)
        assert 0.0 <= bala.virupas <= 60.0

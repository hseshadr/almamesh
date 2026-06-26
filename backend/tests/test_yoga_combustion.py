"""Combustion (asta) — classical orbs, separation math, applicability.

Orbs per the Surya-Siddhanta tradition as tabulated in B.V. Raman,
*Graha and Bhava Balas*: Moon 12, Mars 17, Mercury 14 (12 retrograde),
Jupiter 11, Venus 10 (8 retrograde), Saturn 15 (degrees from the Sun).
The Sun cannot be combust; Rahu/Ketu are shadow points — asta never applies.
"""

from __future__ import annotations

import pytest

from almamesh.constants.astrology import PlanetName
from almamesh.yogas.combustion import (
    COMBUSTION_ORBS_DEG,
    RETROGRADE_COMBUSTION_ORBS_DEG,
    combustion_orb_deg,
    combustion_separation_deg,
    is_combust,
)


class TestClassicalOrbTable:
    def test_orbs_match_the_cited_classical_values(self) -> None:
        assert COMBUSTION_ORBS_DEG == {
            PlanetName.MOON: 12.0,
            PlanetName.MARS: 17.0,
            PlanetName.MERCURY: 14.0,
            PlanetName.JUPITER: 11.0,
            PlanetName.VENUS: 10.0,
            PlanetName.SATURN: 15.0,
        }

    def test_retrograde_orbs_match_the_cited_classical_values(self) -> None:
        assert RETROGRADE_COMBUSTION_ORBS_DEG == {
            PlanetName.MERCURY: 12.0,
            PlanetName.VENUS: 8.0,
        }

    @pytest.mark.parametrize("planet", [PlanetName.SUN, PlanetName.RAHU, PlanetName.KETU])
    def test_sun_and_nodes_have_no_orb(self, planet: PlanetName) -> None:
        assert combustion_orb_deg(planet, retrograde=False) is None
        assert combustion_orb_deg(planet, retrograde=True) is None


class TestSeparation:
    def test_simple_separation(self) -> None:
        assert combustion_separation_deg(100.0, 90.0) == pytest.approx(10.0)

    def test_separation_wraps_around_0_degrees(self) -> None:
        assert combustion_separation_deg(359.0, 2.0) == pytest.approx(3.0)

    def test_separation_is_symmetric(self) -> None:
        assert combustion_separation_deg(10.0, 350.0) == pytest.approx(
            combustion_separation_deg(350.0, 10.0)
        )


class TestIsCombust:
    def test_moon_within_12_degrees_is_combust(self) -> None:
        assert is_combust(PlanetName.MOON, 11.9, retrograde=False)

    def test_moon_beyond_12_degrees_is_not_combust(self) -> None:
        assert not is_combust(PlanetName.MOON, 12.1, retrograde=False)

    def test_separation_equal_to_orb_counts_as_combust(self) -> None:
        # "within N degrees" is inclusive at the orb itself.
        assert is_combust(PlanetName.JUPITER, 11.0, retrograde=False)

    def test_retrograde_mercury_uses_the_tighter_12_degree_orb(self) -> None:
        assert is_combust(PlanetName.MERCURY, 13.0, retrograde=False)
        assert not is_combust(PlanetName.MERCURY, 13.0, retrograde=True)

    def test_retrograde_venus_uses_the_tighter_8_degree_orb(self) -> None:
        assert is_combust(PlanetName.VENUS, 9.0, retrograde=False)
        assert not is_combust(PlanetName.VENUS, 9.0, retrograde=True)

    @pytest.mark.parametrize("planet", [PlanetName.SUN, PlanetName.RAHU, PlanetName.KETU])
    def test_sun_and_nodes_are_never_combust(self, planet: PlanetName) -> None:
        assert not is_combust(planet, 0.0, retrograde=False)

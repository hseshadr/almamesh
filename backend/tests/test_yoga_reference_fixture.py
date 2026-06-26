"""One synthetic-chart regression fixture for the yoga audit (among generic tests).

Chart: 1988-08-08 06:44 IST (+05:30), Bengaluru (12.9716 N, 77.5946 E) — a
synthetic reference native with Leo lagna (0.04 deg, on the Cancer cusp),
Mars the yogakaraka in Pisces (8th), Sun + combust Mercury in Cancer (12th),
Jupiter in Taurus (10th), Moon + Venus in Gemini (11th). The engine is GENERIC
— this file just pins one rich, fully-fictional chart so a regression in the
yoga rules is caught immediately.

Combustion is asserted from COMPUTED Sun separations (never from a claim).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.schemas.astrology import SiderealContext, YogaData
from almamesh.yogas.combustion import (
    combustion_orb_deg,
    combustion_separation_deg,
)

_IST = timezone(timedelta(hours=5, minutes=30))
_REFERENCE_DATE = datetime(2024, 1, 1, tzinfo=UTC)


@pytest.fixture(scope="module")
def chart() -> SiderealContext:
    return calculate_sidereal_context(
        datetime(1988, 8, 8, 6, 44, tzinfo=_IST),
        12.9716,
        77.5946,
        reference_date=_REFERENCE_DATE,
    )


def _names(chart: SiderealContext) -> list[str]:
    return [y.name for y in chart.yogas]


def _by_name(chart: SiderealContext, name: str) -> list[YogaData]:
    return [y for y in chart.yogas if y.name == name]


class TestChartSanity:
    def test_lagna_and_key_placements(self, chart: SiderealContext) -> None:
        assert chart.lagna.sign == ZodiacSign.LEO
        assert chart.planets[PlanetName.MARS].sign == ZodiacSign.PISCES
        assert chart.planets[PlanetName.MARS].house == 8
        assert chart.planets[PlanetName.JUPITER].house == 10
        assert chart.planets[PlanetName.SATURN].house == 5


class TestPerPlanetNatalFields:
    def test_mars_is_the_yogakaraka(self, chart: SiderealContext) -> None:
        assert chart.planets[PlanetName.MARS].is_yogakaraka is True
        others = [p for n, p in chart.planets.items() if n != PlanetName.MARS]
        assert all(p.is_yogakaraka is False for p in others)

    def test_houses_ruled_whole_sign(self, chart: SiderealContext) -> None:
        expected = {
            PlanetName.SUN: [1],
            PlanetName.MOON: [12],
            PlanetName.MARS: [4, 9],
            PlanetName.MERCURY: [2, 11],
            PlanetName.JUPITER: [5, 8],
            PlanetName.VENUS: [3, 10],
            PlanetName.SATURN: [6, 7],
            PlanetName.RAHU: [],
            PlanetName.KETU: [],
        }
        for planet, houses in expected.items():
            assert chart.planets[planet].houses_ruled == houses, planet

    def test_combustion_flags_follow_computed_sun_separations(self, chart: SiderealContext) -> None:
        sun_longitude = chart.planets[PlanetName.SUN].longitude
        for name, pos in chart.planets.items():
            orb = combustion_orb_deg(name, retrograde=pos.is_retrograde)
            if orb is None:  # Sun and the nodes are never combust.
                assert pos.is_combust is False
                assert pos.combustion_separation_deg is None
                continue
            separation = combustion_separation_deg(pos.longitude, sun_longitude)
            assert pos.combustion_separation_deg == pytest.approx(separation)
            assert pos.is_combust == (separation <= orb), name

    def test_mercury_is_combust_in_the_12th(self, chart: SiderealContext) -> None:
        # Mercury sits with the Sun in Cancer (12th) within the combustion orb.
        assert chart.planets[PlanetName.MERCURY].sign == ZodiacSign.CANCER
        assert chart.planets[PlanetName.MERCURY].house == 12
        assert chart.planets[PlanetName.MERCURY].is_combust is True


class TestReferenceYogaList:
    def test_yogakaraka_yoga_emitted_for_mars(self, chart: SiderealContext) -> None:
        karaka = _by_name(chart, "Yogakaraka")
        assert len(karaka) == 1
        assert karaka[0].planets_involved == [PlanetName.MARS]
        assert karaka[0].houses_involved == [4, 9]
        assert "yogakaraka.kendra_trikona_lord" in [r.rule for r in karaka[0].formation_rules]

    def test_amala_yoga_for_a_benefic_only_10th(self, chart: SiderealContext) -> None:
        amala = _by_name(chart, "Amala Yoga")
        assert len(amala) == 1
        assert amala[0].planets_involved == [PlanetName.JUPITER]
        assert amala[0].houses_involved == [10]
        assert "amala.benefic_only_10th" in [r.rule for r in amala[0].formation_rules]

    def test_budha_aditya_yoga_is_mercury_with_sun(self, chart: SiderealContext) -> None:
        ba = _by_name(chart, "Budha-Aditya Yoga")
        assert len(ba) == 1
        assert set(ba[0].planets_involved) == {PlanetName.MERCURY, PlanetName.SUN}
        assert "budha_aditya.conjunction" in [r.rule for r in ba[0].formation_rules]

    def test_durudhara_yoga_flanks_the_moon(self, chart: SiderealContext) -> None:
        durudhara = _by_name(chart, "Durudhara Yoga")
        assert len(durudhara) == 1
        assert PlanetName.MOON in durudhara[0].planets_involved
        assert "chandra.durudhara" in [r.rule for r in durudhara[0].formation_rules]

    def test_no_self_paired_raja_yoga(self, chart: SiderealContext) -> None:
        for raja in _by_name(chart, "Raja Yoga"):
            assert len(set(raja.planets_involved)) >= 2

    def test_every_yoga_has_grade_and_full_trace(self, chart: SiderealContext) -> None:
        assert chart.yogas, "the reference chart must emit yogas"
        for yoga in chart.yogas:
            assert yoga.grade in {"strong", "moderate", "weak"}
            assert yoga.planets_involved
            assert yoga.houses_involved
            assert yoga.strength_factors
            assert yoga.formation_rules
            assert all(f.factor_type != "shadbala" for f in yoga.strength_factors)
            for rule in yoga.formation_rules:
                assert rule.source
                assert rule.planets
                assert rule.description

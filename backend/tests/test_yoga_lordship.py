"""Canonical whole-sign lordship table — exhaustive for ALL 12 lagnas.

The expected values below are hand-derived from the BPHS sign lordships
(Mars: Aries/Scorpio, Venus: Taurus/Libra, Mercury: Gemini/Virgo, Moon: Cancer,
Sun: Leo, Jupiter: Sagittarius/Pisces, Saturn: Capricorn/Aquarius) counted
whole-sign from each lagna. They are written out literally — NOT derived from
the implementation — so a lordship regression cannot hide.

Yogakaraka doctrine (BPHS, Yogakaraka adhyaya): a graha lording both a kendra
(4/7/10) and a trikona (5/9) from lagna. The classical six: Mars for
Cancer/Leo, Venus for Capricorn/Aquarius, Saturn for Taurus/Libra.
"""

from __future__ import annotations

import pytest

from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.yogas.lordship import (
    house_lord,
    houses_ruled,
    yogakaraka_planet,
)

SUN = PlanetName.SUN
MOON = PlanetName.MOON
MARS = PlanetName.MARS
MERCURY = PlanetName.MERCURY
JUPITER = PlanetName.JUPITER
VENUS = PlanetName.VENUS
SATURN = PlanetName.SATURN

# lagna -> planet -> houses ruled (whole-sign), hand-derived literals.
EXPECTED_HOUSES_RULED: dict[ZodiacSign, dict[PlanetName, list[int]]] = {
    ZodiacSign.ARIES: {
        SUN: [5],
        MOON: [4],
        MARS: [1, 8],
        MERCURY: [3, 6],
        JUPITER: [9, 12],
        VENUS: [2, 7],
        SATURN: [10, 11],
    },
    ZodiacSign.TAURUS: {
        SUN: [4],
        MOON: [3],
        MARS: [7, 12],
        MERCURY: [2, 5],
        JUPITER: [8, 11],
        VENUS: [1, 6],
        SATURN: [9, 10],
    },
    ZodiacSign.GEMINI: {
        SUN: [3],
        MOON: [2],
        MARS: [6, 11],
        MERCURY: [1, 4],
        JUPITER: [7, 10],
        VENUS: [5, 12],
        SATURN: [8, 9],
    },
    ZodiacSign.CANCER: {
        SUN: [2],
        MOON: [1],
        MARS: [5, 10],
        MERCURY: [3, 12],
        JUPITER: [6, 9],
        VENUS: [4, 11],
        SATURN: [7, 8],
    },
    ZodiacSign.LEO: {
        SUN: [1],
        MOON: [12],
        MARS: [4, 9],
        MERCURY: [2, 11],
        JUPITER: [5, 8],
        VENUS: [3, 10],
        SATURN: [6, 7],
    },
    ZodiacSign.VIRGO: {
        SUN: [12],
        MOON: [11],
        MARS: [3, 8],
        MERCURY: [1, 10],
        JUPITER: [4, 7],
        VENUS: [2, 9],
        SATURN: [5, 6],
    },
    ZodiacSign.LIBRA: {
        SUN: [11],
        MOON: [10],
        MARS: [2, 7],
        MERCURY: [9, 12],
        JUPITER: [3, 6],
        VENUS: [1, 8],
        SATURN: [4, 5],
    },
    ZodiacSign.SCORPIO: {
        SUN: [10],
        MOON: [9],
        MARS: [1, 6],
        MERCURY: [8, 11],
        JUPITER: [2, 5],
        VENUS: [7, 12],
        SATURN: [3, 4],
    },
    ZodiacSign.SAGITTARIUS: {
        SUN: [9],
        MOON: [8],
        MARS: [5, 12],
        MERCURY: [7, 10],
        JUPITER: [1, 4],
        VENUS: [6, 11],
        SATURN: [2, 3],
    },
    ZodiacSign.CAPRICORN: {
        SUN: [8],
        MOON: [7],
        MARS: [4, 11],
        MERCURY: [6, 9],
        JUPITER: [3, 12],
        VENUS: [5, 10],
        SATURN: [1, 2],
    },
    ZodiacSign.AQUARIUS: {
        SUN: [7],
        MOON: [6],
        MARS: [3, 10],
        MERCURY: [5, 8],
        JUPITER: [2, 11],
        VENUS: [4, 9],
        SATURN: [1, 12],
    },
    ZodiacSign.PISCES: {
        SUN: [6],
        MOON: [5],
        MARS: [2, 9],
        MERCURY: [4, 7],
        JUPITER: [1, 10],
        VENUS: [3, 8],
        SATURN: [11, 12],
    },
}

# The classical six yogakarakas; every other lagna has none.
EXPECTED_YOGAKARAKA: dict[ZodiacSign, PlanetName | None] = {
    ZodiacSign.ARIES: None,
    ZodiacSign.TAURUS: SATURN,
    ZodiacSign.GEMINI: None,
    ZodiacSign.CANCER: MARS,
    ZodiacSign.LEO: MARS,
    ZodiacSign.VIRGO: None,
    ZodiacSign.LIBRA: SATURN,
    ZodiacSign.SCORPIO: None,
    ZodiacSign.SAGITTARIUS: None,
    ZodiacSign.CAPRICORN: VENUS,
    ZodiacSign.AQUARIUS: VENUS,
    ZodiacSign.PISCES: None,
}


@pytest.mark.parametrize("lagna", list(ZodiacSign))
def test_houses_ruled_matches_canonical_table_for_every_lagna(
    lagna: ZodiacSign,
) -> None:
    for planet, expected in EXPECTED_HOUSES_RULED[lagna].items():
        assert houses_ruled(planet, lagna) == expected, f"{planet} for {lagna}"


@pytest.mark.parametrize("lagna", list(ZodiacSign))
def test_nodes_rule_no_houses(lagna: ZodiacSign) -> None:
    assert houses_ruled(PlanetName.RAHU, lagna) == []
    assert houses_ruled(PlanetName.KETU, lagna) == []


@pytest.mark.parametrize("lagna", list(ZodiacSign))
def test_house_lord_is_consistent_with_houses_ruled(lagna: ZodiacSign) -> None:
    for house in range(1, 13):
        lord = house_lord(house, lagna)
        assert house in houses_ruled(lord, lagna)


@pytest.mark.parametrize("lagna", list(ZodiacSign))
def test_every_lagna_distributes_all_12_houses_over_the_7_grahas(
    lagna: ZodiacSign,
) -> None:
    union: list[int] = []
    for planet in EXPECTED_HOUSES_RULED[lagna]:
        union.extend(houses_ruled(planet, lagna))
    assert sorted(union) == list(range(1, 13))


@pytest.mark.parametrize("lagna", list(ZodiacSign))
def test_yogakaraka_matches_the_classical_six(lagna: ZodiacSign) -> None:
    assert yogakaraka_planet(lagna) == EXPECTED_YOGAKARAKA[lagna]

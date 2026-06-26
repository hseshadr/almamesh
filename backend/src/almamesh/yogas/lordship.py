"""Canonical whole-sign lordship from the lagna.

Whole-sign houses make lordship a pure static table: house ``h`` IS the sign
``(lagna + h - 1) mod 12`` and its lord is that sign's BPHS rasi lord
(Mars: Aries/Scorpio, Venus: Taurus/Libra, Mercury: Gemini/Virgo, Moon: Cancer,
Sun: Leo, Jupiter: Sagittarius/Pisces, Saturn: Capricorn/Aquarius). Rahu/Ketu
lord no sign in the Parashari scheme used by this engine.

Yogakaraka (BPHS, Yogakaraka adhyaya): a graha lording both a kendra (4/7/10)
and a trikona (5/9) from the lagna. Lagna-lordship (house 1) is a separate
status, not yogakaraka — this yields exactly the classical six: Mars for
Cancer/Leo, Venus for Capricorn/Aquarius, Saturn for Taurus/Libra.
"""

from __future__ import annotations

from almamesh.constants.astrology import (
    SIGN_LORDS,
    ZODIAC_SIGNS,
    PlanetName,
    ZodiacSign,
)

# House classes (whole-sign, from lagna).
KENDRA_HOUSES: frozenset[int] = frozenset({1, 4, 7, 10})
TRIKONA_HOUSES: frozenset[int] = frozenset({1, 5, 9})
DUSTHANA_HOUSES: frozenset[int] = frozenset({6, 8, 12})
UPACHAYA_HOUSES: frozenset[int] = frozenset({3, 6, 10, 11})

# Yogakaraka pairing excludes house 1 (the lagna-lord status) on each side.
_YOGAKARAKA_KENDRAS: frozenset[int] = frozenset({4, 7, 10})
_YOGAKARAKA_TRIKONAS: frozenset[int] = frozenset({5, 9})


def sign_index(sign: ZodiacSign) -> int:
    """0-based zodiac index (Aries = 0)."""
    return ZODIAC_SIGNS.index(sign.value)


def sign_of_house(house: int, lagna_sign: ZodiacSign) -> ZodiacSign:
    """The sign occupying whole-sign house ``house`` (1-12) from the lagna."""
    if not 1 <= house <= 12:
        raise ValueError(f"house must be 1-12, got {house}")
    return ZodiacSign(ZODIAC_SIGNS[(sign_index(lagna_sign) + house - 1) % 12])


def house_of_sign(sign: ZodiacSign, lagna_sign: ZodiacSign) -> int:
    """The whole-sign house (1-12) that ``sign`` occupies from the lagna."""
    return (sign_index(sign) - sign_index(lagna_sign)) % 12 + 1


def house_lord(house: int, lagna_sign: ZodiacSign) -> PlanetName:
    """The BPHS rasi lord of whole-sign house ``house`` from the lagna."""
    return SIGN_LORDS[sign_of_house(house, lagna_sign)]


def houses_ruled(planet: PlanetName, lagna_sign: ZodiacSign) -> list[int]:
    """All whole-sign houses ``planet`` lords from the lagna ([] for nodes)."""
    return [
        house for house in range(1, 13) if SIGN_LORDS[sign_of_house(house, lagna_sign)] == planet
    ]


def yogakaraka_planet(lagna_sign: ZodiacSign) -> PlanetName | None:
    """The yogakaraka for this lagna, or None (only six lagnas have one)."""
    for planet in SIGN_LORDS.values():
        ruled = set(houses_ruled(planet, lagna_sign))
        if ruled & _YOGAKARAKA_KENDRAS and ruled & _YOGAKARAKA_TRIKONAS:
            return planet
    return None

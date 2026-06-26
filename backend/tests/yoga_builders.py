"""Synthetic ``SiderealContext`` builders for yoga rule tests.

Build deterministic whole-sign charts WITHOUT the ephemeris so each classical
rule can be exercised positively and negatively for any lagna. The builder uses
the engine's own helpers (dignity, nakshatra, lordship, combustion) so a
synthetic chart carries exactly the same derived fields a real chart does.
"""

from __future__ import annotations

from almamesh.calculations import get_dignity, get_nakshatra_info
from almamesh.constants.astrology import (
    SIGN_LORDS,
    ZODIAC_SIGNS,
    PlanetName,
    ZodiacSign,
)
from almamesh.schemas.astrology import (
    HouseCuspData,
    LagnaData,
    PlanetPosition,
    SiderealContext,
    VimshottariDashaData,
)
from almamesh.yogas.combustion import combustion_separation_deg, is_combust
from almamesh.yogas.lordship import houses_ruled, yogakaraka_planet

# Spread defaults so no Mahapurusha dignity, no combustion, and both nodal
# hemispheres are occupied (no incidental Kala Sarpa). Tests override planets
# they care about and assert ONLY targeted yoga names.
DEFAULT_PLACEMENTS: dict[PlanetName, tuple[ZodiacSign, float]] = {
    PlanetName.SUN: (ZodiacSign.LEO, 20.0),
    PlanetName.MOON: (ZodiacSign.GEMINI, 15.0),
    PlanetName.MARS: (ZodiacSign.VIRGO, 10.0),
    PlanetName.MERCURY: (ZodiacSign.SAGITTARIUS, 10.0),
    PlanetName.JUPITER: (ZodiacSign.AQUARIUS, 10.0),
    PlanetName.VENUS: (ZodiacSign.CANCER, 10.0),
    PlanetName.SATURN: (ZodiacSign.SCORPIO, 10.0),
    PlanetName.RAHU: (ZodiacSign.VIRGO, 25.0),
    PlanetName.KETU: (ZodiacSign.PISCES, 25.0),
}

Placement = ZodiacSign | tuple[ZodiacSign, float]


def _sign_index(sign: ZodiacSign) -> int:
    return ZODIAC_SIGNS.index(sign.value)


def _normalize(placement: Placement) -> tuple[ZodiacSign, float]:
    if isinstance(placement, tuple):
        return placement
    return placement, 15.0


def _build_planet(
    name: PlanetName,
    sign: ZodiacSign,
    degree: float,
    lagna_sign: ZodiacSign,
    sun_longitude: float,
    retrograde: bool,
) -> PlanetPosition:
    longitude = _sign_index(sign) * 30.0 + degree
    lord = SIGN_LORDS[sign]
    n_name, n_pada, n_lord = get_nakshatra_info(longitude)
    separation = combustion_separation_deg(longitude, sun_longitude)
    return PlanetPosition(
        name=name,
        longitude=longitude,
        is_retrograde=retrograde,
        sign=sign,
        sign_degrees=degree,
        sign_lord=lord,
        nakshatra=n_name,
        nakshatra_pada=n_pada,
        nakshatra_lord=n_lord,
        house=(_sign_index(sign) - _sign_index(lagna_sign)) % 12 + 1,
        dignity=get_dignity(name, sign, lord),
        is_combust=is_combust(name, separation, retrograde),
        combustion_separation_deg=(
            None if name in (PlanetName.SUN, PlanetName.RAHU, PlanetName.KETU) else separation
        ),
        houses_ruled=houses_ruled(name, lagna_sign),
        is_yogakaraka=yogakaraka_planet(lagna_sign) == name,
    )


def _build_houses(lagna_sign: ZodiacSign) -> dict[int, HouseCuspData]:
    lagna_idx = _sign_index(lagna_sign)
    houses: dict[int, HouseCuspData] = {}
    for house in range(1, 13):
        sign = ZodiacSign(ZODIAC_SIGNS[(lagna_idx + house - 1) % 12])
        houses[house] = HouseCuspData(
            house=house,
            longitude=_sign_index(sign) * 30.0,
            sign=sign,
            sign_lord=SIGN_LORDS[sign],
        )
    return houses


def make_chart(
    lagna_sign: ZodiacSign,
    placements: dict[PlanetName, Placement] | None = None,
    retrograde: frozenset[PlanetName] = frozenset(),
) -> SiderealContext:
    """A full synthetic chart: defaults + overrides, all derived fields real."""
    merged: dict[PlanetName, tuple[ZodiacSign, float]] = {
        name: _normalize((placements or {}).get(name, default))
        for name, default in DEFAULT_PLACEMENTS.items()
    }
    sun_sign, sun_degree = merged[PlanetName.SUN]
    sun_longitude = _sign_index(sun_sign) * 30.0 + sun_degree
    lagna_longitude = _sign_index(lagna_sign) * 30.0 + 15.0
    n_name, n_pada, n_lord = get_nakshatra_info(lagna_longitude)
    planets = {
        name: _build_planet(name, sign, degree, lagna_sign, sun_longitude, name in retrograde)
        for name, (sign, degree) in merged.items()
    }
    return SiderealContext(
        ayanamsa_value=24.0,
        lagna=LagnaData(
            longitude=lagna_longitude,
            sign=lagna_sign,
            sign_degrees=15.0,
            sign_lord=SIGN_LORDS[lagna_sign],
            nakshatra=n_name,
            nakshatra_pada=n_pada,
            nakshatra_lord=n_lord,
        ),
        planets=planets,
        houses=_build_houses(lagna_sign),
        dashas=VimshottariDashaData(maha_dasha_sequence=[]),
        yogas=[],
    )


def yoga_names(chart: SiderealContext) -> list[str]:
    """Evaluate the chart's yogas and return their canonical names."""
    from almamesh.yogas.engine import create_yoga_engine

    return [y.name for y in create_yoga_engine(chart).evaluate_all_yogas()]

"""Gochara — every transiting graha placed against the natal chart.

Classical basis: transit results (gochara phala) are read primarily from the
natal Moon sign (Janma Rasi) and secondarily from the Lagna; we emit both whole-
sign house counts so a seasoned reader sees what they expect."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from almamesh.calculations import (
    AyanamsaType,
    NodeType,
    _resolve_ayanamsa,
    _to_utc,
    get_nakshatra_info,
)
from almamesh.constants.astrology import ZODIAC_SIGNS, PlanetName, ZodiacSign
from almamesh.schemas.transits import GocharaContext, TransitPlacement
from almamesh.transits.natal import (
    natal_lagna_index,
    natal_moon_index,
    sign_index,
    whole_sign_house,
)
from almamesh.transits.positions import transit_positions

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.calculations import SkyfieldAstronomy
    from almamesh.schemas.astrology import SiderealContext


def _placement(
    graha: PlanetName, raw: dict[str, Any], moon_idx: int, lagna_idx: int
) -> TransitPlacement:
    """Build one TransitPlacement from a raw position dict + natal indices."""
    lon = float(raw["longitude"])
    idx = sign_index(lon)
    name, pada, _lord = get_nakshatra_info(lon)
    sign = ZodiacSign(ZODIAC_SIGNS[idx])
    return TransitPlacement(
        graha=graha,
        longitude=lon,
        sign=sign,
        sign_degrees=lon % 30.0,
        nakshatra=name,
        nakshatra_pada=pada,
        is_retrograde=bool(raw["is_retrograde"]),
        house_from_lagna=whole_sign_house(idx, lagna_idx),
        house_from_moon=whole_sign_house(idx, moon_idx),
        natal_sign_occupied=sign,
    )


def build_gochara_context(
    astro: SkyfieldAstronomy,
    natal: SiderealContext,
    instant: datetime,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> GocharaContext:
    """Place all transiting grahas against the natal Moon and Lagna at `instant`."""
    dt_utc = _to_utc(instant)
    moon_idx, lagna_idx = natal_moon_index(natal), natal_lagna_index(natal)
    raw = transit_positions(astro, dt_utc, ayanamsa_type, node_type)
    placements = {graha: _placement(graha, raw[graha], moon_idx, lagna_idx) for graha in PlanetName}
    return GocharaContext(
        instant=dt_utc,
        transit_ayanamsa=_resolve_ayanamsa(astro, dt_utc, ayanamsa_type),
        placements=placements,
    )

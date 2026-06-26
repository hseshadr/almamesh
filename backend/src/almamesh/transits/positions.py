"""The single coherent transit-position path.

`transit_positions` bundles `_to_utc` -> `_resolve_ayanamsa` -> the unchanged
`SkyfieldAstronomy.get_planetary_positions` so every transit call site (gochara,
root-finds, fusion) resolves the ayanamsa AT the transit instant and floors sign
indices the same way the natal pipeline does. No new astronomy here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from almamesh.calculations import (
    AyanamsaType,
    NodeType,
    _resolve_ayanamsa,
    _to_utc,
)

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.calculations import SkyfieldAstronomy
    from almamesh.constants.astrology import PlanetName


def transit_positions(
    astro: SkyfieldAstronomy,
    when: datetime,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> dict[PlanetName, dict[str, Any]]:
    """Sidereal longitudes of all grahas at `when` (ayanamsa resolved there)."""
    dt_utc = _to_utc(when)
    ayanamsa = _resolve_ayanamsa(astro, dt_utc, ayanamsa_type)
    return astro.get_planetary_positions(dt_utc, ayanamsa, node_type)


def transit_longitude(
    astro: SkyfieldAstronomy,
    graha: PlanetName,
    when: datetime,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> float:
    """One graha's sidereal longitude at `when` — the scalar root-finds probe.

    Standard grahas take the single-graha fast path (no other planets, no node
    finite-difference); nodes fall back to the full position dict. Byte-identical
    to `transit_positions(...)[graha]['longitude']` either way.
    """
    dt_utc = _to_utc(when)
    ayanamsa = _resolve_ayanamsa(astro, dt_utc, ayanamsa_type)
    if graha in astro._STANDARD_TARGETS:
        return astro.graha_sidereal_longitude(graha, dt_utc, ayanamsa)
    return float(astro.get_planetary_positions(dt_utc, ayanamsa, node_type)[graha]["longitude"])

"""Dasha x transit fusion: the active dasha lord weighted by concurrent transits.

The dasha names *what* period is active; the transit weighs *how* it currently
reads. We locate the active maha/antar lord at the instant, find where that lord
is transiting (house from Moon/Lagna), collect which benefics reinforce and
malefics afflict its transit sign (conjunction or graha-specific Vedic aspect),
and reduce all of it to a deterministic net_weight in [-1, 1] with documented,
named weights — no magic numbers, no LLM."""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from almamesh.calculations import (
    AyanamsaType,
    NodeType,
    calculate_vimshottari_dashas,
)
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.transits import DashaTransitFusion, TransitSeverity
from almamesh.transits.antar import active_antar_lord
from almamesh.transits.aspects import afflicting_malefics, reinforcing_benefics
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

# --- documented weight table (deterministic; Phase-2/3 can extend additively) ---
_KENDRA_TRIKONA_HOUSES: Final[frozenset[int]] = frozenset({1, 4, 5, 7, 9, 10})
_DUSTHANA_HOUSES: Final[frozenset[int]] = frozenset({6, 8, 12})
_HOUSE_BONUS: Final[float] = 0.3  # lord in a kendra/trikona from the Moon
_HOUSE_PENALTY: Final[float] = -0.3  # lord in a dusthana from the Moon
_PER_BENEFIC: Final[float] = 0.25  # each benefic reinforcing the lord's sign
_PER_MALEFIC: Final[float] = -0.25  # each malefic afflicting the lord's sign
_SUPPORTIVE_THRESHOLD: Final[float] = 0.15
_CHALLENGING_THRESHOLD: Final[float] = -0.15


def _house_term(house_from_moon: int) -> float:
    """Placement bonus/penalty for the lord's transit house from the Moon."""
    if house_from_moon in _KENDRA_TRIKONA_HOUSES:
        return _HOUSE_BONUS
    if house_from_moon in _DUSTHANA_HOUSES:
        return _HOUSE_PENALTY
    return 0.0


def _severity_for(weight: float) -> TransitSeverity:
    """Map a net weight onto the coarse three-way severity."""
    if weight >= _SUPPORTIVE_THRESHOLD:
        return TransitSeverity.SUPPORTIVE
    if weight <= _CHALLENGING_THRESHOLD:
        return TransitSeverity.CHALLENGING
    return TransitSeverity.NEUTRAL


def score_fusion(
    house_from_moon: int,
    reinforcing: list[PlanetName],
    afflicting: list[PlanetName],
) -> tuple[float, TransitSeverity]:
    """Reduce placement + benefic/malefic counts to a clamped weight + severity."""
    raw = (
        _house_term(house_from_moon)
        + _PER_BENEFIC * len(reinforcing)
        + _PER_MALEFIC * len(afflicting)
    )
    weight = max(-1.0, min(1.0, raw))
    return weight, _severity_for(weight)


def _active_lords(
    natal: SiderealContext, birth_dt: datetime, instant: datetime
) -> tuple[PlanetName, PlanetName | None]:
    """Active maha (and antar) lord at the instant via the Vimshottari sequence."""
    moon_long = natal.planets[PlanetName.MOON].longitude
    dashas = calculate_vimshottari_dashas(moon_long, birth_dt, reference_date=instant)
    maha = dashas.current_maha.lord if dashas.current_maha else PlanetName.SUN
    return maha, active_antar_lord(natal, instant)


def build_fusion(
    astro: SkyfieldAstronomy,
    natal: SiderealContext,
    birth_dt: datetime,
    instant: datetime,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> DashaTransitFusion:
    """Fuse the active dasha lord with its concurrent transit reinforcement."""
    maha, antar = _active_lords(natal, birth_dt, instant)
    raw = transit_positions(astro, instant, ayanamsa_type, node_type)
    lord_idx = sign_index(float(raw[maha]["longitude"]))
    house_moon = whole_sign_house(lord_idx, natal_moon_index(natal))
    reinforcing = reinforcing_benefics(raw, maha, lord_idx)
    afflicting = afflicting_malefics(raw, maha, lord_idx)
    weight, severity = score_fusion(house_moon, reinforcing, afflicting)
    return DashaTransitFusion(
        instant=instant,
        maha_lord=maha,
        antar_lord=antar,
        maha_lord_transit_house_from_moon=house_moon,
        maha_lord_transit_house_from_lagna=whole_sign_house(lord_idx, natal_lagna_index(natal)),
        reinforcing=reinforcing,
        afflicting=afflicting,
        net_weight=weight,
        severity=severity,
    )

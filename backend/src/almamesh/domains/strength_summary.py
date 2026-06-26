"""Fuse Shadbala + Sarvashtakavarga into one banded domain strength verdict.

The inputs are exact (BPHS Shadbala Rupas; SAV bindus from the canonical
Ashtakavarga tables). Only the BAND is an AlmaMesh synthesis heuristic — and the
emitted ``StrengthSummary`` carries ``approximated=True`` + a note saying exactly
that (calc-integrity: never ship a heuristic as a classical fact).

Band thresholds use the standard Ashtakavarga house reading: an average of 28+
bindus per house is strong, below 25 is weak (25..28 is the middling band).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from almamesh.schemas.domains import StrengthBand, StrengthSummary

if TYPE_CHECKING:
    from almamesh.domains.recipes import DomainRecipe
    from almamesh.schemas.astrology import SiderealContext
    from almamesh.schemas.strength import StrengthContext

# Classical SAV house reading: >=28 bindus strong, <25 weak (per-house average).
_SAV_STRONG_AVG: Final[float] = 28.0
_SAV_WEAK_AVG: Final[float] = 25.0


def _band(meets_minimum: bool, avg_bindus: float) -> StrengthBand:
    """Deterministic band: both signals strong -> STRONG; both weak -> WEAK."""
    if meets_minimum and avg_bindus >= _SAV_STRONG_AVG:
        return StrengthBand.STRONG
    if not meets_minimum and avg_bindus < _SAV_WEAK_AVG:
        return StrengthBand.WEAK
    return StrengthBand.MODERATE


def strength_summary(
    natal: SiderealContext, strength: StrengthContext, recipe: DomainRecipe
) -> StrengthSummary:
    """Key-graha Shadbala + domain-house SAV bindus, banded deterministically."""
    bala = strength.shadbala.planets[recipe.key_graha]
    sav = strength.ashtakavarga.sarva.bindus
    bindus = sum(sav[natal.houses[rule.house].sign] for rule in recipe.houses)
    return StrengthSummary(
        key_graha=recipe.key_graha,
        key_graha_rupas=bala.total_rupas,
        key_graha_meets_minimum=bala.meets_minimum,
        sav_bindus=bindus,
        band=_band(bala.meets_minimum, bindus / len(recipe.houses)),
    )

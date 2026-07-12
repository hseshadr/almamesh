"""Fuse Shadbala + Sarvashtakavarga into one banded, %-scored domain strength.

The inputs are exact (BPHS Shadbala Rupas; SAV bindus from the canonical
Ashtakavarga tables). The BAND is an AlmaMesh synthesis heuristic — and the
emitted ``StrengthSummary`` carries ``approximated=True`` + a note saying exactly
that (calc-integrity: never ship a heuristic as a classical fact).

Band thresholds use the standard Ashtakavarga house reading: an average of 28+
bindus per house is strong, below 25 is weak (25..28 is the middling band).

Alongside the band, the Stage-2 rigor upgrade adds a CALIBRATED headline % built
from two independent, anchored, monotonic, chart-invariant axes (rigor spec
§A.1/§A.2), each a small pure function tested at its pivots:

- ``_pct_shadbala`` — piecewise-linear on the classical ``required_rupas`` pass
  line (-> 60%), ceiling at ``2×required`` (-> 100%; the one contestable anchor,
  §E-1, named below so it is trivially tunable).
- ``_pct_sav`` — linear over the 56-bindus/house hard max, so the śāstric average
  28 lands at 50% by construction.
- ``_headline_pct`` — their ``min()``: a domain is only as strong as its weaker
  classical signal, preserving today's conjunctive band semantics.

These percents are a Layer-2 MODEL over exact BPHS inputs (Tier "model"), never a
measured empirical fact — the two axes stay visible in the emitted summary so the
reader always sees WHY the headline is what it is.
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

# --- calibrated strength-% anchors (Tier M; see rigor spec §A.1 / §A.2) ---
# The Shadbala axis is piecewise-linear around a REAL classical pivot: the
# per-graha ``required_rupas`` (BPHS/Śrīpati iṣṭa-bala minimum) is the "pass
# line" and maps to 60%. Below it, [0, required] -> [0%, 60%]; above it,
# [required, CEILING×required] -> [60%, 100%], clamped. Piecewise (not log)
# because there is a classically meaningful pivot that must land at a fixed %.
_PASS_LINE_PCT: Final[float] = 60.0
# The ONE user-contestable anchor (rigor spec §E-1): the strong-ceiling has NO
# canonical śāstric value. ``2 × required_rupas`` is a documented, defensible
# AlmaMesh choice, not scripture — kept as a NAMED constant so a jyotiṣī can tune
# it in one place rather than hunting an inline literal.
_STRONG_RUPA_CEILING_MULTIPLE: Final[float] = 2.0
# The SAV axis is linear over the classical hard max of 56 bindus/house (8 max
# BAV × 7 contributing grahas); the śāstric average 28 lands at 50% BY
# CONSTRUCTION (28/56), so no midpoint is hand-picked.
_SAV_MAX_PER_HOUSE: Final[float] = 56.0


def _band(meets_minimum: bool, avg_bindus: float) -> StrengthBand:
    """Deterministic band: both signals strong -> STRONG; both weak -> WEAK."""
    if meets_minimum and avg_bindus >= _SAV_STRONG_AVG:
        return StrengthBand.STRONG
    if not meets_minimum and avg_bindus < _SAV_WEAK_AVG:
        return StrengthBand.WEAK
    return StrengthBand.MODERATE


def _clamp_pct(pct: float) -> float:
    """Clamp a percentage into the closed [0, 100] interval."""
    return max(0.0, min(100.0, pct))


def _pct_shadbala(total_rupas: float, required_rupas: float) -> float:
    """Piecewise-linear Shadbala %: required -> 60% pass line, 2×required -> 100%."""
    if required_rupas <= 0.0:
        return 0.0
    ratio = total_rupas / required_rupas
    if ratio <= 1.0:
        return _clamp_pct(_PASS_LINE_PCT * ratio)
    over = (ratio - 1.0) / (_STRONG_RUPA_CEILING_MULTIPLE - 1.0)
    return _clamp_pct(_PASS_LINE_PCT + (100.0 - _PASS_LINE_PCT) * over)


def _pct_sav(avg_bindus: float) -> float:
    """Linear SAV %: 100·avg/56, so the śāstric average 28 lands at 50%."""
    return _clamp_pct(100.0 * avg_bindus / _SAV_MAX_PER_HOUSE)


def _headline_pct(shadbala_pct: float, sav_pct: float) -> float:
    """Conjunctive min-combiner: a domain is only as strong as its weaker axis."""
    return min(shadbala_pct, sav_pct)


def strength_summary(
    natal: SiderealContext, strength: StrengthContext, recipe: DomainRecipe
) -> StrengthSummary:
    """Key-graha Shadbala + domain-house SAV bindus, banded + calibrated-%-scored."""
    bala = strength.shadbala.planets[recipe.key_graha]
    sav = strength.ashtakavarga.sarva.bindus
    bindus = sum(sav[natal.houses[rule.house].sign] for rule in recipe.houses)
    avg_bindus = bindus / len(recipe.houses)
    shadbala_pct = _pct_shadbala(bala.total_rupas, bala.required_rupas)
    sav_pct = _pct_sav(avg_bindus)
    return StrengthSummary(
        key_graha=recipe.key_graha,
        key_graha_rupas=bala.total_rupas,
        key_graha_meets_minimum=bala.meets_minimum,
        sav_bindus=bindus,
        band=_band(bala.meets_minimum, avg_bindus),
        shadbala_pct=shadbala_pct,
        sav_pct=sav_pct,
        strength_pct=_headline_pct(shadbala_pct, sav_pct),
    )

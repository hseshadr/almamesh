"""Is a domain "lit up" right now — by the running dasha and/or a transit?

Deterministic fusion of three already-computed signal sources:
- dasha: the active maha/antar/pratyantar lords (from the natal context) that are
  domain significators (house-lord / karaka / occupant);
- Sade Sati: active AND domain-relevant (the recipe's ``sade_sati_sensitive``
  flag, or the Moon being a domain significator / sitting in a domain bhava);
- gochara: slow grahas (Jupiter/Saturn/Rahu/Ketu) currently in the domain's
  whole-sign bhavas from the lagna, plus the engine's dated slow hits that touch
  a domain significator.

The net valence is a coarse count (supportive vs challenging signals) — the same
coarse-severity philosophy the transit engine itself uses; the LLM refines later.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from almamesh.constants.astrology import PlanetName
from almamesh.domains.significators import domain_house_numbers
from almamesh.schemas.domains import CurrentEmphasis
from almamesh.schemas.transits import TransitSeverity

if TYPE_CHECKING:
    from almamesh.domains.recipes import DomainRecipe
    from almamesh.schemas.astrology import SiderealContext
    from almamesh.schemas.transits import SlowTransitHit, TransitContext

# Slow grahas whose gochara over a bhava marks a sustained emphasis (BPHS gochara).
_SLOW_GRAHAS: Final[tuple[PlanetName, ...]] = (
    PlanetName.JUPITER,
    PlanetName.SATURN,
    PlanetName.RAHU,
    PlanetName.KETU,
)
_GOCHARA_SUPPORTIVE: Final[frozenset[PlanetName]] = frozenset({PlanetName.JUPITER})

_EMPHASIS_RULE: Final[str] = (
    "dasha-lord karakatva (maha/antar/pratyantar) + slow-graha gochara over the "
    "domain bhavas (whole-sign from lagna) + Sade Sati relevance"
)

_DASHA_LEVELS: Final[tuple[str, ...]] = ("maha", "antar", "pratyantar")

_SEVERITY_SCORE: Final[dict[TransitSeverity, int]] = {
    TransitSeverity.SUPPORTIVE: 1,
    TransitSeverity.NEUTRAL: 0,
    TransitSeverity.CHALLENGING: -1,
}


def _dasha_matches(
    natal: SiderealContext, sigs: frozenset[PlanetName]
) -> list[tuple[str, PlanetName]]:
    """(level, lord) for each active dasha level whose lord signifies the domain."""
    periods = (
        natal.dashas.current_maha,
        natal.dashas.current_antar,
        natal.dashas.current_pratyantar,
    )
    return [
        (level, period.lord)
        for level, period in zip(_DASHA_LEVELS, periods, strict=True)
        if period is not None and period.lord in sigs
    ]


def sade_sati_relevant(
    natal: SiderealContext, recipe: DomainRecipe, sigs: frozenset[PlanetName]
) -> bool:
    """Sade Sati (Saturn over the natal Moon) touches this domain's significators."""
    if recipe.sade_sati_sensitive or PlanetName.MOON in sigs:
        return True
    return natal.planets[PlanetName.MOON].house in domain_house_numbers(recipe)


def _hit_relevant(hit: SlowTransitHit, sigs: frozenset[PlanetName], houses: frozenset[int]) -> bool:
    """A dated slow hit touches a domain significator or domain bhava reference."""
    point = str(hit.natal_point)
    if point == "lagna":
        return 1 in houses
    if point == "moon":
        return PlanetName.MOON in sigs
    return point.removeprefix("natal_") in sigs


def _gochara_signals(transits: TransitContext, houses: frozenset[int]) -> list[TransitSeverity]:
    """One valence signal per slow graha currently transiting a domain bhava."""
    signals: list[TransitSeverity] = []
    for graha in _SLOW_GRAHAS:
        placement = transits.gochara.placements[graha]
        if placement.house_from_lagna in houses:
            supportive = graha in _GOCHARA_SUPPORTIVE
            signals.append(
                TransitSeverity.SUPPORTIVE if supportive else TransitSeverity.CHALLENGING
            )
    return signals


def _net_severity(signals: list[TransitSeverity]) -> TransitSeverity:
    """Coarse net valence: the sign of (supportive - challenging) counts."""
    score = sum(_SEVERITY_SCORE[signal] for signal in signals)
    if score > 0:
        return TransitSeverity.SUPPORTIVE
    if score < 0:
        return TransitSeverity.CHALLENGING
    return TransitSeverity.NEUTRAL


def _severity_signals(
    transits: TransitContext,
    recipe: DomainRecipe,
    sigs: frozenset[PlanetName],
    under_sade_sati: bool,
) -> list[TransitSeverity]:
    """Every domain-relevant transit valence signal active at the instant."""
    houses = domain_house_numbers(recipe)
    signals = [
        TransitSeverity(hit.severity)
        for hit in transits.slow_hits
        if _hit_relevant(hit, sigs, houses)
    ]
    signals += _gochara_signals(transits, houses)
    if under_sade_sati:
        signals.append(TransitSeverity.CHALLENGING)
    return signals


def current_emphasis(
    natal: SiderealContext,
    transits: TransitContext,
    recipe: DomainRecipe,
    sigs: frozenset[PlanetName],
) -> CurrentEmphasis:
    """Fuse dasha lords, Sade Sati and gochara into the domain's now-emphasis."""
    matches = _dasha_matches(natal, sigs)
    under = bool(transits.sade_sati.is_active) and sade_sati_relevant(natal, recipe, sigs)
    signals = _severity_signals(transits, recipe, sigs, under)
    return CurrentEmphasis(
        active_dasha_significator=bool(matches),
        dasha_levels=[level for level, _ in matches],
        matched_dasha_lords=[lord for _, lord in matches],
        under_sade_sati=under,
        transit_severity=_net_severity(signals),
        rule=_EMPHASIS_RULE,
    )

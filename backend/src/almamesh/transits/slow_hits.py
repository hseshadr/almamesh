"""Jupiter/Saturn transits over natal points, and Saturn/Jupiter returns.

A conjunction/return is a root-find of the seam-unwrapped gap between a transiting
graha's longitude and a fixed natal target. Severity is a coarse, deterministic,
classical-leaning heuristic (Saturn-on-Moon/Lagna challenges, Jupiter supports,
returns are neutral milestones); the LLM refines downstream."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Final

from almamesh.calculations import AyanamsaType, NodeType
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.transits import SlowTransitHit, TransitEventKind, TransitSeverity
from almamesh.transits.ingress import find_crossings
from almamesh.transits.positions import transit_longitude

if TYPE_CHECKING:
    from collections.abc import Callable

    from almamesh.calculations import SkyfieldAstronomy

_STEP_DAYS: Final[float] = 5.0
# Jupiter conjuncts a fixed point every ~12 yr; Saturn returns every ~29.5 yr.
# Search a full period + slack so the next exact crossing is always bracketed.
_JUPITER_PERIOD_DAYS: Final[float] = 11.862 * 365.25
_CONJ_WINDOW_DAYS: Final[float] = _JUPITER_PERIOD_DAYS + 365.25
_SATURN_PERIOD_DAYS: Final[float] = 29.457 * 365.25
_RETURN_WINDOW_DAYS: Final[float] = _SATURN_PERIOD_DAYS + 365.25
# DE421 covers ~1900-2053; clamp any forward search so probes stay in range.
_EPHEMERIS_MAX = datetime(2053, 1, 1, tzinfo=UTC)


def _clamp(when: datetime) -> datetime:
    """Keep a search horizon inside the DE421 ephemeris range."""
    return min(when, _EPHEMERIS_MAX)


def _gap_fn(
    astro: SkyfieldAstronomy, graha: PlanetName, target: float
) -> Callable[[datetime], float]:
    """f(t) = seam-unwrapped (transit graha longitude - target) in (-180, 180]."""

    def f(when: datetime) -> float:
        lon = transit_longitude(astro, graha, when, AyanamsaType.LAHIRI, NodeType.MEAN)
        return (lon - target + 180.0) % 360.0 - 180.0

    return f


def _first_crossing(
    astro: SkyfieldAstronomy, graha: PlanetName, target: float, start: datetime, end: datetime
) -> datetime | None:
    """The earliest exact crossing of the graha over the target in [start, end]."""
    crossings = find_crossings(_gap_fn(astro, graha, target), start, end, _STEP_DAYS)
    return crossings[0] if crossings else None


def _hit(
    graha: PlanetName, natal_point: str, exact: datetime, kind: TransitEventKind
) -> SlowTransitHit:
    """Build a SlowTransitHit with the deterministic severity heuristic."""
    return SlowTransitHit(
        graha=graha,
        kind=kind,
        natal_point=natal_point,
        exact=exact,
        severity=_severity(graha, kind),
    )


def _severity(graha: PlanetName, kind: TransitEventKind) -> TransitSeverity:
    """Coarse classical valence: Saturn challenges, Jupiter supports, returns neutral."""
    if kind is TransitEventKind.RETURN:
        return TransitSeverity.NEUTRAL
    if graha is PlanetName.JUPITER:
        return TransitSeverity.SUPPORTIVE
    return TransitSeverity.CHALLENGING


def next_conjunction(
    astro: SkyfieldAstronomy,
    graha: PlanetName,
    target: float,
    natal_point: str,
    after: datetime,
) -> SlowTransitHit | None:
    """Next exact conjunction of `graha` over a natal `target` longitude.

    A conjunction over the Moon/Lagna is the graha arriving on the point; the
    enum's SIGN_INGRESS is the closest "graha reaches a longitude" semantics.
    """
    end = _clamp(after + timedelta(days=_CONJ_WINDOW_DAYS))
    exact = _first_crossing(astro, graha, target, after, end)
    return None if exact is None else _hit(graha, natal_point, exact, TransitEventKind.SIGN_INGRESS)


def next_saturn_return(
    astro: SkyfieldAstronomy, natal_saturn: float, after: datetime
) -> SlowTransitHit | None:
    """Next exact Saturn return (transit Saturn over natal Saturn) after `after`."""
    end = _clamp(after + timedelta(days=_RETURN_WINDOW_DAYS))
    exact = _first_crossing(astro, PlanetName.SATURN, natal_saturn, after, end)
    return (
        None
        if exact is None
        else _hit(PlanetName.SATURN, "natal_saturn", exact, TransitEventKind.RETURN)
    )

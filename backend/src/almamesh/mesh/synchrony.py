"""Dasha synchrony — pure interval intersection of two dated Vimshottari trees.

NO astrology and no date arithmetic beyond intersection happens here: every
boundary comes verbatim from the engine-emitted maha/antar rows of the two
READ-ONLY charts. The window is explicit (no silent "now"); naive datetimes
are rejected loudly. Segments are emitted only where BOTH charts' dated trees
cover the instant (the Vimshottari tree spans 120 years from birth).
"""

from __future__ import annotations

from datetime import datetime
from itertools import pairwise
from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import DashaSynchronyResult, SynchronySegment

_BASIS: Final[str] = (
    "Pure interval intersection over the engine-emitted maha+antar dates of "
    "both charts; segments exist only where both dated trees cover the window."
)

# (start, end, maha lord, antar lord) — one antar leg of one chart's timeline.
_Leg = tuple[datetime, datetime, PlanetName, PlanetName]


def _legs(ctx: SiderealContext) -> list[_Leg]:
    """The chart's dated antar legs, verbatim from the engine tree."""
    return [
        (antar.start_date, antar.end_date, maha.lord, antar.lord)
        for maha in ctx.dashas.maha_dasha_sequence
        for antar in maha.antar_sequence
    ]


def _validate_window(start: datetime, end: datetime) -> None:
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("synchrony window datetimes must be timezone-aware")
    if start >= end:
        raise ValueError("synchrony window start must fall before its end")


def _leg_at(legs: list[_Leg], instant: datetime) -> _Leg | None:
    """The leg covering ``instant`` (half-open [start, end)), if any."""
    for leg in legs:
        if leg[0] <= instant < leg[1]:
            return leg
    return None


def _cut_points(
    a_legs: list[_Leg], b_legs: list[_Leg], start: datetime, end: datetime
) -> list[datetime]:
    """Window edges + every in-window leg boundary of either chart, sorted."""
    starts = {leg[0] for leg in a_legs} | {leg[0] for leg in b_legs}
    return sorted({t for t in starts if start < t < end} | {start, end})


def _segment(t0: datetime, t1: datetime, a: _Leg, b: _Leg, simultaneous: bool) -> SynchronySegment:
    shared = sorted({a[2], a[3]} & {b[2], b[3]}, key=lambda planet: planet.value)
    return SynchronySegment(
        start=t0,
        end=t1,
        a_maha=a[2],
        a_antar=a[3],
        b_maha=b[2],
        b_antar=b[3],
        shared_lords=shared,
        simultaneous_boundary=simultaneous,
    )


def _shared_start_instants(a_legs: list[_Leg], b_legs: list[_Leg]) -> set[datetime]:
    """Instants that begin a dasha leg in BOTH charts simultaneously."""
    return {leg[0] for leg in a_legs} & {leg[0] for leg in b_legs}


def _aligned_segments(
    a_legs: list[_Leg], b_legs: list[_Leg], start: datetime, end: datetime
) -> list[SynchronySegment]:
    """Cut the window at every leg boundary; keep slices both trees cover."""
    shared_starts = _shared_start_instants(a_legs, b_legs)
    segments: list[SynchronySegment] = []
    for t0, t1 in pairwise(_cut_points(a_legs, b_legs, start, end)):
        a_leg, b_leg = _leg_at(a_legs, t0), _leg_at(b_legs, t0)
        if a_leg is None or b_leg is None:
            continue  # outside one chart's dated 120-year tree
        segments.append(_segment(t0, t1, a_leg, b_leg, t0 in shared_starts))
    return segments


def compute_dasha_synchrony(
    a: SiderealContext, b: SiderealContext, *, start: datetime, end: datetime
) -> DashaSynchronyResult:
    """Join two charts' dated maha+antar timelines over an explicit window."""
    _validate_window(start, end)
    return DashaSynchronyResult(
        window_start=start,
        window_end=end,
        segments=_aligned_segments(_legs(a), _legs(b), start, end),
        convention_a=a.dashas.convention,
        convention_b=b.dashas.convention,
        basis=_BASIS,
    )

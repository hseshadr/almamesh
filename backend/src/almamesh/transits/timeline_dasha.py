"""Vimshottari maha/antar handover events for the timeline.

A handover is the boundary between two consecutive VimPeriods whose start falls
in the window. Descriptor: `dasha.<level>.<from>_to_<to>`."""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.dasha.vimshottari import compute_vimshottari_periods
from almamesh.schemas.transits import TimelineEvent, TransitEventKind, TransitSeverity

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.constants.astrology import PlanetName
    from almamesh.dasha.models import VimPeriod
    from almamesh.schemas.astrology import SiderealContext


def _antar_change(from_lord: PlanetName, to_lord: PlanetName, when: datetime) -> TimelineEvent:
    """An antardasha handover within the same (or a new) mahadasha."""
    return TimelineEvent(
        date=when,
        kind=TransitEventKind.DASHA_CHANGE,
        from_lord=from_lord,
        to_lord=to_lord,
        severity=TransitSeverity.NEUTRAL,
        descriptor=f"dasha.antar.{from_lord.value}_to_{to_lord.value}",
    )


def _is_handover(prev: VimPeriod, curr: VimPeriod, start: datetime, end: datetime) -> bool:
    """True if a distinct antar lord begins inside the window at curr.start_date."""
    return (
        prev.ad_lord is not None
        and curr.ad_lord is not None
        and curr.ad_lord != prev.ad_lord
        and start <= curr.start_date <= end
    )


def dasha_change_events(
    natal: SiderealContext, birth_dt: datetime, start: datetime, end: datetime
) -> list[TimelineEvent]:
    """Maha/antar handovers whose boundary falls inside [start, end]."""
    periods = compute_vimshottari_periods(natal, start, end)
    events: list[TimelineEvent] = []
    for prev, curr in zip(periods, periods[1:], strict=False):
        if _is_handover(prev, curr, start, end) and prev.ad_lord and curr.ad_lord:
            events.append(_antar_change(prev.ad_lord, curr.ad_lord, curr.start_date))
    return events

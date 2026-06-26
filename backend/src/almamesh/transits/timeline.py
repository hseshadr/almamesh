"""12-month forward timeline of dated, structured, prose-free transit events.

Merges the rare-and-meaningful slow-graha sign ingresses (Jupiter/Saturn — the
Moon and inner grahas move too fast to be signal in Phase 1) with Vimshottari
maha/antar handovers and Sade Sati phase boundaries, all inside the window,
chronologically sorted. Each event carries a STABLE dotted `descriptor` key the
i18n/LLM layer narrates later."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from almamesh.calculations import AyanamsaType, NodeType
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.transits import TimelineEvent, TransitTimeline
from almamesh.transits.natal import natal_moon_index
from almamesh.transits.timeline_dasha import dasha_change_events
from almamesh.transits.timeline_ingress import slow_graha_ingress_events
from almamesh.transits.timeline_sade_sati import sade_sati_phase_events

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.calculations import SkyfieldAstronomy
    from almamesh.schemas.astrology import SiderealContext

_DAYS_PER_MONTH = 30.4375
_SLOW_GRAHAS = (PlanetName.JUPITER, PlanetName.SATURN)


def _collect(
    astro: SkyfieldAstronomy,
    natal: SiderealContext,
    birth_dt: datetime,
    start: datetime,
    end: datetime,
) -> list[TimelineEvent]:
    """Gather every event kind in the window before sorting."""
    events: list[TimelineEvent] = []
    for graha in _SLOW_GRAHAS:
        events += slow_graha_ingress_events(astro, graha, start, end)
    events += dasha_change_events(natal, birth_dt, start, end)
    events += sade_sati_phase_events(astro, natal_moon_index(natal), start, end)
    return events


def build_timeline(
    astro: SkyfieldAstronomy,
    natal: SiderealContext,
    birth_dt: datetime,
    start: datetime,
    window_months: int = 12,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> TransitTimeline:
    """Build the chronologically-sorted forward timeline over the window."""
    end = start + timedelta(days=_DAYS_PER_MONTH * window_months)
    events = _collect(astro, natal, birth_dt, start, end)
    events.sort(key=lambda e: e.date)
    return TransitTimeline(window_start=start, window_end=end, events=events)

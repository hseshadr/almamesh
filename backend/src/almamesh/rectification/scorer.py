"""Inverse, ascendant-dependent per-event signal extraction (Phase 2 rectification).

Dasha TIMING is Moon-driven and ascendant-INVARIANT, but whether a dated period
is "about" marriage / career / children depends on HOUSE LORDSHIPS, which ROTATE
when the ascendant flips a sign. So for one event date the active dasha lords
score differently per candidate ascendant — that rotation is exactly what
discriminates e.g. Aquarius-rising from Pisces-rising. A slow Jupiter/Saturn
transit to the event's classical house is a secondary ascendant-dependent
signal.

This is a clean DETERMINISTIC inverse of the forward dasha-significator idea
(``almamesh.dasha.vimshottari._extract_vim_*_signals``). It MUST NOT import the
quarantined heuristic ``almamesh.dasha.scoring`` ("guaranteed high probability"
expert rules) — that is enforced by ``tests/test_scoring_quarantine.py``.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import TypeVar

from almamesh.constants.astrology import PlanetName

# Reuse the engine's own pratyantar tiling so dasha math has ONE source of truth
# (calc-integrity mandate). This is dasha astronomy, NOT the quarantined scorer.
from almamesh.dasha.vimshottari import _active_pratyantardasha
from almamesh.rectification.houses import category_houses
from almamesh.rectification.models import EventEvidence, RectificationEventInput
from almamesh.schemas.astrology import DashaPeriod, SiderealContext, VimshottariDashaData
from almamesh.transits import calculate_transit_context

# A dasha-lord house match (the lord RULES or OCCUPIES the event's house) is the
# PRIMARY, ascendant-rotated discriminator; a slow transit to that house is a
# SECONDARY corroborating signal. Task 8 reuses these constants.
W_PRIMARY = 1.0
W_TRANSIT = 0.5

_SLOW_GRAHAS = (PlanetName.JUPITER, PlanetName.SATURN)

_PeriodT = TypeVar("_PeriodT", bound=DashaPeriod)


def _event_instant(event_date: date) -> datetime:
    """Pin an event date to 12:00 UTC — deterministic, never the wall clock."""
    return datetime(event_date.year, event_date.month, event_date.day, 12, tzinfo=UTC)


def _period_containing(periods: Sequence[_PeriodT], when: datetime) -> _PeriodT | None:
    """The dated period whose ``[start, end)`` span contains ``when`` (or None)."""
    for period in periods:
        if period.start_date <= when < period.end_date:
            return period
    return None


def _active_lords_at(dashas: VimshottariDashaData, when: datetime) -> tuple[PlanetName, ...]:
    """Resolve the active MD / AD / PD lords at ``when`` from the dated tree."""
    maha = _period_containing(dashas.maha_dasha_sequence, when)
    if maha is None:
        return ()
    antar = _period_containing(maha.antar_sequence, when)
    if antar is None:
        raise ValueError(
            f"{when.date()} falls inside maha {maha.lord!r} "
            f"({maha.start_date.date()}–{maha.end_date.date()}) "
            "but no antardasha covers it — corrupt dasha tree"
        )
    pratyantar = _active_pratyantardasha(antar.lord, antar.start_date, antar.end_date, when)
    return (maha.lord, antar.lord, pratyantar)


def _house_signals(
    context: SiderealContext, house: int, active_lords: tuple[PlanetName, ...]
) -> list[str]:
    """Dasha signals for one house: an active lord RULES it, or OCCUPIES it."""
    signals: list[str] = []
    if context.houses[house].sign_lord in active_lords:
        signals.append(f"dasha_lord_rules_h{house}")
    if any(context.planets[lord].house == house for lord in active_lords):
        signals.append(f"dasha_lord_in_h{house}")
    return signals


def _transit_houses(context: SiderealContext, birth_dt: datetime, when: datetime) -> frozenset[int]:
    """Whole-sign houses-from-lagna holding transiting Jupiter/Saturn at ``when``."""
    context_at = calculate_transit_context(context, birth_dt, transit_instant=when)
    placements = context_at.gochara.placements
    return frozenset(
        placements[graha].house_from_lagna for graha in _SLOW_GRAHAS if graha in placements
    )


def _collect_signals(
    context: SiderealContext,
    category_houses_: Sequence[int],
    active_lords: tuple[PlanetName, ...],
    transit_houses: frozenset[int],
) -> list[str]:
    """Every fired machine key across the event category's classical houses."""
    signals: list[str] = []
    for house in category_houses_:
        signals.extend(_house_signals(context, house, active_lords))
        if house in transit_houses:
            signals.append(f"slow_transit_h{house}")
    return signals


def _signal_weight(signal: str) -> float:
    """Primary dasha matches outweigh the secondary transit signal."""
    return W_TRANSIT if signal.startswith("slow_transit") else W_PRIMARY


def extract_event_signals(
    context: SiderealContext,
    event: RectificationEventInput,
    *,
    birth_dt: datetime,
    event_index: int = 0,
) -> EventEvidence:
    """Score one life event against ONE candidate chart (ascendant-dependent).

    ``event_index`` defaults to 0; the Task-8 orchestrator passes the real index.
    """
    when = _event_instant(event.date)
    active_lords = _active_lords_at(context.dashas, when)
    transit_houses = _transit_houses(context, birth_dt, when)
    houses = category_houses(event.category)
    signals = _collect_signals(context, houses, active_lords, transit_houses)
    return EventEvidence(
        event_index=event_index,
        category=event.category,
        date=event.date,
        signals=signals,
        contribution=sum(_signal_weight(signal) for signal in signals),
    )

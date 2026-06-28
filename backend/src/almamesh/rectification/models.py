"""Pydantic result models for birth-time rectification (Phase 2).

Snake_case fields mirror the camelCase TS contract in @almamesh/shared-types
(RectificationResult, RectificationCandidate, EventEvidence, etc.).
"""

from __future__ import annotations

import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict

from almamesh.constants.astrology import EventType, ZodiacSign


class RectificationMode(str, Enum):
    """How the rectification search was performed."""

    CUSP = "cusp"
    WINDOW = "window"


class RectificationBand(str, Enum):
    """Confidence band for the rectification result."""

    NEAR_TIE = "near_tie"
    LEANS = "leans"
    CONSISTENT = "consistent"


class EventDatePrecision(str, Enum):
    """How precisely the user knows an event's date (drives engine weighting)."""

    EXACT = "exact"  # known day
    MONTH = "month"  # known month, not day
    YEAR = "year"  # known year, not month
    APPROX = "approx"  # no reliable year (a multi-year span)


class RectificationEventInput(BaseModel):
    """A single life event supplied by the user for rectification analysis."""

    model_config = ConfigDict(frozen=True)

    date: datetime.date
    category: EventType
    precision: EventDatePrecision = EventDatePrecision.EXACT


class EventEvidence(BaseModel):
    """How one life event supports (or refutes) a candidate rectified time."""

    model_config = ConfigDict(frozen=True)

    event_index: int
    category: EventType
    date: datetime.date
    signals: list[str]
    contribution: float


class RectificationCandidate(BaseModel):
    """One candidate ascendant time with its event-fit score and evidence."""

    model_config = ConfigDict(frozen=True)

    ascendant_sign: ZodiacSign
    representative_time_local: str
    lagna_longitude_deg: float
    lagna_cusp_distance_deg: float
    is_near_cusp: bool
    fit_score: float
    supporting_events: list[EventEvidence]


class RectificationResult(BaseModel):
    """Complete rectification result: mode, candidates, margin, band, honesty note."""

    model_config = ConfigDict(frozen=True)

    mode: RectificationMode
    candidates: list[RectificationCandidate]
    margin: float
    band: RectificationBand
    discriminating_event_count: int
    recorded_time_sign: ZodiacSign | None
    honesty_note_key: str

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


class AnchorConfidence(str, Enum):
    """How much the recorded birth time anchors the prior (Spec 062 E5).

    ABOUT: a weak triangular prior around the recorded time (max bonus 0.5 —
    about half of one primary signal; it can break a true tie, never outvote
    an event). UNKNOWN: flat, no prior at all.
    """

    ABOUT = "about"
    UNKNOWN = "unknown"


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
    """One candidate ascendant time with its event-fit score and evidence.

    Spec 062 E7 score breakdown (all additive, defaulted for back-compat):
    ``fit_score = positive_total - penalty_total + prior_bonus``. The split is
    surfaced so the UI can show penalties and the anchor prior transparently
    (the prior renders as its own labeled ``prior_anchor`` row). ``misses``
    lists the candidate-level silent-activation penalty keys
    (``miss_silent_{category}_h{n}``); per-event unexplained misses live in
    each ``EventEvidence.signals`` as ``miss_unexplained``.
    """

    model_config = ConfigDict(frozen=True)

    ascendant_sign: ZodiacSign
    representative_time_local: str
    lagna_longitude_deg: float
    lagna_cusp_distance_deg: float
    is_near_cusp: bool
    fit_score: float
    supporting_events: list[EventEvidence]
    # --- Spec 062 additive fields ---
    navamsa_lagna_sign: ZodiacSign | None = None
    positive_total: float = 0.0
    penalty_total: float = 0.0
    prior_bonus: float = 0.0
    misses: list[str] = []


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

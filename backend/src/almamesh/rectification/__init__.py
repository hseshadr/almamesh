"""Public API for the rectification package (Task 10 orchestrator)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.rectification.candidates import CandidateTime, cusp_candidate_times, make_astronomy
from almamesh.rectification.models import (
    RectificationCandidate,
    RectificationEventInput,
    RectificationMode,
    RectificationResult,
)
from almamesh.rectification.scorer import compute_transit_signs, rank_candidates, score_candidate


def _score_all_candidates(
    candidate_times: list[CandidateTime],
    latitude: float,
    longitude: float,
    events: Sequence[RectificationEventInput],
    utc_offset_minutes: int,
    transit_signs: Mapping[date, Mapping[PlanetName, ZodiacSign]],
    reference_date: datetime,
) -> list[RectificationCandidate]:
    """Score every candidate time against the provided events."""
    scored = []
    for ct in candidate_times:
        ctx = calculate_sidereal_context(
            ct.dt_utc, latitude, longitude, reference_date=reference_date
        )
        local_dt = ct.dt_utc + timedelta(minutes=utc_offset_minutes)
        scored.append(score_candidate(ctx, events, birth_dt=local_dt, transit_signs=transit_signs))
    return scored


def _count_discriminating(cands: list[RectificationCandidate]) -> int:
    """Count events where contribution differs across at least two candidates."""
    if len(cands) < 2:
        return 0
    ref = cands[0].supporting_events
    return sum(
        any(c.supporting_events[i].contribution != ref[i].contribution for c in cands[1:])
        for i in range(len(ref))
    )


def _recorded_sign(
    dt_utc: datetime, latitude: float, longitude: float, reference_date: datetime
) -> ZodiacSign:
    """Ascendant sign at the as-recorded birth time."""
    ctx = calculate_sidereal_context(dt_utc, latitude, longitude, reference_date=reference_date)
    return ctx.lagna.sign


def compute_rectification_result(
    *,
    dt_utc: datetime,
    latitude: float,
    longitude: float,
    utc_offset_minutes: int,
    events: Sequence[RectificationEventInput],
    mode: RectificationMode,
    reference_date: datetime,
) -> RectificationResult:
    """Cusp-mode rectification: score both adjacent-sign candidates, rank honestly."""
    astro = make_astronomy()
    candidate_times = cusp_candidate_times(dt_utc, latitude, longitude, astronomy=astro)
    transit_signs = compute_transit_signs(events)
    cands = _score_all_candidates(
        candidate_times,
        latitude,
        longitude,
        events,
        utc_offset_minutes,
        transit_signs,
        reference_date,
    )
    disc_count = _count_discriminating(cands)
    ranked, margin, band = rank_candidates(cands, discriminating_event_count=disc_count)
    return RectificationResult(
        mode=mode,
        candidates=ranked,
        margin=margin,
        band=band,
        discriminating_event_count=disc_count,
        recorded_time_sign=_recorded_sign(dt_utc, latitude, longitude, reference_date),
        honesty_note_key=f"rectify.honesty.{band.value}",
    )

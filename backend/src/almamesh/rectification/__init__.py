"""Public API for the rectification package (Tasks 10 + 18 orchestrator)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.rectification.candidates import (
    CandidateTime,
    cusp_candidate_times,
    make_astronomy,
    window_candidate_times,
)
from almamesh.rectification.models import (
    RectificationBand,
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
    astronomy: SkyfieldAstronomy | None = None,
) -> list[RectificationCandidate]:
    """Score every candidate time against the provided events."""
    scored = []
    for ct in candidate_times:
        ctx = calculate_sidereal_context(
            ct.dt_utc, latitude, longitude, reference_date=reference_date, astronomy=astronomy
        )
        local_dt = ct.dt_utc + timedelta(minutes=utc_offset_minutes)
        scored.append(score_candidate(ctx, events, birth_dt=local_dt, transit_signs=transit_signs))
    return scored


def _count_discriminating(cands: list[RectificationCandidate]) -> int:
    """Count events where the SIGNAL SET differs across at least two candidates.

    Precondition: ``supporting_events[i].event_index == i`` for every candidate
    (guaranteed by ``score_candidate``; asserted here so a future reorder fails loudly).
    """
    if len(cands) < 2:
        return 0
    for c in cands:
        for i, ev in enumerate(c.supporting_events):
            if ev.event_index != i:
                raise RuntimeError(
                    f"Event index mismatch at position {i}: "
                    f"got event_index={ev.event_index} for {c.ascendant_sign!r}"
                )
    ref = cands[0].supporting_events
    return sum(
        any(set(c.supporting_events[i].signals) != set(ref[i].signals) for c in cands[1:])
        for i in range(len(ref))
    )


def _recorded_sign(
    dt_utc: datetime,
    latitude: float,
    longitude: float,
    reference_date: datetime,
    astronomy: SkyfieldAstronomy | None = None,
) -> ZodiacSign:
    """Ascendant sign at the as-recorded birth time."""
    ctx = calculate_sidereal_context(
        dt_utc, latitude, longitude, reference_date=reference_date, astronomy=astronomy
    )
    return ctx.lagna.sign


def _candidate_times(
    mode: RectificationMode,
    dt_utc: datetime,
    latitude: float,
    longitude: float,
    astro: SkyfieldAstronomy,
    span_minutes: int | None,
) -> list[CandidateTime]:
    """Dispatch to the mode-appropriate candidate-time generator.

    CUSP: exactly 2 adjacent-sign candidates (asserted).
    WINDOW: one CandidateTime per rising sign across the search window (coarse).
    """
    if mode == RectificationMode.CUSP:
        times = cusp_candidate_times(dt_utc, latitude, longitude, astronomy=astro)
        if len(times) != 2:
            raise RuntimeError(
                "cusp_candidate_times must return exactly 2 adjacent-sign"
                f" candidates; got {len(times)}"
            )
        return times
    return window_candidate_times(
        dt_utc,
        latitude,
        longitude,
        astronomy=astro,
        span_minutes=span_minutes,
        resolution="coarse",
    )


def _build_result(
    mode: RectificationMode,
    cands: list[RectificationCandidate],
    recorded_sign: ZodiacSign,
) -> RectificationResult:
    """Assemble the ranked, band-labeled result from scored candidates."""
    disc_count = _count_discriminating(cands)
    ranked, margin, band = rank_candidates(cands, discriminating_event_count=disc_count)
    return RectificationResult(
        mode=mode,
        candidates=ranked,
        margin=margin,
        band=band,
        discriminating_event_count=disc_count,
        recorded_time_sign=recorded_sign,
        honesty_note_key=f"rectify.honesty.{band.value}",
    )


def compute_rectification_result(
    *,
    dt_utc: datetime,
    latitude: float,
    longitude: float,
    utc_offset_minutes: int,
    events: Sequence[RectificationEventInput],
    mode: RectificationMode,
    reference_date: datetime,
    span_minutes: int | None = None,
) -> RectificationResult:
    """Score all candidate lagna times against life events; return ranked honest result.

    ``span_minutes`` is only used in WINDOW mode: it bounds the search window
    around ``dt_utc``.  None (default) searches the full birth day.  Ignored in
    CUSP mode.
    """
    astro = make_astronomy()
    transit_signs = compute_transit_signs(events)
    cands = _score_all_candidates(
        _candidate_times(mode, dt_utc, latitude, longitude, astro, span_minutes),
        latitude,
        longitude,
        events,
        utc_offset_minutes,
        transit_signs,
        reference_date,
        astro,
    )
    recorded = _recorded_sign(dt_utc, latitude, longitude, reference_date, astronomy=astro)
    return _build_result(mode, cands, recorded)


__all__ = [
    "compute_rectification_result",
    "RectificationBand",
]

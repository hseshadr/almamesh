"""Public API for the rectification package (Tasks 10 + 18 orchestrator)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.rectification.candidates import (
    CandidateTime,
    cusp_candidate_times,
    make_astronomy,
    window_candidate_times,
)
from almamesh.rectification.models import (
    AnchorConfidence,
    EventDatePrecision,
    RectificationBand,
    RectificationCandidate,
    RectificationEventInput,
    RectificationMode,
    RectificationResult,
)
from almamesh.rectification.scorer import (
    EPS,
    compute_transit_signs,
    rank_candidates,
    score_candidate,
)

# --- Spec 062 E5: weak anchor prior ------------------------------------------
# Max bonus ≈ half of one primary signal: the prior can break a TRUE tie but
# can never outvote an event. It renders as its own labeled evidence row.
PRIOR_MAX_BONUS = 0.5
PRIOR_MIN_HALF_WIDTH_MINUTES = 60.0
# Pseudo-signal key for the prior's evidence row (grammar; see scorer docstring).
PRIOR_ANCHOR_KEY = "prior_anchor"


def _prior_bonus(
    candidate_dt: datetime,
    anchor_dt: datetime,
    span_minutes: int | None,
    anchor_confidence: AnchorConfidence,
) -> float:
    """Additive triangular bonus ``0.5 x max(0, 1 - |t - t_anchor| / H)``.

    ``H = max(span/2, 60 min)``; ``UNKNOWN`` is flat (bonus 0). A recorded 5:45
    makes 5:52 a priori more plausible than 17:00 — but only weakly.
    """
    if anchor_confidence is not AnchorConfidence.ABOUT:
        return 0.0
    half_width = max((span_minutes or 0) / 2.0, PRIOR_MIN_HALF_WIDTH_MINUTES)
    delta_minutes = abs((candidate_dt - anchor_dt).total_seconds()) / 60.0
    return PRIOR_MAX_BONUS * max(0.0, 1.0 - delta_minutes / half_width)


def _resolve_anchor(
    anchor_confidence: AnchorConfidence | None, mode: RectificationMode
) -> AnchorConfidence:
    """Default: cusp mode trusts the recorded time as 'about'; window mode doesn't."""
    if anchor_confidence is not None:
        return anchor_confidence
    return AnchorConfidence.ABOUT if mode == RectificationMode.CUSP else AnchorConfidence.UNKNOWN


def _score_all_candidates(
    candidate_times: list[CandidateTime],
    latitude: float,
    longitude: float,
    events: Sequence[RectificationEventInput],
    utc_offset_minutes: int,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]],
    reference_date: datetime,
    astronomy: SkyfieldAstronomy | None = None,
    *,
    anchor_dt: datetime,
    span_minutes: int | None,
    anchor_confidence: AnchorConfidence,
) -> list[RectificationCandidate]:
    """Score every candidate time against the provided events (+ anchor prior)."""
    scored = []
    for ct in candidate_times:
        ctx = calculate_sidereal_context(
            ct.dt_utc, latitude, longitude, reference_date=reference_date, astronomy=astronomy
        )
        local_dt = ct.dt_utc + timedelta(minutes=utc_offset_minutes)
        prior = _prior_bonus(ct.dt_utc, anchor_dt, span_minutes, anchor_confidence)
        scored.append(
            score_candidate(
                ctx, events, birth_dt=local_dt, transit_signs=transit_signs, prior_bonus=prior
            )
        )
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


def _lead_qualifier(ranked: Sequence[RectificationCandidate]) -> str | None:
    """Which secondary term created the top candidate's lead, if any (E7).

    'prior_influenced': stripping the anchor prior would erase the lead.
    'penalty_driven': restoring the miss penalties would erase the lead.
    Checked in that order (the anchor prior is the more caveat-worthy tie-maker).
    """
    if len(ranked) < 2:
        return None
    top, runner_up = ranked[0], ranked[1]
    if top.fit_score <= runner_up.fit_score + EPS:
        return None  # no lead to qualify
    if top.fit_score - top.prior_bonus <= runner_up.fit_score - runner_up.prior_bonus + EPS:
        return "prior_influenced"
    if top.fit_score + top.penalty_total <= runner_up.fit_score + runner_up.penalty_total + EPS:
        return "penalty_driven"
    return None


def _honesty_note_key(band: RectificationBand, ranked: Sequence[RectificationCandidate]) -> str:
    """The i18n honesty-note key, qualified when the lead is prior/penalty-made."""
    base = f"rectify.honesty.{band.value}"
    qualifier = _lead_qualifier(ranked)
    return f"{base}.{qualifier}" if qualifier else base


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
        honesty_note_key=_honesty_note_key(band, ranked),
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
    anchor_confidence: AnchorConfidence | None = None,
) -> RectificationResult:
    """Score all candidate lagna times against life events; return ranked honest result.

    ``span_minutes`` bounds the search window around ``dt_utc`` in WINDOW mode
    (None searches the full birth day; ignored in CUSP mode) AND widens the E5
    anchor prior's half-width. ``anchor_confidence`` (E5) defaults per mode:
    ``about`` for CUSP (a recorded time exists), ``unknown`` for WINDOW.
    """
    astro = make_astronomy()
    transit_signs = compute_transit_signs(events, astronomy=astro)
    cands = _score_all_candidates(
        _candidate_times(mode, dt_utc, latitude, longitude, astro, span_minutes),
        latitude,
        longitude,
        events,
        utc_offset_minutes,
        transit_signs,
        reference_date,
        astro,
        anchor_dt=dt_utc,
        span_minutes=span_minutes,
        anchor_confidence=_resolve_anchor(anchor_confidence, mode),
    )
    recorded = _recorded_sign(dt_utc, latitude, longitude, reference_date, astronomy=astro)
    return _build_result(mode, cands, recorded)


__all__ = [
    "compute_rectification_result",
    "AnchorConfidence",
    "EventDatePrecision",
    "RectificationBand",
]

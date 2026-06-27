"""Inverse, ascendant-dependent event scoring for Phase-2 birth-time rectification.

Dasha TIMING is Moon-driven and ascendant-INVARIANT, but whether a dated period
is "about" marriage / career / children depends on HOUSE LORDSHIPS, which ROTATE
when the ascendant flips a sign. So for one event date the active dasha lords
score differently per candidate ascendant — that rotation is exactly what
discriminates e.g. Aquarius-rising from Pisces-rising. A slow Jupiter/Saturn
transit to the event's classical house is a secondary ascendant-dependent signal.

Task 8 adds the HONEST-CONFIDENCE core on top of that per-event extraction:

* ``score_candidate`` aggregates per-event evidence into one candidate, applying
  DE-CORRELATION so stacking many same-category events cannot manufacture
  confidence (``_decorrelated_total``).
* ``rank_candidates`` turns the ranked fits into a normalised margin and an
  honest band, FORCING ``NEAR_TIE`` below a minimum-evidence bar — under-claiming
  is the safe failure for an anti-scam tool.
* The transiting slow-graha SIGNS at an event date are candidate- and
  natal-invariant, so they are computed ONCE per distinct date
  (``compute_transit_signs``) and rotated into per-candidate houses by pure
  arithmetic (``whole_sign_house``) — not re-derived per (candidate x event).

This is a clean DETERMINISTIC inverse of the forward dasha-significator idea
(``almamesh.dasha.vimshottari._extract_vim_*_signals``). It MUST NOT import the
quarantined heuristic ``almamesh.dasha.scoring`` ("guaranteed high probability"
expert rules) — that is enforced by ``tests/test_scoring_quarantine.py``.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, date, datetime
from typing import TypeVar

from almamesh.calculations import SkyfieldAstronomy
from almamesh.constants.astrology import ZODIAC_SIGNS, EventType, PlanetName, ZodiacSign

# Reuse the engine's own pratyantar tiling so dasha math has ONE source of truth
# (calc-integrity mandate). This is dasha astronomy, NOT the quarantined scorer.
from almamesh.dasha.vimshottari import _active_pratyantardasha
from almamesh.rectification.houses import category_houses
from almamesh.rectification.models import (
    EventEvidence,
    RectificationBand,
    RectificationCandidate,
    RectificationEventInput,
)
from almamesh.schemas.astrology import DashaPeriod, SiderealContext, VimshottariDashaData
from almamesh.transits.natal import natal_lagna_index, sign_index, whole_sign_house
from almamesh.transits.positions import transit_positions

# A dasha-lord house match (the lord RULES or OCCUPIES the event's house) is the
# PRIMARY, ascendant-rotated discriminator; a slow transit to that house is a
# SECONDARY corroborating signal.
W_PRIMARY = 1.0
W_TRANSIT = 0.5

# --- Honest-confidence constants (Task 8) --------------------------------------
# A single discriminating event can favour a candidate by coincidence; only
# repeated, INDEPENDENT confirmations justify claiming more than a tie. Below this
# bar the result is FORCED to NEAR_TIE no matter how large the raw margin —
# under-claiming is the safe failure for an anti-scam tool.
MIN_DISCRIMINATING_EVENTS = 3

# Normalised margin = (top - runner_up) / (top + runner_up + EPS), in [0, 1). The
# bands bias hard toward NEAR_TIE: "leans" needs the winner ~35% stronger than the
# runner-up; "consistent" needs it ~2.3x stronger. We would rather say "we cannot
# tell these times apart" than fabricate precision.
NEAR_TIE_MARGIN = 0.15  # below this: NEAR_TIE (treat as a coin-flip)
CONSISTENT_MARGIN = 0.40  # at/above this: CONSISTENT (one time clearly fits best)

# De-correlation guard against manufactured confidence: many events of the SAME
# category share house signatures, so stacking them must not inflate the score.
# Each additional same-category event is discounted geometrically and the
# category total is hard-capped, so N duplicates can never out-vote genuinely
# independent evidence across DIFFERENT life areas. With decay 0.5 the geometric
# sum of equal contributions converges to 2x the best event, so a cap of 2.0
# binds exactly there while never clipping a single rich observation.
SAME_CATEGORY_DECAY = 0.5  # the k-th same-category event (0-indexed) counts at 0.5**k
CATEGORY_CAP = 2.0  # max contribution from any one category (never below its best event)

# Numerical guard for the margin denominator and float comparisons.
EPS = 1e-9

_SLOW_GRAHAS = (PlanetName.JUPITER, PlanetName.SATURN)

# ZodiacSign -> 0..11 index, matching ``sign_index`` (Aries = 0) so a precomputed
# sign rotates into a house-from-lagna by pure arithmetic.
_SIGN_INDEX: dict[ZodiacSign, int] = {sign: i for i, sign in enumerate(ZodiacSign)}

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


def _sign_of(longitude: float) -> ZodiacSign:
    """The ZodiacSign holding a sidereal longitude (same floor as the natal pipeline)."""
    return ZodiacSign(ZODIAC_SIGNS[sign_index(longitude)])


def _slow_signs_at(astro: SkyfieldAstronomy, when: datetime) -> dict[PlanetName, ZodiacSign]:
    """Sidereal signs of the slow grahas (Jupiter, Saturn) at ``when``.

    Reuses the transit ephemeris primitive with the chart's defaults (Lahiri
    ayanamsa resolved AT ``when``), so it is byte-identical to the gochara path.
    """
    raw = transit_positions(astro, when)
    return {graha: _sign_of(float(raw[graha]["longitude"])) for graha in _SLOW_GRAHAS}


def compute_transit_signs(
    events: Sequence[RectificationEventInput],
) -> dict[date, dict[PlanetName, ZodiacSign]]:
    """Slow-graha signs per DISTINCT event date — computed ONCE (candidate-invariant).

    The transiting Jupiter/Saturn SIGNS at an event date do not depend on the
    candidate ascendant (only ``house_from_lagna`` rotates, by arithmetic). So the
    orchestrator calls this once and passes the result to every ``score_candidate``,
    collapsing the old O(events x candidates) ephemeris work to O(distinct dates).
    Deterministic: one ``SkyfieldAstronomy``, each instant pinned to 12:00 UTC.
    """
    astro = SkyfieldAstronomy()
    return {d: _slow_signs_at(astro, _event_instant(d)) for d in {event.date for event in events}}


def _fallback_signs(when: datetime) -> dict[PlanetName, ZodiacSign]:
    """Compute slow-graha signs for one instant when the caller supplied none."""
    return _slow_signs_at(SkyfieldAstronomy(), when)


def _transit_houses(
    context: SiderealContext, transit_signs: Mapping[PlanetName, ZodiacSign]
) -> frozenset[int]:
    """Whole-sign houses-from-lagna holding a slow graha — pure per-candidate rotation."""
    lagna_idx = natal_lagna_index(context)
    return frozenset(
        whole_sign_house(_SIGN_INDEX[sign], lagna_idx) for sign in transit_signs.values()
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
    event_index: int = 0,
    transit_signs: Mapping[PlanetName, ZodiacSign] | None = None,
) -> EventEvidence:
    """Score one life event against ONE candidate chart (ascendant-dependent).

    ``transit_signs`` are the precomputed slow-graha signs for this event's date
    (``compute_transit_signs``); ``None`` triggers an internal fallback that yields
    the identical result. ``event_index`` defaults to 0; ``score_candidate`` sets
    the real position.
    """
    when = _event_instant(event.date)
    active_lords = _active_lords_at(context.dashas, when)
    signs = transit_signs if transit_signs is not None else _fallback_signs(when)
    houses = category_houses(event.category)
    signals = _collect_signals(context, houses, active_lords, _transit_houses(context, signs))
    return EventEvidence(
        event_index=event_index,
        category=event.category,
        date=event.date,
        signals=signals,
        contribution=sum(_signal_weight(signal) for signal in signals),
    )


def _category_total(contributions: list[float]) -> float:
    """One category's de-correlated contribution: diminishing returns, then a cap.

    Sort contributions descending; the best event counts fully and each further
    same-category event is discounted by ``SAME_CATEGORY_DECAY ** rank`` (so N
    duplicates CONVERGE, never sum linearly). Finally cap at ``CATEGORY_CAP`` — but
    never below the single best event, so one genuinely rich observation is never
    penalised while runaway stacking is impossible.
    """
    ordered = sorted(contributions, reverse=True)
    decayed = sum(value * SAME_CATEGORY_DECAY**rank for rank, value in enumerate(ordered))
    return min(decayed, max(CATEGORY_CAP, ordered[0]))


def _decorrelated_total(evidences: Sequence[EventEvidence]) -> float:
    """Sum the per-category de-correlated totals across DIFFERENT life areas.

    De-correlation is per-category only: independent evidence from different
    categories adds up fully, while clustered same-category events are damped and
    capped (``_category_total``). This is the anti-false-precision core.
    """
    by_category: dict[EventType, list[float]] = defaultdict(list)
    for evidence in evidences:
        by_category[evidence.category].append(evidence.contribution)
    return sum(_category_total(contributions) for contributions in by_category.values())


def _signs_for(
    event: RectificationEventInput,
    transit_signs: Mapping[date, Mapping[PlanetName, ZodiacSign]] | None,
) -> Mapping[PlanetName, ZodiacSign] | None:
    """Precomputed signs for this event's date, or None to use the fallback."""
    return None if transit_signs is None else transit_signs.get(event.date)


def _build_candidate(
    context: SiderealContext,
    birth_dt: datetime,
    fit_score: float,
    evidences: list[EventEvidence],
) -> RectificationCandidate:
    """Assemble a candidate from its context lagna, de-correlated score, and evidence."""
    lagna = context.lagna
    return RectificationCandidate(
        ascendant_sign=lagna.sign,
        representative_time_local=birth_dt.strftime("%H:%M"),
        lagna_longitude_deg=lagna.longitude,
        lagna_cusp_distance_deg=lagna.lagna_cusp_distance_deg,
        is_near_cusp=lagna.is_near_cusp,
        fit_score=fit_score,
        supporting_events=evidences,
    )


def score_candidate(
    context: SiderealContext,
    events: Sequence[RectificationEventInput],
    *,
    birth_dt: datetime,
    transit_signs: Mapping[date, Mapping[PlanetName, ZodiacSign]] | None = None,
) -> RectificationCandidate:
    """Score every event against one candidate chart into a de-correlated candidate.

    ``birth_dt`` supplies the candidate's wall-clock ``representative_time_local``
    (rendered ``HH:MM``); pass it in the zone you want shown. ``transit_signs`` is
    the orchestrator's per-date precompute (``compute_transit_signs``); when absent
    each event computes its own signs.
    """
    evidences = [
        extract_event_signals(
            context, event, event_index=index, transit_signs=_signs_for(event, transit_signs)
        )
        for index, event in enumerate(events)
    ]
    return _build_candidate(context, birth_dt, _decorrelated_total(evidences), evidences)


def _margin(ranked: Sequence[RectificationCandidate]) -> float:
    """Normalised top-vs-runner-up separation in [0, 1); 0 when undecidable."""
    if len(ranked) < 2:
        return 0.0
    top, runner_up = ranked[0].fit_score, ranked[1].fit_score
    return (top - runner_up) / (top + runner_up + EPS)


def _band_for(margin: float, discriminating_event_count: int) -> RectificationBand:
    """Map a margin to a band, FORCING NEAR_TIE below the minimum-evidence bar."""
    if discriminating_event_count < MIN_DISCRIMINATING_EVENTS:
        return RectificationBand.NEAR_TIE
    if margin >= CONSISTENT_MARGIN:
        return RectificationBand.CONSISTENT
    if margin >= NEAR_TIE_MARGIN:
        return RectificationBand.LEANS
    return RectificationBand.NEAR_TIE


def rank_candidates(
    candidates: list[RectificationCandidate],
    *,
    discriminating_event_count: int,
) -> tuple[list[RectificationCandidate], float, RectificationBand]:
    """Sort candidates by fit (desc), compute the honest margin, and map to a band.

    The min-evidence gate means a large margin built on too few discriminating
    events still reports NEAR_TIE — coincidence must not read as certainty.
    """
    ranked = sorted(candidates, key=lambda candidate: candidate.fit_score, reverse=True)
    margin = _margin(ranked)
    return ranked, margin, _band_for(margin, discriminating_event_count)

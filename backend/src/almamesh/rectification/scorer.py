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
  confidence (``_decorrelate_by_category``).
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

SIGNAL KEY GRAMMAR (Spec 062 — the frontend EvidenceTable parser mirrors this):

    md_lord_rules_h{n} / md_lord_in_h{n}   maha-dasha lord rules/occupies house n (w 1.0)
    ad_lord_rules_h{n} / ad_lord_in_h{n}   antar-dasha lord rules/occupies house n (w 0.7)
    pd_lord_rules_h{n} / pd_lord_in_h{n}   pratyantar lord rules/occupies house n (w 0.5)
    slow_transit_h{n}                      Jupiter/Saturn transits house n       (w 0.5)
    d9_lord_rules_d9_h7                    active lord rules 7th-from-D9-lagna   (w 0.6)
    d9_lord_in_d9_h7                       active lord occupies 7th-from-D9-lagna (w 0.6)
    d9_lord_is_d9_lagna_lord               active lord rules the D9 lagna        (w 0.4)
    …#afflicted_fit / …#dignified_fit      valence suffix: the firing lord's dignity
                                           matches the event's character (x1.25);
                                           a silent x0.85 damp applies to mismatches
                                           (no suffix — never negative by itself)
    prior_anchor                           pseudo-signal: the weak recorded-time prior
                                           (rendered from candidate.prior_bonus)
    miss_unexplained                       per-event: the event fired NOTHING for this
                                           candidate (−0.25 per silent grid sample)
    miss_silent_{category}_h{n}            candidate-level (candidate.misses): a strong
                                           antar signature (lord rules AND occupies
                                           house n) with no reported {category} event
                                           inside the period (−0.15, ≤2 per category)

Depth-dedup rule (E1): a lord matching at several depths counts ONCE — keyed at
the DEEPEST matching depth (sharpest timing story) but weighted at the HIGHEST
matching depth's weight, so Jupiter MD=AD=PD is never triple-counted and never
scores below a plain MD hit. Misses are marginalized and de-correlated exactly
like hits, and the total penalty is clamped to ≤50% of the positive total —
absence of a *reported* event is weak evidence (users under-report), hence the
asymmetric −0.25/−0.15 weights and the clamp.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import NamedTuple, TypeVar

from almamesh.calculations import SkyfieldAstronomy
from almamesh.constants.astrology import (
    SIGN_LORDS,
    ZODIAC_SIGNS,
    Dignity,
    EventType,
    PlanetName,
    ZodiacSign,
)

# Reuse the engine's own pratyantar tiling so dasha math has ONE source of truth
# (calc-integrity mandate). This is dasha astronomy, NOT the quarantined scorer.
from almamesh.dasha.vimshottari import _active_pratyantardasha
from almamesh.rectification.houses import category_houses
from almamesh.rectification.models import (
    EventDatePrecision,
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

# --- Spec 062 depth weights (E1): MD = structural theme, AD = delivery, PD =
# timing sharpness. The precision grid naturally washes PD out for imprecise
# dates (many pratyantars sampled), so no special-casing by precision. ---------
W_ANTAR = 0.7
W_PRATYANTAR = 0.5
_DEPTH_KEYS = ("md", "ad", "pd")
_DEPTH_WEIGHTS = (W_PRIMARY, W_ANTAR, W_PRATYANTAR)

# --- Spec 062 D9 weights (E2): the navamsa lagna shifts every ~13 minutes — a
# second quasi-independent discrete observable, tested by dated relationship
# events only (CHILDBIRTH conservatively excluded in v1). ----------------------
W_D9_H7 = 0.6
W_D9_LAGNA_LORD = 0.4
_D9_CATEGORIES = frozenset({EventType.MARRIAGE, EventType.ENGAGEMENT, EventType.BREAKUP})

# --- Spec 062 valence (E3): dignity-conditioned fit. Match boosts, mismatch
# gently damps (never negative by itself); neutral events never multiply. ------
VALENCE_BOOST = 1.25
VALENCE_MISMATCH_DAMP = 0.85
_COLLAPSE_EVENTS = frozenset(
    {
        EventType.JOB_LOSS,
        EventType.BREAKUP,
        EventType.EXPENSE_SHOCK,
        EventType.LITIGATION,
        EventType.HEALTH_ISSUE,
        EventType.SURGERY,
    }
)
_GAIN_EVENTS = frozenset(
    {
        EventType.PROMOTION,
        EventType.MARRIAGE,
        EventType.ENGAGEMENT,
        EventType.CHILDBIRTH,
        EventType.WINDFALL,
        EventType.PROPERTY_PURCHASE,
        EventType.BUSINESS_START,
        EventType.HIGHER_STUDIES,
    }
)

# --- Spec 062 miss penalties (E4): absence of a REPORTED event is weak evidence
# (users under-report), hence the asymmetric magnitudes vs the +1.0 primary hit
# and the hard clamp at 50% of the positive total — misses refine, never dominate.
MISS_UNEXPLAINED = 0.25  # per silent grid sample of a reported event (form 1)
MISS_SILENT = 0.15  # per strong-but-silent antar signature (form 2)
SILENT_MISSES_PER_CATEGORY = 2  # form-2 cap per event category
PENALTY_CLAMP_RATIO = 0.5
MISS_UNEXPLAINED_KEY = "miss_unexplained"
# Reporting coverage window lead: 6 months before the earliest reported event
# (same 182-day half-year convention as the YEAR precision grid).
_COVERAGE_LEAD = timedelta(days=182)

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
# ZodiacSign is defined in zodiac order; enumerate → Aries=0..Pisces=11.
_SIGN_INDEX: dict[ZodiacSign, int] = {sign: i for i, sign in enumerate(ZodiacSign)}

_PeriodT = TypeVar("_PeriodT", bound=DashaPeriod)

# --- Per-precision instant grid constants (Task 2) ----------------------------
# Half-width in days for each precision level; EXACT collapses to a single point.
_PRECISION_HALF_DAYS: dict[EventDatePrecision, int] = {
    EventDatePrecision.EXACT: 0,
    EventDatePrecision.MONTH: 15,
    EventDatePrecision.YEAR: 182,
    EventDatePrecision.APPROX: 730,
}
# Number of evenly-spaced noon-UTC samples (inclusive of both endpoints).
_PRECISION_SAMPLES: dict[EventDatePrecision, int] = {
    EventDatePrecision.EXACT: 1,
    EventDatePrecision.MONTH: 3,
    EventDatePrecision.YEAR: 13,
    EventDatePrecision.APPROX: 25,
}


def _event_instant(event_date: date) -> datetime:
    """Pin an event date to 12:00 UTC — deterministic, never the wall clock."""
    return datetime(event_date.year, event_date.month, event_date.day, 12, tzinfo=UTC)


def _event_instants(event_date: date, precision: EventDatePrecision) -> tuple[datetime, ...]:
    """Evenly-spaced noon-UTC instants spanning the precision window (inclusive)."""
    half = _PRECISION_HALF_DAYS[precision]
    count = _PRECISION_SAMPLES[precision]
    if count == 1:
        return (_event_instant(event_date),)
    step = (2 * half) / (count - 1)
    offsets = [round(step * i) - half for i in range(count)]
    return tuple(_event_instant(event_date + timedelta(days=o)) for o in offsets)


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


class _Fired(NamedTuple):
    """One fired signal before valence: key, base weight, firing lord (if any)."""

    key: str
    weight: float
    lord: PlanetName | None


def _lord_depth_match(
    active_lords: tuple[PlanetName, ...], lord: PlanetName
) -> tuple[int, float] | None:
    """(deepest matching depth index, highest matching depth weight) or None.

    E1 dedup: a lord active at several depths counts ONCE — keyed at the
    DEEPEST depth, weighted at the HIGHEST matching depth's weight (so
    Jupiter MD=AD=PD never triple-counts and never scores below a MD hit).
    """
    matches = [i for i, active in enumerate(active_lords) if active == lord]
    if not matches:
        return None
    return matches[-1], max(_DEPTH_WEIGHTS[i] for i in matches)


def _house_signals(
    context: SiderealContext, house: int, active_lords: tuple[PlanetName, ...]
) -> list[_Fired]:
    """Depth-keyed dasha signals for one house: a lord RULES it, or OCCUPIES it."""
    fired: list[_Fired] = []
    ruler = context.houses[house].sign_lord
    rules = _lord_depth_match(active_lords, ruler)
    if rules is not None:
        fired.append(_Fired(f"{_DEPTH_KEYS[rules[0]]}_lord_rules_h{house}", rules[1], ruler))
    for lord in dict.fromkeys(active_lords):  # distinct, first-appearance order
        if context.planets[lord].house != house:
            continue
        occupies = _lord_depth_match(active_lords, lord)
        assert occupies is not None  # lord came from active_lords
        fired.append(_Fired(f"{_DEPTH_KEYS[occupies[0]]}_lord_in_h{house}", occupies[1], lord))
    return fired


def _d9_seventh_sign(navamsa_lagna: ZodiacSign) -> ZodiacSign:
    """The sign 7th from the navamsa lagna (pure 12-sign arithmetic)."""
    return ZodiacSign(ZODIAC_SIGNS[(_SIGN_INDEX[navamsa_lagna] + 6) % 12])


def _deepest_d9_occupant(
    context: SiderealContext, active_lords: tuple[PlanetName, ...], sign: ZodiacSign
) -> PlanetName | None:
    """The deepest-depth active lord whose NAVAMSA placement sits in ``sign``."""
    navamsa = context.navamsa
    if navamsa is None:
        return None
    for lord in reversed(active_lords):  # pd → ad → md: deepest match first
        placement = navamsa.planets.get(lord)
        if placement is not None and placement.sign == sign:
            return lord
    return None


def _d9_signals(
    context: SiderealContext, category: EventType, active_lords: tuple[PlanetName, ...]
) -> list[_Fired]:
    """E2: D9 navamsa-lagna signals for relationship events (fire at most once each).

    Computed purely from the already-derived ``context.navamsa`` — zero new
    astronomy. Keys carry no depth prefix; the E1 deepest-match rule only picks
    WHICH lord fires (for the valence read), the weights are fixed.
    """
    navamsa = context.navamsa
    if navamsa is None or category not in _D9_CATEGORIES or not active_lords:
        return []
    fired: list[_Fired] = []
    seventh = _d9_seventh_sign(navamsa.lagna_sign)
    if _lord_depth_match(active_lords, SIGN_LORDS[seventh]) is not None:
        fired.append(_Fired("d9_lord_rules_d9_h7", W_D9_H7, SIGN_LORDS[seventh]))
    occupant = _deepest_d9_occupant(context, active_lords, seventh)
    if occupant is not None:
        fired.append(_Fired("d9_lord_in_d9_h7", W_D9_H7, occupant))
    if _lord_depth_match(active_lords, navamsa.lagna_sign_lord) is not None:
        fired.append(_Fired("d9_lord_is_d9_lagna_lord", W_D9_LAGNA_LORD, navamsa.lagna_sign_lord))
    return fired


def _event_valence(category: EventType) -> int:
    """+1 gain-type, -1 collapse-type, 0 neutral (E3 EventType→valence map)."""
    if category in _COLLAPSE_EVENTS:
        return -1
    return 1 if category in _GAIN_EVENTS else 0


def _lord_condition(context: SiderealContext, lord: PlanetName) -> str:
    """'afflicted' (debilitated/combust), 'dignified' (exalted/own) or 'neutral'.

    Combustion outranks a dignified placement: an exalted-but-combust lord
    still reads afflicted (asta overrides, deterministic precedence).
    """
    planet = context.planets[lord]
    if planet.dignity is Dignity.DEBILITATED or planet.is_combust:
        return "afflicted"
    if planet.dignity in (Dignity.EXALTED, Dignity.OWN):
        return "dignified"
    return "neutral"


def _apply_valence(context: SiderealContext, fired: _Fired, valence: int) -> tuple[str, float]:
    """E3: dignity-conditioned fit for lord-fired signals → (final key, weight)."""
    if fired.lord is None or valence == 0:
        return fired.key, fired.weight
    condition = _lord_condition(context, fired.lord)
    if condition == "afflicted" and valence < 0:
        return f"{fired.key}#afflicted_fit", fired.weight * VALENCE_BOOST
    if condition == "dignified" and valence > 0:
        return f"{fired.key}#dignified_fit", fired.weight * VALENCE_BOOST
    if condition == "neutral":
        return fired.key, fired.weight
    return fired.key, fired.weight * VALENCE_MISMATCH_DAMP  # mismatch: damped, no suffix


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
    *,
    astronomy: SkyfieldAstronomy | None = None,
) -> dict[datetime, dict[PlanetName, ZodiacSign]]:
    """Slow-graha signs per DISTINCT window instant (candidate-invariant).

    Covers every noon-UTC instant of every non-``APPROX`` event's precision window.
    ``APPROX`` events contribute no instants — their transit signal is zeroed
    downstream (Task 4). The transiting slow-graha SIGNS at each instant are
    candidate- and natal-invariant; only the rotation into house-from-lagna changes
    per candidate (pure arithmetic). Deterministic: each instant is pinned to noon UTC.
    Pass a warm ``astronomy`` instance to skip an extra de421 load.
    """
    astro = astronomy if astronomy is not None else SkyfieldAstronomy()
    instants = {
        instant
        for event in events
        if event.precision is not EventDatePrecision.APPROX
        for instant in _event_instants(event.date, event.precision)
    }
    return {instant: _slow_signs_at(astro, instant) for instant in instants}


def _fallback_signs(when: datetime) -> dict[PlanetName, ZodiacSign]:
    """Compute slow-graha signs for one instant when the caller supplied none."""
    return _slow_signs_at(SkyfieldAstronomy(), when)


def _transit_houses(
    context: SiderealContext, transit_signs: Mapping[PlanetName, ZodiacSign]
) -> frozenset[int]:
    """Whole-sign houses-from-lagna holding a slow graha — pure per-candidate rotation."""
    lagna_idx = natal_lagna_index(context)
    return frozenset(
        whole_sign_house(_SIGN_INDEX[sign], lagna_idx)
        for graha, sign in transit_signs.items()
        if graha in _SLOW_GRAHAS
    )


def _transit_houses_at(
    context: SiderealContext,
    when: datetime,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]] | None,
) -> frozenset[int]:
    """Whole-sign transit houses at one instant: look up the precomputed map or fall back."""
    per_instant = transit_signs.get(when) if transit_signs is not None else None
    signs: Mapping[PlanetName, ZodiacSign] = (
        per_instant if per_instant is not None else _fallback_signs(when)
    )
    return _transit_houses(context, signs)


def _collect_fired(
    context: SiderealContext,
    category_houses_: Sequence[int],
    active_lords: tuple[PlanetName, ...],
    transit_houses: frozenset[int],
    category: EventType,
) -> list[_Fired]:
    """Every fired signal (dasha + transit + D9) across the event's houses."""
    fired: list[_Fired] = []
    for house in category_houses_:
        fired.extend(_house_signals(context, house, active_lords))
        if house in transit_houses:
            fired.append(_Fired(f"slow_transit_h{house}", W_TRANSIT, None))
    fired.extend(_d9_signals(context, category, active_lords))
    return fired


def _instant_signals(
    context: SiderealContext,
    event: RectificationEventInput,
    houses: Sequence[int],
    when: datetime,
    transit_houses: frozenset[int],
) -> list[tuple[str, float]]:
    """Valence-weighted (key, weight) pairs fired at one instant; empty = silent."""
    active_lords = _active_lords_at(context.dashas, when)
    fired = _collect_fired(context, houses, active_lords, transit_houses, event.category)
    valence = _event_valence(event.category)
    return [_apply_valence(context, f, valence) for f in fired]


class _EventScore(NamedTuple):
    """One event's evidence plus its positive/penalty split (both already /n)."""

    evidence: EventEvidence
    positive: float
    penalty: float


def _central_snapshot(fired: list[tuple[str, float]]) -> list[str]:
    """The representative signal keys: fired keys, or the unexplained-miss key."""
    return [key for key, _ in fired] if fired else [MISS_UNEXPLAINED_KEY]


def _fired_per_instant(
    context: SiderealContext,
    event: RectificationEventInput,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]] | None,
) -> list[list[tuple[str, float]]]:
    """The valence-weighted signals fired at EVERY instant of the precision grid."""
    houses = category_houses(event.category)
    zero_transit = event.precision is EventDatePrecision.APPROX
    return [
        _instant_signals(
            context,
            event,
            houses,
            when,
            frozenset() if zero_transit else _transit_houses_at(context, when, transit_signs),
        )
        for when in _event_instants(event.date, event.precision)
    ]


def _score_event(
    context: SiderealContext,
    event: RectificationEventInput,
    event_index: int,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]] | None,
) -> _EventScore:
    """Marginalize hits AND form-1 misses over the event's precision grid."""
    per_instant = _fired_per_instant(context, event, transit_signs)
    positive = sum(sum(weight for _, weight in fired) for fired in per_instant if fired)
    # The event happened; a fully-silent grid sample loses ground (form-1 miss).
    penalty = sum(MISS_UNEXPLAINED for fired in per_instant if not fired)
    n = len(per_instant)
    evidence = EventEvidence(
        event_index=event_index,
        category=event.category,
        date=event.date,
        signals=_central_snapshot(per_instant[n // 2]),
        contribution=(positive - penalty) / n,
    )
    return _EventScore(evidence, positive / n, penalty / n)


def extract_event_signals(
    context: SiderealContext,
    event: RectificationEventInput,
    *,
    event_index: int = 0,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]] | None = None,
) -> EventEvidence:
    """Marginalize one event's contribution across its precision window.

    ``transit_signs`` is the orchestrator's per-instant map (``compute_transit_signs``,
    keyed by ``datetime``); ``None`` triggers an internal fallback. For ``APPROX``
    precision the transit contribution is hard-zeroed — slow planets move too slowly
    relative to a ±2-year window to provide reliable per-instant evidence.
    ``contribution`` is the NET marginalized value: fired weights minus the form-1
    unexplained-miss penalty (−0.25 per fully-silent grid sample); the candidate
    aggregation keeps the positive/penalty split separately (``_score_event``).
    ``event_index`` defaults to 0; ``score_candidate`` sets the real position.
    """
    return _score_event(context, event, event_index, transit_signs).evidence


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


def _decorrelate_by_category(pairs: Iterable[tuple[EventType, float]]) -> float:
    """Sum the per-category de-correlated totals across DIFFERENT life areas.

    De-correlation is per-category only: independent evidence from different
    categories adds up fully, while clustered same-category values are damped and
    capped (``_category_total``). This is the anti-false-precision core; hits and
    misses run through the SAME machinery (Spec 062 design invariant).
    """
    by_category: dict[EventType, list[float]] = defaultdict(list)
    for category, value in pairs:
        by_category[category].append(value)
    return sum(_category_total(values) for values in by_category.values())


def _period_explained(
    antar: DashaPeriod, category_events: Sequence[RectificationEventInput]
) -> bool:
    """True when any reported same-category event (± its precision tolerance)
    overlaps the antar period — the activation is then accounted for."""
    for event in category_events:
        half = timedelta(days=_PRECISION_HALF_DAYS[event.precision])
        instant = _event_instant(event.date)
        if instant - half < antar.end_date and instant + half >= antar.start_date:
            return True
    return False


def _strong_signature(context: SiderealContext, house: int, lord: PlanetName) -> bool:
    """The antar lord both RULES and OCCUPIES the house — the same conjunction
    that would have scored ≥1.4 (0.7 + 0.7) as an AD-level hit."""
    planet = context.planets.get(lord)
    return context.houses[house].sign_lord == lord and planet is not None and planet.house == house


def _category_silences(
    context: SiderealContext,
    category: EventType,
    antars: Sequence[DashaPeriod],
    events: Sequence[RectificationEventInput],
) -> list[tuple[EventType, str]]:
    """Form-2 misses for one category, capped at SILENT_MISSES_PER_CATEGORY."""
    category_events = [e for e in events if e.category == category]
    found: list[tuple[EventType, str]] = []
    for antar in antars:
        for house in category_houses(category):
            if not _strong_signature(context, house, antar.lord):
                continue
            if _period_explained(antar, category_events):
                continue
            found.append((category, f"miss_silent_{category.value}_h{house}"))
            if len(found) >= SILENT_MISSES_PER_CATEGORY:
                return found
    return found


def silent_activation_misses(
    context: SiderealContext, events: Sequence[RectificationEventInput]
) -> list[tuple[EventType, str]]:
    """E4 form 2: strong antar signatures with NO reported event of that category.

    Only categories the user actually reported are examined (absence in a life
    area the user never mentioned is not evidence), only within the reporting
    coverage window [min(event dates) − 6 months, max(event dates)]. Enumerated
    from the already-dated 81-row antar tree — zero new astronomy.
    """
    if not events:
        return []
    window_start = min(_event_instant(e.date) for e in events) - _COVERAGE_LEAD
    window_end = max(_event_instant(e.date) for e in events)
    antars = [
        antar
        for maha in context.dashas.maha_dasha_sequence
        for antar in maha.antar_sequence
        if antar.start_date < window_end and antar.end_date > window_start
    ]
    categories = sorted({e.category for e in events}, key=lambda c: c.value)
    misses: list[tuple[EventType, str]] = []
    for category in categories:
        misses.extend(_category_silences(context, category, antars, events))
    return misses


def _clamped_penalty(
    scores: Sequence[_EventScore],
    silent: Sequence[tuple[EventType, str]],
    positive_total: float,
) -> float:
    """Pool form-1 + form-2 penalties, de-correlate like hits, clamp to ≤50%."""
    items = [(s.evidence.category, s.penalty) for s in scores if s.penalty > 0]
    items += [(category, MISS_SILENT) for category, _key in silent]
    raw = _decorrelate_by_category(items)
    return min(raw, PENALTY_CLAMP_RATIO * positive_total)


def _build_candidate(
    context: SiderealContext,
    birth_dt: datetime,
    evidences: list[EventEvidence],
    *,
    positive_total: float,
    penalty_total: float,
    prior_bonus: float,
    misses: list[str],
) -> RectificationCandidate:
    """Assemble a candidate; ``fit_score = positive − penalty + prior`` (E7)."""
    lagna = context.lagna
    return RectificationCandidate(
        ascendant_sign=lagna.sign,
        representative_time_local=birth_dt.strftime("%H:%M"),
        lagna_longitude_deg=lagna.longitude,
        lagna_cusp_distance_deg=lagna.lagna_cusp_distance_deg,
        is_near_cusp=lagna.is_near_cusp,
        fit_score=positive_total - penalty_total + prior_bonus,
        supporting_events=evidences,
        navamsa_lagna_sign=context.navamsa.lagna_sign if context.navamsa else None,
        positive_total=positive_total,
        penalty_total=penalty_total,
        prior_bonus=prior_bonus,
        misses=misses,
    )


def score_candidate(
    context: SiderealContext,
    events: Sequence[RectificationEventInput],
    *,
    birth_dt: datetime,
    transit_signs: Mapping[datetime, Mapping[PlanetName, ZodiacSign]] | None = None,
    prior_bonus: float = 0.0,
) -> RectificationCandidate:
    """Score every event against one candidate chart into a de-correlated candidate.

    ``birth_dt`` supplies the candidate's wall-clock ``representative_time_local``
    (rendered ``HH:MM``); pass it in the zone you want shown. ``transit_signs`` is
    the orchestrator's per-instant precompute (``compute_transit_signs``, keyed by
    ``datetime``); when absent each event computes its own signs on demand.
    ``prior_bonus`` is the orchestrator's weak anchor prior (E5), surfaced on the
    candidate as its own labeled field — never hidden inside the score.
    """
    scores = [
        _score_event(context, event, index, transit_signs) for index, event in enumerate(events)
    ]
    positive_total = _decorrelate_by_category((s.evidence.category, s.positive) for s in scores)
    silent = silent_activation_misses(context, events)
    penalty_total = _clamped_penalty(scores, silent, positive_total)
    return _build_candidate(
        context,
        birth_dt,
        [s.evidence for s in scores],
        positive_total=positive_total,
        penalty_total=penalty_total,
        prior_bonus=prior_bonus,
        misses=[key for _category, key in silent],
    )


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

"""Tests for ``extract_event_signals`` — the inverse, ascendant-dependent
per-event signal extractor (Phase 2 birth-time rectification).

The discrimination idea under test: dasha TIMING is Moon-driven and
ascendant-INVARIANT, but whether a dated period is "about" the 7th house depends
on the 7th ``sign_lord`` and 7th occupants, which ROTATE with the ascendant. So
the SAME marriage date fires ``dasha_lord_rules_h7`` for the candidate whose
7th-lord is the active dasha lord, and NOT for the other candidate. Every
expected value is DERIVED from the synthetic fixture's own dasha tree — no magic
numbers.

The fixture is a SYNTHETIC Bengaluru cusp native — never the owner's real data.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import EventType, PlanetName, ZodiacSign
from almamesh.rectification.houses import category_houses
from almamesh.rectification.models import (
    EventDatePrecision,
    EventEvidence,
    RectificationBand,
    RectificationCandidate,
    RectificationEventInput,
)
from almamesh.rectification.scorer import (
    CATEGORY_CAP,
    CONSISTENT_MARGIN,
    EPS,
    MIN_DISCRIMINATING_EVENTS,
    NEAR_TIE_MARGIN,
    W_PRIMARY,
    W_TRANSIT,
    _active_lords_at,
    _decorrelated_total,
    _event_instant,
    _event_instants,
    _transit_houses,
    compute_transit_signs,
    extract_event_signals,
    rank_candidates,
    score_candidate,
)
from almamesh.schemas.astrology import MahaDashaPeriod, SiderealContext, VimshottariDashaData
from almamesh.transits import calculate_transit_context

# Two birth TIMES of one synthetic cusp native that rotate the ascendant a full
# sign (Leo rising vs Virgo rising) — and with it the 7th-house lordship.
_BIRTH_A = datetime(1988, 8, 8, 1, 14, tzinfo=UTC)  # Leo rising  -> 7th-lord Saturn
_BIRTH_B = datetime(1988, 8, 8, 3, 30, tzinfo=UTC)  # Virgo rising -> 7th-lord Jupiter
_LAT, _LON = 12.9716, 77.5946
_REF = datetime(2026, 6, 9, 12, 0, tzinfo=UTC)


def _stub_dashas(*, include_date: datetime | None = None) -> VimshottariDashaData:
    """Minimal VimshottariDashaData for corrupt-tree tests.

    When ``include_date`` is set the single maha COVERS that instant but its
    antar_sequence is empty (corrupt). Without it the maha ends before 2035
    so any 2035 instant is fully out-of-tree.
    """
    maha_start = datetime(2020, 1, 1, tzinfo=UTC)
    maha_end = datetime(2030, 1, 1, tzinfo=UTC)
    maha = MahaDashaPeriod(
        lord=PlanetName.JUPITER,
        start_date=maha_start,
        end_date=maha_end,
        duration_years=10.0,
        antar_sequence=[],  # deliberately broken
    )
    return VimshottariDashaData(maha_dasha_sequence=[maha])


def test_active_lords_raises_on_corrupt_antar() -> None:
    """ValueError when a date inside a maha has no covering antardasha (empty antar_sequence)."""
    dashas = _stub_dashas(include_date=datetime(2025, 6, 1, 12, tzinfo=UTC))
    inside = datetime(2025, 6, 1, 12, tzinfo=UTC)
    with pytest.raises(ValueError, match="JUPITER"):
        _active_lords_at(dashas, inside)


def test_active_lords_no_raise_outside_tree() -> None:
    """Dates entirely outside the dasha tree return () without raising."""
    dashas = _stub_dashas()
    outside = datetime(2035, 1, 1, 12, tzinfo=UTC)
    assert _active_lords_at(dashas, outside) == ()


@pytest.fixture(scope="module")
def ctx_a() -> SiderealContext:
    return calculate_sidereal_context(_BIRTH_A, _LAT, _LON, reference_date=_REF)


@pytest.fixture(scope="module")
def ctx_b() -> SiderealContext:
    return calculate_sidereal_context(_BIRTH_B, _LAT, _LON, reference_date=_REF)


def _marriage(on: date) -> RectificationEventInput:
    return RectificationEventInput(date=on, category=EventType.MARRIAGE)


def _candidate_dates(ctx: SiderealContext) -> list[date]:
    """Antar-midpoint dates spanning the fixture's dasha tree."""
    return [
        (antar.start_date + (antar.end_date - antar.start_date) / 2).date()
        for maha in ctx.dashas.maha_dasha_sequence
        for antar in maha.antar_sequence
    ]


def _first_date_with_active_lord(ctx: SiderealContext, lord: PlanetName) -> date:
    """Earliest candidate date at which ``lord`` is among the active MD/AD/PD lords."""
    for day in _candidate_dates(ctx):
        if lord in _active_lords_at(ctx.dashas, _event_instant(day)):
            return day
    raise AssertionError(f"{lord} is never active in the fixture tree")


def test_active_seventh_lord_fires_rules_h7(ctx_a: SiderealContext) -> None:
    # Given a marriage dated when candidate A's own 7th-lord is the active lord
    seventh_lord = ctx_a.houses[7].sign_lord
    when = _first_date_with_active_lord(ctx_a, seventh_lord)
    # When the event is scored against candidate A
    evidence = extract_event_signals(ctx_a, _marriage(when))
    # Then the 7th-rulership signal fires and contributes the primary weight
    assert "dasha_lord_rules_h7" in evidence.signals
    assert evidence.contribution >= W_PRIMARY
    assert evidence.category == EventType.MARRIAGE
    assert evidence.date == when
    assert evidence.event_index == 0  # default; Task 8 overrides


def _quiet_seventh_date(ctx: SiderealContext) -> date:
    """A candidate date where NO active lord rules OR occupies the 7th house."""
    seventh_lord = ctx.houses[7].sign_lord
    occupants = {p.name for p in ctx.planets.values() if p.house == 7}
    for day in _candidate_dates(ctx):
        active = set(_active_lords_at(ctx.dashas, _event_instant(day)))
        if seventh_lord not in active and not (active & occupants):
            return day
    raise AssertionError("no quiet-7th date in fixture tree")


def test_inactive_seventh_lord_yields_no_dasha_h7(ctx_a: SiderealContext) -> None:
    # Given a date where neither the 7th-lord nor any 7th occupant is active
    when = _quiet_seventh_date(ctx_a)
    # When scored, the dasha-house signals must stay silent (transit may differ)
    evidence = extract_event_signals(ctx_a, _marriage(when))
    assert "dasha_lord_rules_h7" not in evidence.signals
    assert "dasha_lord_in_h7" not in evidence.signals


def _discriminating_date(
    ctx_a: SiderealContext, ctx_b: SiderealContext, lord_a: PlanetName, lord_b: PlanetName
) -> date:
    """A date where A's 7th-lord is active but B's 7th-lord is not."""
    for day in _candidate_dates(ctx_a):
        in_a = lord_a in _active_lords_at(ctx_a.dashas, _event_instant(day))
        in_b = lord_b in _active_lords_at(ctx_b.dashas, _event_instant(day))
        if in_a and not in_b:
            return day
    raise AssertionError("no ascendant-discriminating date in fixture tree")


def test_ascendant_rotation_discriminates_candidates(
    ctx_a: SiderealContext, ctx_b: SiderealContext
) -> None:
    # Given two birth times that rotate the ascendant (and the 7th lordship)
    assert ctx_a.lagna.sign != ctx_b.lagna.sign
    lord_a, lord_b = ctx_a.houses[7].sign_lord, ctx_b.houses[7].sign_lord
    assert lord_a != lord_b
    # And the SAME marriage date, chosen so only A's 7th-lord is then active
    when = _discriminating_date(ctx_a, ctx_b, lord_a, lord_b)
    ev_a = extract_event_signals(ctx_a, _marriage(when))
    ev_b = extract_event_signals(ctx_b, _marriage(when))
    # Then the inverse scorer separates the candidates on the identical input
    assert "dasha_lord_rules_h7" in ev_a.signals
    assert "dasha_lord_rules_h7" not in ev_b.signals
    assert ev_a.contribution > 0
    assert ev_a != ev_b


def test_signal_keys_and_contribution_math(ctx_a: SiderealContext) -> None:
    # Given any firing event, with an explicit event_index from the caller
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    evidence = extract_event_signals(ctx_a, _marriage(when), event_index=3)
    # The caller's index is preserved and the rulership signal explicitly fired
    assert evidence.event_index == 3
    assert "dasha_lord_rules_h7" in evidence.signals
    # Every key is a valid machine key for one of MARRIAGE's classical houses
    # (built from category_houses so the test tracks any future house-map change)
    valid_keys = {
        f"{prefix}_h{h}"
        for h in category_houses(EventType.MARRIAGE)
        for prefix in ("dasha_lord_rules", "dasha_lord_in", "slow_transit")
    }
    assert all(s in valid_keys for s in evidence.signals)
    # Contribution is exactly the sum of per-signal weights
    expected = sum(
        W_TRANSIT if s.startswith("slow_transit") else W_PRIMARY for s in evidence.signals
    )
    assert evidence.contribution == pytest.approx(expected)


def test_slow_transit_signal_matches_gochara(ctx_a: SiderealContext) -> None:
    # Given a date on which a slow graha (Saturn) transits candidate A's 7th house
    when = date(2023, 2, 1)
    placements = calculate_transit_context(
        ctx_a, _BIRTH_A, transit_instant=_event_instant(when)
    ).gochara.placements
    slow_in_7 = any(
        placements[g].house_from_lagna == 7
        for g in (PlanetName.JUPITER, PlanetName.SATURN)
        if g in placements
    )
    # When scored, the transit signal agrees with the engine's own placement
    evidence = extract_event_signals(ctx_a, _marriage(when))
    assert slow_in_7  # fixture sanity: Saturn is in the 7th here, so the branch fires
    assert ("slow_transit_h7" in evidence.signals) == slow_in_7


# --------------------------------------------------------------------------- #
# Task 8: candidate aggregation, de-correlation, honest margin -> band gate.
# These guard against FALSE PRECISION — under-claiming (NEAR_TIE) is the safe
# failure for an anti-scam tool.
# --------------------------------------------------------------------------- #


def _candidate(fit: float) -> RectificationCandidate:
    """A minimal candidate carrying only the fit score that ranking cares about."""
    return RectificationCandidate(
        ascendant_sign=ZodiacSign.LEO,
        representative_time_local="06:00",
        lagna_longitude_deg=120.0,
        lagna_cusp_distance_deg=5.0,
        is_near_cusp=False,
        fit_score=fit,
        supporting_events=[],
    )


def _evidence(contribution: float, category: EventType = EventType.MARRIAGE) -> EventEvidence:
    """Synthetic evidence with a fixed contribution for de-correlation math."""
    return EventEvidence(
        event_index=0,
        category=category,
        date=date(2020, 1, 1),
        signals=[],
        contribution=contribution,
    )


def test_two_separated_candidates_are_consistent() -> None:
    # Given one candidate fitting the events far better than the other
    ranked, margin, band = rank_candidates(
        [_candidate(1.0), _candidate(5.0)], discriminating_event_count=MIN_DISCRIMINATING_EVENTS
    )
    # Then ranking sorts it on top, the margin clears the bar, and the band is CONSISTENT
    assert ranked[0].fit_score == 5.0
    assert margin > CONSISTENT_MARGIN
    assert band is RectificationBand.CONSISTENT


def test_near_equal_candidates_are_near_tie() -> None:
    # Given two near-equal fits (a coin-flip)
    _ranked, margin, band = rank_candidates(
        [_candidate(1.0), _candidate(0.95)], discriminating_event_count=MIN_DISCRIMINATING_EVENTS
    )
    # Then the honest verdict is NEAR_TIE, never a fabricated lean
    assert margin < NEAR_TIE_MARGIN
    assert band is RectificationBand.NEAR_TIE


def test_intermediate_separation_leans() -> None:
    # Given a real-but-modest separation
    _ranked, margin, band = rank_candidates(
        [_candidate(1.0), _candidate(0.6)], discriminating_event_count=MIN_DISCRIMINATING_EVENTS
    )
    # Then the band is the cautious middle, LEANS
    assert NEAR_TIE_MARGIN <= margin < CONSISTENT_MARGIN
    assert band is RectificationBand.LEANS


def test_single_candidate_has_zero_margin() -> None:
    # Given only one candidate there is nothing to compare against
    _ranked, margin, band = rank_candidates(
        [_candidate(3.0)], discriminating_event_count=MIN_DISCRIMINATING_EVENTS
    )
    assert margin == 0.0
    assert band is RectificationBand.NEAR_TIE


def test_min_evidence_gate_forces_near_tie_despite_large_margin() -> None:
    # Given a strong separation that WOULD read CONSISTENT...
    _ranked, margin, band = rank_candidates(
        [_candidate(5.0), _candidate(1.0)],
        discriminating_event_count=MIN_DISCRIMINATING_EVENTS - 1,
    )
    # ...but with too few discriminating events, honesty FORCES NEAR_TIE
    assert margin > CONSISTENT_MARGIN
    assert band is RectificationBand.NEAR_TIE


def test_decorrelation_caps_stacked_same_category_events() -> None:
    # Given five identical same-category events vs a single one
    total_one = _decorrelated_total([_evidence(1.0)])
    total_five = _decorrelated_total([_evidence(1.0) for _ in range(5)])
    # Then a single event scores its full weight
    assert total_one == pytest.approx(1.0)
    # And five duplicates are hard-capped (never the naive 5.0) and sub-linear
    assert total_five <= CATEGORY_CAP
    assert total_five < 2 * total_one  # geometric ceiling: diminishing returns
    assert total_five < 5 * total_one  # the anti-stacking guarantee


def test_decorrelation_is_per_category_not_global() -> None:
    # Given two events in DIFFERENT categories (independent evidence)
    mixed = [_evidence(1.0, EventType.MARRIAGE), _evidence(1.0, EventType.PROMOTION)]
    # Then they add up fully — de-correlation only damps same-category clusters
    assert _decorrelated_total(mixed) == pytest.approx(2.0)


def test_score_candidate_fills_candidate_from_context(ctx_a: SiderealContext) -> None:
    # Given a marriage on a date where candidate A's 7th-lord is active
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    cand = score_candidate(ctx_a, [_marriage(when)], birth_dt=_BIRTH_A)
    # Then the candidate mirrors the context's lagna and carries indexed evidence
    assert cand.ascendant_sign == ctx_a.lagna.sign
    assert cand.lagna_longitude_deg == ctx_a.lagna.longitude
    assert cand.is_near_cusp == ctx_a.lagna.is_near_cusp
    assert cand.representative_time_local == _BIRTH_A.strftime("%H:%M")
    assert cand.supporting_events[0].event_index == 0
    assert cand.fit_score > 0


def test_score_candidate_decorrelates_repeated_events(ctx_a: SiderealContext) -> None:
    # Given the SAME firing marriage entered once vs five times
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    fit_one = score_candidate(ctx_a, [_marriage(when)], birth_dt=_BIRTH_A).fit_score
    fit_five = score_candidate(ctx_a, [_marriage(when)] * 5, birth_dt=_BIRTH_A).fit_score
    # Then stacking cannot inflate the fit linearly or past the per-category cap
    assert fit_one > 0
    assert fit_five < 5 * fit_one
    assert fit_five <= max(CATEGORY_CAP, fit_one) + EPS


def test_precomputed_transit_signs_match_internal_path(ctx_a: SiderealContext) -> None:
    # Given a date where a slow graha transits candidate A's 7th house
    when = date(2023, 2, 1)
    signs = compute_transit_signs([_marriage(when)])
    # When scored via the orchestrator's PRECOMPUTED signs (whole per-instant map)
    # vs the internal fallback — results must be signal-for-signal identical
    ev_precomp = extract_event_signals(ctx_a, _marriage(when), transit_signs=signs)
    ev_fallback = extract_event_signals(ctx_a, _marriage(when))
    # Then the two paths are identical, signal-for-signal
    assert ev_precomp.signals == ev_fallback.signals
    assert ev_precomp.contribution == pytest.approx(ev_fallback.contribution)
    # And both agree with the engine's own gochara placement (no behavior drift)
    placements = calculate_transit_context(
        ctx_a, _BIRTH_A, transit_instant=_event_instant(when)
    ).gochara.placements
    slow_in_7 = any(
        placements[g].house_from_lagna == 7
        for g in (PlanetName.JUPITER, PlanetName.SATURN)
        if g in placements
    )
    assert slow_in_7
    assert ("slow_transit_h7" in ev_precomp.signals) == slow_in_7


# --------------------------------------------------------------------------- #
# Finding 1 regression: slow-graha filter in _transit_houses
# --------------------------------------------------------------------------- #


def test_fast_graha_transit_is_ignored_by_transit_houses(ctx_a: SiderealContext) -> None:
    """Fast grahas in the transit map must not fire spurious slow_transit_hN signals.

    Regression (Finding 1): the old implementation iterated transit_signs.values()
    for ALL entries, so a caller passing a wider transit map (e.g. all grahas) would
    have fast planets fire spurious slow_transit_hN signals, inflating fit scores and
    potentially pushing a NEAR_TIE result to CONSISTENT — the anti-scam failure this
    module is designed to prevent.

    Test is RED before the filter fix: with_fast produces a strictly larger house-set
    than slow_only because Sun's sign (Scorpio) maps to a distinct house.
    """
    slow_only: dict[PlanetName, ZodiacSign] = {
        PlanetName.JUPITER: ZodiacSign.GEMINI,
        PlanetName.SATURN: ZodiacSign.VIRGO,
    }
    # Sun is a fast graha in Scorpio — a third distinct sign/house from Jupiter/Saturn.
    # Before the fix, its house leaks into the result; after the fix it is filtered out.
    with_fast: dict[PlanetName, ZodiacSign] = {
        **slow_only,
        PlanetName.SUN: ZodiacSign.SCORPIO,  # fast graha — must be silently filtered
    }
    houses_slow = _transit_houses(ctx_a, slow_only)
    houses_wide = _transit_houses(ctx_a, with_fast)
    assert houses_slow == houses_wide, (
        "Fast graha (Sun in Scorpio) must not contribute a slow_transit house; "
        f"got {houses_wide!r}, expected {houses_slow!r}"
    )


# ---------------------------------------------------------------------------
# Task 2: _event_instants — deterministic per-precision instant grid
# ---------------------------------------------------------------------------


def test_event_instants_exact_is_single_noon_instant() -> None:
    d = date(2005, 6, 15)
    instants = _event_instants(d, EventDatePrecision.EXACT)
    assert instants == (_event_instant(d),)


def test_event_instants_counts_and_span() -> None:
    d = date(2005, 6, 15)
    assert len(_event_instants(d, EventDatePrecision.MONTH)) == 3
    year = _event_instants(d, EventDatePrecision.YEAR)
    assert len(year) == 13
    assert all(t.tzinfo == UTC and t.hour == 12 for t in year)
    # inclusive span = ±182 days
    assert year[0].date() == d - timedelta(days=182)
    assert year[-1].date() == d + timedelta(days=182)
    assert len(_event_instants(d, EventDatePrecision.APPROX)) == 25


def test_event_instants_are_sorted_and_deterministic() -> None:
    d = date(2010, 1, 1)
    a = _event_instants(d, EventDatePrecision.APPROX)
    assert list(a) == sorted(a)
    assert a == _event_instants(d, EventDatePrecision.APPROX)  # pure


# ---------------------------------------------------------------------------
# Task 3: compute_transit_signs — per-instant, window-aware, skips APPROX
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rect_astronomy():  # type: ignore[return]
    from almamesh.rectification.candidates import make_astronomy

    return make_astronomy()


def test_compute_transit_signs_keyed_by_instant_covers_window(
    rect_astronomy: object,
) -> None:
    # Given a MONTH-precision event (3 instants in its window)
    ev = RectificationEventInput(
        date=date(2005, 6, 15),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.MONTH,
    )
    signs = compute_transit_signs([ev], astronomy=rect_astronomy)  # type: ignore[arg-type]
    # Then the result is keyed by datetime and covers every window instant
    for instant in _event_instants(ev.date, EventDatePrecision.MONTH):
        assert instant in signs, f"missing instant {instant} in transit-signs map"
    assert len(signs) == len(_event_instants(ev.date, EventDatePrecision.MONTH))


def test_compute_transit_signs_skips_approx_events(
    rect_astronomy: object,
) -> None:
    # APPROX events contribute zero instants — transit signal is zeroed downstream
    ev = RectificationEventInput(
        date=date(2005, 6, 15),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.APPROX,
    )
    assert compute_transit_signs([ev], astronomy=rect_astronomy) == {}  # type: ignore[arg-type]

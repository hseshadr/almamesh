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

import re
from datetime import UTC, date, datetime, timedelta

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import (
    SIGN_LORDS,
    ZODIAC_SIGNS,
    Dignity,
    EventType,
    PlanetName,
    ZodiacSign,
)
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
    MISS_SILENT,
    MISS_UNEXPLAINED,
    NEAR_TIE_MARGIN,
    PENALTY_CLAMP_RATIO,
    VALENCE_BOOST,
    VALENCE_MISMATCH_DAMP,
    W_ANTAR,
    W_D9_H7,
    W_D9_LAGNA_LORD,
    W_PRATYANTAR,
    W_PRIMARY,
    _active_lords_at,
    _decorrelate_by_category,
    _event_instant,
    _event_instants,
    _transit_houses,
    compute_transit_signs,
    extract_event_signals,
    rank_candidates,
    score_candidate,
    silent_activation_misses,
)
from almamesh.schemas.astrology import DashaPeriod as _DashaPeriod
from almamesh.schemas.astrology import (
    HouseCuspData,
    LagnaData,
    MahaDashaPeriod,
    NavamsaChart,
    PlanetPosition,
    SiderealContext,
    VargaPlanet,
    VimshottariDashaData,
)
from almamesh.transits import calculate_transit_context

# The full Spec-062 signal-key grammar (mirrors the scorer module docstring).
_GRAMMAR_RE = re.compile(
    r"^(?:(?:md|ad|pd)_lord_(?:rules|in)_h(?:[1-9]|1[0-2])"
    r"|slow_transit_h(?:[1-9]|1[0-2])"
    r"|d9_lord_rules_d9_h7|d9_lord_in_d9_h7|d9_lord_is_d9_lagna_lord)"
    r"(?:#(?:afflicted|dignified)_fit)?$"
    r"|^miss_unexplained$"
)

_DEPTH_HOUSE_RE = re.compile(r"^(md|ad|pd)_lord_(rules|in)_h(\d+)(?:#\w+)?$")


def _depth_keys(signals: list[str], kind: str, house: int) -> list[str]:
    """All depth-qualified dasha keys of one kind (rules/in) for one house."""
    return [
        s
        for s in signals
        if (m := _DEPTH_HOUSE_RE.match(s)) and m.group(2) == kind and int(m.group(3)) == house
    ]


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
    # Then a depth-qualified 7th-rulership signal fires with positive weight
    assert _depth_keys(evidence.signals, "rules", 7)
    assert evidence.contribution > 0
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
    assert not _depth_keys(evidence.signals, "rules", 7)
    assert not _depth_keys(evidence.signals, "in", 7)


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
    assert _depth_keys(ev_a.signals, "rules", 7)
    assert not _depth_keys(ev_b.signals, "rules", 7)
    assert ev_a.contribution > 0
    assert ev_a != ev_b


def test_signal_keys_match_grammar(ctx_a: SiderealContext) -> None:
    # Given any firing event, with an explicit event_index from the caller
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    evidence = extract_event_signals(ctx_a, _marriage(when), event_index=3)
    # The caller's index is preserved and a depth-qualified rulership fired
    assert evidence.event_index == 3
    assert _depth_keys(evidence.signals, "rules", 7)
    # Every emitted key parses under the documented Spec-062 grammar
    assert all(_GRAMMAR_RE.match(s) for s in evidence.signals), evidence.signals
    # And every house-scoped key targets one of MARRIAGE's classical houses
    houses = {str(h) for h in category_houses(EventType.MARRIAGE)}
    for s in evidence.signals:
        m = _DEPTH_HOUSE_RE.match(s)
        if m:
            assert m.group(3) in houses, s


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
    # Given five identical same-category contributions vs a single one
    # (exercised through the LIVE aggregation path used by score_candidate)
    total_one = _decorrelate_by_category([(EventType.MARRIAGE, 1.0)])
    total_five = _decorrelate_by_category([(EventType.MARRIAGE, 1.0)] * 5)
    # Then a single event scores its full weight
    assert total_one == pytest.approx(1.0)
    # And five duplicates are hard-capped (never the naive 5.0) and sub-linear
    assert total_five <= CATEGORY_CAP
    assert total_five < 2 * total_one  # geometric ceiling: diminishing returns
    assert total_five < 5 * total_one  # the anti-stacking guarantee


def test_decorrelation_is_per_category_not_global() -> None:
    # Given two contributions in DIFFERENT categories (independent evidence)
    mixed = [(EventType.MARRIAGE, 1.0), (EventType.PROMOTION, 1.0)]
    # Then they add up fully — de-correlation only damps same-category clusters
    assert _decorrelate_by_category(mixed) == pytest.approx(2.0)


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


# ---------------------------------------------------------------------------
# Task 4: precision-aware marginalization in extract_event_signals
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rect_context(ctx_a: SiderealContext) -> SiderealContext:
    """Module-scoped context for Task-4 back-compat tests — delegates to ctx_a.

    Reuses the same _BIRTH_A / _LAT / _LON / _REF synthetic native so the
    back-compat assertion is anchored to an already-trusted fixture.
    """
    return ctx_a


def test_exact_precision_is_deterministic_and_grammar_valid(
    rect_context: SiderealContext,
) -> None:
    """EXACT (n=1 instant): the evidence is pure and its snapshot obeys the grammar.

    Under Spec 062 the pre-062 pooled ``dasha_lord_*`` keys are replaced by
    depth-qualified keys, so the old byte-level legacy probe no longer applies;
    the invariants that remain are determinism and grammar validity, plus the
    sign convention: a silent event reads exactly ``-MISS_UNEXPLAINED``.
    """
    ev = RectificationEventInput(date=date(2005, 6, 15), category=EventType.MARRIAGE)
    signs = compute_transit_signs([ev])  # single noon-UTC instant for EXACT
    first = extract_event_signals(rect_context, ev, transit_signs=signs)
    second = extract_event_signals(rect_context, ev, transit_signs=signs)
    assert first == second
    assert all(_GRAMMAR_RE.match(s) for s in first.signals), first.signals
    if first.signals == ["miss_unexplained"]:
        assert first.contribution == pytest.approx(-MISS_UNEXPLAINED)
    else:
        assert first.contribution > 0


def test_approx_zeros_transit_contribution(rect_context: SiderealContext) -> None:
    """APPROX events must never emit slow_transit signals, even when transit signs would fire.

    2023-02-01 is chosen because Saturn transits ctx_a's 7th house on that date
    (confirmed by ``test_slow_transit_signal_matches_gochara``).  Before Task-4
    the code falls back to ``_fallback_signs`` for APPROX with an empty map and
    would fire 'slow_transit_h7'; after Task-4 APPROX hard-zeroes transit.
    """
    ev = RectificationEventInput(
        date=date(2023, 2, 1),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.APPROX,
    )
    evidence = extract_event_signals(rect_context, ev, transit_signs={})
    assert all(not s.startswith("slow_transit") for s in evidence.signals)


# =============================================================================
# Spec 062 (E1–E4): fully synthetic contexts — every lordship, occupancy,
# dignity, and dasha depth is test-controlled; zero astronomy involved.
# SYNTHETIC natives only — never real birth data.
# =============================================================================

_SIGN_IDX: dict[ZodiacSign, int] = {sign: i for i, sign in enumerate(ZodiacSign)}


def _wsign(i: int) -> ZodiacSign:
    return ZodiacSign(ZODIAC_SIGNS[i % 12])


def _mk_dashas(
    maha_lord: PlanetName,
    antars: list[tuple[PlanetName, datetime, datetime]],
) -> VimshottariDashaData:
    """One synthetic maha whose antar rows are given verbatim (dates arbitrary)."""
    start = antars[0][1]
    end = antars[-1][2]
    rows = [
        _DashaPeriod(lord=lord, start_date=s, end_date=e, duration_years=1.0)
        for lord, s, e in antars
    ]
    maha = MahaDashaPeriod(
        lord=maha_lord, start_date=start, end_date=end, duration_years=10.0, antar_sequence=rows
    )
    return VimshottariDashaData(maha_dasha_sequence=[maha])


def _mk_context(
    lagna_sign: ZodiacSign,
    dashas: VimshottariDashaData,
    *,
    planet_houses: dict[PlanetName, int] | None = None,
    dignities: dict[PlanetName, Dignity] | None = None,
    combust: frozenset[PlanetName] = frozenset(),
    navamsa: NavamsaChart | None = None,
) -> SiderealContext:
    """Whole-sign synthetic context: houses derive from the lagna; rest defaulted."""
    lagna_idx = _SIGN_IDX[lagna_sign]
    houses = {
        h: HouseCuspData(
            house=h,
            longitude=((lagna_idx + h - 1) % 12) * 30.0,
            sign=_wsign(lagna_idx + h - 1),
            sign_lord=SIGN_LORDS[_wsign(lagna_idx + h - 1)],
        )
        for h in range(1, 13)
    }
    planets = {}
    for p in PlanetName:
        house = (planet_houses or {}).get(p, 1)
        sign = _wsign(lagna_idx + house - 1)
        planets[p] = PlanetPosition(
            name=p,
            longitude=((lagna_idx + house - 1) % 12) * 30.0 + 15.0,
            sign=sign,
            sign_degrees=15.0,
            sign_lord=SIGN_LORDS[sign],
            nakshatra="Ashwini",
            nakshatra_pada=1,
            nakshatra_lord=PlanetName.KETU,
            house=house,
            dignity=(dignities or {}).get(p, Dignity.NEUTRAL),
            is_combust=p in combust,
        )
    lagna = LagnaData(
        longitude=lagna_idx * 30.0 + 15.0,
        sign=lagna_sign,
        sign_degrees=15.0,
        sign_lord=SIGN_LORDS[lagna_sign],
        nakshatra="Ashwini",
        nakshatra_pada=1,
        nakshatra_lord=PlanetName.KETU,
    )
    return SiderealContext(
        ayanamsa_value=24.0,
        lagna=lagna,
        planets=planets,
        houses=houses,
        dashas=dashas,
        yogas=[],
        navamsa=navamsa,
    )


def _mk_navamsa(
    lagna_sign: ZodiacSign, placements: dict[PlanetName, ZodiacSign] | None = None
) -> NavamsaChart:
    default = ZodiacSign.ARIES
    planets = {
        p: VargaPlanet(
            name=p,
            sign=(placements or {}).get(p, default),
            sign_lord=SIGN_LORDS[(placements or {}).get(p, default)],
        )
        for p in PlanetName
    }
    return NavamsaChart(
        lagna_sign=lagna_sign, lagna_sign_lord=SIGN_LORDS[lagna_sign], planets=planets
    )


def _noon_scan(
    dashas: VimshottariDashaData,
    lo: date,
    hi: date,
    predicate,  # type: ignore[no-untyped-def]
) -> date:
    """First date in [lo, hi] whose noon-UTC active (md, ad, pd) satisfies predicate."""
    day = lo
    while day <= hi:
        lords = _active_lords_at(dashas, _event_instant(day))
        if lords and predicate(lords):
            return day
        day += timedelta(days=1)
    raise AssertionError("no instant satisfying predicate in scan range")


def _empty_signs(
    events: list[RectificationEventInput],
) -> dict[datetime, dict[PlanetName, ZodiacSign]]:
    """A transit map that silences the transit channel for every window instant."""
    return {instant: {} for ev in events for instant in _event_instants(ev.date, ev.precision)}


def _score_one(ctx: SiderealContext, event: RectificationEventInput) -> EventEvidence:
    return extract_event_signals(ctx, event, transit_signs=_empty_signs([event]))


_Y = datetime  # brevity for dasha rows


# --------------------------- E1: depth-aware keys ----------------------------


def test_md_only_rules_hit_emits_md_key_full_weight() -> None:
    # Aries lagna → h7 = Libra → lord VENUS. Venus is ONLY the maha lord.
    dashas = _mk_dashas(
        PlanetName.VENUS,
        [(PlanetName.SUN, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    when = date(2014, 1, 2)  # early antar → pd == ad == SUN, md == VENUS
    assert _active_lords_at(dashas, _event_instant(when)) == (
        PlanetName.VENUS,
        PlanetName.SUN,
        PlanetName.SUN,
    )
    evidence = _score_one(ctx, _marriage(when))
    assert evidence.signals == ["md_lord_rules_h7"]
    assert evidence.contribution == pytest.approx(W_PRIMARY)


def test_ad_only_rules_hit_emits_ad_key_antar_weight() -> None:
    # Venus is ONLY the antar lord: scan for a pd != VENUS instant inside its antar.
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.VENUS, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    when = _noon_scan(
        dashas,
        date(2014, 1, 1),
        date(2015, 12, 31),
        lambda lords: lords[1] == PlanetName.VENUS
        and lords[2]
        not in (
            PlanetName.VENUS,
            PlanetName.SUN,
        ),
    )
    evidence = _score_one(ctx, _marriage(when))
    assert evidence.signals == ["ad_lord_rules_h7"]
    assert evidence.contribution == pytest.approx(W_ANTAR)


def test_pd_only_rules_hit_emits_pd_key_timing_weight() -> None:
    # Venus is ONLY the pratyantar lord at the scanned instant.
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.MOON, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    when = _noon_scan(
        dashas,
        date(2014, 1, 1),
        date(2015, 12, 31),
        lambda lords: lords[2] == PlanetName.VENUS,
    )
    evidence = _score_one(ctx, _marriage(when))
    assert evidence.signals == ["pd_lord_rules_h7"]
    assert evidence.contribution == pytest.approx(W_PRATYANTAR)


def test_same_lord_md_and_pd_counts_once_deepest_key_max_weight() -> None:
    # Venus is maha lord AND pratyantar lord: ONE signal, keyed at the deepest
    # matching depth (pd), weighted at the highest matching depth (md = 1.0).
    dashas = _mk_dashas(
        PlanetName.VENUS,
        [(PlanetName.MOON, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    when = _noon_scan(
        dashas,
        date(2014, 1, 1),
        date(2015, 12, 31),
        lambda lords: lords[2] == PlanetName.VENUS,
    )
    evidence = _score_one(ctx, _marriage(when))
    assert evidence.signals == ["pd_lord_rules_h7"]
    assert evidence.contribution == pytest.approx(W_PRIMARY)  # max weight, once


def test_distinct_lords_occupying_house_fire_once_per_lord() -> None:
    # Jupiter (md) and Mars (ad == pd early in antar) BOTH occupy h7: two
    # occupancy signals, each deduped to its lord's deepest depth.
    dashas = _mk_dashas(
        PlanetName.JUPITER,
        [(PlanetName.MARS, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(
        ZodiacSign.ARIES,
        dashas,
        planet_houses={PlanetName.JUPITER: 7, PlanetName.MARS: 7},
    )
    when = date(2014, 1, 2)
    assert _active_lords_at(dashas, _event_instant(when)) == (
        PlanetName.JUPITER,
        PlanetName.MARS,
        PlanetName.MARS,
    )
    evidence = _score_one(ctx, _marriage(when))
    assert sorted(evidence.signals) == ["md_lord_in_h7", "pd_lord_in_h7"]
    # Jupiter counts at md weight; Mars once at max(ad, pd) weight.
    assert evidence.contribution == pytest.approx(W_PRIMARY + W_ANTAR)


# --------------------------- E2: D9 navamsa-lagna ----------------------------


def _d9_dashas() -> VimshottariDashaData:
    """maha JUPITER, antar MERCURY; early instants give (JUPITER, MERCURY, MERCURY)."""
    return _mk_dashas(
        PlanetName.JUPITER,
        [(PlanetName.MERCURY, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )


def test_d9_signals_fire_for_relationship_event() -> None:
    # D9 lagna Gemini → D9-h7 = Sagittarius (lord JUPITER = active md lord).
    # Mercury (ad/pd) OCCUPIES D9 Sagittarius and RULES the D9 lagna (Gemini).
    navamsa = _mk_navamsa(
        ZodiacSign.GEMINI, placements={PlanetName.MERCURY: ZodiacSign.SAGITTARIUS}
    )
    ctx = _mk_context(ZodiacSign.ARIES, _d9_dashas(), navamsa=navamsa)
    evidence = _score_one(ctx, _marriage(date(2014, 1, 2)))
    assert sorted(evidence.signals) == [
        "d9_lord_in_d9_h7",
        "d9_lord_is_d9_lagna_lord",
        "d9_lord_rules_d9_h7",
    ]
    assert evidence.contribution == pytest.approx(W_D9_H7 + W_D9_H7 + W_D9_LAGNA_LORD)


def test_d9_signals_silent_for_non_relationship_event() -> None:
    # Same chart, CAREER_CHANGE (h10): D1 silent AND D9 must not fire → the
    # event is unexplained for this candidate and reads -MISS_UNEXPLAINED (E4.1).
    navamsa = _mk_navamsa(
        ZodiacSign.GEMINI, placements={PlanetName.MERCURY: ZodiacSign.SAGITTARIUS}
    )
    ctx = _mk_context(ZodiacSign.ARIES, _d9_dashas(), navamsa=navamsa)
    ev = RectificationEventInput(date=date(2014, 1, 2), category=EventType.CAREER_CHANGE)
    evidence = _score_one(ctx, ev)
    assert evidence.signals == ["miss_unexplained"]
    assert evidence.contribution == pytest.approx(-MISS_UNEXPLAINED)


def test_d9_childbirth_conservatively_excluded() -> None:
    navamsa = _mk_navamsa(
        ZodiacSign.GEMINI, placements={PlanetName.MERCURY: ZodiacSign.SAGITTARIUS}
    )
    ctx = _mk_context(ZodiacSign.ARIES, _d9_dashas(), navamsa=navamsa)
    ev = RectificationEventInput(date=date(2014, 1, 2), category=EventType.CHILDBIRTH)
    evidence = _score_one(ctx, ev)
    assert not any(s.startswith("d9_") for s in evidence.signals)


# ------------------------ E3: dignity-conditioned fit -------------------------


def _saturn_md_dashas() -> VimshottariDashaData:
    """maha SATURN, antar SUN; early instants give (SATURN, SUN, SUN)."""
    return _mk_dashas(
        PlanetName.SATURN,
        [(PlanetName.SUN, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )


def _career_event(category: EventType) -> RectificationEventInput:
    return RectificationEventInput(date=date(2014, 1, 2), category=category)


def test_valence_afflicted_lord_boosts_collapse_event() -> None:
    # Aries lagna → h10 = Capricorn → lord SATURN (the md lord), DEBILITATED.
    ctx = _mk_context(
        ZodiacSign.ARIES,
        _saturn_md_dashas(),
        dignities={PlanetName.SATURN: Dignity.DEBILITATED},
    )
    evidence = _score_one(ctx, _career_event(EventType.JOB_LOSS))
    assert evidence.signals == ["md_lord_rules_h10#afflicted_fit"]
    assert evidence.contribution == pytest.approx(W_PRIMARY * VALENCE_BOOST)


def test_valence_afflicted_lord_dampens_gain_event() -> None:
    ctx = _mk_context(
        ZodiacSign.ARIES,
        _saturn_md_dashas(),
        dignities={PlanetName.SATURN: Dignity.DEBILITATED},
    )
    evidence = _score_one(ctx, _career_event(EventType.PROMOTION))
    assert evidence.signals == ["md_lord_rules_h10"]  # mismatch: damped, no suffix
    assert evidence.contribution == pytest.approx(W_PRIMARY * VALENCE_MISMATCH_DAMP)


def test_valence_dignified_lord_boosts_gain_event() -> None:
    ctx = _mk_context(
        ZodiacSign.ARIES,
        _saturn_md_dashas(),
        dignities={PlanetName.SATURN: Dignity.EXALTED},
    )
    evidence = _score_one(ctx, _career_event(EventType.PROMOTION))
    assert evidence.signals == ["md_lord_rules_h10#dignified_fit"]
    assert evidence.contribution == pytest.approx(W_PRIMARY * VALENCE_BOOST)


def test_valence_combustion_counts_as_afflicted() -> None:
    ctx = _mk_context(
        ZodiacSign.ARIES,
        _saturn_md_dashas(),
        combust=frozenset({PlanetName.SATURN}),
    )
    evidence = _score_one(ctx, _career_event(EventType.JOB_LOSS))
    assert evidence.signals == ["md_lord_rules_h10#afflicted_fit"]
    assert evidence.contribution == pytest.approx(W_PRIMARY * VALENCE_BOOST)


def test_valence_neutral_event_never_multiplied() -> None:
    ctx = _mk_context(
        ZodiacSign.ARIES,
        _saturn_md_dashas(),
        dignities={PlanetName.SATURN: Dignity.DEBILITATED},
    )
    evidence = _score_one(ctx, _career_event(EventType.CAREER_CHANGE))
    assert evidence.signals == ["md_lord_rules_h10"]
    assert evidence.contribution == pytest.approx(W_PRIMARY)


# -------------------- E4.1: unexplained-event miss penalty --------------------


def test_unexplained_event_reads_minus_quarter() -> None:
    # Nothing rules/occupies h7 among active lords; transit silenced; no navamsa.
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.MOON, _Y(2014, 1, 1, tzinfo=UTC), _Y(2014, 3, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    when = date(2014, 1, 2)  # active = SUN/MOON/MOON; none touches Libra h7
    evidence = _score_one(ctx, _marriage(when))
    assert evidence.signals == ["miss_unexplained"]
    assert evidence.contribution == pytest.approx(-MISS_UNEXPLAINED)


def test_unexplained_month_precision_marginalizes_misses() -> None:
    # All 3 MONTH-grid instants silent → mean of three -0.25 samples = -0.25.
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.MOON, _Y(2013, 1, 1, tzinfo=UTC), _Y(2015, 1, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    ev = RectificationEventInput(
        date=date(2014, 1, 2),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.MONTH,
    )
    evidence = extract_event_signals(ctx, ev, transit_signs=_empty_signs([ev]))
    assert evidence.signals == ["miss_unexplained"]
    assert evidence.contribution == pytest.approx(-MISS_UNEXPLAINED)


# ------------------- E4.2: silent-activation miss penalties -------------------


def _venus_h7_context(venus_house: int, antars: list[tuple[PlanetName, datetime, datetime]]):
    """Aries-lagna context where VENUS rules h7 and occupies ``venus_house``."""
    dashas = _mk_dashas(PlanetName.SUN, antars)
    return _mk_context(ZodiacSign.ARIES, dashas, planet_houses={PlanetName.VENUS: venus_house})


_SILENT_ANTARS: list[tuple[PlanetName, datetime, datetime]] = [
    (PlanetName.VENUS, _Y(2012, 3, 1, tzinfo=UTC), _Y(2013, 3, 1, tzinfo=UTC)),  # explained
    (PlanetName.MOON, _Y(2013, 3, 1, tzinfo=UTC), _Y(2014, 6, 1, tzinfo=UTC)),
    (PlanetName.VENUS, _Y(2014, 6, 1, tzinfo=UTC), _Y(2015, 6, 1, tzinfo=UTC)),  # silent
    (PlanetName.MARS, _Y(2015, 6, 1, tzinfo=UTC), _Y(2016, 6, 1, tzinfo=UTC)),
    (PlanetName.VENUS, _Y(2016, 6, 1, tzinfo=UTC), _Y(2017, 6, 1, tzinfo=UTC)),  # silent
    (PlanetName.VENUS, _Y(2019, 1, 1, tzinfo=UTC), _Y(2020, 1, 1, tzinfo=UTC)),  # silent (3rd)
    (PlanetName.SUN, _Y(2020, 1, 1, tzinfo=UTC), _Y(2022, 1, 1, tzinfo=UTC)),
]

_SILENT_EVENTS = [
    RectificationEventInput(date=date(2012, 6, 1), category=EventType.MARRIAGE),
    RectificationEventInput(date=date(2021, 6, 1), category=EventType.MARRIAGE),
]


def test_silent_activation_detected_and_capped_at_two_per_category() -> None:
    # Venus rules AND occupies h7 → every Venus antar is a strong h7 signature.
    # The 2012 antar is explained by the reported marriage; three later Venus
    # antars are silent, but at most TWO penalties per category may apply.
    ctx = _venus_h7_context(7, _SILENT_ANTARS)
    misses = silent_activation_misses(ctx, _SILENT_EVENTS)
    assert misses == [
        (EventType.MARRIAGE, "miss_silent_marriage_h7"),
        (EventType.MARRIAGE, "miss_silent_marriage_h7"),
    ]


def test_silent_activation_requires_rules_and_occupies() -> None:
    # Venus rules h7 but sits in h1: rules-only is NOT the strong conjunction.
    ctx = _venus_h7_context(1, _SILENT_ANTARS)
    assert silent_activation_misses(ctx, _SILENT_EVENTS) == []


def test_silent_activation_respects_event_precision_tolerance() -> None:
    # A YEAR-precision marriage dated 2015-01-01 (±182d) overlaps the 2014-06 →
    # 2015-06 Venus antar, explaining it; only the later antars stay silent.
    ctx = _venus_h7_context(7, _SILENT_ANTARS)
    events = [
        *_SILENT_EVENTS,
        RectificationEventInput(
            date=date(2015, 1, 1),
            category=EventType.MARRIAGE,
            precision=EventDatePrecision.YEAR,
        ),
    ]
    misses = silent_activation_misses(ctx, events)
    assert misses == [
        (EventType.MARRIAGE, "miss_silent_marriage_h7"),
        (EventType.MARRIAGE, "miss_silent_marriage_h7"),
    ]


def test_silent_activation_ignores_periods_outside_coverage_window() -> None:
    # With only the 2012 event reported, the window ends 2012-06-01: the later
    # silent Venus antars fall outside it and must not be penalized.
    ctx = _venus_h7_context(7, _SILENT_ANTARS)
    assert silent_activation_misses(ctx, [_SILENT_EVENTS[0]]) == []


def test_no_events_no_silent_misses() -> None:
    ctx = _venus_h7_context(7, _SILENT_ANTARS)
    assert silent_activation_misses(ctx, []) == []


# ------------- E7: candidate split (positive/penalty/clamp/misses) ------------


def test_score_candidate_splits_positive_penalty_and_clamps() -> None:
    # One pd-only marriage hit (positive 0.5) + two silent Venus activations +
    # one unexplained career event. Raw penalties exceed the 50% clamp, so
    # penalty_total must land EXACTLY at PENALTY_CLAMP_RATIO * positive_total.
    antars = [
        (PlanetName.MOON, _Y(2010, 1, 1, tzinfo=UTC), _Y(2012, 1, 1, tzinfo=UTC)),
        *_SILENT_ANTARS,
    ]
    dashas = _mk_dashas(PlanetName.SUN, antars)
    ctx = _mk_context(ZodiacSign.ARIES, dashas, planet_houses={PlanetName.VENUS: 7})
    hit_day = _noon_scan(
        dashas,
        date(2010, 1, 1),
        date(2011, 12, 31),
        lambda lords: lords[2] == PlanetName.VENUS,
    )
    events = [
        RectificationEventInput(date=hit_day, category=EventType.MARRIAGE),
        RectificationEventInput(date=date(2021, 6, 1), category=EventType.CAREER_CHANGE),
    ]
    cand = score_candidate(
        ctx, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=_empty_signs(events)
    )
    # Positive: pd rules + pd occupies h7 (Venus does both) = 0.5 + 0.5 = 1.0
    assert cand.positive_total == pytest.approx(2 * W_PRATYANTAR)
    # Raw penalties: career unexplained 0.25 + silent marriage 0.15 + 0.075
    # (decayed) = 0.475 < clamp 0.5 → NOT clamped here; misses listed.
    assert cand.penalty_total == pytest.approx(0.25 + MISS_SILENT * 1.5)
    assert cand.misses == ["miss_silent_marriage_h7", "miss_silent_marriage_h7"]
    assert cand.fit_score == pytest.approx(
        cand.positive_total - cand.penalty_total + cand.prior_bonus
    )


def test_penalties_never_exceed_half_of_positive_total() -> None:
    # A candidate with a weak positive and heavy misses: clamp must bind.
    ctx = _venus_h7_context(7, _SILENT_ANTARS)
    events = [
        RectificationEventInput(date=date(2012, 6, 1), category=EventType.MARRIAGE),
        RectificationEventInput(date=date(2021, 6, 1), category=EventType.CAREER_CHANGE),
        RectificationEventInput(date=date(2021, 7, 1), category=EventType.HEALTH_ISSUE),
    ]
    cand = score_candidate(
        ctx, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=_empty_signs(events)
    )
    assert cand.penalty_total <= PENALTY_CLAMP_RATIO * cand.positive_total + EPS
    assert cand.fit_score == pytest.approx(
        cand.positive_total - cand.penalty_total + cand.prior_bonus
    )


def test_zero_positive_candidate_never_goes_negative_on_misses() -> None:
    # Every event unexplained → positive 0 → clamp forces penalty_total to 0.
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.MOON, _Y(2014, 1, 1, tzinfo=UTC), _Y(2014, 3, 1, tzinfo=UTC))],
    )
    ctx = _mk_context(ZodiacSign.ARIES, dashas)
    events = [RectificationEventInput(date=date(2014, 1, 2), category=EventType.MARRIAGE)]
    cand = score_candidate(
        ctx, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=_empty_signs(events)
    )
    assert cand.positive_total == 0.0
    assert cand.penalty_total == 0.0
    assert cand.fit_score == pytest.approx(cand.prior_bonus)


def test_score_candidate_populates_navamsa_lagna_sign(ctx_a: SiderealContext) -> None:
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    cand = score_candidate(ctx_a, [_marriage(when)], birth_dt=_BIRTH_A)
    assert ctx_a.navamsa is not None
    assert cand.navamsa_lagna_sign == ctx_a.navamsa.lagna_sign


# ---------------- Spec 062 synthetic scenarios (a)–(c) ------------------------


def test_scenario_depth_discrimination_pd_lord_separates_candidates() -> None:
    """(a) An exactly-dated event whose PD lord separates two candidates."""
    dashas = _mk_dashas(
        PlanetName.SUN,
        [(PlanetName.MOON, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    when = _noon_scan(
        dashas,
        date(2014, 1, 1),
        date(2015, 12, 31),
        lambda lords: lords[2] == PlanetName.VENUS and PlanetName.MARS not in lords,
    )
    ctx_aries = _mk_context(ZodiacSign.ARIES, dashas)  # h7 = Libra → VENUS (pd hit)
    ctx_taurus = _mk_context(ZodiacSign.TAURUS, dashas)  # h7 = Scorpio → MARS (silent)
    events = [RectificationEventInput(date=when, category=EventType.MARRIAGE)]
    signs = _empty_signs(events)
    cand_a = score_candidate(
        ctx_aries, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=signs
    )
    cand_b = score_candidate(
        ctx_taurus, events, birth_dt=_Y(1990, 1, 1, 6, 13, tzinfo=UTC), transit_signs=signs
    )
    assert "pd_lord_rules_h7" in cand_a.supporting_events[0].signals
    assert cand_a.fit_score > cand_b.fit_score
    ranked, _margin, _band = rank_candidates([cand_b, cand_a], discriminating_event_count=1)
    assert ranked[0] is cand_a


def test_scenario_d9_flip_marriage_decided_by_navamsa_lagna() -> None:
    """(b) Same rasi lagna, different navamsa lagna → the D9 test decides."""
    dashas = _mk_dashas(
        PlanetName.JUPITER,
        [(PlanetName.SUN, _Y(2014, 1, 1, tzinfo=UTC), _Y(2016, 1, 1, tzinfo=UTC))],
    )
    # Candidate A: D9 lagna Gemini → D9-h7 Sagittarius ruled by JUPITER (md) → hit.
    ctx_flip_a = _mk_context(ZodiacSign.ARIES, dashas, navamsa=_mk_navamsa(ZodiacSign.GEMINI))
    # Candidate B: D9 lagna Cancer → D9-h7 Capricorn ruled by SATURN (inactive).
    ctx_flip_b = _mk_context(ZodiacSign.ARIES, dashas, navamsa=_mk_navamsa(ZodiacSign.CANCER))
    events = [RectificationEventInput(date=date(2014, 1, 2), category=EventType.MARRIAGE)]
    signs = _empty_signs(events)
    cand_a = score_candidate(
        ctx_flip_a, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=signs
    )
    cand_b = score_candidate(
        ctx_flip_b, events, birth_dt=_Y(1990, 1, 1, 6, 13, tzinfo=UTC), transit_signs=signs
    )
    assert "d9_lord_rules_d9_h7" in cand_a.supporting_events[0].signals
    assert cand_a.navamsa_lagna_sign == ZodiacSign.GEMINI
    assert cand_b.navamsa_lagna_sign == ZodiacSign.CANCER
    assert cand_a.fit_score > cand_b.fit_score


def test_scenario_miss_penalty_demotes_silent_activation_candidate() -> None:
    """(c) Equal hits, but one candidate's chart is loudly silent → demoted,
    while the clamp keeps penalties ≤ 50% of the positive total."""
    # Both candidates score the SAME positive marriage hit (Venus antar 2012).
    # Candidate NOISY additionally has Venus in h7 → its later Venus antars are
    # strong-but-silent (miss); candidate QUIET has Venus in h1 → no misses.
    antars = _SILENT_ANTARS
    quiet = _venus_h7_context(1, antars)
    noisy = _venus_h7_context(7, antars)
    events = _SILENT_EVENTS
    signs = _empty_signs(events)
    cand_quiet = score_candidate(
        quiet, events, birth_dt=_Y(1990, 1, 1, 6, 0, tzinfo=UTC), transit_signs=signs
    )
    cand_noisy = score_candidate(
        noisy, events, birth_dt=_Y(1990, 1, 1, 6, 13, tzinfo=UTC), transit_signs=signs
    )
    assert cand_noisy.penalty_total > 0
    assert cand_noisy.penalty_total <= PENALTY_CLAMP_RATIO * cand_noisy.positive_total + EPS
    # Demoted relative to its own hit-only score — never below the 50% floor.
    assert cand_noisy.fit_score < cand_noisy.positive_total + cand_noisy.prior_bonus
    assert cand_noisy.misses  # the demotion is transparently attributed
    assert cand_quiet.misses == []

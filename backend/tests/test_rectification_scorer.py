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

from datetime import UTC, date, datetime

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import EventType, PlanetName
from almamesh.rectification.houses import category_houses
from almamesh.rectification.models import RectificationEventInput
from almamesh.rectification.scorer import (
    W_PRIMARY,
    W_TRANSIT,
    _active_lords_at,
    _event_instant,
    extract_event_signals,
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
    evidence = extract_event_signals(ctx_a, _marriage(when), birth_dt=_BIRTH_A)
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
    evidence = extract_event_signals(ctx_a, _marriage(when), birth_dt=_BIRTH_A)
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
    ev_a = extract_event_signals(ctx_a, _marriage(when), birth_dt=_BIRTH_A)
    ev_b = extract_event_signals(ctx_b, _marriage(when), birth_dt=_BIRTH_B)
    # Then the inverse scorer separates the candidates on the identical input
    assert "dasha_lord_rules_h7" in ev_a.signals
    assert "dasha_lord_rules_h7" not in ev_b.signals
    assert ev_a.contribution > 0
    assert ev_a != ev_b


def test_signal_keys_and_contribution_math(ctx_a: SiderealContext) -> None:
    # Given any firing event, with an explicit event_index from the caller
    when = _first_date_with_active_lord(ctx_a, ctx_a.houses[7].sign_lord)
    evidence = extract_event_signals(ctx_a, _marriage(when), birth_dt=_BIRTH_A, event_index=3)
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
    evidence = extract_event_signals(ctx_a, _marriage(when), birth_dt=_BIRTH_A)
    assert slow_in_7  # fixture sanity: Saturn is in the 7th here, so the branch fires
    assert ("slow_transit_h7" in evidence.signals) == slow_in_7

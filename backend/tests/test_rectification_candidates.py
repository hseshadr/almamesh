"""Tests for cusp candidate-time generation (Task 9 — TDD).

Synthetic Bengaluru cusp native fixture: 1988-08-08 01:14:00 UTC,
lat 12.9716, lon 77.5946 — never the owner's real data.
"""

from __future__ import annotations

import datetime

import pytest

from almamesh.calculations import get_ayanamsa
from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign
from almamesh.rectification.candidates import (
    FINE_N,
    CandidateTime,
    GeoPoint,
    _asc_longitude,
    _find_boundary_crossing,
    _sign_index,
    cusp_candidate_times,
    make_astronomy,
    window_candidate_times,
)

# Synthetic cusp native — NEVER real owner data.
_BIRTH_DT = datetime.datetime(1988, 8, 8, 1, 14, 0, tzinfo=datetime.UTC)
_LAT = 12.9716
_LON = 77.5946

# Mid-sign synthetic native: 45 min before cusp fixture, lagna ~mid-sign.
_MID_SIGN_DT = datetime.datetime(1988, 8, 8, 0, 29, 0, tzinfo=datetime.UTC)


@pytest.fixture(scope="module")
def astronomy():
    """One warm SkyfieldAstronomy instance shared across all tests in this module."""
    return make_astronomy()


@pytest.fixture(scope="module")
def candidates(astronomy):
    """Compute candidates once and reuse across assertions."""
    return cusp_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)


def test_returns_exactly_two_candidates(candidates: list[CandidateTime]) -> None:
    assert len(candidates) == 2
    for c in candidates:
        assert isinstance(c, CandidateTime)


def test_two_signs_are_adjacent(candidates: list[CandidateTime]) -> None:
    """The two candidate signs must be adjacent on the zodiac (wrapping Pisces→Aries)."""
    idx0 = ZODIAC_SIGNS.index(candidates[0].sign.value)
    idx1 = ZODIAC_SIGNS.index(candidates[1].sign.value)
    diff = abs(idx0 - idx1)
    assert diff == 1 or diff == 11  # 11 = wrapping Pisces/Aries boundary


def test_two_signs_are_distinct(candidates: list[CandidateTime]) -> None:
    """The two candidate signs must be different (not the same sign twice)."""
    assert candidates[0].sign != candidates[1].sign


def test_signs_are_zodiacsign_instances(candidates: list[CandidateTime]) -> None:
    for c in candidates:
        assert isinstance(c.sign, ZodiacSign)


def test_each_representative_time_yields_its_sign(
    candidates: list[CandidateTime], astronomy
) -> None:
    """Recomputing the ascendant at each representative dt_utc must match its sign."""
    for c in candidates:
        t = astronomy.ts.from_datetime(c.dt_utc)
        ayanamsa = get_ayanamsa(t.tt)
        recomputed_lon = astronomy.calculate_lagna(c.dt_utc, _LAT, _LON, ayanamsa)
        sign_idx = int(recomputed_lon // 30) % 12
        expected_idx = ZODIAC_SIGNS.index(c.sign.value)
        assert sign_idx == expected_idx, (
            f"Candidate {c.sign.value}: representative time {c.dt_utc} yields "
            f"{ZODIAC_SIGNS[sign_idx]}, expected {c.sign.value}"
        )


def test_stored_longitude_consistent_with_sign(candidates: list[CandidateTime]) -> None:
    """The stored lagna_longitude_deg must lie within its declared sign."""
    for c in candidates:
        sign_idx = int(c.lagna_longitude_deg // 30) % 12
        expected_idx = ZODIAC_SIGNS.index(c.sign.value)
        assert sign_idx == expected_idx, (
            f"{c.sign.value}: stored lon {c.lagna_longitude_deg:.4f}° is in "
            f"{ZODIAC_SIGNS[sign_idx]}, expected {c.sign.value}"
        )


def test_reuse_single_astronomy_instance_gives_same_result(astronomy) -> None:
    """Two calls with the same astronomy instance are deterministic."""
    first = cusp_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    second = cusp_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    for a, b in zip(first, second):
        assert a.sign == b.sign
        assert a.dt_utc == b.dt_utc
        assert abs(a.lagna_longitude_deg - b.lagna_longitude_deg) < 1e-10


def test_birth_dt_candidate_is_present(candidates: list[CandidateTime]) -> None:
    """One candidate's representative time is exactly the as-recorded birth_dt."""
    birth_times = [c.dt_utc for c in candidates]
    assert _BIRTH_DT in birth_times


def test_find_boundary_crossing_raises_when_lo_in_target(astronomy) -> None:
    """_find_boundary_crossing raises ValueError when lo is already in target sign."""
    geo = GeoPoint(_LAT, _LON)
    # Build a bracket where lo IS in the target sign (violates the precondition)
    lo = _BIRTH_DT - datetime.timedelta(minutes=5)
    hi = _BIRTH_DT
    lo_idx = _sign_index(_asc_longitude(astronomy, lo, geo))
    with pytest.raises(ValueError, match="Precondition violated"):
        _find_boundary_crossing(astronomy, lo, hi, geo, lo_idx)


def test_find_boundary_crossing_raises_when_hi_not_in_target(astronomy) -> None:
    """_find_boundary_crossing raises ValueError when hi is not in target sign."""
    geo = GeoPoint(_LAT, _LON)
    lo = _BIRTH_DT - datetime.timedelta(minutes=5)
    hi = _BIRTH_DT
    hi_idx = _sign_index(_asc_longitude(astronomy, hi, geo))
    # Pick a target that hi is NOT in (next sign)
    wrong_target = (hi_idx + 2) % 12
    with pytest.raises(ValueError, match="Precondition violated"):
        _find_boundary_crossing(astronomy, lo, hi, geo, wrong_target)


def test_mid_sign_returns_two_adjacent_candidates(astronomy) -> None:
    """A birth well inside a sign (not on a cusp) still yields exactly 2 adjacent candidates."""
    candidates = cusp_candidate_times(_MID_SIGN_DT, _LAT, _LON, astronomy=astronomy)
    assert len(candidates) == 2
    assert candidates[0].sign != candidates[1].sign
    idx0 = ZODIAC_SIGNS.index(candidates[0].sign.value)
    idx1 = ZODIAC_SIGNS.index(candidates[1].sign.value)
    diff = abs(idx0 - idx1)
    assert diff == 1 or diff == 11, f"Signs {candidates[0].sign}/{candidates[1].sign} not adjacent"


def test_mid_sign_both_representatives_yield_stated_sign(astronomy) -> None:
    """For a mid-sign birth, both representative times recompute to their declared signs."""
    candidates = cusp_candidate_times(_MID_SIGN_DT, _LAT, _LON, astronomy=astronomy)
    for c in candidates:
        t = astronomy.ts.from_datetime(c.dt_utc)
        ayanamsa = get_ayanamsa(t.tt)
        recomputed_lon = astronomy.calculate_lagna(c.dt_utc, _LAT, _LON, ayanamsa)
        sign_idx = int(recomputed_lon // 30) % 12
        expected_idx = ZODIAC_SIGNS.index(c.sign.value)
        assert sign_idx == expected_idx, (
            f"Mid-sign candidate {c.sign.value}: dt {c.dt_utc} yields "
            f"{ZODIAC_SIGNS[sign_idx]}, expected {c.sign.value}"
        )


# ── window_candidate_times tests (Task 17) ────────────────────────────────────


def test_whole_day_coarse_signs_are_distinct(astronomy) -> None:
    """Whole-day coarse must dedupe: all returned signs are unique."""
    candidates = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    signs = [c.sign for c in candidates]
    assert len(signs) == len(set(signs)), f"Duplicate signs: {signs}"


def test_whole_day_coarse_plausible_count(astronomy) -> None:
    """Whole day should yield 8-12 distinct rising signs."""
    candidates = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    assert 8 <= len(candidates) <= 12, f"Expected 8-12 signs, got {len(candidates)}"


def test_whole_day_coarse_each_representative_yields_stated_sign(astronomy) -> None:
    """Each representative time must recompute to its declared sign."""
    candidates = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    geo = GeoPoint(_LAT, _LON)
    for c in candidates:
        lon = _asc_longitude(astronomy, c.dt_utc, geo)
        actual_idx = _sign_index(lon)
        expected_idx = ZODIAC_SIGNS.index(c.sign.value)
        assert actual_idx == expected_idx, (
            f"{c.sign.value}: representative {c.dt_utc} yields {ZODIAC_SIGNS[actual_idx]}"
        )


def test_span_120_coarse_signs_are_distinct(astronomy) -> None:
    """±60-min span (span_minutes=120) must dedupe signs."""
    candidates = window_candidate_times(
        _BIRTH_DT, _LAT, _LON, astronomy=astronomy, span_minutes=120
    )
    signs = [c.sign for c in candidates]
    assert len(signs) == len(set(signs)), f"Duplicate signs in span: {signs}"


def test_span_120_coarse_count_within_range(astronomy) -> None:
    """A 2-hour window spans 1-3 rising signs."""
    candidates = window_candidate_times(
        _BIRTH_DT, _LAT, _LON, astronomy=astronomy, span_minutes=120
    )
    assert 1 <= len(candidates) <= 3, f"Expected 1-3 signs in 2h window, got {len(candidates)}"


def test_span_120_coarse_each_representative_yields_stated_sign(astronomy) -> None:
    """Each ±60-min representative must recompute to its declared sign."""
    candidates = window_candidate_times(
        _BIRTH_DT, _LAT, _LON, astronomy=astronomy, span_minutes=120
    )
    geo = GeoPoint(_LAT, _LON)
    for c in candidates:
        lon = _asc_longitude(astronomy, c.dt_utc, geo)
        actual_idx = _sign_index(lon)
        expected_idx = ZODIAC_SIGNS.index(c.sign.value)
        assert actual_idx == expected_idx, (
            f"Span candidate {c.sign.value}: representative yields {ZODIAC_SIGNS[actual_idx]}"
        )


def test_span_120_coarse_signs_subset_of_whole_day(astronomy) -> None:
    """Signs in a ±60-min span must be a subset of the whole-day signs."""
    day_candidates = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    span_candidates = window_candidate_times(
        _BIRTH_DT, _LAT, _LON, astronomy=astronomy, span_minutes=120
    )
    day_signs = {c.sign for c in day_candidates}
    span_signs = {c.sign for c in span_candidates}
    assert span_signs <= day_signs, f"Span signs {span_signs} not subset of day {day_signs}"


def test_fine_resolution_returns_fine_n_samples(astronomy) -> None:
    """Fine resolution must return exactly FINE_N samples."""
    candidates = window_candidate_times(
        _MID_SIGN_DT, _LAT, _LON, astronomy=astronomy, span_minutes=20, resolution="fine"
    )
    assert len(candidates) == FINE_N, f"Expected {FINE_N} fine samples, got {len(candidates)}"


def test_fine_resolution_all_same_sign_in_mid_sign_span(astronomy) -> None:
    """Fine samples within a mid-sign span must all share the same sign."""
    candidates = window_candidate_times(
        _MID_SIGN_DT, _LAT, _LON, astronomy=astronomy, span_minutes=20, resolution="fine"
    )
    signs = {c.sign for c in candidates}
    assert len(signs) == 1, f"Fine samples span multiple signs: {signs}"


def test_window_candidate_times_is_deterministic(astronomy) -> None:
    """Two identical calls must return byte-identical results."""
    first = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    second = window_candidate_times(_BIRTH_DT, _LAT, _LON, astronomy=astronomy)
    assert len(first) == len(second)
    for a, b in zip(first, second):
        assert a.sign == b.sign
        assert a.dt_utc == b.dt_utc
        assert abs(a.lagna_longitude_deg - b.lagna_longitude_deg) < 1e-10

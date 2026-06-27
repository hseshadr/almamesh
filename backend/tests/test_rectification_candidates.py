"""Tests for cusp candidate-time generation (Task 9 — TDD).

Synthetic Bengaluru cusp native fixture: 1988-08-08 01:14:00 UTC,
lat 12.9716, lon 77.5946 — never the owner's real data.
"""

from __future__ import annotations

import datetime

import pytest

from almamesh.calculations import get_ayanamsa
from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign
from almamesh.rectification.candidates import CandidateTime, cusp_candidate_times, make_astronomy

# Synthetic cusp native — NEVER real owner data.
_BIRTH_DT = datetime.datetime(1988, 8, 8, 1, 14, 0, tzinfo=datetime.UTC)
_LAT = 12.9716
_LON = 77.5946


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

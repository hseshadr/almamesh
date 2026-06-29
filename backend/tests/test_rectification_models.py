"""Tests for rectification result Pydantic models (Task 6 — TDD)."""

import datetime

import pytest

from almamesh.constants.astrology import EventType, ZodiacSign
from almamesh.rectification.models import (
    EventEvidence,
    RectificationBand,
    RectificationCandidate,
    RectificationEventInput,
    RectificationMode,
    RectificationResult,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_EVIDENCE = EventEvidence(
    event_index=0,
    category=EventType.MARRIAGE,
    date=datetime.date(2005, 3, 12),
    signals=["7th lord in 7th", "Venus dasha active"],
    contribution=0.72,
)

_CANDIDATE = RectificationCandidate(
    ascendant_sign=ZodiacSign.AQUARIUS,
    representative_time_local="05:45",
    lagna_longitude_deg=328.82,
    lagna_cusp_distance_deg=1.18,
    is_near_cusp=True,
    fit_score=0.68,
    supporting_events=[_EVIDENCE],
)

_RESULT = RectificationResult(
    mode=RectificationMode.CUSP,
    candidates=[_CANDIDATE],
    margin=0.05,
    band=RectificationBand.NEAR_TIE,
    discriminating_event_count=1,
    recorded_time_sign=ZodiacSign.AQUARIUS,
    honesty_note_key="near_tie_hypothesis",
)

_RESULT_NO_RECORDED_SIGN = RectificationResult(
    mode=RectificationMode.WINDOW,
    candidates=[_CANDIDATE],
    margin=0.30,
    band=RectificationBand.CONSISTENT,
    discriminating_event_count=2,
    recorded_time_sign=None,
    honesty_note_key="consistent_verdict",
)


# ---------------------------------------------------------------------------
# Construction tests
# ---------------------------------------------------------------------------


def test_event_evidence_constructs() -> None:
    assert _EVIDENCE.category == EventType.MARRIAGE
    assert _EVIDENCE.event_index == 0
    assert _EVIDENCE.contribution == pytest.approx(0.72)
    assert _EVIDENCE.signals == ["7th lord in 7th", "Venus dasha active"]


def test_rectification_candidate_constructs() -> None:
    assert _CANDIDATE.ascendant_sign == ZodiacSign.AQUARIUS
    assert _CANDIDATE.is_near_cusp is True
    assert len(_CANDIDATE.supporting_events) == 1


def test_rectification_result_constructs() -> None:
    assert _RESULT.mode == RectificationMode.CUSP
    assert _RESULT.band == RectificationBand.NEAR_TIE
    assert _RESULT.recorded_time_sign == ZodiacSign.AQUARIUS
    assert _RESULT.discriminating_event_count == 1


def test_rectification_result_none_recorded_sign() -> None:
    assert _RESULT_NO_RECORDED_SIGN.recorded_time_sign is None
    assert _RESULT_NO_RECORDED_SIGN.mode == RectificationMode.WINDOW


# ---------------------------------------------------------------------------
# JSON round-trip: dates as ISO strings, enums as string values
# ---------------------------------------------------------------------------


def test_event_evidence_json_round_trip() -> None:
    dumped = _EVIDENCE.model_dump(mode="json")
    assert dumped["date"] == "2005-03-12"
    assert dumped["category"] == "marriage"
    assert isinstance(dumped["contribution"], float)
    assert dumped["event_index"] == 0
    assert dumped["signals"] == ["7th lord in 7th", "Venus dasha active"]


def test_rectification_candidate_json_round_trip() -> None:
    dumped = _CANDIDATE.model_dump(mode="json")
    assert dumped["ascendant_sign"] == "Aquarius"
    assert isinstance(dumped["lagna_longitude_deg"], float)
    assert dumped["supporting_events"][0]["date"] == "2005-03-12"


def test_rectification_result_json_round_trip() -> None:
    dumped = _RESULT.model_dump(mode="json")
    assert dumped["mode"] == "cusp"
    assert dumped["band"] == "near_tie"
    assert dumped["recorded_time_sign"] == "Aquarius"
    assert dumped["honesty_note_key"] == "near_tie_hypothesis"
    assert isinstance(dumped["margin"], float)
    assert len(dumped["candidates"]) == 1


def test_rectification_result_null_sign_serializes() -> None:
    dumped = _RESULT_NO_RECORDED_SIGN.model_dump(mode="json")
    assert dumped["recorded_time_sign"] is None
    assert dumped["mode"] == "window"
    assert dumped["band"] == "consistent"


def test_rectification_event_input_json_round_trip() -> None:
    inp = RectificationEventInput(
        date=datetime.date(1999, 8, 4),
        category=EventType.CHILDBIRTH,
    )
    dumped = inp.model_dump(mode="json")
    assert dumped["date"] == "1999-08-04"
    assert dumped["category"] == "childbirth"


# ---------------------------------------------------------------------------
# Immutability (frozen models)
# ---------------------------------------------------------------------------


def test_models_are_frozen() -> None:
    with pytest.raises((TypeError, Exception)):
        _RESULT.mode = RectificationMode.WINDOW  # type: ignore[misc]


# ---------------------------------------------------------------------------
# EventDatePrecision enum + precision field (Task 1)
# ---------------------------------------------------------------------------


def test_event_precision_defaults_to_exact() -> None:
    from almamesh.rectification.models import EventDatePrecision

    ev = RectificationEventInput(date=datetime.date(2005, 6, 1), category=EventType.MARRIAGE)
    assert ev.precision is EventDatePrecision.EXACT


def test_event_precision_is_settable_and_frozen() -> None:
    from almamesh.rectification.models import EventDatePrecision

    ev = RectificationEventInput(
        date=datetime.date(2005, 6, 1),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.YEAR,
    )
    assert ev.precision is EventDatePrecision.YEAR
    with pytest.raises(Exception):
        ev.precision = EventDatePrecision.EXACT  # type: ignore[misc]  # frozen

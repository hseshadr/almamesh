"""Tests for the compute_rectification edge entry point.

Synthetic data only — NEVER real owner birth data.
Bengaluru 1988-08-08 is a generic test fixture far from any real person in this codebase.
"""

from __future__ import annotations

import json

import pytest

from almamesh.edge.chart_runtime import compute_rectification

# Synthetic Bengaluru native; NOT the owner's chart.
_PAYLOAD: dict[str, object] = {
    "datetime_utc": "1988-08-08T01:14:00+00:00",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "utc_offset_minutes": 330,
    "mode": "cusp",
    "reference_date": "2025-01-01T00:00:00+00:00",
    "events": [
        {"date": "1992-06-15", "category": "career_change"},
        {"date": "1995-03-20", "category": "marriage"},
        {"date": "2001-09-10", "category": "relocation"},
    ],
}

_EXPECTED_KEYS = frozenset(
    {
        "mode",
        "candidates",
        "margin",
        "band",
        "discriminating_event_count",
        "recorded_time_sign",
        "honesty_note_key",
    }
)


def test_compute_rectification_returns_expected_keys() -> None:
    result = compute_rectification(_PAYLOAD)
    assert _EXPECTED_KEYS == set(result.keys()), (
        f"missing: {_EXPECTED_KEYS - set(result.keys())}, "
        f"extra: {set(result.keys()) - _EXPECTED_KEYS}"
    )


def test_compute_rectification_is_json_serializable() -> None:
    result = compute_rectification(_PAYLOAD)
    serialized = json.dumps(result)
    assert json.loads(serialized) == result


def test_compute_rectification_candidates_are_two() -> None:
    """Cusp mode always produces exactly two adjacent-sign candidates."""
    result = compute_rectification(_PAYLOAD)
    assert len(result["candidates"]) == 2  # type: ignore[arg-type]


def test_compute_rectification_mode_echoed() -> None:
    result = compute_rectification(_PAYLOAD)
    assert result["mode"] == "cusp"


def test_compute_rectification_honesty_note_key_prefixed() -> None:
    result = compute_rectification(_PAYLOAD)
    assert str(result["honesty_note_key"]).startswith("rectify.honesty.")


def test_compute_rectification_is_deterministic() -> None:
    """Same payload → identical result (no RNG; reference_date is pinned)."""
    first = compute_rectification(_PAYLOAD)
    second = compute_rectification(_PAYLOAD)
    assert first == second


def test_compute_rectification_rejects_bad_event_list() -> None:
    bad = dict(_PAYLOAD, events="not-a-list")
    with pytest.raises(TypeError):
        compute_rectification(bad)


def test_compute_rectification_rejects_bad_event_item() -> None:
    bad = dict(_PAYLOAD, events=["not-a-mapping"])
    with pytest.raises(TypeError):
        compute_rectification(bad)


def test_runtime_parses_precision_and_defaults_to_exact() -> None:
    from almamesh.edge.chart_runtime import _parse_rect_event
    from almamesh.rectification.models import EventDatePrecision

    assert (
        _parse_rect_event({"date": "2005-06-01", "category": "marriage"}).precision
        is EventDatePrecision.EXACT
    )
    assert (
        _parse_rect_event(
            {"date": "2005-06-01", "category": "marriage", "precision": "year"}
        ).precision
        is EventDatePrecision.YEAR
    )


def test_runtime_rejects_bad_precision() -> None:
    from almamesh.edge.chart_runtime import _parse_rect_event

    with pytest.raises(ValueError):
        _parse_rect_event({"date": "2005-06-01", "category": "marriage", "precision": "fuzzy"})


# ---------------------------------------------------------------------------
# Spec 062 E5: weak anchor prior + anchor_confidence payload field
# ---------------------------------------------------------------------------


def test_prior_bonus_triangular_math() -> None:
    from datetime import UTC, datetime

    from almamesh.rectification import PRIOR_MAX_BONUS, _prior_bonus
    from almamesh.rectification.models import AnchorConfidence

    anchor = datetime(1988, 8, 8, 1, 14, tzinfo=UTC)

    def at(minutes: float) -> datetime:
        from datetime import timedelta

        return anchor + timedelta(minutes=minutes)

    about = AnchorConfidence.ABOUT
    # H defaults to 60 min when no span is given: 0.5 at the anchor, 0 at ±H.
    assert _prior_bonus(anchor, anchor, None, about) == pytest.approx(PRIOR_MAX_BONUS)
    assert _prior_bonus(at(60), anchor, None, about) == pytest.approx(0.0)
    assert _prior_bonus(at(30), anchor, None, about) == pytest.approx(PRIOR_MAX_BONUS / 2)
    assert _prior_bonus(at(-30), anchor, None, about) == pytest.approx(PRIOR_MAX_BONUS / 2)
    # H = max(span/2, 60): span 240 → H 120 → delta 60 = half-way down.
    assert _prior_bonus(at(60), anchor, 240, about) == pytest.approx(PRIOR_MAX_BONUS / 2)
    # UNKNOWN: flat — no prior even exactly at the anchor.
    assert _prior_bonus(anchor, anchor, None, AnchorConfidence.UNKNOWN) == 0.0


def test_resolve_anchor_defaults_by_mode() -> None:
    from almamesh.rectification import _resolve_anchor
    from almamesh.rectification.models import AnchorConfidence, RectificationMode

    assert _resolve_anchor(None, RectificationMode.CUSP) is AnchorConfidence.ABOUT
    assert _resolve_anchor(None, RectificationMode.WINDOW) is AnchorConfidence.UNKNOWN
    assert (
        _resolve_anchor(AnchorConfidence.UNKNOWN, RectificationMode.CUSP)
        is AnchorConfidence.UNKNOWN
    )


def _lead_candidate(fit: float, positive: float, penalty: float, prior: float):  # type: ignore[no-untyped-def]
    from almamesh.constants.astrology import ZodiacSign
    from almamesh.rectification.models import RectificationCandidate

    return RectificationCandidate(
        ascendant_sign=ZodiacSign.LEO,
        representative_time_local="06:00",
        lagna_longitude_deg=120.0,
        lagna_cusp_distance_deg=5.0,
        is_near_cusp=False,
        fit_score=fit,
        supporting_events=[],
        positive_total=positive,
        penalty_total=penalty,
        prior_bonus=prior,
    )


def test_lead_qualifier_flags_prior_influenced_and_penalty_driven() -> None:
    from almamesh.rectification import _lead_qualifier

    # Prior decided: without the prior the top would NOT strictly lead.
    top = _lead_candidate(1.0, 0.6, 0.0, 0.4)
    runner = _lead_candidate(0.9, 0.9, 0.0, 0.0)
    assert _lead_qualifier([top, runner]) == "prior_influenced"
    # Penalties decided: with penalties restored the runner-up would lead.
    top = _lead_candidate(1.0, 1.0, 0.0, 0.0)
    runner = _lead_candidate(0.9, 1.5, 0.6, 0.0)
    assert _lead_qualifier([top, runner]) == "penalty_driven"
    # A clean lead carries no qualifier.
    top = _lead_candidate(2.0, 2.0, 0.0, 0.0)
    runner = _lead_candidate(0.5, 0.5, 0.0, 0.0)
    assert _lead_qualifier([top, runner]) is None
    # No lead at all (tie) carries no qualifier either.
    assert _lead_qualifier([runner, runner]) is None


def test_scenario_prior_tiebreak_cusp_zero_events() -> None:
    """(d) Flat-event tie broken by the prior; the min-evidence gate still
    forces NEAR_TIE and the honesty note declares the prior's influence."""
    result = compute_rectification({**_PAYLOAD, "events": []})
    assert result["band"] == "near_tie"
    candidates = result["candidates"]
    assert isinstance(candidates, list)
    top, runner = candidates[0], candidates[1]
    assert top["prior_bonus"] > runner["prior_bonus"]
    assert top["positive_total"] == runner["positive_total"] == 0.0
    assert result["honesty_note_key"] == "rectify.honesty.near_tie.prior_influenced"


def test_anchor_confidence_unknown_zeroes_prior() -> None:
    result = compute_rectification({**_PAYLOAD, "events": [], "anchor_confidence": "unknown"})
    candidates = result["candidates"]
    assert isinstance(candidates, list)
    assert all(c["prior_bonus"] == 0.0 for c in candidates)
    assert result["honesty_note_key"] == "rectify.honesty.near_tie"


def test_runtime_rejects_bad_anchor_confidence() -> None:
    with pytest.raises(ValueError):
        compute_rectification({**_PAYLOAD, "anchor_confidence": "sorta"})


def test_candidate_payload_carries_spec062_fields() -> None:
    result = compute_rectification(_PAYLOAD)
    candidates = result["candidates"]
    assert isinstance(candidates, list)
    for cand in candidates:
        for field in (
            "navamsa_lagna_sign",
            "positive_total",
            "penalty_total",
            "prior_bonus",
            "misses",
        ):
            assert field in cand, field
        assert cand["navamsa_lagna_sign"] is not None

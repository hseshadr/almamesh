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

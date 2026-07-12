"""Aggregate rectification confidence % (rigor Stage 3).

``confidence_pct = margin * 100``, gated to ``None`` below
``MIN_DISCRIMINATING_EVENTS`` — the SAME event-evidence gate that forces
NEAR_TIE (never re-derived). Tier E (event-validated): it reports "how much
better the best-fit birth time explains the user's dated events than the
runner-up," NOT "the probability the time is correct."
"""

from __future__ import annotations

import pytest

from almamesh.rectification.models import (
    RectificationBand,
    RectificationMode,
    RectificationResult,
)
from almamesh.rectification.scorer import (
    MIN_DISCRIMINATING_EVENTS,
    _band_for,
    confidence_pct_for,
)


def test_confidence_pct_is_none_below_min_discriminating_events() -> None:
    """Below the min-evidence bar the % is None (render 'inconclusive')."""
    for count in range(MIN_DISCRIMINATING_EVENTS):
        assert confidence_pct_for(margin=0.42, discriminating_event_count=count) is None


def test_confidence_pct_is_margin_times_100_at_or_above_the_gate() -> None:
    """At/above the bar the % is exactly margin*100 — no re-curving."""
    at_gate = confidence_pct_for(margin=0.42, discriminating_event_count=MIN_DISCRIMINATING_EVENTS)
    assert at_gate == pytest.approx(42.0)
    assert confidence_pct_for(margin=0.0, discriminating_event_count=5) == pytest.approx(0.0)
    assert confidence_pct_for(margin=0.9, discriminating_event_count=9) == pytest.approx(90.0)


def test_calibration_five_events_margin_042_reads_confident_and_consistent() -> None:
    """5 events, margin 0.42 → ~42% and band CONSISTENT (margin >= 0.40)."""
    assert confidence_pct_for(margin=0.42, discriminating_event_count=5) == pytest.approx(42.0)
    assert _band_for(0.42, 5) == RectificationBand.CONSISTENT


def test_calibration_two_events_is_inconclusive() -> None:
    """2 events (below the bar) → no % (inconclusive) and forced NEAR_TIE."""
    assert confidence_pct_for(margin=0.42, discriminating_event_count=2) is None
    assert _band_for(0.42, 2) == RectificationBand.NEAR_TIE


def test_confidence_pct_monotonic_in_margin_above_gate() -> None:
    """More top-vs-runner-up separation never lowers the % (above the gate)."""
    margins = [i / 20 for i in range(20)]  # 0.0 .. 0.95
    pcts = [confidence_pct_for(margin=m, discriminating_event_count=5) for m in margins]
    pairs = zip(pcts, pcts[1:])  # pairwise sliding window (lengths intentionally differ)
    assert all(a is not None and b is not None and a <= b for a, b in pairs)


def test_result_model_carries_confidence_pct_field() -> None:
    """The schema exposes confidence_pct (additive; serializes into the golden)."""
    result = RectificationResult(
        mode=RectificationMode.CUSP,
        candidates=[],
        margin=0.42,
        band=RectificationBand.CONSISTENT,
        discriminating_event_count=5,
        confidence_pct=42.0,
        recorded_time_sign=None,
        honesty_note_key="rectify.honesty.consistent",
    )
    assert result.confidence_pct == pytest.approx(42.0)
    assert "confidence_pct" in result.model_dump(mode="json")


def test_result_model_confidence_pct_defaults_to_none() -> None:
    """Older stored payloads without confidence_pct still validate (default None)."""
    result = RectificationResult(
        mode=RectificationMode.CUSP,
        candidates=[],
        margin=0.0,
        band=RectificationBand.NEAR_TIE,
        discriminating_event_count=0,
        recorded_time_sign=None,
        honesty_note_key="rectify.honesty.near_tie",
    )
    assert result.confidence_pct is None

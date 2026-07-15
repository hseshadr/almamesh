"""Calibration + property tests for the life-domain strength % transform (Tier M).

Stage 2 of the rigor upgrade. The life-domain headline stops being a bare word
(STRONG/MODERATE/WEAK) and gains two *anchored, calibrated* percentage axes plus
a min-combiner headline:

- **Shadbala axis** — piecewise-linear with a real classical pivot: the per-graha
  ``required_rupas`` (BPHS/Śrīpati iṣṭa-bala minimum) is the "pass line" and maps
  to exactly 60%; ``[0, required] -> [0%, 60%]`` and
  ``[required, 2×required] -> [60%, 100%]``, clamped.
- **SAV axis** — linear ``100·avg_bindus/56`` over the classical hard max of 56
  bindus/house (8 max BAV × 7 grahas); the śāstric average 28 lands at 50%.
- **headline** — ``min(shadbala%, sav%)``: a domain is only as strong as its
  weaker classical signal (matches today's conjunctive band).

Every assertion here re-derives its expectation from the anchor (never a magic
constant), so the suite stays chart-invariant: the transform is tested against a
spread of realistic per-graha ``required_rupas`` anchors, standing in for ≥3
distinct charts. This is the six-gate acceptance bar (rigor spec §A.0): anchored,
monotonic, chart-invariant, falsifiable (strong reads high / weak reads low),
transparent, and honestly tier-tagged ``model``.
"""

from __future__ import annotations

import pytest

from almamesh.domains.strength_summary import (
    _headline_pct,
    _pct_sav,
    _pct_shadbala,
)

# A spread of realistic classical per-graha iṣṭa-bala minimums (Rupas). Standing
# in for ≥3 distinct charts: the transform must land identically for any anchor.
REQUIRED_ANCHORS: tuple[float, ...] = (5.0, 6.0, 6.5, 7.0, 8.5)

# The two calibration pivots that MUST hold exactly (rigor spec §A.1).
PASS_LINE_PCT = 60.0
SAV_MIDPOINT_BINDUS = 28.0
SAV_MIDPOINT_PCT = 50.0
SAV_MAX_PER_HOUSE = 56.0


# --- exact pivots (unit) ---


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_shadbala_pct_required_rupas_is_the_60pct_pass_line(required: float) -> None:
    assert _pct_shadbala(required, required) == pytest.approx(PASS_LINE_PCT)


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_shadbala_pct_zero_rupas_is_zero(required: float) -> None:
    assert _pct_shadbala(0.0, required) == pytest.approx(0.0)


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_shadbala_pct_double_required_is_the_100pct_ceiling(required: float) -> None:
    assert _pct_shadbala(2.0 * required, required) == pytest.approx(100.0)


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_shadbala_pct_clamps_above_the_ceiling(required: float) -> None:
    assert _pct_shadbala(5.0 * required, required) == pytest.approx(100.0)


def test_shadbala_pct_nonpositive_required_is_zero_not_a_crash() -> None:
    assert _pct_shadbala(3.0, 0.0) == pytest.approx(0.0)


def test_sav_pct_average_28_bindus_is_the_50pct_midpoint() -> None:
    assert _pct_sav(SAV_MIDPOINT_BINDUS) == pytest.approx(SAV_MIDPOINT_PCT)


def test_sav_pct_zero_bindus_is_zero() -> None:
    assert _pct_sav(0.0) == pytest.approx(0.0)


def test_sav_pct_full_house_56_bindus_is_100() -> None:
    assert _pct_sav(SAV_MAX_PER_HOUSE) == pytest.approx(100.0)


def test_sav_pct_clamps_above_the_hard_max() -> None:
    assert _pct_sav(99.0) == pytest.approx(100.0)


# --- calibration: known-strong reads high, known-weak reads low (gate 4) ---


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_calibration_2x_required_significator_reads_at_least_90pct(required: float) -> None:
    """A significator at 2× its classical minimum (e.g. Saturn-career) is strong."""
    assert _pct_shadbala(2.0 * required, required) >= 90.0


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_calibration_0p4x_required_significator_reads_at_most_30pct(required: float) -> None:
    """A significator at 0.4× its classical minimum (e.g. Moon-home) is weak."""
    assert _pct_shadbala(0.4 * required, required) <= 30.0


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_calibration_mid_significator_lands_in_the_moderate_band(required: float) -> None:
    """1.25× required is comfortably mid-band (not strong, not weak)."""
    mid = _pct_shadbala(1.25 * required, required)
    assert 40.0 < mid < 80.0


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_calibration_headline_takes_the_weaker_axis(required: float) -> None:
    """Strong Shadbala ∧ mid SAV -> the SAV (weaker) axis owns the headline."""
    strong_shadbala = _pct_shadbala(2.0 * required, required)  # ~100%
    mid_sav = _pct_sav(30.0)  # ~53.6%
    assert _headline_pct(strong_shadbala, mid_sav) == pytest.approx(mid_sav)
    assert _headline_pct(strong_shadbala, mid_sav) < strong_shadbala


# --- property: monotonic in both axes (gate 2), all outputs in [0, 100] ---


@pytest.mark.parametrize("required", REQUIRED_ANCHORS)
def test_shadbala_pct_is_monotonic_nondecreasing_in_rupas(required: float) -> None:
    samples = [i * required / 20.0 for i in range(0, 61)]  # 0 .. 3× required
    pcts = [_pct_shadbala(total, required) for total in samples]
    assert pcts == sorted(pcts)
    assert all(0.0 <= p <= 100.0 for p in pcts)


def test_sav_pct_is_monotonic_nondecreasing_in_bindus() -> None:
    samples = [i * 0.5 for i in range(0, 130)]  # 0 .. 64 avg bindus
    pcts = [_pct_sav(avg) for avg in samples]
    assert pcts == sorted(pcts)
    assert all(0.0 <= p <= 100.0 for p in pcts)


def test_headline_pct_is_monotonic_in_each_axis_holding_the_other_fixed() -> None:
    axis_values = [float(i) for i in range(0, 101, 5)]
    for fixed in axis_values:
        rising = [_headline_pct(v, fixed) for v in axis_values]
        assert rising == sorted(rising)
        rising_other = [_headline_pct(fixed, v) for v in axis_values]
        assert rising_other == sorted(rising_other)

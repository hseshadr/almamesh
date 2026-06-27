"""Focused unit tests for ``_count_discriminating`` (Finding 1 fix).

Finding 1: events must be classified discriminating by SIGNAL SET, not by
contribution float equality.  Two candidates can fire DIFFERENT signals that
happen to sum to the same weight — the old contribution-equality check would
silently miss those as "non-discriminating".

The key RED case: ``["dasha_lord_rules_h7"]`` vs ``["dasha_lord_in_h7"]`` both
weigh W_PRIMARY = 1.0, so ``contribution`` is identical; yet the signal sets
differ and the event IS discriminating under the corrected logic.
"""

from __future__ import annotations

from datetime import date

from almamesh.constants.astrology import EventType, ZodiacSign
from almamesh.rectification import _count_discriminating
from almamesh.rectification.models import EventEvidence, RectificationCandidate

# ── helpers ───────────────────────────────────────────────────────────────────


def _evidence(
    index: int,
    signals: list[str],
    contribution: float,
    *,
    category: EventType = EventType.MARRIAGE,
    event_date: date = date(2020, 1, 1),
) -> EventEvidence:
    return EventEvidence(
        event_index=index,
        category=category,
        date=event_date,
        signals=signals,
        contribution=contribution,
    )


def _candidate(
    ev0_signals: list[str],
    ev0_contribution: float,
    *,
    sign: ZodiacSign = ZodiacSign.ARIES,
) -> RectificationCandidate:
    """Two-event candidate for _count_discriminating isolation tests."""
    return RectificationCandidate(
        ascendant_sign=sign,
        representative_time_local="06:00",
        lagna_longitude_deg=5.0,
        lagna_cusp_distance_deg=25.0,
        is_near_cusp=True,
        fit_score=2.0,
        supporting_events=[
            _evidence(0, ev0_signals, ev0_contribution),
            _evidence(
                1,
                ["dasha_lord_rules_h10"],
                1.0,
                category=EventType.CAREER_CHANGE,
                event_date=date(2021, 3, 15),
            ),
        ],
    )


# ── Finding 1: signal-set discrimination ──────────────────────────────────────


class TestCountDiscriminating:
    def test_different_signals_same_contribution_counts_as_discriminating(self) -> None:
        """RED under old code, GREEN after fix.

        ``dasha_lord_rules_h7`` and ``dasha_lord_in_h7`` both weigh W_PRIMARY=1.0,
        so ``contribution`` is 1.0 for both candidates — the old float-equality
        check would see 1.0 == 1.0 and skip it.  The new signal-set check correctly
        sees ``{"dasha_lord_rules_h7"} != {"dasha_lord_in_h7"}`` and counts it.
        """
        cand_a = _candidate(["dasha_lord_rules_h7"], 1.0)
        cand_b = _candidate(["dasha_lord_in_h7"], 1.0, sign=ZodiacSign.TAURUS)

        # Under OLD contribution-equality logic: 1.0 == 1.0 → NOT discriminating → 0
        # Under NEW signal-set logic: {rules_h7} != {in_h7} → IS discriminating → 1
        assert _count_discriminating([cand_a, cand_b]) == 1

    def test_identical_signals_not_discriminating(self) -> None:
        cand_a = _candidate(["dasha_lord_rules_h7"], 1.0)
        cand_b = _candidate(["dasha_lord_rules_h7"], 1.0, sign=ZodiacSign.TAURUS)
        assert _count_discriminating([cand_a, cand_b]) == 0

    def test_signal_order_irrelevant(self) -> None:
        """Signal set comparison must be order-insensitive."""
        cand_a = _candidate(["dasha_lord_rules_h7", "slow_transit_h7"], 1.5)
        cand_b = _candidate(["slow_transit_h7", "dasha_lord_rules_h7"], 1.5, sign=ZodiacSign.TAURUS)
        assert _count_discriminating([cand_a, cand_b]) == 0

    def test_zero_candidates_returns_zero(self) -> None:
        assert _count_discriminating([]) == 0

    def test_one_candidate_returns_zero(self) -> None:
        assert _count_discriminating([_candidate(["dasha_lord_rules_h7"], 1.0)]) == 0

    def test_both_events_discriminating(self) -> None:
        """Both events have different signal sets → count = 2."""
        ev0_a = _evidence(0, ["dasha_lord_rules_h7"], 1.0)
        ev1_a = _evidence(
            1,
            ["dasha_lord_rules_h10"],
            1.0,
            category=EventType.CAREER_CHANGE,
            event_date=date(2021, 3, 15),
        )
        ev0_b = _evidence(0, ["dasha_lord_in_h7"], 1.0)
        ev1_b = _evidence(
            1,
            ["dasha_lord_in_h10"],
            1.0,
            category=EventType.CAREER_CHANGE,
            event_date=date(2021, 3, 15),
        )
        cand_a = RectificationCandidate(
            ascendant_sign=ZodiacSign.ARIES,
            representative_time_local="06:00",
            lagna_longitude_deg=5.0,
            lagna_cusp_distance_deg=25.0,
            is_near_cusp=True,
            fit_score=2.0,
            supporting_events=[ev0_a, ev1_a],
        )
        cand_b = RectificationCandidate(
            ascendant_sign=ZodiacSign.TAURUS,
            representative_time_local="07:00",
            lagna_longitude_deg=35.0,
            lagna_cusp_distance_deg=5.0,
            is_near_cusp=False,
            fit_score=1.5,
            supporting_events=[ev0_b, ev1_b],
        )
        assert _count_discriminating([cand_a, cand_b]) == 2

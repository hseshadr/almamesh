"""
Confluence Scoring and Event Window Stitching.

============================================================================
DORMANT — NOT FOR PRODUCTION (chart-pipeline calc-integrity quarantine).
============================================================================
This module is a HEURISTIC prediction layer, not deterministic astronomy. Its
``apply_expert_rules`` hardcodes "guaranteed high probability" event scenarios —
opinionated forecasting rules that are NOT externally validated and would
violate AlmaMesh's calculation-integrity mandate (the engine is the single,
immaculate, deterministic source of truth; the LLM narrates, it never
computes). It is therefore deliberately kept OUT of the shipped chart pipeline
(``calculate_sidereal_context`` and the edge-proc ``ChartRuntime``): see the
lazy-import boundary in ``almamesh/dasha/__init__.py`` and the guard
``tests/test_scoring_quarantine.py`` that fails if it ever leaks back in. The
composite-dasha transit engine (``dasha/engine.py``) imports it intentionally;
do NOT wire it into the natal chart output.

Implements the probability scoring system that combines signals from
multiple dasha systems. The key insight: when multiple independent
dasha systems agree on an event type, prediction probability increases
dramatically (confluence scoring).

Also includes:
- Expert rules for guaranteed high probability scenarios
- Sigmoid calibration for probability normalization
- Event window stitching from adjacent segments
"""

from __future__ import annotations

import math

from almamesh.constants.astrology import (
    BASE_PROBABILITIES,
    DashaSystem,
    EventType,
)
from almamesh.dasha.models import (
    DashaEngineConfig,
    EventWindow,
    Signal,
    TimeSegment,
)

# =============================================================================
# PROBABILITY CALIBRATION
# =============================================================================


def _sigmoid_calibrate(x: float) -> float:
    """
    Apply sigmoid calibration to compress scores into 0-1 range.

    Uses a sigmoid centered at 0.5 with a spread factor of 3
    for reasonable differentiation between low and high scores.

    Args:
        x: Raw score (can exceed 1.0 before calibration).

    Returns:
        Calibrated probability between 0 and 1.
    """
    # Shift and scale to center around 0.5 with reasonable spread
    return 1 / (1 + math.exp(-3 * (x - 0.5)))


# =============================================================================
# CONFLUENCE SCORING
# =============================================================================


def score_events_from_signals(
    signals: list[Signal],
    config: DashaEngineConfig,
) -> dict[EventType, float]:
    """
    Compute probability for each event type based on signals + confluence.

    The key insight: confluence multipliers dramatically increase probability
    when multiple dasha systems agree on an event.

    Scoring algorithm:
    1. Start with base probabilities for each event type
    2. Add weighted contributions from each signal
    3. Apply confluence multipliers for dual/triple system agreement
    4. Calibrate to 0-1 range using sigmoid function

    Args:
        signals: List of signals from all dasha systems.
        config: Engine configuration with weights and multipliers.

    Returns:
        Dictionary mapping EventType to probability (0.0-1.0).
    """
    # Start with base probabilities
    scores: dict[EventType, float] = {et: BASE_PROBABILITIES.get(et, 0.10) for et in EventType}

    # 1. Additive contribution from signals
    for sig in signals:
        for event_type in sig.event_tags:
            polarity_adj = 1.0 + (sig.polarity * 0.2)  # +/-20% for polarity
            scores[event_type] += sig.weight * polarity_adj

    # 2. Confluence multipliers (the "Super Logic")
    for event_type in scores:
        systems_present = {sig.system for sig in signals if event_type in sig.event_tags}

        # Dual confluence
        if DashaSystem.VIMSHOTTARI in systems_present and DashaSystem.CHARA in systems_present:
            scores[event_type] *= config.multipliers.vim_x_chara

        if DashaSystem.VIMSHOTTARI in systems_present and DashaSystem.YOGINI in systems_present:
            scores[event_type] *= config.multipliers.vim_x_yogini

        if DashaSystem.CHARA in systems_present and DashaSystem.YOGINI in systems_present:
            scores[event_type] *= config.multipliers.chara_x_yogini

        # Triple confluence - strongest signal
        if len(systems_present) == 3:
            scores[event_type] *= config.multipliers.triple_stack

    # 3. Clamp to 0-1 range with sigmoid calibration
    for event_type in scores:
        scores[event_type] = max(0.0, min(1.0, _sigmoid_calibrate(scores[event_type])))

    return scores


# =============================================================================
# EXPERT RULES
# =============================================================================


def apply_expert_rules(
    scores: dict[EventType, float], signals: list[Signal]
) -> dict[EventType, float]:
    """
    Apply hardcoded expert rules that guarantee high probability.

    These rules encode classical astrological knowledge about
    combinations that almost always manifest.

    Example: Vim 10th lord + Chara AmK = 90%+ career change

    Args:
        scores: Current event scores from confluence scoring.
        signals: List of all signals for checking combinations.

    Returns:
        Updated scores with expert rules applied.
    """
    # Career: Vim 10th + Chara AmK
    vim_career = any(
        s.system == DashaSystem.VIMSHOTTARI and EventType.CAREER_CHANGE in s.event_tags
        for s in signals
    )
    chara_amk = any(
        s.system == DashaSystem.CHARA and s.features.get("karaka") == "AmK" for s in signals
    )

    if vim_career and chara_amk:
        scores[EventType.CAREER_CHANGE] = max(scores[EventType.CAREER_CHANGE], 0.90)

    # Marriage: Vim 7th + Chara DK
    vim_marriage = any(
        s.system == DashaSystem.VIMSHOTTARI and EventType.MARRIAGE in s.event_tags for s in signals
    )
    chara_dk = any(
        s.system == DashaSystem.CHARA and s.features.get("karaka") == "DK" for s in signals
    )

    if vim_marriage and chara_dk:
        scores[EventType.MARRIAGE] = max(scores[EventType.MARRIAGE], 0.85)

    return scores


# =============================================================================
# EVENT WINDOW STITCHING
# =============================================================================


def stitch_segments_into_events(
    segments: list[TimeSegment],
    config: DashaEngineConfig,
) -> list[EventWindow]:
    """
    Merge adjacent segments with same high-probability event into windows.

    Adjacent segments that both predict the same event type above threshold
    are merged into a single event window, with the highest probability
    and combined signals.

    Args:
        segments: List of time segments with event scores.
        config: Engine configuration with thresholds and merge gap.

    Returns:
        List of EventWindow objects representing predicted events.
    """
    events: list[EventWindow] = []
    active: dict[EventType, EventWindow] = {}

    for seg in segments:
        for event_type, probability in seg.event_scores.items():
            threshold = config.thresholds.get(event_type, 0.30)

            if probability >= threshold:
                relevant_signals = [s for s in seg.signals if event_type in s.event_tags]
                systems = list({s.system for s in relevant_signals})

                # Check if we can extend existing window
                if event_type in active:
                    gap = (seg.start_date - active[event_type].window_end).days
                    if gap <= config.merge_gap_days:
                        # Extend window
                        active[event_type].window_end = seg.end_date
                        active[event_type].probability = max(
                            active[event_type].probability, probability
                        )
                        # Add new signals (avoid duplicates)
                        existing_ids = {s.id for s in active[event_type].top_signals}
                        for sig in relevant_signals[:3]:
                            if sig.id not in existing_ids:
                                active[event_type].top_signals.append(sig)
                        continue

                # Start new window
                window = EventWindow(
                    event_type=event_type,
                    window_start=seg.start_date,
                    window_end=seg.end_date,
                    probability=probability,
                    confluence_systems=systems,
                    top_signals=relevant_signals[:5],
                    explanations=[s.rationale for s in relevant_signals[:3]],
                )
                active[event_type] = window
                events.append(window)
            else:
                # Below threshold - close any active window
                active.pop(event_type, None)

    return events

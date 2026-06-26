"""
Composite Dasha Engine - Main Orchestrator.

This module is the main entry point for composite dasha analysis.
It fuses Vimshottari + Jaimini Chara + Yogini dashas into a
probabilistic event timeline with confluence scoring.

SPEC: 050-composite-dasha-engine.md

Architecture:
    SiderealContext -> [Vim, Chara, Yogini periods] -> TimeSegments -> Signals -> EventWindows

The key insight: When multiple independent dasha systems agree on an event type,
prediction probability increases dramatically (confluence scoring).
"""

from __future__ import annotations

import logging
from datetime import datetime

from almamesh.dasha.chara import (
    compute_chara_dasha_periods,
    compute_jaimini_karakas,
    extract_chara_signals,
    find_active_chara,
)
from almamesh.dasha.models import (
    CharaPeriod,
    CompositeTimeline,
    DashaEngineConfig,
    JaiminiKarakas,
    TimeSegment,
    VimPeriod,
    YoginiPeriod,
)
from almamesh.dasha.scoring import (
    apply_expert_rules,
    score_events_from_signals,
    stitch_segments_into_events,
)
from almamesh.dasha.vimshottari import (
    compute_vimshottari_periods,
    extract_vimshottari_signals,
    find_active_vimshottari,
)
from almamesh.dasha.yogini import (
    compute_yogini_periods,
    extract_yogini_signals,
    find_active_yogini,
)
from almamesh.schemas.astrology import SiderealContext

logger = logging.getLogger(__name__)


# =============================================================================
# SEGMENT UNIFICATION
# =============================================================================


def unify_periods_into_segments(
    vim_periods: list[VimPeriod],
    chara_periods: list[CharaPeriod],
    yogini_periods: list[YoginiPeriod],
    karakas: JaiminiKarakas,
) -> list[TimeSegment]:
    """
    Split timeline at every dasha boundary to create unified segments.

    Each segment has a consistent state across all three dasha systems.
    This is necessary because the three systems have different period
    durations and boundaries.

    Args:
        vim_periods: Vimshottari periods for the window.
        chara_periods: Chara periods for the window.
        yogini_periods: Yogini periods for the window.
        karakas: Jaimini karakas for determining active significators.

    Returns:
        List of TimeSegment objects with unified states.
    """
    # Collect all boundaries
    boundaries: set[datetime] = set()
    for vp in vim_periods:
        boundaries.add(vp.start_date)
        boundaries.add(vp.end_date)
    for cp in chara_periods:
        boundaries.add(cp.start_date)
        boundaries.add(cp.end_date)
    for yp in yogini_periods:
        boundaries.add(yp.start_date)
        boundaries.add(yp.end_date)

    if not boundaries:
        return []

    sorted_bounds = sorted(boundaries)
    segments: list[TimeSegment] = []

    for i in range(len(sorted_bounds) - 1):
        seg_start = sorted_bounds[i]
        seg_end = sorted_bounds[i + 1]

        segments.append(
            TimeSegment(
                start_date=seg_start,
                end_date=seg_end,
                vimshottari=find_active_vimshottari(vim_periods, seg_start),
                chara=find_active_chara(chara_periods, seg_start, karakas),
                yogini=find_active_yogini(yogini_periods, seg_start),
            )
        )

    return segments


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================


def build_composite_timeline(
    context: SiderealContext,
    start_date: datetime,
    end_date: datetime,
    config: DashaEngineConfig | None = None,
) -> CompositeTimeline:
    """
    Main entry point for composite dasha analysis.

    Fuses Vimshottari + Chara + Yogini into a probabilistic event timeline.

    Pipeline:
    1. Compute Jaimini Karakas from planetary positions
    2. Compute all three dasha periods for the time window
    3. Unify into segments (split on every boundary)
    4. Extract signals from each segment
    5. Score events based on signals + confluence
    6. Stitch adjacent high-probability segments into event windows

    Args:
        context: The sidereal context with birth chart data.
        start_date: Start of the analysis window.
        end_date: End of the analysis window.
        config: Optional engine configuration (uses defaults if not provided).

    Returns:
        CompositeTimeline with segments and predicted events.
    """
    if config is None:
        config = DashaEngineConfig()

    # 1. Compute Jaimini Karakas
    karakas = compute_jaimini_karakas(context)

    # 2. Compute all three dasha systems for time window
    vim_periods = compute_vimshottari_periods(context, start_date, end_date)
    chara_periods = compute_chara_dasha_periods(context, start_date, end_date, karakas)
    yogini_periods = compute_yogini_periods(context, start_date, end_date)

    # 3. Unify into segments (split on every boundary)
    segments = unify_periods_into_segments(vim_periods, chara_periods, yogini_periods, karakas)

    # 4. Extract signals for each segment
    for seg in segments:
        seg.signals.extend(extract_vimshottari_signals(seg, context, karakas, config))
        seg.signals.extend(extract_chara_signals(seg, context, karakas, config))
        seg.signals.extend(extract_yogini_signals(seg, context, karakas, config))

        # 5. Score events based on signals + confluence
        seg.event_scores = score_events_from_signals(seg.signals, config)
        seg.event_scores = apply_expert_rules(seg.event_scores, seg.signals)

    # 6. Stitch adjacent high-probability segments into event windows
    events = stitch_segments_into_events(segments, config)

    return CompositeTimeline(segments=segments, events=events, karakas=karakas)

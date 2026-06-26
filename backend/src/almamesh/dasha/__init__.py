"""
Dasha Package - Composite Dasha Engine.

This package implements the composite dasha analysis system that fuses
Vimshottari + Jaimini Chara + Yogini dashas into a probabilistic event timeline.

Main Entry Point:
    build_composite_timeline(context, start_date, end_date, config) -> CompositeTimeline

Public API:
    - build_composite_timeline: Main function to generate composite timeline
    - CompositeTimeline: Output containing segments and predicted events
    - TimeSegment: Unified time segment with all dasha states
    - Signal: Atomic astrologically meaningful condition
    - EventWindow: Predicted event with probability
    - DashaEngineConfig: Engine configuration

Submodules:
    - models: All Pydantic models
    - vimshottari: Vimshottari dasha calculations and signals
    - chara: Jaimini Chara dasha and karaka calculations
    - yogini: Yogini dasha calculations and signals
    - scoring: Confluence scoring and event stitching
    - engine: Main orchestrator

LAZY IMPORTS (calc-integrity boundary): the heavy composite-prediction engine
(``chara``, ``engine``, ``scoring``, ``yogini``) is loaded ON DEMAND via PEP 562
``__getattr__`` below, NOT eagerly. This keeps ``dasha.scoring`` -- which holds
hardcoded "guaranteed high probability" heuristics (DORMANT, not deterministic
astronomy) -- OUT of the import closure of the deterministic chart pipeline,
which only needs the lightweight ``convention`` / ``vimshottari`` / ``models``
submodules. The public API is unchanged: ``from almamesh.dasha import
build_composite_timeline`` (etc.) still works; it just triggers the import
lazily. See ``tests/test_scoring_quarantine.py``.
"""

from typing import TYPE_CHECKING, Any

# Re-export constants for backward compatibility (cheap, no scoring/engine).
from almamesh.constants.astrology import (
    CHARA_DASHA_YEARS,
    DASHA_SEQUENCE,
    DASHA_YEARS,
    YOGINI_SEQUENCE,
    DashaSystem,
    EventType,
)

# Core models (cheap; do NOT import scoring/engine).
from almamesh.dasha.models import (
    # Period models
    CharaPeriod,
    # Dasha states
    CharaState,
    # Time and events
    CompositeTimeline,
    # Configuration
    ConfluenceMultipliers,
    DashaEngineConfig,
    EventWindow,
    # Karakas
    JaiminiKarakas,
    KarakaInfo,
    # Signal and core domain
    Signal,
    SignalWeights,
    TimeSegment,
    VimPeriod,
    VimshottariState,
    YoginiPeriod,
    YoginiState,
)

if TYPE_CHECKING:  # pragma: no cover - import-time names for type checkers only
    from almamesh.dasha.chara import (
        compute_chara_dasha_periods,
        compute_jaimini_karakas,
        extract_chara_signals,
    )
    from almamesh.dasha.engine import build_composite_timeline
    from almamesh.dasha.scoring import (
        apply_expert_rules,
        score_events_from_signals,
        stitch_segments_into_events,
    )
    from almamesh.dasha.vimshottari import (
        compute_vimshottari_periods,
        extract_vimshottari_signals,
    )
    from almamesh.dasha.yogini import (
        compute_yogini_periods,
        extract_yogini_signals,
    )

# name -> submodule for the heavy composite-engine exports loaded on demand.
_LAZY_EXPORTS: dict[str, str] = {
    "build_composite_timeline": "almamesh.dasha.engine",
    "compute_chara_dasha_periods": "almamesh.dasha.chara",
    "compute_jaimini_karakas": "almamesh.dasha.chara",
    "extract_chara_signals": "almamesh.dasha.chara",
    "apply_expert_rules": "almamesh.dasha.scoring",
    "score_events_from_signals": "almamesh.dasha.scoring",
    "stitch_segments_into_events": "almamesh.dasha.scoring",
    "compute_vimshottari_periods": "almamesh.dasha.vimshottari",
    "extract_vimshottari_signals": "almamesh.dasha.vimshottari",
    "compute_yogini_periods": "almamesh.dasha.yogini",
    "extract_yogini_signals": "almamesh.dasha.yogini",
}


def __getattr__(name: str) -> Any:  # noqa: ANN401 - PEP 562 module hook
    """Lazily resolve heavy composite-engine exports (keeps scoring out of the
    chart-pipeline import closure)."""
    module_path = _LAZY_EXPORTS.get(name)
    if module_path is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    return getattr(importlib.import_module(module_path), name)


__all__ = [
    # Main entry point
    "build_composite_timeline",
    # Configuration
    "DashaEngineConfig",
    "ConfluenceMultipliers",
    "SignalWeights",
    # Core models
    "Signal",
    "TimeSegment",
    "EventWindow",
    "CompositeTimeline",
    # State models
    "VimshottariState",
    "CharaState",
    "YoginiState",
    # Period models
    "VimPeriod",
    "CharaPeriod",
    "YoginiPeriod",
    # Karaka models
    "JaiminiKarakas",
    "KarakaInfo",
    # Vimshottari functions
    "compute_vimshottari_periods",
    "extract_vimshottari_signals",
    # Chara functions
    "compute_chara_dasha_periods",
    "compute_jaimini_karakas",
    "extract_chara_signals",
    # Yogini functions
    "compute_yogini_periods",
    "extract_yogini_signals",
    # Scoring functions
    "score_events_from_signals",
    "apply_expert_rules",
    "stitch_segments_into_events",
    # Re-exported constants (backward compatibility)
    "DashaSystem",
    "EventType",
    "DASHA_SEQUENCE",
    "DASHA_YEARS",
    "CHARA_DASHA_YEARS",
    "YOGINI_SEQUENCE",
]

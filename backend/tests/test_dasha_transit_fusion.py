"""Dasha x transit fusion — the active dasha lord weighted by concurrent transits.

Classical principle: dasha gives the promise, gochara gives the timing. The fusion
emits the active maha (and antar) lord, where that lord is transiting now, which
benefics reinforce / malefics afflict it, and a deterministic net_weight + severity.
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.transits import TransitSeverity
from almamesh.transits.fusion import build_fusion

_BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
_DELHI = (28.6139, 77.2090)
_INSTANT = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)


def _natal():
    return calculate_sidereal_context(_BIRTH, *_DELHI, reference_date=_INSTANT)


def test_should_pick_active_maha_lord_when_fused() -> None:
    # Given the Delhi natal chart whose current maha is reproducible at _INSTANT
    natal = _natal()
    astro = SkyfieldAstronomy()
    # When the fusion is built at the same instant
    fusion = build_fusion(astro, natal, _BIRTH, _INSTANT)
    # Then the maha lord matches the chart's own current maha
    assert natal.dashas.current_maha is not None
    assert fusion.maha_lord == natal.dashas.current_maha.lord.value
    assert 1 <= fusion.maha_lord_transit_house_from_moon <= 12
    assert 1 <= fusion.maha_lord_transit_house_from_lagna <= 12


def test_should_score_positive_when_lord_is_benefic_supported() -> None:
    # Given a synthetic placement where the lord sits in a kendra with a benefic
    # conjunct and no malefic (built via the pure scorer, no astronomy needed)
    from almamesh.transits.fusion import score_fusion  # noqa: PLC0415

    weight, severity = score_fusion(
        house_from_moon=4,  # a kendra (reinforced)
        reinforcing=[PlanetName.JUPITER],
        afflicting=[],
    )
    # Then the net weight is positive and the severity is supportive
    assert weight > 0.0
    assert severity == TransitSeverity.SUPPORTIVE


def test_should_score_negative_when_lord_is_malefic_afflicted() -> None:
    # Given a lord in a dusthana (6/8/12) afflicted by two malefics, no benefic
    from almamesh.transits.fusion import score_fusion  # noqa: PLC0415

    weight, severity = score_fusion(
        house_from_moon=8,  # a dusthana (afflicted)
        reinforcing=[],
        afflicting=[PlanetName.SATURN, PlanetName.MARS],
    )
    # Then the net weight is negative and the severity is challenging
    assert weight < 0.0
    assert severity == TransitSeverity.CHALLENGING


def test_should_clamp_weight_to_unit_range() -> None:
    # Given an extreme afflicted configuration
    from almamesh.transits.fusion import score_fusion  # noqa: PLC0415

    weight, _ = score_fusion(
        house_from_moon=12,
        reinforcing=[],
        afflicting=[PlanetName.SATURN, PlanetName.MARS, PlanetName.SUN, PlanetName.RAHU],
    )
    # Then it never escapes [-1, 1]
    assert -1.0 <= weight <= 1.0

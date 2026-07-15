"""Stage-4 rigor: stable-vs-lagna dual pass (`almamesh.rectification.stability`).

A `StabilityMarker` is a Tier Layer-1 (deterministic) FACT: whether a yoga or
life-domain verdict is IDENTICAL under both candidate ascendants. These tests
lock four guarantees per the rigor spec §D Stage 4:

1. a marker `holds_under_both` is True iff the verdict is identical under both
   candidate lagnas (built from two real `SiderealContext`s from two times);
2. the dual pass reuses ONE `SkyfieldAstronomy` instance (DE421 loaded once);
3. the dual pass is deterministic across runs (no golden change is expected —
   the helper adds no serialized field — so determinism is asserted directly);
4. the pure yoga/domain diff is exact on hand-built verdicts (True/False cases).
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.constants.astrology import PlanetName
from almamesh.rectification import stability
from almamesh.rectification.stability import StabilityMarker
from almamesh.schemas.astrology import (
    YogaData,
    YogaFormationRule,
    YogaStrengthFactor,
)
from almamesh.schemas.domains import LifeDomain, StrengthBand

# Two birth times a few hours apart at one place — distinct ascendants, so the
# yoga sets genuinely differ across the two candidate lagnas.
_LAT, _LON = 12.9716, 77.5946  # Bangalore
_DT_PRIMARY = datetime(1990, 1, 1, 6, 0, tzinfo=UTC)
_DT_ALTERNATE = datetime(1990, 1, 1, 9, 0, tzinfo=UTC)
_REFERENCE = datetime(2025, 1, 1, tzinfo=UTC)  # fixed 'now' (byte-reproducible)


def _yoga(name: str, grade: str) -> YogaData:
    """A minimal, schema-valid `YogaData` carrying just a name + grade verdict."""
    return YogaData(
        name=name,
        display_name=name.title(),
        category="raja",
        description="d",
        effects="e",
        grade=grade,
        strength_factors=[
            YogaStrengthFactor(
                factor_type="dignity", planet=PlanetName.SUN, value="exalted", basis="b"
            )
        ],
        planets_involved=[PlanetName.SUN],
        houses_involved=[1],
        planetary_signature=name,
        formation_rules=[
            YogaFormationRule(rule="r", description="d", source="s", planets=[], houses=[])
        ],
    )


# ---------------------------------------------------------------------------
# 4. Pure yoga diff — a marker is stable iff present in BOTH with equal grade.
# ---------------------------------------------------------------------------


def test_yoga_marker_true_when_grade_identical() -> None:
    markers = stability.yoga_markers(
        [_yoga("gaja_kesari", "strong")], [_yoga("gaja_kesari", "strong")]
    )
    assert markers == [StabilityMarker(claim_id="yoga:gaja_kesari", holds_under_both=True)]


def test_yoga_marker_false_when_grade_differs() -> None:
    markers = stability.yoga_markers(
        [_yoga("budha_aditya", "strong")], [_yoga("budha_aditya", "weak")]
    )
    assert markers == [StabilityMarker(claim_id="yoga:budha_aditya", holds_under_both=False)]


def test_yoga_marker_false_when_present_under_one_lagna_only() -> None:
    markers = stability.yoga_markers([_yoga("raja", "strong")], [])
    assert markers == [StabilityMarker(claim_id="yoga:raja", holds_under_both=False)]


def test_yoga_markers_are_sorted_and_namespaced() -> None:
    markers = stability.yoga_markers(
        [_yoga("zebra", "strong"), _yoga("alpha", "moderate")],
        [_yoga("zebra", "strong"), _yoga("alpha", "moderate")],
    )
    assert [m.claim_id for m in markers] == ["yoga:alpha", "yoga:zebra"]


# ---------------------------------------------------------------------------
# 4b. Pure domain diff — verdict is the strength band.
# ---------------------------------------------------------------------------


def test_domain_marker_true_when_band_identical() -> None:
    primary = {LifeDomain.CAREER: StrengthBand.STRONG}
    markers = stability.domain_markers(primary, {LifeDomain.CAREER: StrengthBand.STRONG})
    assert markers == [StabilityMarker(claim_id="domain:career", holds_under_both=True)]


def test_domain_marker_false_when_band_differs() -> None:
    primary = {LifeDomain.FINANCES: StrengthBand.STRONG}
    markers = stability.domain_markers(primary, {LifeDomain.FINANCES: StrengthBand.WEAK})
    assert markers == [StabilityMarker(claim_id="domain:finances", holds_under_both=False)]


# ---------------------------------------------------------------------------
# 1. Real dual pass — the marker matches an INDEPENDENT ground-truth diff.
# ---------------------------------------------------------------------------


def test_stability_from_real_contexts_matches_ground_truth() -> None:
    primary, alternate = stability.dual_lagna_contexts(
        _DT_PRIMARY, _DT_ALTERNATE, _LAT, _LON, _REFERENCE
    )
    markers = stability.stability_from_contexts(primary, alternate)

    primary_grades = {y.name: y.grade for y in primary.yogas}
    alternate_grades = {y.name: y.grade for y in alternate.yogas}
    for marker in markers:
        name = marker.claim_id.removeprefix("yoga:")
        expected = (
            name in primary_grades
            and name in alternate_grades
            and primary_grades[name] == alternate_grades[name]
        )
        assert marker.holds_under_both is expected


# ---------------------------------------------------------------------------
# 2. The dual pass loads DE421 exactly once (one shared astronomy instance).
# ---------------------------------------------------------------------------


def test_dual_pass_loads_de421_once(monkeypatch) -> None:
    constructions: list[int] = []
    real_ctor = stability.SkyfieldAstronomy

    def counting_ctor(*args: object, **kwargs: object) -> object:
        constructions.append(1)
        return real_ctor(*args, **kwargs)

    monkeypatch.setattr(stability, "SkyfieldAstronomy", counting_ctor)
    primary, alternate = stability.dual_lagna_contexts(
        _DT_PRIMARY, _DT_ALTERNATE, _LAT, _LON, _REFERENCE
    )
    assert len(constructions) == 1  # DE421 loads in SkyfieldAstronomy.__init__ — once
    assert primary.lagna is not None
    assert alternate.lagna is not None


# ---------------------------------------------------------------------------
# 3. Determinism — repeated dual passes yield byte-identical markers.
# ---------------------------------------------------------------------------


def test_dual_pass_is_deterministic() -> None:
    def run() -> list[StabilityMarker]:
        primary, alternate = stability.dual_lagna_contexts(
            _DT_PRIMARY, _DT_ALTERNATE, _LAT, _LON, _REFERENCE
        )
        return stability.stability_from_contexts(primary, alternate)

    assert run() == run()


def test_distinct_times_yield_distinct_lagnas() -> None:
    """Guard: the fixtures actually exercise two DIFFERENT ascendants."""
    primary, alternate = stability.dual_lagna_contexts(
        _DT_PRIMARY, _DT_ALTERNATE, _LAT, _LON, _REFERENCE
    )
    assert primary.lagna.sign != alternate.lagna.sign

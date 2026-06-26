"""Behavioral tests for the yoga engine's fail-loud error contract.

Calculation-integrity mandate: a buggy yoga rule must FAIL LOUD as a typed
``YogaRuleError`` (an EXPECTED, surfaceable rule defect), while unexpected
bug-class errors propagate untouched. ``detect_yogas`` degrades the chart's
yoga list to empty ONLY for the typed error so a single rule defect never
nukes the whole chart.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from almamesh.calculations import calculate_sidereal_context, detect_yogas
from almamesh.schemas.astrology import SiderealContext
from almamesh.yogas.engine import YogaEngine, YogaRuleError, create_yoga_engine

# Fixed instant keeps the chart reproducible across CPython/Pyodide.
_FIXED_REFERENCE_DATE = datetime(2024, 1, 1, tzinfo=UTC)
_BIRTH = datetime(1983, 4, 4, 21, 20, tzinfo=UTC)  # 1983-04-05 05:50 IST, Chennai


def _reference_chart() -> SiderealContext:
    return calculate_sidereal_context(
        _BIRTH, 13.0827, 80.2707, reference_date=_FIXED_REFERENCE_DATE
    )


def _malformed_rule(_chart: SiderealContext) -> list[object]:
    raise ValueError("unknown house set: bogus")


def _buggy_rule(_chart: SiderealContext) -> list[object]:
    raise KeyError("internal engine bug")


class TestEngineFailLoud:
    def test_malformed_rule_raises_typed_yoga_rule_error(self) -> None:
        # Given a rule that rejects its input via ValueError (EXPECTED defect)
        engine = YogaEngine(
            _reference_chart(),
            rules=(("bogus_rule", _malformed_rule),),  # type: ignore[arg-type]
        )
        # When evaluating / Then the typed error surfaces (not a silent skip)
        with pytest.raises(YogaRuleError, match="bogus_rule"):
            engine.evaluate_all_yogas()

    def test_unexpected_rule_error_propagates_untouched(self) -> None:
        # Given a rule with a genuine bug-class error
        engine = YogaEngine(
            _reference_chart(),
            rules=(("buggy_rule", _buggy_rule),),  # type: ignore[arg-type]
        )
        # When evaluating / Then the original error propagates (no swallow)
        with pytest.raises(KeyError):
            engine.evaluate_all_yogas()


class TestEngineEndToEnd:
    def test_should_detect_yogas_with_complete_traces(self) -> None:
        # Given a real reference chart and the shipped classical ruleset
        engine = create_yoga_engine(_reference_chart())
        # When evaluating all yogas
        yogas = engine.evaluate_all_yogas()
        # Then yogas are detected and every one carries a full honest trace
        assert len(yogas) > 0
        for yoga in yogas:
            assert yoga.name
            assert yoga.grade in {"strong", "moderate", "weak"}
            assert yoga.planets_involved
            assert yoga.houses_involved
            assert yoga.strength_factors
            assert yoga.formation_rules

    def test_evaluation_is_deterministic(self) -> None:
        chart = _reference_chart()
        first = [y.planetary_signature for y in create_yoga_engine(chart).evaluate_all_yogas()]
        second = [y.planetary_signature for y in create_yoga_engine(chart).evaluate_all_yogas()]
        assert first == second


class TestDetectYogasDegradation:
    """`detect_yogas` must DEGRADE (empty list) on a known rule defect so the
    rest of the chart still generates, yet keep fail-loud for genuine bugs."""

    def test_should_degrade_to_empty_when_yoga_engine_raises_rule_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Given a yoga engine whose evaluation raises a known YogaRuleError
        def _boom(_context: object) -> object:
            raise YogaRuleError("malformed rule 'bogus'")

        monkeypatch.setattr("almamesh.yogas.engine.create_yoga_engine", _boom)
        # When detecting yogas on a real reference chart
        result = detect_yogas(_reference_chart())
        # Then yogas degrade to an empty list instead of nuking the chart
        assert result == []

    def test_should_propagate_when_yoga_engine_raises_unexpected_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Given a yoga engine whose evaluation hits a genuine bug-class error
        def _bug(_context: object) -> object:
            raise RuntimeError("genuine engine bug")

        monkeypatch.setattr("almamesh.yogas.engine.create_yoga_engine", _bug)
        # When detecting yogas
        # Then the unexpected error fails loud (calculation-integrity mandate)
        with pytest.raises(RuntimeError):
            detect_yogas(_reference_chart())

    def test_should_still_produce_chart_when_yoga_detection_degrades(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Given yoga detection that fails with a known rule defect
        def _boom(_context: object) -> object:
            raise YogaRuleError("malformed rule 'bogus'")

        monkeypatch.setattr("almamesh.yogas.engine.create_yoga_engine", _boom)
        # When computing a full chart end to end
        chart = calculate_sidereal_context(
            _BIRTH, 13.0827, 80.2707, reference_date=_FIXED_REFERENCE_DATE
        )
        # Then planets/houses/dasha are correct while yogas degrade to empty
        assert len(chart.planets) == 9
        assert len(chart.houses) == 12
        assert chart.dashas.current_maha is not None
        assert chart.yogas == []

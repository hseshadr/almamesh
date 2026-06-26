"""Yoga engine: evaluate the audited classical rule registry, fail loud.

The previous YAML-driven rule machine (template variables, macros, memoized
predicates) is gone — it is the indirection that produced mislabeled and
untraceable yogas (self-paired "Raja Yoga", Malavya without a kendra, a
trace-less "Neechabhanga", "Kahal" for a Guru-Mangala conjunction, and a stub
"shadbala ratio 1.00" factor on every yoga). Rules are now typed Python
functions with classical citations (``almamesh.yogas.rules``); every emitted
yoga carries a schema-enforced full trace and a qualitative grade.

Error contract (calculation-integrity mandate):
- A rule rejecting its input via ``ValueError`` is an EXPECTED, surfaceable
  rule defect -> wrapped as the typed ``YogaRuleError``.
- Anything else is a genuine engine bug and propagates untouched.
``detect_yogas`` (calculations.py) degrades the chart's yoga list to empty
ONLY for ``YogaRuleError`` so one rule defect never nukes the whole chart.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

from almamesh.schemas.astrology import SiderealContext, YogaData
from almamesh.yogas.rules import CLASSICAL_RULES, RuleFn

logger = logging.getLogger(__name__)

_GRADE_ORDER = {"strong": 0, "moderate": 1, "weak": 2}


class YogaRuleError(Exception):
    """A yoga rule is malformed and cannot be evaluated.

    Raised for EXPECTED, surfaceable rule defects (a rule rejecting its input
    via ``ValueError``). Unexpected errors are NOT wrapped — they propagate
    untouched so genuine engine bugs fail loud, per the calculation-integrity
    mandate (never silently drop yogas).
    """


class YogaEngine:
    """Evaluates the classical rule registry against one chart."""

    def __init__(
        self,
        chart: SiderealContext,
        rules: Sequence[tuple[str, RuleFn]] | None = None,
    ) -> None:
        self._chart = chart
        self._rules: Sequence[tuple[str, RuleFn]] = CLASSICAL_RULES if rules is None else rules

    def evaluate_all_yogas(self) -> list[YogaData]:
        """All detected yogas, sorted strong-first then by name/signature."""
        detected: list[YogaData] = []
        for rule_id, rule in self._rules:
            detected.extend(self._run_rule(rule_id, rule))
        detected.sort(key=lambda y: (_GRADE_ORDER[y.grade], y.name, y.planetary_signature))
        logger.info("Yoga evaluation complete: %d yogas detected", len(detected))
        return detected

    def _run_rule(self, rule_id: str, rule: RuleFn) -> list[YogaData]:
        """Run one rule; ValueError = malformed rule (typed), rest fail loud."""
        try:
            return rule(self._chart)
        except ValueError as error:
            raise YogaRuleError(f"Malformed yoga rule '{rule_id}': {error}") from error


def create_yoga_engine(chart: SiderealContext) -> YogaEngine:
    """Factory for the audited classical yoga engine."""
    return YogaEngine(chart)

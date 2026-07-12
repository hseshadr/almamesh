"""Stage-4 rigor: stable-vs-lagna dual pass — is a verdict lagna-invariant?

A :class:`StabilityMarker` is a Tier Layer-1 (deterministic) FACT: whether a
yoga or life-domain verdict is IDENTICAL under both candidate ascendants that
birth-time rectification produced. ``holds_under_both=True`` means "stable
truth" — the verdict does NOT depend on which candidate lagna is the true one;
``False`` means "lagna-specific" (birth-time-sensitive). It is honestly certain
(a fact about the two charts), never a model estimate.

This is a pure, additive helper. It re-uses the existing engine purity
(:func:`calculate_sidereal_context` is twice-callable with a shared
``astronomy=`` instance, so DE421 loads once) and adds NO field to any
serialized payload — the natal / domains / predictive / rectification goldens
and the CPython<->Pyodide byte-parity gate stay untouched.

[DISCREPANCY vs briefing] The briefing says "diff ``.yogas`` / ``.forecasts``
between two ``SiderealContext``s". A ``SiderealContext`` carries ``.yogas`` but
NOT ``.forecasts`` — life-domain forecasts live on ``LifeDomainsContext`` from
the separate ``compute_predictive_contexts`` path. So yoga stability diffs
``SiderealContext.yogas`` (verdict = grade); domain stability diffs the
per-domain strength BAND that the caller extracts from each forecast (verdict =
band). The diff contract is identical; only the input shape differs.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import TypeVar

from pydantic import BaseModel, ConfigDict

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.schemas.astrology import SiderealContext, YogaData
from almamesh.schemas.domains import LifeDomain, StrengthBand

_K = TypeVar("_K")
_V = TypeVar("_V")


class StabilityMarker(BaseModel):
    """Does one claim's verdict survive BOTH candidate lagnas? A deterministic fact.

    ``claim_id`` is a stable, namespaced id (``"yoga:<name>"`` / ``"domain:<d>"``).
    ``holds_under_both`` is True iff the claim's verdict (yoga grade / domain
    band) is identical under both candidate ascendants — Tier Layer-1 certainty,
    not a model estimate. A claim present under only ONE lagna is NOT stable.
    """

    model_config = ConfigDict(frozen=True)

    claim_id: str
    holds_under_both: bool


def yoga_claim_id(name: str) -> str:
    """Namespaced stability id for a yoga claim."""
    return f"yoga:{name}"


def domain_claim_id(domain: LifeDomain) -> str:
    """Namespaced stability id for a life-domain claim."""
    return f"domain:{domain.value}"


def _holds(primary: Mapping[_K, _V], alternate: Mapping[_K, _V], key: _K) -> bool:
    """A verdict is stable iff the key is present in BOTH maps and equal."""
    return key in primary and key in alternate and primary[key] == alternate[key]


def _yoga_grades(yogas: Sequence[YogaData]) -> dict[str, str]:
    """Map each yoga's name to its qualitative grade verdict."""
    return {yoga.name: yoga.grade for yoga in yogas}


def yoga_markers(
    primary: Sequence[YogaData], alternate: Sequence[YogaData]
) -> list[StabilityMarker]:
    """A stability marker per yoga claim across two lagnas (verdict = grade)."""
    primary_grades = _yoga_grades(primary)
    alternate_grades = _yoga_grades(alternate)
    return [
        StabilityMarker(
            claim_id=yoga_claim_id(name),
            holds_under_both=_holds(primary_grades, alternate_grades, name),
        )
        for name in sorted(primary_grades.keys() | alternate_grades.keys())
    ]


def domain_markers(
    primary: Mapping[LifeDomain, StrengthBand],
    alternate: Mapping[LifeDomain, StrengthBand],
) -> list[StabilityMarker]:
    """A stability marker per life-domain claim (verdict = strength band)."""
    return [
        StabilityMarker(
            claim_id=domain_claim_id(domain),
            holds_under_both=_holds(primary, alternate, domain),
        )
        for domain in sorted(primary.keys() | alternate.keys(), key=lambda d: d.value)
    ]


def dual_lagna_contexts(
    dt_primary: datetime,
    dt_alternate: datetime,
    latitude: float,
    longitude: float,
    reference_date: datetime,
) -> tuple[SiderealContext, SiderealContext]:
    """Both candidate-lagna natal contexts, sharing ONE ephemeris load (DE421 once).

    ``reference_date`` is required (never a silent wall clock) so the dual pass
    is byte-reproducible. The single ``astronomy`` instance is threaded into
    both calls, so DE421 is loaded exactly once across the pass.
    """
    astronomy = SkyfieldAstronomy()
    primary = calculate_sidereal_context(
        dt_primary, latitude, longitude, reference_date=reference_date, astronomy=astronomy
    )
    alternate = calculate_sidereal_context(
        dt_alternate, latitude, longitude, reference_date=reference_date, astronomy=astronomy
    )
    return primary, alternate


def stability_from_contexts(
    primary: SiderealContext, alternate: SiderealContext
) -> list[StabilityMarker]:
    """Yoga stability markers diffed from two candidate-lagna natal contexts."""
    return yoga_markers(primary.yogas, alternate.yogas)


__all__ = [
    "StabilityMarker",
    "domain_claim_id",
    "domain_markers",
    "dual_lagna_contexts",
    "stability_from_contexts",
    "yoga_claim_id",
    "yoga_markers",
]

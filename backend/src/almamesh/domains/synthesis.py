"""Compose the per-life-domain forecasts from the four predictive contexts.

``compute_life_domains`` is the Phase-4 public entrypoint: a pure, deterministic,
READ-ONLY fusion of the natal ``SiderealContext`` + ``TransitContext`` +
``VargaContext`` + ``StrengthContext`` into one ``LifeDomainForecast`` per
``LifeDomain``. No astronomy or dasha math happens here — every value is a cited
lookup/aggregation over what the four engines already computed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.domains.emphasis import current_emphasis
from almamesh.domains.recipes import DOMAIN_RECIPES
from almamesh.domains.significators import (
    house_significators,
    karaka_significators,
    significator_grahas,
)
from almamesh.domains.strength_summary import strength_summary
from almamesh.domains.varga_summary import varga_summary
from almamesh.domains.windows import upcoming_windows
from almamesh.schemas.domains import LifeDomain, LifeDomainForecast, LifeDomainsContext

if TYPE_CHECKING:
    from almamesh.schemas.astrology import SiderealContext
    from almamesh.schemas.strength import StrengthContext
    from almamesh.schemas.transits import TransitContext
    from almamesh.schemas.vargas import VargaContext


def _forecast(
    domain: LifeDomain,
    natal: SiderealContext,
    transits: TransitContext,
    vargas: VargaContext,
    strength: StrengthContext,
) -> LifeDomainForecast:
    """The full synthesis for one life domain, per its classical recipe."""
    recipe = DOMAIN_RECIPES[domain]
    sigs = significator_grahas(natal, recipe)
    return LifeDomainForecast(
        domain=domain,
        houses=house_significators(natal, recipe),
        karakas=karaka_significators(natal, recipe),
        varga=varga_summary(vargas, recipe),
        strength_summary=strength_summary(natal, strength, recipe),
        current_emphasis=current_emphasis(natal, transits, recipe, sigs),
        upcoming_windows=upcoming_windows(natal, transits, recipe, sigs),
    )


def compute_life_domains(
    natal: SiderealContext,
    transits: TransitContext,
    vargas: VargaContext,
    strength: StrengthContext,
) -> LifeDomainsContext:
    """All seven life-domain forecasts for one chart + transit instant."""
    forecasts = {
        domain: _forecast(domain, natal, transits, vargas, strength) for domain in LifeDomain
    }
    return LifeDomainsContext(instant=transits.instant, forecasts=forecasts)

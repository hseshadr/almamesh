"""The LAZY predictive superset: transits + all vargas + strength + life domains.

This is the second runtime entrypoint next to ``calculate_sidereal_context``.
It is computed SEPARATELY from the natal chart call (transits take ~35s under
Pyodide), at an EXPLICIT reference instant — never a silent ``now()`` — so the
payload is byte-reproducible on CPython and Pyodide alike. The natal pipeline
and its golden stay untouched.

This module is deliberately free of any ``edgeproc`` dependency so the Pyodide
chart Worker (which installs only the skyfield stack + the almamesh wheel) can
import it directly; ``edge/chart_runtime.py`` wraps it for task payloads.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from almamesh.calculations import calculate_sidereal_context
from almamesh.domains import compute_life_domains
from almamesh.schemas.domains import LifeDomainsContext
from almamesh.schemas.strength import StrengthContext
from almamesh.schemas.transits import TransitContext
from almamesh.schemas.vargas import VargaContext
from almamesh.strength import compute_strength_context
from almamesh.transits import calculate_transit_context
from almamesh.vargas import compute_varga_context


class PredictiveContexts(BaseModel):
    """The four additive predictive contexts for one chart + instant.

    ``model_dump(mode="json")`` of this model IS the wire payload the browser
    receives: each top-level key carries the bare dump of its context.
    """

    model_config = ConfigDict(frozen=True)

    transit_context: TransitContext
    varga_context_full: VargaContext
    strength_context: StrengthContext
    domains_context: LifeDomainsContext


def compute_predictive_contexts(
    birth_dt: datetime,
    latitude: float,
    longitude: float,
    reference_instant: datetime,
) -> PredictiveContexts:
    """All four predictive contexts at one EXPLICIT instant (no silent now()).

    ``reference_instant`` pins BOTH the natal "current" dasha and the transit
    "now", keeping the whole payload coherent and reproducible.
    """
    natal = calculate_sidereal_context(
        birth_dt, latitude, longitude, reference_date=reference_instant
    )
    transits = calculate_transit_context(natal, birth_dt, transit_instant=reference_instant)
    vargas = compute_varga_context(natal)
    strength = compute_strength_context(natal, birth_dt, latitude, longitude)
    return PredictiveContexts(
        transit_context=transits,
        varga_context_full=vargas,
        strength_context=strength,
        domains_context=compute_life_domains(natal, transits, vargas, strength),
    )


__all__ = ["PredictiveContexts", "compute_predictive_contexts"]

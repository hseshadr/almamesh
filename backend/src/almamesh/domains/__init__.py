"""Phase-4 per-life-domain predictive SYNTHESIS engine — a standalone, READ-ONLY
fusion over the four already-computed predictive contexts.

``compute_life_domains(natal, transits, vargas, strength)`` is the public
entrypoint. It fuses the natal ``SiderealContext`` + ``TransitContext`` +
``VargaContext`` + ``StrengthContext`` into a ``LifeDomainForecast`` for each of
the seven life domains (career, finances, health, relationships, spiritual,
education, family). The natal chart is NOT mutated and this context is NOT nested
into the natal output — exactly how the transit/varga/strength engines stay
additive, keeping the natal golden and CPython<->Pyodide byte-parity untouched (a
later integration wave composes it).

The engine fuses signals deterministically and CITES the classical rule applied;
the LLM narrates later. See ``almamesh.domains.recipes`` for the closed
significator registry and ``backend/docs/predictive-engine-plan.md`` (Phase 4).
"""

from almamesh.domains.synthesis import compute_life_domains

__all__ = ["compute_life_domains"]

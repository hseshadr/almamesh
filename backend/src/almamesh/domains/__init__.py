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

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.domains.synthesis import compute_life_domains

if TYPE_CHECKING:
    from almamesh.domains.strength_receipt import (
        DomainStrengthSubject,
        sign_domain_strength,
        verify_domain_strength,
    )

__all__ = [
    "DomainStrengthSubject",
    "compute_life_domains",
    "sign_domain_strength",
    "verify_domain_strength",
]

# The strength-receipt helpers pull the ``avow`` trust envelope and its ``pynacl``
# Ed25519 backend. The in-browser Pyodide predictive engine imports this package to
# compute the Life Atlas but never signs, so eager loading would force a WASM crypto
# dylib into the hot path (and break offline boots) for nothing.
_RECEIPT_EXPORTS = frozenset(
    {"DomainStrengthSubject", "sign_domain_strength", "verify_domain_strength"}
)


def __getattr__(name: str) -> object:
    """Resolve the signing helpers lazily, on first access (PEP 562)."""
    if name in _RECEIPT_EXPORTS:
        from almamesh.domains import strength_receipt

        return getattr(strength_receipt, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

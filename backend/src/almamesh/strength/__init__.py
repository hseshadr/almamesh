"""Phase-3 strength engine — Parashari Ashtakavarga + BPHS Shadbala.

A standalone, additive context (like ``transits/``) over an already-computed
natal ``SiderealContext``. ``compute_strength_context`` is the public entrypoint;
it reads the natal chart READ-ONLY and uses the real birth instant + place to put
Kalabala on true civil sunrise. The natal chart is never mutated, so the natal
golden and CPython<->Pyodide parity stay byte-stable.

See ``backend/docs/predictive-engine-plan.md`` (Phase 3).
"""

from __future__ import annotations

from almamesh.strength.ashtakavarga import compute_ashtakavarga
from almamesh.strength.context import compute_strength_context
from almamesh.strength.shadbala import compute_shadbala

__all__ = [
    "compute_ashtakavarga",
    "compute_shadbala",
    "compute_strength_context",
]

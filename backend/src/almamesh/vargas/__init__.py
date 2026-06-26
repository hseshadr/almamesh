"""Phase-2 Shodasavarga (16 divisional charts D1..D60) engine — a standalone,
READ-ONLY context built off the natal sidereal pipeline.

``compute_varga_context(natal)`` is the public entrypoint. It consumes an already
-computed natal ``SiderealContext`` (planet sidereal longitudes + lagna) and emits
a SEPARATE ``VargaContext`` (the 16 BPHS charts + vargottama/Shadvarga/Vimshopaka
tallies). The natal chart is NOT mutated and this context is NOT nested into the
natal output — exactly how the transit engine stays additive, keeping the natal
golden and CPython<->Pyodide byte-parity untouched (a later integration wave
composes it). D9 is delegated to the proven ``almamesh.navamsa`` module.
"""

from almamesh.vargas.context import compute_varga_context

__all__ = ["compute_varga_context"]

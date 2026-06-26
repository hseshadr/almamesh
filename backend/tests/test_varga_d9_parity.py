"""Proof that the varga engine's D9 is byte-identical to ``almamesh.navamsa``.

The Navamsa is the highest-value varga and already has a proven, separately
tested implementation (``navamsa_sign``, validated over a full 360° sweep). The
Shodasavarga engine MUST reuse it, not reimplement it. This test asserts equality
across the whole zodiac at fine resolution AND on the exact navamsa boundaries,
so any future drift in the dispatch wiring is caught immediately.
"""

from __future__ import annotations

from almamesh.navamsa import NAVAMSA_ARC, navamsa_sign
from almamesh.schemas.vargas import DivisionalChart
from almamesh.vargas.divisions import varga_sign


def test_d9_equals_navamsa_over_dense_sweep() -> None:
    """Every 0.1° across 0..360°, the D9 dispatch equals navamsa_sign."""
    lon = 0.0
    while lon < 360.0:
        assert varga_sign(DivisionalChart.D9, lon) == navamsa_sign(lon), lon
        lon += 0.1


def test_d9_equals_navamsa_on_every_navamsa_boundary() -> None:
    """At each of the 108 navamsa starts (and just inside), the two agree."""
    for k in range(108):
        boundary = k * NAVAMSA_ARC
        for sample in (boundary, boundary + 1e-6, boundary + NAVAMSA_ARC / 2.0):
            assert varga_sign(DivisionalChart.D9, sample) == navamsa_sign(sample)

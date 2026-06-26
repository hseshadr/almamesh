"""Assemble the standalone Shodasavarga ``VargaContext`` from a natal chart.

READ-ONLY composition over an already-built natal ``SiderealContext`` (planet
sidereal longitudes + lagna longitude). Mirrors the transit engine: a SEPARATE
context object, never nested into / mutating the natal output, so the natal
golden and CPython<->Pyodide parity stay byte-stable. Pure + deterministic.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.constants.astrology import SIGN_LORDS, PlanetName, ZodiacSign
from almamesh.schemas.vargas import (
    DivisionalChart,
    ShadvargaOwnSign,
    VargaChart,
    VargaContext,
    VargaPlacement,
    VargottamaFlag,
    VimshopakaScore,
)
from almamesh.vargas.divisions import varga_sign

if TYPE_CHECKING:
    from almamesh.schemas.astrology import SiderealContext

# The six Shadvarga charts and their BPHS Vimshopaka weights (sum 20).
_SHADVARGA_WEIGHTS: dict[DivisionalChart, float] = {
    DivisionalChart.D1: 6.0,
    DivisionalChart.D2: 2.0,
    DivisionalChart.D3: 4.0,
    DivisionalChart.D9: 5.0,
    DivisionalChart.D12: 2.0,
    DivisionalChart.D30: 1.0,
}


def _placement(graha: PlanetName, longitude: float, chart: DivisionalChart) -> VargaPlacement:
    """One graha's varga sign placement (sign + that sign's lord)."""
    sign = varga_sign(chart, longitude)
    return VargaPlacement(graha=graha, sign=sign, sign_lord=SIGN_LORDS[sign])


def _build_chart(natal: SiderealContext, chart: DivisionalChart) -> VargaChart:
    """Build one divisional chart: lagna + every graha placed in it."""
    lagna_sign = varga_sign(chart, natal.lagna.longitude)
    placements = {
        graha: _placement(graha, pos.longitude, chart) for graha, pos in natal.planets.items()
    }
    return VargaChart(
        chart=chart,
        lagna_sign=lagna_sign,
        lagna_sign_lord=SIGN_LORDS[lagna_sign],
        placements=placements,
    )


def _vargottama_flags(charts: dict[DivisionalChart, VargaChart]) -> list[VargottamaFlag]:
    """Grahas (and lagna) whose D1 sign equals their D9 sign — vargottama."""
    d1, d9 = charts[DivisionalChart.D1], charts[DivisionalChart.D9]
    flags: list[VargottamaFlag] = []
    if d1.lagna_sign == d9.lagna_sign:
        flags.append(VargottamaFlag(point="lagna", sign=ZodiacSign(d1.lagna_sign)))
    for graha in PlanetName:
        if d1.placements[graha].sign == d9.placements[graha].sign:
            flags.append(
                VargottamaFlag(point=graha.value, sign=ZodiacSign(d1.placements[graha].sign))
            )
    return flags


def _own_sign_charts(
    charts: dict[DivisionalChart, VargaChart], graha: PlanetName
) -> list[DivisionalChart]:
    """The Shadvarga charts in which ``graha`` sits in a sign it rules."""
    return [
        chart_id
        for chart_id in _SHADVARGA_WEIGHTS
        if charts[chart_id].placements[graha].sign_lord == graha.value
    ]


def _shadvarga_tally(charts: dict[DivisionalChart, VargaChart]) -> list[ShadvargaOwnSign]:
    """Per-graha own-sign count across the six Shadvarga charts (0..6)."""
    tally: list[ShadvargaOwnSign] = []
    for graha in PlanetName:
        owned = _own_sign_charts(charts, graha)
        tally.append(
            ShadvargaOwnSign(graha=graha, own_sign_count=len(owned), charts_in_own_sign=owned)
        )
    return tally


def _vimshopaka(shadvarga: list[ShadvargaOwnSign]) -> list[VimshopakaScore]:
    """Own-sign Shadvarga 20-point weighting (flagged approximated — see schema)."""
    return [
        VimshopakaScore(
            graha=entry.graha,
            score=sum(_SHADVARGA_WEIGHTS[c] for c in entry.charts_in_own_sign),
            approximated=True,
        )
        for entry in shadvarga
    ]


def compute_varga_context(natal: SiderealContext) -> VargaContext:
    """The full Phase-2 Shodasavarga context for an already-built natal chart.

    READ-ONLY over ``natal``; emits all 16 divisional charts, vargottama flags,
    the Shadvarga own-sign tally and its Vimshopaka own-sign weighting.
    """
    charts = {chart: _build_chart(natal, chart) for chart in DivisionalChart}
    shadvarga = _shadvarga_tally(charts)
    return VargaContext(
        charts=charts,
        vargottama=_vargottama_flags(charts),
        shadvarga_own_sign=shadvarga,
        vimshopaka=_vimshopaka(shadvarga),
    )

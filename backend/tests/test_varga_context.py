"""Context-level tests for ``compute_varga_context``: the standalone Shodasavarga
context built READ-ONLY off a natal ``SiderealContext``.

These lock the composition (all 16 charts present, every graha placed, vargottama
only when D1==D9, the Shadvarga own-sign tally, the Vimshopaka own-sign score) and
the additive invariant: computing vargas must NOT mutate the natal chart.
"""

from __future__ import annotations

from datetime import datetime

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.navamsa import navamsa_sign
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.vargas import DivisionalChart
from almamesh.vargas import compute_varga_context

# Synthetic reference native: 1988-08-08 06:44 IST Bengaluru == 01:14Z (a
# Cancer/Leo cusp birth). reference_date pins the dasha so the chart is reproducible.
_REFERENCE = ("1988-08-08T01:14:00+00:00", 12.9716, 77.5946)
_REFERENCE_DATE = datetime.fromisoformat("2026-01-01T00:00:00+00:00")
# Delhi golden-parity fixture (lagna Gemini, Sun Capricorn, Moon Leo).
_DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)


def _natal(iso: str, lat: float, lon: float) -> SiderealContext:
    dt = datetime.fromisoformat(iso)
    return calculate_sidereal_context(dt, lat, lon, reference_date=_REFERENCE_DATE)


def test_all_sixteen_charts_present() -> None:
    ctx = compute_varga_context(_natal(*_DELHI))
    assert set(ctx.charts.keys()) == set(DivisionalChart)
    assert len(ctx.charts) == 16


def test_every_chart_places_all_nine_grahas() -> None:
    ctx = compute_varga_context(_natal(*_DELHI))
    for chart in ctx.charts.values():
        assert set(chart.placements.keys()) == set(PlanetName)


def test_d1_chart_equals_natal_signs() -> None:
    natal = _natal(*_DELHI)
    ctx = compute_varga_context(natal)
    d1 = ctx.charts[DivisionalChart.D1]
    assert d1.lagna_sign == natal.lagna.sign.value
    for graha, pos in natal.planets.items():
        assert d1.placements[graha].sign == pos.sign.value


def test_d9_chart_matches_navamsa_module() -> None:
    natal = _natal(*_DELHI)
    ctx = compute_varga_context(natal)
    d9 = ctx.charts[DivisionalChart.D9]
    assert d9.lagna_sign == navamsa_sign(natal.lagna.longitude).value
    for graha, pos in natal.planets.items():
        assert d9.placements[graha].sign == navamsa_sign(pos.longitude).value


def test_d9_chart_equals_natal_emitted_navamsa() -> None:
    # The natal pipeline already emits a D9; our standalone D9 must agree with it.
    natal = _natal(*_DELHI)
    assert natal.navamsa is not None
    ctx = compute_varga_context(natal)
    d9 = ctx.charts[DivisionalChart.D9]
    assert d9.lagna_sign == natal.navamsa.lagna_sign
    for graha, vp in natal.navamsa.planets.items():
        assert d9.placements[graha].sign == vp.sign


def test_vargottama_only_when_d1_equals_d9() -> None:
    natal = _natal(*_DELHI)
    ctx = compute_varga_context(natal)
    flagged = {f.point: f.sign for f in ctx.vargottama}
    d1 = ctx.charts[DivisionalChart.D1]
    d9 = ctx.charts[DivisionalChart.D9]
    # Lagna vargottama iff D1 lagna == D9 lagna.
    if d1.lagna_sign == d9.lagna_sign:
        assert flagged.get("lagna") == d1.lagna_sign
    else:
        assert "lagna" not in flagged
    # Each graha: present in vargottama iff its D1 sign == its D9 sign.
    for graha in PlanetName:
        same = d1.placements[graha].sign == d9.placements[graha].sign
        assert (graha.value in flagged) == same


def test_shadvarga_own_sign_tally_is_consistent() -> None:
    natal = _natal(*_DELHI)
    ctx = compute_varga_context(natal)
    shadvarga = {
        DivisionalChart.D1,
        DivisionalChart.D2,
        DivisionalChart.D3,
        DivisionalChart.D9,
        DivisionalChart.D12,
        DivisionalChart.D30,
    }
    for entry in ctx.shadvarga_own_sign:
        assert 0 <= entry.own_sign_count <= 6
        assert entry.own_sign_count == len(entry.charts_in_own_sign)
        assert set(entry.charts_in_own_sign) <= shadvarga
        # Cross-check: each listed chart really places the graha in its own sign.
        for chart_id in entry.charts_in_own_sign:
            placement = ctx.charts[chart_id].placements[PlanetName(entry.graha)]
            # use_enum_values=True -> entry.graha and sign_lord are plain strs.
            assert placement.sign_lord == entry.graha


def test_vimshopaka_is_own_sign_weighted_and_flagged() -> None:
    natal = _natal(*_DELHI)
    ctx = compute_varga_context(natal)
    weights = {
        DivisionalChart.D1: 6.0,
        DivisionalChart.D2: 2.0,
        DivisionalChart.D3: 4.0,
        DivisionalChart.D9: 5.0,
        DivisionalChart.D12: 2.0,
        DivisionalChart.D30: 1.0,
    }
    shadvarga = {s.graha: s for s in ctx.shadvarga_own_sign}
    for score in ctx.vimshopaka:
        assert score.approximated is True
        assert 0.0 <= score.score <= 20.0
        expected = sum(weights[c] for c in shadvarga[score.graha].charts_in_own_sign)
        assert score.score == expected


def test_computing_vargas_does_not_mutate_natal() -> None:
    natal = _natal(*_DELHI)
    before = natal.model_dump(mode="json")
    compute_varga_context(natal)
    assert natal.model_dump(mode="json") == before


def test_reference_native_chart_computes_full_context() -> None:
    natal = _natal(*_REFERENCE)
    ctx = compute_varga_context(natal)
    # The reference native's D1 lagna is Leo (0.04°, on the Cancer cusp) — a known anchor.
    assert ctx.charts[DivisionalChart.D1].lagna_sign == ZodiacSign.LEO.value
    assert len(ctx.charts) == 16
    assert all(len(c.placements) == 9 for c in ctx.charts.values())

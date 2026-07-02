"""Combustion (asta) is a D1 graha-level fact that must carry onto the vargas.

Combustion is determined by a graha's REAL longitude versus the Sun's — it is a
property of the graha in the rasi (D1), independent of any divisional mapping. So
a graha that is combust in D1 must read combust in EVERY divisional chart (D9
Navamsa, the full D1–D60 Shodasavarga), and a graha that is not combust must
never spuriously read combust. The engine is the single source of truth: the
varga models CARRY the D1 flag, they never recompute it.

Fixture: the Delhi golden-parity native (1990-01-15 12:00 UTC, 28.6139/77.2090)
with a pinned ``reference_date`` — a synthetic native (no PII) in which Venus and
Saturn are combust in D1 while the Sun/Moon/Jupiter are not.
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.vargas import DivisionalChart
from almamesh.vargas import compute_varga_context

# Synthetic native (no real birth data): Venus + Saturn combust in D1, Sun/Moon
# not — the reference_date pins the dasha so the whole chart is reproducible.
_DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)


def _natal() -> SiderealContext:
    iso, lat, lon = _DELHI
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=_REFERENCE_DATE
    )


def test_fixture_has_a_combust_non_sun_graha_in_d1() -> None:
    # Premise guard: the fixture really does put a non-Sun graha (Venus) combust
    # in D1, so the varga-carry assertions below are meaningful.
    natal = _natal()
    assert natal.planets[PlanetName.VENUS].is_combust is True
    assert natal.planets[PlanetName.SATURN].is_combust is True
    assert natal.planets[PlanetName.MOON].is_combust is False
    assert natal.planets[PlanetName.SUN].is_combust is False


def test_natal_navamsa_carries_the_d1_combustion_flag() -> None:
    natal = _natal()
    assert natal.navamsa is not None
    planets = natal.navamsa.planets
    # The combust D1 graha stays combust in the D9 navamsa...
    assert planets[PlanetName.VENUS].is_combust is True
    # ...a non-combust graha stays not-combust...
    assert planets[PlanetName.MOON].is_combust is False
    # ...and the Sun is never combust.
    assert planets[PlanetName.SUN].is_combust is False


def test_every_divisional_chart_carries_the_d1_combustion_flag() -> None:
    natal = _natal()
    ctx = compute_varga_context(natal)
    for chart_id, chart in ctx.charts.items():
        assert chart.placements[PlanetName.VENUS].is_combust is True, chart_id
        assert chart.placements[PlanetName.SATURN].is_combust is True, chart_id
        assert chart.placements[PlanetName.MOON].is_combust is False, chart_id
        assert chart.placements[PlanetName.SUN].is_combust is False, chart_id


def test_d1_placement_combustion_matches_the_natal_planet() -> None:
    # The D1 divisional chart's combustion is exactly the natal PlanetPosition's.
    natal = _natal()
    ctx = compute_varga_context(natal)
    d1 = ctx.charts[DivisionalChart.D1]
    for graha, pos in natal.planets.items():
        assert d1.placements[graha].is_combust is pos.is_combust

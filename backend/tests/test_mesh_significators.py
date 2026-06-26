"""Relation significators: classical karaka house + karaka grahas per relation.

The corroboration primitive: for a relation, emit the karaka house (sign, lord,
lord's condition, occupants) and the karaka grahas' conditions — structured
engine facts only, no prose, every assignment cited.
"""

from __future__ import annotations

from datetime import UTC, datetime
from functools import cache

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.mesh import compute_relation_reading
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import Relationship

FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
NYC = ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060)

EXPECTED_HOUSE = {
    Relationship.SPOUSE: 7,
    Relationship.PARTNER: 7,
    Relationship.MOTHER: 4,
    Relationship.FATHER: 9,
    Relationship.CHILD: 5,
    Relationship.SIBLING: 3,
    Relationship.FRIEND: 11,
    Relationship.BUSINESS: 7,
}

EXPECTED_KARAKAS = {
    Relationship.SPOUSE: [PlanetName.VENUS, PlanetName.JUPITER],
    Relationship.PARTNER: [PlanetName.VENUS, PlanetName.JUPITER],
    Relationship.MOTHER: [PlanetName.MOON],
    Relationship.FATHER: [PlanetName.SUN],
    Relationship.CHILD: [PlanetName.JUPITER],
    Relationship.SIBLING: [PlanetName.MARS],
    Relationship.FRIEND: [PlanetName.JUPITER],
    Relationship.BUSINESS: [PlanetName.MERCURY],
}


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def test_every_relation_maps_to_its_classical_house_and_karakas() -> None:
    ctx = _chart(*DELHI)
    for relationship in Relationship:
        reading = compute_relation_reading(ctx, relationship)
        assert reading.relationship is relationship
        assert reading.karaka_house == EXPECTED_HOUSE[relationship]
        assert [k.condition.planet for k in reading.karakas] == EXPECTED_KARAKAS[relationship]
        assert reading.house_basis  # every house assignment carries a citation
        assert all(k.source for k in reading.karakas)


def test_delhi_spouse_reading_matches_the_engine_chart() -> None:
    """Delhi: Gemini lagna -> 7th is Sagittarius, lord Jupiter."""
    ctx = _chart(*DELHI)
    reading = compute_relation_reading(ctx, Relationship.SPOUSE)
    assert reading.house_sign is ZodiacSign.SAGITTARIUS
    assert reading.house_lord is PlanetName.JUPITER
    assert reading.lord_condition.planet is PlanetName.JUPITER
    assert reading.lord_condition.sign == ctx.planets[PlanetName.JUPITER].sign
    assert reading.lord_condition.house == ctx.planets[PlanetName.JUPITER].house
    assert reading.lord_condition.dignity == ctx.planets[PlanetName.JUPITER].dignity


def test_occupants_are_exactly_the_grahas_in_the_karaka_house() -> None:
    ctx = _chart(*NYC)
    for relationship in (Relationship.SPOUSE, Relationship.FRIEND, Relationship.SIBLING):
        reading = compute_relation_reading(ctx, relationship)
        expected = sorted(
            (p.name for p in ctx.planets.values() if p.house == reading.karaka_house),
            key=lambda planet: planet.value,
        )
        assert reading.occupants == expected
        assert reading.house_sign == ctx.houses[reading.karaka_house].sign
        assert reading.house_lord == ctx.houses[reading.karaka_house].sign_lord


def test_karaka_conditions_are_engine_facts_verbatim() -> None:
    ctx = _chart(*NYC)
    reading = compute_relation_reading(ctx, Relationship.BUSINESS)
    (mercury,) = reading.karakas
    natal = ctx.planets[PlanetName.MERCURY]
    assert mercury.condition.sign == natal.sign
    assert mercury.condition.house == natal.house
    assert mercury.condition.dignity == natal.dignity
    assert mercury.condition.is_retrograde == natal.is_retrograde
    assert mercury.condition.is_combust == natal.is_combust

"""Relation significators — the classical karaka house + karaka grahas.

The corroboration primitive: for a relation kind, emit the karaka house (its
sign, lord, the lord's natal condition, occupants) and the karaka grahas'
conditions — structured engine facts only, no prose. Inputs are READ-ONLY
finished charts; every house and karaka assignment carries its citation.

House map (whole-sign from the lagna; BPHS house significations): spouse /
partner / business 7th (kalatra, union, trade partnership), mother 4th
(matru), father 9th (pitru — Parashari convention; some schools read the
10th), child 5th (putra), sibling 3rd (sahaja), friend 11th (labha — gains
and the circle of friends).
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import (
    GrahaCondition,
    KarakaAssessment,
    Relationship,
    RelationSignificators,
)

_HOUSE_OF: Final[dict[Relationship, int]] = {
    Relationship.SPOUSE: 7,
    Relationship.PARTNER: 7,
    Relationship.MOTHER: 4,
    Relationship.FATHER: 9,
    Relationship.CHILD: 5,
    Relationship.SIBLING: 3,
    Relationship.FRIEND: 11,
    Relationship.BUSINESS: 7,
}

_HOUSE_BASIS: Final[dict[Relationship, str]] = {
    Relationship.SPOUSE: "7th — kalatra bhava, marriage and union (BPHS house significations)",
    Relationship.PARTNER: (
        "7th — the house of partnership/union (BPHS); applied to non-marital "
        "partners by standard practice"
    ),
    Relationship.MOTHER: "4th — matru bhava, the mother (BPHS house significations)",
    Relationship.FATHER: (
        "9th — pitru bhava, the father (BPHS, Parashari convention; some "
        "schools read the father from the 10th)"
    ),
    Relationship.CHILD: "5th — putra bhava, children (BPHS house significations)",
    Relationship.SIBLING: "3rd — sahaja bhava, siblings (BPHS house significations)",
    Relationship.FRIEND: (
        "11th — labha bhava, gains and the circle of friends (BPHS house significations)"
    ),
    Relationship.BUSINESS: (
        "7th — vyapara, trade dealings and partnership (BPHS/Phaladeepika 7th "
        "significations; standard convention for business relations)"
    ),
}

_SPOUSE_KARAKAS: Final[list[tuple[PlanetName, str]]] = [
    (PlanetName.VENUS, "Venus — kalatra (spouse) karaka (BPHS karakatva)"),
    (
        PlanetName.JUPITER,
        "Jupiter — karaka of the husband in a woman's chart (stri-jataka "
        "tradition); emitted for both roles, the caller interprets by role",
    ),
]

_KARAKAS: Final[dict[Relationship, list[tuple[PlanetName, str]]]] = {
    Relationship.SPOUSE: _SPOUSE_KARAKAS,
    Relationship.PARTNER: _SPOUSE_KARAKAS,
    Relationship.MOTHER: [(PlanetName.MOON, "Moon — matru (mother) karaka (BPHS karakatva)")],
    Relationship.FATHER: [(PlanetName.SUN, "Sun — pitru (father) karaka (BPHS karakatva)")],
    Relationship.CHILD: [
        (PlanetName.JUPITER, "Jupiter — putra (children) karaka (BPHS karakatva)")
    ],
    Relationship.SIBLING: [(PlanetName.MARS, "Mars — bhratru (sibling) karaka (BPHS karakatva)")],
    Relationship.FRIEND: [
        (
            PlanetName.JUPITER,
            "Jupiter — karaka of the 11th house (labha/friends) per BPHS karakatva",
        )
    ],
    Relationship.BUSINESS: [
        (
            PlanetName.MERCURY,
            "Mercury — vanijya (trade/commerce) karaka (standard Jataka practice)",
        )
    ],
}


def _condition(ctx: SiderealContext, planet: PlanetName) -> GrahaCondition:
    """A graha's observable natal condition, verbatim engine facts."""
    natal = ctx.planets[planet]
    return GrahaCondition(
        planet=planet,
        sign=natal.sign,
        house=natal.house,
        dignity=natal.dignity,
        is_retrograde=natal.is_retrograde,
        is_combust=natal.is_combust,
    )


def compute_relation_reading(
    ctx: SiderealContext, relationship: Relationship
) -> RelationSignificators:
    """The classical house + karaka corroboration for one relation, one chart."""
    house = _HOUSE_OF[relationship]
    cusp = ctx.houses[house]
    occupants = sorted(
        (planet.name for planet in ctx.planets.values() if planet.house == house),
        key=lambda planet: planet.value,
    )
    karakas = [
        KarakaAssessment(condition=_condition(ctx, planet), source=source)
        for planet, source in _KARAKAS[relationship]
    ]
    return RelationSignificators(
        relationship=relationship,
        karaka_house=house,
        house_basis=_HOUSE_BASIS[relationship],
        house_sign=cusp.sign,
        house_lord=cusp.sign_lord,
        lord_condition=_condition(ctx, cusp.sign_lord),
        occupants=occupants,
        karakas=karakas,
    )

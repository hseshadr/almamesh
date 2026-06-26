"""Naisargika (natural) planetary friendship — the BPHS five-fold relationship.

Scores a graha's dignity in an arbitrary sign by its natural relationship to that
sign's lord, used by Saptavargaja-bala across the seven vargas. Moolatrikona and
own-sign are detected separately (they outrank friendship). (BPHS, naisargika
maitri table.)
"""

from __future__ import annotations

from enum import Enum
from types import MappingProxyType
from typing import Final

from almamesh.constants.astrology import PlanetName


class Relationship(str, Enum):
    """Natural relationship of a graha to a sign-lord."""

    GREAT_FRIEND = "great_friend"
    FRIEND = "friend"
    NEUTRAL = "neutral"
    ENEMY = "enemy"
    GREAT_ENEMY = "great_enemy"


# Natural friends / enemies per graha (BPHS). Anyone not listed is neutral.
_FRIENDS: Final[dict[PlanetName, frozenset[PlanetName]]] = {
    PlanetName.SUN: frozenset({PlanetName.MOON, PlanetName.MARS, PlanetName.JUPITER}),
    PlanetName.MOON: frozenset({PlanetName.SUN, PlanetName.MERCURY}),
    PlanetName.MARS: frozenset({PlanetName.SUN, PlanetName.MOON, PlanetName.JUPITER}),
    PlanetName.MERCURY: frozenset({PlanetName.SUN, PlanetName.VENUS}),
    PlanetName.JUPITER: frozenset({PlanetName.SUN, PlanetName.MOON, PlanetName.MARS}),
    PlanetName.VENUS: frozenset({PlanetName.MERCURY, PlanetName.SATURN}),
    PlanetName.SATURN: frozenset({PlanetName.MERCURY, PlanetName.VENUS}),
}
_ENEMIES: Final[dict[PlanetName, frozenset[PlanetName]]] = {
    PlanetName.SUN: frozenset({PlanetName.VENUS, PlanetName.SATURN}),
    PlanetName.MOON: frozenset(),
    PlanetName.MARS: frozenset({PlanetName.MERCURY}),
    PlanetName.MERCURY: frozenset({PlanetName.MOON}),
    PlanetName.JUPITER: frozenset({PlanetName.MERCURY, PlanetName.VENUS}),
    PlanetName.VENUS: frozenset({PlanetName.SUN, PlanetName.MOON}),
    PlanetName.SATURN: frozenset({PlanetName.SUN, PlanetName.MOON, PlanetName.MARS}),
}

_RELATIONSHIPS: Final[MappingProxyType[PlanetName, frozenset[PlanetName]]] = MappingProxyType(
    _FRIENDS
)


def natural_relationship(graha: PlanetName, lord: PlanetName) -> Relationship:
    """Natural relationship of ``graha`` to a sign ruled by ``lord``."""
    if graha == lord:
        return Relationship.GREAT_FRIEND
    if lord in _RELATIONSHIPS[graha]:
        return Relationship.FRIEND
    if lord in _ENEMIES[graha]:
        return Relationship.ENEMY
    return Relationship.NEUTRAL

"""Naisargikabala — natural (intrinsic) strength, exact BPHS constants.

BPHS fixes each graha's natural strength as a fixed fraction of 60 Virupas:
Saturn..Sun in 1/7 steps, so Sun = 60, Saturn = 60/7. These are pure constants —
no chart input, no approximation. (BPHS, Shadbala Adhyaya, Naisargikabala.)
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.strength import BalaValue

_FULL: Final[float] = 60.0
_STEP: Final[float] = _FULL / 7.0  # one-seventh of full strength

CITATION: Final[str] = "BPHS Shadbala Adhyaya — Naisargikabala (k/7 of 60 Virupas)."

# Multiplier k (in sevenths) per graha: Sun 7 .. Saturn 1.
_RANK: Final[dict[PlanetName, int]] = {
    PlanetName.SUN: 7,
    PlanetName.MOON: 6,
    PlanetName.VENUS: 5,
    PlanetName.JUPITER: 4,
    PlanetName.MERCURY: 3,
    PlanetName.MARS: 2,
    PlanetName.SATURN: 1,
}

NAISARGIKA_VIRUPAS: Final[MappingProxyType[PlanetName, float]] = MappingProxyType(
    {planet: rank * _STEP for planet, rank in _RANK.items()}
)


def naisargikabala(planet: PlanetName) -> BalaValue:
    """Exact Naisargikabala for a graha (rigorous; never approximated)."""
    return BalaValue(virupas=NAISARGIKA_VIRUPAS[planet], citation=CITATION)

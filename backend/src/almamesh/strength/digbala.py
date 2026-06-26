"""Digbala — directional strength (BPHS).

Each graha is strongest at one angular cusp and weakest at the opposite one,
tapering linearly with longitudinal distance from the point of maximum strength:

    Digbala = 60 * (180 - |separation|) / 180   Virupas,

where ``separation`` is the seam-unwrapped distance (deg) between the graha and
its strong point. Strong points (whole-sign cusp longitudes from the Lagna):
1st (East) Jupiter/Mercury, 10th (South) Sun/Mars, 7th (West) Saturn,
4th (North) Moon/Venus. (BPHS, Shadbala Adhyaya, Digbala.)
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.strength import BalaValue

_FULL: Final[float] = 60.0
_HALF_CIRCLE: Final[float] = 180.0
_HOUSE_ARC: Final[float] = 30.0

CITATION: Final[str] = "BPHS Shadbala Adhyaya — Digbala (linear taper, 60 Virupas at strong cusp)."

# Whole-sign house (from Lagna) at which each graha has full directional strength.
DIG_MAX_HOUSE: Final[MappingProxyType[PlanetName, int]] = MappingProxyType(
    {
        PlanetName.JUPITER: 1,
        PlanetName.MERCURY: 1,
        PlanetName.SUN: 10,
        PlanetName.MARS: 10,
        PlanetName.SATURN: 7,
        PlanetName.MOON: 4,
        PlanetName.VENUS: 4,
    }
)


def _strong_point(planet: PlanetName, lagna_longitude: float) -> float:
    """Longitude of the cusp where the graha has maximum Digbala."""
    house = DIG_MAX_HOUSE[planet]
    return (lagna_longitude + (house - 1) * _HOUSE_ARC) % 360.0


def _separation(planet_longitude: float, strong_point: float) -> float:
    """Seam-unwrapped angular distance (0..180 deg) from the strong point."""
    return abs((planet_longitude - strong_point + _HALF_CIRCLE) % 360.0 - _HALF_CIRCLE)


def digbala_virupas(
    planet: PlanetName, planet_longitude: float, lagna_longitude: float
) -> BalaValue:
    """Directional strength of a graha (rigorous; linear BPHS taper)."""
    sep = _separation(planet_longitude, _strong_point(planet, lagna_longitude))
    virupas = _FULL * (_HALF_CIRCLE - sep) / _HALF_CIRCLE
    return BalaValue(virupas=virupas, citation=CITATION)

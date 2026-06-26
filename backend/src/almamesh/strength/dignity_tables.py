"""Exaltation/debilitation degrees and Saptavargaja dignity Virupa values (BPHS).

Used by Sthanabala. Exaltation longitudes are the classical deep-exaltation
points; the debilitation point is exactly 180 deg away. (BPHS, Shadbala Adhyaya.)
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Final

from almamesh.constants.astrology import PlanetName

# Deep-exaltation absolute longitudes (deg) — debilitation = +180.
EXALTATION_LONGITUDE: Final[MappingProxyType[PlanetName, float]] = MappingProxyType(
    {
        PlanetName.SUN: 10.0,  # Aries 10
        PlanetName.MOON: 33.0,  # Taurus 3
        PlanetName.MARS: 298.0,  # Capricorn 28
        PlanetName.MERCURY: 165.0,  # Virgo 15
        PlanetName.JUPITER: 95.0,  # Cancer 5
        PlanetName.VENUS: 357.0,  # Pisces 27
        PlanetName.SATURN: 200.0,  # Libra 20
    }
)

# Saptavargaja Virupa awards by relationship of the graha to the sign-lord
# (Moolatrikona/own merged into OWN for the seven-varga sum). BPHS values.
MOOLATRIKONA_VIRUPAS: Final[float] = 45.0
OWN_VIRUPAS: Final[float] = 30.0
GREAT_FRIEND_VIRUPAS: Final[float] = 22.5  # Adhi-mitra
FRIEND_VIRUPAS: Final[float] = 15.0
NEUTRAL_VIRUPAS: Final[float] = 7.5  # Sama
ENEMY_VIRUPAS: Final[float] = 3.75
GREAT_ENEMY_VIRUPAS: Final[float] = 1.875  # Adhi-shatru

"""Drikbala — aspectual strength (BPHS Drishti-bala).

Each other graha casts a Drishti whose strength (Virupas) is a piecewise-linear
function of the angular separation (the classical Sphuta-drishti curve). Benefic
aspects add, malefic aspects subtract; the net is scaled by 1/4 to Virupas:

    Drikbala = (sum of benefic drishti - sum of malefic drishti) / 4.

Special higher aspects (Mars 4/8, Jupiter 5/9, Saturn 3/10) are already captured
by the separation-based curve's peaks. (BPHS, Shadbala Adhyaya, Drikbala.)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.strength import SHADBALA_PLANETS, BalaValue

if TYPE_CHECKING:
    from almamesh.schemas.astrology import SiderealContext

CITATION: Final[str] = "BPHS Shadbala Adhyaya — Drikbala (benefic - malefic drishti / 4)."

_NATURAL_BENEFICS: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.JUPITER, PlanetName.VENUS, PlanetName.MOON}
)
_SCALE: Final[float] = 4.0

# Piecewise-linear Sphuta-drishti curve as (start_deg, end_deg, value_at_start,
# slope-per-deg) segments. Any separation outside every segment casts 0 Virupas.
_DRISHTI_SEGMENTS: Final[tuple[tuple[float, float, float, float], ...]] = (
    (30.0, 60.0, 0.0, 0.5),
    (60.0, 90.0, 15.0, 1.0),
    (90.0, 120.0, 45.0, -0.5),
    (120.0, 150.0, 30.0, -1.0),
    (150.0, 180.0, 0.0, 2.0),
    (180.0, 210.0, 60.0, -2.0),
    (240.0, 300.0, 0.0, 0.5),
)


def _drishti_value(separation: float) -> float:
    """Classical Sphuta-drishti Virupa value for an angular separation (deg)."""
    s = separation % 360.0
    for start, end, base, slope in _DRISHTI_SEGMENTS:
        if start <= s < end:
            return base + slope * (s - start)
    return 0.0


def _aspect_on(target_lon: float, source_lon: float) -> float:
    """Drishti Virupas cast by a source graha onto the target longitude."""
    return _drishti_value((source_lon - target_lon) % 360.0)


def drikbala(planet: PlanetName, natal: SiderealContext) -> BalaValue:
    """Net aspectual strength on a graha (rigorous benefic-minus-malefic drishti)."""
    target = natal.planets[planet].longitude
    benefic = malefic = 0.0
    for other in SHADBALA_PLANETS:
        if other == planet:
            continue
        cast = _aspect_on(target, natal.planets[other].longitude)
        if other in _NATURAL_BENEFICS:
            benefic += cast
        else:
            malefic += cast
    return BalaValue(virupas=(benefic - malefic) / _SCALE, citation=CITATION)

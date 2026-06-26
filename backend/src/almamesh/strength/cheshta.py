"""Cheshtabala — motional strength from the real speed/retrograde state (BPHS).

For the five star-planets (Mars, Mercury, Jupiter, Venus, Saturn) Cheshtabala is
graded by the motional state: retrograde (Vakra) is strongest, direct-fast
(Atichara) is weak, with intermediate states between. We map the engine's true
daily speed + retrograde flag onto the eight classical Cheshta states' Virupa
bands, using the planet's mean daily motion as the fast/slow reference.

The Sun and the Moon have no Cheshtabala of their own in BPHS: the Sun takes its
Ayanabala and the Moon its Pakshabala (both computed in Kalabala). Those two are
substituted by the orchestrator; this module covers the five taras rigorously.
(BPHS, Shadbala Adhyaya, Cheshtabala.)
"""

from __future__ import annotations

from types import MappingProxyType
from typing import TYPE_CHECKING, Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.strength import BalaValue

if TYPE_CHECKING:
    from almamesh.schemas.astrology import PlanetPosition

CITATION: Final[str] = "BPHS Shadbala Adhyaya — Cheshtabala (motional state from true speed)."

_VAKRA: Final[float] = 60.0  # retrograde — strongest
_SLOW: Final[float] = 45.0  # markedly slower than mean (near a station)
_DIRECT: Final[float] = 30.0  # ordinary direct motion
_FAST: Final[float] = 15.0  # markedly faster than mean (atichara)

# Mean sidereal daily motion (deg/day) of the five star-planets — the reference
# for grading "fast" vs "slow" against the chart's true instantaneous speed.
_MEAN_SPEED: Final[MappingProxyType[PlanetName, float]] = MappingProxyType(
    {
        PlanetName.MARS: 0.524,
        PlanetName.MERCURY: 1.383,
        PlanetName.JUPITER: 0.083,
        PlanetName.VENUS: 1.602,
        PlanetName.SATURN: 0.034,
    }
)


def _direct_band(speed: float, mean: float) -> float:
    """Virupa band for a direct-moving graha graded against its mean speed."""
    if speed < mean * 0.5:
        return _SLOW
    if speed > mean * 1.5:
        return _FAST
    return _DIRECT


def cheshtabala(planet: PlanetName, position: PlanetPosition) -> BalaValue:
    """Motional strength of one of the five star-planets (rigorous, speed-driven)."""
    if position.is_retrograde:
        return BalaValue(virupas=_VAKRA, citation=CITATION)
    virupas = _direct_band(abs(position.speed), _MEAN_SPEED[planet])
    return BalaValue(virupas=virupas, citation=CITATION)

"""The day/night-driven Kalabala sub-balas (Nathonnatha, Paksha, Tribhaga).

Pure functions over the true sun window + the natal Sun/Moon longitudes. No
astronomy here — the orchestrator passes in the rigorous sunrise/sunset and the
day fraction. (BPHS, Shadbala Adhyaya, Kalabala.)
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.strength import BalaValue

_FULL: Final[float] = 60.0
_HALF: Final[float] = 30.0

_C_NATH: Final[str] = "BPHS Kalabala — Nathonnatha (diurnal/nocturnal, 60 at peak)."
_C_PAKSHA: Final[str] = "BPHS Kalabala — Pakshabala (lunar phase; Moon doubled)."
_C_TRIBHAGA: Final[str] = "BPHS Kalabala — Tribhagabala (thirds of day/night; Jupiter always)."

_DIURNAL: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.SUN, PlanetName.JUPITER, PlanetName.VENUS}
)
_NOCTURNAL: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.MOON, PlanetName.MARS, PlanetName.SATURN}
)
_BENEFICS: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.JUPITER, PlanetName.VENUS, PlanetName.MERCURY, PlanetName.MOON}
)


def nathonnatha(planet: PlanetName, frac_from_midnight: float) -> BalaValue:
    """Diurnal/nocturnal strength; Mercury always full. ``frac`` is 0 at midnight, 1 at noon."""
    if planet == PlanetName.MERCURY:
        return BalaValue(virupas=_FULL, citation=_C_NATH)
    day_strength = _FULL * frac_from_midnight
    virupas = day_strength if planet in _DIURNAL else _FULL - day_strength
    return BalaValue(virupas=virupas, citation=_C_NATH)


def pakshabala(planet: PlanetName, moon_phase_frac: float) -> BalaValue:
    """Lunar-phase strength: benefics scale with brightness, malefics inversely; Moon doubled."""
    bright = _FULL * moon_phase_frac
    base = bright if planet in _BENEFICS else _FULL - bright
    virupas = min(_FULL, base * 2.0) if planet == PlanetName.MOON else base
    return BalaValue(virupas=virupas, citation=_C_PAKSHA)


def _tribhaga_lord(third: int, is_day: bool) -> PlanetName:
    """Lord of the given third of the day (Merc/Sun/Sat) or night (Moon/Ven/Mars)."""
    day = (PlanetName.MERCURY, PlanetName.SUN, PlanetName.SATURN)
    night = (PlanetName.MOON, PlanetName.VENUS, PlanetName.MARS)
    return day[third] if is_day else night[third]


def tribhagabala(planet: PlanetName, third: int, is_day: bool) -> BalaValue:
    """Jupiter always gets the full 60; the third's lord also gets it."""
    if planet == PlanetName.JUPITER or planet == _tribhaga_lord(third, is_day):
        return BalaValue(virupas=_FULL, citation=_C_TRIBHAGA)
    return BalaValue(virupas=0.0, citation=_C_TRIBHAGA)

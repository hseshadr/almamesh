"""Combustion (asta): classical angular orbs from the Sun.

Source: the Surya-Siddhanta tradition as tabulated in B.V. Raman,
*Graha and Bhava Balas* — a planet is combust when its angular separation
from the Sun is within: Moon 12, Mars 17, Mercury 14 (12 when retrograde),
Jupiter 11, Venus 10 (8 when retrograde), Saturn 15 (degrees). "Within" is
inclusive at the orb itself. The Sun cannot be combust; Rahu/Ketu are shadow
points to which asta never applies — they carry no orb at all (fail-loud:
there is no invented default orb for an unknown body).
"""

from __future__ import annotations

from almamesh.constants.astrology import PlanetName

COMBUSTION_ORBS_DEG: dict[PlanetName, float] = {
    PlanetName.MOON: 12.0,
    PlanetName.MARS: 17.0,
    PlanetName.MERCURY: 14.0,
    PlanetName.JUPITER: 11.0,
    PlanetName.VENUS: 10.0,
    PlanetName.SATURN: 15.0,
}

# Tighter orbs while retrograde (same source).
RETROGRADE_COMBUSTION_ORBS_DEG: dict[PlanetName, float] = {
    PlanetName.MERCURY: 12.0,
    PlanetName.VENUS: 8.0,
}


def combustion_separation_deg(planet_longitude: float, sun_longitude: float) -> float:
    """Minimal angular separation (0-180 deg) between a planet and the Sun."""
    return abs((planet_longitude - sun_longitude + 180.0) % 360.0 - 180.0)


def combustion_orb_deg(planet: PlanetName, retrograde: bool) -> float | None:
    """The classical asta orb for this graha, or None when asta cannot apply."""
    if retrograde and planet in RETROGRADE_COMBUSTION_ORBS_DEG:
        return RETROGRADE_COMBUSTION_ORBS_DEG[planet]
    return COMBUSTION_ORBS_DEG.get(planet)


def is_combust(planet: PlanetName, separation_deg: float, retrograde: bool) -> bool:
    """True when the separation is within (inclusive) the classical orb."""
    orb = combustion_orb_deg(planet, retrograde)
    return orb is not None and separation_deg <= orb

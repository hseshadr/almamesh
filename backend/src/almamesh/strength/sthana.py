"""Sthanabala — positional strength = five BPHS sub-balas (Virupas).

Uchcha (exaltation distance), Saptavargaja (dignity summed over 7 vargas),
Ojayugma (odd/even rasi + navamsa), Kendradi (angular/succedent/cadent), and
Drekkana (decanate by gender). All rigorous. (BPHS, Shadbala Adhyaya, Sthanabala.)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from almamesh.constants.astrology import SIGN_LORDS, ZODIAC_SIGNS, PlanetName, ZodiacSign
from almamesh.schemas.strength import BalaValue, SthanaBala
from almamesh.strength import dignity_tables as dt
from almamesh.strength.friendship import Relationship, natural_relationship
from almamesh.strength.saptavarga import SAPTAVARGA_FUNCS

if TYPE_CHECKING:
    from almamesh.schemas.astrology import PlanetPosition

_HALF_CIRCLE: Final[float] = 180.0
_UCCHA_FULL: Final[float] = 60.0
_OJAYUGMA_EACH: Final[float] = 15.0
_KENDRA_FULL: Final[float] = 60.0
_PANAPHARA: Final[float] = 30.0
_APOKLIMA: Final[float] = 15.0
_DREKKANA_MALE: Final[float] = 15.0

_C_UCCHA: Final[str] = "BPHS Sthanabala — Uchchabala (60*(180-|d|)/180)."
_C_SAPTA: Final[str] = "BPHS Sthanabala — Saptavargajabala (dignity over 7 vargas)."
_C_OJA: Final[str] = "BPHS Sthanabala — Ojayugmabala (odd/even rasi + navamsa, 15 each)."
_C_KENDRA: Final[str] = "BPHS Sthanabala — Kendradibala (kendra 60 / panaphara 30 / apoklima 15)."
_C_DREK: Final[str] = "BPHS Sthanabala — Drekkanabala (gender decanate, 15 Virupas)."

_KENDRAS: Final[frozenset[int]] = frozenset({1, 4, 7, 10})
_PANAPHARAS: Final[frozenset[int]] = frozenset({2, 5, 8, 11})
_MALE_GRAHAS: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.SUN, PlanetName.MARS, PlanetName.JUPITER}
)
_FEMALE_GRAHAS: Final[frozenset[PlanetName]] = frozenset({PlanetName.MOON, PlanetName.VENUS})

_VARGA_VIRUPAS: Final[dict[Relationship, float]] = {
    Relationship.GREAT_FRIEND: dt.GREAT_FRIEND_VIRUPAS,
    Relationship.FRIEND: dt.FRIEND_VIRUPAS,
    Relationship.NEUTRAL: dt.NEUTRAL_VIRUPAS,
    Relationship.ENEMY: dt.ENEMY_VIRUPAS,
    Relationship.GREAT_ENEMY: dt.GREAT_ENEMY_VIRUPAS,
}


def _uccha(planet: PlanetName, longitude: float) -> BalaValue:
    """Exaltation strength: full at the exaltation point, 0 at debilitation."""
    exalt = dt.EXALTATION_LONGITUDE[planet]
    dist = abs((longitude - exalt + _HALF_CIRCLE) % 360.0 - _HALF_CIRCLE)
    return BalaValue(virupas=_UCCHA_FULL * (_HALF_CIRCLE - dist) / _HALF_CIRCLE, citation=_C_UCCHA)


def _varga_award(planet: PlanetName, sign_idx: int) -> float:
    """Virupa award for the graha's dignity in one varga sign."""
    sign = ZodiacSign(ZODIAC_SIGNS[sign_idx])
    lord = SIGN_LORDS[sign]
    if lord == planet:
        return dt.OWN_VIRUPAS
    return _VARGA_VIRUPAS[natural_relationship(planet, lord)]


def _saptavargaja(planet: PlanetName, longitude: float) -> BalaValue:
    """Sum of dignity awards across the seven classical vargas."""
    total = sum(_varga_award(planet, func(longitude)) for func in SAPTAVARGA_FUNCS)
    return BalaValue(virupas=total, citation=_C_SAPTA)


def _ojayugma(planet: PlanetName, longitude: float) -> BalaValue:
    """Odd/even strength: 15 per benefic parity in rasi and in navamsa."""
    rasi_odd = int(longitude % 360.0 // 30.0) % 2 == 0
    nav_odd = SAPTAVARGA_FUNCS[4](longitude) % 2 == 0
    wants_odd = planet in (PlanetName.SUN, PlanetName.MARS, PlanetName.JUPITER, PlanetName.MERCURY)
    virupas = _OJAYUGMA_EACH * sum(1 for is_odd in (rasi_odd, nav_odd) if is_odd == wants_odd)
    return BalaValue(virupas=virupas, citation=_C_OJA)


def _kendradi(house: int) -> BalaValue:
    """Angular 60 / succedent 30 / cadent 15 Virupas by house class."""
    if house in _KENDRAS:
        return BalaValue(virupas=_KENDRA_FULL, citation=_C_KENDRA)
    if house in _PANAPHARAS:
        return BalaValue(virupas=_PANAPHARA, citation=_C_KENDRA)
    return BalaValue(virupas=_APOKLIMA, citation=_C_KENDRA)


def _drekkana_strong_decan(planet: PlanetName) -> int:
    """Decan (0/1/2) in which the graha earns Drekkanabala by its gender."""
    if planet in _MALE_GRAHAS:
        return 0  # male grahas — first decan
    if planet in _FEMALE_GRAHAS:
        return 2  # female grahas — third decan
    return 1  # neutral (Mercury/Saturn) — middle decan


def _drekkana(planet: PlanetName, longitude: float) -> BalaValue:
    """15 Virupas when the graha sits in its gender's strong decan, else 0."""
    decan = int(longitude % 30.0 // 10.0)  # 0, 1, 2
    virupas = _DREKKANA_MALE if decan == _drekkana_strong_decan(planet) else 0.0
    return BalaValue(virupas=virupas, citation=_C_DREK)


def sthanabala(planet: PlanetName, position: PlanetPosition) -> SthanaBala:
    """Full positional strength of a graha (five rigorous sub-balas)."""
    lon = position.longitude
    uccha, sapta = _uccha(planet, lon), _saptavargaja(planet, lon)
    oja, kendra = _ojayugma(planet, lon), _kendradi(position.house)
    drek = _drekkana(planet, lon)
    total = uccha.virupas + sapta.virupas + oja.virupas + kendra.virupas + drek.virupas
    return SthanaBala(
        uccha=uccha,
        saptavargaja=sapta,
        ojayugma=oja,
        kendradi=kendra,
        drekkana=drek,
        total_virupas=total,
    )

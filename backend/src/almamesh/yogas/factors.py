"""Honest qualitative yoga strength: real factors, no percentages.

A yoga's grade ("strong" | "moderate" | "weak") is a deterministic, documented
count of real, computable, classically grounded conditions on the planets that
FORM the yoga — never a pseudo-precise number:

- dignity      exaltation/own-sign doctrine (BPHS graha svarupa); the engine's
               natal ``Dignity`` (exalted/own/neutral/debilitated, plus the
               friendship grades where present).
- combustion   asta within the classical orbs (see ``almamesh.yogas.combustion``;
               Surya-Siddhanta tradition per B.V. Raman, *Graha and Bhava Balas*).
- retrograde   vakra motion confers high cheshta-bala (BPHS, Shadbala adhyaya) —
               counted favorable; meaningless for the always-retrograde nodes.
- house class  kendra (1/4/7/10) and trikona (5/9) favorable; dusthana (6/8/12)
               unfavorable; upachaya (3/11) and the rest neutral.

Grade rule (documented, not tunable): net = favorable - unfavorable marks over
all involved planets; strong when net >= +2, weak when net <= -1, else moderate.
"""

from __future__ import annotations

from almamesh.constants.astrology import Dignity, PlanetName
from almamesh.schemas.astrology import (
    PlanetPosition,
    YogaGrade,
    YogaStrengthFactor,
)
from almamesh.yogas.lordship import (
    DUSTHANA_HOUSES,
    KENDRA_HOUSES,
    TRIKONA_HOUSES,
    UPACHAYA_HOUSES,
)

_NODES = frozenset({PlanetName.RAHU, PlanetName.KETU})

_FAVORABLE_DIGNITIES = frozenset(
    {Dignity.EXALTED, Dignity.OWN, Dignity.GREAT_FRIEND, Dignity.FRIEND}
)
_UNFAVORABLE_DIGNITIES = frozenset({Dignity.DEBILITATED, Dignity.ENEMY, Dignity.BITTER_ENEMY})

_DIGNITY_BASIS = "Sign dignity per the BPHS exaltation/own-sign doctrine"
_COMBUSTION_BASIS = (
    "Asta (combustion) within the classical orb of the Sun "
    "(Surya-Siddhanta tradition; B.V. Raman, Graha and Bhava Balas)"
)
_RETROGRADE_BASIS = "Vakra (retrograde) motion confers high cheshta-bala (BPHS, Shadbala adhyaya)"
_HOUSE_BASIS = "Whole-sign house class from the lagna (kendra/trikona/upachaya/dusthana)"


def house_class_label(house: int) -> str:
    """Primary classical class of a whole-sign house (kendra wins over upachaya)."""
    if house in KENDRA_HOUSES:
        return "kendra"
    if house in TRIKONA_HOUSES:
        return "trikona"
    if house in DUSTHANA_HOUSES:
        return "dusthana"
    if house in UPACHAYA_HOUSES:
        return "upachaya"
    return "neutral"


def _dignity_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    return YogaStrengthFactor(
        factor_type="dignity",
        planet=pos.name,
        value=pos.dignity.value,
        basis=_DIGNITY_BASIS,
    )


def _house_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    return YogaStrengthFactor(
        factor_type="house_class",
        planet=pos.name,
        value=f"{house_class_label(pos.house)} (house {pos.house})",
        basis=_HOUSE_BASIS,
    )


def _combustion_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    separation = pos.combustion_separation_deg
    detail = f" ({separation:.2f} deg from the Sun)" if separation is not None else ""
    return YogaStrengthFactor(
        factor_type="combustion",
        planet=pos.name,
        value=f"combust{detail}",
        basis=_COMBUSTION_BASIS,
    )


def _retrograde_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    return YogaStrengthFactor(
        factor_type="retrograde",
        planet=pos.name,
        value="retrograde",
        basis=_RETROGRADE_BASIS,
    )


def planet_factors(pos: PlanetPosition) -> list[YogaStrengthFactor]:
    """Observed factors for one involved planet (dignity + house always;
    combustion/retrograde only when actually present)."""
    factors = [_dignity_factor(pos), _house_factor(pos)]
    if pos.is_combust:
        factors.append(_combustion_factor(pos))
    if pos.is_retrograde and pos.name not in _NODES:
        factors.append(_retrograde_factor(pos))
    return factors


def _net_marks(pos: PlanetPosition) -> int:
    favorable = int(pos.dignity in _FAVORABLE_DIGNITIES)
    favorable += int(pos.house in KENDRA_HOUSES or pos.house in TRIKONA_HOUSES)
    favorable += int(pos.is_retrograde and pos.name not in _NODES)
    unfavorable = int(pos.dignity in _UNFAVORABLE_DIGNITIES)
    unfavorable += int(pos.house in DUSTHANA_HOUSES)
    unfavorable += int(pos.is_combust)
    return favorable - unfavorable


def grade_for(positions: list[PlanetPosition]) -> YogaGrade:
    """Deterministic qualitative grade from the involved planets' factors."""
    net = sum(_net_marks(pos) for pos in positions)
    if net >= 2:
        return "strong"
    if net <= -1:
        return "weak"
    return "moderate"


def factors_for(positions: list[PlanetPosition]) -> list[YogaStrengthFactor]:
    """All observed factors across the involved planets, in planet order."""
    out: list[YogaStrengthFactor] = []
    for pos in positions:
        out.extend(planet_factors(pos))
    return out

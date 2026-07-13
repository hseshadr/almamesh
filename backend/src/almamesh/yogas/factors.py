"""Honest yoga strength: qualitative grades plus calibrated structural percentages.

A yoga's grade ("strong" | "moderate" | "weak") is a deterministic, documented
count of real, computable, classically grounded conditions on the planets that
FORM the yoga. Its percentage is a reproducible normalization over that same
bounded mark lattice, not a probability and not empirically validated life outcomes:

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
from almamesh.yogas.combustion import COMBUSTION_ORBS_DEG
from almamesh.yogas.lordship import (
    DUSTHANA_HOUSES,
    KENDRA_HOUSES,
    TRIKONA_HOUSES,
    UPACHAYA_HOUSES,
)

_NODES = frozenset({PlanetName.RAHU, PlanetName.KETU})

# Which planets CAN earn the retrograde +1: the Sun and Moon never turn vakra,
# and the nodes are perpetually retrograde but excluded from the mark (see
# ``_net_marks``) — so only these five ever contribute it. The max-favorable
# anchor must count retrograde headroom for exactly this set (rigor-upgrade §E-5).
_CAN_RETROGRADE = frozenset(
    {
        PlanetName.MARS,
        PlanetName.MERCURY,
        PlanetName.JUPITER,
        PlanetName.VENUS,
        PlanetName.SATURN,
    }
)

# Which planets CAN earn the combustion -1: the single source of truth is the
# classical asta orb table — the Sun (the source of asta) and the nodes carry no
# orb, so they never combust. The max-unfavorable anchor counts combustion
# headroom for exactly this set, so a Sun-yoga's scale is right (rigor-upgrade §E-5).
_CAN_COMBUST = frozenset(COMBUSTION_ORBS_DEG)

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


def _dignity_mark(dignity: Dignity) -> int:
    """Signed dignity contribution: +1 favorable, -1 unfavorable, 0 neutral."""
    if dignity in _FAVORABLE_DIGNITIES:
        return 1
    if dignity in _UNFAVORABLE_DIGNITIES:
        return -1
    return 0


def _house_mark(house: int) -> int:
    """Signed house-class contribution: +1 kendra/trikona, -1 dusthana, else 0.

    House 1 is both kendra and trikona; it counts once (mirrors ``_net_marks``).
    """
    if house in KENDRA_HOUSES or house in TRIKONA_HOUSES:
        return 1
    if house in DUSTHANA_HOUSES:
        return -1
    return 0


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
        mark=_dignity_mark(pos.dignity),
    )


def _house_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    return YogaStrengthFactor(
        factor_type="house_class",
        planet=pos.name,
        value=f"{house_class_label(pos.house)} (house {pos.house})",
        basis=_HOUSE_BASIS,
        mark=_house_mark(pos.house),
    )


def _combustion_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    separation = pos.combustion_separation_deg
    detail = f" ({separation:.2f} deg from the Sun)" if separation is not None else ""
    return YogaStrengthFactor(
        factor_type="combustion",
        planet=pos.name,
        value=f"combust{detail}",
        basis=_COMBUSTION_BASIS,
        mark=-1,  # combustion is only emitted when present, and is unfavorable
    )


def _retrograde_factor(pos: PlanetPosition) -> YogaStrengthFactor:
    return YogaStrengthFactor(
        factor_type="retrograde",
        planet=pos.name,
        value="retrograde",
        basis=_RETROGRADE_BASIS,
        mark=1,  # retrograde is only emitted for non-nodes, and is favorable
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


def _max_favorable(pos: PlanetPosition) -> int:
    """Favorable headroom for one planet: dignity +1, kendra/trikona +1, and
    retrograde +1 only where the planet can turn vakra."""
    return 2 + int(pos.name in _CAN_RETROGRADE)


def _max_unfavorable(pos: PlanetPosition) -> int:
    """Unfavorable headroom for one planet: dignity +1, dusthana +1, and
    combustion +1 only where asta can apply (never the Sun/nodes)."""
    return 2 + int(pos.name in _CAN_COMBUST)


def _strength_pct(net: int, max_favorable: int, max_unfavorable: int) -> float:
    """Linear map of net marks onto [0, 100] over the achievable [-M-, +M+] range.

    Linear (not log) because the mark lattice is small, bounded, and every mark
    is defined equal — there is no diminishing-returns structure to honor.
    """
    span = max_favorable + max_unfavorable
    if span <= 0:  # unreachable for a non-empty planet set; guarded, not silent
        return 50.0
    raw = 100.0 * (net + max_unfavorable) / span
    return round(min(100.0, max(0.0, raw)), 2)


def favorability(positions: list[PlanetPosition]) -> tuple[int, int, int, float]:
    """Signed net marks, the yoga's own max-favorable/max-unfavorable range, and
    the calibrated structural strength %.

    Reuses ``_net_marks`` for ``net`` so the grade and the % can never disagree.
    Returns ``(net, max_favorable, max_unfavorable, strength_pct)``.
    """
    net = sum(_net_marks(pos) for pos in positions)
    max_favorable = sum(_max_favorable(pos) for pos in positions)
    max_unfavorable = sum(_max_unfavorable(pos) for pos in positions)
    pct = _strength_pct(net, max_favorable, max_unfavorable)
    return net, max_favorable, max_unfavorable, pct

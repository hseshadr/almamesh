"""The grade and the percentage are ONE rule: they can never disagree.

``factors.favorability`` emits a percentage; ``factors.grade_for`` emits a word.
Both are printed, adjacent, in the same report line ("45% · moderate"). If the
word is derived from a *different* rule than the number, the report contradicts
itself in public — the exact fabricated-authority defect this engine forbids.

The published contract (rigor-upgrade §A.1) has ONE set of cut points:

    pct >= 75 -> strong ; pct >= 40 -> moderate ; else weak

These tests restate those cut points as literals — a third, independent copy of
the contract that neither implementation can quietly move — and then enumerate
the ACHIEVABLE (net, max_favorable, max_unfavorable) lattice, asserting the word
and the number agree at every single point, not at a sampled few.

Break the property, not the form: restoring the old ``net >= 2 / net <= -1``
thresholds in ``grade_for`` turns these red on 23.4% of the lattice.
"""

from __future__ import annotations

from itertools import product

import pytest

from almamesh.constants.astrology import Dignity, PlanetName, ZodiacSign
from almamesh.schemas.astrology import PlanetPosition, YogaGrade
from almamesh.yogas.factors import favorability, grade_for

# ---------------------------------------------------------------------------
# The published §A.1 cut points, restated as literals. This is deliberately NOT
# an import: it is the contract the implementations are measured against.
# ---------------------------------------------------------------------------

_STRONG_CUT = 75.0
_MODERATE_CUT = 40.0


def _contract_band(pct: float) -> YogaGrade:
    """The published percentage->word rule, independent of any implementation."""
    if pct >= _STRONG_CUT:
        return "strong"
    if pct >= _MODERATE_CUT:
        return "moderate"
    return "weak"


# ---------------------------------------------------------------------------
# Achievable per-planet conditions. A planet only gets the retrograde mark if it
# can turn vakra and the combustion mark if asta can apply to it, so every point
# enumerated here is a configuration a real chart can actually produce.
# ---------------------------------------------------------------------------

# One planet per distinct (max_favorable, max_unfavorable) shape the engine has:
# the Sun 2/2 (no vakra, no asta), the Moon 2/3 (asta only), Venus 3/3 (both).
_SHAPE_REPRESENTATIVES = (PlanetName.SUN, PlanetName.MOON, PlanetName.VENUS)

_DIGNITIES = (Dignity.EXALTED, Dignity.NEUTRAL, Dignity.DEBILITATED)
_HOUSES = (1, 3, 6)  # kendra (+1), upachaya (0), dusthana (-1)
_CAN_RETROGRADE = frozenset(
    {
        PlanetName.MARS,
        PlanetName.MERCURY,
        PlanetName.JUPITER,
        PlanetName.VENUS,
        PlanetName.SATURN,
    }
)
_CAN_COMBUST = frozenset(
    {
        PlanetName.MOON,
        PlanetName.MARS,
        PlanetName.MERCURY,
        PlanetName.JUPITER,
        PlanetName.VENUS,
        PlanetName.SATURN,
    }
)


def _pos(
    name: PlanetName,
    dignity: Dignity,
    house: int,
    *,
    retrograde: bool,
    combust: bool,
) -> PlanetPosition:
    """``favorability`` reads only name/dignity/house/retrograde/combust; the
    astronomy-derived fields are inert placeholders."""
    return PlanetPosition(
        name=name,
        longitude=0.0,
        sign=ZodiacSign.ARIES,
        sign_degrees=0.0,
        sign_lord=PlanetName.MARS,
        nakshatra="Ashwini",
        nakshatra_pada=1,
        nakshatra_lord=PlanetName.KETU,
        house=house,
        dignity=dignity,
        is_retrograde=retrograde,
        is_combust=combust,
    )


def _achievable_positions(name: PlanetName) -> list[PlanetPosition]:
    """Every condition combination this planet can physically hold."""
    retro_options = (False, True) if name in _CAN_RETROGRADE else (False,)
    combust_options = (False, True) if name in _CAN_COMBUST else (False,)
    return [
        _pos(name, dignity, house, retrograde=retro, combust=combust)
        for dignity, house, retro, combust in product(
            _DIGNITIES, _HOUSES, retro_options, combust_options
        )
    ]


def _one_per_net(name: PlanetName) -> list[PlanetPosition]:
    """One representative position per distinct achievable net for this planet."""
    by_net: dict[int, PlanetPosition] = {}
    for pos in _achievable_positions(name):
        by_net.setdefault(favorability([pos])[0], pos)
    return list(by_net.values())


_SINGLES = [pos for name in _SHAPE_REPRESENTATIVES for pos in _achievable_positions(name)]
_PER_NET = [_one_per_net(name) for name in _SHAPE_REPRESENTATIVES]


def _assert_agrees(positions: list[PlanetPosition]) -> None:
    net, max_fav, max_unfav, pct = favorability(positions)
    expected = _contract_band(pct)
    assert grade_for(positions) == expected, (
        f"grade/percentage disagree: net={net:+d} of [-{max_unfav}, +{max_fav}] "
        f"-> {pct}% reads '{_contract_band(pct)}' by the published cut points "
        f"but grade_for() says '{grade_for(positions)}'"
    )


# ---------------------------------------------------------------------------
# Exhaustive: every 1- and 2-planet configuration a chart can produce.
# ---------------------------------------------------------------------------


def test_grade_agrees_with_percentage_band_for_every_single_planet_yoga() -> None:
    for pos in _SINGLES:
        _assert_agrees([pos])


def test_grade_agrees_with_percentage_band_for_every_two_planet_yoga() -> None:
    for first, second in product(_SINGLES, _SINGLES):
        _assert_agrees([first, second])


# ---------------------------------------------------------------------------
# Full net lattice for larger yogas: one representative per per-planet net keeps
# the product tractable while still visiting every reachable (net, M+, M-).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("size", [3, 4])
def test_grade_agrees_with_percentage_band_across_the_full_net_lattice(size: int) -> None:
    for combo in product(*(_PER_NET * size)[:size]):
        _assert_agrees(list(combo))


# ---------------------------------------------------------------------------
# The reader sees a ROUNDED percentage next to the word. If rounding could cross
# a cut point, the number on screen would imply a different word than the one
# printed beside it — reproducible-arithmetic failure even with one rule.
# ---------------------------------------------------------------------------


def test_rounding_the_displayed_percentage_never_crosses_a_cut_point() -> None:
    for first, second in product(_SINGLES, _SINGLES):
        pct = favorability([first, second])[3]
        assert _contract_band(pct) == _contract_band(float(round(pct))), (
            f"{pct}% bands as '{_contract_band(pct)}' but displays as "
            f"{round(pct)}%, which bands as '{_contract_band(float(round(pct)))}'"
        )


# ---------------------------------------------------------------------------
# Anchors: the cut points are real boundaries, not vacuous ones.
# ---------------------------------------------------------------------------


def test_the_cut_points_are_exercised_by_real_configurations() -> None:
    """Every band is reachable — a green agreement test over an all-'moderate'
    lattice would prove nothing."""
    bands = {_contract_band(favorability([pos])[3]) for pos in _SINGLES}
    assert bands == {"strong", "moderate", "weak"}

"""Calibrated structural yoga strength: ``favorability`` transform + ledger.

These tests pin the six-gate acceptance bar for the yoga strength %
(rigor-upgrade-spec §A.0/§A.1, Tier S):

- anchored to the yoga's own max-favorable / max-unfavorable mark lattice,
- monotonic (more favorable evidence never lowers the %),
- chart-invariant & reproducible (one linear transform, every chart),
- calibrated (textbook-strong configs read strong, textbook-weak read weak),
- transparent (per-factor ``mark`` sums to ``net_marks``),
- honest (combustion is excluded from planets that cannot combust — the Sun).
"""

from __future__ import annotations

import pytest

from almamesh.constants.astrology import Dignity, PlanetName, ZodiacSign
from almamesh.schemas.astrology import PlanetPosition
from almamesh.yogas.factors import favorability, planet_factors

# ---------------------------------------------------------------------------
# A minimal PlanetPosition builder: ``favorability`` reads only name/dignity/
# house/is_retrograde/is_combust, so the astronomy-derived fields are inert
# placeholders here. (Full engine-derived charts are covered separately via
# ``yoga_builders.make_chart``.)
# ---------------------------------------------------------------------------


def _pos(
    name: PlanetName,
    dignity: Dignity,
    house: int,
    *,
    retrograde: bool = False,
    combust: bool = False,
) -> PlanetPosition:
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


# ---------------------------------------------------------------------------
# Unit: exact net / M+ / M- / pct on hand-built positions.
# ---------------------------------------------------------------------------


def test_exalted_kendra_planet_exact() -> None:
    net, m_plus, m_minus, pct = favorability([_pos(PlanetName.JUPITER, Dignity.EXALTED, 1)])
    assert (net, m_plus, m_minus) == (2, 3, 3)  # dig+1, kendra+1; retro/combust capable
    assert pct == pytest.approx(83.33, abs=0.01)  # 100*(2+3)/6


def test_neutral_planet_is_midpoint() -> None:
    net, m_plus, m_minus, pct = favorability([_pos(PlanetName.MARS, Dignity.NEUTRAL, 3)])
    assert (net, m_plus, m_minus) == (0, 3, 3)
    assert pct == pytest.approx(50.0)


def test_empty_positions_fail_closed_to_midpoint() -> None:
    # A yoga always has >=1 planet, so this is unreachable in practice; the guard
    # returns the neutral midpoint rather than dividing by a zero span.
    assert favorability([]) == (0, 0, 0, 50.0)


def test_sun_anchor_excludes_combustion_and_retrograde() -> None:
    """The Sun can neither combust (it IS the source of asta) nor retrograde,
    so its achievable range is 2/2 — never 3 — and a debilitated dusthana Sun
    bottoms out at 0%, not the ~20% a spurious combust mark would give."""
    net, m_plus, m_minus, pct = favorability([_pos(PlanetName.SUN, Dignity.DEBILITATED, 6)])
    assert m_plus == 2 and m_minus == 2  # NO retrograde/combust headroom for the Sun
    assert net == -2
    assert pct == pytest.approx(0.0)


def test_exalted_sun_kendra_tops_out() -> None:
    _, m_plus, m_minus, pct = favorability([_pos(PlanetName.SUN, Dignity.EXALTED, 1)])
    assert m_plus == 2 and m_minus == 2
    assert pct == pytest.approx(100.0)


# ---------------------------------------------------------------------------
# Calibration: textbook-strong reads strong, textbook-weak reads weak,
# a mixed case lands in the moderate band — across distinct configurations.
# ---------------------------------------------------------------------------

_STRONG_GAJAKESARI = [
    _pos(PlanetName.JUPITER, Dignity.EXALTED, 1, retrograde=True),
    _pos(PlanetName.MOON, Dignity.NEUTRAL, 4),
]
_WEAK_MARS = [_pos(PlanetName.MARS, Dignity.DEBILITATED, 6, combust=True)]
_WEAK_SUN = [_pos(PlanetName.SUN, Dignity.DEBILITATED, 8)]
_MID_MERCURY = [_pos(PlanetName.MERCURY, Dignity.OWN, 3)]
_MID_MIXED = [
    _pos(PlanetName.VENUS, Dignity.EXALTED, 1),  # +2
    _pos(PlanetName.SATURN, Dignity.DEBILITATED, 12),  # -2
]


def test_calibration_strong_gajakesari() -> None:
    *_, pct = favorability(_STRONG_GAJAKESARI)
    assert pct >= 85.0  # exalted-Jupiter Gaja-Kesari is a textbook-strong yoga


@pytest.mark.parametrize("positions", [_WEAK_MARS, _WEAK_SUN])
def test_calibration_weak(positions: list[PlanetPosition]) -> None:
    *_, pct = favorability(positions)
    assert pct <= 15.0


@pytest.mark.parametrize("positions", [_MID_MERCURY, _MID_MIXED])
def test_calibration_moderate_band(positions: list[PlanetPosition]) -> None:
    *_, pct = favorability(positions)
    assert 40.0 <= pct < 75.0  # the moderate band (rigor-upgrade §A.1)


# ---------------------------------------------------------------------------
# Property: monotonicity of the transform.
# ---------------------------------------------------------------------------

_FAVORABLE_HOUSE, _NEUTRAL_HOUSE, _DUSTHANA_HOUSE = 4, 2, 8


@pytest.mark.parametrize("house", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
def test_dignity_monotonic(house: int) -> None:
    exalted = favorability([_pos(PlanetName.MARS, Dignity.EXALTED, house)])[3]
    neutral = favorability([_pos(PlanetName.MARS, Dignity.NEUTRAL, house)])[3]
    debilitated = favorability([_pos(PlanetName.MARS, Dignity.DEBILITATED, house)])[3]
    assert exalted >= neutral >= debilitated


@pytest.mark.parametrize("dignity", [Dignity.EXALTED, Dignity.NEUTRAL, Dignity.DEBILITATED])
def test_house_class_monotonic(dignity: Dignity) -> None:
    favorable = favorability([_pos(PlanetName.MARS, dignity, _FAVORABLE_HOUSE)])[3]
    neutral = favorability([_pos(PlanetName.MARS, dignity, _NEUTRAL_HOUSE)])[3]
    dusthana = favorability([_pos(PlanetName.MARS, dignity, _DUSTHANA_HOUSE)])[3]
    assert favorable >= neutral >= dusthana


def test_adding_retrograde_never_lowers() -> None:
    base = favorability([_pos(PlanetName.MERCURY, Dignity.NEUTRAL, 2)])[3]
    with_retro = favorability([_pos(PlanetName.MERCURY, Dignity.NEUTRAL, 2, retrograde=True)])[3]
    assert with_retro >= base


def test_adding_combustion_never_raises() -> None:
    base = favorability([_pos(PlanetName.MERCURY, Dignity.NEUTRAL, 2)])[3]
    with_combust = favorability([_pos(PlanetName.MERCURY, Dignity.NEUTRAL, 2, combust=True)])[3]
    assert with_combust <= base


# ---------------------------------------------------------------------------
# Transparency: the per-factor signed marks sum to net_marks, so the ledger
# and the % can never disagree.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "position",
    [
        _pos(PlanetName.JUPITER, Dignity.EXALTED, 1, retrograde=True),
        _pos(PlanetName.MARS, Dignity.DEBILITATED, 6, combust=True),
        _pos(PlanetName.MERCURY, Dignity.OWN, 3),
        _pos(PlanetName.SATURN, Dignity.NEUTRAL, 11),
    ],
)
def test_factor_marks_sum_to_net(position: PlanetPosition) -> None:
    net, *_ = favorability([position])
    ledger_sum = sum(factor.mark for factor in planet_factors(position))
    assert ledger_sum == net


def test_pct_is_bounded() -> None:
    for dignity in (Dignity.EXALTED, Dignity.DEBILITATED, Dignity.NEUTRAL):
        for house in range(1, 13):
            *_, pct = favorability([_pos(PlanetName.SATURN, dignity, house, combust=True)])
            assert 0.0 <= pct <= 100.0


# ---------------------------------------------------------------------------
# Pipeline: the fields thread all the way onto a real engine-emitted YogaData.
# ---------------------------------------------------------------------------


def _gajakesari(chart_yogas: list) -> object:
    return next(y for y in chart_yogas if y.name == "Gajakesari Yoga")


def test_strong_gajakesari_threads_calibrated_fields() -> None:
    from almamesh.yogas.engine import create_yoga_engine
    from tests.yoga_builders import make_chart

    # Exalted Jupiter + own Moon both in the 1st (kendra): a textbook-strong yoga.
    chart = make_chart(
        lagna_sign=ZodiacSign.CANCER,
        placements={
            PlanetName.JUPITER: (ZodiacSign.CANCER, 5.0),
            PlanetName.MOON: (ZodiacSign.CANCER, 20.0),
        },
    )
    yoga = _gajakesari(create_yoga_engine(chart).evaluate_all_yogas())

    assert yoga.strength_tier == "structural"
    assert yoga.strength_pct >= 85.0
    assert 0.0 <= yoga.strength_pct <= 100.0
    assert yoga.max_favorable > 0 and yoga.max_unfavorable > 0
    # The ledger is auditable: the per-factor signed marks sum to net_marks.
    assert sum(f.mark for f in yoga.strength_factors) == yoga.net_marks

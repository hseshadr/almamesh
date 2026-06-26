"""Regression: lunar node speed must be a real finite-difference, not a literal.

The hardcoded `speed=-0.053` / `is_retrograde=True` in `_get_lunar_node_positions`
broke transit ingress timing (any root-find on Rahu/Ketu motion needs a real
velocity). The mean node is ~-0.0529 deg/day retrograde; the TRUE node oscillates
and is sometimes DIRECT. Both must be derived from two-instant differencing,
identical to how the nine standard grahas already compute speed.
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import (
    AyanamsaType,
    NodeType,
    SkyfieldAstronomy,
    _resolve_ayanamsa,
)
from almamesh.constants.astrology import PlanetName

# A fixed instant so the assertions are reproducible (well inside DE421 range).
_FIXED = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)
# Published mean-node retrograde rate: 360 deg / 6793.48 days ~= -0.05295 deg/day.
_MEAN_NODE_RATE = -360.0 / 6793.48


def _speed_for(node_type: NodeType, name: PlanetName) -> float:
    # Given a constructed astronomy object resolved at the fixed instant
    astro = SkyfieldAstronomy()
    ayanamsa = _resolve_ayanamsa(astro, _FIXED, AyanamsaType.LAHIRI)
    # When positions are computed for the chosen node model
    positions = astro.get_planetary_positions(_FIXED, ayanamsa, node_type)
    return float(positions[name]["speed"])


def test_should_not_hardcode_node_speed_when_mean_node() -> None:
    # Given the mean node at the fixed instant
    # When its speed is read
    speed = _speed_for(NodeType.MEAN, PlanetName.RAHU)
    # Then it is the real Meeus rate, NOT the old -0.053 literal
    assert speed != -0.053
    assert abs(speed - _MEAN_NODE_RATE) < 0.002


def test_should_be_retrograde_when_mean_node() -> None:
    # Given the mean node, which is always retrograde
    speed = _speed_for(NodeType.MEAN, PlanetName.RAHU)
    # Then is_retrograde follows the sign of the speed (negative -> retrograde)
    astro = SkyfieldAstronomy()
    ayanamsa = _resolve_ayanamsa(astro, _FIXED, AyanamsaType.LAHIRI)
    positions = astro.get_planetary_positions(_FIXED, ayanamsa, NodeType.MEAN)
    assert speed < 0
    assert positions[PlanetName.RAHU]["is_retrograde"] is True


def test_should_match_finite_difference_when_mean_node() -> None:
    # Given the tropical node longitude sampled one day apart (speed is a
    # tropical-of-date finite difference, same as the nine standard grahas)
    astro = SkyfieldAstronomy()
    t1 = astro.ts.from_datetime(_FIXED)
    t2 = astro.ts.tt_jd(t1.tt + 1.0)
    lon1 = astro._node_tropical(t1, NodeType.MEAN)
    lon2 = astro._node_tropical(t2, NodeType.MEAN)
    reported = _speed_for(NodeType.MEAN, PlanetName.RAHU)
    # Then the reported speed equals the one-day longitude delta (seam-unwrapped)
    manual = (lon2 - lon1 + 180) % 360 - 180
    assert abs(reported - manual) < 1e-9


def test_should_derive_retrograde_flag_from_speed_sign_when_true_node() -> None:
    # Given the TRUE node, whose oscillation can be direct or retrograde
    speed = _speed_for(NodeType.TRUE, PlanetName.RAHU)
    astro = SkyfieldAstronomy()
    ayanamsa = _resolve_ayanamsa(astro, _FIXED, AyanamsaType.LAHIRI)
    flag = astro.get_planetary_positions(_FIXED, ayanamsa, NodeType.TRUE)[PlanetName.RAHU][
        "is_retrograde"
    ]
    # Then the retrograde flag is consistent with the sign of the real speed
    assert flag is (speed < 0)
    # And the TRUE-node speed is NOT the old frozen literal
    assert speed != -0.053

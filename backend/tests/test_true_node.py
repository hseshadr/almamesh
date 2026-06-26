"""True (oscillating) lunar node vs the mean node.

CORRECTNESS-CRITICAL. The true node is computed from the geocentric Moon's
ecliptic-of-date state vector (h = r x v; node = z_hat x h). Research pins the
true node at J2000 12:00Z to ~123.96 deg, the mean node to ~125.04 deg, so the
separation must sit strictly inside (0, 1.5) deg. The default for
`calculate_sidereal_context` MUST remain the mean node (backward-compatible).
"""

from datetime import UTC, datetime

from almamesh.calculations import (
    NodeType,
    SkyfieldAstronomy,
    calculate_sidereal_context,
)
from almamesh.constants.astrology import PlanetName

J2000 = datetime(2000, 1, 1, 12, 0, tzinfo=UTC)


def _ang_sep(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def test_true_node_differs_from_mean_within_bounds() -> None:
    """|true - mean| at J2000 12:00Z lies strictly in (0, 1.5) degrees."""
    astro = SkyfieldAstronomy()
    ayanamsa = 0.0  # compare tropical longitudes directly
    mean = astro.get_planetary_positions(J2000, ayanamsa, node_type=NodeType.MEAN)
    true = astro.get_planetary_positions(J2000, ayanamsa, node_type=NodeType.TRUE)

    delta = _ang_sep(true[PlanetName.RAHU]["longitude"], mean[PlanetName.RAHU]["longitude"])
    assert 0.0 < delta < 1.5, f"true-vs-mean node delta {delta} out of (0,1.5)"


def test_true_node_ketu_opposes_rahu() -> None:
    """Ketu stays exactly 180 deg from Rahu for the true node too."""
    astro = SkyfieldAstronomy()
    pos = astro.get_planetary_positions(J2000, 0.0, node_type=NodeType.TRUE)
    assert (
        _ang_sep(pos[PlanetName.KETU]["longitude"], pos[PlanetName.RAHU]["longitude"] + 180.0)
        < 1e-6
    )


def test_mean_node_is_the_default() -> None:
    """calculate_sidereal_context defaults to the mean node (unchanged behavior)."""
    ctx_default = calculate_sidereal_context(J2000, 28.6139, 77.2090)
    ctx_mean = calculate_sidereal_context(J2000, 28.6139, 77.2090, node_type=NodeType.MEAN)
    assert (
        ctx_default.planets[PlanetName.RAHU].longitude
        == ctx_mean.planets[PlanetName.RAHU].longitude
    )

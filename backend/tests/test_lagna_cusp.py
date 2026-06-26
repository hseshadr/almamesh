"""Cusp-proximity engine fields — the single source of truth for the UI's
near-cusp "Birth-time sensitivity" banner (mirrors apps/web/src/lib/lagnaCusp.ts).

A sign spans 30 deg. When the Lagna sits near a sign boundary ("a cusp"), a few
minutes of birth time can flip the rising sign — exactly the ambiguity birth-time
rectification resolves. The engine now emits, on ``LagnaData``, how far the Lagna
is from the NEAREST boundary, the sign across that boundary, and whether it is
within the near-cusp threshold — so the UI never recomputes this itself.

Synthetic natives ONLY (PII): the near-cusp case is the in-repo Bengaluru
1988-08-08 fixture (Leo ~0.04 deg, on the Cancer cusp); the mid-sign case is the
NYC fixture (Cancer ~16 deg). No real birth data is used here.
"""

from datetime import UTC, datetime

import pytest

from almamesh.calculations import _cusp_proximity, calculate_sidereal_context
from almamesh.constants.astrology import ZodiacSign
from almamesh.schemas.astrology import SiderealContext

# Fixed "now" so the chart (and its current maha dasha) is reproducible.
FIXED_REFERENCE_DATE = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)


def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def test_near_cusp_native_flags_the_adjacent_sign() -> None:
    """Bengaluru 1988-08-08 rises Leo ~0.04 deg — ~0.04 deg from the Cancer cusp."""
    lagna = _chart("1988-08-08T01:14:00+00:00", 12.9716, 77.5946).lagna
    assert lagna.sign is ZodiacSign.LEO
    assert lagna.is_near_cusp is True
    # Just inside Leo's lower boundary -> the previous sign is the alternative.
    assert lagna.lagna_adjacent_sign is ZodiacSign.CANCER
    assert lagna.lagna_cusp_distance_deg == pytest.approx(0.043, abs=0.01)


def test_mid_sign_native_is_not_near_cusp() -> None:
    """NYC fixture rises Cancer ~16 deg — well clear of either boundary."""
    lagna = _chart("2000-12-31T23:59:00+00:00", 40.7128, -74.0060).lagna
    assert lagna.sign is ZodiacSign.CANCER
    assert lagna.is_near_cusp is False
    # 16.12 deg is past mid-sign, so the NEAREST boundary is the upper one -> Leo.
    assert lagna.lagna_adjacent_sign is ZodiacSign.LEO
    assert lagna.lagna_cusp_distance_deg == pytest.approx(13.879, abs=0.01)


@pytest.mark.parametrize(
    ("longitude", "distance", "adjacent", "near"),
    [
        # Aries 0.5 deg: nearer the lower edge, wraps back to Pisces.
        (0.5, 0.5, ZodiacSign.PISCES, True),
        # Pisces 29.5 deg: nearer the upper edge, wraps forward to Aries.
        (359.5, 0.5, ZodiacSign.ARIES, True),
        # Taurus exactly 3 deg: the threshold is INCLUSIVE (<=), so still near.
        (33.0, 3.0, ZodiacSign.ARIES, True),
        # Taurus 3.5 deg: just past the threshold -> not near.
        (33.5, 3.5, ZodiacSign.ARIES, False),
        # Cancer mid-sign (15 deg): equidistant, ties to the PREVIOUS sign; not near.
        (105.0, 15.0, ZodiacSign.GEMINI, False),
    ],
)
def test_cusp_proximity_mirrors_the_ui_contract(
    longitude: float, distance: float, adjacent: ZodiacSign, near: bool
) -> None:
    """``_cusp_proximity`` matches lib/lagnaCusp.ts boundary + neighbour semantics."""
    measured_distance, adjacent_sign, is_near = _cusp_proximity(longitude)
    assert measured_distance == pytest.approx(distance, abs=1e-9)
    assert adjacent_sign is adjacent
    assert is_near is near

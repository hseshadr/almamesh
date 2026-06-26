"""Dasha synchrony: pure interval intersection over engine-emitted dates.

No astrology is computed here — the engine's dated maha+antar trees are joined
over an EXPLICIT window (no silent "now"). Expectations below were read off the
two charts' engine-emitted antar boundaries:

  Delhi : rahu/saturn ..2025-04-25, rahu/mercury 2025-04-25..2027-11-12
  Mumbai: jupiter/mercury ..2025-04-03, jupiter/ketu ..2026-03-10,
          jupiter/venus 2026-03-10..2028-11-08
  London: jupiter/jupiter ..2025-06-11, jupiter/saturn 2025-06-11..
  Sydney: jupiter/jupiter 2024-12-18..2027-02-05
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from functools import cache

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName
from almamesh.mesh import compute_dasha_synchrony
from almamesh.schemas.astrology import SiderealContext

FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
MUMBAI = ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777)
LONDON = ("1972-03-10T08:15:00+00:00", 51.5074, -0.1278)
SYDNEY = ("2010-06-21T18:00:00+00:00", -33.8688, 151.2093)

WINDOW_START = datetime(2025, 1, 1, tzinfo=UTC)
WINDOW_END = datetime(2027, 1, 1, tzinfo=UTC)


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def test_delhi_x_mumbai_2025_2027_yields_four_aligned_segments() -> None:
    result = compute_dasha_synchrony(
        _chart(*DELHI), _chart(*MUMBAI), start=WINDOW_START, end=WINDOW_END
    )
    assert len(result.segments) == 4
    legs = [(s.a_maha, s.a_antar, s.b_maha, s.b_antar) for s in result.segments]
    assert legs == [
        (PlanetName.RAHU, PlanetName.SATURN, PlanetName.JUPITER, PlanetName.MERCURY),
        (PlanetName.RAHU, PlanetName.SATURN, PlanetName.JUPITER, PlanetName.KETU),
        (PlanetName.RAHU, PlanetName.MERCURY, PlanetName.JUPITER, PlanetName.KETU),
        (PlanetName.RAHU, PlanetName.MERCURY, PlanetName.JUPITER, PlanetName.VENUS),
    ]
    # Boundary dates come verbatim from the two engine timelines.
    assert result.segments[0].end.date() == date(2025, 4, 3)
    assert result.segments[1].end.date() == date(2025, 4, 25)
    assert result.segments[2].end.date() == date(2026, 3, 10)
    assert all(not s.shared_lords for s in result.segments)


def test_segments_are_contiguous_and_clipped_to_the_window() -> None:
    result = compute_dasha_synchrony(
        _chart(*DELHI), _chart(*MUMBAI), start=WINDOW_START, end=WINDOW_END
    )
    assert result.segments[0].start == WINDOW_START
    assert result.segments[-1].end == WINDOW_END
    for prev, cur in zip(result.segments, result.segments[1:], strict=False):
        assert prev.end == cur.start
    assert result.window_start == WINDOW_START
    assert result.window_end == WINDOW_END
    assert result.basis


def test_shared_lords_are_the_lord_set_intersection() -> None:
    """London and Sydney both run Jupiter maha across 2025-2026."""
    result = compute_dasha_synchrony(
        _chart(*LONDON), _chart(*SYDNEY), start=WINDOW_START, end=WINDOW_END
    )
    assert len(result.segments) == 2
    first, second = result.segments
    assert (first.a_maha, first.a_antar) == (PlanetName.JUPITER, PlanetName.JUPITER)
    assert (second.a_maha, second.a_antar) == (PlanetName.JUPITER, PlanetName.SATURN)
    assert first.shared_lords == [PlanetName.JUPITER]
    assert second.shared_lords == [PlanetName.JUPITER]
    # Recompute the set intersection from the emitted lords — must agree.
    for seg in result.segments:
        expected = sorted(
            {seg.a_maha, seg.a_antar} & {seg.b_maha, seg.b_antar}, key=lambda p: p.value
        )
        assert seg.shared_lords == expected


def test_mid_window_boundaries_are_not_simultaneous_for_these_pairs() -> None:
    result = compute_dasha_synchrony(
        _chart(*DELHI), _chart(*MUMBAI), start=WINDOW_START, end=WINDOW_END
    )
    assert all(not s.simultaneous_boundary for s in result.segments)


def test_window_outside_both_dated_trees_is_empty() -> None:
    result = compute_dasha_synchrony(
        _chart(*DELHI),
        _chart(*MUMBAI),
        start=datetime(2300, 1, 1, tzinfo=UTC),
        end=datetime(2301, 1, 1, tzinfo=UTC),
    )
    assert result.segments == []


def test_window_must_be_ordered_and_timezone_aware() -> None:
    a, b = _chart(*DELHI), _chart(*MUMBAI)
    with pytest.raises(ValueError, match="before"):
        compute_dasha_synchrony(a, b, start=WINDOW_END, end=WINDOW_START)
    with pytest.raises(ValueError, match="timezone-aware"):
        compute_dasha_synchrony(a, b, start=datetime(2025, 1, 1), end=WINDOW_END)

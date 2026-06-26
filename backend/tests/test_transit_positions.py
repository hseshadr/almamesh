"""Transit position primitives: positions at an instant + ayanamsa + timezone.

These guard the single shared path every transit call goes through
(`transit_positions` = _to_utc -> _resolve_ayanamsa -> get_planetary_positions),
so natal and transit longitudes are coherent by construction.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from almamesh.calculations import AyanamsaType, NodeType, SkyfieldAstronomy
from almamesh.constants.astrology import PlanetName
from almamesh.transits.positions import transit_positions

# JPL Horizons apparent geocentric ecliptic longitude (OBS_ECLON, of date) for
# 2026-06-09 12:00 UTC, minus the engine's Lahiri ayanamsa = sidereal longitude.
# Provenance + tolerances live in tests/validation/transit_reference_fixtures.json;
# this is a fast sanity tier (the full oracle suite is test_transit_reference.py).
_FIXED = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)


def test_should_return_all_nine_grahas_when_sampled() -> None:
    # Given the astronomy object and a fixed instant
    astro = SkyfieldAstronomy()
    # When transit positions are sampled
    positions = transit_positions(astro, _FIXED, AyanamsaType.LAHIRI, NodeType.MEAN)
    # Then every graha including the nodes is present with a sidereal longitude
    assert set(positions) == set(PlanetName)
    for pos in positions.values():
        assert 0.0 <= pos["longitude"] < 360.0


def test_should_use_transit_instant_ayanamsa_not_natal() -> None:
    # Given a 1988 birth instant and a 2026 transit instant
    astro = SkyfieldAstronomy()
    from almamesh.calculations import _resolve_ayanamsa  # noqa: PLC0415

    birth = datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC)
    # When ayanamsa is resolved at each
    ay_birth = _resolve_ayanamsa(astro, birth, AyanamsaType.LAHIRI)
    ay_transit = _resolve_ayanamsa(astro, _FIXED, AyanamsaType.LAHIRI)
    # Then they differ measurably (~50 arcsec/yr precession over ~38 years)
    assert ay_transit > ay_birth
    assert (ay_transit - ay_birth) > 0.4  # > a third of a degree over ~38 years


def test_should_convert_not_relabel_when_aware_instant() -> None:
    # Given the same instant expressed as IST (+05:30) and as UTC
    astro = SkyfieldAstronomy()
    ist = timezone(timedelta(hours=5, minutes=30))
    aware = datetime(2026, 6, 9, 17, 30, 0, tzinfo=ist)  # == 12:00 UTC
    # When positions are sampled from each
    from_aware = transit_positions(astro, aware, AyanamsaType.LAHIRI, NodeType.MEAN)
    from_utc = transit_positions(astro, _FIXED, AyanamsaType.LAHIRI, NodeType.MEAN)
    # Then the Sun longitude is identical (CONVERT, not relabel)
    assert from_aware[PlanetName.SUN]["longitude"] == pytest.approx(
        from_utc[PlanetName.SUN]["longitude"], abs=1e-9
    )

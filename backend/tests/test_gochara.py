"""Gochara: transiting grahas placed in whole-sign houses from Moon and Lagna."""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.transits.gochara import build_gochara_context

_BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)  # Delhi canonical fixture
_DELHI = (28.6139, 77.2090)
_TRANSIT = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)


def _natal():
    ref = datetime(2025, 1, 1, tzinfo=UTC)
    return calculate_sidereal_context(_BIRTH, *_DELHI, reference_date=ref)


def test_should_place_every_graha_when_built() -> None:
    # Given the Delhi natal chart and a transit instant
    natal = _natal()
    astro = SkyfieldAstronomy()
    # When the gochara context is built
    ctx = build_gochara_context(astro, natal, _TRANSIT)
    # Then all nine grahas are placed with valid 1..12 houses from both refs
    assert set(ctx.placements) == set(PlanetName)
    for p in ctx.placements.values():
        assert 1 <= p.house_from_moon <= 12
        assert 1 <= p.house_from_lagna <= 12


def test_should_count_houses_whole_sign_from_moon_and_lagna() -> None:
    # Given a natal chart with known Moon (Leo) and Lagna (Gemini) signs
    natal = _natal()
    assert natal.planets[PlanetName.MOON].sign == ZodiacSign.LEO  # idx 4
    assert natal.lagna.sign == ZodiacSign.GEMINI  # idx 2
    astro = SkyfieldAstronomy()
    # When gochara is built
    ctx = build_gochara_context(astro, natal, _TRANSIT)
    # Then for any graha, the whole-sign house count matches the formula
    for p in ctx.placements.values():
        transit_idx = list(ZodiacSign).index(ZodiacSign(p.natal_sign_occupied))
        assert p.house_from_moon == (transit_idx - 4 + 12) % 12 + 1
        assert p.house_from_lagna == (transit_idx - 2 + 12) % 12 + 1


def test_should_resolve_ayanamsa_at_transit_instant() -> None:
    # Given the gochara context built at a 2026 transit
    natal = _natal()
    astro = SkyfieldAstronomy()
    ctx = build_gochara_context(astro, natal, _TRANSIT)
    # Then the recorded ayanamsa is the larger (later) one, not the 1990 natal
    assert ctx.transit_ayanamsa > natal.ayanamsa_value

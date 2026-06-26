"""Tiny pure accessors that read natal reference points off a SiderealContext.

Shared by gochara, Sade Sati and fusion so every layer indexes signs identically
(`int(lon // 30)`, the same floor the natal pipeline uses)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.constants.astrology import PlanetName

if TYPE_CHECKING:
    from almamesh.schemas.astrology import SiderealContext

_SIGN_WIDTH = 30.0


def sign_index(longitude: float) -> int:
    """The 0..11 sign index for a sidereal longitude (half-open, like natal)."""
    return int((longitude % 360.0) // _SIGN_WIDTH)


def natal_moon_index(natal: SiderealContext) -> int:
    """Sign index of the natal Moon (Janma Rasi)."""
    return sign_index(natal.planets[PlanetName.MOON].longitude)


def natal_lagna_index(natal: SiderealContext) -> int:
    """Sign index of the natal Ascendant."""
    return sign_index(natal.lagna.longitude)


def whole_sign_house(transit_idx: int, natal_idx: int) -> int:
    """Whole-sign house (1..12) of a transit sign counted from a natal sign."""
    return (transit_idx - natal_idx + 12) % 12 + 1

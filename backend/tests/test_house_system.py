"""Whole-sign house-system labeling (audit hygiene, non-breaking).

AlmaMesh computes houses with the **whole-sign** system: each house spans one
full 30 deg sign, and ``HouseCuspData.longitude`` is the *sign-start*, not an
interpolated Placidus/Koch cusp. This was implicit; these tests pin it as a
machine-readable contract so the UI / report can label it honestly and so a
future switch to a quadrant system cannot happen silently.
"""

from datetime import UTC, datetime

from almamesh.calculations import (
    HOUSE_SYSTEM,
    HouseSystem,
    calculate_sidereal_context,
)

# A fixed, reproducible chart (Delhi, pinned reference instant).
_BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
_LAT, _LON = 28.6139, 77.2090
_REF = datetime(2025, 1, 1, tzinfo=UTC)


def test_house_system_constant_is_whole_sign() -> None:
    """The engine declares the whole-sign house system as a typed constant."""
    # Given / When the module-level house-system label is read
    # Then it is the WHOLE_SIGN member (machine-readable for UI/report)
    assert HOUSE_SYSTEM is HouseSystem.WHOLE_SIGN
    assert HOUSE_SYSTEM.value == "whole_sign"


def test_house_longitudes_are_exact_sign_starts() -> None:
    """Every house longitude is an exact 30 deg multiple (a sign-start)."""
    # Given a deterministic chart
    context = calculate_sidereal_context(_BIRTH, _LAT, _LON, reference_date=_REF)

    # When inspecting each whole-sign house cusp
    for house in context.houses.values():
        # Then its longitude is the start of a sign, never an interpolated cusp
        assert house.longitude % 30.0 == 0.0


def test_houses_tile_the_zodiac_in_sign_order() -> None:
    """The 12 houses are 12 consecutive signs starting at the Lagna sign."""
    # Given a deterministic chart
    context = calculate_sidereal_context(_BIRTH, _LAT, _LON, reference_date=_REF)

    # When walking houses 1..12
    lagna_sign_start = (int(context.lagna.longitude // 30)) * 30.0
    expected = [(lagna_sign_start + 30.0 * i) % 360.0 for i in range(12)]

    # Then each house longitude is the next sign-start, wrapping the zodiac
    actual = [context.houses[h].longitude for h in range(1, 13)]
    assert actual == expected

"""The life-domain strength band cut points, pinned to the literals the docs promise.

``strength_summary._band`` is conjunctive. A domain reads STRONG only when the key
significator clears its classical Shadbala minimum AND the domain's houses average
28+ SAV bindus; it reads WEAK only when both signals are weak (minimum missed AND
the average under 25). Everything in between is MODERATE.

Before this file, ``_SAV_STRONG_AVG`` (28) and ``_SAV_WEAK_AVG`` (25) were consumed
only inside ``_band``, and no test imported ``_band`` at all. The nearest assertion,
``summary.band in StrengthBand`` in test_life_domains.py, is true for any cut points
whatsoever — so both thresholds were free to be any number, or the STRONG arm free to
be unreachable, and the suite would have stayed green. These tests hold the code to
the numbers its own module docstring shows the reader.
"""

from __future__ import annotations

import pytest

from almamesh.domains import strength_summary
from almamesh.domains.strength_summary import (
    _SAV_MAX_PER_HOUSE,
    _SAV_STRONG_AVG,
    _SAV_WEAK_AVG,
    _band,
)
from almamesh.schemas.domains import StrengthBand

# Read verbatim off the strength_summary module docstring: "an average of 28+ bindus
# per house is strong, below 25 is weak (25..28 is the middling band)". SAV bindus are
# whole numbers summed over a domain's houses, so an average lands on tenths.
STRONG_AVG = 28.0
WEAK_AVG = 25.0
JUST_UNDER_STRONG = 27.9
JUST_UNDER_WEAK = 24.9

# (meets_minimum, low end, high end, band) — the four corners of the documented rule.
_RANGES: tuple[tuple[bool, float, float, StrengthBand], ...] = (
    (True, STRONG_AVG, _SAV_MAX_PER_HOUSE, StrengthBand.STRONG),
    (True, 0.0, JUST_UNDER_STRONG, StrengthBand.MODERATE),
    (False, WEAK_AVG, _SAV_MAX_PER_HOUSE, StrengthBand.MODERATE),
    (False, 0.0, JUST_UNDER_WEAK, StrengthBand.WEAK),
)


@pytest.mark.parametrize(("meets_minimum", "low", "high", "expected"), _RANGES)
def test_band_holds_across_its_whole_documented_range(
    meets_minimum: bool, low: float, high: float, expected: StrengthBand
) -> None:
    """Both edges of every documented range band as the prose says they do."""
    assert _band(meets_minimum, low) is expected
    assert _band(meets_minimum, high) is expected


def test_twenty_eight_bindus_is_the_strong_cut_point_not_twenty_seven_point_nine() -> None:
    """The literal the docs promise: with the minimum met, 28 is STRONG and 27.9 is not.

    Asserting the band against its own constant would pass at any threshold, so the
    cut point is written out here as the number the reader is shown.
    """
    assert _band(True, JUST_UNDER_STRONG) is StrengthBand.MODERATE
    assert _band(True, STRONG_AVG) is StrengthBand.STRONG


def test_twenty_five_bindus_is_the_weak_cut_point_not_twenty_four_point_nine() -> None:
    """The other promised literal: without the minimum, 24.9 is WEAK and 25 is not."""
    assert _band(False, JUST_UNDER_WEAK) is StrengthBand.WEAK
    assert _band(False, WEAK_AVG) is StrengthBand.MODERATE


def test_a_full_house_of_bindus_is_not_strong_without_the_shadbala_minimum() -> None:
    """The rule is conjunctive: the maximum possible SAV alone cannot reach STRONG."""
    assert _band(False, _SAV_MAX_PER_HOUSE) is StrengthBand.MODERATE


def test_meeting_the_shadbala_minimum_is_never_weak_however_low_the_sav() -> None:
    """The mirror image: a passing significator floors the verdict at MODERATE."""
    assert _band(True, 0.0) is StrengthBand.MODERATE


def test_every_band_is_reachable_by_some_pair_of_signals() -> None:
    """No band may be dead code — each one must be the verdict for some real pair."""
    reached = {
        _band(meets_minimum, half / 2)
        for meets_minimum in (True, False)
        for half in range(int(_SAV_MAX_PER_HOUSE * 2) + 1)
    }
    assert reached == set(StrengthBand)


def test_the_module_docstring_names_the_same_cut_points_as_the_code() -> None:
    """If a cut point moves in code, the sentence shown to the reader must move too."""
    prose = strength_summary.__doc__ or ""
    for cut in (_SAV_STRONG_AVG, _SAV_WEAK_AVG):
        assert str(int(cut)) in prose, (
            f"strength_summary's docstring no longer names the cut point {cut:g} "
            f"that strength_summary._band still enforces"
        )

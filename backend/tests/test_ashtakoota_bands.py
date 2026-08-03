"""The /36 band cut points, pinned to the literals ``tables.BAND_SOURCE`` promises.

``_band`` and ``BAND_SOURCE`` are the same rule written twice — once as code, once
as the prose shown to the reader. Two copies of one rule drift, so these tests read
the cut points out of the prose and hold the code to them.

Before this file, ``CompatibilityBand.EXCELLENT`` (``ashtakoota.py``, the ``>= 33``
arm) had no test and no fixture at all: every reference match landed in one of the
three lower bands, so the top band could have been any threshold — or unreachable —
and the suite would have stayed green.
"""

from __future__ import annotations

import pytest

from almamesh.mesh import tables
from almamesh.mesh.ashtakoota import _band
from almamesh.schemas.mesh import CompatibilityBand

# Read verbatim off tables.BAND_SOURCE: "below 18 of 36 the match is traditionally
# not recommended; 18-24 average; 25-32 good; 33-36 excellent." Kootas award half
# points, so the largest attainable total inside a band ending at N is N + 0.5.
_MAX_TOTAL = 36.0
_BANDS: tuple[tuple[float, float, CompatibilityBand], ...] = (
    (0.0, 17.5, CompatibilityBand.NOT_RECOMMENDED),
    (18.0, 24.5, CompatibilityBand.AVERAGE),
    (25.0, 32.5, CompatibilityBand.GOOD),
    (33.0, _MAX_TOTAL, CompatibilityBand.EXCELLENT),
)


@pytest.mark.parametrize(("low", "high", "expected"), _BANDS)
def test_band_holds_across_its_whole_documented_range(
    low: float, high: float, expected: CompatibilityBand
) -> None:
    """Both edges of every documented range band as the prose says they do."""
    assert _band(low) is expected
    assert _band(high) is expected


def test_thirty_three_is_the_excellent_cut_point_not_thirty_two_five() -> None:
    """The literal the docs promise: 33 is EXCELLENT, and the half point below is not.

    Asserting the top band only against its own constant would pass at any threshold.
    """
    assert _band(32.5) is CompatibilityBand.GOOD
    assert _band(33.0) is CompatibilityBand.EXCELLENT


def test_a_perfect_thirty_six_is_excellent() -> None:
    """The maximum attainable total must be inside the top band, not past its end."""
    assert _band(_MAX_TOTAL) is CompatibilityBand.EXCELLENT


def test_every_band_is_reachable_by_some_total() -> None:
    """No band may be dead code — each one must be the verdict for some real total."""
    reached = {_band(total / 2) for total in range(int(_MAX_TOTAL * 2) + 1)}
    assert reached == set(CompatibilityBand)


def test_documented_prose_names_the_same_cut_points_as_the_code() -> None:
    """If a cut point moves in code, the sentence shown to the reader must move too."""
    for boundary in ("18", "24", "25", "32", "33", "36"):
        assert boundary in tables.BAND_SOURCE, (
            f"tables.BAND_SOURCE no longer names the cut point {boundary} that "
            f"ashtakoota._band still enforces"
        )

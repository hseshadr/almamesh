"""The /36 band cut points, pinned to the literals ``tables.BAND_SOURCE`` promises.

``_band`` and ``BAND_SOURCE`` are the same rule written twice — once as code, once
as the prose shown to the reader. Two copies of one rule drift, so these tests read
the cut points out of the prose and hold the code to them.

Before this file, ``CompatibilityBand.EXCELLENT`` (``ashtakoota.py``, the ``>= 33``
arm) had no test and no fixture at all: every reference match landed in one of the
three lower bands, so the top band could have been any threshold — or unreachable —
and the suite would have stayed green. The cut points are pinned below, and the one
match that scores a perfect 36 through the real koota engine supplies the fixture,
so "unreachable" is now a failing test rather than an invisible possibility.
"""

from __future__ import annotations

import pytest

from almamesh.constants.astrology import NAKSHATRA_NAMES, ZodiacSign
from almamesh.mesh import compute_ashtakoota_from_moons, tables
from almamesh.mesh.ashtakoota import _band
from almamesh.schemas.mesh import CompatibilityBand, KootaName, MoonSummary

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


# The one pair that scores a perfect 36 through the real koota engine, so the top
# band is not merely a branch of ``_band`` but a verdict the engine can actually
# reach. Rohini spans Taurus 10°-23°20' (padas 1-4); Mrigashira's first two padas
# finish Taurus at 23°20'-30° before the star crosses into Gemini.
_ROHINI_BRIDE = MoonSummary(
    nakshatra=NAKSHATRA_NAMES[3],
    nakshatra_index=3,
    nakshatra_pada=1,
    sign=ZodiacSign.TAURUS,
    sign_degrees=11.0,
)
_MRIGASHIRA_GROOM = MoonSummary(
    nakshatra=NAKSHATRA_NAMES[4],
    nakshatra_index=4,
    nakshatra_pada=1,
    sign=ZodiacSign.TAURUS,
    sign_degrees=25.0,
)


def test_a_real_pair_of_moons_scores_a_perfect_thirty_six_and_reads_excellent() -> None:
    """EXCELLENT is reachable through the engine, not only through ``_band``.

    Hand-derived for Rohini bride x Mrigashira groom, both in Taurus: Varna 1
    (vaishya x vaishya), Vashya 2 (chatushpada x chatushpada), Tara 3 (Sampat
    out, Ati-Maitra back — neither malefic), Yoni 4 (serpent x serpent), Graha
    Maitri 5 (Venus x Venus), Gana 6 (deva groom x manushya bride), Bhakoot 7
    (1/1, no dosha), Nadi 8 (madhya x antya, no dosha). Total 36 -> "excellent".
    """
    result = compute_ashtakoota_from_moons(_ROHINI_BRIDE, _MRIGASHIRA_GROOM)
    assert {k.koota: k.earned for k in result.kootas} == {
        KootaName.VARNA: 1.0,
        KootaName.VASHYA: 2.0,
        KootaName.TARA: 3.0,
        KootaName.YONI: 4.0,
        KootaName.GRAHA_MAITRI: 5.0,
        KootaName.GANA: 6.0,
        KootaName.BHAKOOT: 7.0,
        KootaName.NADI: 8.0,
    }
    assert result.total == _MAX_TOTAL
    assert result.band is CompatibilityBand.EXCELLENT
    assert not result.bhakoot_dosha.present
    assert not result.nadi_dosha.present


def test_documented_prose_names_the_same_cut_points_as_the_code() -> None:
    """If a cut point moves in code, the sentence shown to the reader must move too."""
    for boundary in ("18", "24", "25", "32", "33", "36"):
        assert boundary in tables.BAND_SOURCE, (
            f"tables.BAND_SOURCE no longer names the cut point {boundary} that "
            f"ashtakoota._band still enforces"
        )

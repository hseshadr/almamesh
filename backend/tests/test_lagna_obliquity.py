"""Lagna must use the true obliquity of date, not a frozen J2000 constant.

The old code hard-coded eps = 23.4392911 deg. That ignores nutation in
obliquity (Delta-epsilon, ~9" amplitude) and the secular drift of the mean
obliquity. The ascendant transform needs the *true* obliquity of date =
mean eps(of date) + Delta-eps. These tests prove nutation is actually folded
in (the result must differ from the old constant) while staying physically
sane at J2000.
"""

from datetime import UTC, datetime

import pytest

from almamesh.calculations import SkyfieldAstronomy

_OLD_CONSTANT = 23.4392911
_J2000 = datetime(2000, 1, 1, 12, 0, 0, tzinfo=UTC)


@pytest.fixture
def astro() -> SkyfieldAstronomy:
    return SkyfieldAstronomy()


def test_true_obliquity_is_physically_sane_at_j2000(astro: SkyfieldAstronomy) -> None:
    """True obliquity of date sits in the expected 23.43-23.45 deg band."""
    eps = astro._true_obliquity_deg(_J2000)
    assert 23.43 < eps < 23.45


def test_true_obliquity_includes_nutation_not_old_constant(astro: SkyfieldAstronomy) -> None:
    """Result must differ from the frozen J2000 constant (proves nutation is in)."""
    eps = astro._true_obliquity_deg(_J2000)
    assert abs(eps - _OLD_CONSTANT) > 1e-7

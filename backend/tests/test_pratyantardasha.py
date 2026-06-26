"""Pratyantardasha (3rd-level Vimshottari) extraction.

`VimshottariState.pd_lord` is consumed by signal extraction but was never
populated. Each pratyantardasha is a fraction of its antardasha's span, the
sequence starting from the antardasha lord, so the nine PDs tile the AD.
"""

from datetime import UTC, datetime, timedelta

from almamesh.constants.astrology import PlanetName
from almamesh.dasha.models import VimPeriod
from almamesh.dasha.vimshottari import find_active_vimshottari

# A Sun antardasha spanning 120 days: PD lengths are DASHA_YEARS/120 of the
# span, so Sun's PD is the first 6 days, Moon's the next 10, and so on.
_AD_START = datetime(2000, 1, 1, tzinfo=UTC)


def _sun_antardasha() -> VimPeriod:
    return VimPeriod(
        md_lord=PlanetName.SUN,
        ad_lord=PlanetName.SUN,
        start_date=_AD_START,
        end_date=_AD_START + timedelta(days=120),
    )


def test_active_state_populates_pratyantardasha() -> None:
    """The active state names a pratyantardasha lord, not None."""
    state = find_active_vimshottari([_sun_antardasha()], _AD_START + timedelta(days=3))
    assert state.pd_lord == PlanetName.SUN  # first PD starts from the AD lord


def test_pratyantardasha_advances_through_sequence() -> None:
    """Past the first PD's span, the next lord in sequence is active."""
    state = find_active_vimshottari([_sun_antardasha()], _AD_START + timedelta(days=8))
    assert state.pd_lord == PlanetName.MOON  # Sun's 6-day PD has elapsed

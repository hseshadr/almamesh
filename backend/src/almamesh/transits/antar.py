"""Active antardasha lord at an instant, via the richer Vimshottari nesting.

Reuses `compute_vimshottari_periods` + `find_active_vimshottari` from the dasha
package: transit fusion needs the AD lord at ARBITRARY instants, while the
chart payload's dated antar tree (`MahaDashaPeriod.antar_sequence`) is pinned
to the natal reference."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from almamesh.dasha.vimshottari import (
    compute_vimshottari_periods,
    find_active_vimshottari,
)

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.constants.astrology import PlanetName
    from almamesh.schemas.astrology import SiderealContext

# A 2-year half-window around the instant always contains the active AD.
_WINDOW = timedelta(days=730)


def active_antar_lord(natal: SiderealContext, instant: datetime) -> PlanetName | None:
    """The antardasha lord active at `instant`, or None if none is found."""
    periods = compute_vimshottari_periods(natal, instant - _WINDOW, instant + _WINDOW)
    if not periods:
        return None
    return find_active_vimshottari(periods, instant).ad_lord

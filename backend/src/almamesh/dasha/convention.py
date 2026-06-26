"""Declared dasha-year convention.

Vimshottari, Chara, and Yogini periods are quoted in *years*; turning a year
count into real dates requires choosing how many days a "dasha year" is. That
choice is convention-dependent:

- Classical Parashari texts use the **savana** (360-day) year.
- Most modern software uses a **solar** year (Julian 365.25 or Gregorian
  365.2425).

The historical bug this module fixes was *mixing* conventions — a 360-day
Mahadasha subdivided by 365.25-day Antardashas — which silently drifts
sub-period timing. The rule: the convention is declared once and applied
uniformly at every dasha level. Which convention is *authoritative* is a
human decision (an astrologer / JHora); the engine never picks silently, and
``reconcile_vimshottari`` exists to show all three side-by-side.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from datetime import datetime

    from almamesh.schemas.astrology import VimshottariDashaData


class DashaYearConvention(str, Enum):
    """How many solar days make one dasha year."""

    SAVANA_360 = "savana_360"
    GREGORIAN_365_2425 = "gregorian_365_2425"
    JULIAN_365_25 = "julian_365_25"

    @property
    def days_per_year(self) -> float:
        """Solar days in one dasha year under this convention."""
        return _DAYS_PER_YEAR[self]


_DAYS_PER_YEAR: Final[dict[DashaYearConvention, float]] = {
    DashaYearConvention.SAVANA_360: 360.0,
    DashaYearConvention.GREGORIAN_365_2425: 365.2425,
    DashaYearConvention.JULIAN_365_25: 365.25,
}

# Default applied when no convention is declared. Solar-year (Julian) matches
# the majority of modern Vedic software; lock it to the authoritative choice
# once an expert decides. Never replace this with a bare literal.
DEFAULT_DASHA_YEAR_CONVENTION: Final[DashaYearConvention] = DashaYearConvention.JULIAN_365_25


def reconcile_vimshottari(
    moon_long: float, birth_dt: datetime
) -> dict[DashaYearConvention, VimshottariDashaData]:
    """Compute the Vimshottari mahadasha sequence under every convention.

    Surfaces convention divergence instead of hiding it behind one silent
    choice — the same chart yields a different timeline per convention.
    """
    # Local import breaks the calculations <-> convention import cycle.
    from almamesh.calculations import calculate_vimshottari_dashas

    return {
        convention: calculate_vimshottari_dashas(moon_long, birth_dt, convention=convention)
        for convention in DashaYearConvention
    }

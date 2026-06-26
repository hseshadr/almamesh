"""Parashari Ashtakavarga: the seven Bhinnashtakavargas (BAV) and the SAV.

Pure and deterministic — derived only from the natal sign indices of the seven
grahas and the Lagna, via the canonical bindu tables. No astronomy, no mutation
of the natal chart. The classical row totals and the SAV grand total of 337 are
chart-invariants pinned by ``tests/test_ashtakavarga_bindu.py``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from almamesh.constants.astrology import ZODIAC_SIGNS, PlanetName, ZodiacSign
from almamesh.schemas.strength import (
    AshtakavargaContext,
    BhinnashtakavargaChart,
    SarvashtakavargaChart,
)
from almamesh.strength.bindu_tables import (
    BINDU_CONTRIBUTORS,
    BINDU_TABLES,
    LAGNA_CONTRIBUTOR,
)

if TYPE_CHECKING:
    from almamesh.schemas.astrology import SiderealContext

_SIGN_WIDTH = 30.0
_SUBJECTS: tuple[PlanetName, ...] = (
    PlanetName.SUN,
    PlanetName.MOON,
    PlanetName.MARS,
    PlanetName.MERCURY,
    PlanetName.JUPITER,
    PlanetName.VENUS,
    PlanetName.SATURN,
)


def _sign_index(longitude: float) -> int:
    """0..11 sign index for a sidereal longitude (the natal floor convention)."""
    return int((longitude % 360.0) // _SIGN_WIDTH)


def _sign_at(index: int) -> ZodiacSign:
    """Zodiac sign at a 0..11 index."""
    return ZodiacSign(ZODIAC_SIGNS[index % 12])


def _contributor_indices(natal: SiderealContext) -> dict[PlanetName | str, int]:
    """Natal sign index of each contributor (7 grahas + the Lagna)."""
    indices: dict[PlanetName | str, int] = {
        graha: _sign_index(natal.planets[graha].longitude) for graha in _SUBJECTS
    }
    indices[LAGNA_CONTRIBUTOR] = _sign_index(natal.lagna.longitude)
    return indices


def _earns_bindu(offsets: tuple[int, ...], contributor_idx: int, sign_idx: int) -> bool:
    """True if the sign is one of the contributor's benefic places (1-based offset)."""
    offset = (sign_idx - contributor_idx) % 12 + 1
    return offset in offsets


def _bav_for_sign(
    subject: PlanetName, sign_idx: int, contributor_idx: dict[PlanetName | str, int]
) -> int:
    """Bindu count earned by the subject planet in one sign (0..8 contributors)."""
    table = BINDU_TABLES[subject]
    return sum(
        1 for c in BINDU_CONTRIBUTORS if _earns_bindu(table[c], contributor_idx[c], sign_idx)
    )


def _bhinna_chart(
    subject: PlanetName, contributor_idx: dict[PlanetName | str, int]
) -> BhinnashtakavargaChart:
    """One planet's Bhinnashtakavarga across all 12 signs."""
    bindus = {_sign_at(i): _bav_for_sign(subject, i, contributor_idx) for i in range(12)}
    return BhinnashtakavargaChart(planet=subject, bindus=bindus, total=sum(bindus.values()))


def _sarva_chart(bhinna: dict[PlanetName, BhinnashtakavargaChart]) -> SarvashtakavargaChart:
    """Sarvashtakavarga = elementwise sum of the seven BAVs per sign."""
    bindus = {sign: sum(chart.bindus[sign] for chart in bhinna.values()) for sign in ZodiacSign}
    return SarvashtakavargaChart(bindus=bindus, total=sum(bindus.values()))


def compute_ashtakavarga(natal: SiderealContext) -> AshtakavargaContext:
    """Full Parashari Ashtakavarga (seven BAVs + the SAV) for a natal chart."""
    contributor_idx = _contributor_indices(natal)
    bhinna = {s: _bhinna_chart(s, contributor_idx) for s in _SUBJECTS}
    return AshtakavargaContext(bhinna=bhinna, sarva=_sarva_chart(bhinna))

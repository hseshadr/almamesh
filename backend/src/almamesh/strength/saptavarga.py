"""The seven divisional sign mappings used by Saptavargaja-bala.

Pure longitude -> sign-index functions for D1 (Rasi), D2 (Hora), D3 (Drekkana),
D7 (Saptamsa), D9 (Navamsa), D12 (Dwadasamsa) and D30 (Trimsamsa), following the
classical BPHS rules. Self-contained inside ``strength/`` (the shared ``vargas/``
package is owned by another wave) so this module never reaches outside.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Final

from almamesh.constants.astrology import ZODIAC_SIGNS
from almamesh.navamsa import navamsa_sign

_SIGN: Final[float] = 30.0
_SIGN_OF_NAME: Final[dict[str, int]] = {name: i for i, name in enumerate(ZODIAC_SIGNS)}


def _base(longitude: float) -> tuple[int, float]:
    """Return (rasi sign index 0..11, degrees within the sign 0..30)."""
    lon = longitude % 360.0
    return int(lon // _SIGN), lon % _SIGN


def d1_sign(longitude: float) -> int:
    """Rasi (D1) sign index."""
    return _base(longitude)[0]


def d2_hora_sign(longitude: float) -> int:
    """Hora (D2): odd signs -> Leo (Sun) first half / Cancer (Moon) second; even reversed."""
    sign, deg = _base(longitude)
    first_half = deg < 15.0
    odd = sign % 2 == 0  # 0-based even index == odd sign number
    leo, cancer = 4, 3
    if odd:
        return leo if first_half else cancer
    return cancer if first_half else leo


def d3_drekkana_sign(longitude: float) -> int:
    """Drekkana (D3): 1st/5th/9th sign from the rasi by decanate."""
    sign, deg = _base(longitude)
    part = int(deg // 10.0)
    return (sign + 4 * part) % 12


def d7_saptamsa_sign(longitude: float) -> int:
    """Saptamsa (D7): 7 parts; odd signs start from the sign, even from the 7th."""
    sign, deg = _base(longitude)
    part = int(deg // (_SIGN / 7.0))
    start = sign if sign % 2 == 0 else (sign + 6) % 12
    return (start + part) % 12


def d9_navamsa_sign(longitude: float) -> int:
    """Navamsa (D9): delegate to the engine's authoritative ``navamsa_sign``.

    Reuses the single source of truth (BPHS movable/fixed/dual start rule) rather
    than reimplementing astrology — calc-integrity mandate.
    """
    return _SIGN_OF_NAME[navamsa_sign(longitude).value]


def d12_dwadasamsa_sign(longitude: float) -> int:
    """Dwadasamsa (D12): 12 parts counted from the rasi itself."""
    sign, deg = _base(longitude)
    part = int(deg // (_SIGN / 12.0))
    return (sign + part) % 12


def d30_trimsamsa_sign(longitude: float) -> int:
    """Trimsamsa (D30): unequal Mars/Saturn/Jupiter/Mercury/Venus zones by parity."""
    sign, deg = _base(longitude)
    odd = sign % 2 == 0  # 0-based even index == odd sign number
    if odd:
        bounds = ((5.0, 0), (10.0, 10), (18.0, 8), (25.0, 2), (30.0, 6))  # Ar,Aq,Sg,Ge,Li
    else:
        bounds = ((5.0, 1), (12.0, 5), (20.0, 11), (25.0, 9), (30.0, 7))  # Ta,Vi,Pi,Cp,Sc
    for limit, sign_idx in bounds:
        if deg < limit:
            return sign_idx
    return bounds[-1][1]


SAPTAVARGA_FUNCS: Final[tuple[Callable[[float], int], ...]] = (
    d1_sign,
    d2_hora_sign,
    d3_drekkana_sign,
    d7_saptamsa_sign,
    d9_navamsa_sign,
    d12_dwadasamsa_sign,
    d30_trimsamsa_sign,
)

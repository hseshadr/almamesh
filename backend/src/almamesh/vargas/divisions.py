"""BPHS Shodasavarga sign math — a longitude -> its divisional (varga) sign.

Every rule below is the classical Brihat Parashara Hora Shastra form, expressed
as: split the 30° sign into N parts, take the part index ``k`` the longitude
falls in, then map ``(rasi_sign, k)`` -> a varga sign by a starting-sign +
forward-count rule. D9 is delegated to the proven ``almamesh.navamsa`` (reused,
never reimplemented); D30 uses the UNEQUAL 5/5/8/7/5° Trimsamsa portions.

Float-safe like ``navamsa.py``: part indices use exact integer-ratio scaling
(``deg * num // den``) rather than ``deg // arc`` so sign/part boundaries floor
correctly despite the float representation of arcs like 30/7 or 30/27. Pure,
deterministic, byte-identical on CPython and Pyodide.
"""

from __future__ import annotations

from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign
from almamesh.navamsa import navamsa_sign
from almamesh.schemas.vargas import DivisionalChart

_SIGN_WIDTH = 30.0
_HORA_HALF = 15.0  # the D2 Hora boundary: a sign's first vs second 15°


def _sign_index(longitude: float) -> int:
    """0..11 zodiac sign index of an absolute sidereal longitude (Aries=0)."""
    return int((longitude % 360.0) // _SIGN_WIDTH)


def _deg_in_sign(longitude: float) -> float:
    """Degrees 0..30 traversed within the current sign."""
    long_mod = longitude % 360.0
    return long_mod - _sign_index(long_mod) * _SIGN_WIDTH


def _sign_at(index: int) -> ZodiacSign:
    """The ZodiacSign at a (possibly out-of-range) index, wrapped mod 12."""
    return ZodiacSign(ZODIAC_SIGNS[index % 12])


def _part_index(deg_in_sign: float, divisions: int) -> int:
    """Equal-division part index 0..divisions-1, via exact integer scaling.

    ``int(deg * divisions // 30)`` is float-safe where ``deg // (30/divisions)``
    is not (e.g. 30/7 rounds, mis-flooring exact boundaries). Clamp the top part
    so a longitude landing exactly on 30° never overflows.
    """
    idx = int(deg_in_sign * divisions // _SIGN_WIDTH)
    return min(idx, divisions - 1)


def _is_odd_sign(sign_index: int) -> bool:
    """Odd sign by 1-based count (Aries=1st=odd); even sign index -> odd."""
    return sign_index % 2 == 0


# --- per-varga starting sign + counting rules ----------------------------
#
# Each rule returns the varga sign for (sign_index, deg_in_sign). They are kept
# tiny and individually hand-checkable against BPHS. Two cyclic classifications
# are used by index below: sign quality (movable/fixed/dual = sign_index % 3) and
# element (fire/earth/air/water = sign_index % 4), both in zodiacal order.


def _d1(sign_index: int, deg: float) -> ZodiacSign:
    """D1 Rasi — the natal sign itself."""
    return _sign_at(sign_index)


def _d2(sign_index: int, deg: float) -> ZodiacSign:
    """D2 Hora (15°): odd 1st->Leo 2nd->Cancer; even 1st->Cancer 2nd->Leo."""
    first_half = deg < _HORA_HALF
    leo_first = _is_odd_sign(sign_index)
    return ZodiacSign.LEO if (first_half == leo_first) else ZodiacSign.CANCER


def _d3(sign_index: int, deg: float) -> ZodiacSign:
    """D3 Drekkana (10°): k=0 same, k=1 5th (+4), k=2 9th (+8)."""
    k = _part_index(deg, 3)
    return _sign_at(sign_index + (0, 4, 8)[k])


def _d4(sign_index: int, deg: float) -> ZodiacSign:
    """D4 Chaturthamsa (7.5°): the four kendras — same, 4th, 7th, 10th."""
    k = _part_index(deg, 4)
    return _sign_at(sign_index + (0, 3, 6, 9)[k])


def _from_same_or_seventh(sign_index: int, deg: float, divisions: int) -> ZodiacSign:
    """Odd sign counts from itself; even sign counts from the 7th (+6)."""
    k = _part_index(deg, divisions)
    start = sign_index if _is_odd_sign(sign_index) else sign_index + 6
    return _sign_at(start + k)


def _d7(sign_index: int, deg: float) -> ZodiacSign:
    """D7 Saptamsa (30/7°): odd from same sign, even from the 7th."""
    return _from_same_or_seventh(sign_index, deg, 7)


def _d9(sign_index: int, deg: float) -> ZodiacSign:
    """D9 Navamsa — delegate to the proven module (reuse, never reimplement)."""
    return navamsa_sign(sign_index * _SIGN_WIDTH + deg)


def _d10(sign_index: int, deg: float) -> ZodiacSign:
    """D10 Dasamsa (3°): odd from same sign, even from the 9th (+8)."""
    k = _part_index(deg, 10)
    start = sign_index if _is_odd_sign(sign_index) else sign_index + 8
    return _sign_at(start + k)


def _d12(sign_index: int, deg: float) -> ZodiacSign:
    """D12 Dwadasamsa (2.5°): from the same sign, counting forward."""
    return _sign_at(sign_index + _part_index(deg, 12))


def _quality(sign_index: int) -> int:
    """Sign quality: movable(0)/fixed(1)/dual(2) = sign_index % 3."""
    return sign_index % 3


def _by_quality(
    sign_index: int, deg: float, divisions: int, starts: tuple[int, int, int]
) -> ZodiacSign:
    """Quality-keyed varga: count k forward from a quality-chosen start sign."""
    k = _part_index(deg, divisions)
    return _sign_at(starts[_quality(sign_index)] + k)


def _d16(sign_index: int, deg: float) -> ZodiacSign:
    """D16 Shodasamsa (1.875°): movable->Aries, fixed->Leo, dual->Sagittarius."""
    return _by_quality(sign_index, deg, 16, (0, 4, 8))


def _d20(sign_index: int, deg: float) -> ZodiacSign:
    """D20 Vimsamsa (1.5°): movable->Aries, fixed->Sagittarius, dual->Leo."""
    return _by_quality(sign_index, deg, 20, (0, 8, 4))


def _d24(sign_index: int, deg: float) -> ZodiacSign:
    """D24 Siddhamsa (1.25°): odd from Leo (4), even from Cancer (3)."""
    k = _part_index(deg, 24)
    start = 4 if _is_odd_sign(sign_index) else 3
    return _sign_at(start + k)


def _d27(sign_index: int, deg: float) -> ZodiacSign:
    """D27 Bhamsa (30/27°): fire->Aries, earth->Cancer, air->Libra, water->Cap."""
    k = _part_index(deg, 27)
    start = (0, 3, 6, 9)[sign_index % 4]
    return _sign_at(start + k)


# D30 Trimsamsa — UNEQUAL portions. Odd sign: (upper-bound°, sign) cumulative.
# Mars(Aries) 5, Saturn(Aquarius) 5, Jupiter(Sagittarius) 8, Mercury(Gemini) 7,
# Venus(Libra) 5. Even sign reverses both the spans and the lords (Venus(Taurus)
# 5, Mercury(Virgo) 7, Jupiter(Pisces) 8, Saturn(Capricorn) 5, Mars(Scorpio) 5).
_TRIMSAMSA_ODD = ((5.0, 0), (10.0, 10), (18.0, 8), (25.0, 2), (30.0, 6))
_TRIMSAMSA_EVEN = ((5.0, 1), (12.0, 5), (20.0, 11), (25.0, 9), (30.0, 7))


def _d30(sign_index: int, deg: float) -> ZodiacSign:
    """D30 Trimsamsa: unequal 5/5/8/7/5° portions, even-sign order reversed."""
    table = _TRIMSAMSA_ODD if _is_odd_sign(sign_index) else _TRIMSAMSA_EVEN
    for upper, varga_index in table:
        if deg < upper:
            return _sign_at(varga_index)
    return _sign_at(table[-1][1])


def _d40(sign_index: int, deg: float) -> ZodiacSign:
    """D40 Khavedamsa (0.75°): odd from Aries (0), even from Libra (6)."""
    k = _part_index(deg, 40)
    start = 0 if _is_odd_sign(sign_index) else 6
    return _sign_at(start + k)


def _d45(sign_index: int, deg: float) -> ZodiacSign:
    """D45 Akshavedamsa (2/3°): movable->Aries, fixed->Leo, dual->Sagittarius."""
    return _by_quality(sign_index, deg, 45, (0, 4, 8))


def _d60(sign_index: int, deg: float) -> ZodiacSign:
    """D60 Shashtiamsa (0.5°): floor(deg*2) parts forward from the same sign.

    BPHS/Parashara: ignore the sign, take deg traversed, ``x2 mod 12`` selects
    the varga counted from the rasi sign. ``int(deg * 2)`` is the float-safe
    part index (clamped to the top 60th so an exact 30° never overflows).
    """
    part = min(int(deg * 2.0), 59)
    return _sign_at(sign_index + part)


_RULES = {
    DivisionalChart.D1: _d1,
    DivisionalChart.D2: _d2,
    DivisionalChart.D3: _d3,
    DivisionalChart.D4: _d4,
    DivisionalChart.D7: _d7,
    DivisionalChart.D9: _d9,
    DivisionalChart.D10: _d10,
    DivisionalChart.D12: _d12,
    DivisionalChart.D16: _d16,
    DivisionalChart.D20: _d20,
    DivisionalChart.D24: _d24,
    DivisionalChart.D27: _d27,
    DivisionalChart.D30: _d30,
    DivisionalChart.D40: _d40,
    DivisionalChart.D45: _d45,
    DivisionalChart.D60: _d60,
}


def varga_sign(chart: DivisionalChart, longitude: float) -> ZodiacSign:
    """The divisional (varga) sign of an absolute sidereal longitude for a chart.

    The single public entrypoint for varga sign math — dispatches to the chart's
    BPHS rule. Pure and deterministic; the rasi sign and degrees-in-sign are
    derived with the same ``int(lon // 30)`` floor the natal pipeline uses.
    """
    sign_index = _sign_index(longitude)
    return _RULES[chart](sign_index, _deg_in_sign(longitude))

"""D9 Navamsa (BPHS) divisional-chart math.

The Navamsa (D9) is the single highest-value varga in Vedic astrology. Each 30°
sign is split into 9 navamsas of 3°20' (= 10/3°). A planet's navamsa *index*
within its sign is ``floor(deg_in_sign / (10/3))`` (0..8). The navamsa-1 starting
sign depends on the rasi sign's quality (Brihat Parashara Hora Shastra):

  * movable / chara  (Aries, Cancer, Libra, Capricorn) -> SAME sign
  * fixed   / sthira (Taurus, Leo, Scorpio, Aquarius)  -> 9th sign from it
  * dual    / dvisvabhava (Gemini, Virgo, Sagittarius, Pisces) -> 5th sign from it

The navamsa sign is ``(start_sign_index + navamsa_index) mod 12``.

This is provably equivalent to the closed form ``floor(longitude / (10/3)) mod 12``
over the whole zodiac: each 3°20' step advances exactly one sign, and the quality
rule simply encodes where each sign's first navamsa lands so the 108 navamsas of
the zodiac march continuously Aries..Pisces, Aries.. (see ``test_navamsa.py``).

Pure functions only — no I/O, deterministic, byte-identical on CPython and Pyodide.
"""

from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign

NAVAMSA_ARC = 10.0 / 3.0  # 3°20' in degrees
_NAVAMSAS_PER_SIGN = 9

# Start-sign offset (signs to add to the rasi sign) for each sign quality.
_MOVABLE_OFFSET = 0  # chara: same sign
_FIXED_OFFSET = 8  # sthira: 9th sign from it
_DUAL_OFFSET = 4  # dvisvabhava: 5th sign from it


def _sign_index(longitude: float) -> int:
    """0..11 zodiac sign index of an absolute ecliptic longitude (Aries=0)."""
    return int((longitude % 360.0) // 30.0)


def _quality_offset(sign_index: int) -> int:
    """Start-sign offset for the sign's quality (movable/fixed/dual).

    Signs cycle movable, fixed, dual in zodiacal order, so the quality is just
    ``sign_index % 3`` (0=movable, 1=fixed, 2=dual).
    """
    return (_MOVABLE_OFFSET, _FIXED_OFFSET, _DUAL_OFFSET)[sign_index % 3]


def navamsa_sign(longitude: float) -> ZodiacSign:
    """Navamsa (D9) sign for an absolute longitude, via the BPHS quality rule."""
    long_mod = longitude % 360.0
    sign_index = _sign_index(long_mod)
    deg_in_sign = long_mod - sign_index * 30.0
    # Scale by the exact ratio 3/10 (not // (10/3)) so navamsa boundaries floor
    # correctly despite float representation of 10/3.
    navamsa_index = min(int(deg_in_sign * 3.0 / 10.0), _NAVAMSAS_PER_SIGN - 1)
    start = (sign_index + _quality_offset(sign_index)) % 12
    return ZodiacSign(ZODIAC_SIGNS[(start + navamsa_index) % 12])


def navamsa_sign_closed_form(longitude: float) -> ZodiacSign:
    """Navamsa (D9) sign via the closed form ``floor(long / (10/3)) mod 12``.

    Kept as an independent oracle so a test can assert equivalence with the
    quality-rule form (``navamsa_sign``); both must agree everywhere.

    Implemented as ``floor(long * 3 / 10)`` rather than ``long // (10/3)``: the
    latter is float-fragile at exact sign boundaries because ``10/3`` rounds up
    (≈3.33333335), so e.g. ``30 // (10/3)`` floors to 8 instead of the correct 9.
    Scaling by the exact integer ratio 3/10 avoids that.
    """
    navamsa_count = int((longitude % 360.0) * 3.0 / 10.0)
    return ZodiacSign(ZODIAC_SIGNS[navamsa_count % 12])

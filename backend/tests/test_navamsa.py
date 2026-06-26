"""D9 Navamsa (BPHS) computation tests.

The Navamsa (D9) divides each 30° sign into 9 navamsas of 3°20' (= 10/3°).
A planet's navamsa index within its sign is ``floor(deg_in_sign / (10/3))`` (0..8).
The navamsa-1 starting sign depends on the rasi sign's quality (BPHS):

  * movable / chara  (Aries, Cancer, Libra, Capricorn) -> starts at the SAME sign
  * fixed   / sthira (Taurus, Leo, Scorpio, Aquarius)  -> starts at the 9th sign
  * dual    / dvisvabhava (Gemini, Virgo, Sagittarius, Pisces) -> starts at the 5th sign

The resulting navamsa sign is ``(start_sign_index + navamsa_index) mod 12``.

Closed form (proven equivalent below): the navamsa sign index over the WHOLE
zodiac is simply ``floor(longitude / (10/3)) mod 12`` — because each successive
navamsa (3°20') steps forward exactly one sign, and the quality rule merely
encodes where each sign's first navamsa lands so the 108 navamsas of the zodiac
march continuously Aries..Pisces, Aries.. and so on.
"""

from datetime import UTC, datetime

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.navamsa import navamsa_sign, navamsa_sign_closed_form

# Delhi reference fixture, pinned reference_date for reproducibility (matches the
# golden parity fixture: 1990-01-15 12:00 UTC, Delhi; lagna Gemini, Sun Capricorn,
# Moon Leo).
_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)
_DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)

NAVAMSA_ARC = 10.0 / 3.0  # 3°20'


# --- Hand-verifiable BPHS anchor cases ------------------------------------
# Each: (absolute longitude, expected navamsa sign). Arithmetic shown so a
# reviewer can re-derive every value by hand.


def test_0deg_aries_maps_to_aries() -> None:
    # 0° Aries: movable sign -> starts at Aries; navamsa index 0 -> Aries.
    assert navamsa_sign(0.0) == ZodiacSign.ARIES


def test_3deg20_aries_maps_to_taurus() -> None:
    # 3°20' Aries: navamsa index 1; movable start Aries -> Aries+1 = Taurus.
    assert navamsa_sign(NAVAMSA_ARC) == ZodiacSign.TAURUS


def test_end_of_aries_maps_to_sagittarius() -> None:
    # 29° Aries: index = floor(29 / 3.333) = 8; movable start Aries -> Aries+8 =
    # Sagittarius (the 9th navamsa of a movable sign is always the 9th sign).
    assert navamsa_sign(29.0) == ZodiacSign.SAGITTARIUS


def test_0deg_taurus_maps_to_capricorn() -> None:
    # 0° Taurus (deg 30): fixed sign -> starts at the 9th sign from Taurus.
    # Taurus index 1; 9th sign = (1 + 8) % 12 = 9 = Capricorn; navamsa index 0.
    assert navamsa_sign(30.0) == ZodiacSign.CAPRICORN


def test_0deg_gemini_maps_to_libra() -> None:
    # 0° Gemini (deg 60): dual sign -> starts at the 5th sign from Gemini.
    # Gemini index 2; 5th sign = (2 + 4) % 12 = 6 = Libra; navamsa index 0.
    assert navamsa_sign(60.0) == ZodiacSign.LIBRA


def test_0deg_cancer_maps_to_cancer() -> None:
    # 0° Cancer (deg 90): movable -> starts at the SAME sign (Cancer).
    assert navamsa_sign(90.0) == ZodiacSign.CANCER


def test_0deg_leo_maps_to_aries() -> None:
    # 0° Leo (deg 120): fixed -> starts at the 9th sign from Leo.
    # Leo index 4; 9th sign = (4 + 8) % 12 = 0 = Aries; navamsa index 0.
    # Cross-check closed form: floor(120 / 3.333..) = 36; 36 % 12 = 0 = Aries.
    assert navamsa_sign(120.0) == ZodiacSign.ARIES


def test_0deg_pisces_maps_to_cancer() -> None:
    # 0° Pisces (deg 330): dual -> starts at the 5th sign from Pisces.
    # Pisces index 11; 5th sign = (11 + 4) % 12 = 3 = Cancer; navamsa index 0.
    # Cross-check closed form: floor(330 / 3.333..) = 99; 99 % 12 = 3 = Cancer.
    assert navamsa_sign(330.0) == ZodiacSign.CANCER


def test_closed_form_equals_quality_rule_over_sweep() -> None:
    """The closed form floor(long/(10/3)) mod 12 must equal the quality rule
    at every navamsa boundary across the whole zodiac (108 navamsas)."""
    for k in range(108):
        # Sample the middle of each navamsa to avoid boundary float ambiguity.
        longitude = (k + 0.5) * NAVAMSA_ARC
        assert navamsa_sign(longitude) == navamsa_sign_closed_form(longitude), (
            f"mismatch at navamsa {k}, longitude {longitude}"
        )


def test_full_360_sweep_quality_equals_closed_form() -> None:
    """Dense sweep: every 0.5° the two forms agree (catches any off-by-one)."""
    longitude = 0.0
    while longitude < 360.0:
        assert navamsa_sign(longitude) == navamsa_sign_closed_form(longitude)
        longitude += 0.5


# --- Engine integration on the Delhi reference fixture --------------------


def _delhi_chart():
    iso, lat, lon = _DELHI
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=_REFERENCE_DATE
    )


def test_navamsa_emitted_on_context() -> None:
    chart = _delhi_chart()
    assert chart.navamsa is not None
    assert chart.navamsa.name == "D9"
    # All 9 grahas present.
    assert set(chart.navamsa.planets.keys()) == set(PlanetName)


def test_delhi_lagna_navamsa_sign() -> None:
    # Delhi lagna is Gemini (D1). The D9 sign depends on its exact longitude.
    # Computed deterministically from the engine's lagna longitude; we assert
    # via the same algorithm to lock the wiring (not a magic constant).
    chart = _delhi_chart()
    expected = navamsa_sign(chart.lagna.longitude)
    assert chart.navamsa.lagna_sign == expected


def test_delhi_sun_moon_navamsa_signs_are_consistent() -> None:
    chart = _delhi_chart()
    sun = chart.planets[PlanetName.SUN]
    moon = chart.planets[PlanetName.MOON]
    assert chart.navamsa.planets[PlanetName.SUN].sign == navamsa_sign(sun.longitude)
    assert chart.navamsa.planets[PlanetName.MOON].sign == navamsa_sign(moon.longitude)
    # D1 sanity: these are the known reference signs.
    assert sun.sign == ZodiacSign.CAPRICORN
    assert moon.sign == ZodiacSign.LEO

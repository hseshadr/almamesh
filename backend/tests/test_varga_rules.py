"""Per-varga BPHS rule tests: a known longitude -> its expected divisional sign.

Each varga divides a 30° sign into N equal (or, for D30, unequal) parts; a part
index selects a sign by a classical starting-sign + counting rule. Every value
below is hand-derivable from the cited BPHS rule so a seasoned astrologer can
re-check it against Jagannatha Hora. The D9 case asserts byte-equality with the
proven ``almamesh.navamsa`` (we reuse it, never reimplement it).

Conventions used throughout:
  * sign index 0..11 = Aries..Pisces; "odd sign" = index even (Aries, Gemini,
    Leo, ... are the 1st, 3rd, 5th ... signs -> odd by 1-based count).
  * arc = 30/N; part index k = floor(deg_in_sign / arc), 0..N-1.
"""

from __future__ import annotations

from almamesh.constants.astrology import ZodiacSign
from almamesh.navamsa import navamsa_sign
from almamesh.schemas.vargas import DivisionalChart
from almamesh.vargas.divisions import varga_sign

S = ZodiacSign


def _deg(sign_index: int, deg_in_sign: float) -> float:
    """Absolute longitude for a (sign_index, degrees-in-sign) pair."""
    return sign_index * 30.0 + deg_in_sign


# --- D1 Rasi: the sign itself --------------------------------------------


def test_d1_is_the_rasi_sign() -> None:
    assert varga_sign(DivisionalChart.D1, _deg(0, 5.0)) == S.ARIES
    assert varga_sign(DivisionalChart.D1, _deg(7, 29.9)) == S.SCORPIO


# --- D2 Hora (15°): odd 1st->Leo 2nd->Cancer; even reversed ----------------


def test_d2_odd_sign_first_half_is_leo() -> None:
    # Aries (odd), 0..15° -> Leo (Sun's hora).
    assert varga_sign(DivisionalChart.D2, _deg(0, 5.0)) == S.LEO


def test_d2_odd_sign_second_half_is_cancer() -> None:
    # Aries (odd), 15..30° -> Cancer (Moon's hora).
    assert varga_sign(DivisionalChart.D2, _deg(0, 20.0)) == S.CANCER


def test_d2_even_sign_first_half_is_cancer() -> None:
    # Taurus (even), 0..15° -> Cancer (reversed).
    assert varga_sign(DivisionalChart.D2, _deg(1, 5.0)) == S.CANCER


def test_d2_even_sign_second_half_is_leo() -> None:
    # Taurus (even), 15..30° -> Leo.
    assert varga_sign(DivisionalChart.D2, _deg(1, 20.0)) == S.LEO


# --- D3 Drekkana (10°): k=0 same, k=1 5th, k=2 9th -------------------------


def test_d3_first_part_is_same_sign() -> None:
    assert varga_sign(DivisionalChart.D3, _deg(0, 3.0)) == S.ARIES


def test_d3_second_part_is_fifth_sign() -> None:
    # Aries + 4 = Leo.
    assert varga_sign(DivisionalChart.D3, _deg(0, 15.0)) == S.LEO


def test_d3_third_part_is_ninth_sign() -> None:
    # Aries + 8 = Sagittarius.
    assert varga_sign(DivisionalChart.D3, _deg(0, 25.0)) == S.SAGITTARIUS


# --- D4 Chaturthamsa (7.5°): k=0 same, 4th, 7th, 10th ---------------------


def test_d4_parts_are_the_four_kendras() -> None:
    assert varga_sign(DivisionalChart.D4, _deg(0, 1.0)) == S.ARIES  # same
    assert varga_sign(DivisionalChart.D4, _deg(0, 10.0)) == S.CANCER  # 4th
    assert varga_sign(DivisionalChart.D4, _deg(0, 18.0)) == S.LIBRA  # 7th
    assert varga_sign(DivisionalChart.D4, _deg(0, 26.0)) == S.CAPRICORN  # 10th


# --- D7 Saptamsa (30/7°): odd from same; even from 7th --------------------


def test_d7_odd_sign_starts_from_same() -> None:
    # Aries (odd), k=0 -> Aries.
    assert varga_sign(DivisionalChart.D7, _deg(0, 1.0)) == S.ARIES


def test_d7_even_sign_starts_from_seventh() -> None:
    # Taurus (even), k=0 -> 7th from Taurus = Scorpio.
    assert varga_sign(DivisionalChart.D7, _deg(1, 1.0)) == S.SCORPIO


# --- D9 Navamsa: REUSE almamesh.navamsa (byte-equality) -------------------


def test_d9_equals_navamsa_module_at_anchors() -> None:
    for lon in (0.0, 30.0, 60.0, 90.0, 120.0, 330.0, 359.9):
        assert varga_sign(DivisionalChart.D9, lon) == navamsa_sign(lon)


# --- D10 Dasamsa (3°): odd from same; even from 9th -----------------------


def test_d10_odd_sign_starts_from_same() -> None:
    assert varga_sign(DivisionalChart.D10, _deg(0, 1.0)) == S.ARIES


def test_d10_even_sign_starts_from_ninth() -> None:
    # Taurus (even), 9th from Taurus = Capricorn.
    assert varga_sign(DivisionalChart.D10, _deg(1, 1.0)) == S.CAPRICORN


# --- D12 Dwadasamsa (2.5°): from same sign onward -------------------------


def test_d12_starts_from_same_and_counts_forward() -> None:
    assert varga_sign(DivisionalChart.D12, _deg(0, 1.0)) == S.ARIES  # k=0
    assert varga_sign(DivisionalChart.D12, _deg(0, 3.0)) == S.TAURUS  # k=1


# --- D16 Shodasamsa (1.875°): movable->Aries, fixed->Leo, dual->Sag -------


def test_d16_movable_starts_aries() -> None:
    # Aries is movable -> start Aries, k=0.
    assert varga_sign(DivisionalChart.D16, _deg(0, 0.5)) == S.ARIES


def test_d16_fixed_starts_leo() -> None:
    # Taurus is fixed -> start Leo.
    assert varga_sign(DivisionalChart.D16, _deg(1, 0.5)) == S.LEO


def test_d16_dual_starts_sagittarius() -> None:
    # Gemini is dual -> start Sagittarius.
    assert varga_sign(DivisionalChart.D16, _deg(2, 0.5)) == S.SAGITTARIUS


# --- D20 Vimsamsa (1.5°): movable->Aries, fixed->Sag, dual->Leo -----------


def test_d20_movable_starts_aries() -> None:
    assert varga_sign(DivisionalChart.D20, _deg(0, 0.5)) == S.ARIES


def test_d20_fixed_starts_sagittarius() -> None:
    assert varga_sign(DivisionalChart.D20, _deg(1, 0.5)) == S.SAGITTARIUS


def test_d20_dual_starts_leo() -> None:
    assert varga_sign(DivisionalChart.D20, _deg(2, 0.5)) == S.LEO


# --- D24 Siddhamsa (1.25°): odd->Leo, even->Cancer -----------------------


def test_d24_odd_starts_leo() -> None:
    assert varga_sign(DivisionalChart.D24, _deg(0, 0.5)) == S.LEO


def test_d24_even_starts_cancer() -> None:
    assert varga_sign(DivisionalChart.D24, _deg(1, 0.5)) == S.CANCER


# --- D27 Bhamsa (30/27°): fire->Aries, earth->Cancer, air->Libra, water->Cap


def test_d27_fire_sign_starts_aries() -> None:
    # Aries is a fire sign -> start Aries.
    assert varga_sign(DivisionalChart.D27, _deg(0, 0.5)) == S.ARIES


def test_d27_earth_sign_starts_cancer() -> None:
    # Taurus is earth -> start Cancer.
    assert varga_sign(DivisionalChart.D27, _deg(1, 0.5)) == S.CANCER


def test_d27_air_sign_starts_libra() -> None:
    # Gemini is air -> start Libra.
    assert varga_sign(DivisionalChart.D27, _deg(2, 0.5)) == S.LIBRA


def test_d27_water_sign_starts_capricorn() -> None:
    # Cancer is water -> start Capricorn.
    assert varga_sign(DivisionalChart.D27, _deg(3, 0.5)) == S.CAPRICORN


# --- D30 Trimsamsa (UNEQUAL 5/5/8/7/5): odd Mars..Venus, even reversed ----


def test_d30_odd_sign_portions() -> None:
    # Odd sign (Aries). Portions: 0-5 Mars(Aries), 5-10 Saturn(Aquarius),
    # 10-18 Jupiter(Sagittarius), 18-25 Mercury(Gemini), 25-30 Venus(Libra).
    assert varga_sign(DivisionalChart.D30, _deg(0, 2.0)) == S.ARIES
    assert varga_sign(DivisionalChart.D30, _deg(0, 7.0)) == S.AQUARIUS
    assert varga_sign(DivisionalChart.D30, _deg(0, 14.0)) == S.SAGITTARIUS
    assert varga_sign(DivisionalChart.D30, _deg(0, 20.0)) == S.GEMINI
    assert varga_sign(DivisionalChart.D30, _deg(0, 27.0)) == S.LIBRA


def test_d30_even_sign_portions_are_reversed() -> None:
    # Even sign (Taurus). Reversed: 0-5 Venus(Taurus), 5-12 Mercury(Virgo),
    # 12-20 Jupiter(Pisces), 20-25 Saturn(Capricorn), 25-30 Mars(Scorpio).
    assert varga_sign(DivisionalChart.D30, _deg(1, 2.0)) == S.TAURUS
    assert varga_sign(DivisionalChart.D30, _deg(1, 8.0)) == S.VIRGO
    assert varga_sign(DivisionalChart.D30, _deg(1, 15.0)) == S.PISCES
    assert varga_sign(DivisionalChart.D30, _deg(1, 22.0)) == S.CAPRICORN
    assert varga_sign(DivisionalChart.D30, _deg(1, 28.0)) == S.SCORPIO


# --- D40 Khavedamsa (0.75°): odd->Aries, even->Libra ---------------------


def test_d40_odd_starts_aries() -> None:
    assert varga_sign(DivisionalChart.D40, _deg(0, 0.3)) == S.ARIES


def test_d40_even_starts_libra() -> None:
    assert varga_sign(DivisionalChart.D40, _deg(1, 0.3)) == S.LIBRA


# --- D45 Akshavedamsa (2/3°): movable->Aries, fixed->Leo, dual->Sag -------


def test_d45_movable_starts_aries() -> None:
    assert varga_sign(DivisionalChart.D45, _deg(0, 0.3)) == S.ARIES


def test_d45_fixed_starts_leo() -> None:
    assert varga_sign(DivisionalChart.D45, _deg(1, 0.3)) == S.LEO


def test_d45_dual_starts_sagittarius() -> None:
    assert varga_sign(DivisionalChart.D45, _deg(2, 0.3)) == S.SAGITTARIUS


# --- D60 Shashtiamsa (0.5°): floor(deg*2) parts from the same sign --------


def test_d60_first_part_is_same_sign() -> None:
    # deg 0..0.5 -> part 0 -> same sign (Aries).
    assert varga_sign(DivisionalChart.D60, _deg(0, 0.2)) == S.ARIES


def test_d60_counts_forward_by_floor_deg_times_two() -> None:
    # Aries, deg 5.3 -> floor(5.3*2)=10 -> Aries + 10 = Aquarius.
    assert varga_sign(DivisionalChart.D60, _deg(0, 5.3)) == S.AQUARIUS
    # Aries, deg 29.9 -> floor(59.8)=59 -> 59 % 12 = 11 -> Aries+11 = Pisces.
    assert varga_sign(DivisionalChart.D60, _deg(0, 29.9)) == S.PISCES


# --- Invariants: every varga sign is a valid sign; boundaries don't crash --


def test_every_varga_sign_is_valid_across_a_dense_sweep() -> None:
    charts = list(DivisionalChart)
    lon = 0.0
    while lon < 360.0:
        for chart in charts:
            sign = varga_sign(chart, lon)
            assert isinstance(sign, ZodiacSign)
        lon += 0.37  # an irrational-ish step to probe many part boundaries

"""Ashtakoota Guna Milan: table integrity, role asymmetry, engine integration.

The reference (hand-computed) matches live in test_ashtakoota_reference.py;
this file locks the structural soundness of the classical tables and the
end-to-end path from two REAL engine charts (generic parity-fixture births).
"""

from __future__ import annotations

from datetime import UTC, datetime
from functools import cache

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import NAKSHATRA_NAMES, ZodiacSign
from almamesh.mesh import compute_ashtakoota, compute_ashtakoota_from_moons, moon_summary
from almamesh.mesh.tables import (
    GANA_OF_NAKSHATRA,
    GANA_POINTS,
    NADI_OF_NAKSHATRA,
    VARNA_OF_SIGN,
    VASHYA_POINTS,
    YONI_OF_NAKSHATRA,
    YONI_POINTS,
    vashya_class,
)
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import (
    CompatibilityBand,
    Gana,
    KootaName,
    MoonSummary,
    Nadi,
    YoniAnimal,
)

FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
MUMBAI = ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777)


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


# --- Classical table integrity ------------------------------------------------


def test_nakshatra_tables_cover_all_27_stars() -> None:
    assert len(YONI_OF_NAKSHATRA) == len(NAKSHATRA_NAMES) == 27
    assert len(GANA_OF_NAKSHATRA) == 27
    assert len(NADI_OF_NAKSHATRA) == 27


def test_gana_and_nadi_classes_have_nine_stars_each() -> None:
    """Classical structure: 27 nakshatras split 9/9/9 across both classings."""
    for gana in Gana:
        assert sum(1 for g in GANA_OF_NAKSHATRA if g is gana) == 9
    for nadi in Nadi:
        assert sum(1 for n in NADI_OF_NAKSHATRA if n is nadi) == 9


def test_yoni_matrix_is_symmetric_with_classical_enemy_pairs() -> None:
    """Same animal = 4; matrix symmetric; exactly the 7 sworn-enemy pairs = 0."""
    animals = list(YoniAnimal)
    zero_pairs = set()
    for a in animals:
        assert YONI_POINTS[(a, a)] == 4
        for b in animals:
            assert YONI_POINTS[(a, b)] == YONI_POINTS[(b, a)]
            if YONI_POINTS[(a, b)] == 0:
                zero_pairs.add(frozenset({a, b}))
    assert zero_pairs == {
        frozenset({YoniAnimal.HORSE, YoniAnimal.BUFFALO}),
        frozenset({YoniAnimal.ELEPHANT, YoniAnimal.LION}),
        frozenset({YoniAnimal.GOAT, YoniAnimal.MONKEY}),
        frozenset({YoniAnimal.SERPENT, YoniAnimal.MONGOOSE}),
        frozenset({YoniAnimal.DOG, YoniAnimal.DEER}),
        frozenset({YoniAnimal.CAT, YoniAnimal.RAT}),
        frozenset({YoniAnimal.COW, YoniAnimal.TIGER}),
    }


def test_varna_and_vashya_cover_all_twelve_signs() -> None:
    assert set(VARNA_OF_SIGN) == set(ZodiacSign)
    for sign in ZodiacSign:
        # Both halves of every sign resolve to a class (Sag/Cap split at 15).
        assert vashya_class(sign, 5.0) is not None
        assert vashya_class(sign, 25.0) is not None


def test_vashya_matrix_diagonal_is_full_points() -> None:
    for (groom, bride), points in VASHYA_POINTS.items():
        if groom is bride:
            assert points == 2.0
    for (groom, bride), points in GANA_POINTS.items():
        if groom is bride:
            assert points == 6.0


def test_koota_maxima_sum_to_36() -> None:
    bride = moon_summary(_chart(*DELHI))
    groom = moon_summary(_chart(*MUMBAI))
    result = compute_ashtakoota_from_moons(bride, groom)
    assert [k.koota for k in result.kootas] == list(KootaName)
    assert sum(k.maximum for k in result.kootas) == 36.0
    assert result.maximum == 36.0


# --- Role asymmetry (no silent gender assumptions) ----------------------------


def test_gana_scoring_is_direction_sensitive() -> None:
    """Deva groom x Manushya bride = 6, but Manushya groom x Deva bride = 5.

    (Standard gana matrix — the reason roles must be passed explicitly.)
    """
    deva = MoonSummary(
        nakshatra=NAKSHATRA_NAMES[12],  # Hasta (Deva)
        nakshatra_index=12,
        nakshatra_pada=2,
        sign=ZodiacSign.VIRGO,
        sign_degrees=15.0,
    )
    manushya = MoonSummary(
        nakshatra=NAKSHATRA_NAMES[3],  # Rohini (Manushya)
        nakshatra_index=3,
        nakshatra_pada=2,
        sign=ZodiacSign.TAURUS,
        sign_degrees=15.0,
    )
    deva_groom = compute_ashtakoota_from_moons(manushya, deva)
    manushya_groom = compute_ashtakoota_from_moons(deva, manushya)
    gana_a = [k for k in deva_groom.kootas if k.koota is KootaName.GANA][0]
    gana_b = [k for k in manushya_groom.kootas if k.koota is KootaName.GANA][0]
    assert gana_a.earned == 6.0
    assert gana_b.earned == 5.0


# --- Engine integration (real generic charts) ---------------------------------


def test_delhi_bride_x_mumbai_groom_full_match() -> None:
    """Two real engine charts, hand-derived from their emitted Moons.

    Delhi Moon: Purva Phalguni 4 (Leo) — Manushya, Madhya nadi, Rat yoni,
    Kshatriya varna, Vanachara vashya, lord Sun.
    Mumbai Moon: Hasta 1 (Virgo) — Deva, Adi nadi, Buffalo yoni, Vaishya
    varna, Manava vashya, lord Mercury.

    Hand-derived: Varna 0 (bride outranks), Vashya 0 (manava x vanachara),
    Tara 1.5 (bride->groom Vipat 0 + groom->bride Maitra 1.5), Yoni 2
    (rat x buffalo), Maitri 4 (Sun neutral->Mercury, Mercury friend->Sun),
    Gana 6 (deva groom x manushya bride), Bhakoot 0 with UNCANCELLED
    dwirdwadasha (2/12; Sun-Mercury not mutual friends), Nadi 8 (madhya x
    adi). Total 21.5 -> "average".
    """
    result = compute_ashtakoota(bride=_chart(*DELHI), groom=_chart(*MUMBAI))
    earned = {k.koota: k.earned for k in result.kootas}
    assert earned == {
        KootaName.VARNA: 0.0,
        KootaName.VASHYA: 0.0,
        KootaName.TARA: 1.5,
        KootaName.YONI: 2.0,
        KootaName.GRAHA_MAITRI: 4.0,
        KootaName.GANA: 6.0,
        KootaName.BHAKOOT: 0.0,
        KootaName.NADI: 8.0,
    }
    assert result.total == 21.5
    assert result.band is CompatibilityBand.AVERAGE
    assert result.bhakoot_dosha.present and not result.bhakoot_dosha.cancelled
    assert not result.nadi_dosha.present
    assert result.bride_moon.nakshatra == "Purva Phalguni"
    assert result.groom_moon.nakshatra == "Hasta"


def test_ashtakoota_is_deterministic_and_cited() -> None:
    a = compute_ashtakoota(bride=_chart(*DELHI), groom=_chart(*MUMBAI))
    b = compute_ashtakoota(bride=_chart(*DELHI), groom=_chart(*MUMBAI))
    assert a == b
    assert all(k.source for k in a.kootas)
    assert all(k.basis for k in a.kootas)
    assert a.band_basis and a.source


def test_moon_summary_reads_engine_values_verbatim() -> None:
    ctx = _chart(*DELHI)
    summary = moon_summary(ctx)
    assert summary.nakshatra == "Purva Phalguni"
    assert NAKSHATRA_NAMES[summary.nakshatra_index] == summary.nakshatra
    assert summary.sign is ZodiacSign.LEO
    assert summary.nakshatra_pada == 4

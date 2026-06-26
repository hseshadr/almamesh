"""Hand-computed Ashtakoota reference matches, pinned koota-by-koota.

THE CREDIBILITY PATTERN (same as the dasha reference tests): each case below is
a FULL 36-guna match worked by hand, step by step, directly from the classical
tables the engine encodes — B.V. Raman, "Muhurtha (Electional Astrology)", Kuta
agreement chapter, and the standard panchanga Melapaka tables (Varna / Vashya /
Tara / Yoni / Graha-Maitri / Gana / Bhakoot / Nadi), with the BPHS naisargika
maitri table for lordship friendship. The derivation for every koota is written
out in comments so a professional can eyeball each table lookup. If the engine
ever disagrees with these hand computations, the engine is wrong.

Moon placements are synthetic (exact nakshatra/pada/sign picks), so every table
cell exercised is known in advance — no engine output is being "pinned to
itself" here.
"""

from __future__ import annotations

from almamesh.constants.astrology import NAKSHATRA_NAMES, ZodiacSign
from almamesh.mesh import compute_ashtakoota_from_moons
from almamesh.schemas.mesh import (
    CompatibilityBand,
    KootaName,
    MoonSummary,
)


def _moon(nak_index: int, pada: int, sign: ZodiacSign, sign_degrees: float) -> MoonSummary:
    """A synthetic Moon at an exact nakshatra/pada/sign placement."""
    return MoonSummary(
        nakshatra=NAKSHATRA_NAMES[nak_index],
        nakshatra_index=nak_index,
        nakshatra_pada=pada,
        sign=sign,
        sign_degrees=sign_degrees,
    )


def _earned(result, koota: KootaName) -> float:  # type: ignore[no-untyped-def]
    (row,) = [k for k in result.kootas if k.koota is koota]
    return row.earned


def test_reference_rohini_bride_x_hasta_groom_scores_25() -> None:
    """Bride Moon Rohini (Taurus 15deg) x groom Moon Hasta (Virgo 15deg) = 25/36.

    Hand derivation, table by table:
    - Varna  (max 1): Taurus=Vaishya, Virgo=Vaishya; groom not below bride -> 1.
    - Vashya (max 2): groom Virgo=Manava x bride Taurus=Chatushpada -> matrix 1.
    - Tara   (max 3): Rohini=4th star, Hasta=13th. Bride->groom count 10
      (10 mod 9 = 1, Janma — benefic) -> 1.5; groom->bride count 19
      (19 mod 9 = 1, Janma) -> 1.5; total 3.
    - Yoni   (max 4): Hasta=Buffalo x Rohini=Serpent -> matrix 1.
    - Maitri (max 5): lords Mercury (Virgo) and Venus (Taurus) are MUTUAL
      friends per BPHS naisargika maitri -> 5.
    - Gana   (max 6): groom Hasta=Deva x bride Rohini=Manushya -> 6.
    - Bhakoot(max 7): Taurus<->Virgo are 5/9 (nava-pancham) -> dosha, 0 points;
      the dosha is CANCELLED because Venus and Mercury are mutual natural
      friends (standard Melapaka exception) — points stay 0 by convention.
    - Nadi   (max 8): Hasta=Adi x Rohini=Antya -> different nadi -> 8.
    Total = 1+1+3+1+5+6+0+8 = 25 -> band "good" (25-32, classical convention).
    """
    bride = _moon(3, 2, ZodiacSign.TAURUS, 15.0)  # Rohini pada 2
    groom = _moon(12, 2, ZodiacSign.VIRGO, 15.0)  # Hasta pada 2
    result = compute_ashtakoota_from_moons(bride, groom)

    assert _earned(result, KootaName.VARNA) == 1.0
    assert _earned(result, KootaName.VASHYA) == 1.0
    assert _earned(result, KootaName.TARA) == 3.0
    assert _earned(result, KootaName.YONI) == 1.0
    assert _earned(result, KootaName.GRAHA_MAITRI) == 5.0
    assert _earned(result, KootaName.GANA) == 6.0
    assert _earned(result, KootaName.BHAKOOT) == 0.0
    assert _earned(result, KootaName.NADI) == 8.0
    assert result.total == 25.0
    assert result.band is CompatibilityBand.GOOD
    assert result.bhakoot_dosha.present and result.bhakoot_dosha.cancelled
    assert any(c.rule == "bhakoot.lords_mutual_friends" for c in result.bhakoot_dosha.cancellations)
    assert not result.nadi_dosha.present


def test_reference_same_nakshatra_different_pada_scores_28() -> None:
    """Bride Ashwini pada 1 x groom Ashwini pada 3 = 28/36, Nadi dosha cancelled.

    Hand derivation:
    - Varna  : both Aries=Kshatriya; equal -> 1.
    - Vashya : both Aries=Chatushpada; same class -> 2.
    - Tara   : same star, count 1 both ways (Janma — benefic) -> 1.5+1.5 = 3.
    - Yoni   : Horse x Horse (same yoni) -> 4.
    - Maitri : both lords Mars (same lord counts friend/friend) -> 5.
    - Gana   : Deva x Deva -> 6.
    - Bhakoot: same sign (1/1) is NOT a dosha pair -> 7.
    - Nadi   : both Adi -> Nadi dosha, 0 points; CANCELLED by the classical
      exception "same nakshatra but different padas".
    Total = 1+2+3+4+5+6+7+0 = 28 -> band "good".
    """
    bride = _moon(0, 1, ZodiacSign.ARIES, 2.0)  # Ashwini pada 1
    groom = _moon(0, 3, ZodiacSign.ARIES, 8.0)  # Ashwini pada 3
    result = compute_ashtakoota_from_moons(bride, groom)

    assert _earned(result, KootaName.VARNA) == 1.0
    assert _earned(result, KootaName.VASHYA) == 2.0
    assert _earned(result, KootaName.TARA) == 3.0
    assert _earned(result, KootaName.YONI) == 4.0
    assert _earned(result, KootaName.GRAHA_MAITRI) == 5.0
    assert _earned(result, KootaName.GANA) == 6.0
    assert _earned(result, KootaName.BHAKOOT) == 7.0
    assert _earned(result, KootaName.NADI) == 0.0
    assert result.total == 28.0
    assert result.band is CompatibilityBand.GOOD
    assert not result.bhakoot_dosha.present
    assert result.nadi_dosha.present and result.nadi_dosha.cancelled
    assert any(
        c.rule == "nadi.same_nakshatra_different_pada" for c in result.nadi_dosha.cancellations
    )


def test_reference_magha_bride_x_dhanishta_groom_scores_17_5() -> None:
    """Bride Magha (Leo 5deg) x groom Dhanishta (Capricorn 26deg) = 17.5/36.

    Hand derivation:
    - Varna  : bride Leo=Kshatriya OUTRANKS groom Capricorn=Vaishya -> 0.
    - Vashya : groom Capricorn 26deg = second half = Jalachara x bride
      Leo=Vanachara -> matrix 0.
    - Tara   : Magha=10th star, Dhanishta=23rd. Bride->groom count 14
      (14 mod 9 = 5, Pratyari — malefic) -> 0; groom->bride count 15
      (15 mod 9 = 6, Sadhaka — benefic) -> 1.5; total 1.5.
    - Yoni   : Magha=Rat x Dhanishta=Lion -> matrix 2.
    - Maitri : lords Sun (Leo) and Saturn (Capricorn) are MUTUAL enemies per
      BPHS naisargika maitri -> 0.
    - Gana   : both Rakshasa (same gana) -> 6.
    - Bhakoot: Leo<->Capricorn are 6/8 (shadashtaka) -> dosha, 0 points; NOT
      cancelled (lords differ and are mutual enemies, not friends).
    - Nadi   : Magha=Antya x Dhanishta=Madhya -> different -> 8.
    Total = 0+0+1.5+2+0+6+0+8 = 17.5 -> band "not_recommended" (<18).
    """
    bride = _moon(9, 2, ZodiacSign.LEO, 5.0)  # Magha pada 2
    groom = _moon(22, 1, ZodiacSign.CAPRICORN, 26.0)  # Dhanishta pada 1
    result = compute_ashtakoota_from_moons(bride, groom)

    assert _earned(result, KootaName.VARNA) == 0.0
    assert _earned(result, KootaName.VASHYA) == 0.0
    assert _earned(result, KootaName.TARA) == 1.5
    assert _earned(result, KootaName.YONI) == 2.0
    assert _earned(result, KootaName.GRAHA_MAITRI) == 0.0
    assert _earned(result, KootaName.GANA) == 6.0
    assert _earned(result, KootaName.BHAKOOT) == 0.0
    assert _earned(result, KootaName.NADI) == 8.0
    assert result.total == 17.5
    assert result.band is CompatibilityBand.NOT_RECOMMENDED
    assert result.bhakoot_dosha.present and not result.bhakoot_dosha.cancelled
    assert not result.nadi_dosha.present

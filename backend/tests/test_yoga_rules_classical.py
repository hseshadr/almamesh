"""Classical-correctness audit of every yoga rule the engine implements.

Each rule is tested positively AND negatively against its classical definition
(citations live in the rule implementations and in each emitted yoga's
``formation_rules[].source``). Charts are synthetic (``tests.yoga_builders``)
so every lagna/dignity/house combination is exercised deterministically.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from almamesh.constants.astrology import PlanetName, ZodiacSign
from almamesh.schemas.astrology import (
    SiderealContext,
    YogaData,
    YogaFormationRule,
    YogaStrengthFactor,
)
from almamesh.yogas.engine import create_yoga_engine
from tests.yoga_builders import Placement, make_chart

SUN = PlanetName.SUN
MOON = PlanetName.MOON
MARS = PlanetName.MARS
MERCURY = PlanetName.MERCURY
JUPITER = PlanetName.JUPITER
VENUS = PlanetName.VENUS
SATURN = PlanetName.SATURN

ARIES = ZodiacSign.ARIES
TAURUS = ZodiacSign.TAURUS
GEMINI = ZodiacSign.GEMINI
CANCER = ZodiacSign.CANCER
LEO = ZodiacSign.LEO
VIRGO = ZodiacSign.VIRGO
LIBRA = ZodiacSign.LIBRA
SCORPIO = ZodiacSign.SCORPIO
SAGITTARIUS = ZodiacSign.SAGITTARIUS
CAPRICORN = ZodiacSign.CAPRICORN
AQUARIUS = ZodiacSign.AQUARIUS
PISCES = ZodiacSign.PISCES


def yogas_for(
    lagna: ZodiacSign,
    placements: dict[PlanetName, Placement] | None = None,
) -> list[YogaData]:
    chart = make_chart(lagna, placements)
    return create_yoga_engine(chart).evaluate_all_yogas()


def names_for(
    lagna: ZodiacSign,
    placements: dict[PlanetName, Placement] | None = None,
) -> list[str]:
    return [y.name for y in yogas_for(lagna, placements)]


def by_name(yogas: list[YogaData], name: str) -> list[YogaData]:
    return [y for y in yogas if y.name == name]


def rule_ids(yoga: YogaData) -> list[str]:
    return [r.rule for r in yoga.formation_rules]


class TestPanchaMahapurusha:
    """Mahapurusha needs a kendra FROM LAGNA in own or exaltation sign
    (BPHS, Pancha-Mahapurusha-yoga adhyaya; Phaladeepika 6.1-2)."""

    def test_malavya_fires_for_venus_exalted_in_a_kendra(self) -> None:
        assert "Malavya Yoga" in names_for(VIRGO, {VENUS: PISCES})  # 7th

    def test_malavya_does_not_fire_for_venus_in_the_2nd_even_exalted(self) -> None:
        # The founder-chart bug: Venus in the 2nd is NOT a kendra.
        assert "Malavya Yoga" not in names_for(AQUARIUS, {VENUS: PISCES})

    def test_malavya_does_not_fire_in_a_kendra_without_dignity(self) -> None:
        assert "Malavya Yoga" not in names_for(VIRGO, {VENUS: GEMINI})  # 10th, neutral

    def test_ruchaka_fires_for_mars_exalted_in_a_kendra(self) -> None:
        assert "Ruchaka Yoga" in names_for(CANCER, {MARS: CAPRICORN})  # 7th

    def test_ruchaka_does_not_fire_for_exalted_mars_in_the_12th(self) -> None:
        assert "Ruchaka Yoga" not in names_for(AQUARIUS, {MARS: CAPRICORN})

    def test_bhadra_fires_for_mercury_in_own_exaltation_kendra(self) -> None:
        assert "Bhadra Yoga" in names_for(GEMINI, {MERCURY: VIRGO})  # 4th

    def test_hamsa_fires_for_jupiter_exalted_in_a_kendra(self) -> None:
        assert "Hamsa Yoga" in names_for(ARIES, {JUPITER: CANCER})  # 4th

    def test_sasa_fires_for_saturn_exalted_in_a_kendra(self) -> None:
        assert "Sasa Yoga" in names_for(CAPRICORN, {SATURN: LIBRA})  # 10th


class TestGajakesari:
    """Jupiter in a kendra from the MOON (BPHS, Chandra-yoga adhyaya)."""

    def test_fires_for_jupiter_in_the_7th_from_moon(self) -> None:
        assert "Gajakesari Yoga" in names_for(ARIES, {MOON: GEMINI, JUPITER: SAGITTARIUS})

    def test_fires_for_jupiter_conjunct_moon(self) -> None:
        assert "Gajakesari Yoga" in names_for(ARIES, {MOON: GEMINI, JUPITER: GEMINI})

    def test_does_not_fire_for_jupiter_in_the_2nd_from_moon(self) -> None:
        assert "Gajakesari Yoga" not in names_for(ARIES, {MOON: GEMINI, JUPITER: CANCER})


class TestNamedConjunctions:
    def test_budha_aditya_fires_for_sun_mercury_conjunction(self) -> None:
        assert "Budha-Aditya Yoga" in names_for(TAURUS, {SUN: GEMINI, MERCURY: GEMINI})

    def test_chandra_mangala_fires_for_moon_mars_conjunction(self) -> None:
        assert "Chandra-Mangala Yoga" in names_for(ARIES, {MOON: GEMINI, MARS: GEMINI})

    def test_mars_jupiter_conjunction_is_guru_mangala_never_kahala(self) -> None:
        # Mars+Jupiter conjunction is classically Guru-Mangala. Kahala is a
        # DIFFERENT (4th/9th-lord) yoga the engine does not implement; the
        # old engine mislabeled this conjunction as "Kahal Yoga".
        names = names_for(AQUARIUS, {MARS: CAPRICORN, JUPITER: CAPRICORN})
        assert "Guru-Mangala Yoga" in names
        assert not any("Kahal" in n for n in names)


class TestChandraYogas:
    """Sunapha/Anapha/Durudhara/Kemadruma — occupancy of the 2nd/12th from the
    Moon by planets OTHER than the Sun (nodes excluded). BPHS, Chandra-yogas."""

    def test_sunapha_when_only_the_2nd_from_moon_is_occupied(self) -> None:
        names = names_for(LIBRA, {MOON: GEMINI, VENUS: CANCER})
        assert "Sunapha Yoga" in names
        assert "Anapha Yoga" not in names
        assert "Kemadruma Yoga" not in names

    def test_anapha_when_only_the_12th_from_moon_is_occupied(self) -> None:
        names = names_for(LIBRA, {MOON: GEMINI, MARS: TAURUS, VENUS: LIBRA})
        assert "Anapha Yoga" in names
        assert "Sunapha Yoga" not in names

    def test_durudhara_when_both_sides_are_occupied(self) -> None:
        names = names_for(LIBRA, {MOON: GEMINI, VENUS: CANCER, MARS: TAURUS})
        assert "Durudhara Yoga" in names
        assert "Sunapha Yoga" not in names
        assert "Anapha Yoga" not in names

    def test_kemadruma_when_neither_side_is_occupied_sun_does_not_count(self) -> None:
        # The Sun in the 2nd from the Moon does NOT break Kemadruma (BPHS
        # excludes the Sun from these four yogas).
        names = names_for(LIBRA, {MOON: GEMINI, SUN: CANCER, VENUS: LIBRA})
        assert "Kemadruma Yoga" in names
        assert "Sunapha Yoga" not in names


class TestSuryaYogas:
    """Vesi/Vasi/Ubhayachari — occupancy of the 2nd/12th from the SUN by
    planets other than the Moon (nodes excluded). BPHS, Surya-yogas."""

    def test_vesi_when_only_the_2nd_from_sun_is_occupied(self) -> None:
        names = names_for(ARIES, {SUN: LEO, JUPITER: VIRGO, VENUS: LIBRA})
        assert "Vesi Yoga" in names
        assert "Vasi Yoga" not in names

    def test_vasi_when_only_the_12th_from_sun_is_occupied(self) -> None:
        names = names_for(ARIES, {SUN: LEO, SATURN: CANCER, MARS: SAGITTARIUS, VENUS: LIBRA})
        assert "Vasi Yoga" in names
        assert "Vesi Yoga" not in names

    def test_moon_alone_does_not_create_vasi(self) -> None:
        names = names_for(ARIES, {SUN: LEO, MOON: CANCER, MARS: SAGITTARIUS, VENUS: LIBRA})
        assert "Vasi Yoga" not in names

    def test_ubhayachari_when_both_sides_are_occupied(self) -> None:
        names = names_for(ARIES, {SUN: LEO, JUPITER: VIRGO, SATURN: CANCER, VENUS: LIBRA})
        assert "Ubhayachari Yoga" in names
        assert "Vesi Yoga" not in names
        assert "Vasi Yoga" not in names


class TestAdhiYoga:
    """All three natural benefics (Mercury, Jupiter, Venus) in the 6th/7th/8th
    from the Moon (BPHS, Chandra-yoga adhyaya)."""

    def test_fires_when_all_three_benefics_occupy_6_7_8_from_moon(self) -> None:
        names = names_for(CAPRICORN, {MOON: ARIES, MERCURY: VIRGO, JUPITER: LIBRA, VENUS: SCORPIO})
        assert "Adhi Yoga" in names

    def test_does_not_fire_when_one_benefic_is_elsewhere(self) -> None:
        names = names_for(
            CAPRICORN,
            {MOON: ARIES, MERCURY: VIRGO, JUPITER: LIBRA, VENUS: SAGITTARIUS},
        )
        assert "Adhi Yoga" not in names


class TestAmalaYoga:
    """A natural benefic — and ONLY benefics — in the 10th from Lagna or Moon
    (Phaladeepika, Amala yoga). Natural benefic/malefic per BPHS ch. 3:
    waxing Moon and unafflicted Mercury are benefic."""

    def test_fires_for_a_lone_benefic_in_the_10th_from_lagna(self) -> None:
        assert "Amala Yoga" in names_for(ARIES, {JUPITER: CAPRICORN})

    def test_does_not_fire_when_a_malefic_shares_the_10th(self) -> None:
        assert "Amala Yoga" not in names_for(ARIES, {JUPITER: CAPRICORN, SATURN: CAPRICORN})

    def test_waxing_moon_in_the_10th_counts_as_benefic(self) -> None:
        # Sun Leo 20 deg, Moon Capricorn: elongation 145 deg -> waxing.
        assert "Amala Yoga" in names_for(ARIES, {MOON: CAPRICORN, SUN: LEO})

    def test_waning_moon_in_the_10th_does_not_count(self) -> None:
        # Sun Pisces, Moon Capricorn: elongation 300 deg -> waning (malefic).
        assert "Amala Yoga" not in names_for(ARIES, {MOON: CAPRICORN, SUN: PISCES})


class TestKartariYogas:
    """Lagna hemmed between pure benefics (Shubha) or pure malefics (Papa) in
    the 12th and 2nd (Phaladeepika). Mixed occupancy forms neither."""

    def test_shubha_kartari_for_pure_benefic_hemming(self) -> None:
        names = names_for(CAPRICORN, {JUPITER: SAGITTARIUS, VENUS: AQUARIUS})
        assert "Shubha Kartari Yoga" in names
        assert "Papa Kartari Yoga" not in names

    def test_papa_kartari_for_pure_malefic_hemming(self) -> None:
        # Mercury sharing a sign with Mars is afflicted -> counts malefic.
        names = names_for(
            CAPRICORN,
            {MARS: SAGITTARIUS, SATURN: AQUARIUS, JUPITER: TAURUS, VENUS: LIBRA},
        )
        assert "Papa Kartari Yoga" in names
        assert "Shubha Kartari Yoga" not in names

    def test_mixed_hemming_forms_neither_kartari(self) -> None:
        # The founder-chart bug: a benefic on one side plus malefics mixed in
        # used to fire Shubha Kartari. Mixed hemming is no kartari at all.
        names = names_for(
            CAPRICORN,
            {JUPITER: SAGITTARIUS, MARS: SAGITTARIUS, VENUS: AQUARIUS},
        )
        assert "Shubha Kartari Yoga" not in names
        assert "Papa Kartari Yoga" not in names


class TestRajaYoga:
    """Kendra-lord + trikona-lord sambandha: conjunction, mutual aspect, or
    exchange, between DISTINCT grahas (BPHS, Raja-yoga adhyaya)."""

    def test_fires_for_kendra_and_trikona_lords_conjunct(self) -> None:
        # Moon moved off Gemini so the 4th lord does not join the conjunction.
        yogas = yogas_for(ARIES, {VENUS: GEMINI, JUPITER: GEMINI, MOON: SCORPIO})
        raja = by_name(yogas, "Raja Yoga")
        assert len(raja) == 1
        assert raja[0].planets_involved == [JUPITER, VENUS]
        # Only the kendra (7), the trikona (9), and the shared house (3) are
        # credited - never the lords' unrelated houses.
        assert raja[0].houses_involved == [3, 7, 9]

    def test_never_pairs_a_lord_with_itself(self) -> None:
        # Aquarius lagna: Saturn lords houses 1 and 12 only. The old engine
        # paired "Saturn with Saturn" crediting 1-4-7-10/1-5-9. With no
        # cross-lord sambandha there must be NO Raja Yoga; the planet that
        # genuinely lords kendra+trikona surfaces as Yogakaraka instead.
        yogas = yogas_for(AQUARIUS, {SATURN: TAURUS, VENUS: ARIES, SUN: LEO})
        assert by_name(yogas, "Raja Yoga") == []
        karaka = by_name(yogas, "Yogakaraka")
        assert len(karaka) == 1
        assert karaka[0].planets_involved == [VENUS]

    def test_fires_for_mutual_aspect_between_the_lords(self) -> None:
        # Venus (7th lord) and Jupiter (9th lord) in mutual 7th aspect; Saturn
        # parked in Capricorn so no second lord-pair forms a sambandha.
        yogas = yogas_for(ARIES, {VENUS: TAURUS, JUPITER: SCORPIO, SATURN: CAPRICORN})
        raja = by_name(yogas, "Raja Yoga")
        assert len(raja) == 1
        assert "mutual_aspect" in raja[0].formation_rules[0].rule

    def test_fires_for_exchange_between_the_lords(self) -> None:
        # Sun (5th lord) and Saturn (10th lord) exchange signs; Jupiter parked
        # in Taurus so no second lord-pair forms a sambandha.
        yogas = yogas_for(ARIES, {SATURN: LEO, SUN: AQUARIUS, JUPITER: TAURUS})
        raja = by_name(yogas, "Raja Yoga")
        assert len(raja) == 1
        assert "exchange" in raja[0].formation_rules[0].rule


class TestYogakaraka:
    """A graha lording both a kendra (4/7/10) and a trikona (5/9) from lagna
    (BPHS, Yogakaraka adhyaya) — emitted as a first-class flag."""

    def test_emitted_for_aquarius_lagna_venus(self) -> None:
        yogas = yogas_for(AQUARIUS)
        karaka = by_name(yogas, "Yogakaraka")
        assert len(karaka) == 1
        assert karaka[0].planets_involved == [VENUS]
        assert karaka[0].houses_involved == [4, 9]

    def test_not_emitted_for_a_lagna_without_a_yogakaraka(self) -> None:
        assert "Yogakaraka" not in names_for(ARIES)


class TestNeechaBhanga:
    """Neecha-bhanga conditions (Phaladeepika / Jataka Parijata), each with an
    explicit fired trace: which condition, for which planet."""

    def test_dispositor_in_kendra_from_lagna(self) -> None:
        yogas = yogas_for(ARIES, {JUPITER: CAPRICORN, SATURN: CANCER, MARS: LEO})
        bhanga = by_name(yogas, "Neecha Bhanga Raja Yoga")
        assert len(bhanga) == 1
        assert "neecha_bhanga.dispositor_in_kendra" in rule_ids(bhanga[0])
        assert JUPITER in bhanga[0].planets_involved
        assert SATURN in bhanga[0].planets_involved

    def test_exaltation_occupant_of_the_debilitation_sign_in_kendra(self) -> None:
        # Mars (exalted in Capricorn, Jupiter's debilitation sign) in a kendra.
        yogas = yogas_for(CANCER, {JUPITER: CAPRICORN, MARS: ARIES})
        bhanga = by_name(yogas, "Neecha Bhanga Raja Yoga")
        assert len(bhanga) == 1
        ids = rule_ids(bhanga[0])
        assert "neecha_bhanga.exaltation_lord_of_sign_in_kendra" in ids
        assert "neecha_bhanga.dispositor_in_kendra" not in ids

    def test_conjunct_an_exalted_planet(self) -> None:
        yogas = yogas_for(AQUARIUS, {JUPITER: CAPRICORN, MARS: CAPRICORN, SATURN: CANCER})
        bhanga = by_name(yogas, "Neecha Bhanga Raja Yoga")
        assert len(bhanga) == 1
        ids = rule_ids(bhanga[0])
        assert "neecha_bhanga.conjunct_exalted_planet" in ids
        assert "neecha_bhanga.dispositor_in_kendra" not in ids
        assert MARS in bhanga[0].planets_involved

    def test_silent_when_no_planet_is_debilitated(self) -> None:
        assert "Neecha Bhanga Raja Yoga" not in names_for(LEO)

    def test_silent_when_debilitated_but_no_condition_holds(self) -> None:
        names = names_for(TAURUS, {JUPITER: CAPRICORN, SATURN: LIBRA, MARS: LIBRA})
        assert "Neecha Bhanga Raja Yoga" not in names

    def test_every_emission_carries_a_full_trace(self) -> None:
        yogas = yogas_for(ARIES, {JUPITER: CAPRICORN, SATURN: CANCER, MARS: LEO})
        for yoga in by_name(yogas, "Neecha Bhanga Raja Yoga"):
            assert yoga.planets_involved
            assert yoga.houses_involved
            assert yoga.formation_rules
            for rule in yoga.formation_rules:
                assert rule.source
                assert rule.planets


class TestVipareetaRajaYoga:
    """Dusthana lords placed in dusthanas: Harsha (6th lord), Sarala (8th),
    Vimala (12th) — Uttara Kalamrita."""

    def test_harsha_for_6th_lord_in_the_12th(self) -> None:
        yogas = yogas_for(AQUARIUS, {MOON: CAPRICORN})
        vip = by_name(yogas, "Vipareeta Raja Yoga")
        assert len(vip) == 1
        assert "vipareeta.harsha" in rule_ids(vip[0])
        assert vip[0].planets_involved == [MOON]
        assert vip[0].houses_involved == [6, 12]

    def test_sarala_for_8th_lord_in_its_own_8th(self) -> None:
        yogas = yogas_for(ARIES, {MARS: SCORPIO})
        vip = by_name(yogas, "Vipareeta Raja Yoga")
        assert any("vipareeta.sarala" in rule_ids(y) for y in vip)

    def test_vimala_for_12th_lord_in_the_6th(self) -> None:
        yogas = yogas_for(TAURUS, {MARS: LIBRA})
        vip = by_name(yogas, "Vipareeta Raja Yoga")
        assert any("vipareeta.vimala" in rule_ids(y) for y in vip)

    def test_silent_when_dusthana_lords_avoid_dusthanas(self) -> None:
        names = names_for(CAPRICORN, {MERCURY: LIBRA, SUN: TAURUS, JUPITER: AQUARIUS})
        assert "Vipareeta Raja Yoga" not in names


class TestParivartana:
    """Mutual sign exchange between two grahas; Maha/Khala/Dainya by the
    exchanged houses (Uttara Kalamrita tradition)."""

    def test_maha_parivartana_for_a_5_11_exchange(self) -> None:
        yogas = yogas_for(ARIES, {SATURN: LEO, SUN: AQUARIUS})
        pari = by_name(yogas, "Parivartana Yoga")
        assert len(pari) == 1
        assert "parivartana.maha" in rule_ids(pari[0])

    def test_dainya_parivartana_when_a_dusthana_house_is_exchanged(self) -> None:
        yogas = yogas_for(ARIES, {MERCURY: LIBRA, VENUS: VIRGO})
        pari = by_name(yogas, "Parivartana Yoga")
        assert len(pari) == 1
        assert "parivartana.dainya" in rule_ids(pari[0])

    def test_khala_parivartana_when_the_3rd_house_is_exchanged(self) -> None:
        yogas = yogas_for(ARIES, {MERCURY: AQUARIUS, SATURN: GEMINI})
        pari = by_name(yogas, "Parivartana Yoga")
        assert len(pari) == 1
        assert "parivartana.khala" in rule_ids(pari[0])


class TestDhanaYoga:
    """Associations among the wealth-house lords (2/5/9/11) — conjunction,
    exchange, or placement of one in the other (BPHS, Dhana-yoga adhyaya)."""

    def test_placement_of_the_9th_lord_in_the_2nd(self) -> None:
        yogas = yogas_for(AQUARIUS, {VENUS: PISCES})
        dhana = by_name(yogas, "Dhana Yoga")
        assert len(dhana) >= 1
        assert any("dhana.lord_placed" in rule_ids(y) for y in dhana)

    def test_conjunction_of_the_2nd_and_11th_lords(self) -> None:
        yogas = yogas_for(ARIES, {VENUS: GEMINI, SATURN: GEMINI})
        dhana = by_name(yogas, "Dhana Yoga")
        assert any("dhana.lords_conjunction" in rule_ids(y) for y in dhana)

    def test_exchange_is_reported_once_not_as_two_placements(self) -> None:
        # Jupiter parked in its own 9th so no second wealth-lord pair forms.
        yogas = yogas_for(ARIES, {VENUS: AQUARIUS, SATURN: TAURUS, JUPITER: SAGITTARIUS})
        dhana = by_name(yogas, "Dhana Yoga")
        assert len(dhana) == 1
        assert "dhana.lords_exchange" in rule_ids(dhana[0])


class TestKalaSarpa:
    """All seven classical grahas hemmed on one side of the Rahu-Ketu axis
    (later traditional dosha; documented as post-BPHS)."""

    def test_fires_when_all_grahas_are_on_one_side_of_the_axis(self) -> None:
        names = names_for(
            ARIES,
            {
                SUN: LIBRA,
                MOON: SCORPIO,
                MARS: SAGITTARIUS,
                MERCURY: SAGITTARIUS,
                JUPITER: CAPRICORN,
                VENUS: AQUARIUS,
                SATURN: SCORPIO,
            },
        )
        assert "Kala Sarpa Yoga" in names

    def test_silent_when_one_graha_crosses_the_axis(self) -> None:
        names = names_for(
            ARIES,
            {
                SUN: LIBRA,
                MOON: SCORPIO,
                MARS: SAGITTARIUS,
                MERCURY: SAGITTARIUS,
                JUPITER: CAPRICORN,
                VENUS: TAURUS,
                SATURN: SCORPIO,
            },
        )
        assert "Kala Sarpa Yoga" not in names


class TestChatussagara:
    """All four kendras from lagna occupied by classical grahas
    (B.V. Raman, Three Hundred Important Combinations)."""

    def test_fires_when_every_kendra_is_occupied(self) -> None:
        names = names_for(
            ARIES,
            {MERCURY: ARIES, MOON: CANCER, SATURN: LIBRA, JUPITER: CAPRICORN},
        )
        assert "Chatussagara Yoga" in names

    def test_silent_when_a_kendra_is_empty(self) -> None:
        assert "Chatussagara Yoga" not in names_for(ARIES)


class TestSaraswati:
    """Jupiter, Venus and Mercury in kendra/trikona/2nd from lagna with
    Jupiter in own, exaltation or friendly sign (Phaladeepika)."""

    def test_fires_when_formed(self) -> None:
        names = names_for(PISCES, {JUPITER: PISCES, VENUS: CANCER, MERCURY: GEMINI})
        assert "Saraswati Yoga" in names

    def test_silent_when_jupiter_lacks_dignity(self) -> None:
        # Jupiter in Libra: Venus is Jupiter's naisargika enemy -> unfriendly.
        names = names_for(CANCER, {JUPITER: LIBRA, VENUS: CANCER, MERCURY: LIBRA})
        assert "Saraswati Yoga" not in names


class TestGrades:
    """Qualitative grade derived ONLY from real factors (dignity, combustion,
    retrograde, house class). No percentages anywhere."""

    def test_exalted_kendra_yoga_grades_strong(self) -> None:
        yogas = yogas_for(ARIES, {JUPITER: CANCER})
        hamsa = by_name(yogas, "Hamsa Yoga")[0]
        assert hamsa.grade == "strong"

    def test_debilitated_dusthana_yoga_grades_weak(self) -> None:
        yogas = yogas_for(AQUARIUS, {MARS: CAPRICORN, JUPITER: CAPRICORN})
        guru_mangala = by_name(yogas, "Guru-Mangala Yoga")[0]
        assert guru_mangala.grade == "weak"

    def test_combust_neutral_yoga_grades_moderate(self) -> None:
        yogas = yogas_for(TAURUS, {SUN: GEMINI, MERCURY: GEMINI})
        budha_aditya = by_name(yogas, "Budha-Aditya Yoga")[0]
        assert budha_aditya.grade == "moderate"
        combustion = [f for f in budha_aditya.strength_factors if f.factor_type == "combustion"]
        assert combustion and combustion[0].planet == MERCURY

    def test_no_yoga_ever_carries_a_shadbala_factor(self) -> None:
        for lagna in (ARIES, CANCER, AQUARIUS):
            for yoga in yogas_for(lagna):
                for factor in yoga.strength_factors:
                    assert factor.factor_type in {
                        "dignity",
                        "combustion",
                        "retrograde",
                        "house_class",
                    }

    def test_numeric_strength_fields_are_gone_from_the_schema(self) -> None:
        assert "strength" not in YogaData.model_fields
        assert "effective_strength" not in YogaData.model_fields
        assert "grade" in YogaData.model_fields


class TestSchemaFailLoud:
    """A yoga with no trace must be schema-impossible (the old engine emitted
    Neechabhanga with EMPTY planets/houses/factors/formation rules)."""

    @staticmethod
    def _valid_kwargs() -> dict[str, object]:
        return {
            "name": "Test Yoga",
            "display_name": "Test Yoga",
            "category": "special",
            "description": "d",
            "effects": "e",
            "grade": "moderate",
            "strength_factors": [
                YogaStrengthFactor(factor_type="dignity", planet=MOON, value="neutral", basis="b")
            ],
            "planets_involved": [MOON],
            "houses_involved": [1],
            "planetary_signature": "sig",
            "formation_rules": [
                YogaFormationRule(rule="r", description="d", source="s", planets=[MOON], houses=[1])
            ],
        }

    @pytest.mark.parametrize(
        "field",
        ["planets_involved", "houses_involved", "strength_factors", "formation_rules"],
    )
    def test_empty_trace_lists_are_rejected(self, field: str) -> None:
        kwargs = self._valid_kwargs()
        kwargs[field] = []
        with pytest.raises(ValidationError):
            YogaData(**kwargs)  # type: ignore[arg-type]

    def test_full_trace_validates(self) -> None:
        assert YogaData(**self._valid_kwargs())  # type: ignore[arg-type]


class TestEngineOutputContract:
    def test_every_emitted_yoga_has_a_complete_trace_and_grade(self) -> None:
        for lagna in (ARIES, LEO, AQUARIUS):
            for yoga in yogas_for(lagna):
                assert yoga.planets_involved
                assert yoga.houses_involved
                assert yoga.strength_factors
                assert yoga.formation_rules
                assert yoga.grade in {"strong", "moderate", "weak"}
                assert all(r.source for r in yoga.formation_rules)

    def test_output_is_sorted_strong_first_then_by_name(self) -> None:
        order = {"strong": 0, "moderate": 1, "weak": 2}
        yogas = yogas_for(ARIES, {JUPITER: CANCER, MOON: CAPRICORN})
        ranks = [order[y.grade] for y in yogas]
        assert ranks == sorted(ranks)

    def test_deleted_pseudo_yogas_never_appear(self) -> None:
        # Rules deleted in the audit (no faithful classical formation rule)
        # must not resurface for any of these charts.
        banned = {
            "Pushkala Yoga",
            "Kahal Yoga",
            "Kesari Yoga",
            "Lakshmi Yoga",
            "Parvati Yoga",
            "Shakti Yoga",
            "Durga Yoga",
            "Mahabhagya Yoga",
            "Dwi-Panchaka Yoga",
            "Kendra-Trikona Balance Yoga",
            "Akhand Samrajya Yoga",
            "Sreenatha Yoga",
            "Dhana Yoga (2nd house cluster)",
        }
        for lagna in list(ZodiacSign):
            assert banned.isdisjoint(set(names_for(lagna)))


def test_synthetic_chart_planets_carry_the_new_natal_fields() -> None:
    chart: SiderealContext = make_chart(AQUARIUS)
    venus = chart.planets[VENUS]
    saturn = chart.planets[SATURN]
    assert venus.houses_ruled == [4, 9]
    assert venus.is_yogakaraka is True
    assert saturn.houses_ruled == [1, 12]
    assert saturn.is_yogakaraka is False
    assert chart.planets[PlanetName.RAHU].houses_ruled == []

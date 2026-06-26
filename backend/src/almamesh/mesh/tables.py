"""Classical Melapaka (Guna Milan) tables as frozen, cited data.

Every table below is a standard, widely-published classical table — the same
tabulation printed in panchangas and used across traditional Melapaka practice.
Primary citations: B.V. Raman, "Muhurtha (Electional Astrology)", marriage
adyaya (Kuta agreement); the naisargika-maitri table of Brihat Parashara Hora
Shastra (reused from ``almamesh.strength.friendship`` — single source of
truth); and the standard panchanga Melapaka tables (Varna/Vashya/Tara/Yoni/
Gana/Bhakoot/Nadi) of the Muhurta tradition. Where panchanga practice (not a
specific verse) fixes a value, the table's ``*_SOURCE`` constant says so.

Indexing convention: nakshatra tables are tuples of length 27 aligned with
``almamesh.constants.astrology.NAKSHATRA_NAMES`` (0 = Ashwini ... 26 = Revati).
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import ZodiacSign
from almamesh.schemas.mesh import Gana, Nadi, Varna, VashyaClass, YoniAnimal, YoniSex

# --- Varna (1 point) ---------------------------------------------------------

VARNA_SOURCE: Final[str] = (
    "Varna kuta: Moon-sign varna by element (water=Brahmin, fire=Kshatriya, "
    "earth=Vaishya, air=Shudra); 1 point when the groom's varna is not below "
    "the bride's. B.V. Raman, 'Muhurtha', Kuta agreement; standard panchanga "
    "Melapaka table."
)

VARNA_OF_SIGN: Final[dict[ZodiacSign, Varna]] = {
    ZodiacSign.CANCER: Varna.BRAHMIN,
    ZodiacSign.SCORPIO: Varna.BRAHMIN,
    ZodiacSign.PISCES: Varna.BRAHMIN,
    ZodiacSign.ARIES: Varna.KSHATRIYA,
    ZodiacSign.LEO: Varna.KSHATRIYA,
    ZodiacSign.SAGITTARIUS: Varna.KSHATRIYA,
    ZodiacSign.TAURUS: Varna.VAISHYA,
    ZodiacSign.VIRGO: Varna.VAISHYA,
    ZodiacSign.CAPRICORN: Varna.VAISHYA,
    ZodiacSign.GEMINI: Varna.SHUDRA,
    ZodiacSign.LIBRA: Varna.SHUDRA,
    ZodiacSign.AQUARIUS: Varna.SHUDRA,
}

# Higher rank = "higher" varna in the classical ordering.
VARNA_RANK: Final[dict[Varna, int]] = {
    Varna.BRAHMIN: 4,
    Varna.KSHATRIYA: 3,
    Varna.VAISHYA: 2,
    Varna.SHUDRA: 1,
}

# --- Vashya (2 points) -------------------------------------------------------

VASHYA_SOURCE: Final[str] = (
    "Vashya kuta: five-fold sign classification (chatushpada/manava/jalachara/"
    "vanachara/keeta) with the first/second-half split of Sagittarius and "
    "Capricorn; scored groom-class x bride-class by the standard five-class "
    "points matrix (incl. the half-point cells). B.V. Raman, 'Muhurtha', Kuta "
    "agreement; matrix as tabulated in standard panchanga Melapaka practice."
)

# Whole-sign vashya classes; Sagittarius and Capricorn split at 15deg00' —
# resolved from the Moon's degree within the sign (see ``vashya_class``).
_VASHYA_WHOLE_SIGN: Final[dict[ZodiacSign, VashyaClass]] = {
    ZodiacSign.ARIES: VashyaClass.CHATUSHPADA,
    ZodiacSign.TAURUS: VashyaClass.CHATUSHPADA,
    ZodiacSign.GEMINI: VashyaClass.MANAVA,
    ZodiacSign.CANCER: VashyaClass.JALACHARA,
    ZodiacSign.LEO: VashyaClass.VANACHARA,
    ZodiacSign.VIRGO: VashyaClass.MANAVA,
    ZodiacSign.LIBRA: VashyaClass.MANAVA,
    ZodiacSign.SCORPIO: VashyaClass.KEETA,
    ZodiacSign.AQUARIUS: VashyaClass.MANAVA,
    ZodiacSign.PISCES: VashyaClass.JALACHARA,
}


def vashya_class(sign: ZodiacSign, sign_degrees: float) -> VashyaClass:
    """Vashya class of a Moon placement (handles the Sag/Cap half-sign split)."""
    if sign is ZodiacSign.SAGITTARIUS:
        return VashyaClass.MANAVA if sign_degrees < 15.0 else VashyaClass.CHATUSHPADA
    if sign is ZodiacSign.CAPRICORN:
        return VashyaClass.CHATUSHPADA if sign_degrees < 15.0 else VashyaClass.JALACHARA
    return _VASHYA_WHOLE_SIGN[sign]


_VASHYA_ORDER: Final[tuple[VashyaClass, ...]] = (
    VashyaClass.CHATUSHPADA,
    VashyaClass.MANAVA,
    VashyaClass.JALACHARA,
    VashyaClass.VANACHARA,
    VashyaClass.KEETA,
)

# Rows = groom's class, columns = bride's class (order: _VASHYA_ORDER).
_VASHYA_MATRIX: Final[tuple[tuple[float, ...], ...]] = (
    (2.0, 1.0, 1.0, 0.0, 1.0),  # groom chatushpada
    (1.0, 2.0, 0.5, 0.0, 1.0),  # groom manava
    (1.0, 0.5, 2.0, 0.0, 1.0),  # groom jalachara
    (0.0, 0.0, 0.0, 2.0, 0.0),  # groom vanachara
    (1.0, 1.0, 1.0, 0.0, 2.0),  # groom keeta
)

VASHYA_POINTS: Final[dict[tuple[VashyaClass, VashyaClass], float]] = {
    (groom, bride): _VASHYA_MATRIX[gi][bi]
    for gi, groom in enumerate(_VASHYA_ORDER)
    for bi, bride in enumerate(_VASHYA_ORDER)
}

# --- Tara (3 points) ---------------------------------------------------------

TARA_SOURCE: Final[str] = (
    "Tara (Dina) kuta: count nakshatras inclusively between the Moons, mod 9; "
    "remainders 3 (Vipat), 5 (Pratyari) and 7 (Vadha) are malefic. Each "
    "direction contributes 1.5 of the 3 points. B.V. Raman, 'Muhurtha', Kuta "
    "agreement; standard panchanga Melapaka scoring."
)

# Tara names by (count mod 9), with remainder 0 read as 9 (Ati-Maitra).
TARA_NAMES: Final[tuple[str, ...]] = (
    "Janma",
    "Sampat",
    "Vipat",
    "Kshema",
    "Pratyari",
    "Sadhaka",
    "Vadha",
    "Maitra",
    "Ati-Maitra",
)

TARA_MALEFIC: Final[frozenset[int]] = frozenset({3, 5, 7})

# --- Yoni (4 points) ---------------------------------------------------------

YONI_SOURCE: Final[str] = (
    "Yoni kuta: each nakshatra's animal (and sex) per the classical yoni "
    "table; scored by the standard 14x14 points matrix (same animal 4, sworn-"
    "enemy pair 0). B.V. Raman, 'Muhurtha', Kuta agreement; matrix as "
    "tabulated in standard panchanga Melapaka practice."
)

# Indexed by nakshatra (0 = Ashwini ... 26 = Revati), aligned with
# ``NAKSHATRA_NAMES``; the (animal, sex) pairing is the classical table.
YONI_OF_NAKSHATRA: Final[tuple[tuple[YoniAnimal, YoniSex], ...]] = (
    (YoniAnimal.HORSE, YoniSex.MALE),  # Ashwini
    (YoniAnimal.ELEPHANT, YoniSex.MALE),  # Bharani
    (YoniAnimal.GOAT, YoniSex.FEMALE),  # Krittika
    (YoniAnimal.SERPENT, YoniSex.MALE),  # Rohini
    (YoniAnimal.SERPENT, YoniSex.FEMALE),  # Mrigashira
    (YoniAnimal.DOG, YoniSex.FEMALE),  # Ardra
    (YoniAnimal.CAT, YoniSex.MALE),  # Punarvasu
    (YoniAnimal.GOAT, YoniSex.MALE),  # Pushya
    (YoniAnimal.CAT, YoniSex.FEMALE),  # Ashlesha
    (YoniAnimal.RAT, YoniSex.MALE),  # Magha
    (YoniAnimal.RAT, YoniSex.FEMALE),  # Purva Phalguni
    (YoniAnimal.COW, YoniSex.MALE),  # Uttara Phalguni
    (YoniAnimal.BUFFALO, YoniSex.FEMALE),  # Hasta
    (YoniAnimal.TIGER, YoniSex.FEMALE),  # Chitra
    (YoniAnimal.BUFFALO, YoniSex.MALE),  # Swati
    (YoniAnimal.TIGER, YoniSex.MALE),  # Vishakha
    (YoniAnimal.DEER, YoniSex.FEMALE),  # Anuradha
    (YoniAnimal.DEER, YoniSex.MALE),  # Jyeshtha
    (YoniAnimal.DOG, YoniSex.MALE),  # Mula
    (YoniAnimal.MONKEY, YoniSex.MALE),  # Purva Ashadha
    (YoniAnimal.MONGOOSE, YoniSex.MALE),  # Uttara Ashadha
    (YoniAnimal.MONKEY, YoniSex.FEMALE),  # Shravana
    (YoniAnimal.LION, YoniSex.FEMALE),  # Dhanishta
    (YoniAnimal.HORSE, YoniSex.FEMALE),  # Shatabhisha
    (YoniAnimal.LION, YoniSex.MALE),  # Purva Bhadrapada
    (YoniAnimal.COW, YoniSex.FEMALE),  # Uttara Bhadrapada
    (YoniAnimal.ELEPHANT, YoniSex.FEMALE),  # Revati
)

_YONI_ORDER: Final[tuple[YoniAnimal, ...]] = (
    YoniAnimal.HORSE,
    YoniAnimal.ELEPHANT,
    YoniAnimal.GOAT,
    YoniAnimal.SERPENT,
    YoniAnimal.DOG,
    YoniAnimal.CAT,
    YoniAnimal.RAT,
    YoniAnimal.COW,
    YoniAnimal.BUFFALO,
    YoniAnimal.TIGER,
    YoniAnimal.DEER,
    YoniAnimal.MONKEY,
    YoniAnimal.MONGOOSE,
    YoniAnimal.LION,
)

# Symmetric 14x14 matrix (rows/cols: _YONI_ORDER). Diagonal = 4 (same yoni);
# the seven classical sworn-enemy pairs score 0: horse-buffalo, elephant-lion,
# goat-monkey, serpent-mongoose, dog-deer, cat-rat, cow-tiger.
_YONI_MATRIX: Final[tuple[tuple[int, ...], ...]] = (
    (4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1),  # horse
    (2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0),  # elephant
    (2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1),  # goat
    (3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2),  # serpent
    (2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1),  # dog
    (2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1),  # cat
    (2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2),  # rat
    (1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1),  # cow
    (0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1),  # buffalo
    (1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1),  # tiger
    (3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 3, 2, 1),  # deer
    (3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 3, 4, 3, 2),  # monkey
    (2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2),  # mongoose
    (1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4),  # lion
)

YONI_POINTS: Final[dict[tuple[YoniAnimal, YoniAnimal], int]] = {
    (row, col): _YONI_MATRIX[ri][ci]
    for ri, row in enumerate(_YONI_ORDER)
    for ci, col in enumerate(_YONI_ORDER)
}

# --- Graha Maitri (5 points) -------------------------------------------------

GRAHA_MAITRI_SOURCE: Final[str] = (
    "Graha Maitri kuta: natural (naisargika) relationship between the two "
    "Moon-sign lords per the BPHS maitri table (reused from "
    "almamesh.strength.friendship); scored friend/friend 5, friend/neutral 4, "
    "neutral/neutral 3, friend/enemy 1, neutral/enemy 0.5, enemy/enemy 0 "
    "(same lord counts as friend/friend). B.V. Raman, 'Muhurtha', Kuta "
    "agreement; standard panchanga Melapaka scoring."
)

# Keyed by the UNORDERED pair of relations {x's view of y, y's view of x},
# encoded as a sorted (friend<neutral<enemy is encoded 0<1<2) tuple.
GRAHA_MAITRI_POINTS: Final[dict[tuple[int, int], float]] = {
    (0, 0): 5.0,  # friend / friend
    (0, 1): 4.0,  # friend / neutral
    (1, 1): 3.0,  # neutral / neutral
    (0, 2): 1.0,  # friend / enemy
    (1, 2): 0.5,  # neutral / enemy
    (2, 2): 0.0,  # enemy / enemy
}

# --- Gana (6 points) ---------------------------------------------------------

GANA_SOURCE: Final[str] = (
    "Gana kuta: nakshatra gana classes (deva/manushya/rakshasa) scored by the "
    "standard groom-x-bride matrix (same gana 6; deva groom + manushya bride "
    "6; manushya groom + deva bride 5; rakshasa groom + deva bride 1; "
    "deva/manushya with rakshasa otherwise 0). B.V. Raman, 'Muhurtha', Kuta "
    "agreement; matrix as tabulated in standard panchanga Melapaka practice."
)

# Indexed by nakshatra (0 = Ashwini ... 26 = Revati).
GANA_OF_NAKSHATRA: Final[tuple[Gana, ...]] = (
    Gana.DEVA,  # Ashwini
    Gana.MANUSHYA,  # Bharani
    Gana.RAKSHASA,  # Krittika
    Gana.MANUSHYA,  # Rohini
    Gana.DEVA,  # Mrigashira
    Gana.MANUSHYA,  # Ardra
    Gana.DEVA,  # Punarvasu
    Gana.DEVA,  # Pushya
    Gana.RAKSHASA,  # Ashlesha
    Gana.RAKSHASA,  # Magha
    Gana.MANUSHYA,  # Purva Phalguni
    Gana.MANUSHYA,  # Uttara Phalguni
    Gana.DEVA,  # Hasta
    Gana.RAKSHASA,  # Chitra
    Gana.DEVA,  # Swati
    Gana.RAKSHASA,  # Vishakha
    Gana.DEVA,  # Anuradha
    Gana.RAKSHASA,  # Jyeshtha
    Gana.RAKSHASA,  # Mula
    Gana.MANUSHYA,  # Purva Ashadha
    Gana.MANUSHYA,  # Uttara Ashadha
    Gana.DEVA,  # Shravana
    Gana.RAKSHASA,  # Dhanishta
    Gana.RAKSHASA,  # Shatabhisha
    Gana.MANUSHYA,  # Purva Bhadrapada
    Gana.MANUSHYA,  # Uttara Bhadrapada
    Gana.DEVA,  # Revati
)

# (groom gana, bride gana) -> points.
GANA_POINTS: Final[dict[tuple[Gana, Gana], float]] = {
    (Gana.DEVA, Gana.DEVA): 6.0,
    (Gana.DEVA, Gana.MANUSHYA): 6.0,
    (Gana.DEVA, Gana.RAKSHASA): 0.0,
    (Gana.MANUSHYA, Gana.DEVA): 5.0,
    (Gana.MANUSHYA, Gana.MANUSHYA): 6.0,
    (Gana.MANUSHYA, Gana.RAKSHASA): 0.0,
    (Gana.RAKSHASA, Gana.DEVA): 1.0,
    (Gana.RAKSHASA, Gana.MANUSHYA): 0.0,
    (Gana.RAKSHASA, Gana.RAKSHASA): 6.0,
}

# --- Bhakoot (7 points) ------------------------------------------------------

BHAKOOT_SOURCE: Final[str] = (
    "Bhakoot (Rasi) kuta: mutual Moon-sign positions; the complementary pairs "
    "2/12 (dwirdwadasha), 5/9 (nava-pancham) and 6/8 (shadashtaka) are dosha "
    "(0 points), all other placements earn the full 7. B.V. Raman, 'Muhurtha',"
    " Kuta agreement; standard panchanga Melapaka practice."
)

BHAKOOT_CANCEL_SOURCE: Final[str] = (
    "Bhakoot dosha cancellation: the dosha stands cancelled when the two "
    "Moon-sign lords are the same graha or mutual natural friends (BPHS "
    "naisargika maitri). Standard Melapaka exception, cf. B.V. Raman, "
    "'Muhurtha', Kuta agreement."
)

# The mutual-count pairs (smaller, larger) that constitute Bhakoot dosha.
BHAKOOT_DOSHA_PAIRS: Final[frozenset[tuple[int, int]]] = frozenset({(2, 12), (5, 9), (6, 8)})

# --- Nadi (8 points) ---------------------------------------------------------

NADI_SOURCE: Final[str] = (
    "Nadi kuta: nakshatra nadi classes (adi/madhya/antya); different nadis "
    "earn the full 8 points, the same nadi is Nadi dosha (0 points) — the "
    "gravest Melapaka dosha. B.V. Raman, 'Muhurtha', Kuta agreement; standard "
    "panchanga Melapaka table."
)

NADI_CANCEL_SOURCE: Final[str] = (
    "Nadi dosha cancellation (chart-computable Melapaka exceptions, standard "
    "panchanga practice): same nakshatra but different padas; same Moon sign "
    "but different nakshatras; same nakshatra but different Moon signs."
)

# Indexed by nakshatra (0 = Ashwini ... 26 = Revati).
NADI_OF_NAKSHATRA: Final[tuple[Nadi, ...]] = (
    Nadi.ADI,  # Ashwini
    Nadi.MADHYA,  # Bharani
    Nadi.ANTYA,  # Krittika
    Nadi.ANTYA,  # Rohini
    Nadi.MADHYA,  # Mrigashira
    Nadi.ADI,  # Ardra
    Nadi.ADI,  # Punarvasu
    Nadi.MADHYA,  # Pushya
    Nadi.ANTYA,  # Ashlesha
    Nadi.ANTYA,  # Magha
    Nadi.MADHYA,  # Purva Phalguni
    Nadi.ADI,  # Uttara Phalguni
    Nadi.ADI,  # Hasta
    Nadi.MADHYA,  # Chitra
    Nadi.ANTYA,  # Swati
    Nadi.ANTYA,  # Vishakha
    Nadi.MADHYA,  # Anuradha
    Nadi.ADI,  # Jyeshtha
    Nadi.ADI,  # Mula
    Nadi.MADHYA,  # Purva Ashadha
    Nadi.ANTYA,  # Uttara Ashadha
    Nadi.ANTYA,  # Shravana
    Nadi.MADHYA,  # Dhanishta
    Nadi.ADI,  # Shatabhisha
    Nadi.ADI,  # Purva Bhadrapada
    Nadi.MADHYA,  # Uttara Bhadrapada
    Nadi.ANTYA,  # Revati
)

# --- Total bands (classical convention) ---------------------------------------

BAND_SOURCE: Final[str] = (
    "Classical convention (panchanga practice): below 18 of 36 the match is "
    "traditionally not recommended; 18-24 average; 25-32 good; 33-36 "
    "excellent. A label, not a verdict."
)

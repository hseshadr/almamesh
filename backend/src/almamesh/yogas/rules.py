"""Classical yoga rules — audited, cited, fully traced.

Every rule here implements a classical formation condition faithfully or does
not exist: rules from the previous YAML catalog whose classical definitions
could not be implemented faithfully were DELETED rather than approximated
(e.g. Pushkala, Lakshmi and Sankha hinge on an undefined "strong lagna lord";
Mahabhagya needs day-birth + gender; "Kendra-Trikona Balance" and
"Dwi-Panchaka" have no classical source; generic two-planet conjunctions like
"Budha-Sani" are not named classical yogas). The Mars-Jupiter conjunction the
old catalog mislabeled "Kahal Yoga" is correctly Guru-Mangala; Kahala proper
(a 4th/9th-lord yoga whose "strong lagna lord" clause is judgment-dependent)
is intentionally not implemented.

Citations are abbreviated as:
- BPHS: Brihat Parashara Hora Shastra (adhyaya named inline)
- Phaladeepika: Mantreswara's Phaladeepika
- UK: Uttara Kalamrita
- 300IC: B.V. Raman, Three Hundred Important Combinations
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from itertools import combinations, product

from almamesh.constants.astrology import (
    EXALTATION_SIGN,
    SIGN_LORDS,
    Dignity,
    PlanetName,
    ZodiacSign,
)
from almamesh.schemas.astrology import (
    PlanetPosition,
    SiderealContext,
    YogaData,
    YogaFormationRule,
)
from almamesh.yogas.factors import factors_for, grade_for
from almamesh.yogas.lordship import (
    DUSTHANA_HOUSES,
    KENDRA_HOUSES,
    TRIKONA_HOUSES,
    house_lord,
    house_of_sign,
    houses_ruled,
    sign_of_house,
    yogakaraka_planet,
)

_SUN = PlanetName.SUN
_MOON = PlanetName.MOON
_MARS = PlanetName.MARS
_MERCURY = PlanetName.MERCURY
_JUPITER = PlanetName.JUPITER
_VENUS = PlanetName.VENUS
_SATURN = PlanetName.SATURN
_NODES = (PlanetName.RAHU, PlanetName.KETU)

_CLASSICAL_SEVEN = (_SUN, _MOON, _MARS, _MERCURY, _JUPITER, _VENUS, _SATURN)

_SRC_MAHAPURUSHA = "BPHS, Pancha-Mahapurusha-yoga adhyaya; Phaladeepika 6.1-2"
_SRC_GAJAKESARI = "BPHS, Chandra-yoga adhyaya (Gajakesari)"
_SRC_CHANDRA_QUARTET = "BPHS, Chandra-yoga adhyaya (Sunapha/Anapha/Durudhara/Kemadruma)"
_SRC_SURYA_TRIO = "BPHS, Surya-yoga adhyaya (Vesi/Vasi/Ubhayachari)"
_SRC_ADHI = "BPHS, Chandra-yoga adhyaya (Adhi yoga)"
_SRC_AMALA = "Phaladeepika (Amala yoga); benefic/malefic nature per BPHS ch. 3"
_SRC_KARTARI = "Phaladeepika (Shubha/Papa Kartari)"
_SRC_RAJA = "BPHS, Raja-yoga adhyaya: kendra-lord and trikona-lord in sambandha"
_SRC_YOGAKARAKA = "BPHS, Yogakaraka adhyaya: one graha lording a kendra and a trikona"
_SRC_NEECHA_BHANGA = "Neecha-bhanga conditions per Phaladeepika and Jataka Parijata"
_SRC_VIPAREETA = "UK: Vipareeta Raja Yoga (Harsha/Sarala/Vimala - dusthana lords in dusthanas)"
_SRC_PARIVARTANA = "Parivartana (exchange) sambandha; Maha/Khala/Dainya per the UK tradition"
_SRC_DHANA = "BPHS, Dhana-yoga adhyaya: associations of the 2nd/5th/9th/11th lords"
_SRC_KALA_SARPA = "Traditional dosha (post-BPHS nibandha): all grahas hemmed by the nodal axis"
_SRC_CHATUSSAGARA = "300IC (Chatussagara: all four kendras occupied)"
_SRC_SARASWATI = "Phaladeepika (Saraswati yoga)"
_SRC_CONJUNCTION = "Classical two-graha combination (Saravali; 300IC)"

_ORDINALS = {1: "1st", 2: "2nd", 3: "3rd"}

# Parashari graha drishti by sign distance (BPHS, Drishti adhyaya): every
# graha aspects the 7th from itself; Mars adds 4/8, Jupiter 5/9, Saturn 3/10.
_ASPECT_DISTANCES: dict[PlanetName, frozenset[int]] = {
    _MARS: frozenset({4, 7, 8}),
    _JUPITER: frozenset({5, 7, 9}),
    _SATURN: frozenset({3, 7, 10}),
}
_DEFAULT_ASPECTS = frozenset({7})


def _ordinal(house: int) -> str:
    return _ORDINALS.get(house, f"{house}th")


def _sign_distance(from_sign: ZodiacSign, to_sign: ZodiacSign) -> int:
    """1-based inclusive count from one sign to another (1..12)."""
    return house_of_sign(to_sign, from_sign)


def _aspects(a: PlanetPosition, b: PlanetPosition) -> bool:
    """Whole-sign Parashari graha drishti: does ``a`` aspect ``b``'s sign?"""
    distance = _sign_distance(a.sign, b.sign)
    return distance in _ASPECT_DISTANCES.get(a.name, _DEFAULT_ASPECTS)


def _positions(chart: SiderealContext, names: Iterable[PlanetName]) -> list[PlanetPosition]:
    return [chart.planets[name] for name in names]


def _make_yoga(
    chart: SiderealContext,
    *,
    name: str,
    display_name: str,
    category: str,
    description: str,
    effects: str,
    planets: list[PlanetName],
    houses: list[int],
    formation_rules: list[YogaFormationRule],
) -> YogaData:
    """Assemble a fully traced YogaData (grade + factors from real positions)."""
    ordered_planets = sorted(set(planets), key=lambda p: p.value)
    ordered_houses = sorted(set(houses))
    positions = _positions(chart, ordered_planets)
    signature_houses = "_".join(f"h{h}" for h in ordered_houses)
    return YogaData(
        name=name,
        display_name=display_name,
        category=category,
        description=description,
        effects=effects,
        grade=grade_for(positions),
        strength_factors=factors_for(positions),
        planets_involved=ordered_planets,
        houses_involved=ordered_houses,
        planetary_signature="_".join(p.value for p in ordered_planets) + "_" + signature_houses,
        formation_rules=formation_rules,
    )


def _formation(
    rule: str,
    description: str,
    source: str,
    planets: list[PlanetName],
    houses: list[int],
) -> YogaFormationRule:
    return YogaFormationRule(
        rule=rule,
        description=description,
        source=source,
        planets=sorted(set(planets), key=lambda p: p.value),
        houses=sorted(set(houses)),
    )


# --- Natural benefics / malefics (BPHS ch. 3, graha svabhava) ---------------


def _moon_is_waxing(chart: SiderealContext) -> bool:
    """Waxing when the Moon leads the Sun by less than 180 deg."""
    elongation = (chart.planets[_MOON].longitude - chart.planets[_SUN].longitude) % 360.0
    return elongation < 180.0


def _natural_malefics(chart: SiderealContext) -> set[PlanetName]:
    """Sun, Mars, Saturn, the nodes, the waning Moon, and afflicted Mercury."""
    malefics: set[PlanetName] = {_SUN, _MARS, _SATURN, *_NODES}
    if not _moon_is_waxing(chart):
        malefics.add(_MOON)
    mercury_sign = chart.planets[_MERCURY].sign
    if any(chart.planets[m].sign == mercury_sign for m in malefics if m != _MERCURY):
        malefics.add(_MERCURY)
    return malefics


def _natural_benefics(chart: SiderealContext) -> set[PlanetName]:
    return set(PlanetName) - _natural_malefics(chart)


def _occupants_of_sign(
    chart: SiderealContext,
    sign: ZodiacSign,
    include: Iterable[PlanetName],
) -> list[PlanetPosition]:
    return [chart.planets[n] for n in include if chart.planets[n].sign == sign]


# --- Pancha Mahapurusha ------------------------------------------------------

_MAHAPURUSHA_NAMES: dict[PlanetName, str] = {
    _MARS: "Ruchaka Yoga",
    _MERCURY: "Bhadra Yoga",
    _JUPITER: "Hamsa Yoga",
    _VENUS: "Malavya Yoga",
    _SATURN: "Sasa Yoga",
}

_MAHAPURUSHA_EFFECTS: dict[PlanetName, str] = {
    _MARS: "Courage, command and martial accomplishment",
    _MERCURY: "Intellect, learning and eloquence",
    _JUPITER: "Wisdom, virtue and respect",
    _VENUS: "Refinement, comforts and artistic grace",
    _SATURN: "Discipline, authority and endurance",
}


def rule_pancha_mahapurusha(chart: SiderealContext) -> list[YogaData]:
    """Planet in a kendra FROM LAGNA in own or exaltation sign (BPHS)."""
    out: list[YogaData] = []
    for planet, yoga_name in _MAHAPURUSHA_NAMES.items():
        pos = chart.planets[planet]
        if pos.house not in KENDRA_HOUSES or pos.dignity not in (Dignity.OWN, Dignity.EXALTED):
            continue
        out.append(_mahapurusha_yoga(chart, yoga_name, pos))
    return out


def _mahapurusha_yoga(chart: SiderealContext, yoga_name: str, pos: PlanetPosition) -> YogaData:
    where = f"{pos.name.value.capitalize()} {pos.dignity.value} in the {_ordinal(pos.house)}"
    return _make_yoga(
        chart,
        name=yoga_name,
        display_name=f"{yoga_name} ({where})",
        category="mahapurusha",
        description="Pancha Mahapurusha: the graha in a kendra from lagna in own/exaltation sign",
        effects=_MAHAPURUSHA_EFFECTS[pos.name],
        planets=[pos.name],
        houses=[pos.house],
        formation_rules=[
            _formation(
                "mahapurusha.kendra_dignity",
                f"{where} (kendra from lagna, own/exaltation sign)",
                _SRC_MAHAPURUSHA,
                [pos.name],
                [pos.house],
            )
        ],
    )


# --- Gajakesari --------------------------------------------------------------


def rule_gajakesari(chart: SiderealContext) -> list[YogaData]:
    """Jupiter in a kendra (1/4/7/10) counted from the Moon (BPHS)."""
    moon, jupiter = chart.planets[_MOON], chart.planets[_JUPITER]
    distance = _sign_distance(moon.sign, jupiter.sign)
    if distance not in (1, 4, 7, 10):
        return []
    description = f"Jupiter in the {_ordinal(distance)} from the Moon"
    return [
        _make_yoga(
            chart,
            name="Gajakesari Yoga",
            display_name=f"Gajakesari Yoga ({description})",
            category="auspicious",
            description="Jupiter in a kendra from the Moon",
            effects="Lasting reputation, intelligence and virtuous standing",
            planets=[_MOON, _JUPITER],
            houses=[moon.house, jupiter.house],
            formation_rules=[
                _formation(
                    "gajakesari.jupiter_kendra_from_moon",
                    description,
                    _SRC_GAJAKESARI,
                    [_MOON, _JUPITER],
                    [moon.house, jupiter.house],
                )
            ],
        )
    ]


# --- Named two-graha conjunctions -------------------------------------------


def _conjunction_yoga(
    chart: SiderealContext,
    yoga_name: str,
    rule_id: str,
    a: PlanetName,
    b: PlanetName,
    effects: str,
) -> list[YogaData]:
    pos_a, pos_b = chart.planets[a], chart.planets[b]
    if pos_a.sign != pos_b.sign:
        return []
    description = (
        f"{a.value.capitalize()} and {b.value.capitalize()} conjunct in "
        f"{pos_a.sign.value} (the {_ordinal(pos_a.house)})"
    )
    return [
        _make_yoga(
            chart,
            name=yoga_name,
            display_name=f"{yoga_name} ({description})",
            category="auspicious",
            description=f"{a.value.capitalize()}-{b.value.capitalize()} conjunction",
            effects=effects,
            planets=[a, b],
            houses=[pos_a.house],
            formation_rules=[
                _formation(rule_id, description, _SRC_CONJUNCTION, [a, b], [pos_a.house])
            ],
        )
    ]


def rule_budha_aditya(chart: SiderealContext) -> list[YogaData]:
    """Sun-Mercury conjunction (classical Budha-Aditya combination)."""
    return _conjunction_yoga(
        chart,
        "Budha-Aditya Yoga",
        "budha_aditya.conjunction",
        _SUN,
        _MERCURY,
        "Sharp intellect, administrative and communicative skill",
    )


def rule_chandra_mangala(chart: SiderealContext) -> list[YogaData]:
    """Moon-Mars conjunction (classical Chandra-Mangala combination)."""
    return _conjunction_yoga(
        chart,
        "Chandra-Mangala Yoga",
        "chandra_mangala.conjunction",
        _MOON,
        _MARS,
        "Earning drive and material enterprise",
    )


def rule_guru_mangala(chart: SiderealContext) -> list[YogaData]:
    """Mars-Jupiter conjunction — classically Guru-Mangala (NOT 'Kahal')."""
    return _conjunction_yoga(
        chart,
        "Guru-Mangala Yoga",
        "guru_mangala.conjunction",
        _MARS,
        _JUPITER,
        "Energetic righteousness: courage guided by wisdom",
    )


# --- Chandra yogas (Sunapha / Anapha / Durudhara / Kemadruma) ----------------

_CHANDRA_COUNTABLE = (_MARS, _MERCURY, _JUPITER, _VENUS, _SATURN)


def _chandra_quartet_emission(
    second: list[PlanetPosition],
    twelfth: list[PlanetPosition],
) -> tuple[str, str, str, list[PlanetPosition]]:
    if second and twelfth:
        return (
            "Durudhara Yoga",
            "chandra.durudhara",
            "Planets (other than the Sun) on both sides of the Moon",
            second + twelfth,
        )
    if second:
        return (
            "Sunapha Yoga",
            "chandra.sunapha",
            "A planet (other than the Sun) in the 2nd from the Moon",
            second,
        )
    if twelfth:
        return (
            "Anapha Yoga",
            "chandra.anapha",
            "A planet (other than the Sun) in the 12th from the Moon",
            twelfth,
        )
    return (
        "Kemadruma Yoga",
        "chandra.kemadruma",
        "No planet (other than the Sun) in the 2nd or 12th from the Moon",
        [],
    )


def rule_chandra_yogas(chart: SiderealContext) -> list[YogaData]:
    """Occupancy of the 2nd/12th from the Moon by non-Sun grahas (BPHS)."""
    moon = chart.planets[_MOON]
    second = _occupants_of_sign(chart, sign_of_house(2, moon.sign), _CHANDRA_COUNTABLE)
    twelfth = _occupants_of_sign(chart, sign_of_house(12, moon.sign), _CHANDRA_COUNTABLE)
    name, rule_id, description, others = _chandra_quartet_emission(second, twelfth)
    effects = {
        "Sunapha Yoga": "Self-earned prosperity and standing",
        "Anapha Yoga": "Health, character and renown",
        "Durudhara Yoga": "Resources and supportive company on both sides",
        "Kemadruma Yoga": "An unsupported Moon: struggles unless cancelled elsewhere",
    }[name]
    planets = [_MOON] + [p.name for p in others]
    houses = [moon.house] + [p.house for p in others]
    category = "dosha" if name == "Kemadruma Yoga" else "chandra"
    return [
        _make_yoga(
            chart,
            name=name,
            display_name=f"{name} ({description})",
            category=category,
            description=description,
            effects=effects,
            planets=planets,
            houses=houses,
            formation_rules=[
                _formation(rule_id, description, _SRC_CHANDRA_QUARTET, planets, houses)
            ],
        )
    ]


# --- Surya yogas (Vesi / Vasi / Ubhayachari) ---------------------------------

_SURYA_COUNTABLE = (_MARS, _MERCURY, _JUPITER, _VENUS, _SATURN)


def rule_surya_yogas(chart: SiderealContext) -> list[YogaData]:
    """Occupancy of the 2nd/12th from the Sun by non-Moon grahas (BPHS)."""
    sun = chart.planets[_SUN]
    second = _occupants_of_sign(chart, sign_of_house(2, sun.sign), _SURYA_COUNTABLE)
    twelfth = _occupants_of_sign(chart, sign_of_house(12, sun.sign), _SURYA_COUNTABLE)
    if second and twelfth:
        spec = ("Ubhayachari Yoga", "surya.ubhayachari", second + twelfth)
    elif second:
        spec = ("Vesi Yoga", "surya.vesi", second)
    elif twelfth:
        spec = ("Vasi Yoga", "surya.vasi", twelfth)
    else:
        return []
    return [_surya_yoga(chart, sun, *spec)]


def _surya_yoga(
    chart: SiderealContext,
    sun: PlanetPosition,
    name: str,
    rule_id: str,
    others: list[PlanetPosition],
) -> YogaData:
    sides = {"surya.vesi": "2nd", "surya.vasi": "12th", "surya.ubhayachari": "2nd and 12th"}
    description = f"Planets (other than the Moon) in the {sides[rule_id]} from the Sun"
    planets = [_SUN] + [p.name for p in others]
    houses = [sun.house] + [p.house for p in others]
    return _make_yoga(
        chart,
        name=name,
        display_name=f"{name} ({description})",
        category="surya",
        description=description,
        effects="Balanced fortunes, eloquence and supportive circumstances",
        planets=planets,
        houses=houses,
        formation_rules=[_formation(rule_id, description, _SRC_SURYA_TRIO, planets, houses)],
    )


# --- Adhi Yoga ---------------------------------------------------------------


def rule_adhi(chart: SiderealContext) -> list[YogaData]:
    """All three natural benefics (Mer/Jup/Ven) in the 6th/7th/8th from Moon."""
    moon = chart.planets[_MOON]
    trio = (_MERCURY, _JUPITER, _VENUS)
    distances = {p: _sign_distance(moon.sign, chart.planets[p].sign) for p in trio}
    if not all(d in (6, 7, 8) for d in distances.values()):
        return []
    description = "Mercury, Jupiter and Venus all in the 6th/7th/8th from the Moon"
    planets = list(trio)
    houses = [chart.planets[p].house for p in trio]
    return [
        _make_yoga(
            chart,
            name="Adhi Yoga",
            display_name=f"Adhi Yoga ({description})",
            category="special",
            description=description,
            effects="Leadership, prosperity and the defeat of opposition",
            planets=planets,
            houses=houses,
            formation_rules=[
                _formation("adhi.benefics_678_from_moon", description, _SRC_ADHI, planets, houses)
            ],
        )
    ]


# --- Amala Yoga --------------------------------------------------------------


def _benefic_only_tenth(
    chart: SiderealContext, benefics: set[PlanetName], ref_sign: ZodiacSign
) -> list[PlanetPosition]:
    """Occupants of the 10th from ``ref_sign`` IF all are benefic, else []."""
    occupants = _occupants_of_sign(chart, sign_of_house(10, ref_sign), list(PlanetName))
    if occupants and _hemming_kind(occupants, benefics) is True:
        return occupants
    return []


def _amala_reference(
    chart: SiderealContext,
    benefics: set[PlanetName],
    ref_name: str,
    ref_sign: ZodiacSign,
) -> tuple[YogaFormationRule, list[PlanetPosition]] | None:
    """The Amala formation for one reference (Lagna/Moon), or None."""
    occupants = _benefic_only_tenth(chart, benefics, ref_sign)
    if not occupants:
        return None
    formation = _formation(
        "amala.benefic_only_10th",
        f"Only benefics in the 10th from {ref_name}",
        _SRC_AMALA,
        [p.name for p in occupants],
        [p.house for p in occupants],
    )
    return formation, occupants


def _amala_yoga(
    chart: SiderealContext, fired: list[YogaFormationRule], involved: list[PlanetPosition]
) -> YogaData:
    return _make_yoga(
        chart,
        name="Amala Yoga",
        display_name="Amala Yoga (a stainless 10th: benefics only)",
        category="auspicious",
        description="The 10th from Lagna or Moon occupied by benefics alone",
        effects="Lasting, unblemished reputation through righteous deeds",
        planets=[p.name for p in involved],
        houses=[p.house for p in involved],
        formation_rules=fired,
    )


def rule_amala(chart: SiderealContext) -> list[YogaData]:
    """Only natural benefics occupying the 10th from Lagna or from the Moon."""
    benefics = _natural_benefics(chart)
    references = (("Lagna", chart.lagna.sign), ("Moon", chart.planets[_MOON].sign))
    fired: list[YogaFormationRule] = []
    involved: list[PlanetPosition] = []
    for ref_name, ref_sign in references:
        if (result := _amala_reference(chart, benefics, ref_name, ref_sign)) is not None:
            fired.append(result[0])
            involved.extend(result[1])
    if not fired:
        return []
    return [_amala_yoga(chart, fired, involved)]


# --- Kartari (hemming) yogas -------------------------------------------------


def _hemming_kind(occupants: list[PlanetPosition], benefics: set[PlanetName]) -> bool | None:
    """True = purely benefic hemming, False = purely malefic, None = mixed."""
    if all(p.name in benefics for p in occupants):
        return True
    if all(p.name not in benefics for p in occupants):
        return False
    return None


def rule_kartari(chart: SiderealContext) -> list[YogaData]:
    """Lagna hemmed by pure benefics (Shubha) or pure malefics (Papa)."""
    twelfth = _occupants_of_sign(chart, sign_of_house(12, chart.lagna.sign), list(PlanetName))
    second = _occupants_of_sign(chart, sign_of_house(2, chart.lagna.sign), list(PlanetName))
    if not twelfth or not second:
        return []
    kind = _hemming_kind(twelfth + second, _natural_benefics(chart))
    if kind is None:
        return []
    return [_kartari_yoga(chart, twelfth + second, shubha=kind)]


# (name, occupant kind, category, rule id, effects) for the two hemmings.
_KARTARI_SPECS: dict[bool, tuple[str, str, str, str, str]] = {
    True: (
        "Shubha Kartari Yoga",
        "benefics",
        "auspicious",
        "kartari.shubha",
        "Protection and support around the self",
    ),
    False: (
        "Papa Kartari Yoga",
        "malefics",
        "dosha",
        "kartari.papa",
        "Pressure and constraint around the self",
    ),
}


def _kartari_yoga(
    chart: SiderealContext, occupants: list[PlanetPosition], *, shubha: bool
) -> YogaData:
    name, kind, category, rule_id, effects = _KARTARI_SPECS[shubha]
    description = f"The lagna hemmed: only {kind} occupy the 12th and 2nd"
    planets = [p.name for p in occupants]
    return _make_yoga(
        chart,
        name=name,
        display_name=f"{name} ({description})",
        category=category,
        description=description,
        effects=effects,
        planets=planets,
        houses=[2, 12],
        formation_rules=[_formation(rule_id, description, _SRC_KARTARI, planets, [2, 12])],
    )


# --- Raja Yoga (kendra-lord + trikona-lord sambandha) ------------------------


def _in_exchange(a: PlanetPosition, b: PlanetPosition) -> bool:
    return SIGN_LORDS[a.sign] == b.name and SIGN_LORDS[b.sign] == a.name


def _in_mutual_aspect(a: PlanetPosition, b: PlanetPosition) -> bool:
    return _aspects(a, b) and _aspects(b, a)


def _sambandha(a: PlanetPosition, b: PlanetPosition) -> str | None:
    """Strongest classical relation between two grahas, or None."""
    if a.sign == b.sign:
        return "conjunction"
    if _in_exchange(a, b):
        return "exchange"
    if _in_mutual_aspect(a, b):
        return "mutual_aspect"
    return None


def _is_raja_pair(kendra: int, trikona: int, k_lord: PlanetName, t_lord: PlanetName) -> bool:
    # A graha never forms a sambandha with itself, and 1-1 is no pairing.
    return k_lord != t_lord and kendra != trikona


def _raja_pairs(chart: SiderealContext) -> list[tuple[PlanetName, PlanetName]]:
    """Distinct (kendra-lord, trikona-lord) planet pairs, deduped."""
    lagna = chart.lagna.sign
    pairs: list[tuple[PlanetName, PlanetName]] = []
    seen: set[frozenset[PlanetName]] = set()
    for kendra, trikona in product(sorted(KENDRA_HOUSES), sorted(TRIKONA_HOUSES)):
        k_lord, t_lord = house_lord(kendra, lagna), house_lord(trikona, lagna)
        key = frozenset({k_lord, t_lord})
        if _is_raja_pair(kendra, trikona, k_lord, t_lord) and key not in seen:
            seen.add(key)
            pairs.append((k_lord, t_lord))
    return pairs


def _raja_yoga(chart: SiderealContext, k_lord: PlanetName, t_lord: PlanetName) -> YogaData:
    lagna = chart.lagna.sign
    relation = _sambandha(chart.planets[k_lord], chart.planets[t_lord])
    ruled = set(houses_ruled(k_lord, lagna)) | set(houses_ruled(t_lord, lagna))
    houses = sorted(ruled & (KENDRA_HOUSES | TRIKONA_HOUSES))
    placement = sorted({chart.planets[k_lord].house, chart.planets[t_lord].house})
    description = (
        f"{k_lord.value.capitalize()} (kendra lord) and {t_lord.value.capitalize()} "
        f"(trikona lord) in {relation}"
    )
    return _make_yoga(
        chart,
        name="Raja Yoga",
        display_name=f"Raja Yoga ({description})",
        category="raja",
        description="A kendra lord and a trikona lord in sambandha",
        effects="Authority, rise and recognition",
        planets=[k_lord, t_lord],
        houses=houses + placement,
        formation_rules=[
            _formation(
                f"raja.kendra_trikona_{relation}",
                description,
                _SRC_RAJA,
                [k_lord, t_lord],
                houses + placement,
            )
        ],
    )


def rule_raja_kendra_trikona(chart: SiderealContext) -> list[YogaData]:
    """Kendra-lord + trikona-lord in conjunction/exchange/mutual aspect."""
    return [
        _raja_yoga(chart, k_lord, t_lord)
        for k_lord, t_lord in _raja_pairs(chart)
        if _sambandha(chart.planets[k_lord], chart.planets[t_lord]) is not None
    ]


# --- Yogakaraka --------------------------------------------------------------


def rule_yogakaraka(chart: SiderealContext) -> list[YogaData]:
    """The lagna's yogakaraka, emitted as a first-class cited flag."""
    planet = yogakaraka_planet(chart.lagna.sign)
    if planet is None:
        return []
    ruled = set(houses_ruled(planet, chart.lagna.sign))
    houses = sorted(ruled & frozenset({4, 5, 7, 9, 10}))
    description = (
        f"{planet.value.capitalize()} lords both a kendra and a trikona "
        f"({' and '.join(_ordinal(h) for h in houses)})"
    )
    return [
        _make_yoga(
            chart,
            name="Yogakaraka",
            display_name=f"{planet.value.capitalize()} is Yogakaraka ({description})",
            category="raja",
            description=description,
            effects="A single graha empowered to confer rank and fortune",
            planets=[planet],
            houses=houses,
            formation_rules=[
                _formation(
                    "yogakaraka.kendra_trikona_lord",
                    description,
                    _SRC_YOGAKARAKA,
                    [planet],
                    houses,
                )
            ],
        )
    ]


# --- Neecha Bhanga Raja Yoga -------------------------------------------------


def _in_kendra_from(chart: SiderealContext, pos: PlanetPosition) -> list[str]:
    """References (Lagna/Moon) from which ``pos`` sits in a kendra."""
    refs: list[str] = []
    if pos.house in KENDRA_HOUSES:
        refs.append("Lagna")
    if _sign_distance(chart.planets[_MOON].sign, pos.sign) in (1, 4, 7, 10):
        refs.append("Moon")
    return refs


def _bhanga_dispositor(chart: SiderealContext, deb: PlanetPosition) -> YogaFormationRule | None:
    dispositor = chart.planets[SIGN_LORDS[deb.sign]]
    refs = _in_kendra_from(chart, dispositor)
    if not refs:
        return None
    return _formation(
        "neecha_bhanga.dispositor_in_kendra",
        f"Dispositor {dispositor.name.value.capitalize()} of debilitated "
        f"{deb.name.value.capitalize()} is in a kendra ({_ordinal(dispositor.house)}) "
        f"from {' and '.join(refs)}",
        _SRC_NEECHA_BHANGA,
        [deb.name, dispositor.name],
        [deb.house, dispositor.house],
    )


def _bhanga_exaltation_lord(
    chart: SiderealContext, deb: PlanetPosition
) -> YogaFormationRule | None:
    occupant_name = next((p for p, sign in EXALTATION_SIGN.items() if sign == deb.sign), None)
    if occupant_name is None:
        return None
    occupant = chart.planets[occupant_name]
    refs = _in_kendra_from(chart, occupant)
    if not refs:
        return None
    return _formation(
        "neecha_bhanga.exaltation_lord_of_sign_in_kendra",
        f"{occupant.name.value.capitalize()} (exalted in {deb.sign.value}, the "
        f"debilitation sign) is in a kendra ({_ordinal(occupant.house)}) "
        f"from {' and '.join(refs)}",
        _SRC_NEECHA_BHANGA,
        [deb.name, occupant.name],
        [deb.house, occupant.house],
    )


def _is_exalted_companion(pos: PlanetPosition, deb: PlanetPosition) -> bool:
    return pos.name != deb.name and pos.sign == deb.sign and pos.dignity is Dignity.EXALTED


def _exalted_companions(chart: SiderealContext, deb: PlanetPosition) -> list[PlanetName]:
    return [p.name for p in _positions(chart, _CLASSICAL_SEVEN) if _is_exalted_companion(p, deb)]


def _bhanga_conjunct_exalted(
    chart: SiderealContext, deb: PlanetPosition
) -> YogaFormationRule | None:
    exalted = _exalted_companions(chart, deb)
    if not exalted:
        return None
    names = ", ".join(p.value.capitalize() for p in exalted)
    return _formation(
        "neecha_bhanga.conjunct_exalted_planet",
        f"Debilitated {deb.name.value.capitalize()} is conjunct exalted {names}",
        _SRC_NEECHA_BHANGA,
        [deb.name, *exalted],
        [deb.house],
    )


def _bhanga_conditions(chart: SiderealContext, deb: PlanetPosition) -> list[YogaFormationRule]:
    """All neecha-bhanga conditions that hold for one debilitated graha."""
    candidates = (
        _bhanga_dispositor(chart, deb),
        _bhanga_exaltation_lord(chart, deb),
        _bhanga_conjunct_exalted(chart, deb),
    )
    return [rule for rule in candidates if rule is not None]


def rule_neecha_bhanga(chart: SiderealContext) -> list[YogaData]:
    """Cancellation of debilitation — every fired condition traced explicitly."""
    out: list[YogaData] = []
    for planet in _CLASSICAL_SEVEN:
        deb = chart.planets[planet]
        if deb.dignity is not Dignity.DEBILITATED:
            continue
        if conditions := _bhanga_conditions(chart, deb):
            out.append(_neecha_bhanga_yoga(chart, deb, conditions))
    return out


def _neecha_bhanga_yoga(
    chart: SiderealContext, deb: PlanetPosition, conditions: list[YogaFormationRule]
) -> YogaData:
    planets = sorted({name for rule in conditions for name in rule.planets}, key=lambda p: p.value)
    houses = sorted({house for rule in conditions for house in rule.houses})
    return _make_yoga(
        chart,
        name="Neecha Bhanga Raja Yoga",
        display_name=(
            f"Neecha Bhanga Raja Yoga (debilitated {deb.name.value.capitalize()} cancelled: "
            f"{len(conditions)} condition(s))"
        ),
        category="raja",
        description=f"Debilitation of {deb.name.value.capitalize()} is cancelled",
        effects="Weakness transformed into eventual rise",
        planets=planets,
        houses=houses,
        formation_rules=conditions,
    )


# --- Vipareeta Raja Yoga -----------------------------------------------------

_VIPAREETA_SUBTYPES = ((6, "harsha", "Harsha"), (8, "sarala", "Sarala"), (12, "vimala", "Vimala"))


def rule_vipareeta(chart: SiderealContext) -> list[YogaData]:
    """Dusthana lords placed in dusthanas: Harsha/Sarala/Vimala (UK)."""
    out: list[YogaData] = []
    for house, rule_key, label in _VIPAREETA_SUBTYPES:
        lord = chart.planets[house_lord(house, chart.lagna.sign)]
        if lord.house not in DUSTHANA_HOUSES:
            continue
        out.append(_vipareeta_yoga(chart, house, rule_key, label, lord))
    return out


def _vipareeta_yoga(
    chart: SiderealContext, house: int, rule_key: str, label: str, lord: PlanetPosition
) -> YogaData:
    description = (
        f"{label}: the {_ordinal(house)} lord {lord.name.value.capitalize()} "
        f"placed in the {_ordinal(lord.house)} (dusthana)"
    )
    return _make_yoga(
        chart,
        name="Vipareeta Raja Yoga",
        display_name=f"Vipareeta Raja Yoga ({description})",
        category="raja",
        description=description,
        effects="Rise precipitated through adversity and its reversal",
        planets=[lord.name],
        houses=[house, lord.house],
        formation_rules=[
            _formation(
                f"vipareeta.{rule_key}",
                description,
                _SRC_VIPAREETA,
                [lord.name],
                [house, lord.house],
            )
        ],
    )


# --- Parivartana Yoga --------------------------------------------------------


def _parivartana_subtype(houses: set[int]) -> tuple[str, str]:
    if houses & DUSTHANA_HOUSES:
        return "dainya", "Dainya"
    if 3 in houses:
        return "khala", "Khala"
    return "maha", "Maha"


def rule_parivartana(chart: SiderealContext) -> list[YogaData]:
    """Mutual sign exchange between two grahas (Maha/Khala/Dainya)."""
    return [
        _parivartana_yoga(chart, chart.planets[a], chart.planets[b])
        for a, b in combinations(_CLASSICAL_SEVEN, 2)
        if _in_exchange(chart.planets[a], chart.planets[b])
    ]


def _parivartana_yoga(chart: SiderealContext, a: PlanetPosition, b: PlanetPosition) -> YogaData:
    houses = {a.house, b.house}
    rule_key, label = _parivartana_subtype(houses)
    description = (
        f"{label} Parivartana: {a.name.value.capitalize()} and {b.name.value.capitalize()} "
        f"exchange signs (houses {' and '.join(_ordinal(h) for h in sorted(houses))})"
    )
    return _make_yoga(
        chart,
        name="Parivartana Yoga",
        display_name=f"Parivartana Yoga ({description})",
        category="special",
        description=description,
        effects="The two houses' agendas become interlocked and mutually felt",
        planets=[a.name, b.name],
        houses=sorted(houses),
        formation_rules=[
            _formation(
                f"parivartana.{rule_key}",
                description,
                _SRC_PARIVARTANA,
                [a.name, b.name],
                sorted(houses),
            )
        ],
    )


# --- Dhana Yoga --------------------------------------------------------------

_DHANA_PAIRS = ((2, 5), (2, 9), (2, 11), (5, 11), (9, 11))


# (rule id, human detail, planets, houses) — the shape one dhana relation emits.
_DhanaRelation = tuple[str, str, list[PlanetName], list[int]]


def _dhana_exchange_or_conjunction(
    lord_a: PlanetPosition, lord_b: PlanetPosition, house_a: int, house_b: int
) -> _DhanaRelation | None:
    if lord_a.name == lord_b.name:
        return None  # one graha lording both houses is no pair-relation
    if lord_a.house == house_b and lord_b.house == house_a:
        detail = f"lords of the {_ordinal(house_a)} and {_ordinal(house_b)} exchange houses"
        return "dhana.lords_exchange", detail, [lord_a.name, lord_b.name], [house_a, house_b]
    if lord_a.sign == lord_b.sign:
        detail = (
            f"{_ordinal(house_a)} lord {lord_a.name.value.capitalize()} conjunct "
            f"{_ordinal(house_b)} lord {lord_b.name.value.capitalize()}"
        )
        houses = [house_a, house_b, lord_a.house]
        return "dhana.lords_conjunction", detail, [lord_a.name, lord_b.name], houses
    return None


def _dhana_placement(
    lord: PlanetPosition, own_house: int, other_house: int
) -> _DhanaRelation | None:
    if lord.house != other_house:
        return None
    detail = (
        f"{_ordinal(own_house)} lord {lord.name.value.capitalize()} in the {_ordinal(other_house)}"
    )
    return "dhana.lord_placed", detail, [lord.name], sorted({own_house, other_house})


def _dhana_relation(chart: SiderealContext, house_a: int, house_b: int) -> _DhanaRelation | None:
    """Strongest dhana relation for one wealth-house pair, or None."""
    lagna = chart.lagna.sign
    lord_a = chart.planets[house_lord(house_a, lagna)]
    lord_b = chart.planets[house_lord(house_b, lagna)]
    return (
        _dhana_exchange_or_conjunction(lord_a, lord_b, house_a, house_b)
        or _dhana_placement(lord_a, house_a, house_b)
        or _dhana_placement(lord_b, house_b, house_a)
    )


def rule_dhana(chart: SiderealContext) -> list[YogaData]:
    """Associations among the wealth-house (2/5/9/11) lords (BPHS)."""
    out: list[YogaData] = []
    for house_a, house_b in _DHANA_PAIRS:
        relation = _dhana_relation(chart, house_a, house_b)
        if relation is None:
            continue
        rule_id, detail, planets, houses = relation
        out.append(_dhana_yoga(chart, rule_id, detail, planets, houses))
    return out


def _dhana_yoga(
    chart: SiderealContext,
    rule_id: str,
    detail: str,
    planets: list[PlanetName],
    houses: list[int],
) -> YogaData:
    return _make_yoga(
        chart,
        name="Dhana Yoga",
        display_name=f"Dhana Yoga ({detail})",
        category="dhana",
        description=detail,
        effects="Wealth accumulation through the linked houses",
        planets=planets,
        houses=houses,
        formation_rules=[_formation(rule_id, detail, _SRC_DHANA, planets, houses)],
    )


# --- Kala Sarpa --------------------------------------------------------------


def _strictly_within_arc(longitude: float, start: float, end: float) -> bool:
    span = (end - start) % 360.0
    offset = (longitude - start) % 360.0
    return 0.0 < offset < span


def _kala_sarpa_side(chart: SiderealContext) -> str | None:
    """Which nodal arc holds all seven grahas, or None."""
    rahu, ketu = chart.planets[PlanetName.RAHU], chart.planets[PlanetName.KETU]
    longitudes = [chart.planets[p].longitude for p in _CLASSICAL_SEVEN]
    for side, start, end in (
        ("Rahu-to-Ketu", rahu.longitude, ketu.longitude),
        ("Ketu-to-Rahu", ketu.longitude, rahu.longitude),
    ):
        if all(_strictly_within_arc(lon, start, end) for lon in longitudes):
            return side
    return None


def rule_kala_sarpa(chart: SiderealContext) -> list[YogaData]:
    """All seven classical grahas on one side of the Rahu-Ketu axis."""
    side = _kala_sarpa_side(chart)
    if side is None:
        return []
    rahu, ketu = chart.planets[PlanetName.RAHU], chart.planets[PlanetName.KETU]
    description = f"All seven grahas within the {side} arc of the nodal axis"
    return [
        _make_yoga(
            chart,
            name="Kala Sarpa Yoga",
            display_name=f"Kala Sarpa Yoga ({description})",
            category="dosha",
            description=description,
            effects="Concentrated karmic pressure along the nodal axis",
            planets=[PlanetName.RAHU, PlanetName.KETU],
            houses=[rahu.house, ketu.house],
            formation_rules=[
                _formation(
                    "kala_sarpa.all_grahas_one_side",
                    description,
                    _SRC_KALA_SARPA,
                    [PlanetName.RAHU, PlanetName.KETU],
                    [rahu.house, ketu.house],
                )
            ],
        )
    ]


# --- Chatussagara ------------------------------------------------------------


def _kendra_occupants(chart: SiderealContext) -> list[PlanetPosition]:
    return [chart.planets[p] for p in _CLASSICAL_SEVEN if chart.planets[p].house in KENDRA_HOUSES]


def rule_chatussagara(chart: SiderealContext) -> list[YogaData]:
    """Every kendra from lagna occupied by at least one classical graha."""
    in_kendras = _kendra_occupants(chart)
    if {p.house for p in in_kendras} != set(KENDRA_HOUSES):
        return []
    description = "All four kendras (1/4/7/10) occupied by grahas"
    planets = [p.name for p in in_kendras]
    return [
        _make_yoga(
            chart,
            name="Chatussagara Yoga",
            display_name=f"Chatussagara Yoga ({description})",
            category="special",
            description=description,
            effects="Stability and renown spanning the four quarters",
            planets=planets,
            houses=sorted(KENDRA_HOUSES),
            formation_rules=[
                _formation(
                    "chatussagara.all_kendras_occupied",
                    description,
                    _SRC_CHATUSSAGARA,
                    planets,
                    sorted(KENDRA_HOUSES),
                )
            ],
        )
    ]


# --- Saraswati ---------------------------------------------------------------

# BPHS naisargika-maitri, Jupiter's row: friends are Sun, Moon, Mars.
_JUPITER_NAISARGIKA_FRIENDS = frozenset({_SUN, _MOON, _MARS})
_SARASWATI_HOUSES = frozenset({1, 2, 4, 5, 7, 9, 10})


def _jupiter_dignified_for_saraswati(jupiter: PlanetPosition) -> bool:
    if jupiter.dignity in (Dignity.OWN, Dignity.EXALTED):
        return True
    return SIGN_LORDS[jupiter.sign] in _JUPITER_NAISARGIKA_FRIENDS


def _saraswati_trio(chart: SiderealContext) -> list[PlanetPosition] | None:
    """The Mer/Jup/Ven trio when Saraswati's placement + dignity clauses hold."""
    trio = [chart.planets[p] for p in (_MERCURY, _JUPITER, _VENUS)]
    if not all(p.house in _SARASWATI_HOUSES for p in trio):
        return None
    if not _jupiter_dignified_for_saraswati(chart.planets[_JUPITER]):
        return None
    return trio


def rule_saraswati(chart: SiderealContext) -> list[YogaData]:
    """Jup/Ven/Mer in kendra, trikona or the 2nd, with dignified Jupiter."""
    trio = _saraswati_trio(chart)
    if trio is None:
        return []
    description = (
        "Mercury, Jupiter and Venus in kendra/trikona/2nd with Jupiter in "
        "own, exaltation or a friend's sign"
    )
    planets = [p.name for p in trio]
    houses = [p.house for p in trio]
    return [
        _make_yoga(
            chart,
            name="Saraswati Yoga",
            display_name=f"Saraswati Yoga ({description})",
            category="auspicious",
            description=description,
            effects="Learning, eloquence and creative intelligence",
            planets=planets,
            houses=houses,
            formation_rules=[
                _formation(
                    "saraswati.benefics_kendra_trikona_2nd",
                    description,
                    _SRC_SARASWATI,
                    planets,
                    houses,
                )
            ],
        )
    ]


# --- Registry ----------------------------------------------------------------

# One rule = one classical formation family; each returns ZERO or more fully
# traced yogas. ValueError from a rule marks it malformed (-> YogaRuleError in
# the engine); anything else is a genuine bug and propagates untouched.
RuleFn = Callable[[SiderealContext], list[YogaData]]

CLASSICAL_RULES: tuple[tuple[str, RuleFn], ...] = (
    ("pancha_mahapurusha", rule_pancha_mahapurusha),
    ("gajakesari", rule_gajakesari),
    ("budha_aditya", rule_budha_aditya),
    ("chandra_mangala", rule_chandra_mangala),
    ("guru_mangala", rule_guru_mangala),
    ("chandra_yogas", rule_chandra_yogas),
    ("surya_yogas", rule_surya_yogas),
    ("adhi", rule_adhi),
    ("amala", rule_amala),
    ("kartari", rule_kartari),
    ("raja_kendra_trikona", rule_raja_kendra_trikona),
    ("yogakaraka", rule_yogakaraka),
    ("neecha_bhanga", rule_neecha_bhanga),
    ("vipareeta", rule_vipareeta),
    ("parivartana", rule_parivartana),
    ("dhana", rule_dhana),
    ("kala_sarpa", rule_kala_sarpa),
    ("chatussagara", rule_chatussagara),
    ("saraswati", rule_saraswati),
)

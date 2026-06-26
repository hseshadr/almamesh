"""Ashtakoota Guna Milan — the classical 36-point Melapaka match.

Computed ONLY from the two natal Moons (nakshatra + sign + degree), read
verbatim off two finished charts; nothing is recomputed or mutated. The
classical tables (with citations) live in ``almamesh.mesh.tables``; lordship
friendship reuses the BPHS naisargika-maitri table in
``almamesh.strength.friendship``.

Roles are explicit (``bride``/``groom`` parameters) because the classical
tables are direction-asymmetric (Varna, Vashya, Gana, and the Bhakoot count
convention); the engine never assumes who is whom — same-sex or role-neutral
callers choose an assignment knowingly.

Dosha convention (documented): a cancelled Bhakoot/Nadi dosha removes the
affliction flag but does NOT restore the koota's points — standard panchanga
practice.
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import (
    NAKSHATRA_NAMES,
    SIGN_LORDS,
    PlanetName,
    ZodiacSign,
)
from almamesh.mesh import tables
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import (
    AshtakootaResult,
    CompatibilityBand,
    DoshaCancellation,
    DoshaFlag,
    KootaName,
    KootaResult,
    MeshDosha,
    MoonSummary,
)
from almamesh.strength.friendship import Relationship as NaturalRelation
from almamesh.strength.friendship import natural_relationship

ASHTAKOOTA_SOURCE: Final[str] = (
    "Ashtakoota Guna Milan (36 gunas) per the standard Melapaka tradition — "
    "B.V. Raman, 'Muhurtha (Electional Astrology)', Kuta agreement; the table "
    "behind every koota is cited on its own row."
)

_SIGN_ORDER: Final[tuple[ZodiacSign, ...]] = tuple(ZodiacSign)
_FRIENDLY: Final[frozenset[NaturalRelation]] = frozenset(
    {NaturalRelation.FRIEND, NaturalRelation.GREAT_FRIEND}
)
# Natural relation -> maitri scoring rank (friend 0 < neutral 1 < enemy 2).
_MAITRI_RANK: Final[dict[NaturalRelation, int]] = {
    NaturalRelation.GREAT_FRIEND: 0,
    NaturalRelation.FRIEND: 0,
    NaturalRelation.NEUTRAL: 1,
    NaturalRelation.ENEMY: 2,
    NaturalRelation.GREAT_ENEMY: 2,
}


def moon_summary(ctx: SiderealContext) -> MoonSummary:
    """The Moon facts Guna Milan reads, verbatim from a finished chart."""
    moon = ctx.planets[PlanetName.MOON]
    if moon.nakshatra not in NAKSHATRA_NAMES:
        raise ValueError(f"unknown nakshatra {moon.nakshatra!r} on the natal Moon")
    return MoonSummary(
        nakshatra=moon.nakshatra,
        nakshatra_index=NAKSHATRA_NAMES.index(moon.nakshatra),
        nakshatra_pada=moon.nakshatra_pada,
        sign=moon.sign,
        sign_degrees=moon.sign_degrees,
    )


def _varna(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    bride_varna = tables.VARNA_OF_SIGN[bride.sign]
    groom_varna = tables.VARNA_OF_SIGN[groom.sign]
    earned = 1.0 if tables.VARNA_RANK[groom_varna] >= tables.VARNA_RANK[bride_varna] else 0.0
    basis = (
        f"groom {groom.sign.value} ({groom_varna.value}) x "
        f"bride {bride.sign.value} ({bride_varna.value})"
    )
    return KootaResult(
        koota=KootaName.VARNA, earned=earned, maximum=1.0, basis=basis, source=tables.VARNA_SOURCE
    )


def _vashya(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    bride_class = tables.vashya_class(bride.sign, bride.sign_degrees)
    groom_class = tables.vashya_class(groom.sign, groom.sign_degrees)
    earned = tables.VASHYA_POINTS[(groom_class, bride_class)]
    basis = (
        f"groom {groom.sign.value} ({groom_class.value}) x "
        f"bride {bride.sign.value} ({bride_class.value})"
    )
    return KootaResult(
        koota=KootaName.VASHYA, earned=earned, maximum=2.0, basis=basis, source=tables.VASHYA_SOURCE
    )


def _tara_leg(from_index: int, to_index: int) -> tuple[str, float]:
    """One direction's tara: inclusive star count mod 9 (0 reads as 9)."""
    count = ((to_index - from_index) % 27) + 1
    remainder = count % 9 or 9
    earned = 0.0 if remainder in tables.TARA_MALEFIC else 1.5
    return tables.TARA_NAMES[remainder - 1], earned


def _tara(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    fwd_name, fwd_earned = _tara_leg(bride.nakshatra_index, groom.nakshatra_index)
    rev_name, rev_earned = _tara_leg(groom.nakshatra_index, bride.nakshatra_index)
    basis = (
        f"bride->groom {fwd_name}, groom->bride {rev_name} (malefic taras: Vipat/Pratyari/Vadha)"
    )
    return KootaResult(
        koota=KootaName.TARA,
        earned=fwd_earned + rev_earned,
        maximum=3.0,
        basis=basis,
        source=tables.TARA_SOURCE,
    )


def _yoni(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    bride_animal, bride_sex = tables.YONI_OF_NAKSHATRA[bride.nakshatra_index]
    groom_animal, groom_sex = tables.YONI_OF_NAKSHATRA[groom.nakshatra_index]
    earned = float(tables.YONI_POINTS[(groom_animal, bride_animal)])
    basis = (
        f"groom {groom.nakshatra} ({groom_animal.value}, {groom_sex.value}) x "
        f"bride {bride.nakshatra} ({bride_animal.value}, {bride_sex.value})"
    )
    return KootaResult(
        koota=KootaName.YONI, earned=earned, maximum=4.0, basis=basis, source=tables.YONI_SOURCE
    )


def _maitri(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    bride_lord, groom_lord = SIGN_LORDS[bride.sign], SIGN_LORDS[groom.sign]
    groom_view = natural_relationship(groom_lord, bride_lord)
    bride_view = natural_relationship(bride_lord, groom_lord)
    ranks = sorted((_MAITRI_RANK[groom_view], _MAITRI_RANK[bride_view]))
    earned = tables.GRAHA_MAITRI_POINTS[(ranks[0], ranks[1])]
    basis = (
        f"groom lord {groom_lord.value} sees bride lord {bride_lord.value} as "
        f"{groom_view.value}; bride lord sees groom lord as {bride_view.value}"
    )
    return KootaResult(
        koota=KootaName.GRAHA_MAITRI,
        earned=earned,
        maximum=5.0,
        basis=basis,
        source=tables.GRAHA_MAITRI_SOURCE,
    )


def _gana(bride: MoonSummary, groom: MoonSummary) -> KootaResult:
    bride_gana = tables.GANA_OF_NAKSHATRA[bride.nakshatra_index]
    groom_gana = tables.GANA_OF_NAKSHATRA[groom.nakshatra_index]
    earned = tables.GANA_POINTS[(groom_gana, bride_gana)]
    basis = (
        f"groom {groom.nakshatra} ({groom_gana.value}) x "
        f"bride {bride.nakshatra} ({bride_gana.value})"
    )
    return KootaResult(
        koota=KootaName.GANA, earned=earned, maximum=6.0, basis=basis, source=tables.GANA_SOURCE
    )


def _mutual_counts(bride_sign: ZodiacSign, groom_sign: ZodiacSign) -> tuple[int, int]:
    """(bride's sign counted from the groom's, groom's counted from the bride's)."""
    bride_idx = _SIGN_ORDER.index(bride_sign)
    groom_idx = _SIGN_ORDER.index(groom_sign)
    from_groom = (bride_idx - groom_idx) % 12 + 1
    from_bride = (groom_idx - bride_idx) % 12 + 1
    return from_groom, from_bride


def _bhakoot_cancellations(bride: MoonSummary, groom: MoonSummary) -> list[DoshaCancellation]:
    bride_lord, groom_lord = SIGN_LORDS[bride.sign], SIGN_LORDS[groom.sign]
    if bride_lord is groom_lord:
        description = f"both Moon signs are ruled by {bride_lord.value}"
        return [
            DoshaCancellation(
                rule="bhakoot.same_sign_lord",
                description=description,
                source=tables.BHAKOOT_CANCEL_SOURCE,
            )
        ]
    mutual_friends = (
        natural_relationship(bride_lord, groom_lord) in _FRIENDLY
        and natural_relationship(groom_lord, bride_lord) in _FRIENDLY
    )
    if not mutual_friends:
        return []
    description = f"{bride_lord.value} and {groom_lord.value} are mutual natural friends (BPHS)"
    return [
        DoshaCancellation(
            rule="bhakoot.lords_mutual_friends",
            description=description,
            source=tables.BHAKOOT_CANCEL_SOURCE,
        )
    ]


def _dosha_scored(
    koota: KootaName,
    dosha: MeshDosha,
    maximum: float,
    present: bool,
    cancellations: list[DoshaCancellation],
    basis: str,
    source: str,
) -> tuple[KootaResult, DoshaFlag]:
    """A dosha-bearing koota row + flag. Convention: a present dosha zeroes the
    points even when cancelled — cancellation lifts the affliction, never the
    score (standard panchanga practice, see the module docstring)."""
    row = KootaResult(
        koota=koota, earned=0.0 if present else maximum, maximum=maximum, basis=basis, source=source
    )
    flag = DoshaFlag(
        name=dosha,
        present=present,
        cancelled=present and bool(cancellations),
        cancellations=cancellations,
        basis=basis,
        source=source,
    )
    return row, flag


def _bhakoot(bride: MoonSummary, groom: MoonSummary) -> tuple[KootaResult, DoshaFlag]:
    from_groom, from_bride = _mutual_counts(bride.sign, groom.sign)
    pair = (min(from_groom, from_bride), max(from_groom, from_bride))
    present = pair in tables.BHAKOOT_DOSHA_PAIRS
    cancellations = _bhakoot_cancellations(bride, groom) if present else []
    basis = f"{groom.sign.value} and {bride.sign.value} stand {pair[0]}/{pair[1]} from each other"
    return _dosha_scored(
        KootaName.BHAKOOT,
        MeshDosha.BHAKOOT_DOSHA,
        7.0,
        present,
        cancellations,
        basis,
        tables.BHAKOOT_SOURCE,
    )


def _nadi_exception_rules(bride: MoonSummary, groom: MoonSummary) -> list[tuple[bool, str, str]]:
    """(fired?, rule id, description) for each classical Nadi exception."""
    same_star = bride.nakshatra_index == groom.nakshatra_index
    same_sign = bride.sign is groom.sign
    pada_differs = bride.nakshatra_pada != groom.nakshatra_pada
    return [
        (
            same_star and pada_differs,
            "nadi.same_nakshatra_different_pada",
            "same nakshatra but different padas",
        ),
        (
            same_sign and not same_star,
            "nadi.same_sign_different_nakshatra",
            "same Moon sign, different nakshatras",
        ),
        (
            same_star and not same_sign,
            "nadi.same_nakshatra_different_sign",
            "same nakshatra, different Moon signs",
        ),
    ]


def _nadi_cancellations(bride: MoonSummary, groom: MoonSummary) -> list[DoshaCancellation]:
    return [
        DoshaCancellation(rule=rule, description=desc, source=tables.NADI_CANCEL_SOURCE)
        for fired, rule, desc in _nadi_exception_rules(bride, groom)
        if fired
    ]


def _nadi(bride: MoonSummary, groom: MoonSummary) -> tuple[KootaResult, DoshaFlag]:
    bride_nadi = tables.NADI_OF_NAKSHATRA[bride.nakshatra_index]
    groom_nadi = tables.NADI_OF_NAKSHATRA[groom.nakshatra_index]
    present = bride_nadi is groom_nadi
    cancellations = _nadi_cancellations(bride, groom) if present else []
    basis = (
        f"groom {groom.nakshatra} ({groom_nadi.value} nadi) x "
        f"bride {bride.nakshatra} ({bride_nadi.value} nadi)"
    )
    return _dosha_scored(
        KootaName.NADI,
        MeshDosha.NADI_DOSHA,
        8.0,
        present,
        cancellations,
        basis,
        tables.NADI_SOURCE,
    )


def _band(total: float) -> CompatibilityBand:
    """Classical-convention band for the /36 total (see tables.BAND_SOURCE)."""
    if total < 18.0:
        return CompatibilityBand.NOT_RECOMMENDED
    if total < 25.0:
        return CompatibilityBand.AVERAGE
    if total < 33.0:
        return CompatibilityBand.GOOD
    return CompatibilityBand.EXCELLENT


def _paired_kootas(bride: MoonSummary, groom: MoonSummary) -> list[KootaResult]:
    """The six non-dosha kootas, in canonical Ashtakoota order."""
    return [
        _varna(bride, groom),
        _vashya(bride, groom),
        _tara(bride, groom),
        _yoni(bride, groom),
        _maitri(bride, groom),
        _gana(bride, groom),
    ]


def compute_ashtakoota_from_moons(bride: MoonSummary, groom: MoonSummary) -> AshtakootaResult:
    """The full 8-koota match from two Moon placements (already extracted)."""
    bhakoot_koota, bhakoot_flag = _bhakoot(bride, groom)
    nadi_koota, nadi_flag = _nadi(bride, groom)
    kootas = [*_paired_kootas(bride, groom), bhakoot_koota, nadi_koota]
    total = sum(koota.earned for koota in kootas)
    return AshtakootaResult(
        bride_moon=bride,
        groom_moon=groom,
        kootas=kootas,
        total=total,
        band=_band(total),
        band_basis=tables.BAND_SOURCE,
        bhakoot_dosha=bhakoot_flag,
        nadi_dosha=nadi_flag,
        source=ASHTAKOOTA_SOURCE,
    )


def compute_ashtakoota(bride: SiderealContext, groom: SiderealContext) -> AshtakootaResult:
    """Guna Milan between two finished charts (read-only; Moons taken verbatim)."""
    return compute_ashtakoota_from_moons(moon_summary(bride), moon_summary(groom))

"""Relational (mesh) Pydantic models — the typed contract between two charts.

INTEGRITY FRAME (non-negotiable): classical Vedic astrology computes RELATIONS
between charts — compatibility scores (Ashtakoota Guna Milan / Melapaka),
chart-on-chart overlays, timing interlocks (dasha synchrony) and house/karaka
corroborations. It never claims one chart changes another's computation. The
mesh engine therefore takes two already-computed natal contexts as READ-ONLY
inputs and emits a relation context; it never recomputes or mutates either
chart. Every emitted rule carries a ``source`` citation; every value that rests
on a modern convention (rather than a classical table) is flagged.

Role asymmetry: the classical Melapaka tables are bride/groom asymmetric in
places (Varna, Vashya, Gana scoring direction; Bhakoot counting convention).
The engine NEVER assumes who is whom — callers pass roles explicitly
(:class:`MatchRole`), and same-sex or role-neutral callers choose an
assignment knowingly.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from almamesh.constants.astrology import Dignity, PlanetName, ZodiacSign
from almamesh.dasha.convention import DashaYearConvention

INTEGRITY_NOTE = (
    "Relations are computed FROM two finished natal charts (read-only inputs); "
    "neither chart is recomputed, reweighted or mutated by the other."
)


class _FrozenModel(BaseModel):
    """Base for all mesh models: immutable once emitted by the engine."""

    model_config = ConfigDict(frozen=True)


# --- Closed enums -----------------------------------------------------------


class MatchRole(str, Enum):
    """Explicit Melapaka role — the caller states who is whom, never the engine."""

    BRIDE = "bride"
    GROOM = "groom"


class Relationship(str, Enum):
    """The relation kinds the mesh edge models (closed set)."""

    SPOUSE = "spouse"
    PARTNER = "partner"
    MOTHER = "mother"
    FATHER = "father"
    CHILD = "child"
    SIBLING = "sibling"
    FRIEND = "friend"
    BUSINESS = "business"


class KootaName(str, Enum):
    """The eight kootas of Ashtakoota Guna Milan (1+2+3+4+5+6+7+8 = 36)."""

    VARNA = "varna"
    VASHYA = "vashya"
    TARA = "tara"
    YONI = "yoni"
    GRAHA_MAITRI = "graha_maitri"
    GANA = "gana"
    BHAKOOT = "bhakoot"
    NADI = "nadi"


class CompatibilityBand(str, Enum):
    """Classical-convention reading of the /36 total (labels, not verdicts)."""

    NOT_RECOMMENDED = "not_recommended"  # total < 18
    AVERAGE = "average"  # 18 <= total < 25
    GOOD = "good"  # 25 <= total < 33
    EXCELLENT = "excellent"  # 33 <= total <= 36


class Varna(str, Enum):
    """Varna class of a Moon sign (Varna koota)."""

    BRAHMIN = "brahmin"
    KSHATRIYA = "kshatriya"
    VAISHYA = "vaishya"
    SHUDRA = "shudra"


class VashyaClass(str, Enum):
    """Vashya class of a Moon sign (five-fold classical classification)."""

    CHATUSHPADA = "chatushpada"  # quadruped
    MANAVA = "manava"  # human
    JALACHARA = "jalachara"  # water-dweller
    VANACHARA = "vanachara"  # wild beast (Leo)
    KEETA = "keeta"  # insect/scorpion (Scorpio)


class YoniAnimal(str, Enum):
    """The fourteen yoni animals of the nakshatra yoni table."""

    HORSE = "horse"  # Ashwa
    ELEPHANT = "elephant"  # Gaja
    GOAT = "goat"  # Mesha
    SERPENT = "serpent"  # Sarpa
    DOG = "dog"  # Shwana
    CAT = "cat"  # Marjara
    RAT = "rat"  # Mushaka
    COW = "cow"  # Gau
    BUFFALO = "buffalo"  # Mahisha
    TIGER = "tiger"  # Vyaghra
    DEER = "deer"  # Mriga
    MONKEY = "monkey"  # Vanara
    MONGOOSE = "mongoose"  # Nakula
    LION = "lion"  # Simha


class YoniSex(str, Enum):
    """Male/female of a nakshatra's yoni animal (classical pairing)."""

    MALE = "male"
    FEMALE = "female"


class Gana(str, Enum):
    """Gana (temperament class) of a nakshatra."""

    DEVA = "deva"
    MANUSHYA = "manushya"
    RAKSHASA = "rakshasa"


class Nadi(str, Enum):
    """Nadi (constitutional channel) of a nakshatra."""

    ADI = "adi"
    MADHYA = "madhya"
    ANTYA = "antya"


class MeshDosha(str, Enum):
    """The dosha flags Guna Milan raises (closed set)."""

    BHAKOOT_DOSHA = "bhakoot_dosha"
    NADI_DOSHA = "nadi_dosha"


class MangalReference(str, Enum):
    """Reference point Mars's dosha houses are counted from (per school)."""

    LAGNA = "lagna"
    MOON = "moon"
    VENUS = "venus"


class ContactKind(str, Enum):
    """How a guest graha touches a host natal point in the overlay."""

    CLOSE_CONJUNCTION = "close_conjunction"  # same sign AND within the stated orb
    SAME_SIGN = "same_sign"  # whole-sign yuti (the classical conjunction)
    GRAHA_DRISHTI = "graha_drishti"  # classical whole-sign aspect


class NatalPoint(str, Enum):
    """A host chart's natal points the overlay targets (lagna + 9 grahas)."""

    LAGNA = "lagna"
    SUN = "sun"
    MOON = "moon"
    MARS = "mars"
    MERCURY = "mercury"
    JUPITER = "jupiter"
    VENUS = "venus"
    SATURN = "saturn"
    RAHU = "rahu"
    KETU = "ketu"


# --- Ashtakoota Guna Milan ---------------------------------------------------


class MoonSummary(_FrozenModel):
    """The Moon facts Guna Milan reads — verbatim from the natal context."""

    nakshatra: str
    nakshatra_index: int = Field(ge=0, le=26)
    nakshatra_pada: int = Field(ge=1, le=4)
    sign: ZodiacSign
    sign_degrees: float = Field(ge=0.0, lt=30.0)


class KootaResult(_FrozenModel):
    """One koota's score with its human-readable basis and table citation."""

    koota: KootaName
    earned: float = Field(ge=0.0)
    maximum: float = Field(gt=0.0)
    basis: str  # e.g. "bride Rohini (Manushya gana) x groom Hasta (Deva gana)"
    source: str  # classical citation for the table applied


class DoshaCancellation(_FrozenModel):
    """A classical cancellation rule that fired, with its citation."""

    rule: str  # machine id, e.g. "bhakoot.lords_mutual_friends"
    description: str
    source: str


class DoshaFlag(_FrozenModel):
    """A dosha verdict: present / cancelled, with the rules that decided it.

    Convention (documented, classical practice): a cancelled dosha removes the
    affliction but does NOT restore the koota's points — ``earned`` on the
    matching :class:`KootaResult` stays 0.
    """

    name: MeshDosha
    present: bool
    cancelled: bool
    cancellations: list[DoshaCancellation]
    basis: str
    source: str


class AshtakootaResult(_FrozenModel):
    """The full 8-koota / 36-guna Melapaka match between two Moons."""

    bride_moon: MoonSummary
    groom_moon: MoonSummary
    kootas: list[KootaResult] = Field(min_length=8, max_length=8)
    total: float = Field(ge=0.0, le=36.0)
    maximum: float = 36.0
    band: CompatibilityBand
    band_basis: str  # the classical-convention thresholds, stated
    bhakoot_dosha: DoshaFlag
    nadi_dosha: DoshaFlag
    source: str


# --- Mangal (Kuja) dosha -----------------------------------------------------


class MangalReferenceResult(_FrozenModel):
    """Mars's dosha verdict counted from ONE reference point (one school)."""

    reference: MangalReference
    school: str  # which tradition counts from this reference
    mars_sign: ZodiacSign
    mars_house: int = Field(ge=1, le=12)  # whole-sign house from the reference
    in_dosha_house: bool
    cancellations: list[DoshaCancellation]
    net_dosha: bool  # in a dosha house AND no cancellation fired
    source: str


class MangalDoshaResult(_FrozenModel):
    """Mangal dosha for one chart across the three classical references."""

    references: list[MangalReferenceResult] = Field(min_length=3, max_length=3)
    has_dosha: bool  # strictest screening: net dosha under ANY reference
    convention: str  # the house set + screening convention, stated


class DoshaMatchResult(_FrozenModel):
    """Mutual Mangal-dosha comparison between two charts."""

    a: MangalDoshaResult
    b: MangalDoshaResult
    mutually_cancelled: bool  # both afflicted -> dosha neutralized (classical)
    compatible: bool  # neither afflicted, or mutually cancelled
    basis: str
    source: str


# --- Overlay (one chart's grahas on the other's houses/points) ---------------


class OverlayPlacement(_FrozenModel):
    """A guest graha placed (read-only) into a host whole-sign house."""

    planet: PlanetName  # the guest's graha
    sign: ZodiacSign  # its natal sign (unchanged — read-only input)
    host_house: int = Field(ge=1, le=12)  # host whole-sign house it falls in


class OverlayContact(_FrozenModel):
    """One guest-graha -> host-natal-point contact."""

    planet: PlanetName  # the guest's graha
    target: NatalPoint  # the host natal point touched
    kind: ContactKind
    host_house: int = Field(ge=1, le=12)  # host house the guest graha occupies
    orb_degrees: float | None = None  # angular separation for same-sign kinds
    heuristic: bool  # True only for the modern close-conjunction orb
    source: str


class ChartOverlay(_FrozenModel):
    """Guest grahas overlaid on a host chart: placements + typed contacts."""

    host_lagna_sign: ZodiacSign
    placements: list[OverlayPlacement] = Field(min_length=9, max_length=9)
    contacts: list[OverlayContact]
    conjunction_orb_degrees: float  # the stated close-conjunction orb
    convention: str


class OverlayPair(_FrozenModel):
    """Both overlay directions for a pair of charts."""

    b_in_a: ChartOverlay  # B's grahas in A's houses / on A's points
    a_in_b: ChartOverlay  # A's grahas in B's houses / on B's points


# --- Dasha synchrony ----------------------------------------------------------


class SynchronySegment(_FrozenModel):
    """One window slice where both charts' maha+antar legs are constant."""

    start: datetime
    end: datetime
    a_maha: PlanetName
    a_antar: PlanetName
    b_maha: PlanetName
    b_antar: PlanetName
    shared_lords: list[PlanetName]  # sorted; {a_maha,a_antar} & {b_maha,b_antar}
    simultaneous_boundary: bool  # segment start is a dasha boundary in BOTH


class DashaSynchronyResult(_FrozenModel):
    """Two charts' dated Vimshottari timelines joined over an explicit window."""

    window_start: datetime
    window_end: datetime
    segments: list[SynchronySegment]
    convention_a: DashaYearConvention
    convention_b: DashaYearConvention
    basis: str  # pure interval intersection over engine-emitted dates


# --- Relation significators ---------------------------------------------------


class GrahaCondition(_FrozenModel):
    """A graha's observable natal condition (verbatim engine facts)."""

    planet: PlanetName
    sign: ZodiacSign
    house: int = Field(ge=1, le=12)
    dignity: Dignity
    is_retrograde: bool
    is_combust: bool


class KarakaAssessment(_FrozenModel):
    """One karaka graha's condition, with the karakatva citation."""

    condition: GrahaCondition
    source: str


class RelationSignificators(_FrozenModel):
    """The classical house + karaka corroboration for one relation, one chart."""

    relationship: Relationship
    karaka_house: int = Field(ge=1, le=12)
    house_basis: str  # citation for the house assignment
    house_sign: ZodiacSign
    house_lord: PlanetName
    lord_condition: GrahaCondition
    occupants: list[PlanetName]  # grahas occupying the karaka house (sorted)
    karakas: list[KarakaAssessment] = Field(min_length=1)


# --- The mesh edge bundle -----------------------------------------------------


class MeshEdgeContext(_FrozenModel):
    """The full relation context between two READ-ONLY natal charts."""

    relationship: Relationship
    role_a: MatchRole
    role_b: MatchRole
    ashtakoota: AshtakootaResult
    mangal_match: DoshaMatchResult
    overlay: OverlayPair
    synchrony: DashaSynchronyResult
    significators_a: RelationSignificators
    significators_b: RelationSignificators
    integrity_note: str = INTEGRITY_NOTE

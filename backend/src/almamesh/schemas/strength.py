"""Typed Pydantic contract for the Phase-3 strength engine (Ashtakavarga + Shadbala).

The engine emits numbers and stable enum keys only — never prose. Every Shadbala
sub-component carries its BPHS citation and an explicit ``approximated`` flag so a
professional cross-checking Jagannatha Hora can see exactly what was computed
rigorously versus flagged. Calc-integrity: nothing is silently fudged.

Conventions:
- Ashtakavarga bindus are integers (0..8 per house; BAV row 0..56).
- Shadbala values are in Virupas internally and Rupas (Virupas / 60) at the
  field boundary, matching BPHS where 1 Rupa = 60 Virupas = 60 Shashtiamsas.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from almamesh.constants.astrology import PlanetName, ZodiacSign

# The seven grahas that carry Shadbala / Bhinnashtakavarga (nodes are excluded by
# classical Parashari Shadbala; Ashtakavarga also uses the 7 + Lagna).
SHADBALA_PLANETS: tuple[PlanetName, ...] = (
    PlanetName.SUN,
    PlanetName.MOON,
    PlanetName.MARS,
    PlanetName.MERCURY,
    PlanetName.JUPITER,
    PlanetName.VENUS,
    PlanetName.SATURN,
)

VIRUPAS_PER_RUPA: float = 60.0


class ShadbalaComponent(str, Enum):
    """The six-fold strength components (BPHS Shadbala Adhyaya)."""

    STHANA = "sthana"  # positional strength
    DIG = "dig"  # directional strength
    KALA = "kala"  # temporal strength
    CHESHTA = "cheshta"  # motional strength
    NAISARGIKA = "naisargika"  # natural/intrinsic strength
    DRIK = "drik"  # aspectual strength


# --- Ashtakavarga ---


class BhinnashtakavargaChart(BaseModel):
    """One planet's Bhinnashtakavarga (BAV): bindus per zodiac sign + the row total.

    ``bindus`` maps each of the 12 signs to its bindu count (0..8). ``total`` is
    the classical BAV total (Sun 48, Moon 49, Mars 39, Mercury 54, Jupiter 56,
    Venus 52, Saturn 39 — a chart-invariant property of the canonical tables).
    """

    model_config = ConfigDict(frozen=True)

    planet: PlanetName
    bindus: dict[ZodiacSign, int]
    total: int


class SarvashtakavargaChart(BaseModel):
    """Sarvashtakavarga (SAV): elementwise sum of the seven BAVs per sign.

    The grand total over all 12 signs is the canonical 337 for every chart.
    """

    model_config = ConfigDict(frozen=True)

    bindus: dict[ZodiacSign, int]
    total: int


class AshtakavargaContext(BaseModel):
    """Full Parashari Ashtakavarga: the seven BAVs keyed by planet plus the SAV."""

    model_config = ConfigDict(frozen=True)

    bhinna: dict[PlanetName, BhinnashtakavargaChart]
    sarva: SarvashtakavargaChart


# --- Shadbala ---


class BalaValue(BaseModel):
    """One named strength quantity in Virupas, with its BPHS citation.

    ``approximated`` is True only when the underlying model is a documented
    simplification (e.g. the Yuddhabala war-winner rule); ``note`` then states
    exactly what was and was not modelled. A rigorously-computed value keeps
    ``approximated=False`` and ``note=None`` — never a silent fudge.
    """

    model_config = ConfigDict(frozen=True)

    virupas: float
    citation: str
    approximated: bool = False
    note: str | None = None


class SthanaBala(BaseModel):
    """Positional strength = sum of its five BPHS sub-balas (Virupas)."""

    model_config = ConfigDict(frozen=True)

    uccha: BalaValue
    saptavargaja: BalaValue
    ojayugma: BalaValue
    kendradi: BalaValue
    drekkana: BalaValue
    total_virupas: float


class KalaBala(BaseModel):
    """Temporal strength = sum of its BPHS sub-balas (Virupas)."""

    model_config = ConfigDict(frozen=True)

    nathonnatha: BalaValue
    paksha: BalaValue
    tribhaga: BalaValue
    abda: BalaValue
    masa: BalaValue
    vara: BalaValue
    hora: BalaValue
    ayana: BalaValue
    yuddha: BalaValue
    total_virupas: float


class PlanetShadbala(BaseModel):
    """The six-fold strength of one graha, components + totals + the BPHS minimum.

    ``total_rupas`` = sum of the six components / 60. ``required_rupas`` is the
    classical minimum strength for this graha; ``meets_minimum`` compares them.
    """

    model_config = ConfigDict(frozen=True)

    planet: PlanetName
    sthana: SthanaBala
    dig: BalaValue
    kala: KalaBala
    cheshta: BalaValue
    naisargika: BalaValue
    drik: BalaValue
    total_virupas: float
    total_rupas: float
    required_rupas: float
    meets_minimum: bool


class ShadbalaContext(BaseModel):
    """Shadbala for the seven grahas, keyed by planet."""

    model_config = ConfigDict(frozen=True)

    planets: dict[PlanetName, PlanetShadbala]


# --- top-level additive context ---


class StrengthContext(BaseModel):
    """The Phase-3 strength context: Ashtakavarga + Shadbala for a natal chart.

    Additive and standalone — built by ``compute_strength_context`` from a
    read-only natal ``SiderealContext`` (plus the real birth instant + place so
    Kalabala uses true civil sunrise). The natal chart is never mutated.
    """

    model_config = ConfigDict(frozen=True)

    sunrise_utc_iso: str = Field(
        description="ISO-8601 UTC instant of the civil sunrise preceding birth (Kalabala basis)."
    )
    ashtakavarga: AshtakavargaContext
    shadbala: ShadbalaContext

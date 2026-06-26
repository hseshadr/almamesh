"""Pydantic contract for the Phase-2 Shodasavarga (16 divisional charts) engine.

This is the typed, prose-free output of ``compute_varga_context``. Like the
transit context, it is a SEPARATE object computed READ-ONLY off an already-built
natal ``SiderealContext`` — it is NOT nested into the natal output, so the natal
golden and CPython<->Pyodide byte-parity stay untouched (a later integration wave
composes it, exactly as the transit engine was kept standalone).

All enums are closed sets serialized as their ``.value`` for the browser. The
engine emits sign placements + classical strength tallies only; the LLM/i18n
layer narrates later. Calc-integrity: anything not BPHS-exact (the Vimshopaka
20-point weighting) carries an explicit ``approximated`` flag rather than shipping
a guess as fact.

Exposed via this module's own symbols; the package ``vargas`` re-exports the
public entrypoint. A shared ``schemas/__init__`` is intentionally NOT edited.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from almamesh.constants.astrology import PlanetName, ZodiacSign


class DivisionalChart(str, Enum):
    """The 16 Shodasavarga divisional charts (BPHS), keyed by their D-number."""

    D1 = "D1"  # Rasi — the natal body chart
    D2 = "D2"  # Hora — wealth
    D3 = "D3"  # Drekkana — siblings, courage
    D4 = "D4"  # Chaturthamsa — fortune, property
    D7 = "D7"  # Saptamsa — children, progeny
    D9 = "D9"  # Navamsa — spouse, dharma (the highest-value varga)
    D10 = "D10"  # Dasamsa — career, status
    D12 = "D12"  # Dwadasamsa — parents
    D16 = "D16"  # Shodasamsa — vehicles, comforts
    D20 = "D20"  # Vimsamsa — spiritual pursuits
    D24 = "D24"  # Siddhamsa / Chaturvimsamsa — education, learning
    D27 = "D27"  # Bhamsa / Nakshatramsa — strengths & weaknesses
    D30 = "D30"  # Trimsamsa — misfortunes, character (UNEQUAL portions)
    D40 = "D40"  # Khavedamsa — maternal legacy
    D45 = "D45"  # Akshavedamsa — paternal legacy
    D60 = "D60"  # Shashtiamsa — past-life karma (the finest division)


class VargaPlacement(BaseModel):
    """A graha's sign placement in one divisional chart (sign + that sign's lord).

    A varga maps a continuous longitude onto a sign only — there is no
    independent ``sign_degrees`` in a divisional chart — so this mirrors the
    natal ``VargaPlanet`` shape (kept independent to leave that schema untouched).
    """

    graha: PlanetName
    sign: ZodiacSign
    sign_lord: PlanetName
    model_config = {"use_enum_values": True}


class VargaChart(BaseModel):
    """One full divisional chart: the lagna + every graha's varga sign."""

    chart: DivisionalChart
    lagna_sign: ZodiacSign
    lagna_sign_lord: PlanetName
    placements: dict[PlanetName, VargaPlacement]
    model_config = {"use_enum_values": True}


class VargottamaFlag(BaseModel):
    """A graha (or lagna) whose D1 sign equals its D9 sign — vargottama, a

    classical strength marker. ``point`` is the natal reference: a graha name or
    the literal ``"lagna"``.
    """

    point: str  # a PlanetName value or "lagna"
    sign: ZodiacSign  # the shared D1==D9 sign
    model_config = {"use_enum_values": True}


class ShadvargaOwnSign(BaseModel):
    """How many of the six Shadvarga charts (D1,D2,D3,D9,D12,D30) a graha occupies

    in a sign it rules — a transparent, hand-verifiable own-sign tally (the raw
    input to the classical Shadvarga-bala naming: Kimsuka, Vyanjana, ...).
    """

    graha: PlanetName
    own_sign_count: int  # 0..6
    charts_in_own_sign: list[DivisionalChart] = Field(default_factory=list)
    model_config = {"use_enum_values": True}


class VimshopakaScore(BaseModel):
    """The BPHS Vimshopaka (20-point) Shadvarga weighting per graha.

    Weights (Shadvarga group): D1=6, D2=2, D3=4, D9=5, D12=2, D30=1 (sum 20). A
    graha scores the weight of each chart in which it sits in its OWN sign. This
    is the simple own-sign form of Vimshopaka; the fuller BPHS form adds partial
    credit for friend/exaltation dignity, which needs Jagannatha-Hora confirmation
    of the exact ladder — so ``approximated=True`` flags this as the own-sign
    subset, NOT the full dignity-weighted score (calc-integrity: never ship a
    guess as fact).
    """

    graha: PlanetName
    score: float  # 0..20, own-sign Shadvarga weighting
    approximated: bool = True
    model_config = {"use_enum_values": True}


class VargaContext(BaseModel):
    """The Phase-2 Shodasavarga context: 16 divisional charts + strength tallies.

    Computed deterministically and READ-ONLY from a natal ``SiderealContext``
    (planet sidereal longitudes + lagna longitude). Separate from the natal
    output by design.
    """

    charts: dict[DivisionalChart, VargaChart]  # all 16, D1..D60
    vargottama: list[VargottamaFlag]  # grahas/lagna with D1==D9
    shadvarga_own_sign: list[ShadvargaOwnSign]  # six-chart own-sign tally
    vimshopaka: list[VimshopakaScore]  # 20-point Shadvarga weighting (own-sign)
    model_config = {"use_enum_values": True}

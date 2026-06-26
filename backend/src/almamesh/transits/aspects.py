"""Vedic graha aspects and benefic/malefic classification for the fusion layer.

Each graha casts its 7th aspect; Saturn additionally aspects the 3rd and 10th,
Mars the 4th and 8th, Jupiter the 5th and 9th (all whole-sign, counted forward).
A benefic/malefic that conjoins or aspects the dasha lord's transit sign
reinforces / afflicts it."""

from __future__ import annotations

from typing import Any, Final

from almamesh.constants.astrology import PlanetName
from almamesh.transits.natal import sign_index

# Special aspects (besides the universal 7th) by graha, as forward sign offsets.
_SPECIAL_ASPECTS: Final[dict[PlanetName, frozenset[int]]] = {
    PlanetName.SATURN: frozenset({3, 7, 10}),
    PlanetName.MARS: frozenset({4, 7, 8}),
    PlanetName.JUPITER: frozenset({5, 7, 9}),
}
_DEFAULT_ASPECTS: Final[frozenset[int]] = frozenset({7})
_BENEFICS: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.JUPITER, PlanetName.VENUS, PlanetName.MOON}
)
_MALEFICS: Final[frozenset[PlanetName]] = frozenset(
    {PlanetName.SATURN, PlanetName.MARS, PlanetName.SUN, PlanetName.RAHU, PlanetName.KETU}
)


def drishti_offsets(graha: PlanetName) -> frozenset[int]:
    """The classical forward sign-offsets ``graha`` casts graha-drishti on.

    Public single source of truth (used by the transit fusion layer here and
    by the mesh overlay): every graha casts the 7th; Saturn adds 3/10, Mars
    4/8, Jupiter 5/9 (BPHS drishti adhyaya, whole-sign). The nodes carry no
    special drishti in this engine's Parashari convention.
    """
    return _SPECIAL_ASPECTS.get(graha, _DEFAULT_ASPECTS)


def _aspect_offsets(graha: PlanetName) -> frozenset[int]:
    """The forward whole-sign offsets `graha` aspects (incl. conjunction = 1)."""
    return drishti_offsets(graha) | {1}


def _touches(from_idx: int, target_idx: int, graha: PlanetName) -> bool:
    """True if `graha` at from_idx conjoins or aspects the target sign."""
    offset = (target_idx - from_idx) % 12 + 1
    return offset in _aspect_offsets(graha)


def _influencers(
    raw: dict[PlanetName, dict[str, Any]],
    lord: PlanetName,
    lord_idx: int,
    candidates: frozenset[PlanetName],
) -> list[PlanetName]:
    """Candidate grahas (excluding the lord) that touch the lord's sign."""
    out: list[PlanetName] = []
    for graha in candidates:
        if graha is lord:
            continue
        if _touches(sign_index(float(raw[graha]["longitude"])), lord_idx, graha):
            out.append(graha)
    return sorted(out, key=lambda g: g.value)


def reinforcing_benefics(
    raw: dict[PlanetName, dict[str, Any]], lord: PlanetName, lord_idx: int
) -> list[PlanetName]:
    """Benefics conjoining or aspecting the dasha lord's transit sign."""
    return _influencers(raw, lord, lord_idx, _BENEFICS)


def afflicting_malefics(
    raw: dict[PlanetName, dict[str, Any]], lord: PlanetName, lord_idx: int
) -> list[PlanetName]:
    """Malefics conjoining or aspecting the dasha lord's transit sign."""
    return _influencers(raw, lord, lord_idx, _MALEFICS)

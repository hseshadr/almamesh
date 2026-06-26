"""Mangal (Kuja) dosha — Mars affliction screening, per reference school.

Mars in whole-sign houses 1/2/4/7/8/12 counted from the Lagna, from the Moon
(Chandra-lagna school) and from Venus (South-Indian practice). The 1/4/7/8/12
set is the classical core; the 2nd house is the South-Indian inclusion — both
are screened and the convention is stated on the payload. Only
chart-computable classical cancellations are applied (the engine has no age
input, so age-based conventions are out of scope by design). Inputs are
READ-ONLY finished charts; nothing is recomputed.
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import EXALTATION_SIGN, PlanetName, ZodiacSign
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import (
    DoshaCancellation,
    DoshaMatchResult,
    MangalDoshaResult,
    MangalReference,
    MangalReferenceResult,
)
from almamesh.transits.natal import sign_index, whole_sign_house

MANGAL_SOURCE: Final[str] = (
    "Kuja (Mangal) dosha per the classical Muhurta tradition — Mars in houses "
    "1/4/7/8/12 from the reference (cf. B.V. Raman, 'Muhurtha', marriage "
    "adyaya); the 2nd house and the Moon/Venus references per standard "
    "South-Indian practice."
)

_CANCEL_SOURCE: Final[str] = (
    "Classical chart-computable exceptions (standard Muhurta compilation; cf. "
    "B.V. Raman, 'Muhurtha'): Mars in its own sign (Aries/Scorpio) or exalted "
    "(Capricorn) causes no dosha; the five-fold sign-house exception — Aries "
    "in the 1st, Scorpio in the 4th, Capricorn in the 7th, Cancer in the 8th, "
    "Sagittarius in the 12th (stated from the Lagna)."
)

_MATCH_SOURCE: Final[str] = (
    "Mutual Kuja-dosha cancellation: when BOTH charts carry the dosha it "
    "stands neutralized between them — standard Muhurta practice; cf. B.V. "
    "Raman, 'Muhurtha', marriage adyaya."
)

_CONVENTION: Final[str] = (
    "Mars in whole-sign houses 1/2/4/7/8/12 from each reference; the 2nd "
    "house is the South-Indian inclusion (labeled). has_dosha applies the "
    "strictest screening convention: a net dosha under ANY of Lagna/Moon/"
    "Venus."
)

_DOSHA_HOUSES: Final[frozenset[int]] = frozenset({1, 2, 4, 7, 8, 12})

_SCHOOLS: Final[dict[MangalReference, str]] = {
    MangalReference.LAGNA: "from the Lagna — the classical reference (all schools)",
    MangalReference.MOON: "from the Moon — Chandra-lagna school",
    MangalReference.VENUS: "from Venus — South-Indian practice",
}

# The classical five-fold exception: house (from the Lagna) -> exempt sign.
_SIGN_HOUSE_EXCEPTIONS: Final[dict[int, ZodiacSign]] = {
    1: ZodiacSign.ARIES,
    4: ZodiacSign.SCORPIO,
    7: ZodiacSign.CAPRICORN,
    8: ZodiacSign.CANCER,
    12: ZodiacSign.SAGITTARIUS,
}

_OWN_SIGNS_OF_MARS: Final[frozenset[ZodiacSign]] = frozenset({ZodiacSign.ARIES, ZodiacSign.SCORPIO})


def _reference_sign_index(ctx: SiderealContext, reference: MangalReference) -> int:
    if reference is MangalReference.LAGNA:
        return sign_index(ctx.lagna.longitude)
    planet = PlanetName.MOON if reference is MangalReference.MOON else PlanetName.VENUS
    return sign_index(ctx.planets[planet].longitude)


def _sign_cancellations(mars_sign: ZodiacSign) -> list[DoshaCancellation]:
    """Sign-only exceptions — independent of the counting reference."""
    fired: list[tuple[str, str]] = []
    if mars_sign in _OWN_SIGNS_OF_MARS:
        fired.append(("mangal.own_sign", f"Mars stands in its own sign ({mars_sign.value})"))
    if mars_sign is EXALTATION_SIGN[PlanetName.MARS]:
        fired.append(("mangal.exalted", "Mars stands exalted (Capricorn)"))
    return [
        DoshaCancellation(rule=rule, description=desc, source=_CANCEL_SOURCE)
        for rule, desc in fired
    ]


def _house_cancellations(
    mars_sign: ZodiacSign, house: int, reference: MangalReference
) -> list[DoshaCancellation]:
    """The five-fold sign-house exception — stated for the Lagna count only."""
    if reference is not MangalReference.LAGNA:
        return []
    if _SIGN_HOUSE_EXCEPTIONS.get(house) is not mars_sign:
        return []
    description = f"Mars in {mars_sign.value} in the {house}th — classical five-fold exception"
    return [
        DoshaCancellation(
            rule="mangal.sign_house_exception", description=description, source=_CANCEL_SOURCE
        )
    ]


def _reference_result(ctx: SiderealContext, reference: MangalReference) -> MangalReferenceResult:
    mars = ctx.planets[PlanetName.MARS]
    house = whole_sign_house(sign_index(mars.longitude), _reference_sign_index(ctx, reference))
    in_dosha_house = house in _DOSHA_HOUSES
    cancellations: list[DoshaCancellation] = []
    if in_dosha_house:
        cancellations = _sign_cancellations(mars.sign) + _house_cancellations(
            mars.sign, house, reference
        )
    return MangalReferenceResult(
        reference=reference,
        school=_SCHOOLS[reference],
        mars_sign=mars.sign,
        mars_house=house,
        in_dosha_house=in_dosha_house,
        cancellations=cancellations,
        net_dosha=in_dosha_house and not cancellations,
        source=MANGAL_SOURCE,
    )


def compute_mangal_dosha(ctx: SiderealContext) -> MangalDoshaResult:
    """Mangal dosha screening for one finished chart (read-only input)."""
    references = [_reference_result(ctx, reference) for reference in MangalReference]
    return MangalDoshaResult(
        references=references,
        has_dosha=any(reference.net_dosha for reference in references),
        convention=_CONVENTION,
    )


def _affliction_label(dosha: MangalDoshaResult) -> str:
    return "afflicted" if dosha.has_dosha else "clear"


def compute_dosha_match(a: SiderealContext, b: SiderealContext) -> DoshaMatchResult:
    """Mutual Mangal-dosha comparison (classical both-afflicted neutralization)."""
    dosha_a, dosha_b = compute_mangal_dosha(a), compute_mangal_dosha(b)
    mutually_cancelled = dosha_a.has_dosha and dosha_b.has_dosha
    return DoshaMatchResult(
        a=dosha_a,
        b=dosha_b,
        mutually_cancelled=mutually_cancelled,
        compatible=mutually_cancelled or not (dosha_a.has_dosha or dosha_b.has_dosha),
        basis=f"chart a {_affliction_label(dosha_a)}, chart b {_affliction_label(dosha_b)}",
        source=_MATCH_SOURCE,
    )

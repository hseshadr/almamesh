"""Overlay — one chart's grahas on the other's whole-sign houses and points.

READ-ONLY: the guest's longitudes/signs and the host's lagna and natal points
are taken verbatim from two finished charts; nothing is recomputed. House
placement and graha drishti are whole-sign (the classical convention), with
the drishti offsets REUSED from ``almamesh.transits.aspects`` — the engine's
single source of truth for graha aspects. Conjunction convention: same sign is
the classical whole-sign yuti (kind ``same_sign``); ``close_conjunction``
additionally requires angular separation <= 3.0 deg — a modern tightening
convention, flagged ``heuristic`` on the contact.
"""

from __future__ import annotations

from typing import Final

from almamesh.constants.astrology import PlanetName
from almamesh.schemas.astrology import PlanetPosition, SiderealContext
from almamesh.schemas.mesh import (
    ChartOverlay,
    ContactKind,
    NatalPoint,
    OverlayContact,
    OverlayPair,
    OverlayPlacement,
)
from almamesh.transits.aspects import drishti_offsets
from almamesh.transits.natal import sign_index, whole_sign_house

CONJUNCTION_ORB_DEGREES: Final[float] = 3.0

_CONVENTION: Final[str] = (
    "Placements and drishti are whole-sign (classical); close_conjunction = "
    "same sign AND angular separation <= 3.0 deg — a modern orb convention, "
    "flagged heuristic on the contact."
)

_CONTACT_SOURCE: Final[str] = (
    "Graha drishti per the Parashari whole-sign aspects (BPHS drishti "
    "adhyaya; offsets reused from almamesh.transits.aspects). Same-sign yuti "
    "is the classical conjunction; the 3.0 deg close-conjunction orb is a "
    "modern convention (heuristic)."
)

_PLANET_ORDER: Final[tuple[PlanetName, ...]] = tuple(PlanetName)


def _separation_degrees(lon_a: float, lon_b: float) -> float:
    """Minimal angular separation between two longitudes, in degrees."""
    diff = abs(lon_a - lon_b) % 360.0
    return min(diff, 360.0 - diff)


def _host_points(host: SiderealContext) -> list[tuple[NatalPoint, float]]:
    """The host natal points targeted: lagna + all nine grahas (verbatim)."""
    points: list[tuple[NatalPoint, float]] = [(NatalPoint.LAGNA, host.lagna.longitude)]
    points.extend(
        (NatalPoint(planet.value), host.planets[planet].longitude) for planet in _PLANET_ORDER
    )
    return points


def _same_sign_contact(
    guest: PlanetPosition, target: NatalPoint, target_longitude: float, host_house: int
) -> OverlayContact:
    separation = _separation_degrees(guest.longitude, target_longitude)
    close = separation <= CONJUNCTION_ORB_DEGREES
    return OverlayContact(
        planet=guest.name,
        target=target,
        kind=ContactKind.CLOSE_CONJUNCTION if close else ContactKind.SAME_SIGN,
        host_house=host_house,
        orb_degrees=separation,
        heuristic=close,
        source=_CONTACT_SOURCE,
    )


def _contact_for(
    guest: PlanetPosition, target: NatalPoint, target_longitude: float, host_house: int
) -> OverlayContact | None:
    offset = (sign_index(target_longitude) - sign_index(guest.longitude)) % 12 + 1
    if offset == 1:
        return _same_sign_contact(guest, target, target_longitude, host_house)
    if offset not in drishti_offsets(guest.name):
        return None
    return OverlayContact(
        planet=guest.name,
        target=target,
        kind=ContactKind.GRAHA_DRISHTI,
        host_house=host_house,
        orb_degrees=None,
        heuristic=False,
        source=_CONTACT_SOURCE,
    )


def _guest_contacts(
    guest: PlanetPosition, points: list[tuple[NatalPoint, float]], host_house: int
) -> list[OverlayContact]:
    contacts: list[OverlayContact] = []
    for target, target_longitude in points:
        contact = _contact_for(guest, target, target_longitude, host_house)
        if contact is not None:
            contacts.append(contact)
    return contacts


def compute_overlay(host: SiderealContext, guest: SiderealContext) -> ChartOverlay:
    """The guest chart's grahas overlaid on the host chart (both read-only)."""
    host_lagna_idx = sign_index(host.lagna.longitude)
    points = _host_points(host)
    placements: list[OverlayPlacement] = []
    contacts: list[OverlayContact] = []
    for name in _PLANET_ORDER:
        planet = guest.planets[name]
        host_house = whole_sign_house(sign_index(planet.longitude), host_lagna_idx)
        placements.append(OverlayPlacement(planet=name, sign=planet.sign, host_house=host_house))
        contacts.extend(_guest_contacts(planet, points, host_house))
    return ChartOverlay(
        host_lagna_sign=host.lagna.sign,
        placements=placements,
        contacts=contacts,
        conjunction_orb_degrees=CONJUNCTION_ORB_DEGREES,
        convention=_CONVENTION,
    )


def compute_overlay_pair(a: SiderealContext, b: SiderealContext) -> OverlayPair:
    """Both overlay directions for a pair of charts."""
    return OverlayPair(
        b_in_a=compute_overlay(host=a, guest=b),
        a_in_b=compute_overlay(host=b, guest=a),
    )

"""Overlay: guest grahas on host whole-sign houses + typed contacts.

The drishti offsets are REUSED from almamesh.transits.aspects (single source of
truth for graha aspects); this file locks that reuse and pins hand-verified
contacts between two real generic charts.
"""

from __future__ import annotations

from datetime import UTC, datetime
from functools import cache

from almamesh.calculations import calculate_sidereal_context
from almamesh.constants.astrology import PlanetName
from almamesh.mesh import compute_overlay, compute_overlay_pair
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import ContactKind, NatalPoint
from almamesh.transits.aspects import drishti_offsets

FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
MUMBAI = ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777)


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def test_drishti_offsets_are_the_classical_special_aspects() -> None:
    """Single source of truth: Saturn 3/7/10, Mars 4/7/8, Jupiter 5/7/9,
    everyone else (incl. the nodes, per the engine's fusion convention) 7."""
    assert drishti_offsets(PlanetName.SATURN) == frozenset({3, 7, 10})
    assert drishti_offsets(PlanetName.MARS) == frozenset({4, 7, 8})
    assert drishti_offsets(PlanetName.JUPITER) == frozenset({5, 7, 9})
    assert drishti_offsets(PlanetName.SUN) == frozenset({7})
    assert drishti_offsets(PlanetName.RAHU) == frozenset({7})


def test_overlay_places_all_nine_guest_grahas() -> None:
    overlay = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    assert len(overlay.placements) == 9
    assert {p.planet for p in overlay.placements} == set(PlanetName)
    assert all(1 <= p.host_house <= 12 for p in overlay.placements)


def test_mumbai_mars_lands_in_delhis_second_house_and_aspects() -> None:
    """Hand-verified: Mumbai Mars is in Cancer; Delhi lagna is Gemini, so the
    guest Mars sits in host house 2. Mars casts the 7th drishti from Cancer
    onto Capricorn — where Delhi's natal Sun AND Venus sit."""
    overlay = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    (mars_placement,) = [p for p in overlay.placements if p.planet is PlanetName.MARS]
    assert mars_placement.host_house == 2

    mars_contacts = {(c.target, c.kind) for c in overlay.contacts if c.planet is PlanetName.MARS}
    assert (NatalPoint.SUN, ContactKind.GRAHA_DRISHTI) in mars_contacts
    assert (NatalPoint.VENUS, ContactKind.GRAHA_DRISHTI) in mars_contacts


def test_contacts_carry_house_orb_and_heuristic_flags() -> None:
    overlay = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    assert overlay.conjunction_orb_degrees == 3.0
    for contact in overlay.contacts:
        assert 1 <= contact.host_house <= 12
        assert contact.source
        if contact.kind is ContactKind.GRAHA_DRISHTI:
            assert contact.orb_degrees is None
            assert not contact.heuristic
        else:  # same-sign kinds always carry the measured separation
            assert contact.orb_degrees is not None
            assert 0.0 <= contact.orb_degrees <= 30.0
        # ONLY the modern close-conjunction orb is a heuristic.
        assert contact.heuristic == (contact.kind is ContactKind.CLOSE_CONJUNCTION)
        if contact.kind is ContactKind.CLOSE_CONJUNCTION:
            assert contact.orb_degrees is not None and contact.orb_degrees <= 3.0


def test_contact_house_matches_the_guest_planets_placement() -> None:
    overlay = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    house_of = {p.planet: p.host_house for p in overlay.placements}
    for contact in overlay.contacts:
        assert contact.host_house == house_of[contact.planet]


def test_overlay_pair_is_both_directions() -> None:
    a, b = _chart(*DELHI), _chart(*MUMBAI)
    pair = compute_overlay_pair(a, b)
    assert pair.b_in_a == compute_overlay(host=a, guest=b)
    assert pair.a_in_b == compute_overlay(host=b, guest=a)
    assert pair.b_in_a.host_lagna_sign == a.lagna.sign
    assert pair.a_in_b.host_lagna_sign == b.lagna.sign


def test_overlay_is_deterministic() -> None:
    one = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    two = compute_overlay(host=_chart(*DELHI), guest=_chart(*MUMBAI))
    assert one == two

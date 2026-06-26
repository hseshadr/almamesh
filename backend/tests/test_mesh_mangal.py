"""Mangal (Kuja) dosha: per-reference verdicts, cancellations, mutual match.

House counting is whole-sign from each reference point (lagna / Moon / Venus —
each labeled with its school). Hand-derived expectations below use the engine's
own emitted signs for the generic parity-fixture births:

  Delhi : Lagna Gemini, Moon Leo, Venus Capricorn, Mars Scorpio (own sign).
  Mumbai: Lagna Leo, Moon Virgo, Venus Taurus, Mars Cancer.
  London: Lagna Aries, Moon Sagittarius, Venus Aries, Mars Aries (own sign).
  Sydney: Lagna Aries, Moon Libra, Venus Cancer, Mars Leo.
  Tokyo : Lagna Virgo, Moon Pisces, Venus Scorpio, Mars Virgo.
"""

from __future__ import annotations

from datetime import UTC, datetime
from functools import cache

from almamesh.calculations import calculate_sidereal_context
from almamesh.mesh import compute_dosha_match, compute_mangal_dosha
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import MangalReference

FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)

DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
MUMBAI = ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777)
LONDON = ("1972-03-10T08:15:00+00:00", 51.5074, -0.1278)
SYDNEY = ("2010-06-21T18:00:00+00:00", -33.8688, 151.2093)
TOKYO = ("2019-11-09T17:45:00+00:00", 35.6895, 139.6917)


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def _by_ref(result, reference: MangalReference):  # type: ignore[no-untyped-def]
    (row,) = [r for r in result.references if r.reference is reference]
    return row


def test_delhi_moon_reference_dosha_cancelled_by_own_sign_mars() -> None:
    """Delhi: Mars Scorpio. From Lagna (Gemini) 6th — clear. From Moon (Leo)
    4th — dosha house, but Mars is in OWN sign (Scorpio) -> cancelled. From
    Venus (Capricorn) 11th — clear. Net: no dosha."""
    result = compute_mangal_dosha(_chart(*DELHI))
    lagna = _by_ref(result, MangalReference.LAGNA)
    moon = _by_ref(result, MangalReference.MOON)
    venus = _by_ref(result, MangalReference.VENUS)

    assert lagna.mars_house == 6 and not lagna.in_dosha_house
    assert moon.mars_house == 4 and moon.in_dosha_house
    assert any(c.rule == "mangal.own_sign" for c in moon.cancellations)
    assert not moon.net_dosha
    assert venus.mars_house == 11 and not venus.in_dosha_house
    assert not result.has_dosha


def test_mumbai_is_manglik_from_lagna_twelfth_house() -> None:
    """Mumbai: Mars Cancer from Leo lagna = 12th — dosha house, debilitated
    Mars earns NO chart-computable cancellation here -> net dosha."""
    result = compute_mangal_dosha(_chart(*MUMBAI))
    lagna = _by_ref(result, MangalReference.LAGNA)
    assert lagna.mars_house == 12 and lagna.in_dosha_house
    assert lagna.cancellations == []
    assert lagna.net_dosha
    assert result.has_dosha


def test_london_first_house_own_sign_mars_is_fully_cancelled() -> None:
    """London: Mars Aries in the 1st from lagna — dosha house, but BOTH the
    own-sign rule and the classical Aries-in-1st sign-house exception fire."""
    result = compute_mangal_dosha(_chart(*LONDON))
    lagna = _by_ref(result, MangalReference.LAGNA)
    assert lagna.mars_house == 1 and lagna.in_dosha_house
    rules = {c.rule for c in lagna.cancellations}
    assert "mangal.own_sign" in rules
    assert "mangal.sign_house_exception" in rules
    assert not lagna.net_dosha
    assert not result.has_dosha


def test_venus_reference_school_is_emitted_and_labeled() -> None:
    """Sydney: Mars Leo is 2nd from Venus (Cancer) — dosha under the
    Venus-reference school only (2nd house is the South-Indian inclusion)."""
    result = compute_mangal_dosha(_chart(*SYDNEY))
    venus = _by_ref(result, MangalReference.VENUS)
    assert venus.mars_house == 2 and venus.in_dosha_house and venus.net_dosha
    assert not _by_ref(result, MangalReference.LAGNA).in_dosha_house
    assert not _by_ref(result, MangalReference.MOON).in_dosha_house
    assert result.has_dosha  # strictest screening: any reference
    assert "2nd" in result.convention or "2" in result.convention
    assert all(r.school for r in result.references)
    assert all(r.source for r in result.references)


def test_one_sided_dosha_is_not_compatible() -> None:
    match = compute_dosha_match(_chart(*DELHI), _chart(*MUMBAI))
    assert not match.a.has_dosha
    assert match.b.has_dosha
    assert not match.mutually_cancelled
    assert not match.compatible


def test_mutual_dosha_neutralizes() -> None:
    """Sydney and Tokyo are both afflicted -> classical mutual cancellation."""
    match = compute_dosha_match(_chart(*SYDNEY), _chart(*TOKYO))
    assert match.a.has_dosha and match.b.has_dosha
    assert match.mutually_cancelled
    assert match.compatible
    assert match.source

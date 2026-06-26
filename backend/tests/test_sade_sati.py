"""Sade Sati — Saturn over the 12th/1st/2nd from the natal Moon (the headline).

Reference anchors (Lahiri sidereal, cross-checked against published panchanga /
Jagannatha Hora Saturn ingress tables):
  - Saturn enters Pisces  ~2025-03-29
  - Saturn enters Aries    2027-06 (then RETROGRADES back to Pisces 2027-10,
    re-enters Aries 2028-02) -> the sticking ingress is the LAST one (~2028-02-25)
With Saturn in Pisces in mid-2026, a natal Moon in Pisces is in Sade Sati PEAK,
Aries is RISING (Saturn in the 12th), Aquarius is SETTING (Saturn in the 2nd),
and a far sign (e.g. Cancer) is NOT in Sade Sati.
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import SkyfieldAstronomy
from almamesh.constants.astrology import ZodiacSign
from almamesh.schemas.transits import SadeSatiPhase
from almamesh.transits.sade_sati import build_sade_sati_context

_NOW = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)  # Saturn in Pisces


def _ctx(moon_sign: ZodiacSign, instant: datetime = _NOW):
    astro = SkyfieldAstronomy()
    moon_idx = list(ZodiacSign).index(moon_sign)
    return build_sade_sati_context(astro, moon_idx, instant)


def test_should_report_peak_when_saturn_over_natal_moon_sign() -> None:
    # Given a natal Moon in Pisces while Saturn transits Pisces
    ctx = _ctx(ZodiacSign.PISCES)
    # Then Sade Sati is active in the PEAK phase
    assert ctx.is_active is True
    assert ctx.current_phase == SadeSatiPhase.PEAK.value


def test_should_report_rising_when_saturn_in_twelfth_from_moon() -> None:
    # Given a natal Moon in Aries (Saturn in Pisces is its 12th)
    ctx = _ctx(ZodiacSign.ARIES)
    # Then it is the RISING phase
    assert ctx.is_active is True
    assert ctx.current_phase == SadeSatiPhase.RISING.value


def test_should_report_inactive_when_saturn_far_from_moon() -> None:
    # Given a natal Moon in Cancer (Saturn in Pisces is the 9th — not Sade Sati)
    ctx = _ctx(ZodiacSign.CANCER)
    # Then Sade Sati is inactive
    assert ctx.is_active is False
    assert ctx.current_phase == SadeSatiPhase.NONE.value


def test_should_span_three_phases_with_reference_dates() -> None:
    # Given a Pisces-Moon native currently in Sade Sati
    ctx = _ctx(ZodiacSign.PISCES)
    # Then the cycle has three segments (rising, peak, setting) in order
    phases = [seg.phase for seg in ctx.cycle]
    assert phases == [
        SadeSatiPhase.RISING.value,
        SadeSatiPhase.PEAK.value,
        SadeSatiPhase.SETTING.value,
    ]
    # And the peak phase began when Saturn entered Pisces (~2025-03-29, +/-7 days)
    peak = next(s for s in ctx.cycle if s.phase == SadeSatiPhase.PEAK.value)
    assert datetime(2025, 3, 22, tzinfo=UTC) <= peak.start <= datetime(2025, 4, 5, tzinfo=UTC)
    # And the whole cycle runs start(12th entry) < ... < end(leaving the 2nd)
    assert ctx.cycle_start is not None and ctx.cycle_end is not None
    assert ctx.cycle_start < ctx.cycle_end


def test_should_take_last_crossing_when_saturn_retrogrades_over_cusp() -> None:
    # Given an Aries-Moon native: Saturn's PEAK entry is its ingress into Aries,
    # which retrogrades (2027-06 in, 2027-10 back to Pisces, 2028-02 final in).
    ctx = _ctx(ZodiacSign.ARIES, instant=datetime(2027, 9, 1, tzinfo=UTC))
    peak = next(s for s in ctx.cycle if s.phase == SadeSatiPhase.PEAK.value)
    # Then the PEAK start is the LAST (sticking) Aries ingress (~2028-02-25),
    # NOT the first (2027-06) — the retrograde-correctness rule.
    assert peak.start >= datetime(2028, 1, 1, tzinfo=UTC)
    assert peak.start <= datetime(2028, 3, 15, tzinfo=UTC)

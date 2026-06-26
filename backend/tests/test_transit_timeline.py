"""12-month forward timeline: dated, sorted, prose-free structured events."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from almamesh.calculations import SkyfieldAstronomy, calculate_sidereal_context
from almamesh.schemas.transits import TransitEventKind
from almamesh.transits.timeline import build_timeline

_BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
_DELHI = (28.6139, 77.2090)
# Saturn enters Aries ~2027-06; a window covering it must surface that ingress.
_START = datetime(2027, 1, 1, 0, 0, 0, tzinfo=UTC)
_DESCRIPTOR = re.compile(r"^[a-z0-9]+(\.[a-z0-9_]+)+$")


def _natal():
    return calculate_sidereal_context(_BIRTH, *_DELHI, reference_date=_START)


def test_should_contain_saturn_aries_ingress_with_descriptor() -> None:
    # Given a 12-month window spanning Saturn's 2027 ingress into Aries
    natal = _natal()
    astro = SkyfieldAstronomy()
    # When the timeline is built
    timeline = build_timeline(astro, natal, _BIRTH, _START, window_months=12)
    # Then a Saturn sign-ingress into Aries appears with a stable descriptor
    ingresses = [e for e in timeline.events if e.kind == TransitEventKind.SIGN_INGRESS.value]
    aries = [e for e in ingresses if e.descriptor == "saturn.ingress.aries"]
    assert aries, [e.descriptor for e in ingresses]
    assert datetime(2027, 5, 1, tzinfo=UTC) <= aries[0].date <= datetime(2027, 7, 15, tzinfo=UTC)


def test_should_sort_events_and_keep_them_in_window() -> None:
    # Given the built 12-month timeline
    natal = _natal()
    astro = SkyfieldAstronomy()
    timeline = build_timeline(astro, natal, _BIRTH, _START, window_months=12)
    # Then events are chronologically sorted and all inside [start, end]
    dates = [e.date for e in timeline.events]
    assert dates == sorted(dates)
    for e in timeline.events:
        assert timeline.window_start <= e.date <= timeline.window_end
    # And no fast-graha noise: only the slow grahas (Jupiter/Saturn) ingress
    for e in timeline.events:
        if e.kind == TransitEventKind.SIGN_INGRESS.value and e.graha is not None:
            assert e.graha in {"jupiter", "saturn"}


def test_should_emit_descriptor_keys_not_prose() -> None:
    # Given the built timeline
    natal = _natal()
    astro = SkyfieldAstronomy()
    timeline = build_timeline(astro, natal, _BIRTH, _START, window_months=12)
    # Then every descriptor is a dotted machine key, never a sentence
    assert timeline.events  # non-empty so the assertion is meaningful
    for e in timeline.events:
        assert _DESCRIPTOR.match(e.descriptor), e.descriptor
        assert " " not in e.descriptor

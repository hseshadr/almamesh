"""TDD: chart output must be a pure function of (birth data, reference_date).

The Vimshottari "current maha dasha" is the period that contains "now". Reading
the wall clock inside the engine makes a chart non-reproducible: the same birth
data yields different output on different days. That breaks CPython<->Pyodide
byte-parity (P2) and the plan's deterministic session version-lock. The "now"
reference must therefore be injectable.
"""

from datetime import UTC, datetime

from almamesh.calculations import (
    PlanetName,
    calculate_sidereal_context,
    calculate_vimshottari_dashas,
)

# Reference chart: 1983-04-05 05:50 IST, Chennai -> 1983-04-05 00:20 UTC.
_REFERENCE_BIRTH = datetime(1983, 4, 5, 0, 20, tzinfo=UTC)
_LAT, _LON = 13.0827, 80.2707


def _moon_longitude() -> float:
    ctx = calculate_sidereal_context(_REFERENCE_BIRTH, _LAT, _LON)
    return ctx.planets[PlanetName.MOON].longitude


def test_current_maha_is_the_period_containing_the_reference_date() -> None:
    as_of = datetime(2020, 6, 1, tzinfo=UTC)

    dashas = calculate_vimshottari_dashas(_moon_longitude(), _REFERENCE_BIRTH, reference_date=as_of)

    assert dashas.current_maha is not None
    assert dashas.current_maha.start_date <= as_of < dashas.current_maha.end_date


def test_current_maha_changes_with_the_reference_date() -> None:
    moon_long = _moon_longitude()

    early = calculate_vimshottari_dashas(
        moon_long, _REFERENCE_BIRTH, reference_date=datetime(1990, 1, 1, tzinfo=UTC)
    )
    late = calculate_vimshottari_dashas(
        moon_long, _REFERENCE_BIRTH, reference_date=datetime(2050, 1, 1, tzinfo=UTC)
    )

    assert early.current_maha is not None
    assert late.current_maha is not None
    # 60 years apart -> different maha period (sequence spans 120y, no repeats).
    assert early.current_maha.lord != late.current_maha.lord


def test_calculate_sidereal_context_threads_reference_date() -> None:
    as_of = datetime(2020, 6, 1, tzinfo=UTC)

    ctx = calculate_sidereal_context(_REFERENCE_BIRTH, _LAT, _LON, reference_date=as_of)

    assert ctx.dashas.current_maha is not None
    assert ctx.dashas.current_maha.start_date <= as_of < ctx.dashas.current_maha.end_date


def test_chart_is_byte_reproducible_for_a_fixed_reference_date() -> None:
    as_of = datetime(2020, 6, 1, tzinfo=UTC)

    a = calculate_sidereal_context(_REFERENCE_BIRTH, _LAT, _LON, reference_date=as_of)
    b = calculate_sidereal_context(_REFERENCE_BIRTH, _LAT, _LON, reference_date=as_of)

    assert a.model_dump(mode="json") == b.model_dump(mode="json")

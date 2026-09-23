"""Birth-coordinate validation and the ayanamsa table boundary both FAIL CLOSED.

Before this guard, nothing range-checked a coordinate: ``calculate_lagna`` feeds
``tan(radians(lat))``, which has period 180 deg, so ``lat=200`` silently produced
the ``lat=20`` chart. And the Lahiri table reader clamped any instant outside its
1900-2100 span to the table's end value, contradicting its own "fails closed"
docstring. Both are now explicit, stable, value-free errors.

Pole policy: the Ascendant is undefined at a geographic pole (the ecliptic's
rising point degenerates; ``tan(90 deg)`` is a ~1.6e16 float, not an error), so
``|latitude| == 90`` is REJECTED. The accepted latitude interval is the OPEN
interval (-90, 90); longitude is the CLOSED interval [-180, 180].
"""

import math
from datetime import UTC, date, datetime

import pytest
from edgeproc import PrivacyMode, Task, TaskKind

from almamesh.calculations import (
    AyanamsaCalculator,
    InvalidBirthInputError,
    calculate_sidereal_context,
    validate_coordinates,
)
from almamesh.constants.astrology import EventType
from almamesh.edge.chart_runtime import ChartRuntime
from almamesh.rectification import compute_rectification_result
from almamesh.rectification.models import RectificationEventInput, RectificationMode

_DT = datetime(1990, 1, 15, 12, 0, tzinfo=UTC)
_REF = datetime(2025, 1, 1, tzinfo=UTC)

LAT_RANGE = "invalid coordinate: latitude out of range (-90, 90)"
LON_RANGE = "invalid coordinate: longitude out of range [-180, 180]"
LAT_FINITE = "invalid coordinate: latitude must be a finite number"
LON_FINITE = "invalid coordinate: longitude must be a finite number"


def test_error_is_a_value_error() -> None:
    """A ValueError, so ChartRuntime.execute still turns it into an envelope."""
    assert issubclass(InvalidBirthInputError, ValueError)


@pytest.mark.parametrize(
    ("lat", "lon"),
    [
        (0.0, 0.0),
        (89.999999, 180.0),
        (-89.999999, -180.0),
        (13.0827, 80.2707),
        (40, -74),  # ints are valid wire numbers
    ],
)
def test_valid_coordinates_pass(lat: float, lon: float) -> None:
    validate_coordinates(lat, lon)


@pytest.mark.parametrize(
    ("lat", "lon", "message"),
    [
        (200.0, 0.0, LAT_RANGE),
        (-90.000001, 0.0, LAT_RANGE),
        (90.0, 0.0, LAT_RANGE),  # pole: Ascendant undefined -> rejected
        (-90.0, 0.0, LAT_RANGE),
        (0.0, 180.000001, LON_RANGE),
        (0.0, -181.0, LON_RANGE),
        (0.0, 540.0, LON_RANGE),
        (math.nan, 0.0, LAT_FINITE),
        (math.inf, 0.0, LAT_FINITE),
        (-math.inf, 0.0, LAT_FINITE),
        (0.0, math.nan, LON_FINITE),
        (0.0, math.inf, LON_FINITE),
    ],
)
def test_invalid_coordinates_raise_stable_message(lat: float, lon: float, message: str) -> None:
    with pytest.raises(InvalidBirthInputError) as info:
        validate_coordinates(lat, lon)
    assert str(info.value) == message


@pytest.mark.parametrize("bad", [None, True, "13.0", [1.0]])
def test_non_numeric_coordinates_raise(bad: object) -> None:
    with pytest.raises(InvalidBirthInputError) as info:
        validate_coordinates(bad, 0.0)  # type: ignore[arg-type]
    assert str(info.value) == LAT_FINITE


def test_sidereal_context_rejects_out_of_range_latitude() -> None:
    """lat=200 used to alias to the lat=20 chart via tan's 180-deg period."""
    with pytest.raises(InvalidBirthInputError, match=r"latitude out of range"):
        calculate_sidereal_context(_DT, 200.0, 0.0, reference_date=_REF)


def test_sidereal_context_rejects_out_of_range_longitude() -> None:
    with pytest.raises(InvalidBirthInputError, match=r"longitude out of range"):
        calculate_sidereal_context(_DT, 0.0, 181.0, reference_date=_REF)


async def test_chart_runtime_turns_invalid_coordinate_into_error_envelope() -> None:
    task = Task(
        kind=TaskKind.DETERMINISTIC,
        payload={"datetime_utc": _DT.isoformat(), "latitude": 200.0, "longitude": 0.0},
        privacy_mode=PrivacyMode.LOCAL_ONLY,
    )
    envelope = await ChartRuntime().execute(task)
    assert envelope.success is False
    assert envelope.error == LAT_RANGE


def test_rectification_rejects_out_of_range_latitude_before_scoring() -> None:
    """Rectification builds cusp candidates BEFORE the natal context; guard it first."""
    with pytest.raises(InvalidBirthInputError) as info:
        compute_rectification_result(
            dt_utc=_DT,
            latitude=200.0,
            longitude=0.0,
            utc_offset_minutes=0,
            events=[RectificationEventInput(date=date(2010, 6, 1), category=EventType.MARRIAGE)],
            mode=RectificationMode.CUSP,
            reference_date=_REF,
        )
    assert str(info.value) == LAT_RANGE


# --- Ayanamsa table boundary -------------------------------------------------

_TABLE_FIRST_JD = 2415020.5  # 1900-01-01
_TABLE_LAST_JD = 2488433.5  # 2100-12-31
AYANAMSA_RANGE = (
    "Lahiri ayanamsa table range exceeded: instant outside 1900-01-01..2100-12-31 (fail-closed)"
)


@pytest.mark.parametrize("jd", [_TABLE_FIRST_JD - 1.0, _TABLE_LAST_JD + 1.0, 0.0])
def test_ayanamsa_table_fails_closed_outside_range(jd: float) -> None:
    with pytest.raises(ValueError) as info:
        AyanamsaCalculator().get_ayanamsa(jd)
    assert str(info.value) == AYANAMSA_RANGE


@pytest.mark.parametrize(
    ("jd", "expected"),
    [(_TABLE_FIRST_JD, 22.4602), (_TABLE_LAST_JD, 25.2674)],
)
def test_ayanamsa_table_endpoints_are_inclusive(jd: float, expected: float) -> None:
    assert AyanamsaCalculator().get_ayanamsa(jd) == pytest.approx(expected)


def test_sidereal_context_before_1900_fails_closed() -> None:
    """DE421 starts 1899-07; the table does not. Refuse rather than clamp."""
    with pytest.raises(ValueError, match=r"ayanamsa table range exceeded"):
        calculate_sidereal_context(
            datetime(1899, 12, 1, tzinfo=UTC), 13.0, 80.0, reference_date=_REF
        )

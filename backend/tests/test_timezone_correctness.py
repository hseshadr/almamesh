"""Cross-timezone correctness for the sidereal chart engine.

THE BUG (generic, all non-UTC timezones): the engine built Skyfield times with
``dt.replace(tzinfo=UTC)``, which RELABELS a timezone-aware datetime as UTC
instead of CONVERTING it — silently dropping the offset. So
``1988-08-08T06:44:00+05:30`` was treated as ``06:44 UTC`` instead of the true
``01:14 UTC``, producing a wrong chart for every offset != 0.

This suite locks the fix three ways:
  1. EQUIVALENCE: an aware local datetime and its ``.astimezone(UTC)`` equivalent
     are the SAME instant -> must yield byte-identical lagna + planet longitudes.
  2. GOLDEN signs: pinned Lagna signs for diverse cities (a silently-wrong engine
     shifts them).
  3. CUSP fixture: a documented near-boundary case where +/-30 min flips the Lagna
     sign -- proves the engine resolves fine time differences correctly, and guards
     against ever defaulting to a country-standard meridian instead of the real
     birth longitude.
"""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from almamesh.calculations import AyanamsaType, PlanetName, calculate_sidereal_context
from almamesh.schemas.astrology import SiderealContext

# Fixed "now" so the (dasha-dependent) chart is reproducible; longitudes unaffected.
FIXED_REFERENCE_DATE = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)

# Same-instant longitudes must match to the last bit (they ARE the same instant).
EQUIVALENCE_TOL = 1e-6

# (label, offset, latitude, longitude) -- spanning -/+ , whole-hour + half-hour.
_OFFSET_CASES: list[tuple[str, timedelta, float, float]] = [
    ("America/Los_Angeles -08:00", timedelta(hours=-8), 37.77, -122.42),
    ("America/New_York -05:00", timedelta(hours=-5), 40.71, -74.01),
    ("UTC +00:00", timedelta(hours=0), 51.51, -0.13),
    ("Asia/Kolkata +05:30", timedelta(hours=5, minutes=30), 12.97, 77.59),
    ("Asia/Tokyo +09:00", timedelta(hours=9), 35.68, 139.69),
    ("Australia/Sydney +10:00", timedelta(hours=10), -33.87, 151.21),
]


def _chart(dt: datetime, lat: float, lon: float) -> SiderealContext:
    """Run the engine with the fixed reference date for reproducibility."""
    return calculate_sidereal_context(dt, lat, lon, reference_date=FIXED_REFERENCE_DATE)


def _planet_longitudes(chart: SiderealContext) -> dict[PlanetName, float]:
    """All 9 planet sidereal longitudes keyed by planet."""
    return {name: planet.longitude for name, planet in chart.planets.items()}


@pytest.mark.parametrize(("label", "offset", "lat", "lon"), _OFFSET_CASES)
def test_aware_local_equals_same_instant_in_utc(
    label: str, offset: timedelta, lat: float, lon: float
) -> None:
    """An aware local dt and its UTC equivalent are the SAME instant -> same chart.

    Pre-fix, ``.replace(tzinfo=UTC)`` dropped the offset, so the local-time chart
    used the wrong instant and diverged from the UTC chart for every offset != 0.
    """
    tz = timezone(offset)
    local_dt = datetime(1985, 7, 23, 13, 17, 0, tzinfo=tz)
    utc_dt = local_dt.astimezone(UTC)

    local_chart = _chart(local_dt, lat, lon)
    utc_chart = _chart(utc_dt, lat, lon)

    assert local_chart.lagna.longitude == pytest.approx(
        utc_chart.lagna.longitude, abs=EQUIVALENCE_TOL
    ), f"{label}: lagna diverged (offset dropped?)"

    local_planets = _planet_longitudes(local_chart)
    utc_planets = _planet_longitudes(utc_chart)
    for name, lon_local in local_planets.items():
        assert lon_local == pytest.approx(utc_planets[name], abs=EQUIVALENCE_TOL), (
            f"{label}: {name.value} diverged (offset dropped?)"
        )


# Pinned Lagna signs for diverse cities (UTC inputs) -- a silently-wrong engine
# would shift these. Mirrors test_chart_golden::test_delhi_reference_signs_are_sane.
_GOLDEN_LAGNA_SIGNS: list[tuple[str, float, float, str]] = [
    ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090, "Gemini"),  # Delhi
    ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060, "Cancer"),  # NYC
    ("1972-03-10T08:15:00+00:00", 51.5074, -0.1278, "Aries"),  # London
]


@pytest.mark.parametrize(("iso", "lat", "lon", "expected_sign"), _GOLDEN_LAGNA_SIGNS)
def test_known_good_lagna_signs(iso: str, lat: float, lon: float, expected_sign: str) -> None:
    """Pinned Lagna signs for diverse cities (the golden human-sanity guard)."""
    chart = _chart(datetime.fromisoformat(iso), lat, lon)
    assert chart.lagna.sign.value == expected_sign


# Illustrative cusp fixture (generic): near a sign boundary, +/-30 min flips the
# Lagna sign. Bengaluru 12.9716 N, 77.5946 E, Lahiri, Whole Sign. The 06:44 IST
# birth (01:14Z) lands on the Cancer/Leo cusp.
_BENGALURU_LAT = 12.9716
_BENGALURU_LON = 77.5946


def test_cusp_fixture_30min_flips_lagna_sign() -> None:
    """A documented near-boundary case: +/-30 min crosses a Lagna sign boundary.

    06:14 IST (00:44Z) -> Cancer ~22.9 deg; 07:14 IST (01:44Z) -> Leo ~7.2 deg.
    Proves the engine resolves fine time differences (and offsets) correctly.
    """
    early = _chart(datetime(1988, 8, 8, 0, 44, 0, tzinfo=UTC), _BENGALURU_LAT, _BENGALURU_LON)
    assert early.lagna.sign.value == "Cancer"
    assert early.lagna.sign_degrees == pytest.approx(22.9, abs=0.2)

    late = _chart(datetime(1988, 8, 8, 1, 44, 0, tzinfo=UTC), _BENGALURU_LAT, _BENGALURU_LON)
    assert late.lagna.sign.value == "Leo"
    assert late.lagna.sign_degrees == pytest.approx(7.2, abs=0.2)


def test_cusp_via_aware_ist_matches_utc() -> None:
    """The same cusp instant given as aware IST must equal the UTC chart.

    This is the end-to-end proof of the fix: 06:44 +05:30 == 01:14Z.
    """
    ist = timezone(timedelta(hours=5, minutes=30))
    aware = _chart(datetime(1988, 8, 8, 6, 44, 0, tzinfo=ist), _BENGALURU_LAT, _BENGALURU_LON)
    utc = _chart(datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC), _BENGALURU_LAT, _BENGALURU_LON)
    assert aware.lagna.sign.value == "Leo"
    assert aware.lagna.longitude == pytest.approx(utc.lagna.longitude, abs=EQUIVALENCE_TOL)


def test_wrong_country_meridian_is_not_used() -> None:
    """Guard: using a wrong meridian instead of the real birth longitude is WRONG
    -> it flips the sign. Documents that we never default to a standard meridian.

    At 00:44Z the true Bengaluru longitude (77.59 E) gives Cancer; a far-off
    meridian (90.0 E) crosses into Leo.
    """
    real = _chart(datetime(1988, 8, 8, 0, 44, 0, tzinfo=UTC), _BENGALURU_LAT, _BENGALURU_LON)
    wrong = _chart(datetime(1988, 8, 8, 0, 44, 0, tzinfo=UTC), _BENGALURU_LAT, 90.0)
    assert real.lagna.sign.value == "Cancer"
    assert wrong.lagna.sign.value == "Leo"
    assert real.lagna.sign.value != wrong.lagna.sign.value


def test_ayanamsa_type_default_is_lahiri() -> None:
    """The cusp fixtures assume the default Lahiri ayanamsa; pin it explicitly."""
    sig_default = _chart(datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC), _BENGALURU_LAT, _BENGALURU_LON)
    sig_lahiri = calculate_sidereal_context(
        datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC),
        _BENGALURU_LAT,
        _BENGALURU_LON,
        ayanamsa_type=AyanamsaType.LAHIRI,
        reference_date=FIXED_REFERENCE_DATE,
    )
    assert sig_default.lagna.longitude == pytest.approx(sig_lahiri.lagna.longitude, abs=1e-9)

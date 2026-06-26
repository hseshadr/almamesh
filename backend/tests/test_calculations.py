"""
Test chart calculations - TDD: These tests define expected behavior.

Run: pytest tests/test_calculations.py -xvs
"""

from datetime import UTC, datetime

from almamesh.calculations import (
    PlanetName,
    ZodiacSign,
    calculate_sidereal_context,
)


def _parse_birth_data(birth_data: dict) -> tuple[datetime, float, float]:
    """Convert fixture birth data to calculate_sidereal_context arguments."""
    import pytz
    from dateutil import parser

    date_str = birth_data["date"]
    time_str = birth_data["time"]
    tz_name = birth_data["timezone"]

    # Parse datetime in local timezone, then convert to UTC
    local_tz = pytz.timezone(tz_name)
    local_dt = parser.parse(f"{date_str} {time_str}")
    local_dt = local_tz.localize(local_dt)
    utc_dt = local_dt.astimezone(UTC)

    return utc_dt, birth_data["latitude"], birth_data["longitude"]


class TestLagnaCalculation:
    """Lagna (Ascendant) calculation tests."""

    def test_lagna_for_reference_is_pisces(self, reference_birth_data):
        """
        Given: The reference chart's birth data (1983-04-05, 05:50, Chennai)
        When: Calculating lagna
        Then: Lagna should be Pisces (known verified value)
        """
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        assert context.lagna.sign == ZodiacSign.PISCES
        assert 0 <= context.lagna.sign_degrees < 30  # Valid degree range

    def test_lagna_uses_sidereal_zodiac(self, sample_birth_data):
        """Lagna must use sidereal (Vedic) not tropical zodiac."""
        dt_utc, lat, lon = _parse_birth_data(sample_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        # Sidereal calculation includes ayanamsa correction
        assert context.ayanamsa_value > 20  # Lahiri ayanamsa is ~24 degrees


class TestPlanetaryPositions:
    """Planetary position calculation tests."""

    def test_returns_nine_planets(self, reference_birth_data):
        """
        Given: Valid birth data
        When: Calculating planetary positions
        Then: Should return all 9 Vedic planets (Sun through Ketu)
        """
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        expected_planets = [
            PlanetName.SUN,
            PlanetName.MOON,
            PlanetName.MARS,
            PlanetName.MERCURY,
            PlanetName.JUPITER,
            PlanetName.VENUS,
            PlanetName.SATURN,
            PlanetName.RAHU,
            PlanetName.KETU,
        ]
        assert len(context.planets) == 9
        assert set(context.planets.keys()) == set(expected_planets)

    def test_moon_in_sagittarius_for_reference(self, reference_birth_data):
        """Golden test: the reference chart's Moon should be in Sagittarius (Skyfield + Lahiri)."""
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        moon = context.planets[PlanetName.MOON]
        assert moon.sign == ZodiacSign.SAGITTARIUS

    def test_sun_in_pisces_for_reference(self, reference_birth_data):
        """Golden test: the reference chart's Sun should be in Pisces."""
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        sun = context.planets[PlanetName.SUN]
        assert sun.sign == ZodiacSign.PISCES

    def test_planets_have_nakshatra(self, sample_birth_data):
        """Each planet should have nakshatra (lunar mansion) calculated."""
        dt_utc, lat, lon = _parse_birth_data(sample_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        for planet in context.planets.values():
            assert planet.nakshatra is not None
            assert planet.nakshatra_pada in [1, 2, 3, 4]


class TestDashaCalculation:
    """Vimshottari Dasha period calculation tests."""

    def test_returns_dasha_periods(self, reference_birth_data):
        """
        Given: Valid birth data
        When: Calculating dashas
        Then: Should return major dasha periods
        """
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        dashas = context.dashas.maha_dasha_sequence
        assert len(dashas) > 0
        # Each dasha should have lord, start, end
        for dasha in dashas:
            assert dasha.lord is not None
            assert dasha.start_date is not None
            assert dasha.end_date is not None

    def test_dasha_periods_are_sequential(self, sample_birth_data):
        """Dasha periods should be continuous without gaps."""
        dt_utc, lat, lon = _parse_birth_data(sample_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        dashas = context.dashas.maha_dasha_sequence
        for i in range(len(dashas) - 1):
            # End of one period should be start of next
            assert dashas[i].end_date == dashas[i + 1].start_date

    def test_current_dasha_identifiable(self, sample_birth_data):
        """Should be able to identify current dasha period."""
        dt_utc, lat, lon = _parse_birth_data(sample_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        # The calculate_sidereal_context already identifies current_maha
        # Check that it's set (may be None if all periods are in the past/future)
        dashas = context.dashas.maha_dasha_sequence
        now = datetime.now(UTC)
        current = [d for d in dashas if d.start_date <= now <= d.end_date]
        # Should have at most one current dasha
        assert len(current) <= 1


class TestFullChartGeneration:
    """Full chart generation integration tests."""

    def test_generate_complete_chart(self, reference_birth_data, reference_expected):
        """
        Given: The reference chart's birth data
        When: Generating full chart
        Then: Should match all expected values (golden test)
        """
        dt_utc, lat, lon = _parse_birth_data(reference_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        assert context.lagna.sign.value == reference_expected["lagna_sign"]
        assert len(context.planets) == reference_expected["planet_count"]

        moon = context.planets[PlanetName.MOON]
        assert moon.sign.value == reference_expected["moon_sign"]

    def test_chart_has_all_components(self, sample_birth_data):
        """Chart should contain all required components."""
        dt_utc, lat, lon = _parse_birth_data(sample_birth_data)
        context = calculate_sidereal_context(dt_utc, lat, lon)

        assert context.lagna is not None
        assert context.planets is not None
        assert context.dashas is not None
        assert context.houses is not None
        assert context.yogas is not None

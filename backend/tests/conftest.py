"""Pytest configuration and shared fixtures."""

import pytest

from almamesh.constants.astrology import ZodiacSign

# Shared test data - Golden reference chart
REFERENCE_BIRTH_DATA = {
    "name": "Reference Chart",
    "date": "1983-04-05",
    "time": "05:50",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "timezone": "Asia/Kolkata",
}

# Expected values for golden test
# Note: Moon sign is Sagittarius based on Skyfield + Lahiri ayanamsa calculation
REFERENCE_EXPECTED = {
    "lagna_sign": ZodiacSign.PISCES.value,
    "moon_sign": ZodiacSign.SAGITTARIUS.value,
    "sun_sign": ZodiacSign.PISCES.value,
    "planet_count": 9,
}


@pytest.fixture
def reference_birth_data() -> dict:
    """Golden test data - known accurate chart."""
    return REFERENCE_BIRTH_DATA.copy()


@pytest.fixture
def reference_expected() -> dict:
    """Expected output for golden test."""
    return REFERENCE_EXPECTED.copy()


@pytest.fixture
def sample_birth_data() -> dict:
    """Generic test birth data."""
    return {
        "name": "Test User",
        "date": "1990-01-15",
        "time": "12:00",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York",
    }

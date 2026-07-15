"""Configuration lifecycle tests."""

from almamesh.config import get_settings


def test_should_cache_settings_until_explicit_test_reset() -> None:
    # Given / When
    get_settings.cache_clear()
    first = get_settings()
    second = get_settings()
    get_settings.cache_clear()
    after_reset = get_settings()
    get_settings.cache_clear()

    # Then
    assert first is second
    assert after_reset is not first

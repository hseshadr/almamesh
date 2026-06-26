"""
Configuration management using Pydantic Settings.

COHESION: All configuration in one place.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AlmaMesh"

    # Ephemeris the publisher ships + records in bundle provenance. Must match
    # calculations.DEFAULT_EPHEMERIS_FILE (the engine default). de421.bsp (~16 MB)
    # is the shippable browser payload; de440.bsp (~114 MB) is unnecessary.
    EPHEMERIS_FILE: str = "de421.bsp"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    """Get cached settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


settings = Settings()

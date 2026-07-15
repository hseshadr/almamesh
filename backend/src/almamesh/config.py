"""
Configuration management using Pydantic Settings.

COHESION: All configuration in one place.
"""

from __future__ import annotations

from functools import cache

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


@cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

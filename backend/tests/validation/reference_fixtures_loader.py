"""External reference fixtures for engine validation (loads committed JSON).

This is the *external* half of the first independent validation of
`almamesh.calculations`. It LOADS `reference_fixtures.json` — values computed on
a fully independent code path (astropy true-apparent longitudes against the same
local DE421; see `tools/generate_reference_fixtures.py`). It does NOT re-run the
engine and does NOT import `AyanamsaCalculator`, so the test that consumes it is
a genuine cross-implementation check, not a self-comparison.

(Formerly `SwissEphemerisGroundTruth`, which mis-named a Skyfield re-run of the
engine's own ayanamsa as a "ground truth". No Swiss Ephemeris is involved here.)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

REFERENCE_PATH = Path(__file__).parent / "reference_fixtures.json"


@dataclass(frozen=True)
class ReferencePosition:
    """One body's expected sidereal placement from the external oracle."""

    longitude: float
    nakshatra: str
    nakshatra_pada: int


@dataclass(frozen=True)
class ReferenceChart:
    """The full expected record for a single fixture instant + location."""

    label: str
    datetime_utc: str
    latitude: float
    longitude: float
    ayanamsa: float
    lagna_longitude: float
    planets: dict[str, ReferencePosition]


def _as_float(value: object) -> float:
    """Narrow a raw JSON value to float (fails closed on a bad fixture)."""
    if not isinstance(value, int | float):
        raise TypeError(f"expected a number, got {type(value).__name__}")
    return float(value)


def _as_int(value: object) -> int:
    """Narrow a raw JSON value to int (fails closed on a bad fixture)."""
    if not isinstance(value, int):
        raise TypeError(f"expected an int, got {type(value).__name__}")
    return value


def _as_mapping(value: object) -> dict[str, object]:
    """Narrow a raw JSON value to a string-keyed mapping (fail-closed)."""
    if not isinstance(value, dict):
        raise TypeError(f"expected an object, got {type(value).__name__}")
    return value


def _position(raw: dict[str, object]) -> ReferencePosition:
    """Build a ReferencePosition from one raw JSON planet entry."""
    return ReferencePosition(
        longitude=_as_float(raw["longitude"]),
        nakshatra=str(raw["nakshatra"]),
        nakshatra_pada=_as_int(raw["nakshatra_pada"]),
    )


def _chart(raw: dict[str, object]) -> ReferenceChart:
    """Build a ReferenceChart from one raw JSON fixture record."""
    planets_raw = _as_mapping(raw["planets"])
    return ReferenceChart(
        label=str(raw["label"]),
        datetime_utc=str(raw["datetime_utc"]),
        latitude=_as_float(raw["latitude"]),
        longitude=_as_float(raw["longitude"]),
        ayanamsa=_as_float(raw["ayanamsa"]),
        lagna_longitude=_as_float(raw["lagna_longitude"]),
        planets={name: _position(_as_mapping(entry)) for name, entry in planets_raw.items()},
    )


class ExternalReferenceFixtures:
    """Committed external expectations, keyed by fixture ISO-UTC instant."""

    def __init__(self, path: Path = REFERENCE_PATH) -> None:
        document = _as_mapping(json.loads(path.read_text()))
        self.provenance = _as_mapping(document["_provenance"])
        fixtures = _as_mapping(document["fixtures"])
        self._charts: dict[str, ReferenceChart] = {
            iso: _chart(_as_mapping(raw)) for iso, raw in fixtures.items()
        }

    def keys(self) -> list[str]:
        """ISO-UTC instants that have committed reference values."""
        return list(self._charts)

    def chart(self, iso_utc: str) -> ReferenceChart:
        """The expected reference chart for one fixture instant."""
        return self._charts[iso_utc]

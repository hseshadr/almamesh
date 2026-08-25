"""Jupiter/Saturn slow-transit hits over natal points + Saturn/Jupiter returns.

Reference (Delhi 1990-01-15 chart; natal Saturn 263.60 deg Sagittarius, natal
Moon 143.78 deg Leo):
  - First Saturn return ~2019 (age ~29; sidereal Saturn back over natal Saturn).
  - Jupiter conjunct natal Moon ~2027-10 (next exact within the search window).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from almamesh.calculations import (
    AyanamsaType,
    NodeType,
    SkyfieldAstronomy,
    calculate_sidereal_context,
)
from almamesh.constants.astrology import PlanetName
from almamesh.schemas.transits import TransitEventKind, TransitSeverity
from almamesh.transits import slow_hits
from almamesh.transits.positions import transit_longitude
from almamesh.transits.slow_hits import (
    next_conjunction,
    next_saturn_return,
)

_BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
_DELHI = (28.6139, 77.2090)


def _natal():
    return calculate_sidereal_context(
        _BIRTH, *_DELHI, reference_date=datetime(2025, 1, 1, tzinfo=UTC)
    )


def test_should_find_saturn_return_near_age_thirty() -> None:
    # Given the natal Saturn longitude and a search start before the return
    astro = SkyfieldAstronomy()
    natal = _natal()
    natal_sat = natal.planets[PlanetName.SATURN].longitude
    # When the next Saturn return after 2018 is found
    hit = next_saturn_return(astro, natal_sat, datetime(2018, 1, 1, tzinfo=UTC))
    # Then the FIRST exact contact lands in early 2019 (~29-yr from a Jan-1990
    # birth; the retrograde loop also re-contacts mid- and late-2019).
    assert hit is not None
    assert datetime(2019, 1, 1, tzinfo=UTC) <= hit.exact <= datetime(2019, 6, 1, tzinfo=UTC)
    assert hit.kind == TransitEventKind.RETURN.value
    assert hit.severity == TransitSeverity.NEUTRAL.value
    # And at the exact instant, transit Saturn equals natal Saturn (sub-degree)
    lon = transit_longitude(astro, PlanetName.SATURN, hit.exact, AyanamsaType.LAHIRI, NodeType.MEAN)
    assert abs((lon - natal_sat + 180) % 360 - 180) < 0.05


def test_should_find_jupiter_conjunct_natal_moon() -> None:
    # Given the natal Moon longitude and a 2025 search start
    astro = SkyfieldAstronomy()
    natal = _natal()
    natal_moon = natal.planets[PlanetName.MOON].longitude
    # When the next Jupiter-over-natal-Moon conjunction is found
    hit = next_conjunction(
        astro, PlanetName.JUPITER, natal_moon, "moon", datetime(2025, 1, 1, tzinfo=UTC)
    )
    # Then it lands ~2027-10 and is flagged SUPPORTIVE (Jupiter on the Moon)
    assert hit is not None
    assert datetime(2027, 9, 1, tzinfo=UTC) <= hit.exact <= datetime(2027, 12, 1, tzinfo=UTC)
    assert hit.severity == TransitSeverity.SUPPORTIVE.value
    lon = transit_longitude(
        astro, PlanetName.JUPITER, hit.exact, AyanamsaType.LAHIRI, NodeType.MEAN
    )
    assert abs((lon - natal_moon + 180) % 360 - 180) == pytest.approx(0.0, abs=0.05)


def test_should_stop_ephemeris_scan_after_first_conjunction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given a synthetic transit that reaches its target five days into a multi-year search
    start = datetime(2026, 1, 1, tzinfo=UTC)
    sampled: list[datetime] = []

    def longitude(_astro: object, _graha: object, when: datetime, *_args: object) -> float:
        sampled.append(when)
        return min(10.0, (when - start).total_seconds() / 86400.0 - 5.0)

    monkeypatch.setattr(slow_hits, "transit_longitude", longitude)

    # When the caller asks only for the next conjunction
    hit = next_conjunction(object(), PlanetName.JUPITER, 0.0, "moon", start)  # type: ignore[arg-type]

    # Then the exact first hit is returned without scanning the unused search horizon
    assert hit is not None
    assert abs(hit.exact - (start + timedelta(days=5))) < timedelta(seconds=1)
    assert len(sampled) < 100

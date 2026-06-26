"""Reference fixtures for the three-level Vimshottari dasha (maha + antar + PD).

These pin the active maha/antar/pratyantar LORDS and BOUNDARIES the engine
produces for known charts at a fixed reference instant, so an accidental change
to the dasha math is caught immediately and a pro can eyeball the values.

CONVENTION: every period below is built with the engine default
``DashaYearConvention.JULIAN_365_25`` (365.25-day dasha year), applied
uniformly at all three levels (each sub-period is a fraction of its parent's
actual span). The recorded ``duration_years`` on an antar/PD is the *lord's
Vimshottari weight in years* (e.g. Venus 20, Saturn 19) that drives its
proportion of the parent — NOT the literal calendar length of that sub-period.

EXTERNAL CONFIRMATION STATUS — these are the engine's own deterministic output,
captured as a regression lock. The maha-level lord+window for the reference chart
(**Jupiter 2009→2025**, a full 16-year Jupiter maha) matches widely published
Vimshottari tables. The exact antar/pratyantar boundary *timestamps* below are
NOT yet cross-checked against
Jagannatha Hora / Parashara's Light; doing so (and tightening any boundary that
disagrees by more than panchanga rounding) is FLAGGED as wanted follow-up. We
do not fake external values here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from almamesh.calculations import calculate_sidereal_context
from almamesh.dasha.convention import DashaYearConvention


def _active_levels(iso: str, lat: float, lon: float, ref: str):
    """Run the engine; return (maha, antar, pratyantar, convention)."""
    ctx = calculate_sidereal_context(
        datetime.fromisoformat(iso),
        lat,
        lon,
        reference_date=datetime.fromisoformat(ref),
    )
    d = ctx.dashas
    return d.current_maha, d.current_antar, d.current_pratyantar, d.convention


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


# ---------------------------------------------------------------------------
# Synthetic reference native: 1988-08-08 06:44 IST, Bengaluru (12.9716 N, 77.5946 E).
# Reference instant 2025-01-01T00:00Z. Convention: Julian 365.25.
# Maha = Jupiter 2009->2025 (a full 16-year Jupiter maha, matching the tables).
# ---------------------------------------------------------------------------
def test_reference_native_three_levels() -> None:
    """Reference-native MD/AD/PD lords + boundaries at 2025-01-01 (regression lock)."""
    # Given the reference-native birth at a pinned reference instant
    maha, antar, pd, convention = _active_levels(
        "1988-08-08T01:14:00+00:00", 12.9716, 77.5946, "2025-01-01T00:00:00+00:00"
    )
    # Then the convention is the declared Julian default
    assert convention is DashaYearConvention.JULIAN_365_25
    # ... the mahadasha is Jupiter 2009->2025 (a full 16-year span, corroborated)
    assert maha is not None
    assert maha.lord.value == "jupiter"
    assert _iso(maha.start_date) == "2009-03-02T19:53:39.108936+00:00"
    assert _iso(maha.end_date) == "2025-03-02T19:53:39.108936+00:00"
    # ... the antardasha is Rahu (engine output; JHora boundary check WANTED)
    assert antar is not None
    assert antar.lord.value == "rahu"
    assert _iso(antar.start_date) == "2022-10-08T05:29:39.108936+00:00"
    assert _iso(antar.end_date) == "2025-03-02T19:53:39.108936+00:00"
    # ... the pratyantardasha is Moon (engine output; JHora boundary check WANTED)
    assert pd is not None
    assert pd.lord.value == "moon"
    assert _iso(pd.start_date) == "2024-10-29T15:27:15.108936+00:00"
    assert _iso(pd.end_date) == "2025-01-10T16:39:15.108936+00:00"


# ---------------------------------------------------------------------------
# Delhi 1990-01-15 12:00 UTC. Reference 2025-01-01T00:00Z. Julian 365.25.
# Maha = Rahu 2017->2035 (matches the chart-golden sanity guard).
# ---------------------------------------------------------------------------
def test_delhi_1990_three_levels() -> None:
    """Delhi-1990 MD/AD/PD lords + boundaries at 2025-01-01 (regression lock)."""
    # Given the Delhi-1990 birth at a pinned reference instant
    maha, antar, pd, convention = _active_levels(
        "1990-01-15T12:00:00+00:00", 28.6139, 77.2090, "2025-01-01T00:00:00+00:00"
    )
    # Then the convention is Julian and the maha is Rahu 2017->2035
    assert convention is DashaYearConvention.JULIAN_365_25
    assert maha is not None and maha.lord.value == "rahu"
    assert _iso(maha.start_date) == "2017-05-13T18:05:00.089572+00:00"
    assert _iso(maha.end_date) == "2035-05-14T06:05:00.089572+00:00"
    # ... antar = Saturn, pratyantar = Jupiter (engine output; JHora check WANTED)
    assert antar is not None and antar.lord.value == "saturn"
    assert _iso(antar.start_date) == "2022-06-19T12:41:00.089572+00:00"
    assert _iso(antar.end_date) == "2025-04-25T11:47:00.089572+00:00"
    assert pd is not None and pd.lord.value == "jupiter"
    assert _iso(pd.start_date) == "2024-12-07T16:42:12.089572+00:00"
    assert _iso(pd.end_date) == "2025-04-25T11:47:00.089572+00:00"


# ---------------------------------------------------------------------------
# NYC 2000-12-31 23:59 UTC. Reference 2025-06-09T12:00Z. Julian 365.25.
# Maha = Saturn 2011->2030.
# ---------------------------------------------------------------------------
def test_nyc_2000_three_levels() -> None:
    """NYC-2000 MD/AD/PD lords + boundaries at 2025-06-09 (regression lock)."""
    # Given the NYC-2000 birth at a pinned mid-2025 reference instant
    maha, antar, pd, convention = _active_levels(
        "2000-12-31T23:59:00+00:00", 40.7128, -74.0060, "2025-06-09T12:00:00+00:00"
    )
    # Then convention is Julian and maha is Saturn 2011->2030
    assert convention is DashaYearConvention.JULIAN_365_25
    assert maha is not None and maha.lord.value == "saturn"
    assert _iso(maha.start_date) == "2011-03-18T09:26:19.898637+00:00"
    assert _iso(maha.end_date) == "2030-03-18T03:26:19.898637+00:00"
    # ... antar = Rahu, pratyantar = Jupiter (engine output; JHora check WANTED)
    assert antar is not None and antar.lord.value == "rahu"
    assert _iso(antar.start_date) == "2024-10-28T21:08:19.898637+00:00"
    assert _iso(antar.end_date) == "2027-09-04T20:14:19.898637+00:00"
    assert pd is not None and pd.lord.value == "jupiter"
    assert _iso(pd.start_date) == "2025-04-03T00:36:13.898637+00:00"
    assert _iso(pd.end_date) == "2025-08-19T19:41:01.898637+00:00"


def test_active_levels_are_strictly_nested() -> None:
    """For every reference chart, PD is inside AD is inside MD at the instant."""
    # Given each reference chart
    cases = [
        ("1988-08-08T01:14:00+00:00", 12.9716, 77.5946, "2025-01-01T00:00:00+00:00"),
        ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090, "2025-01-01T00:00:00+00:00"),
        ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060, "2025-06-09T12:00:00+00:00"),
    ]
    for iso, lat, lon, ref in cases:
        maha, antar, pd, _ = _active_levels(iso, lat, lon, ref)
        ref_dt = datetime.fromisoformat(ref)
        # Then the reference instant is inside all three, properly nested
        assert maha and antar and pd
        assert maha.start_date <= antar.start_date <= pd.start_date <= ref_dt
        assert ref_dt < pd.end_date <= antar.end_date <= maha.end_date

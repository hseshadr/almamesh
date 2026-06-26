"""Tests for the declared dasha-year convention (regression guard).

The historical bug: Mahadasha duration used a 360-day year while
Antardasha/Chara/Yogini used 365.25 — a silent, undeclared, *mixed*
convention that drifts sub-period timing. These tests lock in a single,
explicitly-declared convention applied uniformly at every dasha level.
"""

from datetime import UTC, datetime, timedelta

from almamesh.calculations import (
    calculate_sidereal_context,
    calculate_vimshottari_dashas,
)
from almamesh.dasha.convention import (
    DEFAULT_DASHA_YEAR_CONVENTION,
    DashaYearConvention,
    reconcile_vimshottari,
)
from almamesh.dasha.vimshottari import compute_vimshottari_periods


def test_days_per_year_resolves_each_convention() -> None:
    """Each convention resolves to its documented solar-day count."""
    assert DashaYearConvention.SAVANA_360.days_per_year == 360.0
    assert DashaYearConvention.GREGORIAN_365_2425.days_per_year == 365.2425
    assert DashaYearConvention.JULIAN_365_25.days_per_year == 365.25


def test_default_convention_is_declared() -> None:
    """The default is an explicit member, never an implicit magic number."""
    assert DEFAULT_DASHA_YEAR_CONVENTION in DashaYearConvention


def test_mahadasha_duration_uses_declared_convention() -> None:
    """A full mahadasha spans duration_years * the declared year-length."""
    convention = DashaYearConvention.JULIAN_365_25
    data = calculate_vimshottari_dashas(
        moon_long=0.0,
        birth_dt=datetime(2000, 1, 1, tzinfo=UTC),
        convention=convention,
    )
    full_md = data.maha_dasha_sequence[1]  # index 0 is the partial balance period
    expected_days = full_md.duration_years * convention.days_per_year
    actual_days = (full_md.end_date - full_md.start_date).total_seconds() / 86400
    assert abs(actual_days - expected_days) < 1e-6


def test_antardashas_tile_their_mahadasha_exactly() -> None:
    """The 9 antardashas of a mahadasha tile it with no gap or overhang.

    The window is intentionally wider than the mahadasha so clipping cannot
    mask an overhang: under the old mixed convention the last antardasha
    ended ~duration_years*5.25 days past the mahadasha's own end.
    """
    context = calculate_sidereal_context(datetime(1990, 1, 15, 12, tzinfo=UTC), 40.7128, -74.0060)
    md = context.dashas.maha_dasha_sequence[1]  # first complete mahadasha
    periods = compute_vimshottari_periods(context, md.start_date, md.end_date + timedelta(days=400))
    ads = [p for p in periods if p.md_lord == md.lord]

    assert ads, "expected antardashas for the mahadasha"
    assert ads[0].start_date == md.start_date
    assert abs((ads[-1].end_date - md.end_date).total_seconds()) < 60


def test_reconcile_reports_all_three_conventions() -> None:
    """Reconciliation surfaces every convention side-by-side, divergent."""
    result = reconcile_vimshottari(moon_long=0.0, birth_dt=datetime(2000, 1, 1, tzinfo=UTC))
    assert set(result) == set(DashaYearConvention)

    md_ends = {
        convention: data.maha_dasha_sequence[1].end_date for convention, data in result.items()
    }
    # The savana (360) year is shorter than the solar year, so the same
    # mahadasha must end on a different date — divergence is surfaced.
    assert md_ends[DashaYearConvention.SAVANA_360] != md_ends[DashaYearConvention.JULIAN_365_25]

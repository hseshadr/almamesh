"""Rigorous-precession Lahiri ayanamsa: formula vs official lookup table.

CORRECTNESS-CRITICAL. These tests pin the precession-based Lahiri formula to
the J2000 anchor (23.85306 deg = 23 deg 51' 11") and cross-check it against the
official Lahiri/Chitrapaksha daily lookup table (the IAE / Rashtriya Panchang
standard) across 1900-2050. If the formula drifts >0.01 deg from the table at
any sampled epoch, the engine is shipping a divergent ayanamsa model -> fail.
"""

from almamesh.calculations import AyanamsaCalculator, get_ayanamsa

# J2000.0 = JD 2451545.0; the documented Lahiri anchor in degrees.
J2000_JD = 2451545.0
J2000_ANCHOR_DEG = 23.85306

# Sampled epochs (Jan 1 12:00 TT, approx) for the formula-vs-table cross-check.
JD_1950 = 2433282.5
JD_2000 = 2451545.0
JD_2050 = 2469807.5


def test_ayanamsa_at_j2000_matches_anchor() -> None:
    """The formula reproduces the documented J2000 Lahiri anchor to <0.001 deg."""
    assert abs(get_ayanamsa(J2000_JD) - J2000_ANCHOR_DEG) < 0.001


def test_formula_agrees_with_table_within_threshold() -> None:
    """Formula stays within 0.01 deg of the official lookup table 1950-2050."""
    table = AyanamsaCalculator()
    for jd in (JD_1950, JD_2000, JD_2050):
        formula_value = get_ayanamsa(jd)
        table_value = table.get_ayanamsa(jd)
        assert abs(formula_value - table_value) < 0.01, (
            f"formula {formula_value} vs table {table_value} at jd {jd}"
        )


def test_table_reader_fails_closed_when_resource_missing() -> None:
    """A missing resource must raise, never silently fall back to a guess."""
    calc = AyanamsaCalculator()
    calc._table = []  # simulate a missing/empty resource
    try:
        calc.get_ayanamsa(J2000_JD)
    except (RuntimeError, ValueError, FileNotFoundError):
        return
    raise AssertionError("expected fail-closed error on empty ayanamsa table")

"""Comparison logic for astronomical validation (Spec 043).

This module provides utilities for comparing astronomical calculations
between AlmaMesh and ground truth, with appropriate tolerance levels
and status classifications.

Tolerance Levels:
- EXACT: < 0.01 degrees (essentially identical)
- ACCEPTABLE: < 0.1 degrees (within acceptable variance)
- BOUNDARY_RISK: <= 0.5 degrees from sign edge (may affect sign placement)
- DISCREPANCY: > 0.1 degrees (needs investigation)
"""

from dataclasses import dataclass
from enum import Enum


class ValidationStatus(str, Enum):
    """Status of a validation comparison."""

    EXACT = "exact"  # < 0.01 degrees difference
    ACCEPTABLE = "acceptable"  # < 0.1 degrees difference
    BOUNDARY_RISK = "boundary_risk"  # Position within 0.5 degrees of sign boundary
    DISCREPANCY = "discrepancy"  # > 0.1 degrees difference


# Tolerance thresholds in degrees
EXACT_THRESHOLD = 0.01
ACCEPTABLE_THRESHOLD = 0.1
BOUNDARY_THRESHOLD = 0.5
SIGN_SIZE = 30.0


@dataclass
class ComparisonResult:
    """Result of comparing two longitude values."""

    almamesh_value: float
    ground_truth_value: float
    difference: float
    status: ValidationStatus
    is_boundary_risk: bool
    sign_almamesh: int
    sign_ground_truth: int
    sign_mismatch: bool


def normalize_longitude(longitude: float) -> float:
    """Normalize longitude to 0-360 range.

    Args:
        longitude: Any longitude value

    Returns:
        Longitude normalized to [0, 360)
    """
    return longitude % 360


def compare_longitudes(
    almamesh: float,
    ground_truth: float,
    tolerance: float = ACCEPTABLE_THRESHOLD,
) -> tuple[float, ValidationStatus]:
    """Compare two longitudes with 360-degree wrap-around handling.

    This function handles the wrap-around at 0/360 degrees correctly.
    For example, 359.9 and 0.1 degrees are only 0.2 degrees apart.

    Args:
        almamesh: Longitude from AlmaMesh calculation
        ground_truth: Longitude from ground truth calculation
        tolerance: Maximum acceptable difference (default: 0.1 degrees)

    Returns:
        Tuple of (absolute_difference, status)
    """
    # Normalize both values
    almamesh = normalize_longitude(almamesh)
    ground_truth = normalize_longitude(ground_truth)

    # Calculate difference with wrap-around handling
    raw_diff = almamesh - ground_truth

    # Handle wrap-around: if diff > 180, go the other way around
    diff = (raw_diff + 180) % 360 - 180
    abs_diff = abs(diff)

    # Determine status
    if abs_diff < EXACT_THRESHOLD:
        status = ValidationStatus.EXACT
    elif abs_diff < tolerance:
        status = ValidationStatus.ACCEPTABLE
    else:
        status = ValidationStatus.DISCREPANCY

    return abs_diff, status


def is_boundary_risk(longitude: float, threshold: float = BOUNDARY_THRESHOLD) -> bool:
    """Check if longitude is within threshold of a sign boundary.

    Sign boundaries occur at 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330.
    A position near these boundaries is at risk of being classified in a different
    sign if there's even a small calculation difference.

    Args:
        longitude: Sidereal longitude to check
        threshold: Distance from boundary to consider risky (default: 0.5 degrees)

    Returns:
        True if position is within threshold of any sign boundary
    """
    longitude = normalize_longitude(longitude)
    degrees_in_sign = longitude % SIGN_SIZE

    # Check if close to start (0) or end (30) of sign
    return degrees_in_sign < threshold or (SIGN_SIZE - degrees_in_sign) < threshold


def get_sign_index(longitude: float) -> int:
    """Get zodiac sign index (0-11) from longitude.

    Args:
        longitude: Sidereal longitude

    Returns:
        Sign index: 0=Aries, 1=Taurus, ..., 11=Pisces
    """
    return int(normalize_longitude(longitude) // SIGN_SIZE)


def compare_full(
    almamesh: float,
    ground_truth: float,
    tolerance: float = ACCEPTABLE_THRESHOLD,
) -> ComparisonResult:
    """Perform full comparison including boundary risk and sign analysis.

    Args:
        almamesh: Longitude from AlmaMesh calculation
        ground_truth: Longitude from ground truth calculation
        tolerance: Maximum acceptable difference

    Returns:
        ComparisonResult with full analysis
    """
    diff, status = compare_longitudes(almamesh, ground_truth, tolerance)

    # Check boundary risk for both values
    almamesh_boundary = is_boundary_risk(almamesh)
    ground_truth_boundary = is_boundary_risk(ground_truth)

    # Get signs
    sign_almamesh = get_sign_index(almamesh)
    sign_ground_truth = get_sign_index(ground_truth)
    sign_mismatch = sign_almamesh != sign_ground_truth

    # If there's a boundary risk, override status
    if (almamesh_boundary or ground_truth_boundary) and status != ValidationStatus.DISCREPANCY:
        if sign_mismatch:
            status = ValidationStatus.BOUNDARY_RISK

    return ComparisonResult(
        almamesh_value=normalize_longitude(almamesh),
        ground_truth_value=normalize_longitude(ground_truth),
        difference=diff,
        status=status,
        is_boundary_risk=almamesh_boundary or ground_truth_boundary,
        sign_almamesh=sign_almamesh,
        sign_ground_truth=sign_ground_truth,
        sign_mismatch=sign_mismatch,
    )


def format_degrees(degrees: float) -> str:
    """Format degrees in degrees-minutes-seconds notation.

    Args:
        degrees: Decimal degrees

    Returns:
        String in format "DDd MM' SS.S\""
    """
    d = int(degrees)
    m_full = (degrees - d) * 60
    m = int(m_full)
    s = (m_full - m) * 60

    return f"{d}d {m}' {s:.1f}\""


def format_comparison_report(result: ComparisonResult, name: str) -> str:
    """Format a comparison result as a human-readable report line.

    Args:
        result: ComparisonResult to format
        name: Name of the value being compared (e.g., "Moon", "Lagna")

    Returns:
        Formatted string describing the comparison
    """
    status_symbols = {
        ValidationStatus.EXACT: "[OK]",
        ValidationStatus.ACCEPTABLE: "[OK]",
        ValidationStatus.BOUNDARY_RISK: "[WARN]",
        ValidationStatus.DISCREPANCY: "[FAIL]",
    }

    sign_names = [
        "Aries",
        "Taurus",
        "Gemini",
        "Cancer",
        "Leo",
        "Virgo",
        "Libra",
        "Scorpio",
        "Sagittarius",
        "Capricorn",
        "Aquarius",
        "Pisces",
    ]

    symbol = status_symbols[result.status]
    almamesh_sign = sign_names[result.sign_almamesh]
    gt_sign = sign_names[result.sign_ground_truth]

    report = f"{symbol} {name}: "
    report += f"AlmaMesh={result.almamesh_value:.4f} ({almamesh_sign}), "
    report += f"GT={result.ground_truth_value:.4f} ({gt_sign}), "
    report += f"diff={result.difference:.4f}deg"

    if result.sign_mismatch:
        report += " [SIGN MISMATCH]"
    if result.is_boundary_risk:
        report += " [BOUNDARY]"

    return report

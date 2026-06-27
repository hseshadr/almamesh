"""Cusp candidate-time generation for birth-time rectification.

For a birth near a sign cusp the Ascendant is ambiguous between the recorded
sign and its neighbour.  We binary-search the boundary crossing on the birth
day — reusing ONE warm SkyfieldAstronomy instance (de421 load happens once) —
and return one representative datetime per candidate sign.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Literal

from almamesh.calculations import DEFAULT_EPHEMERIS_FILE, SkyfieldAstronomy, get_ayanamsa
from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign

# Generous bracket: 90 min covers < 22.5° of lagna travel, well within one sign
# when birth_dt is in the outer half (>15° or <15° into a sign).
_BRACKET = datetime.timedelta(minutes=90)
# Binary search terminates when interval is < 1 second (~0.004° lagna).
_TOLERANCE_SECS = 1.0
# Representative time for the adjacent sign: 4 min ≈ 1° safely inside the sign.
_REPR_OFFSET = datetime.timedelta(minutes=4)

# ── Window sweep constants ─────────────────────────────────────────────────────
# 15-min step ≈ half a sign arc (~2 h/sign ÷ 8 = 15 min); no sign is skipped for births
# below the Arctic Circle (~66.5°N). Above it, signs that do not rise simply don't
# appear in the sweep (correct). At moderate latitudes (≥10 min margin through ~65°N).
_SAMPLE_STEP_MINUTES = 15
# Evenly-spaced fine samples within a single sign's arc.
FINE_N = 12
assert FINE_N > 1, "FINE_N must be > 1 to avoid silent duplication in _fine_samples"


@dataclass(frozen=True)
class GeoPoint:
    """Geographic coordinate (latitude, longitude in decimal degrees)."""

    latitude: float
    longitude: float


@dataclass(frozen=True)
class CandidateTime:
    """One representative instant for a cusp-candidate ascendant sign."""

    sign: ZodiacSign
    dt_utc: datetime.datetime
    lagna_longitude_deg: float


def make_astronomy() -> SkyfieldAstronomy:
    """Return one warm SkyfieldAstronomy (de421 loaded once; callers must reuse)."""
    return SkyfieldAstronomy(DEFAULT_EPHEMERIS_FILE)


def _asc_longitude(astronomy: SkyfieldAstronomy, dt: datetime.datetime, geo: GeoPoint) -> float:
    """Sidereal ascendant longitude (0–360°) at `dt` UTC for the given location."""
    t = astronomy.ts.from_datetime(dt)
    return astronomy.calculate_lagna(dt, geo.latitude, geo.longitude, get_ayanamsa(float(t.tt)))


def _sign_index(lon: float) -> int:
    """Zodiac sign index 0–11 from a sidereal longitude."""
    return int(lon // 30) % 12


def _search_window(
    birth_dt: datetime.datetime,
    forward: bool,
    current_idx: int,
    adj_idx: int,
) -> tuple[datetime.datetime, datetime.datetime, int]:
    """(lo, hi, target_sign_idx) for the boundary binary search."""
    if forward:
        return birth_dt, birth_dt + _BRACKET, adj_idx
    return birth_dt - _BRACKET, birth_dt, current_idx


def _adj_sign_idx(current_idx: int, birth_lon: float) -> tuple[int, bool]:
    """Return (adjacent_sign_idx, is_forward) based on position within the sign."""
    forward = (birth_lon % 30) > 15.0
    return (current_idx + (1 if forward else -1)) % 12, forward


def _bisect_step(
    astronomy: SkyfieldAstronomy,
    lo: datetime.datetime,
    hi: datetime.datetime,
    geo: GeoPoint,
    target: int,
) -> tuple[datetime.datetime, datetime.datetime]:
    """One bisection step toward the sign boundary; returns updated (lo, hi)."""
    mid = lo + (hi - lo) / 2
    return (lo, mid) if _sign_index(_asc_longitude(astronomy, mid, geo)) == target else (mid, hi)


def _find_boundary_crossing(
    astronomy: SkyfieldAstronomy,
    lo: datetime.datetime,
    hi: datetime.datetime,
    geo: GeoPoint,
    target: int,
) -> datetime.datetime:
    """Binary-search [lo, hi] for first instant lagna enters `target`. lo NOT in target; hi IS."""
    if _sign_index(_asc_longitude(astronomy, lo, geo)) == target:
        raise ValueError(f"Precondition violated: lo is already in sign {target}")
    if _sign_index(_asc_longitude(astronomy, hi, geo)) != target:
        raise ValueError(f"Precondition violated: hi is not in sign {target}")
    while (hi - lo).total_seconds() > _TOLERANCE_SECS:
        lo, hi = _bisect_step(astronomy, lo, hi, geo, target)
    return hi


def _make_candidate(idx: int, dt: datetime.datetime, lon: float) -> CandidateTime:
    """Build a CandidateTime from sign index, representative dt, and longitude."""
    return CandidateTime(ZodiacSign(ZODIAC_SIGNS[idx]), dt, lon)


def _adj_candidate(
    astronomy: SkyfieldAstronomy,
    crossing: datetime.datetime,
    adj_idx: int,
    forward: bool,
    geo: GeoPoint,
) -> CandidateTime:
    """Build the adjacent-sign CandidateTime from the boundary crossing instant."""
    adj_dt = crossing + _REPR_OFFSET if forward else crossing - _REPR_OFFSET
    return _make_candidate(adj_idx, adj_dt, _asc_longitude(astronomy, adj_dt, geo))


def _window_bounds(
    birth_dt: datetime.datetime,
    span_minutes: int | None,
) -> tuple[datetime.datetime, datetime.datetime]:
    """(start, end) UTC for the search window, clamped to the birth day.

    Args:
        birth_dt: Birth datetime (must be UTC: naive-UTC or tz-aware UTC).
        span_minutes: Window span in minutes. If None, searches the entire day.
    """
    day_start = birth_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + datetime.timedelta(days=1)
    if span_minutes is None:
        return day_start, day_end
    half = datetime.timedelta(minutes=span_minutes / 2)
    return max(birth_dt - half, day_start), min(birth_dt + half, day_end)


def _dt_range(start: datetime.datetime, end: datetime.datetime) -> list[datetime.datetime]:
    """Step-aligned datetimes from start to end, appending end if not aligned."""
    step = datetime.timedelta(minutes=_SAMPLE_STEP_MINUTES)
    times: list[datetime.datetime] = []
    dt = start
    while dt <= end:
        times.append(dt)
        dt += step
    if times and times[-1] < end:
        times.append(end)
    return times


def _sample_signs(
    astronomy: SkyfieldAstronomy,
    start: datetime.datetime,
    end: datetime.datetime,
    geo: GeoPoint,
) -> list[tuple[datetime.datetime, int]]:
    """(dt, sign_index) pairs at coarse step across [start, end]."""
    return [(dt, _sign_index(_asc_longitude(astronomy, dt, geo))) for dt in _dt_range(start, end)]


def _collect_sign_times(
    samples: list[tuple[datetime.datetime, int]],
) -> dict[int, list[datetime.datetime]]:
    """Map sign_idx -> list of sample dts where that sign was observed (in order)."""
    sign_times: dict[int, list[datetime.datetime]] = {}
    for dt, idx in samples:
        sign_times.setdefault(idx, []).append(dt)
    return sign_times


def _dedupe_by_sign(
    samples: list[tuple[datetime.datetime, int]],
    astronomy: SkyfieldAstronomy,
    geo: GeoPoint,
) -> list[CandidateTime]:
    """One CandidateTime per distinct sign; representative = median sample in its arc."""
    sign_times = _collect_sign_times(samples)
    result: list[CandidateTime] = []
    for idx, times in sign_times.items():
        mid_dt = times[len(times) // 2]
        lon = _asc_longitude(astronomy, mid_dt, geo)
        result.append(_make_candidate(idx, mid_dt, lon))
    return result


def _fine_samples(
    astronomy: SkyfieldAstronomy,
    start: datetime.datetime,
    end: datetime.datetime,
    geo: GeoPoint,
) -> list[CandidateTime]:
    """FINE_N evenly-spaced CandidateTimes across [start, end]."""
    total_secs = (end - start).total_seconds()
    step_secs = total_secs / (FINE_N - 1) if FINE_N > 1 else 0.0
    result: list[CandidateTime] = []
    for i in range(FINE_N):
        dt = start + datetime.timedelta(seconds=step_secs * i)
        lon = _asc_longitude(astronomy, dt, geo)
        result.append(_make_candidate(_sign_index(lon), dt, lon))
    return result


def window_candidate_times(
    birth_dt: datetime.datetime,
    latitude: float,
    longitude: float,
    *,
    astronomy: SkyfieldAstronomy,
    span_minutes: int | None = None,
    resolution: Literal["coarse", "fine"] = "coarse",
) -> list[CandidateTime]:
    """Coarse: one CandidateTime per rising sign in window. Fine: FINE_N samples.

    Args:
        birth_dt: Birth datetime (must be UTC: naive-UTC or tz-aware UTC).
        latitude: Geographic latitude in decimal degrees.
        longitude: Geographic longitude in decimal degrees.
        astronomy: Warm SkyfieldAstronomy instance (reused across calls).
        span_minutes: Window span in minutes. If None, searches the entire day.
        resolution: "coarse" (one per rising sign) or "fine" (FINE_N evenly spaced).
    """
    geo = GeoPoint(latitude, longitude)
    start, end = _window_bounds(birth_dt, span_minutes)
    if resolution == "fine":
        return _fine_samples(astronomy, start, end, geo)
    return _dedupe_by_sign(_sample_signs(astronomy, start, end, geo), astronomy, geo)


def cusp_candidate_times(
    birth_dt: datetime.datetime, latitude: float, longitude: float, *, astronomy: SkyfieldAstronomy
) -> list[CandidateTime]:
    """Return exactly 2 CandidateTimes for the two signs around the nearest cusp."""
    geo = GeoPoint(latitude, longitude)
    birth_lon = _asc_longitude(astronomy, birth_dt, geo)
    current_idx = _sign_index(birth_lon)
    adj_idx, forward = _adj_sign_idx(current_idx, birth_lon)
    lo, hi, target = _search_window(birth_dt, forward, current_idx, adj_idx)
    crossing = _find_boundary_crossing(astronomy, lo, hi, geo, target)
    return [
        _make_candidate(current_idx, birth_dt, birth_lon),
        _adj_candidate(astronomy, crossing, adj_idx, forward, geo),
    ]

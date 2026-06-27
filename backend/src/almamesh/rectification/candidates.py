"""Cusp candidate-time generation for birth-time rectification.

For a birth near a sign cusp the Ascendant is ambiguous between the recorded
sign and its neighbour.  We binary-search the boundary crossing on the birth
day — reusing ONE warm SkyfieldAstronomy instance (de421 load happens once) —
and return one representative datetime per candidate sign.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from almamesh.calculations import DEFAULT_EPHEMERIS_FILE, SkyfieldAstronomy, get_ayanamsa
from almamesh.constants.astrology import ZODIAC_SIGNS, ZodiacSign

# Generous bracket: 90 min covers < 22.5° of lagna travel, well within one sign
# when birth_dt is in the outer half (>15° or <15° into a sign).
_BRACKET = datetime.timedelta(minutes=90)
# Binary search terminates when interval is < 1 second (~0.004° lagna).
_TOLERANCE_SECS = 1.0
# Representative time for the adjacent sign: 4 min ≈ 1° safely inside the sign.
_REPR_OFFSET = datetime.timedelta(minutes=4)


@dataclass(frozen=True)
class CandidateTime:
    """One representative instant for a cusp-candidate ascendant sign."""

    sign: ZodiacSign
    dt_utc: datetime.datetime
    lagna_longitude_deg: float


def make_astronomy() -> SkyfieldAstronomy:
    """Return one warm SkyfieldAstronomy (de421 loaded once; callers must reuse)."""
    return SkyfieldAstronomy(DEFAULT_EPHEMERIS_FILE)


def _asc_longitude(
    astronomy: SkyfieldAstronomy, dt: datetime.datetime, lat: float, lon: float
) -> float:
    """Sidereal ascendant longitude (0–360°) at `dt` UTC for the given location."""
    t = astronomy.ts.from_datetime(dt)
    ayanamsa = get_ayanamsa(float(t.tt))
    return astronomy.calculate_lagna(dt, lat, lon, ayanamsa)


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


def _find_boundary_crossing(
    astronomy: SkyfieldAstronomy,
    lo: datetime.datetime,
    hi: datetime.datetime,
    lat: float,
    lon: float,
    target_sign_idx: int,
) -> datetime.datetime:
    """Binary-search [lo, hi] for the first instant lagna enters `target_sign_idx`.

    Precondition: lagna(lo) is NOT in target_sign_idx; lagna(hi) IS.
    Returns the narrowed `hi` (first moment inside the target sign, ±1 s).
    """
    while (hi - lo).total_seconds() > _TOLERANCE_SECS:
        mid = lo + (hi - lo) / 2
        if _sign_index(_asc_longitude(astronomy, mid, lat, lon)) == target_sign_idx:
            hi = mid
        else:
            lo = mid
    return hi


def cusp_candidate_times(
    birth_dt: datetime.datetime,
    latitude: float,
    longitude: float,
    *,
    astronomy: SkyfieldAstronomy,
) -> list[CandidateTime]:
    """Return exactly 2 CandidateTimes for the two signs around the nearest cusp.

    The as-recorded ``birth_dt`` is the representative for its own sign.  The
    adjacent sign gets a time ``_REPR_OFFSET`` past the nearest boundary crossing
    found by binary search.  The two signs are always adjacent on the zodiac.
    """
    birth_lon = _asc_longitude(astronomy, birth_dt, latitude, longitude)
    current_idx = _sign_index(birth_lon)
    forward = (birth_lon % 30) > 15.0
    adj_idx = (current_idx + (1 if forward else -1)) % 12
    lo, hi, target = _search_window(birth_dt, forward, current_idx, adj_idx)
    crossing = _find_boundary_crossing(astronomy, lo, hi, latitude, longitude, target)
    adj_dt = crossing + _REPR_OFFSET if forward else crossing - _REPR_OFFSET
    adj_lon = _asc_longitude(astronomy, adj_dt, latitude, longitude)
    return [
        CandidateTime(ZodiacSign(ZODIAC_SIGNS[current_idx]), birth_dt, birth_lon),
        CandidateTime(ZodiacSign(ZODIAC_SIGNS[adj_idx]), adj_dt, adj_lon),
    ]

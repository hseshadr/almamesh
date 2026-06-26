"""Retrograde-aware bisection root-finder shared by all transit timing.

Pure and deterministic: a scalar `f(when) -> float` is coarse-stepped over a
window; every sign change of `f` between adjacent samples is refined by bisection
to a fixed tolerance with a fixed iteration count. For a sign ingress the
canonical boundary is the LAST sticking crossing (Saturn retrogrades across a
cusp up to 3x) — hence `find_last_crossing`. No `now()`, no astronomy here.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Final

# Fixed bisection constants (identical sequence on CPython and Pyodide/WASM).
_BISECT_ITERATIONS: Final[int] = 40  # ~1 second of time at a 5-day bracket
_SECONDS_PER_DAY: Final[float] = 86400.0

ScalarFn = Callable[[datetime], float]


def _midpoint(lo: datetime, hi: datetime) -> datetime:
    """The instant halfway between two instants (no float-day drift)."""
    return lo + (hi - lo) / 2


def _bisect(f: ScalarFn, lo: datetime, hi: datetime) -> datetime:
    """Refine a bracketed sign-change of f to a fixed iteration count."""
    f_lo = f(lo)
    for _ in range(_BISECT_ITERATIONS):
        mid = _midpoint(lo, hi)
        if (f(mid) >= 0.0) == (f_lo >= 0.0):
            lo = mid
            f_lo = f(lo)
        else:
            hi = mid
    return _midpoint(lo, hi)


def _brackets(
    f: ScalarFn, start: datetime, end: datetime, step_days: float
) -> list[tuple[datetime, datetime]]:
    """Adjacent-sample windows where f changes sign (coarse scan)."""
    step = timedelta(days=step_days)
    out: list[tuple[datetime, datetime]] = []
    lo = start
    f_lo = f(lo)
    while lo < end:
        hi = min(lo + step, end)
        f_hi = f(hi)
        if (f_lo >= 0.0) != (f_hi >= 0.0):
            out.append((lo, hi))
        lo, f_lo = hi, f_hi
    return out


def find_crossings(f: ScalarFn, start: datetime, end: datetime, step_days: float) -> list[datetime]:
    """Every zero-crossing of f in [start, end], refined and chronological."""
    return [_bisect(f, lo, hi) for lo, hi in _brackets(f, start, end, step_days)]


def find_last_crossing(
    f: ScalarFn, start: datetime, end: datetime, step_days: float
) -> datetime | None:
    """The last (sticking) crossing of f in the window, or None if none."""
    crossings = find_crossings(f, start, end, step_days)
    return crossings[-1] if crossings else None

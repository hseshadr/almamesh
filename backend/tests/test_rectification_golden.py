"""Golden regression for the compute_rectification_result orchestrator (Task 10/18).

Cusp golden: SYNTHETIC Bengaluru cusp native (1988-08-08T01:14:00+00:00,
lat 12.9716, lon 77.5946, utc_offset_minutes=330).  NEVER real owner birth data.

Window golden: SYNTHETIC Tokyo native (1990-04-20T03:00:00+00:00, lat 35.6762,
lon 139.6503, utc_offset_minutes=540).  Whole-day window; unknown birth time.

Window discriminating golden: SYNTHETIC Mumbai native (1992-07-04T06:30:00+00:00,
lat 19.0760, lon 72.8777, utc_offset_minutes=330).  Whole-day window; events
crafted so Virgo clearly outscores all other signs → band=leans, margin>0.15.

Cusp case 1 (``main``): six diverse events spanning MARRIAGE / CHILDBIRTH /
CAREER / PROMOTION / HEALTH_ISSUE / RELOCATION.
Cusp case 2 (``near_tie``): no events → NEAR_TIE forced.

Window case 1 (``main``): six diverse events → top ranked sign + honest band.
Window case 2 (``near_tie``): no events → NEAR_TIE forced.
Window case 3 (``discriminating``): crafted events → band=leans, top=Virgo.
Window case 4 (``precision``): Tokyo native, mixed YEAR/APPROX-precision events →
    engine applies widened transit windows and confirms output is deterministic.

Regenerate golden fixtures (ONLY when the orchestrator intentionally changes):
    cd backend && uv run python -m tests.test_rectification_golden
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

from almamesh.constants.astrology import EventType
from almamesh.rectification import compute_rectification_result
from almamesh.rectification.models import (
    EventDatePrecision,
    RectificationBand,
    RectificationEventInput,
    RectificationMode,
)

# ── Synthetic cusp native (Bengaluru) — NEVER real owner data ─────────────────
_DT_UTC = datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC)
_LAT = 12.9716
_LON = 77.5946
_UTC_OFFSET = 330  # IST = UTC+5:30
_REF_DATE = datetime(2025, 1, 1, tzinfo=UTC)
_MODE = RectificationMode.CUSP

# ── Synthetic window native (Tokyo) — unknown birth time, whole-day scan ───────
_WIN_DT_UTC = datetime(1990, 4, 20, 3, 0, 0, tzinfo=UTC)  # noon JST = 03:00 UTC
_WIN_LAT = 35.6762
_WIN_LON = 139.6503
_WIN_UTC_OFFSET = 540  # JST = UTC+9

# ── Synthetic discriminating window native (Mumbai) — NEVER real owner data ────
# Chosen because Virgo rising consistently scores highest for this native+events:
# dasha lords at the chosen event dates rotate into Virgo-specific house lordships.
# Re-crafted for the Spec-062 depth-aware scorer (engine exploration 2026-07-01):
# band=consistent, margin≈0.51, disc=6, top=Virgo.
_DISC_DT_UTC = datetime(1992, 7, 4, 6, 30, 0, tzinfo=UTC)  # noon IST = 06:30 UTC
_DISC_LAT = 19.0760  # Mumbai
_DISC_LON = 72.8777
_DISC_UTC_OFFSET = 330  # IST = UTC+5:30

# ── Diverse synthetic events across different life areas ───────────────────────
_EVENTS_MAIN: list[RectificationEventInput] = [
    RectificationEventInput(date=date(2012, 6, 15), category=EventType.MARRIAGE),
    RectificationEventInput(date=date(2014, 3, 20), category=EventType.CHILDBIRTH),
    RectificationEventInput(date=date(2016, 9, 10), category=EventType.CAREER_CHANGE),
    RectificationEventInput(date=date(2018, 5, 5), category=EventType.PROMOTION),
    RectificationEventInput(date=date(2020, 11, 30), category=EventType.HEALTH_ISSUE),
    RectificationEventInput(date=date(2022, 4, 12), category=EventType.RELOCATION),
]

# Window-mode events: Tokyo native, diverse life areas, span multiple dasha periods
_WIN_EVENTS_MAIN: list[RectificationEventInput] = [
    RectificationEventInput(date=date(2015, 3, 10), category=EventType.MARRIAGE),
    RectificationEventInput(date=date(2000, 6, 20), category=EventType.CAREER_CHANGE),
    RectificationEventInput(date=date(2010, 8, 15), category=EventType.HEALTH_ISSUE),
    RectificationEventInput(date=date(2005, 4, 1), category=EventType.PROMOTION),
    RectificationEventInput(date=date(2017, 7, 22), category=EventType.CHILDBIRTH),
    RectificationEventInput(date=date(2008, 11, 5), category=EventType.RELOCATION),
]

# Discriminating events: Mumbai native, crafted so Virgo's dasha-lord/house fit
# clearly outscores all others across 6 independent life-area categories.
_WIN_EVENTS_DISC: list[RectificationEventInput] = [
    RectificationEventInput(date=date(2013, 6, 10), category=EventType.CAREER_CHANGE),
    RectificationEventInput(date=date(2018, 6, 29), category=EventType.PROMOTION),
    RectificationEventInput(date=date(2010, 8, 10), category=EventType.BUSINESS_START),
    RectificationEventInput(date=date(2011, 2, 6), category=EventType.MARRIAGE),
    RectificationEventInput(date=date(2022, 10, 21), category=EventType.CHILDBIRTH),
    RectificationEventInput(date=date(2016, 4, 10), category=EventType.RELOCATION),
]

# ── Precision scenario: Tokyo native, year/approx precision events ────────────
# Exercises the widened transit-window path introduced in Task 2-4.  Two events:
# one with YEAR precision (engine widens transit search to ±6 months) and one
# with APPROX precision (engine widens to ±18 months).  Determinism is the gate.
_WIN_PRECISION_EVENTS: list[RectificationEventInput] = [
    RectificationEventInput(
        date=date(2010, 1, 1),
        category=EventType.RELOCATION,
        precision=EventDatePrecision.YEAR,
    ),
    RectificationEventInput(
        date=date(2012, 1, 1),
        category=EventType.MARRIAGE,
        precision=EventDatePrecision.APPROX,
    ),
]

# ── Near-tie cases: zero events → forced NEAR_TIE ─────────────────────────────
_EVENTS_EMPTY: list[RectificationEventInput] = []

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "rectification_golden.json"
WINDOW_GOLDEN_PATH = Path(__file__).parent / "fixtures" / "rectification_window_golden.json"


def _canonicalize(value: object) -> object:
    """Recursively round floats to 6 decimals; preserve bool; sort dict keys."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _run(events: list[RectificationEventInput]) -> object:
    """Run the cusp orchestrator and return a canonicalized JSON-serializable result."""
    result = compute_rectification_result(
        dt_utc=_DT_UTC,
        latitude=_LAT,
        longitude=_LON,
        utc_offset_minutes=_UTC_OFFSET,
        events=events,
        mode=_MODE,
        reference_date=_REF_DATE,
    )
    return _canonicalize(result.model_dump(mode="json"))


def _run_window(events: list[RectificationEventInput]) -> object:
    """Run the window orchestrator and return a canonicalized JSON-serializable result."""
    result = compute_rectification_result(
        dt_utc=_WIN_DT_UTC,
        latitude=_WIN_LAT,
        longitude=_WIN_LON,
        utc_offset_minutes=_WIN_UTC_OFFSET,
        events=events,
        mode=RectificationMode.WINDOW,
        reference_date=_REF_DATE,
        span_minutes=None,  # whole-day scan
    )
    return _canonicalize(result.model_dump(mode="json"))


def _load_golden() -> dict[str, object]:
    loaded = json.loads(GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


def _load_window_golden() -> dict[str, object]:
    loaded = json.loads(WINDOW_GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


def _run_discriminating(events: list[RectificationEventInput]) -> object:
    """Run the discriminating-window orchestrator; return canonicalized result."""
    result = compute_rectification_result(
        dt_utc=_DISC_DT_UTC,
        latitude=_DISC_LAT,
        longitude=_DISC_LON,
        utc_offset_minutes=_DISC_UTC_OFFSET,
        events=events,
        mode=RectificationMode.WINDOW,
        reference_date=_REF_DATE,
        span_minutes=None,  # whole-day scan
    )
    return _canonicalize(result.model_dump(mode="json"))


def test_rectification_result_matches_golden() -> None:
    """Main orchestrator result equals the committed golden fixture."""
    golden = _load_golden()
    assert _run(_EVENTS_MAIN) == golden["main"]


def test_empty_events_produces_near_tie() -> None:
    """Zero events → 0 discriminating events → NEAR_TIE band forced."""
    golden = _load_golden()
    result = _run(_EVENTS_EMPTY)
    assert result == golden["near_tie"]
    assert isinstance(result, dict)
    assert result["band"] == RectificationBand.NEAR_TIE.value
    assert result["discriminating_event_count"] == 0


def test_window_result_matches_golden() -> None:
    """Window orchestrator result equals the committed window golden fixture."""
    golden = _load_window_golden()
    assert _run_window(_WIN_EVENTS_MAIN) == golden["main"]


def test_window_empty_events_produces_near_tie() -> None:
    """Window mode, zero events → NEAR_TIE forced regardless of raw margin."""
    golden = _load_window_golden()
    result = _run_window(_EVENTS_EMPTY)
    assert result == golden["near_tie"]
    assert isinstance(result, dict)
    assert result["band"] == RectificationBand.NEAR_TIE.value
    assert result["discriminating_event_count"] == 0
    assert result["mode"] == RectificationMode.WINDOW.value


def test_window_discriminating_leans() -> None:
    """Window mode with crafted events → band=leans, margin>0.15, top=Virgo.

    This test proves the window machinery CAN produce a confident verdict when
    dasha-lord house fits consistently favour one rising sign across independent
    life-area categories.  The golden snapshot anchors byte-level stability.
    """
    golden = _load_window_golden()
    result = _run_discriminating(_WIN_EVENTS_DISC)
    assert result == golden["discriminating"]
    assert isinstance(result, dict)
    assert result["band"] in {RectificationBand.LEANS.value, RectificationBand.CONSISTENT.value}
    assert result["margin"] > 0.15
    assert result["discriminating_event_count"] >= 3
    assert result["candidates"][0]["ascendant_sign"] == "Virgo"


def test_window_precision_golden() -> None:
    """Window mode with YEAR/APPROX-precision events matches the committed golden.

    Confirms that widened transit windows (Tasks 1-4 precision path) produce
    byte-identical output on repeat invocations — the core determinism gate for
    imprecise-date event inputs.
    """
    golden = _load_window_golden()
    result = _run_window(_WIN_PRECISION_EVENTS)
    assert result == golden["precision"]
    assert isinstance(result, dict)
    assert result["mode"] == RectificationMode.WINDOW.value


def _generate_golden() -> None:
    """Generate and write both committed goldens (run as ``__main__``)."""
    golden = {
        "main": _run(_EVENTS_MAIN),
        "near_tie": _run(_EVENTS_EMPTY),
    }
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {GOLDEN_PATH} ({GOLDEN_PATH.stat().st_size} bytes)")

    window_golden = {
        "discriminating": _run_discriminating(_WIN_EVENTS_DISC),
        "main": _run_window(_WIN_EVENTS_MAIN),
        "near_tie": _run_window(_EVENTS_EMPTY),
        "precision": _run_window(_WIN_PRECISION_EVENTS),
    }
    WINDOW_GOLDEN_PATH.write_text(json.dumps(window_golden, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {WINDOW_GOLDEN_PATH} ({WINDOW_GOLDEN_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    _generate_golden()

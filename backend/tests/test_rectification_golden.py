"""Golden regression for the compute_rectification_result orchestrator (Task 10).

Uses the SYNTHETIC Bengaluru cusp native (1988-08-08T01:14:00+00:00, lat 12.9716,
lon 77.5946, utc_offset_minutes=330).  NEVER real owner birth data.

Case 1 (``main``): six diverse events spanning MARRIAGE / CHILDBIRTH / CAREER /
PROMOTION / HEALTH_ISSUE / RELOCATION — categories chosen to hit different classical
houses and produce independent signals, maximising the chance that at least
MIN_DISCRIMINATING_EVENTS (3) events differ between the two lagna candidates.

Case 2 (``near_tie``): no events at all → 0 discriminating events <
MIN_DISCRIMINATING_EVENTS → band FORCED to NEAR_TIE regardless of raw scores.

Regenerate the golden (ONLY when the orchestrator intentionally changes):
    cd backend && uv run python -m tests.test_rectification_golden
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

from almamesh.constants.astrology import EventType
from almamesh.rectification import compute_rectification_result
from almamesh.rectification.models import (
    RectificationBand,
    RectificationEventInput,
    RectificationMode,
)

# ── Synthetic native (Bengaluru cusp) — NEVER real owner data ─────────────────
_DT_UTC = datetime(1988, 8, 8, 1, 14, 0, tzinfo=UTC)
_LAT = 12.9716
_LON = 77.5946
_UTC_OFFSET = 330  # IST = UTC+5:30
_REF_DATE = datetime(2025, 1, 1, tzinfo=UTC)
_MODE = RectificationMode.CUSP

# ── Diverse synthetic events across different life areas ───────────────────────
# Dates and categories are chosen to span multiple dasha periods and classical
# houses so signals can differ between the two candidate ascendant signs.
_EVENTS_MAIN: list[RectificationEventInput] = [
    RectificationEventInput(date=date(2012, 6, 15), category=EventType.MARRIAGE),
    RectificationEventInput(date=date(2014, 3, 20), category=EventType.CHILDBIRTH),
    RectificationEventInput(date=date(2016, 9, 10), category=EventType.CAREER_CHANGE),
    RectificationEventInput(date=date(2018, 5, 5), category=EventType.PROMOTION),
    RectificationEventInput(date=date(2020, 11, 30), category=EventType.HEALTH_ISSUE),
    RectificationEventInput(date=date(2022, 4, 12), category=EventType.RELOCATION),
]

# ── Near-tie case: zero events → forced NEAR_TIE ──────────────────────────────
_EVENTS_EMPTY: list[RectificationEventInput] = []

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "rectification_golden.json"


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
    """Run the orchestrator and return a canonicalized JSON-serializable result."""
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


def _load_golden() -> dict[str, object]:
    loaded = json.loads(GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


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


def _generate_golden() -> None:
    """Generate and write the committed golden (run as ``__main__``)."""
    golden = {
        "main": _run(_EVENTS_MAIN),
        "near_tie": _run(_EVENTS_EMPTY),
    }
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {GOLDEN_PATH} ({GOLDEN_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    _generate_golden()

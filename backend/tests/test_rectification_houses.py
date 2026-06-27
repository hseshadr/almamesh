"""Tests for category_houses: EventType → house tuple seed map."""

import pytest

from almamesh.constants.astrology import EventType
from almamesh.rectification.houses import category_houses

# Verbatim seed-map expectations from the Phase 2 spec
EXPECTED: dict[EventType, tuple[int, ...]] = {
    EventType.MARRIAGE: (7,),
    EventType.ENGAGEMENT: (7,),
    EventType.BREAKUP: (7,),
    EventType.CHILDBIRTH: (5,),
    EventType.CAREER_CHANGE: (10,),
    EventType.PROMOTION: (10,),
    EventType.JOB_LOSS: (10,),
    EventType.BUSINESS_START: (10,),
    EventType.RELOCATION: (4, 12),
    EventType.PROPERTY_PURCHASE: (4,),
    EventType.WINDFALL: (2, 11),
    EventType.EXPENSE_SHOCK: (12,),
    EventType.HEALTH_ISSUE: (6,),
    EventType.SURGERY: (6, 8),
    EventType.HIGHER_STUDIES: (4, 5, 9),
    EventType.LITIGATION: (6,),
}


def _idfn(e: object) -> str:
    return e.value if isinstance(e, EventType) else str(e)


@pytest.mark.parametrize("event,expected", list(EXPECTED.items()), ids=_idfn)
def test_seed_map_values(event: EventType, expected: tuple[int, ...]) -> None:
    assert category_houses(event) == expected


def test_exhaustiveness_all_members() -> None:
    """Every EventType member must map to a non-empty tuple of valid houses (1–12)."""
    for member in EventType:
        result = category_houses(member)
        assert isinstance(result, tuple), f"{member}: expected tuple, got {type(result)}"
        assert len(result) > 0, f"{member}: empty house tuple"
        for h in result:
            assert 1 <= h <= 12, f"{member}: house {h} out of range 1–12"


def test_unknown_member_raises() -> None:
    """Passing an unmapped / non-EventType value must raise."""
    with pytest.raises((ValueError, KeyError)):
        category_houses("not_a_real_event")  # type: ignore[arg-type]

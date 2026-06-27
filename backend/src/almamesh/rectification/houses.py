"""category_houses: maps each EventType to the houses it activates."""

from almamesh.constants.astrology import EventType

_HOUSE_MAP: dict[EventType, tuple[int, ...]] = {
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


def category_houses(event: EventType) -> tuple[int, ...]:
    """Return the Bhava(s) an event is primarily about.

    Raises KeyError for any unmapped EventType member.
    """
    return _HOUSE_MAP[event]

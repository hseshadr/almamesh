"""
Jaimini Chara Dasha System.

Implements the sign-based Chara dasha system from Jaimini astrology.
Periods are based on signs rather than planets, with duration determined
by the sign's position from lagna. Also includes Jaimini Karaka calculations.

Key concepts:
- Sign-based periods (not planet-based)
- Direction depends on odd/even lagna sign
- Duration varies by sign (7-12 years)
- Karakas (significators) determined by planetary degrees
"""

from __future__ import annotations

from datetime import datetime, timedelta

from almamesh.constants.astrology import (
    CHARA_DASHA_YEARS,
    ZODIAC_SIGNS,
    DashaSystem,
    EventType,
    PlanetName,
    ZodiacSign,
)
from almamesh.dasha.convention import (
    DEFAULT_DASHA_YEAR_CONVENTION,
    DashaYearConvention,
)
from almamesh.dasha.models import (
    CharaPeriod,
    CharaState,
    DashaEngineConfig,
    JaiminiKarakas,
    KarakaInfo,
    Signal,
    TimeSegment,
)
from almamesh.schemas.astrology import PlanetPosition, SiderealContext

# =============================================================================
# JAIMINI KARAKAS
# =============================================================================


def compute_jaimini_karakas(context: SiderealContext) -> JaiminiKarakas:
    """
    Calculate Chara Karakas from planetary degrees.

    The 7 Chara Karakas are determined by sorting planets by their
    degrees within their signs (sign_degrees). Rahu/Ketu are excluded.

    Args:
        context: The sidereal context with planetary positions.

    Returns:
        JaiminiKarakas with all seven karakas identified.
    """
    # Only use 7 planets (exclude Rahu/Ketu)
    karaka_planets = [
        PlanetName.SUN,
        PlanetName.MOON,
        PlanetName.MARS,
        PlanetName.MERCURY,
        PlanetName.JUPITER,
        PlanetName.VENUS,
        PlanetName.SATURN,
    ]

    # Build list with degree info
    planet_degrees = [(p, context.planets[p]) for p in karaka_planets]

    # Sort by degree within sign (descending - highest degree first)
    sorted_planets = sorted(planet_degrees, key=lambda x: x[1].sign_degrees, reverse=True)

    def make_karaka_info(planet: PlanetName, pos: PlanetPosition) -> KarakaInfo:
        return KarakaInfo(
            planet=planet,
            sign=pos.sign,
            house=pos.house,
            degrees=pos.sign_degrees,
        )

    return JaiminiKarakas(
        atk=make_karaka_info(*sorted_planets[0]),
        amk=make_karaka_info(*sorted_planets[1]),
        bk=make_karaka_info(*sorted_planets[2]),
        mk=make_karaka_info(*sorted_planets[3]),
        pk=make_karaka_info(*sorted_planets[4]),
        gk=make_karaka_info(*sorted_planets[5]),
        dk=make_karaka_info(*sorted_planets[6]),
    )


# =============================================================================
# CHARA DASHA PERIOD COMPUTATION
# =============================================================================


def compute_chara_dasha_periods(
    context: SiderealContext,
    start_date: datetime,
    end_date: datetime,
    karakas: JaiminiKarakas,
    convention: DashaYearConvention = DEFAULT_DASHA_YEAR_CONVENTION,
) -> list[CharaPeriod]:
    """
    Calculate Jaimini Chara Dasha periods for the given time window.

    Chara Dasha is sign-based. The sequence depends on whether the
    lagna is an odd or even sign (clockwise vs counter-clockwise).

    Args:
        context: The sidereal context with lagna data.
        start_date: Start of analysis window.
        end_date: End of analysis window.
        karakas: Jaimini karakas (used for reference, not period calculation).

    Returns:
        List of CharaPeriod objects covering the time window.
    """
    lagna_sign = context.lagna.sign
    lagna_idx = ZODIAC_SIGNS.index(lagna_sign.value)
    is_odd_sign = lagna_idx % 2 == 0  # Aries(0), Gemini(2), etc. are odd

    periods: list[CharaPeriod] = []

    # Birth date from first dasha period
    if not context.dashas.maha_dasha_sequence:
        return periods
    birth_date = context.dashas.maha_dasha_sequence[0].start_date
    current_date = birth_date

    # Generate sign sequence (12 signs, may cycle multiple times)
    max_cycles = 3  # Up to 3 full cycles (enough for 100+ years)

    for cycle in range(max_cycles):
        for i in range(12):
            if is_odd_sign:
                sign_idx = (lagna_idx + i) % 12
            else:
                sign_idx = (lagna_idx - i + 12) % 12

            sign = ZodiacSign(ZODIAC_SIGNS[sign_idx])
            years = CHARA_DASHA_YEARS[sign]
            period_end = current_date + timedelta(days=years * convention.days_per_year)

            # Only include if overlaps with requested window
            if period_end >= start_date and current_date <= end_date:
                periods.append(
                    CharaPeriod(
                        sign=sign,
                        start_date=max(current_date, start_date),
                        end_date=min(period_end, end_date),
                        duration_years=years,
                    )
                )

            current_date = period_end
            if current_date > end_date:
                return periods

    return periods


def find_active_chara(
    periods: list[CharaPeriod], dt: datetime, karakas: JaiminiKarakas
) -> CharaState:
    """
    Find the active Chara state at a given datetime.

    Args:
        periods: List of CharaPeriod objects.
        dt: The datetime to check.
        karakas: Jaimini karakas for determining active significators.

    Returns:
        CharaState with active sign and karakas.
    """
    for p in periods:
        if p.start_date <= dt < p.end_date:
            # Check which karakas are in the active sign
            active_karakas: list[str] = []
            if karakas.atk.sign == p.sign:
                active_karakas.append("AtK")
            if karakas.amk.sign == p.sign:
                active_karakas.append("AmK")
            if karakas.dk.sign == p.sign:
                active_karakas.append("DK")

            return CharaState(
                sign_md=p.sign,
                sign_ad=p.sign,  # Simplified: using same sign for AD
                active_karakas=active_karakas,
            )
    # Fallback
    if periods:
        return CharaState(sign_md=periods[0].sign, sign_ad=periods[0].sign)
    return CharaState(sign_md=ZodiacSign.ARIES, sign_ad=ZodiacSign.ARIES)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _get_house_of_sign(sign: ZodiacSign, lagna_sign: ZodiacSign) -> int:
    """Calculate house number for a sign relative to lagna."""
    sign_idx = ZODIAC_SIGNS.index(sign.value)
    lagna_idx = ZODIAC_SIGNS.index(lagna_sign.value)
    return ((sign_idx - lagna_idx) % 12) + 1


# =============================================================================
# CHARA SIGNAL EXTRACTION
# =============================================================================


def _extract_chara_career_signals(
    sign_md: ZodiacSign,
    sign_ad: ZodiacSign,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
    signals: list[Signal],
) -> None:
    """Extract career-related Chara signals."""
    if karakas.amk.sign == sign_md or karakas.amk.sign == sign_ad:
        signals.append(
            Signal(
                id="chara_amk_active",
                system=DashaSystem.CHARA,
                event_tags=[EventType.CAREER_CHANGE, EventType.PROMOTION],
                weight=config.weights.chara_amk_activation,
                polarity=1,
                rationale="Chara Dasha activates sign of Amatyakaraka (career significator)",
                features={"karaka": "AmK", "sign": sign_md.value},
            )
        )

    house_from_lagna = _get_house_of_sign(sign_md, context.lagna.sign)
    if house_from_lagna == 10:
        signals.append(
            Signal(
                id="chara_10th_sign",
                system=DashaSystem.CHARA,
                event_tags=[EventType.CAREER_CHANGE],
                weight=config.weights.chara_house_activation,
                polarity=1,
                rationale="Chara Dasha of 10th house sign (career focus)",
                features={"house": 10, "sign": sign_md.value},
            )
        )


def _extract_chara_relationship_signals(
    sign_md: ZodiacSign,
    sign_ad: ZodiacSign,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
    signals: list[Signal],
) -> None:
    """Extract relationship-related Chara signals."""
    if karakas.dk.sign == sign_md or karakas.dk.sign == sign_ad:
        signals.append(
            Signal(
                id="chara_dk_active",
                system=DashaSystem.CHARA,
                event_tags=[EventType.MARRIAGE, EventType.ENGAGEMENT],
                weight=config.weights.chara_dk_activation,
                polarity=1,
                rationale="Chara Dasha activates sign of Darakaraka (spouse significator)",
                features={"karaka": "DK", "sign": sign_md.value},
            )
        )

    house_from_lagna = _get_house_of_sign(sign_md, context.lagna.sign)
    if house_from_lagna == 7:
        signals.append(
            Signal(
                id="chara_7th_sign",
                system=DashaSystem.CHARA,
                event_tags=[EventType.MARRIAGE, EventType.ENGAGEMENT],
                weight=config.weights.chara_house_activation,
                polarity=1,
                rationale="Chara Dasha of 7th house sign (relationships)",
                features={"house": 7, "sign": sign_md.value},
            )
        )


def _extract_chara_relocation_signals(
    sign_md: ZodiacSign,
    context: SiderealContext,
    config: DashaEngineConfig,
    signals: list[Signal],
) -> None:
    """Extract relocation-related Chara signals."""
    house_from_lagna = _get_house_of_sign(sign_md, context.lagna.sign)
    if house_from_lagna in [4, 12]:
        signals.append(
            Signal(
                id="chara_relocation_sign",
                system=DashaSystem.CHARA,
                event_tags=[EventType.RELOCATION],
                weight=config.weights.chara_house_activation,
                polarity=0,
                rationale="Chara Dasha of 4th/12th sign (change of residence)",
                features={"house": house_from_lagna, "sign": sign_md.value},
            )
        )


def extract_chara_signals(
    seg: TimeSegment,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
) -> list[Signal]:
    """
    Extract signals from Chara (Jaimini) dasha state.

    Analyzes the active sign period and its relationship to karakas
    to generate signals for life events.

    Args:
        seg: The time segment with Chara state.
        context: The sidereal context with lagna data.
        karakas: Jaimini karakas for significance determination.
        config: Engine configuration with weights.

    Returns:
        List of Signal objects extracted from Chara state.
    """
    signals: list[Signal] = []
    sign_md = seg.chara.sign_md
    sign_ad = seg.chara.sign_ad

    _extract_chara_career_signals(sign_md, sign_ad, context, karakas, config, signals)
    _extract_chara_relationship_signals(sign_md, sign_ad, context, karakas, config, signals)
    _extract_chara_relocation_signals(sign_md, context, config, signals)

    return signals

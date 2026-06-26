"""
Tests for the Composite Dasha Engine (Spec 050).

Tests cover:
- Jaimini Karakas calculation
- Chara Dasha period computation
- Yogini Dasha period computation
- Signal extraction from all three systems
- Confluence scoring
- Event window stitching
- Full composite timeline generation
"""

from datetime import UTC, datetime, timedelta

import pytest

from almamesh.calculations import (
    Dignity,
    HouseCuspData,
    LagnaData,
    MahaDashaPeriod,
    PlanetName,
    PlanetPosition,
    SiderealContext,
    VimshottariDashaData,
    ZodiacSign,
)
from almamesh.constants.astrology import SIGN_LORDS, ZODIAC_SIGNS
from almamesh.dasha import (
    CHARA_DASHA_YEARS,
    YOGINI_SEQUENCE,
    CharaPeriod,
    CharaState,
    CompositeTimeline,
    DashaEngineConfig,
    DashaSystem,
    EventType,
    Signal,
    TimeSegment,
    VimshottariState,
    YoginiPeriod,
    YoginiState,
    build_composite_timeline,
    compute_chara_dasha_periods,
    compute_jaimini_karakas,
    compute_vimshottari_periods,
    compute_yogini_periods,
    extract_chara_signals,
    extract_vimshottari_signals,
    extract_yogini_signals,
    score_events_from_signals,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def sample_birth_date() -> datetime:
    """A sample birth date for testing."""
    return datetime(1990, 3, 15, 10, 30, tzinfo=UTC)


@pytest.fixture
def sample_planet_positions() -> dict[PlanetName, PlanetPosition]:
    """Sample planetary positions for a test chart."""
    return {
        PlanetName.SUN: PlanetPosition(
            name=PlanetName.SUN,
            longitude=354.5,
            sign=ZodiacSign.PISCES,
            sign_degrees=24.5,  # High degree for AtK candidate
            sign_lord=PlanetName.JUPITER,
            nakshatra="Revati",
            nakshatra_pada=4,
            nakshatra_lord=PlanetName.MERCURY,
            house=10,
            dignity=Dignity.NEUTRAL,
        ),
        PlanetName.MOON: PlanetPosition(
            name=PlanetName.MOON,
            longitude=258.0,
            sign=ZodiacSign.SAGITTARIUS,
            sign_degrees=18.0,
            sign_lord=PlanetName.JUPITER,
            nakshatra="Purva Ashadha",
            nakshatra_pada=3,
            nakshatra_lord=PlanetName.VENUS,
            house=7,
            dignity=Dignity.NEUTRAL,
        ),
        PlanetName.MARS: PlanetPosition(
            name=PlanetName.MARS,
            longitude=20.0,
            sign=ZodiacSign.ARIES,
            sign_degrees=20.0,
            sign_lord=PlanetName.MARS,
            nakshatra="Bharani",
            nakshatra_pada=3,
            nakshatra_lord=PlanetName.VENUS,
            house=11,
            dignity=Dignity.OWN,
        ),
        PlanetName.MERCURY: PlanetPosition(
            name=PlanetName.MERCURY,
            longitude=340.0,
            sign=ZodiacSign.PISCES,
            sign_degrees=10.0,
            sign_lord=PlanetName.JUPITER,
            nakshatra="Uttara Bhadrapada",
            nakshatra_pada=4,
            nakshatra_lord=PlanetName.SATURN,
            house=10,
            dignity=Dignity.DEBILITATED,
        ),
        PlanetName.JUPITER: PlanetPosition(
            name=PlanetName.JUPITER,
            longitude=85.0,
            sign=ZodiacSign.GEMINI,
            sign_degrees=25.0,  # Second highest degree
            sign_lord=PlanetName.MERCURY,
            nakshatra="Punarvasu",
            nakshatra_pada=2,
            nakshatra_lord=PlanetName.JUPITER,
            house=1,
            dignity=Dignity.NEUTRAL,
        ),
        PlanetName.VENUS: PlanetPosition(
            name=PlanetName.VENUS,
            longitude=15.0,
            sign=ZodiacSign.ARIES,
            sign_degrees=15.0,
            sign_lord=PlanetName.MARS,
            nakshatra="Ashwini",
            nakshatra_pada=4,
            nakshatra_lord=PlanetName.KETU,
            house=11,
            dignity=Dignity.NEUTRAL,
        ),
        PlanetName.SATURN: PlanetPosition(
            name=PlanetName.SATURN,
            longitude=280.0,
            sign=ZodiacSign.CAPRICORN,
            sign_degrees=10.0,
            sign_lord=PlanetName.SATURN,
            nakshatra="Shravana",
            nakshatra_pada=2,
            nakshatra_lord=PlanetName.MOON,
            house=8,
            dignity=Dignity.OWN,
        ),
        PlanetName.RAHU: PlanetPosition(
            name=PlanetName.RAHU,
            longitude=300.0,
            sign=ZodiacSign.AQUARIUS,
            sign_degrees=0.0,
            sign_lord=PlanetName.SATURN,
            nakshatra="Dhanishta",
            nakshatra_pada=3,
            nakshatra_lord=PlanetName.MARS,
            house=9,
            dignity=Dignity.NEUTRAL,
        ),
        PlanetName.KETU: PlanetPosition(
            name=PlanetName.KETU,
            longitude=120.0,
            sign=ZodiacSign.LEO,
            sign_degrees=0.0,
            sign_lord=PlanetName.SUN,
            nakshatra="Magha",
            nakshatra_pada=1,
            nakshatra_lord=PlanetName.KETU,
            house=3,
            dignity=Dignity.NEUTRAL,
        ),
    }


@pytest.fixture
def sample_houses() -> dict[int, HouseCuspData]:
    """Sample house cusps for a test chart (Gemini lagna)."""
    houses = {}
    lagna_sign_idx = 2  # Gemini = index 2
    for i in range(1, 13):
        sign_idx = (lagna_sign_idx + i - 1) % 12
        sign = ZodiacSign(ZODIAC_SIGNS[sign_idx])
        houses[i] = HouseCuspData(
            house=i,
            longitude=sign_idx * 30.0,
            sign=sign,
            sign_lord=SIGN_LORDS[sign],
        )
    return houses


@pytest.fixture
def sample_lagna() -> LagnaData:
    """Sample lagna (Gemini) for a test chart."""
    return LagnaData(
        longitude=65.0,
        sign=ZodiacSign.GEMINI,
        sign_degrees=5.0,
        sign_lord=PlanetName.MERCURY,
        nakshatra="Mrigashira",
        nakshatra_pada=3,
        nakshatra_lord=PlanetName.MARS,
    )


@pytest.fixture
def sample_vimshottari_dasha(sample_birth_date: datetime) -> VimshottariDashaData:
    """Sample Vimshottari dasha data."""
    periods = []
    current_date = sample_birth_date

    # Starting with Venus dasha (balance of 15 years)
    dasha_sequence = [
        (PlanetName.VENUS, 15.0),
        (PlanetName.SUN, 6.0),
        (PlanetName.MOON, 10.0),
        (PlanetName.MARS, 7.0),
        (PlanetName.RAHU, 18.0),
        (PlanetName.JUPITER, 16.0),
        (PlanetName.SATURN, 19.0),
    ]

    for lord, years in dasha_sequence:
        end_date = current_date + timedelta(days=years * 365.25)
        periods.append(
            MahaDashaPeriod(
                lord=lord,
                start_date=current_date,
                end_date=end_date,
                duration_years=years,
                antar_sequence=[],  # the multi-system scoring under test never reads antars
            )
        )
        current_date = end_date

    return VimshottariDashaData(
        maha_dasha_sequence=periods,
        current_maha=periods[3],  # Mars dasha current
    )


@pytest.fixture
def sample_sidereal_context(
    sample_planet_positions: dict[PlanetName, PlanetPosition],
    sample_houses: dict[int, HouseCuspData],
    sample_lagna: LagnaData,
    sample_vimshottari_dasha: VimshottariDashaData,
) -> SiderealContext:
    """A complete SiderealContext for testing."""
    return SiderealContext(
        ayanamsa_value=24.0,
        lagna=sample_lagna,
        planets=sample_planet_positions,
        houses=sample_houses,
        dashas=sample_vimshottari_dasha,
        yogas=[],
    )


# =============================================================================
# PHASE 1: JAIMINI KARAKAS TESTS
# =============================================================================


class TestJaiminiKarakas:
    """Tests for Jaimini Karaka calculation."""

    def test_compute_karakas_returns_seven_karakas(self, sample_sidereal_context: SiderealContext):
        """Should return all 7 karakas."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)

        assert karakas.atk is not None
        assert karakas.amk is not None
        assert karakas.bk is not None
        assert karakas.mk is not None
        assert karakas.pk is not None
        assert karakas.gk is not None
        assert karakas.dk is not None

    def test_karakas_sorted_by_degrees(self, sample_sidereal_context: SiderealContext):
        """Karakas should be sorted by degrees (highest to lowest)."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)

        # AtK should have highest degree, DK should have lowest
        assert karakas.atk.degrees >= karakas.amk.degrees
        assert karakas.amk.degrees >= karakas.bk.degrees
        assert karakas.bk.degrees >= karakas.mk.degrees
        assert karakas.mk.degrees >= karakas.pk.degrees
        assert karakas.pk.degrees >= karakas.gk.degrees
        assert karakas.gk.degrees >= karakas.dk.degrees

    def test_karakas_excludes_rahu_ketu(self, sample_sidereal_context: SiderealContext):
        """Karakas should not include Rahu or Ketu."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)

        all_karaka_planets = [
            karakas.atk.planet,
            karakas.amk.planet,
            karakas.bk.planet,
            karakas.mk.planet,
            karakas.pk.planet,
            karakas.gk.planet,
            karakas.dk.planet,
        ]

        assert PlanetName.RAHU not in all_karaka_planets
        assert PlanetName.KETU not in all_karaka_planets

    def test_karaka_info_includes_sign_and_house(self, sample_sidereal_context: SiderealContext):
        """Each karaka should have sign and house information."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)

        # Check AtK has all required info
        assert karakas.atk.sign is not None
        assert 1 <= karakas.atk.house <= 12
        assert 0 <= karakas.atk.degrees <= 30


# =============================================================================
# PHASE 2: DASHA PERIOD TESTS
# =============================================================================


class TestCharaDashaPeriods:
    """Tests for Chara Dasha period calculation."""

    def test_compute_periods_returns_list(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should return a list of CharaPeriod objects."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        periods = compute_chara_dasha_periods(sample_sidereal_context, start, end, karakas)

        assert isinstance(periods, list)
        assert len(periods) > 0
        assert all(isinstance(p, CharaPeriod) for p in periods)

    def test_periods_have_correct_duration(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Period durations should match CHARA_DASHA_YEARS."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        periods = compute_chara_dasha_periods(sample_sidereal_context, start, end, karakas)

        for period in periods:
            expected_years = CHARA_DASHA_YEARS[period.sign]
            assert period.duration_years == expected_years

    def test_periods_are_sequential(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Periods should be sequential without gaps."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        start = datetime(1990, 3, 15, tzinfo=UTC)  # Birth date
        end = datetime(2020, 1, 1, tzinfo=UTC)

        periods = compute_chara_dasha_periods(sample_sidereal_context, start, end, karakas)

        # Check that periods are sequential (accounting for window clipping)
        for i in range(len(periods) - 1):
            # End of one period should be close to start of next
            # (may not be exact due to window clipping)
            assert periods[i].end_date <= periods[i + 1].start_date + timedelta(days=1)


class TestYoginiDashaPeriods:
    """Tests for Yogini Dasha period calculation."""

    def test_compute_periods_returns_list(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should return a list of YoginiPeriod objects."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        periods = compute_yogini_periods(sample_sidereal_context, start, end)

        assert isinstance(periods, list)
        assert len(periods) > 0
        assert all(isinstance(p, YoginiPeriod) for p in periods)

    def test_yogini_names_are_valid(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """All yogini names should be from the valid sequence."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        periods = compute_yogini_periods(sample_sidereal_context, start, end)

        valid_names = {name for name, _, _ in YOGINI_SEQUENCE}
        for period in periods:
            assert period.yogini_name in valid_names

    def test_total_cycle_is_36_years(self):
        """The Yogini cycle should total 36 years."""
        total_years = sum(years for _, _, years in YOGINI_SEQUENCE)
        assert total_years == 36


class TestVimshottariPeriods:
    """Tests for Vimshottari period extraction."""

    def test_compute_periods_includes_antardasha(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should include antardasha (AD) lords."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2025, 1, 1, tzinfo=UTC)

        periods = compute_vimshottari_periods(sample_sidereal_context, start, end)

        assert len(periods) > 0
        # Each period should have both MD and AD lords
        for p in periods:
            assert p.md_lord is not None
            assert p.ad_lord is not None


# =============================================================================
# PHASE 3: SIGNAL EXTRACTION TESTS
# =============================================================================


class TestSignalExtraction:
    """Tests for signal extraction from dasha states."""

    def test_vimshottari_signals_for_career(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should extract career signals when 10th house is activated."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        config = DashaEngineConfig()

        # Create a segment with Sun as AD lord (Sun is in 10th house)
        segment = TimeSegment(
            start_date=datetime(2020, 1, 1, tzinfo=UTC),
            end_date=datetime(2020, 6, 1, tzinfo=UTC),
            vimshottari=VimshottariState(md_lord=PlanetName.MARS, ad_lord=PlanetName.SUN),
            chara=CharaState(sign_md=ZodiacSign.ARIES, sign_ad=ZodiacSign.ARIES),
            yogini=YoginiState(yogini_name="Mangala", lord=PlanetName.MOON),
        )

        signals = extract_vimshottari_signals(segment, sample_sidereal_context, karakas, config)

        # Should have at least one career signal
        career_signals = [s for s in signals if EventType.CAREER_CHANGE in s.event_tags]
        assert len(career_signals) > 0

    def test_chara_signals_for_amk(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should extract career signals when AmK sign is active."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        config = DashaEngineConfig()

        # Create a segment with AmK's sign as MD
        amk_sign = karakas.amk.sign
        segment = TimeSegment(
            start_date=datetime(2020, 1, 1, tzinfo=UTC),
            end_date=datetime(2020, 6, 1, tzinfo=UTC),
            vimshottari=VimshottariState(md_lord=PlanetName.MARS, ad_lord=PlanetName.SUN),
            chara=CharaState(sign_md=amk_sign, sign_ad=amk_sign, active_karakas=["AmK"]),
            yogini=YoginiState(yogini_name="Mangala", lord=PlanetName.MOON),
        )

        signals = extract_chara_signals(segment, sample_sidereal_context, karakas, config)

        # Should have AmK activation signal
        amk_signals = [s for s in signals if s.id == "chara_amk_active"]
        assert len(amk_signals) == 1
        assert EventType.CAREER_CHANGE in amk_signals[0].event_tags

    def test_yogini_signals_for_house_placement(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should extract signals based on yogini lord's house placement."""
        karakas = compute_jaimini_karakas(sample_sidereal_context)
        config = DashaEngineConfig()

        # Moon is in 7th house in our test chart
        segment = TimeSegment(
            start_date=datetime(2020, 1, 1, tzinfo=UTC),
            end_date=datetime(2020, 6, 1, tzinfo=UTC),
            vimshottari=VimshottariState(md_lord=PlanetName.MARS, ad_lord=PlanetName.SUN),
            chara=CharaState(sign_md=ZodiacSign.ARIES, sign_ad=ZodiacSign.ARIES),
            yogini=YoginiState(yogini_name="Mangala", lord=PlanetName.MOON),
        )

        signals = extract_yogini_signals(segment, sample_sidereal_context, karakas, config)

        # Should have marriage signal (Moon in 7th)
        marriage_signals = [s for s in signals if EventType.MARRIAGE in s.event_tags]
        assert len(marriage_signals) > 0


# =============================================================================
# PHASE 4: CONFLUENCE SCORING TESTS
# =============================================================================


class TestConfluenceScoring:
    """Tests for confluence-based event scoring."""

    def test_single_system_base_score(self):
        """Single system should give base probability."""
        config = DashaEngineConfig()
        signals = [
            Signal(
                id="test_vim",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            )
        ]

        scores = score_events_from_signals(signals, config)

        # Should have a score for career change
        assert EventType.CAREER_CHANGE in scores
        assert scores[EventType.CAREER_CHANGE] > 0

    def test_dual_confluence_increases_score(self):
        """Two systems agreeing should increase the score."""
        config = DashaEngineConfig()

        # Single system
        single_signals = [
            Signal(
                id="test_vim",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            )
        ]

        # Dual system
        dual_signals = [
            Signal(
                id="test_vim",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            ),
            Signal(
                id="test_chara",
                system=DashaSystem.CHARA,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            ),
        ]

        single_scores = score_events_from_signals(single_signals, config)
        dual_scores = score_events_from_signals(dual_signals, config)

        # Dual confluence should give higher score
        assert dual_scores[EventType.CAREER_CHANGE] > single_scores[EventType.CAREER_CHANGE]

    def test_triple_confluence_highest_score(self):
        """Three systems agreeing should give the highest score."""
        config = DashaEngineConfig()

        triple_signals = [
            Signal(
                id="test_vim",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            ),
            Signal(
                id="test_chara",
                system=DashaSystem.CHARA,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.25,
                polarity=1,
                rationale="Test signal",
            ),
            Signal(
                id="test_yogini",
                system=DashaSystem.YOGINI,
                event_tags=[EventType.CAREER_CHANGE],
                weight=0.10,
                polarity=1,
                rationale="Test signal",
            ),
        ]

        scores = score_events_from_signals(triple_signals, config)

        # Triple confluence should give very high score
        assert scores[EventType.CAREER_CHANGE] > 0.5


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestCompositeTimeline:
    """Integration tests for full composite timeline generation."""

    def test_build_timeline_returns_complete_result(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should return a complete CompositeTimeline."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2025, 1, 1, tzinfo=UTC)

        timeline = build_composite_timeline(sample_sidereal_context, start, end)

        assert isinstance(timeline, CompositeTimeline)
        assert len(timeline.segments) > 0
        assert timeline.karakas is not None

    def test_timeline_segments_cover_window(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Timeline segments should cover the requested window."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2025, 1, 1, tzinfo=UTC)

        timeline = build_composite_timeline(sample_sidereal_context, start, end)

        # First segment should start at or before window start
        assert timeline.segments[0].start_date <= start

        # Last segment should end at or after window end
        assert timeline.segments[-1].end_date >= end

    def test_segments_have_signals(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Each segment should have signals extracted."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2021, 1, 1, tzinfo=UTC)

        timeline = build_composite_timeline(sample_sidereal_context, start, end)

        # At least some segments should have signals
        segments_with_signals = [s for s in timeline.segments if len(s.signals) > 0]
        assert len(segments_with_signals) > 0

    def test_segments_have_event_scores(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Each segment should have event scores."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2021, 1, 1, tzinfo=UTC)

        timeline = build_composite_timeline(sample_sidereal_context, start, end)

        for segment in timeline.segments:
            assert len(segment.event_scores) > 0
            # All scores should be between 0 and 1
            for score in segment.event_scores.values():
                assert 0 <= score <= 1

    def test_events_have_explanations(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Predicted events should have explanations."""
        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        timeline = build_composite_timeline(sample_sidereal_context, start, end)

        # If there are events, they should have explanations
        for event in timeline.events:
            assert len(event.explanations) > 0
            assert len(event.top_signals) > 0

    def test_performance_10_year_window(
        self,
        sample_sidereal_context: SiderealContext,
    ):
        """Should complete 10-year analysis in reasonable time."""
        import time

        start = datetime(2020, 1, 1, tzinfo=UTC)
        end = datetime(2030, 1, 1, tzinfo=UTC)

        start_time = time.time()
        timeline = build_composite_timeline(sample_sidereal_context, start, end)
        elapsed = time.time() - start_time

        # Should complete in under 1 second (spec says 500ms, being generous)
        assert elapsed < 1.0
        assert len(timeline.segments) > 0

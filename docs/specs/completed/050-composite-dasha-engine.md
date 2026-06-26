# Spec 050: Composite Dasha Engine

**Status:** Draft
**Created:** 2026-01-17
**Priority:** P1 HIGH
**Dependencies:** Spec 046 (Radical Simplification), existing `calculations.py`

## Goal

Build a **Composite Dasha Engine** that fuses **Vimshottari + Jaimini Chara + Yogini** into a single **probabilistic event timeline** with **confluence scoring**. This is the algorithmic depth that differentiates AlmaMesh from generic astrology apps.

---

## The Problem

Most apps only show Vimshottari Dasha with text interpretations. Real prediction requires **cross-referencing multiple systems** to find **confluence** - when multiple independent Dasha systems agree, prediction probability increases dramatically.

**Current State:**
- `calculations.py` implements only Vimshottari Dasha (lines 554-603)
- No confluence detection
- No probabilistic event prediction
- No Chara or Yogini Dasha support

---

## Core Outputs

### Inputs
- Birth data → computed `SiderealContext` (D1 chart)
- Engine config (ayanamsa, weights, event taxonomy, thresholds)
- Time window (e.g., next 10 years)

### Outputs
1. **Timeline Segments** (date ranges) with:
   - Active Vimshottari MD/AD/PD
   - Active Chara Dasha (Sign-based MD/AD)
   - Active Yogini period
   - Extracted signals (e.g., "10th lord active", "AmK sign active")

2. **Event Candidates** with:
   - `event_type` (career_change, marriage, relocation, health, windfall)
   - `probability` (0.0–1.0)
   - `explanations[]` (traceable evidence)
   - `confluence_systems[]` (which systems agree)
   - `intensity` and `polarity` (benefic/malefic balance)

---

## Event Taxonomy

```python
class EventType(str, Enum):
    # Career
    CAREER_CHANGE = "career_change"
    PROMOTION = "promotion"
    JOB_LOSS = "job_loss"
    BUSINESS_START = "business_start"

    # Relationship
    MARRIAGE = "marriage"
    ENGAGEMENT = "engagement"
    BREAKUP = "breakup"
    CHILDBIRTH = "childbirth"

    # Location/Property
    RELOCATION = "relocation"
    PROPERTY_PURCHASE = "property_purchase"

    # Finance
    WINDFALL = "windfall"
    EXPENSE_SHOCK = "expense_shock"

    # Health
    HEALTH_ISSUE = "health_issue"
    SURGERY = "surgery"

    # Education/Legal
    HIGHER_STUDIES = "higher_studies"
    LITIGATION = "litigation"
```

---

## Domain Models

### Signal (Atomic Evidence)

```python
class DashaSystem(str, Enum):
    VIMSHOTTARI = "vimshottari"
    CHARA = "chara"
    YOGINI = "yogini"

class Signal(BaseModel):
    """Single astrologically meaningful condition."""
    id: str
    system: DashaSystem
    event_tags: list[EventType]
    weight: float                    # 0.0-1.0, intrinsic strength
    polarity: int                    # +1 benefic, -1 malefic, 0 mixed
    rationale: str                   # Human explanation
    features: dict[str, Any]         # Structured details for audits
```

### TimeSegment

```python
class VimshottariState(BaseModel):
    md_lord: PlanetName
    ad_lord: PlanetName
    pd_lord: PlanetName | None = None

class CharaState(BaseModel):
    sign_md: ZodiacSign              # Mahadasha sign
    sign_ad: ZodiacSign              # Antardasha sign
    active_karakas: list[str]        # AmK, DK, etc. in active signs

class YoginiState(BaseModel):
    yogini_name: str                 # Mangala, Pingala, etc.
    lord: PlanetName

class TimeSegment(BaseModel):
    start_date: datetime
    end_date: datetime
    vimshottari: VimshottariState
    chara: CharaState
    yogini: YoginiState
    signals: list[Signal] = []
    event_scores: dict[EventType, float] = {}
```

### EventWindow (Output)

```python
class EventWindow(BaseModel):
    event_type: EventType
    window_start: datetime
    window_end: datetime
    probability: float               # 0.0-1.0
    confluence_systems: list[DashaSystem]
    top_signals: list[Signal]
    explanations: list[str]
```

---

## High-Level Pipeline

```python
def build_composite_timeline(
    context: SiderealContext,
    start_date: datetime,
    end_date: datetime,
    config: DashaEngineConfig,
) -> CompositeTimeline:
    """Main entry point for composite dasha analysis."""

    # 1. Compute Jaimini Karakas (AtK, AmK, DK, etc.)
    karakas = compute_jaimini_karakas(context)

    # 2. Compute all three dasha systems for time window
    vim_periods = compute_vimshottari_periods(context, start_date, end_date)
    chara_periods = compute_chara_dasha_periods(context, start_date, end_date, karakas)
    yogini_periods = compute_yogini_periods(context, start_date, end_date)

    # 3. Unify into segments (split on every boundary)
    segments = unify_periods_into_segments(vim_periods, chara_periods, yogini_periods)

    # 4. Extract signals for each segment
    for seg in segments:
        seg.signals += extract_vimshottari_signals(seg, context, karakas, config)
        seg.signals += extract_chara_signals(seg, context, karakas, config)
        seg.signals += extract_yogini_signals(seg, context, karakas, config)

        # 5. Score events based on signals + confluence
        seg.event_scores = score_events_from_signals(seg.signals, config)

    # 6. Stitch adjacent high-probability segments into event windows
    events = stitch_segments_into_events(segments, config)

    return CompositeTimeline(segments=segments, events=events)
```

---

## Segment Unification

Turn three sets of date ranges into minimal non-overlapping segments:

```python
def unify_periods_into_segments(
    vim_periods: list[VimPeriod],
    chara_periods: list[CharaPeriod],
    yogini_periods: list[YoginiPeriod],
) -> list[TimeSegment]:
    """Split timeline at every dasha boundary."""

    # Collect all boundaries
    boundaries: set[datetime] = set()
    for p in vim_periods + chara_periods + yogini_periods:
        boundaries.add(p.start_date)
        boundaries.add(p.end_date)

    sorted_bounds = sorted(boundaries)
    segments = []

    for i in range(len(sorted_bounds) - 1):
        seg_start = sorted_bounds[i]
        seg_end = sorted_bounds[i + 1]

        segments.append(TimeSegment(
            start_date=seg_start,
            end_date=seg_end,
            vimshottari=find_active_vim(vim_periods, seg_start),
            chara=find_active_chara(chara_periods, seg_start),
            yogini=find_active_yogini(yogini_periods, seg_start),
        ))

    return segments
```

---

## Signal Extraction Rules

### Vimshottari Signals

```python
def extract_vimshottari_signals(
    seg: TimeSegment,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
) -> list[Signal]:
    signals = []
    lords = [seg.vimshottari.md_lord, seg.vimshottari.ad_lord]
    if seg.vimshottari.pd_lord:
        lords.append(seg.vimshottari.pd_lord)

    for lord in lords:
        planet = context.planets[lord]

        # Career signals: 10th house involvement
        if planet.house == 10 or lord == context.houses[10].sign_lord:
            signals.append(Signal(
                id=f"vim_{lord}_10th",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.CAREER_CHANGE, EventType.PROMOTION],
                weight=config.weights.vim_10th_activation,
                polarity=1 if planet.dignity in [Dignity.EXALTED, Dignity.OWN] else 0,
                rationale=f"{lord.value} activates 10th house during dasha period",
                features={"planet": lord, "house": 10, "dignity": planet.dignity},
            ))

        # Relationship signals: 7th house involvement
        if planet.house == 7 or lord == context.houses[7].sign_lord:
            signals.append(Signal(
                id=f"vim_{lord}_7th",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.MARRIAGE, EventType.ENGAGEMENT],
                weight=config.weights.vim_7th_activation,
                polarity=1 if planet.dignity != Dignity.DEBILITATED else -1,
                rationale=f"{lord.value} activates 7th house (relationships)",
                features={"planet": lord, "house": 7},
            ))

        # Health signals: 6th/8th house lords
        if lord == context.houses[6].sign_lord or lord == context.houses[8].sign_lord:
            signals.append(Signal(
                id=f"vim_{lord}_health",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.HEALTH_ISSUE],
                weight=config.weights.vim_health_house,
                polarity=-1,
                rationale=f"{lord.value} period lord of 6th/8th house (health)",
                features={"planet": lord},
            ))

        # Relocation signals: 4th/12th house involvement
        if planet.house in [4, 12] or lord in [
            context.houses[4].sign_lord,
            context.houses[12].sign_lord
        ]:
            signals.append(Signal(
                id=f"vim_{lord}_relocation",
                system=DashaSystem.VIMSHOTTARI,
                event_tags=[EventType.RELOCATION],
                weight=config.weights.vim_relocation,
                polarity=0,
                rationale=f"{lord.value} activates 4th/12th (home/foreign lands)",
                features={"planet": lord},
            ))

    return signals
```

### Chara Dasha Signals (Material Events)

```python
def extract_chara_signals(
    seg: TimeSegment,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
) -> list[Signal]:
    signals = []
    sign_md = seg.chara.sign_md
    sign_ad = seg.chara.sign_ad

    # Career: AmK (Amatyakaraka) sign activation
    if karakas.amk.sign == sign_md or karakas.amk.sign == sign_ad:
        signals.append(Signal(
            id="chara_amk_active",
            system=DashaSystem.CHARA,
            event_tags=[EventType.CAREER_CHANGE, EventType.PROMOTION],
            weight=config.weights.chara_amk_activation,
            polarity=1,
            rationale="Chara Dasha activates sign of Amatyakaraka (career significator)",
            features={"karaka": "AmK", "sign": sign_md.value},
        ))

    # Relationship: DK (Darakaraka) or 7th from Lagna sign
    if karakas.dk.sign == sign_md or karakas.dk.sign == sign_ad:
        signals.append(Signal(
            id="chara_dk_active",
            system=DashaSystem.CHARA,
            event_tags=[EventType.MARRIAGE, EventType.ENGAGEMENT],
            weight=config.weights.chara_dk_activation,
            polarity=1,
            rationale="Chara Dasha activates sign of Darakaraka (spouse significator)",
            features={"karaka": "DK", "sign": sign_md.value},
        ))

    # House-based signals from sign position
    house_from_lagna = get_house_of_sign(sign_md, context.lagna.sign)

    if house_from_lagna == 10:
        signals.append(Signal(
            id="chara_10th_sign",
            system=DashaSystem.CHARA,
            event_tags=[EventType.CAREER_CHANGE],
            weight=config.weights.chara_house_activation,
            polarity=1,
            rationale="Chara Dasha of 10th house sign (career focus)",
            features={"house": 10, "sign": sign_md.value},
        ))

    if house_from_lagna in [4, 12]:
        signals.append(Signal(
            id="chara_relocation_sign",
            system=DashaSystem.CHARA,
            event_tags=[EventType.RELOCATION],
            weight=config.weights.chara_house_activation,
            polarity=0,
            rationale="Chara Dasha of 4th/12th sign (change of residence)",
            features={"house": house_from_lagna, "sign": sign_md.value},
        ))

    return signals
```

### Yogini Signals (Short-Term Triggers)

```python
def extract_yogini_signals(
    seg: TimeSegment,
    context: SiderealContext,
    karakas: JaiminiKarakas,
    config: DashaEngineConfig,
) -> list[Signal]:
    """Yogini provides resolution/modulation, not primary signals."""
    signals = []
    yogini_lord = seg.yogini.lord
    planet = context.planets[yogini_lord]

    # Yogini reinforces house-based themes
    if planet.house == 10:
        signals.append(Signal(
            id=f"yogini_{yogini_lord}_10th",
            system=DashaSystem.YOGINI,
            event_tags=[EventType.CAREER_CHANGE],
            weight=config.weights.yogini_boost,
            polarity=1,
            rationale=f"Yogini {seg.yogini.yogini_name} lord in 10th (short-term career trigger)",
            features={"yogini": seg.yogini.yogini_name, "planet": yogini_lord},
        ))

    if planet.house == 7:
        signals.append(Signal(
            id=f"yogini_{yogini_lord}_7th",
            system=DashaSystem.YOGINI,
            event_tags=[EventType.MARRIAGE],
            weight=config.weights.yogini_boost,
            polarity=1,
            rationale=f"Yogini period triggers 7th house (relationship timing)",
            features={"yogini": seg.yogini.yogini_name, "planet": yogini_lord},
        ))

    return signals
```

---

## Confluence Scoring

The critical differentiator: **probability increases when multiple systems agree**.

```python
BASE_PROBABILITIES = {
    EventType.CAREER_CHANGE: 0.20,
    EventType.MARRIAGE: 0.15,
    EventType.RELOCATION: 0.10,
    EventType.HEALTH_ISSUE: 0.10,
    EventType.WINDFALL: 0.08,
    EventType.PROMOTION: 0.15,
}

def score_events_from_signals(
    signals: list[Signal],
    config: DashaEngineConfig,
) -> dict[EventType, float]:
    """Compute probability for each event type based on signals + confluence."""

    scores = {et: BASE_PROBABILITIES.get(et, 0.10) for et in EventType}

    # 1. Additive contribution from signals
    for sig in signals:
        for event_type in sig.event_tags:
            polarity_adj = 1.0 + (sig.polarity * 0.2)  # +/-20% for polarity
            scores[event_type] += sig.weight * polarity_adj

    # 2. Confluence multipliers (the "Super Logic")
    for event_type in scores:
        systems_present = {
            sig.system for sig in signals
            if event_type in sig.event_tags
        }

        # Dual confluence
        if DashaSystem.VIMSHOTTARI in systems_present and DashaSystem.CHARA in systems_present:
            scores[event_type] *= config.multipliers.vim_x_chara  # e.g., 1.8

        if DashaSystem.VIMSHOTTARI in systems_present and DashaSystem.YOGINI in systems_present:
            scores[event_type] *= config.multipliers.vim_x_yogini  # e.g., 1.3

        if DashaSystem.CHARA in systems_present and DashaSystem.YOGINI in systems_present:
            scores[event_type] *= config.multipliers.chara_x_yogini  # e.g., 1.3

        # Triple confluence - strongest signal
        if len(systems_present) == 3:
            scores[event_type] *= config.multipliers.triple_stack  # e.g., 2.2

    # 3. Clamp to 0-1 range with sigmoid calibration
    for event_type in scores:
        scores[event_type] = clamp(sigmoid_calibrate(scores[event_type]), 0.0, 1.0)

    return scores


# The explicit "50% -> 90%" rule for career
def apply_expert_rules(scores: dict, signals: list[Signal]) -> dict:
    """Hardcoded expert rules that guarantee high probability."""

    vim_career = any(
        s.system == DashaSystem.VIMSHOTTARI and EventType.CAREER_CHANGE in s.event_tags
        for s in signals
    )
    chara_amk = any(
        s.system == DashaSystem.CHARA and "AmK" in s.features.get("karaka", "")
        for s in signals
    )

    if vim_career and chara_amk:
        scores[EventType.CAREER_CHANGE] = max(scores[EventType.CAREER_CHANGE], 0.90)

    return scores
```

---

## Event Window Stitching

Merge adjacent segments with same high-probability event:

```python
def stitch_segments_into_events(
    segments: list[TimeSegment],
    config: DashaEngineConfig,
) -> list[EventWindow]:
    """Merge adjacent segments into coherent event windows."""

    events: list[EventWindow] = []
    active: dict[EventType, EventWindow] = {}

    for seg in segments:
        for event_type, probability in seg.event_scores.items():
            threshold = config.thresholds.get(event_type, 0.30)

            if probability >= threshold:
                relevant_signals = [
                    s for s in seg.signals if event_type in s.event_tags
                ]
                systems = list({s.system for s in relevant_signals})

                # Check if we can extend existing window
                if event_type in active:
                    gap = (seg.start_date - active[event_type].window_end).days
                    if gap <= config.merge_gap_days:  # e.g., 14 days
                        # Extend window
                        active[event_type].window_end = seg.end_date
                        active[event_type].probability = max(
                            active[event_type].probability, probability
                        )
                        active[event_type].top_signals.extend(relevant_signals[:3])
                        continue

                # Start new window
                window = EventWindow(
                    event_type=event_type,
                    window_start=seg.start_date,
                    window_end=seg.end_date,
                    probability=probability,
                    confluence_systems=systems,
                    top_signals=relevant_signals[:5],
                    explanations=[s.rationale for s in relevant_signals[:3]],
                )
                active[event_type] = window
                events.append(window)
            else:
                # Below threshold - close any active window
                active.pop(event_type, None)

    return events
```

---

## Configuration

```python
class ConfluenceMultipliers(BaseModel):
    vim_x_chara: float = 1.8         # Vim + Chara agree
    vim_x_yogini: float = 1.3        # Vim + Yogini agree
    chara_x_yogini: float = 1.3      # Chara + Yogini agree
    triple_stack: float = 2.2        # All three agree

class SignalWeights(BaseModel):
    # Vimshottari weights
    vim_10th_activation: float = 0.25
    vim_7th_activation: float = 0.20
    vim_health_house: float = 0.15
    vim_relocation: float = 0.15

    # Chara weights
    chara_amk_activation: float = 0.30
    chara_dk_activation: float = 0.25
    chara_house_activation: float = 0.20

    # Yogini weights (modulation, not primary)
    yogini_boost: float = 0.10

class DashaEngineConfig(BaseModel):
    weights: SignalWeights = SignalWeights()
    multipliers: ConfluenceMultipliers = ConfluenceMultipliers()
    thresholds: dict[EventType, float] = {
        EventType.CAREER_CHANGE: 0.30,
        EventType.MARRIAGE: 0.35,
        EventType.RELOCATION: 0.25,
        EventType.HEALTH_ISSUE: 0.25,
    }
    merge_gap_days: int = 14
```

---

## Jaimini Karakas Calculation

Required for Chara Dasha:

```python
class JaiminiKarakas(BaseModel):
    """Chara Karakas based on planetary degrees."""
    atk: PlanetPosition    # Atmakaraka (soul) - highest degree
    amk: PlanetPosition    # Amatyakaraka (career) - 2nd highest
    bk: PlanetPosition     # Bhratrukaraka (siblings) - 3rd
    mk: PlanetPosition     # Matrukaraka (mother) - 4th
    pk: PlanetPosition     # Pitrukaraka (father) - 5th
    gk: PlanetPosition     # Gnatikaraka (relatives) - 6th
    dk: PlanetPosition     # Darakaraka (spouse) - lowest degree

def compute_jaimini_karakas(context: SiderealContext) -> JaiminiKarakas:
    """Calculate Chara Karakas from planetary degrees."""

    # Only use 7 planets (exclude Rahu/Ketu)
    planets = [
        context.planets[p] for p in [
            PlanetName.SUN, PlanetName.MOON, PlanetName.MARS,
            PlanetName.MERCURY, PlanetName.JUPITER,
            PlanetName.VENUS, PlanetName.SATURN,
        ]
    ]

    # Sort by degree within sign (sign_degrees)
    sorted_planets = sorted(planets, key=lambda p: p.sign_degrees, reverse=True)

    return JaiminiKarakas(
        atk=sorted_planets[0],
        amk=sorted_planets[1],
        bk=sorted_planets[2],
        mk=sorted_planets[3],
        pk=sorted_planets[4],
        gk=sorted_planets[5],
        dk=sorted_planets[6],
    )
```

---

## Chara Dasha Calculation

```python
CHARA_DASHA_YEARS = {
    ZodiacSign.ARIES: 7,
    ZodiacSign.TAURUS: 8,
    ZodiacSign.GEMINI: 9,
    ZodiacSign.CANCER: 10,
    ZodiacSign.LEO: 11,
    ZodiacSign.VIRGO: 12,
    ZodiacSign.LIBRA: 7,
    ZodiacSign.SCORPIO: 8,
    ZodiacSign.SAGITTARIUS: 9,
    ZodiacSign.CAPRICORN: 10,
    ZodiacSign.AQUARIUS: 11,
    ZodiacSign.PISCES: 12,
}

def compute_chara_dasha_periods(
    context: SiderealContext,
    start_date: datetime,
    end_date: datetime,
    karakas: JaiminiKarakas,
) -> list[CharaPeriod]:
    """Calculate Jaimini Chara Dasha periods."""

    # Starting sign depends on Lagna being odd/even
    lagna_sign = context.lagna.sign
    lagna_idx = ZODIAC_SIGNS.index(lagna_sign.value)
    is_odd_sign = lagna_idx % 2 == 0  # Aries=0 is odd

    periods = []
    current_date = context.dashas.maha_dasha_sequence[0].start_date  # birth date

    # Generate sequence (clockwise for odd, counter-clockwise for even)
    for i in range(12):
        if is_odd_sign:
            sign_idx = (lagna_idx + i) % 12
        else:
            sign_idx = (lagna_idx - i + 12) % 12

        sign = ZodiacSign(ZODIAC_SIGNS[sign_idx])
        years = CHARA_DASHA_YEARS[sign]
        period_end = current_date + timedelta(days=years * 365.25)

        # Only include if overlaps with requested window
        if period_end >= start_date and current_date <= end_date:
            periods.append(CharaPeriod(
                sign=sign,
                start_date=max(current_date, start_date),
                end_date=min(period_end, end_date),
                duration_years=years,
            ))

        current_date = period_end
        if current_date > end_date:
            break

    return periods
```

---

## Yogini Dasha Calculation

```python
YOGINI_SEQUENCE = [
    ("Mangala", PlanetName.MOON, 1),
    ("Pingala", PlanetName.SUN, 2),
    ("Dhanya", PlanetName.JUPITER, 3),
    ("Bhramari", PlanetName.MARS, 4),
    ("Bhadrika", PlanetName.MERCURY, 5),
    ("Ulka", PlanetName.SATURN, 6),
    ("Siddha", PlanetName.VENUS, 7),
    ("Sankata", PlanetName.RAHU, 8),
]  # Total: 36 years

def compute_yogini_periods(
    context: SiderealContext,
    start_date: datetime,
    end_date: datetime,
) -> list[YoginiPeriod]:
    """Calculate Yogini Dasha periods based on Moon's nakshatra."""

    moon = context.planets[PlanetName.MOON]
    nak_idx = NAKSHATRA_NAMES.index(moon.nakshatra)

    # Starting Yogini = (nakshatra + 3) mod 8
    start_yogini_idx = (nak_idx + 3) % 8

    # Balance calculation similar to Vimshottari
    nak_span = 360 / 27
    nak_start = nak_idx * nak_span
    portion_consumed = (moon.longitude - nak_start) / nak_span

    periods = []
    birth_date = context.dashas.maha_dasha_sequence[0].start_date
    current_date = birth_date

    # First period (with balance)
    yogini_name, lord, years = YOGINI_SEQUENCE[start_yogini_idx]
    remaining_years = years * (1 - portion_consumed)
    period_end = current_date + timedelta(days=remaining_years * 365.25)

    if period_end >= start_date:
        periods.append(YoginiPeriod(
            yogini_name=yogini_name,
            lord=lord,
            start_date=max(current_date, start_date),
            end_date=min(period_end, end_date),
            duration_years=remaining_years,
        ))

    current_date = period_end

    # Subsequent periods (cycle through 36-year sequence)
    cycle_count = 0
    while current_date < end_date and cycle_count < 10:  # Max 10 cycles
        for i in range(8):
            idx = (start_yogini_idx + 1 + i) % 8
            yogini_name, lord, years = YOGINI_SEQUENCE[idx]
            period_end = current_date + timedelta(days=years * 365.25)

            if current_date <= end_date and period_end >= start_date:
                periods.append(YoginiPeriod(
                    yogini_name=yogini_name,
                    lord=lord,
                    start_date=max(current_date, start_date),
                    end_date=min(period_end, end_date),
                    duration_years=years,
                ))

            current_date = period_end
            if current_date > end_date:
                break
        cycle_count += 1

    return periods
```

---

## API Endpoint

```python
@app.post("/api/v1/charts/{chart_id}/composite-dasha")
async def get_composite_dasha(
    chart_id: str,
    request: CompositeDashaRequest,
    user: CurrentUser = Depends(),
) -> CompositeDashaResponse:
    """Generate composite dasha timeline with event predictions."""

    chart = await get_chart(chart_id, user.id)
    context = calculate_sidereal_context(
        chart.birth_datetime_utc,
        chart.latitude,
        chart.longitude,
    )

    timeline = build_composite_timeline(
        context=context,
        start_date=request.start_date,
        end_date=request.end_date,
        config=DashaEngineConfig(),
    )

    return CompositeDashaResponse(
        chart_id=chart_id,
        segments=timeline.segments,
        events=timeline.events,
        generated_at=datetime.now(UTC),
    )
```

---

## Explainability Output

Every predicted event includes traceable evidence:

```json
{
  "event_type": "career_change",
  "window_start": "2027-03-14",
  "window_end": "2027-09-02",
  "probability": 0.91,
  "confluence_systems": ["vimshottari", "chara", "yogini"],
  "explanations": [
    "Vimshottari AD lord Saturn activates 10th house and is strong by dignity.",
    "Chara Dasha sign contains Amatyakaraka (career significator).",
    "Yogini Ulka period lord Saturn reinforces 10th house activation."
  ],
  "top_signals": [
    {
      "system": "vimshottari",
      "weight": 0.25,
      "polarity": 1,
      "rationale": "Saturn activates 10th house during AD period"
    },
    {
      "system": "chara",
      "weight": 0.30,
      "rationale": "AmK sign active in Chara Mahadasha"
    }
  ]
}
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `backend/src/almamesh/dasha_engine.py` | **NEW** - Core composite engine (~600 LOC) |
| `backend/src/almamesh/calculations.py` | Add Jaimini karakas, export needed constants |
| `backend/src/almamesh/api.py` | Add `/composite-dasha` endpoint |
| `backend/tests/unit/test_dasha_engine.py` | **NEW** - Unit tests |

---

## Implementation Phases

### Phase 1: Core Models + Jaimini Karakas (MVP)
- Add domain models (Signal, TimeSegment, EventWindow)
- Implement `compute_jaimini_karakas()`
- Unit tests for karaka calculation

### Phase 2: Chara + Yogini Dasha
- Implement `compute_chara_dasha_periods()`
- Implement `compute_yogini_periods()`
- Unit tests for period calculations

### Phase 3: Signal Extraction
- Implement `extract_vimshottari_signals()`
- Implement `extract_chara_signals()`
- Implement `extract_yogini_signals()`
- Tests for signal generation

### Phase 4: Confluence Scoring + Stitching
- Implement `score_events_from_signals()` with confluence multipliers
- Implement `stitch_segments_into_events()`
- Integration tests

### Phase 5: API + Calibration
- Add endpoint
- Build calibration harness with test profiles
- Tune weights/thresholds

---

## Success Criteria

1. **Confluence Detection**: When Vim + Chara agree on career event, probability >= 0.85
2. **Explainability**: Every event has 2+ traced explanations
3. **Performance**: Timeline for 10 years generates in < 500ms
4. **Accuracy**: Compare against 20+ known life events (calibration set)

---

## Future Enhancements (Out of Scope)

- **Ashtakavarga Kakshya**: Precise daily strength scores
- **Varga-Specific Transits**: D9/D10 overlays
- **Tajik Varshaphala**: Annual solar return integration
- **Bhrigu Bindu**: Sensitive point triggers
- **Sarvatobhadra Chakra**: Vedha (obstruction) alerts

---

## References

- Jaimini Sutras (Chara Dasha rules)
- Brihat Parashara Hora Shastra (Vimshottari)
- Yogini Dasha classical texts
- Existing `calculations.py` implementation

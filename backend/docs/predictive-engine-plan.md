# Predictive Engine — Phase 1: Transits / Gochara

> **Status:** DESIGN (implementation-ready). No feature code committed yet.
> **Scope:** Phase 1 only — Gochara, Sade Sati, slow-transit hits, dasha×transit
> fusion, and a 12-month forward timeline. Phases 2 (Shodasavarga) and 3
> (Ashtakavarga + Shadbala) are sketched at the end so Phase 1 models don't
> paint us into a corner.

## TL;DR

The transit engine answers *"where are the planets **now** relative to your birth
chart, and what's coming?"* It reuses the **exact same** sidereal pipeline that
draws the natal chart — same DE421, same Lahiri ayanamsa, same `_to_utc`, same
`SkyfieldAstronomy.get_planetary_positions` — evaluated at a second instant (the
transit instant) instead of the birth instant. Natal and transit positions are
therefore coherent by construction (one source of truth). On top of those
positions we layer the classical Vedic reading rules (gochara from Moon + Lagna,
Sade Sati, returns) and fuse them with the active Vimshottari dasha. The output
is a typed `TransitContext` of dated, structured, **prose-free** descriptors; the
LLM narrates later.

A seasoned astrologer verifying against Jagannatha Hora / Parashara's Light should
find: identical sidereal longitudes (sub-arcsecond), the same Sade Sati phase
dates, the same Jupiter/Saturn ingress dates, and the same dasha lord — because
we compute the same things the same way.

**Feasibility confirmed** (throwaway snippet, not committed): the existing
pipeline computes Saturn at 348.69° Pisces for 2026-06-09, and a 40-iteration
bisection resolves Saturn's next ingress into Aries at 2027-06-02T23:04Z — which
matches published panchanga. Zero new astronomy code was needed.

---

## 1. What we reuse (single source of truth)

Everything astronomical already exists in `backend/src/almamesh/calculations.py`.
The transit engine is a **new orchestration layer over unchanged primitives** —
it must NOT reimplement any astronomy.

| Reused primitive | Location | Role in transits |
|---|---|---|
| `_to_utc(dt)` | `calculations.py:56` | Normalize the transit instant (CONVERT aware → UTC, never relabel). Same guard the natal path uses. |
| `SkyfieldAstronomy` | `calculations.py:223` | The DE421-backed astronomy object. Construct **once**, reuse across every sampled instant (it loads the ephemeris in `__init__`). |
| `SkyfieldAstronomy.get_planetary_positions(dt_utc, ayanamsa, node_type)` | `calculations.py:345` | THE transit-position call. Returns the 9 grahas + nodes as sidereal longitudes at any instant. This is what we sample at "now" and at every root-find probe. |
| `_resolve_ayanamsa(astro, dt_utc, ayanamsa_type)` | `calculations.py:566` | Lahiri (default) ayanamsa **at the transit instant**. CRITICAL: ayanamsa is time-varying (~50″/yr); a transit decades after birth has a measurably different ayanamsa. We resolve it fresh per instant — never reuse the natal ayanamsa. |
| `get_nakshatra_info(longitude)` | `calculations.py:403` | Transit planet's nakshatra/pada (for finer gochara + Sade-Sati nakshatra context). |
| `calculate_vimshottari_dashas(moon_long, birth_dt, reference_date=...)` | `calculations.py:672` | The active maha dasha at the transit instant. Already accepts an injectable `reference_date` — exactly the reproducibility hook we need. |
| `compute_vimshottari_periods(...)` / `find_active_vimshottari(periods, dt)` | `dasha/vimshottari.py:44`, `:127` | The richer maha→antar→pratyantar nesting for the fusion layer (the top-level `VimshottariDashaData` only carries maha unless populated). |
| `ZODIAC_SIGNS`, `SIGN_LORDS`, `PlanetName`, `ZodiacSign` | `constants/astrology.py` | Sign indexing, lordships, enums. |
| Golden-fixture infra | `tests/test_chart_golden.py`, `tests/fixtures/chart_golden_de421.json` | The canonicalize-and-pin pattern we extend for transit goldens. |
| External-oracle infra | `tests/validation/reference_fixtures_loader.py` + `reference_fixtures.json` | Independent validation = an **astropy/ERFA `GeocentricTrueEcliptic` transform on the same DE421** (NOT a separate ephemeris). **JPL Horizons was spot-checked once** (Delhi Sun, 0.045″) to anchor the astropy path; it is not the per-run oracle. The independent-validation pattern we extend for transit longitudes. |

**New helper we DO add** (thin, ≤15 lines, no astronomy): a
`transit_positions(astro, when, ayanamsa_type, node_type)` that bundles
`_to_utc` → `_resolve_ayanamsa` → `get_planetary_positions` so every transit call
site goes through one coherent path. It returns the same raw dict shape
`get_planetary_positions` already returns, so `_build_planet_position`
(`calculations.py:468`) can be reused verbatim to produce `PlanetPosition`
objects for transit grahas (giving us sign/nakshatra/dignity/retrograde for free).

---

## 2. Output contract (Pydantic) — `TransitContext`

New module: `backend/src/almamesh/transits/` (mirrors the `dasha/` package
layout). Models live in `backend/src/almamesh/schemas/transits.py` (sibling of
`schemas/astrology.py`) so the schema layer stays cohesive.

All models follow `python-quality`: typed, Pydantic at the boundary, **no
`Dict[str, Any]`, no `TypedDict`**, ≤15-line functions, enums for closed sets,
`model_config = {"use_enum_values": True}` where we serialize to the browser.

```python
# schemas/transits.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
from almamesh.constants.astrology import PlanetName, ZodiacSign

# ---- enums (closed sets; serialize as their .value) ----

class SadeSatiPhase(str, Enum):
    RISING = "rising"      # Saturn in 12th from natal Moon sign
    PEAK = "peak"          # Saturn in 1st from natal Moon sign (over the Moon)
    SETTING = "setting"    # Saturn in 2nd from natal Moon sign
    NONE = "none"          # not currently in Sade Sati

class TransitReference(str, Enum):
    MOON = "moon"          # gochara read from natal Moon (Chandra Lagna)
    LAGNA = "lagna"        # gochara read from natal Ascendant

class TransitEventKind(str, Enum):
    SIGN_INGRESS = "sign_ingress"          # slow graha enters a new rasi
    SADE_SATI_PHASE = "sade_sati_phase"    # entry into rising/peak/setting/none
    RETURN = "return"                      # Saturn (~29.5y) or Jupiter (~12y) return
    DASHA_CHANGE = "dasha_change"          # maha/antar lord handover
    STATION = "station"                    # retrograde/direct station (slow grahas)

class TransitSeverity(str, Enum):
    SUPPORTIVE = "supportive"
    NEUTRAL = "neutral"
    CHALLENGING = "challenging"

# ---- atomic placements ----

class TransitPlacement(BaseModel):
    """One transiting graha placed against the natal chart at the instant."""
    graha: PlanetName
    longitude: float                       # sidereal, 0..360
    sign: ZodiacSign
    sign_degrees: float                    # 0..30 within sign
    nakshatra: str
    nakshatra_pada: int
    is_retrograde: bool
    # placement RELATIVE to the natal chart (the "how did it know" content):
    house_from_lagna: int                  # 1..12, whole-sign from natal Lagna
    house_from_moon: int                   # 1..12, whole-sign from natal Moon (Chandra Lagna)
    natal_sign_occupied: ZodiacSign        # the natal-chart sign this transit sits in
    model_config = {"use_enum_values": True}

class GocharaContext(BaseModel):
    """All transiting grahas placed against the natal chart at `instant`."""
    instant: datetime                      # UTC, the transit instant ("now" or injected)
    transit_ayanamsa: float                # Lahiri at the transit instant (audit)
    placements: dict[PlanetName, TransitPlacement]

# ---- Sade Sati ----

class SadeSatiSegment(BaseModel):
    """One phase span of the current/queried Sade Sati cycle."""
    phase: SadeSatiPhase                   # rising / peak / setting
    saturn_sign: ZodiacSign                # the rasi Saturn occupies in this phase
    start: datetime                        # phase entry (ingress) instant, UTC
    end: datetime                          # phase exit (next ingress) instant, UTC
    model_config = {"use_enum_values": True}

class SadeSatiContext(BaseModel):
    """Saturn over the 12th/1st/2nd from natal Moon sign — the headline transit."""
    is_active: bool
    current_phase: SadeSatiPhase
    natal_moon_sign: ZodiacSign
    cycle: list[SadeSatiSegment]           # the 3 phase spans of the active/next cycle
    # convenience pointers (None when not active):
    cycle_start: datetime | None = None    # Saturn entering the 12th
    cycle_end: datetime | None = None      # Saturn leaving the 2nd
    model_config = {"use_enum_values": True}

# ---- major slow-transit hits & returns ----

class SlowTransitHit(BaseModel):
    """A Jupiter/Saturn transit over a natal point (Moon, Lagna), or a return."""
    graha: PlanetName                      # JUPITER or SATURN
    kind: TransitEventKind                 # SIGN_INGRESS / RETURN
    natal_point: str                       # "moon" | "lagna" | "natal_<graha>"
    exact: datetime                        # instant of exact conjunction / ingress, UTC
    severity: TransitSeverity
    model_config = {"use_enum_values": True}

# ---- dasha × transit fusion ----

class DashaTransitFusion(BaseModel):
    """The active dasha lord weighted by concurrent transits over it / from it."""
    instant: datetime
    maha_lord: PlanetName
    antar_lord: PlanetName | None = None
    # where the dasha LORD is transiting right now, and what transits hit it:
    maha_lord_transit_house_from_moon: int     # 1..12
    maha_lord_transit_house_from_lagna: int    # 1..12
    reinforcing: list[PlanetName] = Field(default_factory=list)  # benefics aspecting/conjunct
    afflicting: list[PlanetName] = Field(default_factory=list)   # malefics aspecting/conjunct
    net_weight: float                          # -1.0..+1.0 deterministic score
    severity: TransitSeverity
    model_config = {"use_enum_values": True}

# ---- 12-month forward timeline ----

class TimelineEvent(BaseModel):
    """One dated, structured, prose-free forward event. The LLM narrates later."""
    date: datetime                         # UTC instant of the event
    kind: TransitEventKind
    graha: PlanetName | None = None        # the moving graha (None for pure dasha changes)
    from_sign: ZodiacSign | None = None    # ingress: vacated sign
    to_sign: ZodiacSign | None = None      # ingress: entered sign
    from_lord: PlanetName | None = None    # dasha change: outgoing lord
    to_lord: PlanetName | None = None      # dasha change: incoming lord
    sade_sati_phase: SadeSatiPhase | None = None
    severity: TransitSeverity
    descriptor: str                        # STABLE machine key, e.g. "saturn.ingress.aries"
    model_config = {"use_enum_values": True}

class TransitTimeline(BaseModel):
    """Forward-looking dated events over the window (default 12 months)."""
    window_start: datetime
    window_end: datetime
    events: list[TimelineEvent]            # chronologically sorted

# ---- top-level ----

class TransitContext(BaseModel):
    """Everything the predictive Phase-1 transit layer emits for one chart+instant."""
    instant: datetime                      # the transit "now" (UTC, injectable)
    gochara: GocharaContext
    sade_sati: SadeSatiContext
    slow_hits: list[SlowTransitHit]
    fusion: DashaTransitFusion
    timeline: TransitTimeline
```

### How it attaches to `SiderealContext` (additive, byte-stable natal output)

`TransitContext` is computed **against** a natal `SiderealContext` but is NOT
nested inside it — keeping the natal chart's serialization byte-identical (the
golden/parity guard stays green untouched). The public entrypoint takes the
already-computed natal context plus a transit instant:

```python
# transits/__init__.py
def calculate_transit_context(
    natal: SiderealContext,
    birth_dt: datetime,
    transit_instant: datetime | None = None,   # None -> now(UTC); inject for reproducibility
    window_months: int = 12,
    ayanamsa_type: AyanamsaType = AyanamsaType.LAHIRI,
    node_type: NodeType = NodeType.MEAN,
) -> TransitContext: ...
```

`birth_dt` is required because dasha math is anchored to the birth instant, not
to the natal context (which doesn't retain it). `transit_instant=None` defaults
to `datetime.now(UTC)`; **all fixtures pin it** for reproducibility.

### The full contract chain (per CLAUDE.md)

```
Python  calculate_transit_context(natal, birth_dt, transit_instant) -> TransitContext
   │  (same ayanamsa + position pipeline as the natal chart; byte-identical on Pyodide)
   ▼
TS engine  SiderealChart gains optional `transits: TransitContext | null`
   │  (frontend/packages/browser/src/pyodide/chart.ts — pure reshape, NO astrology)
   ▼
store adapter  toTransitCtx(chart) in @almamesh/store adapters/chart.ts
   │  (pure; mirrors the existing toVargaCtx/toDashaCtx at chart.ts:183/323)
   ▼
@almamesh/shared-types  TransitChartData added to ChartData (additive, optional)
   ▼
UI  a "Transits & Timeline" panel; the LLM narrates `descriptor` keys in-language
```

The transit emission is gated/optional (`transits: null` when the caller doesn't
request it) so the natal-only path and its golden fixture remain byte-stable.

---

## 3. Algorithms (with the classical rule cited)

### 3.1 Gochara — current transits (`GocharaContext`)

1. `positions = transit_positions(astro, instant, ayanamsa_type, node_type)` —
   sidereal longitudes of all grahas at the instant (reuses `get_planetary_positions`).
2. For each graha, build a `TransitPlacement`:
   - `natal_sign_occupied = ZODIAC_SIGNS[int(lon // 30)]`.
   - **House from Lagna** (Parashari whole-sign gochara from Lagna):
     `house_from_lagna = (transit_sign_idx − natal_lagna_sign_idx + 12) % 12 + 1`
     — identical formula to natal `_build_planet_position` (`calculations.py:468`).
   - **House from Moon** (Chandra Lagna — the traditional primary gochara
     reference): `house_from_moon = (transit_sign_idx − natal_moon_sign_idx + 12) % 12 + 1`.
   Classical basis: *gochara phala* (transit results) in Brihat Samhita / Phaladeepika
   is read **from the Janma Rāśi (natal Moon sign)** first, and from the Lagna
   secondarily. We emit both so a pro sees what they expect.

### 3.2 Sade Sati (`SadeSatiContext`) — the headline, must be exact

**Rule (Phaladeepika / classical):** Sade Sati ("the 7½") is the ~7.5-year span
when transiting Saturn occupies the **12th, 1st, and 2nd signs counted from the
natal Moon sign (Janma Rāśi)**. Saturn spends ~2.5 years per sign × 3 signs ≈ 7.5
years. Three phases:
- **Rising** — Saturn in the 12th from natal Moon.
- **Peak** — Saturn in the 1st from natal Moon (i.e. transiting the natal Moon sign itself).
- **Setting** — Saturn in the 2nd from natal Moon.

Algorithm (all dates from ingress root-finds, §3.6):
1. `moon_idx = natal_moon_sign_idx`. The three Sade-Sati signs are
   `(moon_idx + 11) % 12` (12th), `moon_idx` (1st), `(moon_idx + 1) % 12` (2nd).
2. `current_saturn_sign_idx = int(saturn_lon // 30)`.
3. `current_phase` = whichever of the three (or `NONE`) matches; `is_active =
   current_phase != NONE`.
4. **Phase boundaries** = the instants Saturn ingresses into / out of each of the
   three signs, found by bisection root-finding Saturn's longitude crossing the
   sign cusps (12th-sign entry → peak entry → setting entry → setting exit).
   Emit a `SadeSatiSegment` per phase with `start`/`end`.
5. `cycle_start` = Saturn entering the 12th; `cycle_end` = Saturn leaving the 2nd.

**Retrograde correctness (critical):** Saturn retrogrades ~140 days/yr, so it can
cross a sign cusp **up to 3 times** (in, back out, in again) before settling.
The "true" phase entry is the **final** forward crossing that sticks. The root-
finder (§3.6) must therefore find ALL crossings in the bracket and take the last
one for the phase boundary — not the first. This is the single most common way a
naïve Sade Sati calculation disagrees with Jagannatha Hora. Test it explicitly.

### 3.3 Major slow-transit hits & returns (`SlowTransitHit`)

- **Jupiter / Saturn over natal Moon and natal Lagna:** find the instant
  transiting Jupiter (resp. Saturn) longitude equals the natal Moon longitude
  (resp. natal Lagna longitude) within the search window — a conjunction
  root-find (§3.6). Whole-sign astrologers also accept "transit in the same sign
  as the natal point" as the hit; we emit the *exact-degree conjunction* instant
  (more precise, still verifiable) and the reader/UI can widen to the sign.
- **Saturn return:** transiting Saturn longitude == natal Saturn longitude
  (~29.5-yr period; the first return ~age 29–30 is the canonical life event).
  Find the next exact return after `instant`.
- **Jupiter return:** transiting Jupiter longitude == natal Jupiter longitude
  (~11.86-yr period; "Jupiter return" every ~12 years).
- **Severity heuristic (deterministic, no LLM):** Saturn hits on Moon/Lagna →
  `CHALLENGING`; Jupiter hits on Moon/Lagna → `SUPPORTIVE`; returns → `NEUTRAL`
  (a milestone marker, not good/bad). These are coarse, classical-leaning, and
  fully deterministic; the LLM adds nuance downstream.

### 3.4 Dasha × transit fusion (`DashaTransitFusion`)

Classical principle: **dasha says *what* period of life is active; transit says
*when within it* a result fires** ("dasha gives the promise, gochara gives the
timing"). Fusion:
1. Active `maha_lord` (and `antar_lord`) at `instant` via
   `calculate_vimshottari_dashas(natal_moon_long, birth_dt, reference_date=instant)`
   → `current_maha`; richer antar via `find_active_vimshottari` (`vimshottari.py:127`).
2. Locate where the **dasha lord itself is transiting now**
   (`maha_lord_transit_house_from_moon/_lagna`) — a lord transiting a kendra/trikona
   (1/4/7/10, 5/9) from the Moon is reinforced; the 6/8/12 (dusthana) is afflicted.
3. **Reinforcing / afflicting:** which benefics (Jupiter, Venus, waxing Moon) vs
   malefics (Saturn, Mars, Sun, Rahu, Ketu) currently conjoin or cast a graha-
   specific Vedic aspect (Saturn 3/7/10, Mars 4/7/8, Jupiter 5/7/9; all others 7th)
   onto the dasha lord's transit sign.
4. `net_weight ∈ [−1, +1]`: a small fixed-weight sum (benefic support − malefic
   affliction + house-placement bonus), clamped. Deterministic, documented
   weights table (no magic numbers inline). `severity` thresholds off `net_weight`.

### 3.5 12-month timeline (`TransitTimeline`)

Merge, dedupe, and chronologically sort dated events in `[instant, instant +
window_months]`:
- **Dasha changes:** maha and antar lord handovers whose `start_date` falls in the
  window (from the Vimshottari sequence).
- **Sign ingresses of Jupiter & Saturn:** root-found cusp crossings in the window
  (the slow grahas whose ingresses are rare and meaningful; the Moon ingresses
  ~monthly and the fast inner grahas are noise — excluded by design in Phase 1).
- **Sade Sati phase changes:** any `SadeSatiSegment` boundary in the window.
- **Saturn / Jupiter stations (if feasible):** the instants their longitudinal
  velocity changes sign (retrograde↔direct). Detected by bracketing where the
  sign of `(lon(t+δ) − lon(t))` flips, then bisecting. Marked feasible by the
  snippet; gated behind a flag so it can ship in a fast-follow if velocity
  sampling proves flaky at the window edges.

Each event carries a **stable `descriptor` key** (e.g. `"saturn.ingress.aries"`,
`"dasha.maha.jupiter_to_saturn"`, `"sade_sati.peak.start"`) — never prose. The
LLM/i18n layer maps the key to narrated text in the user's language.

### 3.6 Root-finding (shared machinery) — `transits/ingress.py`

A small, pure, well-tested helper used by Sade Sati, ingresses, returns, and
stations. Reuses `transit_positions` only.
- **Bracket:** coarse-step a target scalar function `f(t)` (a graha's longitude,
  or `longitude − target` for conjunctions/returns, mod-360-unwrapped) over the
  window at a step matched to the graha's speed (Saturn/Jupiter: 5-day step).
- **Refine:** when `f` crosses the target between two samples, **bisect** to a
  fixed tolerance (≈1 second of time = ~40 iterations) — the feasibility snippet
  used exactly this and hit sub-second precision.
- **Retrograde-aware:** detect ALL crossings in a bracket; for a sign *ingress*
  the canonical boundary is the **last** crossing that doesn't reverse (§3.2).
  Unwrap the 360°→0° seam so a conjunction near 0°/360° doesn't false-trigger.

Determinism note: bisection on a monotone-within-bracket continuous function is
deterministic given a fixed start, step, tolerance, and iteration count — all
pinned constants. No `now()` inside the root-finder; the instant is always passed.

---

## 4. Reference-validation plan (how we prove it to a pro)

Two tiers, mirroring the natal chart's existing two-tier validation
(`test_chart_golden.py` = self-consistency/parity; `validation/reference_fixtures.json`
= independent oracle).

### Tier 1 — Independent external oracle (the credibility proof)

New `tests/validation/transit_reference_fixtures.json` + loader, generated by an
independent code path (NOT the engine), committed with provenance:

| Fixture | Validates | External source |
|---|---|---|
| Transit longitudes of all grahas on a **fixed UTC date** (e.g. 2026-06-09T12:00Z) | §3.1 gochara positions | Primary oracle: an **astropy/ERFA tropical ecliptic transform on the same DE421, minus engine Lahiri ayanamsa** (the existing natal-validation path). JPL Horizons `OBS_ECLON` is a **one-off external spot-check** — confirmed so far only for the natal Delhi Sun (0.045″) in `reference_fixtures.json._provenance`; extending it to all grahas is part of this work, not an already-passed claim. Tolerance: sub-arcsecond vs the astropy oracle. |
| **Jupiter & Saturn sign-ingress dates** in 2024–2030 | §3.5 ingress root-find | Published panchanga / Jagannatha Hora ingress tables (e.g. Saturn → Aries 2027-06; the snippet already lands 2027-06-02T23:04Z). Tolerance: ±1 day (panchanga rounds to local civil date). |
| **A known Sade Sati period** for a known birth Moon sign | §3.2 phases + dates | A documented natal Moon sign + its published Sade Sati start/peak/end dates (cross-checked in Jagannatha Hora). Assert phase, `is_active`, and each segment boundary to ±1 day. **Pick a chart whose Saturn ingress is near a retrograde loop** to lock the last-crossing rule. |
| **A worked Saturn return** for a fixture birth | §3.3 returns | Hand-computed: natal Saturn longitude → next instant transit Saturn matches; cross-check the ~29.5-yr cadence and the date in Jagannatha Hora. |

### Tier 2 — Golden parity (CPython == Pyodide, regression lock)

Extend the existing golden pattern: new `tests/test_transit_golden.py` pins a
canonicalized `TransitContext` for each canonical fixture **with a fixed
`transit_instant`** (analogous to `FIXED_REFERENCE_DATE` in
`test_chart_golden.py`). Reuse the `_canonicalize` (6-decimal round, sorted keys)
helper. Add the transit instant to the Pyodide `test:parity` gate so transit
output is byte-identical in the browser (Tokyo is already in parity 6/6; add the
transit assertion to those same fixtures).

---

## 5. Determinism & CPython↔Pyodide byte-parity

1. **Injectable instant everywhere.** `transit_instant` and the dasha
   `reference_date` are parameters; `None` → `datetime.now(UTC)` only at the top.
   Every internal function receives the instant — **no `now()` below the
   entrypoint, none inside the root-finder.** Fixtures always pin it.
2. **Same ayanamsa source.** Lahiri table lookup (`_resolve_ayanamsa`) at the
   transit instant — identical code path to natal. No second ayanamsa formula.
3. **Float-edge discipline** (the known sub-µs parity hazards):
   - Sign-index from longitude: `int(lon // 30)` exactly as natal code does —
     never `lon / 30` with a different round. Reuse `_build_planet_position`'s
     idioms so transit and natal floor identically.
   - Navamsa-style `3/10` scaling lesson (`navamsa.py`): use exact integer/ratio
     forms at boundaries, never `// (10/3)`.
   - Root-finder: **fixed** step, tolerance, and iteration count (constants), so
     the bisection sequence is identical on both runtimes. Bisection only does
     compare + average — no transcendental divergence between CPython and the
     WASM build.
   - Canonicalize floats to 6 decimals in goldens (existing `_canonicalize`) so
     last-bit noise never trips the guard; the near-cusp CPython-only dasha edge
     (sub-µs) is documented — keep transit dasha assertions on the parity-clean
     fixtures, mirror the natal split.
4. **Timezone of "now".** The transit instant is normalized through `_to_utc`
   (`calculations.py:56`) — the same CONVERT-not-relabel guard the timezone fix
   (`3ebbe03`) installed. A `+05:30` "now" becomes the correct UTC instant, not a
   relabeled one. Production passes UTC already; the offline CLI / standalone
   engine are covered by this.

---

## 6. TDD test plan (failing tests first)

Red → green → refactor. Write these **before** implementation; watch each fail
for the right reason.

**`tests/test_transit_positions.py`**
1. `test_transit_position_matches_reference` — gochara longitudes on the fixed
   date within sub-arcsecond of the **astropy/ERFA-minus-ayanamsa oracle** (the
   independent path validated for the natal Sun; JPL Horizons remains a one-off
   spot-check, not the per-run oracle). (RED: no `transit_positions` yet.)
2. `test_transit_uses_transit_instant_ayanamsa` — ayanamsa at a 2026 transit ≠
   ayanamsa at a 1988 birth (guards against reusing natal ayanamsa).
3. `test_transit_instant_timezone_converts` — `+05:30` instant == its UTC
   equivalent (mirrors `test_timezone_correctness.py`).

**`tests/test_gochara.py`**
4. `test_house_from_moon_and_lagna` — known transit sign vs known natal Moon/Lagna
   → expected whole-sign houses (both references).

**`tests/test_sade_sati.py`** (the make-or-break suite)
5. `test_sade_sati_phase_detection` — a chart with a known active phase → correct
   `current_phase` + `is_active`.
6. `test_sade_sati_inactive` — a chart where Saturn is far from the Moon → `NONE`.
7. `test_sade_sati_segment_dates_match_reference` — the three segment boundaries
   within ±1 day of the published reference.
8. `test_sade_sati_retrograde_last_crossing` — a fixture where Saturn retrogrades
   across the cusp; assert the boundary is the **final** crossing, not the first.

**`tests/test_slow_hits.py`**
9. `test_saturn_return` — next Saturn return matches the ~29.5-yr hand-computed date.
10. `test_jupiter_over_natal_moon` — exact conjunction instant within tolerance.

**`tests/test_dasha_transit_fusion.py`**
11. `test_fusion_picks_active_maha_lord` — at a pinned instant, the maha lord
    matches `current_maha`.
12. `test_fusion_weight_sign` — a benefic-supported lord → `net_weight > 0`,
    `severity == SUPPORTIVE`; a malefic-afflicted lord → `< 0`, `CHALLENGING`.

**`tests/test_transit_timeline.py`**
13. `test_timeline_contains_saturn_ingress` — the known 2027 Saturn→Aries ingress
    appears with the right `descriptor` and date.
14. `test_timeline_sorted_and_within_window` — events sorted, all in
    `[start, end]`, no fast-graha noise.
15. `test_timeline_descriptors_are_keys_not_prose` — every `descriptor` matches a
    stable key pattern (no spaces/sentences).

**`tests/test_transit_golden.py`** — canonicalized `TransitContext` per fixture
with a pinned instant (parity lock). Plus the Pyodide `test:parity` assertion.

---

## 7. Risks / edge cases

| Risk | Handling |
|---|---|
| **Retrograde triple-crossing of a cusp** (Sade Sati / ingress dates wrong) | Root-finder finds ALL crossings in the bracket; ingress boundary = last sticking forward crossing (§3.2, §3.6). Dedicated test #8. |
| **Ingress exactly on a sign boundary** at the query instant | `int(lon // 30)` is the single source of truth for sign index everywhere; document the half-open `[sign·30, sign·30+30)` convention; a planet at exactly N·30.0 reads as the new sign (matches natal code). |
| **Ayanamsa inconsistency** (natal vs transit decades apart) | Always resolve ayanamsa at the *transit* instant via the same `_resolve_ayanamsa`; never carry the natal value. Test #2. |
| **Timezone of "now"** | `_to_utc` CONVERT-not-relabel at the entrypoint; test #3. |
| **0°/360° seam** in conjunction/return root-finds | Unwrap longitude difference to `(Δ+180)%360−180` before bracketing (the feasibility snippet already does this). |
| **Stations flaky at window edges** | Station detection gated behind a flag; ships green without it if velocity sampling is noisy; fast-follow. |
| **Ephemeris range** | DE421 covers 1900–2050 (per `calculations.py` note); a 12-month forward window from any plausible "now" is well inside it. Returns far in the future stay in-range for living users. |
| **Performance** (many root-find samples in Pyodide/WASM) | Construct `SkyfieldAstronomy` once; coarse 5-day steps for slow grahas; ~50–80 position evals per chart — comfortably sub-second on CPython, acceptable in the Worker. Cache positions per probed instant if profiling demands it. |
| **Natal output must stay byte-stable** | `TransitContext` is additive and not nested in `SiderealContext`; the existing natal golden/parity is untouched. |

---

## 8. Phase 1 task breakdown (ready to implement)

Parallelizable into ~3 agent contracts after the shared root-finder lands.

1. **Schemas** — `schemas/transits.py` (all models in §2). _No logic._
2. **Shared primitives** — `transits/positions.py` (`transit_positions`) +
   `transits/ingress.py` (bracket + retrograde-aware bisection root-finder).
   Tests #1–3, #8 first. _Blocks the rest._
3. **Gochara** — `transits/gochara.py` (`build_gochara_context`). Tests #4.
4. **Sade Sati** — `transits/sade_sati.py` (`build_sade_sati_context`). Tests #5–8.
   _Highest-priority correctness._
5. **Slow hits & returns** — `transits/slow_hits.py`. Tests #9–10.
6. **Fusion** — `transits/fusion.py` (reuses `dasha/vimshottari.py`). Tests #11–12.
7. **Timeline** — `transits/timeline.py` (merge/sort/dedupe). Tests #13–15.
8. **Orchestrator** — `transits/__init__.py` `calculate_transit_context(...)`.
9. **Validation fixtures** — `tools/generate_transit_reference_fixtures.py`
   (astropy/ERFA + panchanga independent path, with JPL Horizons as an
   occasional external spot-check) → `transit_reference_fixtures.json`;
   `test_transit_golden.py` + Pyodide parity assertion.
10. **Contract chain** — extend TS `SiderealChart.transits`, store `toTransitCtx`
    adapter, `@almamesh/shared-types` `TransitChartData`, then the UI panel +
    i18n descriptor keys. Run the live exit gate (transit panel reachable +
    correct on screen + clean console) — the project's non-negotiable.

**Quality gates (per CLAUDE.md):** `uv run pytest`, `ruff check/format`, `mypy
src/`, Radon Grade A, ≤15-line functions; `bun run typecheck`, `test:unit`,
`test:parity`; build+preview + live exit gate.

---

## 9. Forward-compat note — Phases 2 & 3 (don't paint us in)

- **Phase 2 — Shodasavarga (D1–D60).** The `VargaPlanet`/`NavamsaChart` pattern
  (`schemas/astrology.py`) already generalizes a graha→sign placement. Phase 2
  adds more varga functions (`navamsa.py` siblings) and a `VargaContext`. Phase 1
  stays orthogonal: transits are computed in **D1 longitudes**, and the fusion's
  `net_weight` is a single scalar that a later varga-strength term can extend
  without changing the `DashaTransitFusion` shape. Keep `net_weight` a plain
  float the divisional-strength layer can feed into.
- **Phase 3 — Ashtakavarga + Shadbala.** `PlanetPosition` already reserves
  optional `shadbala`/`ashtakavarga` fields (`schemas/astrology.py`). Gochara
  reading is classically filtered through **transit Ashtakavarga bindu counts**
  (a transit through a sign with ≥5 bindus is strong). Phase 1's `TransitPlacement`
  is intentionally minimal; Phase 3 will add an optional `bindus: int | None`
  there and let `fusion.net_weight` weight by it. Designing `net_weight` as a
  documented additive score (not a hard-coded enum) is what keeps that additive.

The unifying decision: **every predictive layer reads positions from the one
`transit_positions` primitive and contributes an additive scalar to a shared
weight** — so Phases 2 and 3 extend, never rewrite, Phase 1.
```

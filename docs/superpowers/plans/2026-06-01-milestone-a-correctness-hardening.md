# Milestone A — Correctness + Frontend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the single-chart experience trustworthy (externally-verified engine math) and usable (OpenRouter LLM, event-driven regeneration, rectification, gated PDF export), fixing two real astronomical bugs and one timezone display bug along the way.

**Architecture:** Two independent tracks. Backend (Python/Skyfield, runs under Pyodide): correctness fixes + first external golden-reference validation. Frontend (TypeScript): bugfix + LLM rewire + event-driven regeneration + PDF. The deterministic engine is the single source of truth; the LLM only narrates.

**Tech Stack:** Python 3.13, Skyfield + DE421, Pydantic, pytest; React 19 + Vite + TypeScript, Zustand, Vitest, `mitt`; JPL Horizons + astropy (dev-only oracles). **Never Swiss Ephemeris (licensing).**

**Convention defaults (approved):** Mean node (True optional), official Lahiri / rigorous precession (True Chitra optional), apparent positions, true obliquity of date, solar dasha year.

**Phase order (each phase ends green + committed; ship-points marked):**
1. Timezone display bugfix (frontend) — *ship*
2. Engine: apparent positions + true obliquity (backend)
3. Engine: Lahiri rigorous-precession ayanamsa + True-node / True-Chitra options (backend)
4. External golden-reference suite + regenerate goldens/parity (backend) — *ship: trustworthy engine*
5. Event-driven regeneration with `mitt` (frontend)
6. Rectification in settings (frontend)
7. OpenRouter-only LLM (frontend)
8. Gated PDF export (frontend) — *ship: usable product*

---

## Phase 1 — Timezone display bugfix (frontend)

**Why first:** smallest, isolated, immediate user-visible win; pure TDD; no dependencies.

**Root cause:** `ProfileSettings.tsx:82` does `new Date(birth_datetime_local)` on a tz-naive wall-clock string; JS reparses through UTC and `formatLocalDate` then reads local calendar fields, rolling 1988-08-08 → 08-07 in any browser at/west of GMT. The input pipeline is correct; only display is wrong. `apps/web/src/lib/dates.ts` already has the safe string-split parser the AstrologerView uses.

### Task 1.1: Failing test for the date-display helper

**Files:**
- Test: `frontend/apps/web/src/lib/dates.test.ts`
- Inspect: `frontend/apps/web/src/lib/dates.ts` (`parseLocalDate`, `parseLocalDatetime`, `formatLocalDate`)

- [ ] **Step 1: Read `dates.ts`** to confirm the exact exported names and signatures of `parseLocalDatetime`/`parseLocalDate`/`formatLocalDate` before writing the test.

- [ ] **Step 2: Write the failing test** (add to `dates.test.ts`, create if absent). The test must pin a non-UTC timezone. Vitest reads `TZ` from the environment; add a `// @vitest-environment node` is not needed — instead assert via the pure helper that never touches `Date`:

```ts
import { describe, expect, it } from 'vitest'
import { formatBirthDateForDisplay } from './dates'

describe('formatBirthDateForDisplay', () => {
  it('keeps the birth-local date for an IST 06:44 birth regardless of browser tz', () => {
    // birth_datetime_local as written by toBirthData(): tz-naive wall clock
    expect(formatBirthDateForDisplay('1988-08-08T06:44:00')).toBe('08/08/1988')
  })
  it('does not roll a date-only string back through UTC', () => {
    expect(formatBirthDateForDisplay('1988-08-08')).toBe('08/08/1988')
  })
  it('renders a stored UTC instant in its own date, not the prior day', () => {
    // defensive: even if a legacy chart stored a Z-instant, never silently roll back
    expect(formatBirthDateForDisplay('1988-08-08T06:44:00')).not.toBe('08/07/1988')
  })
})
```

- [ ] **Step 3: Run to verify it fails**
Run: `cd frontend/apps/web && bun run test:unit -- dates.test.ts`
Expected: FAIL — `formatBirthDateForDisplay is not a function`.

### Task 1.2: Implement the helper using string-split parsing

**Files:**
- Modify: `frontend/apps/web/src/lib/dates.ts`

- [ ] **Step 1: Add the helper** (string-split parse, never `new Date()`):

```ts
/** Format a stored tz-naive birth-local datetime ("YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD")
 *  as MM/DD/YYYY without ever routing it through `Date` (which reparses via UTC and can
 *  roll the calendar date back a day west of GMT). */
export function formatBirthDateForDisplay(local: string): string {
  const datePart = local.split('T')[0]
  const [year, month, day] = datePart.split('-')
  return `${month}/${day}/${year}`
}
```

- [ ] **Step 2: Run the test to verify it passes**
Run: `cd frontend/apps/web && bun run test:unit -- dates.test.ts`
Expected: PASS (3 tests).

### Task 1.3: Use the helper in ProfileSettings + BirthDetailsCard

**Files:**
- Modify: `frontend/apps/web/src/pages/settings/ProfileSettings.tsx:82-83`
- Modify: `frontend/apps/web/src/components/features/astrologer-view/BirthDetailsCard.tsx:34-35`

- [ ] **Step 1: Read both sites** to capture the exact current lines.

- [ ] **Step 2: Replace the `new Date(...)` display path in `ProfileSettings.tsx`** — remove `const dt = new Date(birthData.birth_datetime_local)` + `formatLocalDate(dt)` and call `formatBirthDateForDisplay(birthData.birth_datetime_local)`. Import it from `../../lib/dates`. Remove the now-unused `formatLocalDate` import if nothing else uses it.

- [ ] **Step 3: Apply the same replacement in `BirthDetailsCard.tsx`** — replace `new Date(dateStr).toLocaleDateString(...)` with `formatBirthDateForDisplay(dateStr)`.

- [ ] **Step 4: Typecheck + unit tests**
Run: `cd frontend && bun run --filter '*' typecheck && cd apps/web && bun run test:unit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**
```bash
git add frontend/apps/web/src/lib/dates.ts frontend/apps/web/src/lib/dates.test.ts \
        frontend/apps/web/src/pages/settings/ProfileSettings.tsx \
        frontend/apps/web/src/components/features/astrologer-view/BirthDetailsCard.tsx
git commit -m "fix(ui): show birth-local date in settings without UTC rollback"
```

---

## Phase 2 — Engine: apparent positions + true obliquity (backend)

**Why:** the two real astronomical bugs. Both change every longitude, so they land together before goldens are regenerated. Reference: spec §1.1–1.2; research confirmed `.observe().apparent().ecliptic_latlon(epoch='date')` and true-obliquity-of-date via `nutationlib` + `t.gast`.

**Files (all backend):**
- Modify: `backend/src/almamesh/calculations.py` (`_build_planet_position`/position loop ~`:190-201`; `calculate_lagna` ~`:254-269`)
- Test: `backend/tests/test_positions_apparent.py` (new)
- Test: `backend/tests/test_lagna_obliquity.py` (new)

### Task 2.1: Failing test — apparent position differs from astrometric by ~arcseconds

- [ ] **Step 1: Read** the current position function and confirm the Skyfield objects in scope (`self.eph`, `earth`, `t`).

- [ ] **Step 2: Write the failing test** asserting apparent is used (the longitude must match a Skyfield `.apparent()` computation, and differ measurably from the bare `.observe()`):

```python
import datetime as dt
from almamesh.calculations import SiderealCalculator  # confirm class name on read

def test_planet_longitude_uses_apparent_positions():
    when = dt.datetime(2000, 1, 1, 12, 0, tzinfo=dt.timezone.utc)
    calc = SiderealCalculator()
    ctx = calc.calculate(when, latitude=28.61, longitude=77.21,
                         reference_date=dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc))
    sun = ctx.planets["sun"].longitude
    apparent = calc._apparent_tropical_longitude("sun", when)   # helper added in 2.2
    astrometric = calc._astrometric_tropical_longitude("sun", when)
    # engine longitude is apparent minus ayanamsa, so apparent path must match
    assert abs(((sun + ctx.ayanamsa) - apparent + 180) % 360 - 180) < 1e-6
    # and apparent must differ from astrometric by the aberration order (~arcseconds)
    assert 0.001 < abs((apparent - astrometric + 180) % 360 - 180) < 0.02
```

- [ ] **Step 3: Run to verify it fails**
Run: `cd backend && uv run pytest tests/test_positions_apparent.py -v`
Expected: FAIL — helpers undefined / longitudes equal (astrometric still in use).

### Task 2.2: Switch the position pipeline to apparent

- [ ] **Step 1: Change the position computation** to apparent + ecliptic-of-date. In the planet loop replace `earth.at(t).observe(self.eph[target]).ecliptic_latlon()` (or current form) with:

```python
apparent = earth.at(t).observe(self.eph[target]).apparent()
lat, lon, _ = apparent.ecliptic_latlon(epoch="date")   # true ecliptic & equinox of date
tropical_longitude = lon.degrees
```

Extract two small helpers used by the test (`_apparent_tropical_longitude`, `_astrometric_tropical_longitude`) so the behavior is unit-testable. **Do not** route Rahu/Ketu through `.apparent()` — they remain analytic mean nodes (unchanged).

- [ ] **Step 2: Run the test to verify it passes**
Run: `cd backend && uv run pytest tests/test_positions_apparent.py -v`
Expected: PASS.

### Task 2.3: Failing test — lagna uses true obliquity of date, not fixed J2000

- [ ] **Step 1: Write the failing test** that pins the obliquity source:

```python
import datetime as dt
from almamesh.calculations import SiderealCalculator

def test_lagna_uses_true_obliquity_of_date():
    calc = SiderealCalculator()
    when = dt.datetime(2000, 1, 1, 12, 0, tzinfo=dt.timezone.utc)
    eps = calc._true_obliquity_deg(when)     # helper added in 2.4
    # true obliquity of date at J2000 ≈ 23.4393° but includes nutation Δε (±up to 0.0026°)
    assert 23.43 < eps < 23.45
    # and it must NOT equal the old hard-coded mean constant exactly (nutation present)
    assert abs(eps - 23.4392911) > 1e-7
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd backend && uv run pytest tests/test_lagna_obliquity.py -v`
Expected: FAIL — `_true_obliquity_deg` undefined.

### Task 2.4: Implement true obliquity of date + GAST in the lagna

- [ ] **Step 1: Add `_true_obliquity_deg`** using Skyfield `nutationlib` (verify symbol names against the pinned Skyfield version on read):

```python
from skyfield import nutationlib

def _true_obliquity_deg(self, when: datetime) -> float:
    t = self.ts.from_datetime(when.astimezone(timezone.utc))
    mean_eps_arcsec = nutationlib.mean_obliquity(t.tdb)        # mean ε of date
    d_eps_arcsec = nutationlib.compute_nutation(t)[1]          # Δε (nutation in obliquity)
    return (mean_eps_arcsec + d_eps_arcsec) / 3600.0
```

- [ ] **Step 2: Use it (and GAST) in `calculate_lagna`** — replace `eps_rad = math.radians(23.4392911)` with `eps_rad = math.radians(self._true_obliquity_deg(when))`; confirm RAMC uses `t.gast` (apparent), not `gmst`.

- [ ] **Step 3: Run both new test files**
Run: `cd backend && uv run pytest tests/test_positions_apparent.py tests/test_lagna_obliquity.py -v`
Expected: PASS.

- [ ] **Step 4: Run the full backend suite** — existing golden/sign tests may now drift (expected; regenerated in Phase 4). Note which fail; they must be sign-bucket-stable (Delhi still Gemini lagna etc.). If a *sign bucket* flips, stop — that's a real regression, not a snapshot drift.
Run: `cd backend && uv run pytest -q`

- [ ] **Step 5: Run python-quality skill**, then commit:
```bash
git add backend/src/almamesh/calculations.py backend/tests/test_positions_apparent.py \
        backend/tests/test_lagna_obliquity.py
git commit -m "fix(engine): use apparent positions + true obliquity of date"
```

---

## Phase 3 — Engine: rigorous-precession Lahiri ayanamsa + node/ayanamsa options (backend)

Reference: spec §1.3–1.4. Anchor J2000 = 23.85306°.

**Files:**
- Modify: `backend/src/almamesh/calculations.py` (`AyanamsaCalculator`; node computation; wire `ayanamsa_type`)
- Test: `backend/tests/test_ayanamsa_formula.py` (new)
- Test: `backend/tests/test_true_node.py` (new)

### Task 3.1: Failing test — ayanamsa formula matches published Lahiri at J2000 and tracks the table

- [ ] **Step 1: Write the failing test**:

```python
from almamesh.calculations import AyanamsaCalculator

def test_lahiri_formula_matches_published_j2000():
    ay = AyanamsaCalculator()
    # JD 2451545.0 (TT) = J2000.0; official Lahiri ≈ 23°51'11" = 23.85306°
    assert abs(ay.get_ayanamsa(2451545.0) - 23.85306) < 0.001

def test_lahiri_formula_tracks_existing_table_within_tolerance():
    ay = AyanamsaCalculator()
    for jd in (2433282.5, 2451545.0, 2469807.5):  # ~1950, 2000, 2050
        formula = ay.get_ayanamsa(jd)
        table = ay._table_lookup(jd)               # keep the old table as a cross-check
        assert abs(formula - table) < 0.01
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd backend && uv run pytest tests/test_ayanamsa_formula.py -v`
Expected: FAIL.

### Task 3.2: Implement the rigorous-precession formula + keep table as cross-check

- [ ] **Step 1: Implement** `get_ayanamsa` as `anchor + rigorous_precession(jd)` (anchor 23.85306° at J2000), using Skyfield precession; rename the existing table reader to `_table_lookup` and keep it for the cross-check test only. **Document the precession model** chosen (Newcomb vs IAU2006) in the docstring. Remove the divergent fallback polynomial.

- [ ] **Step 2: Wire `ayanamsa_type`** (drop the `# noqa: ARG001`): `"LAHIRI"` (default) → official formula; `"TRUE_CHITRA"` → adjust so Spica = 180.000° at the chart instant (compute Spica's apparent longitude via Skyfield and offset). Thread the selection from `calculate_sidereal_context`.

- [ ] **Step 3: Run the test to verify it passes**
Run: `cd backend && uv run pytest tests/test_ayanamsa_formula.py -v`
Expected: PASS.

### Task 3.3: Failing test — True node option

- [ ] **Step 1: Write the failing test**:

```python
import datetime as dt
from almamesh.calculations import SiderealCalculator

def test_true_node_differs_from_mean_within_1_5_deg():
    calc = SiderealCalculator()
    when = dt.datetime(2000, 1, 1, 12, 0, tzinfo=dt.timezone.utc)
    mean = calc._rahu_longitude(when, node="mean")
    true = calc._rahu_longitude(when, node="true")
    diff = abs((true - mean + 180) % 360 - 180)
    assert 0.0 < diff < 1.5      # literature bound; ≈1.08° at J2000
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd backend && uv run pytest tests/test_true_node.py -v`
Expected: FAIL.

### Task 3.4: Implement the True-node option

- [ ] **Step 1: Implement** the true node in pure Skyfield from the geocentric Moon's ecliptic-of-date state vector: `h = r × v`, `n = ẑ × h`, `lon = atan2(n_y, n_x)`. Default stays `node="mean"` (Meeus). Ketu = node + 180°. Thread a `node_type` selector from `calculate_sidereal_context` (default mean). **Do not** use `osculating_elements_of().longitude_of_ascending_node` (wrong frame).

- [ ] **Step 2: Run the test to verify it passes**
Run: `cd backend && uv run pytest tests/test_true_node.py -v`
Expected: PASS (mean default unchanged; true selectable).

- [ ] **Step 3: python-quality, then commit**
```bash
git add backend/src/almamesh/calculations.py backend/tests/test_ayanamsa_formula.py \
        backend/tests/test_true_node.py
git commit -m "feat(engine): rigorous-precession Lahiri + True-node/True-Chitra options"
```

---

## Phase 4 — External golden-reference suite + regenerate snapshots (backend) — *ship*

Reference: spec §1.6–1.7. This is the trust deliverable.

**Files:**
- Create: `backend/tests/validation/reference_fixtures.json` (committed Horizons-derived expected values)
- Create: `backend/tools/generate_reference_fixtures.py` (offline generator; not shipped, dev-only, uses astropy)
- Rename/rewrite: `backend/tests/validation/ground_truth.py` → `ExternalReferenceFixtures` (reads JSON, no engine re-run)
- Modify: `backend/tests/validation/test_ground_truth.py`
- Regenerate: `backend/tests/fixtures/chart_golden_de421.json`, `frontend/packages/browser/integration/parity` fixtures
- Modify docstrings: `backend/src/almamesh/calculations.py:13`; CLAUDE.md varga note

### Task 4.1: Offline generator for reference fixtures

- [ ] **Step 1: Write `backend/tools/generate_reference_fixtures.py`** that, for 6–10 charts (existing 5 parity fixtures + 1–2 boundary cases + 1–2 published births, both hemispheres), produces expected values from **license-clean** sources and writes `reference_fixtures.json`:
  - planetary apparent geocentric ecliptic longitudes from **astropy** (`solar_system_ephemeris`, BSD) cross-checked against a small committed set of **JPL Horizons** values (documented in the file header with the Horizons query used);
  - sidereal = apparent − published Lahiri ayanamsa (the J2000 23.85306° anchor + drift);
  - nakshatra+pada (derived), expected lagna, and Vimshottari MD+AD dates from an authoritative reference, each with the tolerance from the spec.
  Add a module docstring stating: dev-only, never imported by the engine, **no Swiss Ephemeris**.

- [ ] **Step 2: Generate and inspect** the JSON.
Run: `cd backend && uv run python tools/generate_reference_fixtures.py`
Expected: `tests/validation/reference_fixtures.json` written; spot-check Delhi sidereal Sun against a published panchanga.

### Task 4.2: Rewrite the validator to assert against committed external values

- [ ] **Step 1: Replace `SwissEphemerisGroundTruth`** with `ExternalReferenceFixtures` that loads `reference_fixtures.json` (no engine re-run, no `AyanamsaCalculator` import). Keep `comparators.py` (`compare_longitudes`, `ValidationStatus`) — feed it the committed expected values.

- [ ] **Step 2: Rewrite `test_ground_truth.py`** to run each chart through the real engine and assert against the fixtures with the spec tolerances (ayanamsa ±0.001°, sidereal ±0.02°, nakshatra/pada exact, lagna ±0.05°, MD/AD dates ±1 day).

- [ ] **Step 3: Run the suite**
Run: `cd backend && uv run pytest tests/validation/ -v`
Expected: PASS — and if any assertion fails, that is a genuine correctness finding to resolve before proceeding (the whole point of the suite).

### Task 4.3: Regenerate the self-consistency snapshots + fix docs

- [ ] **Step 1: Regenerate the CPython golden** now that Phase 2/3 changed outputs:
Run: `cd backend && uv run python tests/test_chart_golden.py`  (the `__main__` `_generate_golden()` path)
Then run `uv run pytest tests/test_chart_golden.py -v` → PASS.

- [ ] **Step 2: Update the misleading docstrings** — `calculations.py:13` ("Vargas D1 to D60" → "D1 + D9 Navamsa"); CLAUDE.md data-contract note (D9 *is* emitted).

- [ ] **Step 3: Regenerate + run the Pyodide byte-parity gate** (must stay byte-identical CPython↔Pyodide with the new outputs):
Run: `cd frontend/packages/browser && bun run test:parity`
Expected: PASS (5/5 byte-identical, zero network).

- [ ] **Step 4: Full backend gates + commit**
Run: `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check . && uv run mypy src/`
```bash
git add backend/tools/generate_reference_fixtures.py backend/tests/validation/ \
        backend/tests/fixtures/chart_golden_de421.json backend/src/almamesh/calculations.py CLAUDE.md
git commit -m "test(engine): external golden-reference suite (Horizons/astropy); regenerate snapshots"
```

---

## Phase 5 — Event-driven regeneration with `mitt` (frontend)

Reference: spec §2.3. Fixes the orphan / dropped-`profile_id` / no-change-detection / stale-interpretation bugs by consolidating regeneration behind one event + handler.

**Files:**
- Create: `frontend/packages/store/src/events.ts` (typed `mitt` emitter)
- Create: `frontend/packages/store/src/regenerate.ts` (the single regen handler)
- Modify: `frontend/apps/web/src/pages/settings/ProfileSettings.tsx` (emit on save; remove inlined regen)
- Modify: `frontend/apps/web/src/pages/Onboarding.tsx` (emit on compute; remove inlined regen)
- Modify: `frontend/apps/web/src/App.tsx` (subscribe the handler once)
- Test: `frontend/packages/store/src/regenerate.test.ts`
- Add dep: `mitt` in `frontend/packages/store/package.json`

### Task 5.1: Typed event emitter

- [ ] **Step 1: `bun add mitt`** in `frontend/packages/store`.
- [ ] **Step 2: Create `events.ts`**:

```ts
import mitt from 'mitt'
import type { BirthMeta } from './adapters/chart'   // confirm exact type/location on read

export type AppEvents = {
  'birth-info-changed': { birth: BirthMeta; profileId: string | null }
}
export const appEvents = mitt<AppEvents>()
```

### Task 5.2: Failing test for the regen handler (change detection + in-place replace)

- [ ] **Step 1: Write the failing test** in `regenerate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { regenerateOnBirthChange } from './regenerate'

describe('regenerateOnBirthChange', () => {
  it('no-ops when chartId is unchanged (name-only edit)', async () => {
    const engine = { generateChart: vi.fn() }
    const lib = makeFakeLibrary(/* existing primary with chartId X */)
    await regenerateOnBirthChange({ birth: sameBirth, profileId: 'p1' }, { engine, lib })
    expect(engine.generateChart).not.toHaveBeenCalled()
  })
  it('regenerates, deletes the stale-id orphan, and preserves profile_id', async () => {
    const engine = { generateChart: vi.fn().mockResolvedValue(fakeSiderealChart) }
    const lib = makeFakeLibrary(/* existing primary chartId X, profile p1 */)
    await regenerateOnBirthChange({ birth: changedBirth, profileId: 'p1' }, { engine, lib })
    expect(engine.generateChart).toHaveBeenCalledOnce()
    expect(lib.getChart('X')).toBeUndefined()                 // orphan deleted
    expect(lib.primaryFor('p1')?.profile_id).toBe('p1')       // profile preserved
  })
})
```
(Helpers `makeFakeLibrary`, `sameBirth`, `changedBirth`, `fakeSiderealChart` defined inline at the top of the test file — see existing `chart.test.ts` fixtures for shapes.)

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend/packages/store && bun run test:unit -- regenerate.test.ts`
Expected: FAIL — `regenerateOnBirthChange` undefined.

### Task 5.3: Implement the handler

- [ ] **Step 1: Create `regenerate.ts`** with the single sequence: compute `chartId(birth)`; if equal to the current primary's `chart_id` → rename-only/no-op; else `engine.generateChart(toBirthInput(birth))` → `siderealChartToChartData` → save new primary with `profile_id` preserved → delete the prior primary row (the orphan) → reset ephemeral interpretation/chat → trigger re-stream. Keep each function ≤15 lines (python-quality parity for TS via frontend-quality).

- [ ] **Step 2: Subscribe once in `App.tsx`** — `appEvents.on('birth-info-changed', e => regenerateOnBirthChange(e, deps))` inside an effect, using the engine from `useChartEngine()`.

- [ ] **Step 3: Make ProfileSettings + Onboarding emit** instead of inlining the regen sequence — on save, `appEvents.emit('birth-info-changed', { birth, profileId })`. Delete the duplicated `saveChart` orchestration from `ProfileSettings.handleConfirmRegeneration`.

- [ ] **Step 4: Tests + typecheck**
Run: `cd frontend && bun run --filter '*' typecheck && cd packages/store && bun run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/packages/store/src/events.ts frontend/packages/store/src/regenerate.ts \
        frontend/packages/store/src/regenerate.test.ts frontend/packages/store/package.json \
        frontend/apps/web/src/App.tsx frontend/apps/web/src/pages/settings/ProfileSettings.tsx \
        frontend/apps/web/src/pages/Onboarding.tsx
git commit -m "refactor(store): event-driven regeneration via mitt; fix orphan + profile_id + change-detection"
```

---

## Phase 6 — Rectification in settings (frontend)

Reference: spec §2.4. Rectified birth time + confidence; feeds the same regen event.

**Files:**
- Modify: `frontend/packages/store/src/adapters/chart.ts` (carry `rectified_time` + `time_confidence` on the stored chart / birth meta)
- Modify: `frontend/apps/web/src/pages/settings/ProfileSettings.tsx` (rectified-time input + confidence select)
- Use: `frontend/packages/constants/src/astrology.ts` `TIME_CONFIDENCE`
- Test: `frontend/packages/store/src/adapters/chart.test.ts`

### Task 6.1: Failing test — rectified time drives the chart, original preserved

- [ ] **Step 1: Write the failing test** asserting that when a rectified time is set, `toBirthInput` uses the rectified time (not the originally-entered one), and the original is still stored for reference:

```ts
it('uses rectified time for the chart while preserving the original', () => {
  const meta = makeBirthMeta({ time: '06:44', rectifiedTime: '06:52', timeConfidence: 'approximate' })
  const input = toBirthInput(meta)
  expect(input.datetimeUtc).toBe(/* UTC of 06:52 IST */ '1988-08-08T01:22:00.000Z')
  const stored = toBirthData(meta)
  expect(stored.birth_time_original).toBe('06:44')
  expect(stored.birth_time_confidence).toBe('approximate')
})
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend/packages/store && bun run test:unit -- chart.test.ts`
Expected: FAIL.

### Task 6.2: Implement rectified-time plumbing + settings UI

- [ ] **Step 1: Extend `BirthMeta` / `toBirthInput` / `toBirthData`** — `rectifiedTime?: string`, `timeConfidence?: TimeConfidence`; `toBirthInput` uses `rectifiedTime ?? time`; `toBirthData` stores `birth_time_original` + `birth_time_confidence`. Note: changing the effective time changes `chartId`, so Phase 5's change-detection naturally triggers regeneration.

- [ ] **Step 2: Add the Settings UI** — a "Birth time rectification" field (time input, defaulting to the current effective time) + a `TIME_CONFIDENCE` select, in `ProfileSettings`. On save it flows through the existing `birth-info-changed` emit (Phase 5) — no new regen path.

- [ ] **Step 3: Tests + typecheck**, then commit:
```bash
git add frontend/packages/store/src/adapters/chart.ts frontend/packages/store/src/adapters/chart.test.ts \
        frontend/apps/web/src/pages/settings/ProfileSettings.tsx
git commit -m "feat(settings): editable birth-time rectification with confidence"
```

---

## Phase 7 — OpenRouter-only LLM (frontend)

Reference: spec §2.2. WebLLM disabled/hidden (code dormant), OpenRouter preset, shared model.

**Files:**
- Modify: `frontend/packages/llm/src/config.ts` (`DEFAULT_ENGINE`, `resolveEngine`)
- Modify: `frontend/apps/web/src/components/features/settings/OnDeviceModelSettings.tsx` (render BYO form directly)
- Modify: `frontend/apps/web/src/components/features/settings/LlmModelSettings.tsx` (OpenRouter preset)
- Modify: `frontend/apps/web/src/hooks/useStreamingInterpretation.ts`, `frontend/apps/web/src/pages/Dashboard.tsx` (drop webllm gates)
- Test: `frontend/packages/llm/src/config.test.ts`

### Task 7.1: Failing test — default engine is openai-http; OpenRouter preset is cloud_premium

- [ ] **Step 1: Write the failing test**:

```ts
import { resolveProviderConfig, openRouterPreset } from './config'  // preset added in 7.2

it('defaults to the openai-http engine (no webllm)', () => {
  expect(resolveProviderConfig({}).engine).toBe('openai-http')
})
it('OpenRouter preset is cloud_premium with the OpenRouter base url', () => {
  const p = openRouterPreset('my-key', 'anthropic/claude-3.5-sonnet')
  expect(p.apiBase).toBe('https://openrouter.ai/api/v1')
  expect(p.privacyMode).toBe('cloud_premium')
  expect(p.model).toBe('anthropic/claude-3.5-sonnet')
})
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend/packages/llm && bun run test:unit -- config.test.ts`
Expected: FAIL.

### Task 7.2: Implement OpenRouter-only config + preset

- [ ] **Step 1: `DEFAULT_ENGINE = "openai-http"`** and make `resolveEngine` never return `"webllm"`. Add `export function openRouterPreset(apiKey, model)` returning `{ apiBase: 'https://openrouter.ai/api/v1', apiKey, model, privacyMode: 'cloud_premium', engine: 'openai-http' }`.

- [ ] **Step 2: Settings UI** — `OnDeviceModelSettings` renders `LlmModelSettings` directly (no engine radiogroup / `OnDevicePanel`). In `LlmModelSettings` add a one-click "Use OpenRouter" button that writes `openRouterPreset(...)` and reveals the key + model fields. WebLLM hook/package/dep remain in the tree but unreachable.

- [ ] **Step 3: Drop webllm gates** in `useStreamingInterpretation.ts` and `Dashboard.tsx` (`engine === 'webllm'` branches, `chatNeedsModelSetup`, `<ModelSetupCard>` slots). Leave `sanitizeChartForLlm` + `ensurePrivacy` untouched.

- [ ] **Step 4: Tests + typecheck**
Run: `cd frontend && bun run --filter '*' typecheck && bun run --filter '@almamesh/llm' test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/packages/llm/src/config.ts frontend/packages/llm/src/config.test.ts \
        frontend/apps/web/src/components/features/settings/OnDeviceModelSettings.tsx \
        frontend/apps/web/src/components/features/settings/LlmModelSettings.tsx \
        frontend/apps/web/src/hooks/useStreamingInterpretation.ts frontend/apps/web/src/pages/Dashboard.tsx
git commit -m "feat(llm): OpenRouter-only with one-click preset; WebLLM dormant"
```

---

## Phase 8 — Gated PDF export (frontend) — *ship*

Reference: spec §2.5. Promote the existing print pipeline; gate on completed interpretation; add interpretation text + Navamsa to the print DOM.

**Files:**
- Modify: `frontend/apps/web/src/pages/Dashboard.tsx` (rename button → "Export PDF"; `canExport` gate; print-only interpretation + Navamsa blocks)
- Test: `frontend/apps/web/src/pages/Dashboard.export.test.tsx` (new — gate logic)

### Task 8.1: Failing test — export gated on completed interpretation

- [ ] **Step 1: Extract `canExportPdf(state, content)`** as a pure helper and test it:

```ts
import { canExportPdf } from './exportGate'   // created in 8.2

it('disables export until a non-placeholder interpretation is complete', () => {
  expect(canExportPdf('idle', '')).toBe(false)
  expect(canExportPdf('streaming', 'partial...')).toBe(false)
  expect(canExportPdf('complete', '   ')).toBe(false)            // placeholder/empty
  expect(canExportPdf('complete', 'Your Sun in Capricorn...')).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend/apps/web && bun run test:unit -- exportGate`
Expected: FAIL — helper undefined.

### Task 8.2: Implement the gate + complete the print DOM

- [ ] **Step 1: Create `apps/web/src/pages/exportGate.ts`** with `canExportPdf(state, content)` returning `state === 'complete' && content.trim().length > 0 && !isPlaceholderContent(content)` (reuse the existing `isPlaceholderContent`).

- [ ] **Step 2: Wire the button** — rename the header `Print` button to "Export PDF", `disabled={!canExport}` with a tooltip "Generate your interpretation first"; keep `onClick={() => window.print()}`.

- [ ] **Step 3: Add the missing print-only blocks** — a `hidden print:block` section rendering the streamed interpretation text, and include the `DivisionalChartView` (D9 Navamsa) in the print block (today only the D1 `ChartVisualization` prints).

- [ ] **Step 4: Tests + typecheck + build**
Run: `cd frontend && bun run --filter '*' typecheck && cd apps/web && bun run test:unit && bun run build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**
```bash
git add frontend/apps/web/src/pages/exportGate.ts frontend/apps/web/src/pages/Dashboard.export.test.tsx \
        frontend/apps/web/src/pages/Dashboard.tsx
git commit -m "feat(pdf): gated Export PDF with interpretation + Navamsa in the print report"
```

---

## Phase 9 — Profile CRUD incl. delete (frontend)

Added 2026-06-01 (user request). Today profiles can be created (boot migration + switcher)
but there is no rename or **delete**. Add full CRUD with safe cascade.

**Files:**
- Modify: `frontend/packages/store/src/profiles.ts` (`renameProfile`, `deleteProfile` actions)
- Modify: `frontend/packages/store/src/chartLibrary.ts` (cascade: remove charts for a deleted profile)
- Modify: `frontend/apps/web/src/components/.../ProfileSwitcher.tsx` (rename + delete UI, confirm dialog)
- Test: `frontend/packages/store/src/profiles.test.ts`

### Task 9.1: Failing tests for delete + rename (with cascade + guards)

- [ ] **Step 1: Write failing tests** in `profiles.test.ts`:

```ts
it('renames a profile', () => {
  const s = makeProfilesStore([{ id: 'p1', name: 'Me' }])
  s.renameProfile('p1', 'Asha')
  expect(s.profiles.find(p => p.id === 'p1')?.name).toBe('Asha')
})
it('deletes a profile and cascades its charts', () => {
  const s = makeProfilesStore([{ id: 'p1', name: 'Me' }, { id: 'p2', name: 'Mom' }], { active: 'p2' })
  s.deleteProfile('p2')                                   // also removes p2's StoredCharts
  expect(s.profiles.some(p => p.id === 'p2')).toBe(false)
  expect(chartsForProfile('p2')).toHaveLength(0)          // cascade
  expect(s.activeProfileId).toBe('p1')                    // active reassigned
})
it('refuses to delete the last remaining profile', () => {
  const s = makeProfilesStore([{ id: 'p1', name: 'Me' }], { active: 'p1' })
  expect(() => s.deleteProfile('p1')).toThrow(/last profile/i)
})
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd frontend/packages/store && bun run test:unit -- profiles.test.ts`
Expected: FAIL — actions undefined.

### Task 9.2: Implement CRUD actions + cascade + guards

- [ ] **Step 1: Add `renameProfile(id, name)`** and **`deleteProfile(id)`** to `profiles.ts`. `deleteProfile` must: refuse (throw) if it's the last profile; remove the profile; **cascade-delete the profile's charts** from `chartLibrary` (charts with `profile_id === id`); if the deleted profile was active, reassign `activeProfileId` to another profile. Keep functions ≤15 lines (extract a `cascadeDeleteCharts(profileId)` helper in `chartLibrary.ts`).

- [ ] **Step 2: Add the UI** in `ProfileSwitcher` — an edit (rename) affordance and a delete with a confirm dialog ("Delete <name> and their charts? This cannot be undone."). Disable delete when only one profile exists.

- [ ] **Step 3: Tests + typecheck**, then commit:
```bash
git add frontend/packages/store/src/profiles.ts frontend/packages/store/src/chartLibrary.ts \
        frontend/packages/store/src/profiles.test.ts frontend/apps/web/src/components/**/ProfileSwitcher.tsx
git commit -m "feat(profiles): full CRUD — rename + delete with chart cascade"
```

---

## Final verification (before PR)

- [ ] Backend: `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check . && uv run mypy src/`
- [ ] Frontend: `cd frontend && bun run --filter '*' typecheck` + each package `test:unit`; `frontend-quality` skill.
- [ ] Determinism: `cd frontend/packages/browser && bun run test:parity` (byte-identical, regenerated).
- [ ] Build + preview: `cd frontend/apps/web && bun run build && bun run preview`.
- [ ] **Live exit-gate:** `cd frontend/apps/web && node scripts/verify-exit-gate.mjs` (real engine in headless Chromium — mandatory; local-green ≠ CI-green).
- [ ] Push branch, open PR, watch CI to green.

## Self-review notes (coverage vs spec)

- Spec §1.1→Phase 2.1-2.2; §1.2→2.3-2.4; §1.3→3.1-3.2; §1.4→3.3-3.4; §1.5→noted no-op in 4 / Phase 3 default; §1.6→4.1-4.2; §1.7→4.3.
- Spec §2.1→Phase 1; §2.2→Phase 7; §2.3→Phase 5; §2.4→Phase 6; §2.5→Phase 8.
- Invariant (LLM narrates only; PDF verbatim; rectified time feeds same pipeline) enforced in Phases 6, 7, 8.
- Deferred (P/B/C): yoga-rule completeness, predictive superset, members, mesh — explicitly out of scope.

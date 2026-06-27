# Event-based Birth-time Rectification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Spec: `docs/specs/059-event-based-rectification.md`.

**Goal:** Let a user resolve their rising sign from dated, categorized life events via an on-device
deterministic engine scorer, shown with honest qualitative confidence, then make the chosen time the
working chart authority.

**Architecture:** A new Python `rectification/` module ranks candidate ascendants against dated events
using ascendant-dependent signals (dasha-lord↔house-lordship + transit-to-house at the event date),
surfaced through one `compute_rectification` engine entry → `@almamesh/browser` →
`@almamesh/store` → a `/rectify` wizard. Manual structured event entry is the privacy boundary; an
optional LLM accelerator only pre-fills reviewable rows. Confirmation reuses the Phase-1
`birth-info-changed → regenerate → rectified-authority` pipeline.

**Tech Stack:** Python 3.13 (Pydantic, Skyfield/DE421, `uv`/pytest/ruff/mypy), Pyodide; React + Vite +
Tailwind + Zustand (Bun monorepo); `idb-keyval`; react-i18next; Vitest + Playwright.

## Global Constraints

- **Engine computes; never the LLM.** Astrology math lives in Python only; TS adapters reshape, never
  compute (`mandate-calculation-integrity`).
- **Determinism / parity.** Same inputs → byte-identical on CPython and Pyodide. Pin `reference_date`
  AND the dasha year-convention in every candidate compute. The Pyodide==CPython `test:parity` gate and
  the DE421 golden fixture must stay green.
- **PII.** Golden/test fixtures use the **synthetic Bengaluru cusp native** (`1988-08-08T01:14:00+00:00`,
  `12.9716, 77.5946`) or other synthetic natives ONLY — never the owner's real birth data. Grep every
  diff for PII before commit (`feedback-pii-sweep-agent-output`).
- **Honesty (no false precision).** Never render a single confidence percentage for rectification. Show
  qualitative band (`near_tie`/`leans`/`consistent`) + margin + per-event evidence + the
  "uncalibrated heuristic; only a recorded time settles a near-tie" note. Output is the rising **sign**
  + a *representative* time, never an exact-minute claim. Below the min-evidence threshold, refuse to
  rank.
- **i18n.** All new copy ships en/es/pt with 3-way key parity (`*.parity.test.ts`) + the `verify-i18n`
  live gate. `en` authoritative.
- **Engine-recovery invariant.** Every "engine not ready / failed" surface offers in-app retry
  (`reboot()`/`whenReady()`); never a dead-end.
- **Quality gates (all must pass before a slice is done):** `uv run pytest -q`,
  `uv run ruff check . && uv run ruff format --check .`, `uv run mypy src/`,
  `bun run --filter '*' typecheck`, web `bun run test:unit`, `test:parity`,
  `bun run build && preview`, and a **live drive of the real wizard** in project Playwright Chromium.

---

## File Structure

**Backend (Python):**
- Create `backend/src/almamesh/rectification/__init__.py` — public `compute_rectification_result(...)`.
- Create `backend/src/almamesh/rectification/models.py` — `RectificationResult`, `RectificationCandidate`,
  `EventEvidence`, `RectificationEventInput`, `RectificationMode`, `RectificationBand` (Pydantic/enums).
- Create `backend/src/almamesh/rectification/houses.py` — `category_houses(EventType) -> tuple[int, ...]`.
- Create `backend/src/almamesh/rectification/scorer.py` — per-candidate scoring + de-correlation +
  margin→band + min-evidence gate (pure, deterministic; imports NOTHING from `dasha/scoring.py`).
- Create `backend/src/almamesh/rectification/candidates.py` — cusp boundary search + window sweep
  candidate-time generation; one warm `SkyfieldAstronomy` reused across candidates.
- Modify `backend/src/almamesh/edge/chart_runtime.py` — add `compute_rectification(payload)`.
- Tests: `backend/tests/test_rectification_houses.py`, `test_rectification_scorer.py`,
  `test_rectification_candidates.py`, `test_rectification_runtime.py`,
  `backend/tests/fixtures/rectification_golden.json` (synthetic).

**Contract (shared-types):**
- Modify `frontend/packages/shared-types/src/index.ts` — add `LifeEventCategory`,
  `RectificationResult`, `RectificationCandidate`, `EventEvidence`, `RectificationMode`,
  `RectificationBand`, `RectificationEventInput`.

**Browser engine:**
- Create `frontend/packages/browser/src/pyodide/rectification.ts` — `computeRectification` worker call.
- Modify `frontend/packages/browser/src/pyodide/runtime.ts` — extend `ChartEngine` interface +
  `chartEngineClient.ts`; wire the worker message handler.

**Store:**
- Modify `frontend/packages/store/src/lifeEvents.ts` — extend `LifeEvent` (required `date` +
  `category`, optional `note`), bump persist version + migration, add `editEvent`/`removeEvent`.
- Create `frontend/packages/store/src/adapters/rectification.ts` — pure reshape engine→UI.
- Create `frontend/packages/store/src/rectification.ts` — transient `useRectificationStore`.
- Modify `frontend/packages/store/src/index.ts` — barrel exports.

**LLM (slice 4):**
- Create `frontend/packages/llm/src/structure-life-events.ts` — `structureLifeEvents(...)`.
- Modify `frontend/packages/llm/src/prompt.ts` — add+export `RECTIFICATION_FENCE`.
- Modify `frontend/packages/llm/src/index.ts` — barrel exports.

**Web app:**
- Create `frontend/apps/web/src/pages/Rectify.tsx` + `src/components/features/rectify/*`
  (`EventEntryStep.tsx`, `EventRow.tsx`, `FitProgress.tsx`, `RectifyResults.tsx`, `CandidateCard.tsx`,
  `EvidenceTable.tsx`, `StoryAccelerator.tsx`).
- Create `frontend/apps/web/src/hooks/useRectification.ts` — orchestrates the engine call + predictive
  gating + transient store.
- Modify routing (`App.tsx`/router) — add `/rectify/:profileId`; add entry CTAs in `Onboarding.tsx`
  (unknown-time), `ProfileSettings.tsx` (rectification panel), `IdentityStrip.tsx` (cusp callout).
- Modify `frontend/apps/web/src/locales/{en,es,pt}/rectify.json` (new namespace) + register it.

---

## Slice 1 — Contract, store, and structured entry UI

### Task 1: `LifeEventCategory` + result types in shared-types

**Files:**
- Modify: `frontend/packages/shared-types/src/index.ts`
- Test: `frontend/packages/shared-types/src/rectification.types.test.ts` (type-level + value guards)

**Interfaces:**
- Produces:
  ```ts
  export type LifeEventCategory =
    | "marriage" | "engagement" | "breakup" | "childbirth"
    | "career_change" | "promotion" | "job_loss" | "business_start"
    | "relocation" | "property_purchase" | "windfall" | "expense_shock"
    | "health_issue" | "surgery" | "higher_studies" | "litigation";
  export type RectificationMode = "cusp" | "window";
  export type RectificationBand = "near_tie" | "leans" | "consistent";
  export interface RectificationEventInput { readonly date: string; readonly category: LifeEventCategory; }
  export interface EventEvidence {
    readonly eventIndex: number; readonly category: LifeEventCategory;
    readonly date: string; readonly signals: readonly string[]; readonly contribution: number; }
  export interface RectificationCandidate {
    readonly ascendantSign: string; readonly representativeTimeLocal: string;
    readonly lagnaLongitudeDeg: number; readonly lagnaCuspDistanceDeg: number;
    readonly isNearCusp: boolean; readonly fitScore: number;
    readonly supportingEvents: readonly EventEvidence[]; }
  export interface RectificationResult {
    readonly mode: RectificationMode; readonly candidates: readonly RectificationCandidate[];
    readonly margin: number; readonly band: RectificationBand;
    readonly discriminatingEventCount: number; readonly recordedTimeSign: string | null;
    readonly honestyNoteKey: string; }
  ```
- [ ] **Step 1: Write a value-guard test** asserting a `LIFE_EVENT_CATEGORIES` readonly array contains
  all 16 categories and matches the union (exhaustiveness via a `satisfies` check + length===16).
- [ ] **Step 2: Run** `cd frontend && bun run --filter @almamesh/shared-types test` → FAIL (missing export).
- [ ] **Step 3:** Add the types above + `export const LIFE_EVENT_CATEGORIES: readonly LifeEventCategory[]`.
- [ ] **Step 4: Run** the test → PASS; `bun run --filter @almamesh/shared-types typecheck` clean.
- [ ] **Step 5: Commit** `feat(shared-types): rectification result + life-event category contract`.

### Task 2: Extend the `lifeEvents` store (date+category required, migration, CRUD)

**Files:**
- Modify: `frontend/packages/store/src/lifeEvents.ts`
- Modify: `frontend/packages/store/src/index.ts`
- Test: `frontend/packages/store/src/lifeEvents.test.ts` (extend existing)

**Interfaces:**
- Consumes: `LifeEventCategory` (Task 1).
- Produces: `LifeEvent { id; description?; date; category; note?; createdAt }` with `date` required
  (ISO `YYYY-MM-DD`) and `category: LifeEventCategory` required; store actions add
  `editEvent(profileId, id, patch: Partial<Pick<LifeEvent,'date'|'category'|'note'>>)` and
  `removeEvent(profileId, id)`. Bump `LIFE_EVENTS_PERSIST_VERSION` 1→2.

- [ ] **Step 1: Write failing tests:** (a) `editEvent` patches one row; (b) `removeEvent` deletes one
  row by id; (c) migration v1→v2 turns a legacy `{description, no date}` blob into one row with
  `category: "career_change"`-less sentinel — i.e. `note = old description`, `date = ""`,
  `category = undefined`-not-allowed → instead mark `needsStructuring: true` on the migrated row and
  keep `note`. (Test asserts the migrated row preserves the old text in `note` and is flagged.)
- [ ] **Step 2: Run** `bun run --filter @almamesh/store test lifeEvents` → FAIL.
- [ ] **Step 3: Implement.** Add `date`/`category`/`note`/`needsStructuring?` to `LifeEvent`; add
  `editEvent`/`removeEvent`; write `migrateLifeEventsPersistedState` v1→v2 mapping each legacy event to
  `{ id, note: description, date: "", needsStructuring: true, createdAt }`. Keep `setEvents`/`addEvent`/
  `getEvents`/`clearEvents` working with the new shape (blank-date rows allowed only when
  `needsStructuring`).
- [ ] **Step 4: Run** tests → PASS; `bun run --filter @almamesh/store typecheck` clean.
- [ ] **Step 5: Commit** `feat(store): structured life events (date+category) + CRUD + v2 migration`.

### Task 3: Structured event-entry UI (`EventRow` + `EventEntryStep`)

**Files:**
- Create: `frontend/apps/web/src/components/features/rectify/EventRow.tsx`
- Create: `frontend/apps/web/src/components/features/rectify/EventEntryStep.tsx`
- Create: `frontend/apps/web/src/locales/{en,es,pt}/rectify.json` + register in the i18n setup
- Test: `frontend/apps/web/src/components/features/rectify/EventEntryStep.test.tsx`

**Interfaces:**
- Consumes: `useLifeEventsStore` (Task 2), `LIFE_EVENT_CATEGORIES` (Task 1).
- Produces: `<EventEntryStep profileId onContinue />` rendering a list of `<EventRow>` (date input +
  category `<select>` localized + optional note + delete) with an "add event" button and min-events
  guidance copy.

- [ ] **Step 1: Write failing component test:** renders existing rows from the store, "add" appends a
  row, editing date/category calls `editEvent`, delete calls `removeEvent`, and the Continue button is
  disabled until ≥1 fully-structured row (date+category) exists. Assert category `<option>`s are
  localized (use the `rectify` namespace keys, not raw enum values).
- [ ] **Step 2: Run** `bun run test:unit EventEntryStep` → FAIL.
- [ ] **Step 3: Implement** `EventRow` + `EventEntryStep` + the `rectify.json` keys
  (`categories.*`, `entry.*`, `min_events_hint`) in en, then es/pt translations.
- [ ] **Step 4: Run** the component test + `onboarding`/new `rectify` parity test → PASS.
- [ ] **Step 5: Commit** `feat(rectify): structured life-event entry UI + i18n (slice 1)`.

### Task 4: Slice-1 i18n parity + typecheck gate

- [ ] **Step 1:** Add `rectify.parity.test.ts` asserting en/es/pt key parity for the `rectify` namespace.
- [ ] **Step 2: Run** `bun run --filter '*' typecheck` + `bun run test:unit` → green.
- [ ] **Step 3: Commit** `test(rectify): 3-way i18n parity for slice 1`.

---

## Slice 2 — Engine scorer + cusp mode + results + confirm (closes the trigger)

### Task 5: `category_houses` map

**Files:**
- Create: `backend/src/almamesh/rectification/houses.py`
- Test: `backend/tests/test_rectification_houses.py`

**Interfaces:**
- Produces: `category_houses(event: EventType) -> tuple[int, ...]` — total over all 16 `EventType`.

- [ ] **Step 1: Write failing tests** asserting the seed map (verbatim from the spec): MARRIAGE/
  ENGAGEMENT→`(7,)`; BREAKUP→`(7,)`; CHILDBIRTH→`(5,)`; CAREER_CHANGE/PROMOTION/JOB_LOSS/
  BUSINESS_START→`(10,)`; RELOCATION→`(4,12)`; PROPERTY_PURCHASE→`(4,)`; WINDFALL→`(2,11)`;
  EXPENSE_SHOCK→`(12,)`; HEALTH_ISSUE→`(6,)`; SURGERY→`(6,8)`; HIGHER_STUDIES→`(4,5,9)`;
  LITIGATION→`(6,)`. Also assert every `EventType` member has a non-empty mapping (exhaustiveness loop).
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_rectification_houses.py -v` → FAIL.
- [ ] **Step 3: Implement** `category_houses` as an explicit dict (1–12 valid; raise on unknown).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectification): category→house map`.

### Task 6: `rectification/models.py`

**Files:**
- Create: `backend/src/almamesh/rectification/models.py`
- Test: `backend/tests/test_rectification_models.py`

**Interfaces:**
- Consumes: `ZodiacSign`, `EventType`.
- Produces (Pydantic): `RectificationMode`/`RectificationBand` (str enums); `RectificationEventInput
  { date: date; category: EventType }`; `EventEvidence`; `RectificationCandidate`; `RectificationResult`
  with the fields from the spec (snake_case Python; the TS adapter camelCases).

- [ ] **Step 1:** failing test constructing a `RectificationResult` and asserting JSON round-trips with
  `model_dump(mode="json")` (dates as ISO strings, enums as values).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** implement the models (frozen where appropriate; `ConfigDict`).
- [ ] **Step 4: Run** → PASS; `uv run mypy src/almamesh/rectification/models.py` clean.
- [ ] **Step 5: Commit** `feat(rectification): result Pydantic models`.

### Task 7: Per-event signal extraction (inverse, ascendant-dependent)

**Files:**
- Create: `backend/src/almamesh/rectification/scorer.py` (signals portion)
- Test: `backend/tests/test_rectification_scorer.py` (signals portion)

**Interfaces:**
- Consumes: `SiderealContext` (a candidate chart), `VimshottariDashaData`, `category_houses`,
  `calculate_transit_context`.
- Produces:
  `extract_event_signals(context: SiderealContext, event: RectificationEventInput, *, transit_instant)
   -> EventEvidence` — emits machine signal keys: `dasha_lord_rules_h{N}`, `dasha_lord_in_h{N}`,
  `slow_transit_h{N}` and a per-event `contribution` (sum of weighted signal hits, primary
  dasha-lord-match weighted higher than secondary transit).

- [ ] **Step 1: Write failing tests** on the synthetic Bengaluru cusp native: build the natal context
  for each of the two cusp candidate times; for a hand-constructed MARRIAGE event dated inside a known
  7th-lord dasha, assert the candidate whose 7th-lord is the active dasha lord yields a
  `dasha_lord_rules_h7` signal and higher contribution than the other candidate. (Compute the expected
  active lord from the fixture's dasha tree in the test setup — no magic numbers.)
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_rectification_scorer.py -v` → FAIL.
- [ ] **Step 3: Implement** `extract_event_signals`: resolve active MD/AD/PD lords at `event.date` from
  `context.dashas`; for each house in `category_houses(event.category)`, check `context.houses[h].
  sign_lord` membership in the active lords (rules) and any planet whose `house==h` is an active lord
  (occupies); add `calculate_transit_context(context, birth_dt, transit_instant=event.date)` slow-hit
  on `house_from_lagna==h`. Weight: primary match `= W_PRIMARY`, transit `= W_TRANSIT` (named consts).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectification): inverse per-event signal extraction`.

### Task 8: Candidate aggregation, de-correlation, margin→band, min-evidence gate

**Files:**
- Modify: `backend/src/almamesh/rectification/scorer.py`
- Test: `backend/tests/test_rectification_scorer.py` (aggregation portion)

**Interfaces:**
- Produces: `score_candidate(context, events, *, birth_dt) -> RectificationCandidate`;
  `rank_candidates(candidates: list[RectificationCandidate], *, discriminating_event_count: int)
   -> tuple[list[RectificationCandidate], float, RectificationBand]` (sorted desc, normalized margin,
  band); de-correlation: cap per-category contribution at `CATEGORY_CAP` and apply a diminishing factor
  to clustered same-category events; gate: if `discriminating_event_count < MIN_DISCRIMINATING_EVENTS`,
  force band `near_tie`.

- [ ] **Step 1: Write failing tests:** (a) two strongly-separated candidates → band `consistent` and
  margin above `CONSISTENT_MARGIN`; (b) near-equal candidates → `near_tie`; (c) five identical
  same-category events do NOT raise the margin more than `CATEGORY_CAP` allows (de-correlation);
  (d) two events but `MIN_DISCRIMINATING_EVENTS==3` → forced `near_tie`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** aggregation + de-correlation + `margin = (top-runner)/ (top+runner+ε)` +
  band thresholds as named constants (`NEAR_TIE_MARGIN`, `CONSISTENT_MARGIN`, `CATEGORY_CAP`,
  `MIN_DISCRIMINATING_EVENTS`, `W_PRIMARY`, `W_TRANSIT`), all in `scorer.py` with docstring rationale.
- [ ] **Step 4: Run** → PASS; `uv run mypy` + radon grade A on the new functions (≤15 lines each;
  split helpers as needed).
- [ ] **Step 5: Commit** `feat(rectification): candidate scoring, de-correlation, honest bands`.

### Task 9: Cusp candidate generation (warm ephemeris)

**Files:**
- Create: `backend/src/almamesh/rectification/candidates.py`
- Test: `backend/tests/test_rectification_candidates.py`

**Interfaces:**
- Produces: `cusp_candidate_times(birth_dt, lat, lon, *, astronomy) -> list[CandidateTime]` where
  `CandidateTime { sign: ZodiacSign; dt_utc: datetime; lagna_longitude_deg: float }`; binary-searches
  the boundary crossing on the birth day, returns one representative time per cusp sign;
  `make_astronomy() -> SkyfieldAstronomy` factory so all candidates reuse one instance.

- [ ] **Step 1: Write failing test** on the Bengaluru cusp native: returns exactly 2 candidates, signs
  are adjacent, and each representative time actually yields its sign (assert via a chart compute).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** boundary binary-search on lagna longitude (monotone within the day window)
  + representative-time selection; reuse the passed `astronomy`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectification): cusp candidate-time generation with warm ephemeris`.

### Task 10: `compute_rectification_result` orchestrator + golden fixture

**Files:**
- Create: `backend/src/almamesh/rectification/__init__.py`
- Create: `backend/tests/fixtures/rectification_golden.json` (synthetic, pinned `reference_date`)
- Test: `backend/tests/test_rectification_golden.py`

**Interfaces:**
- Produces: `compute_rectification_result(*, dt_utc, latitude, longitude, events,
  mode: RectificationMode, reference_date) -> RectificationResult`. Cusp mode uses
  `cusp_candidate_times`; computes one chart per candidate via the warm astronomy; scores; ranks; sets
  `recorded_time_sign` from `dt_utc`; sets `honesty_note_key` per band.

- [ ] **Step 1: Write failing golden test:** with synthetic discriminating events on the Bengaluru
  native + pinned `reference_date`, assert the full `RectificationResult` matches
  `rectification_golden.json` (6-decimal canonicalization like `test_chart_golden`). Add a second case:
  non-discriminating events → `band == "near_tie"`.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_rectification_golden.py -v` → FAIL.
- [ ] **Step 3: Implement** the orchestrator; generate the golden JSON from the first green run, eyeball
  it for honesty (no impossible certainty), commit the fixture.
- [ ] **Step 4: Run** full `uv run pytest -q` + `ruff` + `mypy` → green.
- [ ] **Step 5: Commit** `feat(rectification): compute_rectification_result + synthetic golden fixture`.

### Task 11: `edge/chart_runtime.py::compute_rectification` + parity

**Files:**
- Modify: `backend/src/almamesh/edge/chart_runtime.py`
- Test: `backend/tests/test_rectification_runtime.py`; `frontend/packages/browser` parity harness.

**Interfaces:**
- Consumes: `compute_rectification_result`.
- Produces: `compute_rectification(payload: dict) -> dict` parsing `datetime_utc`, `latitude`,
  `longitude`, `events: [{date, category}]`, `mode`, optional ISO `reference_date`; returns
  `result.model_dump(mode="json")`.

- [ ] **Step 1: Write failing test** calling `compute_rectification` with a synthetic payload, asserting
  the dict shape + that it is JSON-serializable.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the entry (mirror `compute_predictive`/`compute_mesh` parsing).
- [ ] **Step 4:** Rebuild the wheel + re-sign the dev bundle; run `cd frontend/packages/browser &&
  bun run test:parity` to confirm CPython==Pyodide for `compute_rectification` (add a parity case if the
  harness enumerates entries).
- [ ] **Step 5: Commit** `feat(rectification): compute_rectification engine entry + parity`.

### Task 12: Browser `computeRectification` + store adapter + transient store

**Files:**
- Create: `frontend/packages/browser/src/pyodide/rectification.ts`
- Modify: `frontend/packages/browser/src/pyodide/runtime.ts`, `chartEngineClient.ts`, `index.ts`
- Create: `frontend/packages/store/src/adapters/rectification.ts`
- Create: `frontend/packages/store/src/rectification.ts`
- Modify: `frontend/packages/store/src/index.ts`
- Test: `frontend/packages/store/src/adapters/rectification.test.ts`,
  `frontend/packages/store/src/rectification.test.ts`

**Interfaces:**
- Consumes: `RectificationResult` (shared-types), the engine entry (Task 11).
- Produces: `ChartEngine.computeRectification(input: RectificationInput): Promise<RectificationResult>`
  where `RectificationInput { datetimeUtc; latitude; longitude; events: RectificationEventInput[];
  mode: RectificationMode; referenceDate? }`; `adaptRectification(raw): RectificationResult` (snake→camel
  reshape, NO astrology); `useRectificationStore` with `{ status; result; error; run(...); reset() }`.

- [ ] **Step 1: Write failing adapter test** mapping a snake_case engine dict → camelCase
  `RectificationResult` (assert `lagna_cusp_distance_deg`→`lagnaCuspDistanceDeg`, etc.).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the worker call (mirror `pyodide/predictive.ts`), the adapter, the transient
  store (no persistence).
- [ ] **Step 4: Run** store + adapter tests → PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(rectification): browser computeRectification + store adapter`.

### Task 13: `useRectification` hook (engine call + predictive gating)

**Files:**
- Create: `frontend/apps/web/src/hooks/useRectification.ts`
- Test: `frontend/apps/web/src/hooks/useRectification.test.ts`

**Interfaces:**
- Consumes: `useChartEngine`, `useRectificationStore`, the predictive auto-gate.
- Produces: `useRectification(profileId) -> { state; run(events, mode); reset() }`; while running, sets a
  flag that suppresses `usePredictiveLayer({ auto: true })` auto-start; discards results on unmount;
  surfaces engine errors with a retry that calls `reboot()`.

- [ ] **Step 1: Write failing test** (mocked engine): `run()` sets `loading`→`ready`; an engine throw
  sets `error` with a `retry`; unmount mid-flight does not write to the store; the predictive auto-gate
  is set true during the run and cleared after.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the hook (introduce a small `usePredictiveStore` gate flag or a shared
  signal that `usePredictiveLayer` already respects — check the existing auto-start condition and add a
  `paused` guard).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectify): useRectification hook with predictive gating + retry`.

### Task 14: Results UI (`CandidateCard`, `EvidenceTable`, `RectifyResults`) — honest, no %

**Files:**
- Create: `frontend/apps/web/src/components/features/rectify/{CandidateCard,EvidenceTable,RectifyResults}.tsx`
- Modify: `rectify.json` (en/es/pt) — `results.*`, `band.*`, `honesty.*`, signal-key labels.
- Test: `frontend/apps/web/src/components/features/rectify/RectifyResults.test.tsx`

**Interfaces:**
- Consumes: `RectificationResult`, `BirthTimeComparison`, `cuspInfo`.
- Produces: `<RectifyResults result recordedReading onConfirm onKeepRecorded />`.

- [ ] **Step 1: Write failing test** rendering a `consistent`-band result: asserts the band label + the
  honesty note render, the per-event evidence rows render, the recorded-time comparison renders, **no
  element contains a "%" character**, and a `near_tie` result shows BOTH candidates + the
  "only a recorded time settles this" copy. Confirm button calls `onConfirm(candidate)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the components + i18n keys; map signal machine keys → localized phrases;
  reuse `BirthTimeComparison`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectify): honest results UI (bands, evidence, no false precision)`.

### Task 15: `/rectify` route, wizard shell, confirm→authority, entry CTAs

**Files:**
- Create: `frontend/apps/web/src/pages/Rectify.tsx`
- Modify: router (`App.tsx`), `Onboarding.tsx`, `ProfileSettings.tsx`, `IdentityStrip.tsx`
- Test: `frontend/apps/web/src/pages/Rectify.test.tsx`

**Interfaces:**
- Consumes: `EventEntryStep`, `useRectification`, `RectifyResults`, `RegenerationConfirmModal`,
  `appEvents.emit('birth-info-changed', …)`, `rectificationDeltaFromClocks`.
- Produces: route `/rectify/:profileId`; on confirm builds `BirthMeta` with the candidate's
  representative time (preserving entered time as `birth_time_original`) and emits `birth-info-changed`;
  shows the sign-flip ack when the rising sign changes.

- [ ] **Step 1: Write failing test:** wizard renders entry→fit→results; selecting a sign-flip candidate
  opens `RegenerationConfirmModal` requiring the ack; confirm emits `birth-info-changed` with the
  representative time + `profileId`; "keep recorded" emits nothing and closes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the wizard shell + route + the three entry CTAs (onboarding unknown-time,
  ProfileSettings panel, dashboard cusp callout). Make `needsRectification` route here.
- [ ] **Step 4: Run** the test + `bun run --filter '*' typecheck` → green.
- [ ] **Step 5: Commit** `feat(rectify): wizard route, confirm→authority, entry points (slice 2)`.

### Task 16: Slice-2 gates + LIVE validation (cusp)

- [ ] **Step 1:** Rebuild backend wheel + re-sign dev bundle; `uv run pytest -q`, `ruff`, `mypy`,
  `bun run --filter '*' typecheck`, `bun run test:unit`, `test:parity` → all green.
- [ ] **Step 2:** `cd frontend/apps/web && bun run build && bun run preview`; drive the REAL wizard in
  project Playwright Chromium on the **synthetic Bengaluru cusp native** (NOT real data): onboard/seed
  the profile, open `/rectify`, add ≥3 dated categorized events, Fit, confirm the honest ranked result
  renders (band + evidence + recorded comparison, no "%"), confirm a candidate → dashboard chart is
  rectified with both times + clean console. Capture screenshots.
- [ ] **Step 3:** Drive the unhappy paths: too-few-events (assert "can't distinguish"); engine
  throttled/failed → in-app retry recovers. Capture evidence.
- [ ] **Step 4: Commit** any fixes; record the live-validation evidence in the PR description.

---

## Slice 3 — Window / unknown-time sweep

### Task 17: Window candidate generation (coarse-to-fine)

**Files:**
- Modify: `backend/src/almamesh/rectification/candidates.py`
- Test: `backend/tests/test_rectification_candidates.py`

**Interfaces:**
- Produces: `window_candidate_times(birth_dt, lat, lon, *, astronomy, span_minutes: int | None,
  resolution: "coarse" | "fine") -> list[CandidateTime]`. `span_minutes=None` ⇒ whole day. Coarse =
  one representative time per distinct rising sign in the span (≤12). Fine = N samples within a given
  sign's arc.

- [ ] **Step 1: Write failing tests:** whole-day coarse returns one candidate per rising sign that
  occurs that day (signs distinct, each verified by a chart compute); a ±60-min span returns only the
  signs in that span.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the sweep using the warm astronomy; dedupe by sign.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rectification): window candidate generation (coarse-to-fine)`.

### Task 18: `compute_rectification_result` window mode + two-phase

**Files:**
- Modify: `backend/src/almamesh/rectification/__init__.py`, `edge/chart_runtime.py`
- Test: `backend/tests/test_rectification_golden.py` (window case), `test_rectification_runtime.py`

**Interfaces:**
- Produces: `compute_rectification_result(..., mode="window", span_minutes=None, phase="coarse"|"fine")`;
  the engine entry accepts `span_minutes`/`phase`.

- [ ] **Step 1: Write failing window golden test** (synthetic unknown-time native + discriminating
  events → expected top sign + band).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** window branching + `phase` handling; regenerate the window golden fixture.
- [ ] **Step 4: Run** full pytest + parity → green.
- [ ] **Step 5: Commit** `feat(rectification): window/unknown-time mode + two-phase compute`.

### Task 19: `FitProgress` + two-phase orchestration in `useRectification`

**Files:**
- Create: `frontend/apps/web/src/components/features/rectify/FitProgress.tsx`
- Modify: `frontend/apps/web/src/hooks/useRectification.ts`, `Rectify.tsx`
- Test: extend `useRectification.test.ts`, `RectifyResults.test.tsx`

**Interfaces:**
- Produces: `run(events, mode)` does coarse then optional fine; `state.progress` drives `<FitProgress>`
  with an honest timer; window-mode results render the ranked-signs list with the sign-level caveat.

- [ ] **Step 1: Write failing test:** window run reports `phase: "coarse"`→`"fine"`; `FitProgress`
  renders the timer; results show the "sign-level, not minute-level" caveat copy.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the two-phase orchestration + progress UI + caveat copy (i18n).
- [ ] **Step 4: Run** → PASS; typecheck + parity i18n green.
- [ ] **Step 5: Commit** `feat(rectify): unknown-time sweep UI + honest progress (slice 3)`.

### Task 20: Slice-3 gates + LIVE validation (unknown-time)

- [ ] **Step 1:** All quality gates green (as Task 16 Step 1).
- [ ] **Step 2:** Build+preview; drive the real wizard for a synthetic **unknown-time** native: pick
  "I don't know my time" in onboarding → routed to `/rectify` → events → coarse fit → ranked signs with
  the sign-level caveat → confirm → chart authoritative + clean console. Validate whole-day sweep
  wall-clock is acceptable; if too slow, cap signs by plausibility and re-validate. Screenshots.
- [ ] **Step 3: Commit** fixes; record evidence.

---

## Slice 4 — Optional LLM "paste your story" accelerator

### Task 21: `RECTIFICATION_FENCE` + `structureLifeEvents`

**Files:**
- Modify: `frontend/packages/llm/src/prompt.ts`, `index.ts`
- Create: `frontend/packages/llm/src/structure-life-events.ts`
- Test: `frontend/packages/llm/src/structure-life-events.test.ts`

**Interfaces:**
- Consumes: `chatCompletionJson`, `withLanguage`, `LIFE_EVENT_CATEGORIES`.
- Produces: `export const RECTIFICATION_FENCE: string`; `structureLifeEvents(text: string, language:
  PromptLanguage) -> Promise<RectificationEventInput[]>` — sends a `json_object` prompt returning
  `{ events: [{date, category}] }`, parses with a safe-empty default (mirror `mesh-reading.ts`),
  drops rows with invalid category/date.

- [ ] **Step 1: Write failing test** (mocked `chatCompletionJson`): valid JSON → typed events; a bad
  category is dropped; malformed JSON → `[]` (no throw); assert the system prompt contains the fence +
  the "structure only, never compute/interpret" instruction and the language directive.
- [ ] **Step 2: Run** `bun run --filter @almamesh/llm test` → FAIL.
- [ ] **Step 3: Implement** the fence constant + the structurer.
- [ ] **Step 4: Run** → PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(llm): rectification fence + structureLifeEvents (typed, name-free output)`.

### Task 22: `StoryAccelerator` UI behind the cloud opt-in

**Files:**
- Create: `frontend/apps/web/src/components/features/rectify/StoryAccelerator.tsx`
- Modify: `EventEntryStep.tsx`, `rectify.json` (en/es/pt)
- Test: `StoryAccelerator.test.tsx`

**Interfaces:**
- Consumes: `structureLifeEvents`, the LLM settings (cloud opt-in / privacy mode), `useLifeEventsStore`.
- Produces: a collapsible "paste your story" panel that is **hidden/disabled unless the user has opted
  into a cloud endpoint**, shows the explicit "this text goes to your AI endpoint" warning, and on
  submit pre-fills reviewable rows (never auto-fits).

- [ ] **Step 1: Write failing test:** with AI disabled/local-only the accelerator is not actionable (or
  shows the privacy gate); with cloud opted-in, submitting text calls `structureLifeEvents` and appends
  reviewable rows the user can edit before continuing; the warning copy is present.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the panel + gating + warning + i18n.
- [ ] **Step 4: Run** → PASS; typecheck + parity green.
- [ ] **Step 5: Commit** `feat(rectify): optional LLM story accelerator behind cloud opt-in (slice 4)`.

### Task 23: Final gates + full LIVE validation + docs

- [ ] **Step 1:** Full gate sweep (pytest/ruff/mypy/typecheck/test:unit/test:parity) green.
- [ ] **Step 2:** Build (no exit-gate hooks) + preview; drive the complete real journey end-to-end for
  both a cusp native and an unknown-time native, including the accelerator path with a stubbed LLM;
  clean console; in-app engine recovery verified. Screenshots.
- [ ] **Step 3:** Run the `northstar` agent to grade A; address the punch list.
- [ ] **Step 4:** Update `CLAUDE.md` Data-Contract section (add the rectification entry/flow) +
  the spec's "completed" note; PII grep of the full diff.
- [ ] **Step 5: Commit** `docs(rectification): contract + completion notes` and open/refresh the PR.

---

## Self-Review

**Spec coverage:** scorer (Tasks 5–8), candidate gen cusp+window (9,17), engine entry+parity (11,18),
both-times authority via existing pipeline (15), honest bands/no-% (8,14), min-evidence gate (8),
structured entry + store migration (2,3), LLM assist + fence (21,22), error/recovery (13), i18n parity
(4,14,19,22), determinism/PII golden fixtures (10,18), live validation per slice (16,20,23). All spec
sections map to a task.

**Placeholders:** calibration values (house map, band thresholds, weights, min-events) are specified as
named constants seeded with concrete values and pinned by tests — they are test-driven calibration, not
undefined requirements.

**Type consistency:** `RectificationResult`/`RectificationCandidate`/`EventEvidence`/`RectificationMode`/
`RectificationBand`/`RectificationEventInput`/`LifeEventCategory` are defined once (Tasks 1, 6) and
reused verbatim downstream (adapter Task 12 camelCases the Python snake_case). `computeRectification`,
`compute_rectification_result`, `category_houses`, `extract_event_signals`, `score_candidate`,
`rank_candidates`, `cusp_candidate_times`, `window_candidate_times`, `structureLifeEvents`,
`RECTIFICATION_FENCE` are named consistently across tasks.

# Milestone A — Trustworthy, exportable, OpenRouter (design)

**Date:** 2026-06-01
**Branch:** `feat/milestone-a-correctness-hardening`
**Status:** approved design → implementation planning

## TL;DR

Make the *single-chart* experience trustworthy and usable, on two independent tracks:

1. **Engine correctness foundation** (backend Python / Skyfield) — fix two real
   astronomical bugs (astrometric→apparent positions; lagna true-obliquity-of-date),
   harden the Lahiri ayanamsa to a rigorous-precession formula, expose True-node /
   True-Chitra as options, and add the **first external golden-reference validation**
   (JPL Horizons + published Lahiri + astropy — **never Swiss Ephemeris**, licensing).
2. **Frontend hardening** (TypeScript) — fix the timezone display bug, move the LLM to
   **OpenRouter-only** (WebLLM disabled/hidden), add **event-driven artifact
   regeneration** + **rectification** in settings, and a **gated PDF export**.

The predictive-construct superset (transits, ashtakavarga, more vargas, shadbala, …) is
a **separate later milestone (P)**, intentionally *after* the numbers are externally
verified. Members (B) and the relational mesh (C) follow P.

## Non-negotiable invariant (applies to every piece)

> The deterministic Python engine is the **single source of truth** for every number.
> The LLM **narrates only** — it never computes, infers, rounds, or "corrects" a
> position, degree, nakshatra, dasha date, or yoga. The PDF renders **engine output
> verbatim**; LLM prose lives in clearly-narrative sections. New inputs (rectified time,
> future member charts) feed the **same** `toBirthInput → engine.generateChart` path.

Engine = **Skyfield + DE421, pure-Python, runs in-browser under Pyodide/WASM** (no server).
**Swiss Ephemeris / `pyswisseph` is forbidden (licensing)** — including as a dev oracle.

---

## Track 1 — Engine correctness foundation (backend)

All paths under `backend/src/almamesh/`. TDD: each fix lands with a failing test first.

### 1.1 Fix: apparent geocentric positions
**Bug:** `calculations.py:190-191` uses `earth.at(t).observe(body)` (astrometric) without
`.apparent()`, omitting aberration (~20″) and deflection — not the drik/panchanga standard.

**Change:** `apparent = earth.at(t).observe(body).apparent()` then
`apparent.ecliptic_latlon(epoch='date')` (true ecliptic & equinox of date, nutation in),
then subtract ayanamsa. Apply to all 7 planets + Moon. **Rahu/Ketu stay analytic** (mean
node) — they have no apparent position; do **not** route them through `.apparent()`.

### 1.2 Fix: lagna true obliquity of date
**Bug:** `calculations.py:260` hard-codes `eps = 23.4392911°` (mean J2000), inconsistent
with the planets' `epoch='date'`; a systematic ascendant error growing with |year−2000|.

**Change:** true obliquity of date = mean ε(T) + Δε (nutation in obliquity) via Skyfield
`nutationlib`; use `t.gast` (apparent sidereal time), not GMST, for the RAMC. Keep the
existing `atan2(-cos RAMC, sin RAMC·cos ε + tan φ·sin ε)` quadrant form. Pin
`reference_date` so Δε is reproducible.

### 1.3 Harden: Lahiri ayanamsa via rigorous precession
**Issue:** ayanamsa comes from an opaque 73k-row daily lookup table with linear
interpolation (`calculations.py:113-143`); the fallback formula is a *different* model
(silent divergence if the resource is missing); provenance uncited; the `ayanamsa_type`
param is dead (`:441`, `# noqa: ARG001`).

**Change:** implement `ayanamsa(t) = anchor + rigorous_precession(t)`, anchor
**J2000 = 23.85306° (23°51′11″)**, using Skyfield's precession primitives; **document the
precession model** (Newcomb to reproduce the Lahiri zero-date vs IAU2006 — pick one, state
it). Validate the formula against published Lahiri values and the existing table
(transitional regression). Make `ayanamsa_type` actually select between **official Lahiri
(default)** and **True Chitra** (Spica forced to 180.000°).

### 1.4 Add: True-node option
Keep **mean node** (Meeus) as the default. Add a selectable **true node** computed in pure
Skyfield from the geocentric Moon's ecliptic state vector: `h = r × v`, `n = ẑ × h`,
`atan2(n_y, n_x)` (verified ≈123.96° @ J2000, mean ±1.08°). **Not**
`osculating_elements_of().longitude_of_ascending_node` (wrong frame). Ketu = node + 180°.

### 1.5 Dasha year convention
Keep the solar-year default (the existing `dasha/convention.py` enum is well-designed and
already in the defensible solar camp). No behavioral change required; confirm uniform
application across nesting levels (already enforced) and that boundaries use
`birth_dt + timedelta(days = cumulative_years × days_per_year)` from a single origin.

### 1.6 External golden-reference validation suite (the core deliverable)
**Today:** the "golden" fixture is a snapshot of the engine's *own* output; the misnamed
`tests/validation/SwissEphemerisGroundTruth` re-runs the engine's own `AyanamsaCalculator`
(not Swiss data); the parity gate proves CPython==Pyodide only. **Nothing validates
external correctness** — the engine could be consistently wrong and stay green.

**Build:**
- Rename/gut `SwissEphemerisGroundTruth` → `ExternalReferenceFixtures` (no engine re-run).
- **Generate expected values offline, once**, from license-clean authorities and **commit
  as static JSON** (nothing new ships in the engine):
  - **JPL Horizons** (public domain) — apparent geocentric ecliptic longitudes of the 7
    planets + Moon at fixed UTC instants → minus published Lahiri ayanamsa → expected
    sidereal longitudes.
  - **Published Lahiri tables** (Indian Ephemeris / Rashtriya Panchang) — ayanamsa value at
    a known epoch.
  - **astropy (BSD, dev-only)** — independent second code path to catch Skyfield-usage bugs.
  - Hand-derived BPHS — D9 navamsa (already exists in `test_navamsa.py`).
- **Pin, with tolerances** (reuse `tests/validation/comparators.py`): ayanamsa ±0.001°;
  sidereal longitudes (incl. mean Rahu/Ketu) ±0.02°; nakshatra + pada exact; lagna ±0.05°;
  Vimshottari MD+AD boundary dates ±1 day. Use **6–10 charts** (the existing 5 parity
  fixtures + 1–2 near sign/nakshatra boundaries + 1–2 published charts), both hemispheres.
- Run in CI alongside the existing golden so a shared-error regression can finally fail.

### 1.7 Regenerate goldens + parity
1.1/1.2/1.3 change every longitude, so the committed `chart_golden_de421.json` and the
Pyodide `test:parity` fixtures must be regenerated **after** the fixes land and verified
against the new external suite. Update the misleading `calculations.py:13` "Vargas D1–D60"
docstring (only D1+D9 exist) and the stale CLAUDE.md varga note (D9 *is* emitted).

**Out of scope for A (deferred to milestone P):** yoga-rule completeness (Raja-Yoga
conjunction-only, Neechabhanga/Kala-Sarpa simplification, duplicate rules), all new
predictive constructs.

---

## Track 2 — Frontend hardening (TypeScript)

All paths under `frontend/`. TDD throughout. These pieces are independent of Track 1.

### 2.1 Timezone display bugfix
**Bug:** `apps/web/src/pages/settings/ProfileSettings.tsx:82` does
`new Date(birth_datetime_local)`, reparsing the wall-clock string through UTC and rolling
e.g. 1988-08-08 → 08-07 west of GMT. The input pipeline is correct; only display is wrong.

**Fix:** parse the stored local string with the existing string-split helper
(`parseLocalDatetime`/`parseLocalDate` in `apps/web/src/lib/dates.ts`) — never `new Date()`.
Apply the same fix to the latent twin at
`components/features/astrologer-view/BirthDetailsCard.tsx:34`. Red test pinned to
`TZ=America/Los_Angeles` asserts 08/08/1988 (and date-only / `Z`-bearing inputs don't roll).

### 2.2 OpenRouter-only LLM
Interpretation and chat already resolve one global `ProviderConfig`
(`resolveProviderConfig`) — "one shared model" is the existing behavior. Make OpenRouter
the only path:
- `packages/llm/src/config.ts`: `DEFAULT_ENGINE → "openai-http"`; stop auto-selecting webllm.
- `OnDeviceModelSettings.tsx`: render the BYO form directly; the `@mlc-ai/web-llm` code,
  hook, and dependency stay **dormant** (unreachable from UI, not deleted — re-enable later).
- `LlmModelSettings.tsx`: add a one-click **OpenRouter preset** — prefill
  `baseUrl=https://openrouter.ai/api/v1`, `privacyMode: "cloud_premium"` (required: the
  fail-closed gate refuses cloud hosts under `local_only`), reveal the key field, set a
  sensible default model. Generic BYO fields remain.
- `useStreamingInterpretation.ts` + `Dashboard.tsx`: remove the `engine === 'webllm'` setup
  gates and `ModelSetupCard` slots.
- **Untouched:** PII redaction (`sanitizeChartForLlm`) + fail-closed `ensurePrivacy` gate.

### 2.3 Event-driven artifact regeneration (`mitt`)
Today both Onboarding and ProfileSettings inline the same 4-step regen sequence, which is
why ProfileSettings drifted (orphans the old chart under a new id, drops `profile_id`, has
no real change detection, doesn't re-stream the interpretation).

- Add **`mitt`** (~200 B). Settings + Onboarding **emit `birth-info-changed`**
  `{ birth: BirthMeta, profileId }` on save.
- One **regen handler** subscribes and owns the whole sequence: change-detect via the
  existing `chartId(birth)` (no-op when unchanged / name-only) → `engine.generateChart` →
  `siderealChartToChartData` → replace the primary chart **in place** (delete the stale-id
  orphan, **preserve `profile_id`**) → reset ephemeral interpretation/chat → re-stream the
  interpretation. This becomes the *only* place regeneration lives.
- Derived artifacts (geometry, energy field, dasha, yogas, D9) need no handling — pure
  `useMemo`s off `sidereal_chart`, auto-refreshed when the stored chart is replaced.

### 2.4 Rectification in settings
A rectification = a corrected birth **time**. Add an editable rectified-time field + a
`TIME_CONFIDENCE` level (reuse the existing enum) to the Settings birth editor, keeping the
originally-entered time for reference. The rectified time is what feeds `toBirthInput`;
saving it emits `birth-info-changed` → same regen path (2.3).

### 2.5 Gated PDF export
A full print pipeline already exists (header `Print` button → `window.print()`, ~950-line
`@media print` stylesheet with a branded cover page; charts are vector SVG).
- Repurpose the button to **"Export PDF"**, gated on
  `canExport = interpretation complete && non-placeholder content` (a completed
  interpretation implicitly proves the LLM is configured + working — satisfies all three of
  "configured, working, after interpretation"). Disabled-with-tooltip until then.
- Complete the print-only DOM: add the streamed **interpretation text** + the **D9 Navamsa**
  chart (today's print blocks omit both). Result: cover → N/S kundli + Navamsa → planetary
  table → dasha → yogas → interpretation, paginated, OS "Save as PDF". Zero new deps.

---

## Sequencing

Tracks 1 and 2 are independent and can run in parallel. Within Track 2:
**2.1 → 2.3 → 2.4 → 2.2 → 2.5** (regen event before rectification; OpenRouter before the
PDF gate that depends on it). Track 1: **1.1/1.2/1.3/1.4 → 1.6 → 1.7** (fixes before the
golden suite that pins them; regenerate snapshots last).

## Error handling

- OpenRouter failures surface as the existing `LlmRequestError` stream errors; the PDF
  export stays disabled (no completed interpretation), so a failed LLM never yields a
  half-empty PDF.
- A `birth-info-changed` event with an unchanged `chartId` is a no-op (no recompute,
  rename only). Engine compute errors during regen surface to the existing regeneration
  status UI; the old chart is **not** deleted until the new one is successfully saved.
- The external golden suite asserts with tolerances (not float-equality) to avoid
  brittle failures from legitimate sub-arcsecond differences.

## Testing & quality gates

- **Backend:** `uv run pytest` (incl. the new external golden suite) + `ruff` + `mypy`;
  `python-quality` skill.
- **Frontend:** `frontend-quality` skill (Biome/tsc/Vitest); `bun run build && preview`.
- **Determinism:** regenerate + pass the Pyodide==CPython `test:parity` gate after Track 1.
- **Live exit-gate:** `verify-exit-gate.mjs` (boots the real engine in headless Chromium) —
  mandatory because this touches engine math + LLM wiring + chunking; local-green ≠ CI-green.
- Push + watch CI to green before merge.

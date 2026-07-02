# Spec 062 — Robust Rectifier + Comprehensive Report

**Status:** Draft (frontend sections pending explorer reports)
**Owner surfaces:** `backend/src/almamesh/rectification/`, `edge/chart_runtime.py`,
`@almamesh/browser`, `@almamesh/store`, `@almamesh/shared-types`, `apps/web` (`/rectify`, `/report`)

## TL;DR

Event-based rectification is the *primary* method when the entered birth time is soft,
not a fallback — so the scorer must graduate from "suggestive" to "robust". Three engine
upgrades (depth-aware dasha scoring incl. pratyantar, D9 navamsa-lagna scoring, and
miss-penalties/negative evidence), one new weak prior, and honest sign-level output.
Alongside: the exported report becomes fully comprehensive (every calculated table +
the rectification evidence story), and the `/rectify` journey gets an experience-quality
pass. No headline percentages, ever.

## Why (the critique, verified against the code)

A cusp birth with a soft time (±10–15 min plausible) cannot be saved by the birth
record. The current engine (verified 2026-07-01):

- Scores maha+antar+pratyantar lords **pooled into one set** (`scorer.py:137`
  `_active_lords_at` → `_house_signals`), so depth is invisible: a pratyantar hit
  on an exactly-dated event scores the same as a maha hit, and duplicate
  rules/occupies signals collapse. The sharpest discriminator for exact dates is wasted.
- **Ignores the D9 lagna entirely**, although `context.navamsa.lagna_sign` is already
  computed per candidate (`calculations.py:646`) and shifts every ~13 minutes —
  a second, quasi-independent discrete observable tested directly by dated
  relationship events.
- **Only rewards hits** (`extract_event_signals`, `scorer.py:265`: non-matching
  evidence contributes 0.0, never a penalty). A hit-only likelihood systematically
  favors the candidate with more activatable combinations — the main overfit source.
- **Has no prior at all** (verified: no anchor weighting anywhere; the recorded time
  only clamps the window and is echoed for display). The critique assumed a triangular
  half-width-120-min prior; the actual state is flat. A *weak* explicit prior is added
  for honesty (a recorded 5:45 makes 5:52 a priori more plausible than 17:00), but
  events must dominate.

### Design invariant (non-negotiable)

**Hits and misses must be scored at the same dasha depth.** Adding pratyantar-level
hits without pratyantar-aware misses makes overfit *worse* (finer periods = more lords
in play = more post-hoc hits). The upgrades ship as a package, never piecemeal.

### Honesty ceiling (unchanged)

Event rectification resolves the rising **sign** (and sometimes the navamsa lagna),
never the minute. Output stays qualitative: band + margin + per-event evidence.
NEAR_TIE forced under the min-evidence gate stays. No percentage anywhere.

## Engine design

### E1 — Depth-aware dasha scoring (pratyantar upgrade)

Replace the pooled lord-set in `_house_signals` with per-depth signal keys:

- `md_lord_rules_h{h}` / `md_lord_in_h{h}` — weight 1.0 (structural theme)
- `ad_lord_rules_h{h}` / `ad_lord_in_h{h}` — weight 0.7 (delivery)
- `pd_lord_rules_h{h}` / `pd_lord_in_h{h}` — weight 0.5 (timing sharpness)

Rules:
- Same lord matching at multiple depths → count once, at the **deepest** matching depth
  with the **highest** applicable weight for that signal type (no triple-counting
  Jupiter MD=AD=PD).
- The existing precision-marginalization grid (`scorer.py:98`) is preserved; PD signals
  naturally wash out for MONTH/YEAR/APPROX events because the grid samples span many
  pratyantars. No special-casing by precision.
- Transit signal (`slow_transit_h{h}`, weight 0.5) unchanged.

### E2 — D9 navamsa-lagna scoring

New per-event signals for relationship-category events (MARRIAGE, ENGAGEMENT,
BREAKUP; CHILDBIRTH conservatively excluded in v1):

- `d9_lord_rules_d9_h7` / `d9_lord_in_d9_h7` — the active dasha lord (any depth,
  deepest-match rule as E1) rules/occupies the **7th from the navamsa lagna** —
  weight 0.6
- `d9_lord_is_d9_lagna_lord` — the active dasha lord rules the navamsa lagna — weight 0.4

Computed purely from `context.navamsa` (lagna_sign + planet placements) — zero new
astronomy. `RectificationCandidate` gains `navamsa_lagna_sign: ZodiacSign` so the UI
can tell the "your D9 lagna flips Gemini→Leo at ~HH:MM" story.

### E3 — Event character (dignity-conditioned fit)

Classical discriminator: not "did a career event happen" but "did it happen the way
this lagna's lordships predict". Add an EventType→valence map:

- collapse-type: JOB_LOSS, BREAKUP, EXPENSE_SHOCK, LITIGATION, HEALTH_ISSUE, SURGERY
- gain-type: PROMOTION, MARRIAGE, ENGAGEMENT, CHILDBIRTH, WINDFALL, PROPERTY_PURCHASE,
  BUSINESS_START, HIGHER_STUDIES
- neutral: CAREER_CHANGE, RELOCATION, FAMILY_RUPTURE (new)

If the fired dasha lord is **debilitated** (or combust) and the event is collapse-type →
signal weight ×1.25 (`…#afflicted_fit` suffix on the signal key for display).
If **exalted/own-sign** and gain-type → ×1.25 (`…#dignified_fit`). Mismatch (debilitated
lord + gain-type event) → ×0.85, never negative by itself. Dignity read from the
already-computed planet data in `SiderealContext` (verify exact field during
implementation; combustion is available).

### E4 — Miss penalties (negative evidence)

Two forms, both capped so misses can refine, never dominate:

1. **Unexplained event** — if, for a candidate, an event fires *no* signals at a grid
   sample, that sample contributes **−0.25** (instead of 0.0). Marginalized over the
   precision grid like hits. The event happened; a chart silent about it loses ground.
2. **Silent activation** — within the reporting coverage window
   `[min(event dates) − 6 months, max(event dates)]`, enumerate antar periods (the
   dated 81-row tree already exists). For each candidate and each mapped category
   house: if an AD period shows a *strong* signature (AD lord both rules AND occupies
   the category house — the same conjunction that would have scored ≥1.4 as a hit) and
   no reported event of that category falls inside the period (with the event's
   precision tolerance), apply **−0.15**, at most **2 penalties per category**,
   then run through the same de-correlation as hits.

Total penalty magnitude is clamped to ≤ 50% of the candidate's positive total
(`penalty_total` exposed separately for transparent display). Rationale documented in
code: absence of a *reported* event is weak evidence (users under-report), hence the
asymmetric weights (−0.25/−0.15 vs +1.0 hits) and the clamp.

### E5 — Weak anchor prior (greenfield)

New optional payload field `anchor_confidence: "about" | "unknown"` (default `"about"`
for cusp mode, `"unknown"` for window mode unless the user asserts otherwise).

- `"about"`: additive triangular bonus `prior = 0.5 × max(0, 1 − |t − t_anchor| / H)`
  with `H = max(span/2, 60 min)`. Max bonus 0.5 ≈ half of one primary signal — the
  prior can break a true tie, never outvote an event.
- `"unknown"`: flat (bonus 0).

The prior appears in the evidence display as its own labeled row (`prior_anchor`
pseudo-signal) — never hidden inside the score.

### E6 — Category/house map extensions (generic, not owner-fit)

- `LITIGATION`: (6,) → **(6, 12)** — litigation is 6th; confinement/incarceration is
  classically 12th.
- New `EventType.FAMILY_RUPTURE` → **(4,)** — estrangement/rupture with parents or
  household (4th = home/parents). Threads through: Python enum + houses map →
  TS `LifeEventCategory` → interview structurer enum (`structureLifeEvents` typed
  output) → wizard category picker → i18n en/es/pt.

### E7 — Scoring pipeline & output changes

- `fit_score` = decorrelated positive total − clamped penalties + prior bonus.
  `RectificationCandidate` gains: `navamsa_lagna_sign`, `positive_total: float`,
  `penalty_total: float`, `prior_bonus: float` (all serialized; TS mirrors).
- `EventEvidence.signals` keys become depth/valence-qualified (see E1–E3); an optional
  `misses: list[str]` field lists the silent-activation penalties attributed to that
  candidate (result-level, not per-event — final shape decided at implementation).
- Margin/band computation unchanged (`_band_for` thresholds, min-evidence gate,
  de-correlation constants) — recalibration of thresholds is OUT of scope for v1;
  synthetic-scenario tests must show bands behave sanely under the new terms.
- `honesty_note_key` gains variants for: prior-influenced ties, penalty-driven leads.

### Determinism, parity, fixtures

- `reference_date` pinned in every test; same-inputs → byte-identical CPython/Pyodide.
- Golden fixtures **regenerated** (synthetic natives only — Bengaluru/Tokyo/Mumbai
  cast stays; NEVER real birth data). New scenario fixtures: depth-discrimination case
  (PD hit separates candidates), D9-flip case (marriage event decides via navamsa
  lagna), miss-penalty case (hit-rich but silent-activation-heavy candidate demoted),
  prior-tiebreak case.
- The Pyodide==CPython parity gate must cover the new fields.

## Frontend contract & wizard (mapped 2026-07-01)

Contract deltas (exact files):
- **New signal kinds** (depth-keyed `md_/ad_/pd_lord_*_h{n}`, `d9_lord_*`, valence
  suffixes, `prior_anchor`) travel as opaque strings — no type changes in
  browser/store/shared-types. UI: extend the single parser
  `apps/web/src/components/features/rectify/EvidenceTable.tsx:32-42` (`SIGNAL_RE` +
  new parse branches for non-house grammars like D9/prior/miss), add `signals.*`
  keys to en/es/pt `rectify.json` (parity test enforces 3-way), and **strengthen**
  `e2e/wizard-phase2.spec.ts:252-256` raw-key regex to cover the new prefixes
  (today an unmapped key silently falls back to "A timing signal" and the gate passes).
- **New fields** (`navamsa_lagna_sign`, `positive_total`, `penalty_total`,
  `prior_bonus`, evidence `misses`) are explicit 4-place edits: Python model →
  `packages/browser/src/pyodide/rectification.ts` Raw interfaces →
  `packages/store/src/adapters/rectification.ts` (fresh-object adapter silently
  drops unknowns) → `packages/shared-types/src/index.ts:1335-1363`. If persisted:
  `rectificationRecords.ts` persist-version bump + migration + `settings.json` keys.
- **Wire input gains `spanMinutes` + `anchorConfidence`** — `RectificationInput`
  (`packages/browser/src/pyodide/rectification.ts:63-71`) lacks `span_minutes`
  today; thread through `chartWorker.ts` PY_BOOTSTRAP glue and
  `apps/web/src/hooks/useRectification.ts` `buildWireInput:109-126`.
- **FAMILY_RUPTURE category** (16→17): Python `EventType` + houses map → TS
  `LifeEventCategory` + `LIFE_EVENT_CATEGORIES` (shared-types :1274-1310) → the
  duplicated union in browser/rectification.ts:21-37 → `structure-life-events.ts`
  whitelist :131-134 → `EventRow.tsx` select → `categories.*` i18n ×3.

Wizard UX:
- Honest-window input on the fit step ("somewhere between HH:MM and HH:MM") feeding
  `spanMinutes`; `anchorConfidence` control (about / unknown).
- Evidence storytelling per candidate: depth-labeled structural fits, the D9 test
  (`navamsa_lagna_sign` on `CandidateCard`), misses shown with per-row polarity
  (UI/i18n design: "supporting" vs "counting against" — copy today assumes positive
  support), prior as its own labeled row. Scores stay unrendered — counts and
  qualitative labels only (no-% e2e assertions stay and get extended).
- Conversational interview: elicitation strategy upgraded to ask for exactly-dated
  discriminator events (see LLM section); FAMILY_RUPTURE in the typed structurer.

## LLM prompting & context (scope added 2026-07-01)

Improve prompt quality and engine grounding across `@almamesh/llm` while preserving
every fence (RECTIFICATION_FENCE structure-only boundary, anti-scam relationship
fence, PII redaction, fail-closed local_only):
- **Interview**: persona should elicit what a rectifier actually needs — exactly-dated,
  high-reliability events across distinct life domains (legal, marriage, career,
  family), explaining why exact dates matter; push for date precision; avoid leading.
- **Chart chat / interpretation**: ground in the rectification record (working-time
  authority, band, entered-vs-rectified), current dasha depth (MD/AD/PD), D9 summary,
  combustion — so narration never contradicts the engine's birth-time story.

Concrete deltas (mapped 2026-07-01):
1. **Activate the dormant predictive pipeline** — sanitizer, facts block, and prompt
   exception all exist and are tested, but no live caller composes
   `transit_context`/`strength_context`/`varga_context_full` onto the chart. Persist
   the raw `PredictiveContexts` alongside the UI reshape in
   `packages/store/src/predictive.ts` (version bump + graceful migration), compose in
   `apps/web/src/hooks/useStreamingInterpretation.ts` and `Dashboard.tsx` chat wiring.
2. **Stateful, discriminator-seeking interview** — inject a PII-safe state block into
   `buildInterviewMessages` (`rectification-interview.ts:57`): events gathered so far
   ({date, category, precision} only), categories still missing, elicitation strategy
   (exact dates score sharpest; category diversity beats stacked same-category —
   mirrors the engine's de-correlation; Ascendant-sensitive domains preferred).
3. **Chat grounded in the rectification record** — optional labelled line in
   `buildChatMessages` (band + signs + cusp status only; no dates — PII-safe),
   sourced from the persisted record store.
4. **Chat facts get degrees + nakshatra/pada/lord** (`facts.ts` planetLine currently
   drops them; the exclusion is test-locked — update the test deliberately).
5. **Prompt golden-snapshots** — full-output snapshot tests for chat/section/mesh
   builders on synthetic fixtures (key-phrase greps can't catch a dropped fence).
6. **Budget the 6× chart dump** — compact JSON + per-section context slimming guarded
   by `estimateTokens`.
Out of scope (deferred): mesh edges in Dashboard chat; D9 dignity enrichment beyond
what lever 1 provides. All fences byte-preserved; `en` prompts stay byte-identical
through `withLanguage`.

## Comprehensive report (audited 2026-07-01)

Finding: the downloaded PDF (`components/report-pdf/ReportDocument.tsx`, sole export
path — browser print is retired) is a **strict subset** of the web report: it omits
ALL predictive sections VI–IX; rectification is one note line
(`buildReportPdfData.ts:79-87`). Web report gaps: no houses/bhava table anywhere;
varga plates D9+D10 only (engine emits all 16); SAV grid but no BAV bindu tables;
Shadbala totals but no six-component breakdown; `slow_hits` never rendered; only the
running maha's antars printed.

Work items (slotting per audit):
1. Houses/bhava table — new `ReportHouses` after the planet table (data:
   `sidereal.houses`).
2. All 16 varga plates in `ReportVargas` (VII).
3. BAV bindu tables in `ReportStrength` (VIII) from `ashtakavarga.bhinna`.
4. Shadbala six-component columns in the VIII table.
5. Slow transit hits in `ReportTransits` (VI).
6. All-maha antar tables in `ReportDasha` (IV).
7. **Section X "Birth Time Authority"** between Domains and Footer: entered vs
   working time+sign, mode, qualitative band (NO %), supporting events (resolved from
   `lifeEvents`), honest caveat ("resolves the sign, not the minute"). Phase 1 renders
   from the existing v1 `RectificationRecord`; phase 2 (after contract threading)
   persists a **result snapshot** (candidates incl. `navamsa_lagna_sign`, per-event
   evidence, misses, prior) at confirm time — `rectificationRecords` persist v1→v2
   with graceful migration — so the full evidence table prints without recompute.
8. **PDF parity**: mirror VI–IX + houses + rectification into `report-pdf/` following
   the existing patterns (one A4 Page per section, row-level `wrap={false}`,
   `pdf.*` label props; add repeated-header `fixed` pattern for the new large tables).

i18n: `report` namespace, identical dotted keys ×3 (parity test enforces, incl.
placeholder parity). Panchanga: blocked on engine emission (roadmap P3) — out of scope.

## Quality gates

Standard non-negotiables (pytest, ruff, mypy, typecheck, vitest, parity, build+preview,
live exit gate) **plus** real-journey validation: unhooked build, real onboarding,
`/rectify` both modes, report export — clean console. Northstar to grade A before merge.
Deploy to almamesh.com after merge (goal-authorized), live-verified with SW cache cleared.

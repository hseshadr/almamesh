# AlmaMesh Rigor Upgrade — Calibrated, Explainable, Honest Interpretation

**Lifecycle:** PARTIAL
**Status:** Stages 1–3 shipped in PR #56, PR #58, and PR #57. Stage 4 is PARTIAL: the
assumptions panel and conservative web cusp proxy are shipped in PR #59;
exact dual-lagna production wiring and PDF stability markers remain roadmap. This file preserves
the historical design and acceptance rationale; Stage 5 remains an external markovflow handoff.
**Repo:** `~/dev/oss/almamesh` (public, live at almamesh.com, real client-side birth data).
**Author's contract:** every factual claim below cites a `file:line` verified against the tree
on 2026-07-11. Where the code contradicts the briefing, the code wins and the discrepancy is
flagged inline as **[DISCREPANCY]**.
**Evidence contract:** these calibrated structural/classical scores are reproducible model outputs,
not empirically validated life outcomes; only the event-fit rectification tier uses personal events.

---

## TL;DR (read this first)

**What shipped.** AlmaMesh retains the qualitative bands — a yoga is
`strong / moderate / weak`, a life domain is `STRONG / MODERATE / WEAK`, and a rectification result
is `near_tie / leans / consistent` — while adding an explicitly tiered **calibrated percentage**
where an honest anchor exists. Under each percentage sits an **additive factor
ledger** (`Mars exalted +1 · in kendra +1 · Jupiter debilitated −1`), the **opposing vector**
(what argues against), and an **assumptions panel**. The web report also shows a conservative
cusp-based stability marker; exact dual-lagna production evaluation and PDF marker propagation
remain Stage 4 roadmap. Nothing is hidden: the result remains traceable to engine quantities and
stated transforms.

**Why it works.** The honest numeric substrate already exists and is already deterministic and
golden-locked: yoga marks (`yogas/factors.py:114`), Shadbala rupas + SAV bindus
(`domains/strength_summary.py:41-49`), the event-scored rectification margin
(`rectification/scorer.py:709-725`). We add **one documented, chart-invariant transform** per
quantity, anchored to a real classical quantity, property-tested for monotonicity, and validated
against calibration fixtures spanning multiple charts.

**Worked example.** A clean Raja-yoga with exalted Jupiter and Mars each in a kendra reads
`Strong — 83.33% (structural)` with a ledger `Jupiter exalted +1 · kendra +1 · Mars exalted +1 ·
kendra +1 → net +4 over the achievable range −6..+6`. A debilitated Sun in a dusthana reads
`Weak — 0% (structural)` with `Sun debilitated −1 · in 6th (dusthana) −1 → net −2 over the
achievable range −2..+2`; the Sun can neither combust nor retrograde, so those headroom marks do
not exist. Same transform, every chart.

**Core invariants (the honesty covenant, amended).** (1) No number is *uncalibrated, hidden, or
false-precise* — the old sin, not the percent itself. (2) Every percent names its **epistemic
tier** (event-validated vs model vs structural) and never implies validity it lacks. (3) Per-signal
rectification contributions stay **words/polarity-only**; only the aggregate margin becomes a %.
(4) The quarantined sigmoid (`dasha/scoring.py`) stays quarantined — our numbers are *anchored*,
not *learned*.

## Shipped evidence

| Stage | Delivery | Executable evidence |
|---|---|---|
| Yoga structural percentage + factor ledger | PR #56 | `backend/tests/test_yoga_favorability.py`; `ReportYogas.test.tsx` |
| Life-domain model percentage + two-axis ledger | PR #58 | `backend/tests/test_domain_strength_pct.py`; `backend/tests/test_life_domains.py`; `ReportDomains.test.tsx` |
| Event-fit rectification percentage + opposing vectors | PR #57 | `backend/tests/test_rectification_confidence.py`; `ReportRectification.test.tsx` |
| Stage 4 partial: assumptions + conservative web cusp proxy | PR #59 | `backend/tests/test_stability.py` covers exact helpers; `ReportAssumptions.test.tsx` covers the shipped panel; exact production wiring and PDF stability markers remain roadmap |

The implementation paths and transforms below are retained as the historical delivery contract.
Stages 1–3 are audit evidence; Stage 4 explicitly separates shipped surfaces from remaining work.

---

## §0. Epistemic honesty — the foundation (READ BEFORE §A)

This is the crux the whole design turns on. The `77.9` was deleted not because it was a percentage,
but because it was **uncalibrated, hidden, and false-precise** — it multiplied a base score by a
*STUB* shadbala ratio that never existed on the natal path (`schemas/astrology.py:158-161`). A
calibrated, anchored, documented, tested percent is its opposite. But "calibrated" must not sneak
in a *second* lie: the pretense that we have *measured* the planet→life mapping. We have not, and
nobody has. So the design commits to six things.

### 0.1 Two layers, stated plainly on every surface

- **Layer 1 — deterministic astronomy (real, reproducible science).** Positions, dignities-by-
  definition, whole-sign houses, Vimśottarī daśā, transits. Computed by
  `calculate_sidereal_context` (`calculations.py:678`) from an ephemeris; byte-reproducible under
  the parity gate. These are *facts about the sky*.
- **Layer 2 — strength/valence weighting (a formal MODEL, not an empirical claim).** How much
  exaltation "counts," whether retrograde is good, how factors combine into a grade. This is
  `yogas/factors.py`, `domains/strength_summary.py`, `transits/fusion.py`. **Every strength % is a
  Layer-2 model output under stated assumptions — never a measured fact.**

The UI must make this legible: a percent's label always answers "*model says* or *your life
confirms*?" (see §0.4). The two layers never blur into one number.

### 0.2 The traditional scoring systems are STRUCTURE, not truth

Shadbala virūpas, Ashtakavarga bindus, and the yoga ±1 marks are the *model's structure, applied
uniformly to every chart.* Anchoring to them buys exactly two things and no more:

- ✅ **Consistency + reproducibility** — the same configuration scores the same everywhere; this
  kills the per-chart cherry-picking that makes ordinary astrology unfalsifiable.
- ❌ **NOT empirical validity** — that Śrīpati's `required_rupas` for Jupiter is 6.5 does not mean a
  6.5-rupa Jupiter *empirically* delivers wisdom. The number is a *classical convention*, uniformly
  applied. The spec's "cite a classical quantity" language must **never** be read as "this classical
  quantity is validated." §A repeats this per row.

### 0.3 The one genuinely falsifiable anchor: the event scorer

`rectification/scorer.py` is the scientific layer already in the tree. It scores birth-time
*hypotheses* against the user's **real, dated life events**, then:

- de-correlates same-category events so N duplicates can't manufacture confidence
  (`scorer.py:165-169`, geometric decay 0.5, category total hard-capped),
- penalizes *silent misses* — periods that should have fired but didn't
  (`silent_activation_misses`, `scorer.py:608`; clamped `scorer.py:635-644`),
- forces `NEAR_TIE` below a minimum-evidence bar (`MIN_DISCRIMINATING_EVENTS = 3`, `scorer.py:156`;
  gate at `scorer.py:719-720`).

This is the template. **Wherever a strength can be tested against real events, validate it the same
way the lagna is** — do not invent a parallel confidence engine. §D Stage 3 leans on this directly;
§D Stage 5 (north-star) generalizes it into a fitted model.

### 0.4 Confidence separates "model says" from "your life confirms"

Two different uncertainties, two different labels:

| Tier | Meaning | Example quantity | Label shown |
|---|---|---|---|
| **E — Event-validated** | Tested against the user's dated events (§0.3 machinery) | rectification margin | "confirmed by N of your events" |
| **M — Model (exact input)** | Layer-2 model over *exact* BPHS quantities (rupas, bindus) | life-domain strength | "model estimate (traditional weights)" |
| **S — Structural** | Layer-2 model over the uniform ±1 mark lattice (coarser input) | yoga strength | "structural estimate" |
| **R — Raw (no honest %)** | No anchor, no validation exists | transit fusion net_weight | ledger only — **no %** |

A domain strength that *also* fits the user's events (once Stage 5 exists) is promoted from M to a
blended E/M and *relabeled*, carrying visibly higher, differently-worded confidence. The tier is a
required field on every surfaced number, not a footnote.

### 0.5 North-star: a posterior-ready seam for **markovflow** (out of scope here)

The probabilistic-convergence layer — turning the calibrated percentages into posteriors that
tighten as real life-events accumulate — is a **separate, already-spec'd external project the user
owns, `markovflow`**, explicitly deferred. This spec does **not** design its internals; it only
guarantees that markovflow can later sit on top **without re-architecting**. Two requirements on the
near-term work:

- **Confidence is posterior-ready, not a bare scalar.** Every confidence/claim object (yoga %,
  domain %, rectification %) carries *structured evidence + uncertainty* — the ledger of signed
  contributions, the achievable range (`M⁺/M⁻`, `required_rupas`, the event set), and its epistemic
  tier — so a downstream Bayes layer can consume it as a likelihood/prior rather than re-deriving it
  from a lossy number. (The rectification `margin`/`band` at `scorer.py:709-725` is already a crude
  two-hypothesis separation; markovflow generalizes it — we just must not throw away the structure
  underneath it.)
- **The engine stays a pure function amenable to repeated evaluation.**
  `calculate_sidereal_context` and `compute_predictive_contexts` are pure, twice-callable,
  singleton-free functions of (birth data, assumptions) (`calculations.py:678-698`,
  `predictive.py:46-56`); keep them that way so markovflow can replay (chart, events) evaluations
  offline.

That is the entire north-star obligation on this spec. Finishing the remaining Stage 4 production
wiring is the near-term rigor priority.

### 0.6 The sixth gate: no % may imply validity it lacks

Added to the five-point scientific bar (§A.0): **each surfaced % states whether it is model-only or
event-validated, and never over-claims.** A structural yoga % that reads "83.33%" without its tier
label is a covenant violation exactly as `77.9` was.

---

## §A. Calibration design (the scientific core)

### A.0 The six-gate acceptance bar (definition-of-done for ANY %)

A percentage ships only if it is:

1. **Anchored** — 0% and 100% tied to a real classical quantity cited in code; no hand-picked
   min/max.
2. **Monotonic** — more favorable evidence never lowers it; removing favorable never raises it.
   Enforced by a property test.
3. **Chart-invariant & reproducible** — one documented transform, identical for every chart,
   deterministic, locked in parity goldens.
4. **Falsifiable / calibrated** — canonical textbook configs land where śāstra says; CI fails if a
   known-strong chart reads weak.
5. **Transparent** — the ledger and the transform are both shown; any % is auditable to its inputs.
6. **Honest (§0.6)** — carries its epistemic tier; never implies unearned empirical validity.

### A.1 Calibration table (one row per quantity)

For yoga and life domains, Percentage and qualitative band are parallel explainable outputs;
neither is derived from the other. The percentage normalizes auditable evidence, while the existing
qualitative rule retains its own engine contract.

Yoga grade remains `net ≥ 2` strong · `net ≤ −1` weak · otherwise moderate.
Domain band remains both signals strong → strong · both weak → weak · otherwise moderate.

| Quantity (raw, file:line) | 0% / 100% anchor + classical citation | Transform (+ why) | Qualitative rule (parallel) | Known-strong fixture → target | Known-weak fixture → target | Tier |
|---|---|---|---|---|---|---|
| **Yoga strength** — `net = Σ _net_marks(pos)` over involved planets, `_net_marks` ∈ per-planet [−3,+3] (`yogas/factors.py:114-121`); grade buckets net≥2 / ≤−1 (`factors.py:124-131`) | **0%** = the yoga's own **max *unfavorable* marks** `M⁻`; **100%** = its **max *favorable* marks** `M⁺`, both computed per involved-planet set (dignity 1 + kendra/trikona 1 + retrograde 1 where the planet *can* retrograde; combust 1 where it *can* combust). Anchor = the mark lattice itself (BPHS graha-svarūpa / kendra-trikona / asta / vakra doctrines, each cited at `factors.py:43-49`). | **Linear** over the bounded integer lattice: `pct = 100·(net + M⁻)/(M⁺ + M⁻)`. Linear is correct because the lattice is small, bounded, and the model *defines* every mark as equal — there is no diminishing-returns structure to honor. NOT log. | `net ≥ 2` strong · `net ≤ −1` weak · otherwise moderate. Because achievable headroom varies by planet set, there is no universal percentage threshold; a two-planet yoga with net +2 and range −6..+6 is strong at 66.67%. | Exalted Jupiter in a kendra: net +2 / range −3..+3 → **83.33%** | Debilitated Sun in a dusthana: net −2 / range −2..+2 → **0%** | **S** |
| **Life-domain strength — Shadbala axis** — `key_graha_rupas` (float) vs `required_rupas`, `meets_minimum` bool (`schemas/strength.py:154-156`; summary at `strength_summary.py:41,46-47`) | **0%** = 0 rupas; **anchor line** = `required_rupas` (the classical per-graha minimum, BPHS/Śrīpati iṣṭa-bala; `strength.py:140-141`) mapped to **60%** (the "meets the classical bar" line); **100%** = `2 × required_rupas` (a *documented, contestable* strong-ceiling — see §E-1). | **Piecewise-linear**, two segments: `[0, required]→[0%,60%]` and `[required, 2·required]→[60%,100%]`, clamped. Piecewise (not log) because there is a *classically meaningful pivot* (the required-rupa pass line) that must land at a fixed %, and rupa dynamic range is narrow (~0–3× required). | This axis supplies `meets_minimum` to the separate domain-band rule; its percentage does not assign the band. | 10th-house Saturn at 2.1× required rupas (career): **~95%** | 4th-lord Moon at 0.4× required: **~24%** | **M** |
| **Life-domain strength — Ashtakavarga axis** — `sav_bindus` summed over domain houses (int); per-house avg vs 28/25 (`strength_summary.py:24-25,43,49`) | **0%** = 0 bindus/house; **100%** = 56 bindus/house (classical hard max: 8 max BAV × 7 contributing grahas, `strength.py:9`); **50% pivot** = **28**, the śāstric average (Sarva total 337 / 12 ≈ 28.08). | **Linear** `pct = 100·avg/56`, with 28 landing at 50% by construction. Linear because bindus are a uniform count with a clean natural midpoint; the classical reading is already linear ("above/below 28"). | The separate band rule uses raw average: ≥28 is its strong signal and <25 its weak signal; the axis percentage does not assign the band. | 11th house at 34 bindus: **~61%** | 8th house at 19 bindus: **~34%** | **M** |
| **Life-domain strength — combined headline** — `_band(meets_minimum, avg_bindus)` (`strength_summary.py:28-34`) plus `_headline_pct(shadbala_pct, sav_pct)` | Headline percentage = **min(Shadbala%, SAV%)**; both calibrated axes remain visible. | **min()** of the two anchored percentage axes. Documented; the ledger shows *why*. | Both `meets_minimum` and avg≥28 → strong; both below-minimum and avg<25 → weak; every mixed case → moderate. This rule runs in parallel with the percentage. | Saturn-career 95% ∧ SAV 61% → **61%, strong** | Moon-home 24% ∧ SAV 34% → **24%, weak** | **M** |
| **Rectification confidence** — normalized `margin = (top−runner_up)/(top+runner_up+EPS)` ∈ [0,1) (`scorer.py:709-714`); bands `NEAR_TIE_MARGIN 0.15`, `CONSISTENT_MARGIN 0.40` (`scorer.py:162-163`); min-evidence gate `MIN_DISCRIMINATING_EVENTS 3` (`scorer.py:156,719`) | **0%** = margin 0 (candidates tie); **100%** = margin→1 (winner infinitely dominant). Anchor = the **event-fit separation itself** — the empirical §0.3 quantity. **Gate:** below `MIN_DISCRIMINATING_EVENTS` show **no %**, render "not enough evidence." | **Direct** `pct = 100·margin`, band-annotated at the existing 0.15/0.40 cuts. No re-curving: margin is *already* a calibrated, event-derived ratio; distorting it would break the honest under-claiming bias baked in at `scorer.py:158-163`. | <15% near-tie(→no headline %) · 15–40% leans · ≥40% consistent | 5 independent dated events, top fit 2.3× runner-up (margin 0.42): **42%, consistent** | 2 events (below gate): **no % — "inconclusive"** | **E** |
| **Transit / prediction confidence** — `score_fusion → net_weight ∈ [−1,1]` (`transits/fusion.py:66-78`); `TransitSeverity` supportive/neutral/challenging (`fusion.py:57-63`) | **NO HONEST ANCHOR EXISTS.** The magnitudes `_HOUSE_BONUS 0.3`, `_PER_BENEFIC 0.25`, `_PER_MALEFIC −0.25` (`fusion.py:40-43`) are pure AlmaMesh heuristics — not classical quantities, not event-validated. Manufacturing 0%/100% here would be a `77.9` in disguise. | **NONE — do not compute a %.** Show the **raw ledger**: `reinforcing[]` benefics vs `afflicting[]` malefics (already in scope, `fusion.py:68-69,104-105`) + the three-way severity word. | supportive / neutral / challenging (unchanged words) | Jupiter+Venus reinforcing, none afflicting → "supportive · +2 reinforcing / 0 afflicting" | Saturn+Mars afflicting → "challenging · 0 / −2" | **R** |

**Reading the table:** the epistemic tier *descends* left-to-right down the rows — rectification (E)
is the gold standard, domains (M) rest on exact inputs, yogas (S) on a coarse lattice, transits (R)
get no number at all. This gradient is the honesty story made concrete.

### A.2 Per-quantity prose (the "why" behind each anchor)

**Yoga strength (Tier S).** The engine already computes the exact signed integer we need and *throws
it away*: `_net_marks` (`factors.py:114`) returns `favorable − unfavorable` per planet but only the
qualitative `grade_for` (`factors.py:124`) survives onto `YogaData`. **[DISCREPANCY vs briefing]:**
kendra and trikona are a *single* combined favorable mark, not two (`factors.py:116`:
`pos.house in KENDRA_HOUSES or pos.house in TRIKONA_HOUSES`); the max-favorable computation must
honor that (house contributes at most +1). The anchor `M⁺/M⁻` is *computed from the yoga's own
planet set* (not a global constant), because a two-planet yoga simply cannot reach the same raw net
as a four-planet one — normalizing by the achievable range is what makes the % chart-invariant
rather than yoga-size-dependent. Because the mark lattice is the *model structure* (§0.2), this %
is Tier **S** and must be labelled "structural estimate," never "measured." The qualitative grade
still comes directly from `net` (`≥2` strong, `≤−1` weak, otherwise moderate); it is not bucketed
from the normalized percentage, whose achievable range changes with the involved planet set.

**Life-domain strength (Tier M).** Two independent classical signals, kept independent in the
ledger and combined only at the headline. The Shadbala axis anchors on `required_rupas` — a *real*
per-graha classical minimum already in the schema (`strength.py:155`) — which gives us a
principled 60% "pass line" instead of a hand-picked midpoint. The SAV axis has the cleanest anchor
in the whole design: **28 is not invented**, it is arithmetically the Sarva average (337/12), so
28→50% falls out of the math. The `min()` combiner preserves today's conjunctive semantics
as a percentage combiner, but does not assign the qualitative band. `_band()` independently uses
the raw signals: STRONG needs *both* `meets_minimum` and avg≥28; WEAK needs below-minimum and avg<25;
mixed cases are MODERATE. The one soft spot is the `2×required` ceiling (§E-1).

**Rectification confidence (Tier E).** This is the only quantity we should feel *scientific* pride
in, and we barely touch it: `margin` is already normalized to [0,1), already event-derived, already
gated to under-claim. We surface `margin×100` and keep the existing band words as annotations. The
crucial honesty move is the **gate**: below three discriminating events the engine already returns
`NEAR_TIE` regardless of raw margin (`scorer.py:719-720`), so the UI must render **"inconclusive,"
not a small percent** — a 42% built on two coincidences is exactly the false precision we forbid.
Note the semantics precisely: this % is "how much better your best-fitting birth time explains your
events than the runner-up," *not* "probability the time is correct." The label says so.

**Transit / prediction confidence (Tier R) — the flagged non-anchor.** Per the task's explicit
instruction to flag quantities with no honest anchor: **transit fusion has none.** `net_weight` is
bounded [−1,1] only by a `max(-1, min(1, raw))` clamp (`fusion.py:77`) over coefficients chosen by
feel. There is no classical "0% transit" or "100% transit," and no event-validated one either. We
therefore ship the **ledger, not a number** — the reinforcing/afflicting planet lists plus the
supportive/neutral/challenging word. This is a feature of the honesty covenant, not a gap.

---

## §B. Schema / engine changes (additive-only, per stage)

### B.0 The 6-layer threading checklist (run for EVERY new engine number)

Any new numeric field must be threaded through all six layers or it silently dies at a boundary:

1. **Python schema** — add the field (Pydantic model in `schemas/*.py` or `rectification/models.py`).
2. **chartWorker serialize** — *no code change needed*: the worker is a pass-through,
   `json.dumps(ctx.model_dump(mode="json"))` (`packages/browser/src/pyodide/chartWorker.ts:61,76,153`).
   New fields flow automatically. **But** the TS mirror (layer 5) must be updated or the field is
   untyped/dropped at parse.
3. **protocol.ts** — message contract (`packages/browser/src/pyodide/protocol.ts`); update only if a
   new *entrypoint* is added (none of stages 1–4 add one).
4. **store adapters** — `packages/store/src/adapters/*.ts` map worker output to app state; add the
   field where the adapter explicitly destructures (adapters that spread pass it through).
5. **shared-types / browser mirrors** — the hand-written TS mirrors: `pyodide/chart.ts` (yogas:
   `YogaStrengthFactor` L112, `YogaData` L140), `pyodide/predictive.ts` (`StrengthSummary` L304,
   `LifeDomainForecast` L335), `@almamesh/shared-types` (`RectificationCandidate`, `EventEvidence`,
   consumed by `rectifySignals.ts:28`). These are the byte-parity contract — update deliberately.
6. **both renderers** — web (`components/features/report/*`) and PDF
   (`components/report-pdf/sections/*`).

**Golden re-bless + parity re-verify (do this whenever `model_dump` output changes):**
- Yogas → `chart_golden_de421.json` (via `regen_strength_golden.py` pattern; yogas ride on the
  chart golden). Re-bless: run the repo's `regen_*` script, inspect the diff is *only* the new
  additive keys, commit.
- Domains → `domains_golden_de421.json` **and** `predictive_golden_de421.json` (regen scripts
  present: `tests/fixtures/regen_domains_golden.py`, `regen_predictive_golden.py`,
  `regen_strength_golden.py`).
- Rectification → `rectification_golden.json` + `rectification_window_golden.json`.
- **Then re-run the Pyodide byte-parity gate** (`packages/browser/integration/parity.mjs`, or
  `bun run test:parity`): it re-canonicalizes (floats rounded 6 dp, keys sorted) and deep-compares
  CPython vs Pyodide (`parity.mjs:23-26`). A new float that rounds differently across runtimes will
  fail here and nowhere else — this is the gate that catches CPython↔WASM drift.

### B.1 Stage 1 — Yoga strength % + ledger (additive fields)

- **`schemas/astrology.py`**: add to `YogaStrengthFactor` (L169) a signed `mark: int` (the ±1 this
  factor contributes; 0 for neutral) and keep `value`/`basis`. Add to `YogaData` (L192): `net_marks:
  int`, `max_favorable: int`, `max_unfavorable: int`, `strength_pct: float`, `strength_tier:
  Literal["structural"]`. All additive with defaults so older stored payloads validate.
- **`yogas/factors.py`**: expose the per-factor mark (extend `_dignity_factor`/`_house_factor`/…
  L65-100 to set `mark`), and a `favorability(positions) -> tuple[net, M⁺, M⁻, pct]` computed from
  the same `_net_marks` logic (L114) so grade and % can never disagree.
- **`yogas/rules.py`**: `_make_yoga` (L111) already assembles `grade`/`strength_factors`; add the
  four new fields from `favorability(positions)`.
- **Golden broken:** `chart_golden_de421.json` (+ re-run parity).
- **Tier:** S.

### B.2 Stage 2 — Life-domain strength % + ledger

- **`schemas/domains.py`**: add to `StrengthSummary` (L114): `shadbala_pct: float`, `sav_pct: float`,
  `strength_pct: float` (the min-combiner), `strength_tier: Literal["model"]`. Keep
  `key_graha_rupas`/`sav_bindus`/`band` for the ledger and back-compat.
- **`domains/strength_summary.py`**: `strength_summary` (L37) already has `bala.total_rupas`,
  `bala.required_rupas` (via `bala.meets_minimum`), `bindus`, `len(recipe.houses)` — compute the two
  axis %s and their min here; add a small pure `_pct_shadbala(total, required)` and
  `_pct_sav(avg)` (each ≤15 lines, Grade-A per python-quality).
- **Golden broken:** `domains_golden_de421.json` + `predictive_golden_de421.json` (+ parity).
- **Tier:** M.

### B.3 Stage 3 — Rectification confidence % + opposing vectors (mostly render-only)

- **Engine numbers already threaded.** `RectificationResult.margin` (`models.py:111`),
  `.band` (L112), `.discriminating_event_count` (L113), and per-candidate `fit_score`/
  `positive_total`/`penalty_total`/`prior_bonus` (`models.py:94-100`) all already reach the TS side
  (`RectificationResultRaw`, `chartWorker.ts:252`). **This stage adds ~no engine fields** — it is
  surfacing.
- **Optional additive field:** `RectificationResult.confidence_pct: float` (= `margin*100`, or a
  sentinel `None` when below the min-evidence gate) so the render layer never re-derives the gate.
  Guard the gate in the schema, not the component.
- **Opposing vectors** are already present per candidate as `positive_total` vs `penalty_total` and
  per event as `EventEvidence.contribution` (signed float, `models.py:72`) — the render shows the
  supporting total vs the opposing (penalty) total. **Covenant:** per-signal contributions stay
  **words + polarity only** (`rectifySignals.ts:22-24`); only the aggregate margin becomes the %.
- **Golden broken:** `rectification_golden.json` (only if `confidence_pct` field added).
- **Tier:** E.

### B.4 Stage 4 — Stable-vs-lagna dual pass + assumptions panel — **PARTIAL**

- **Shipped support:** pure Python and TypeScript diff helpers implement the exact two-verdict
  comparison, and `backend/tests/test_stability.py` proves the Python dual pass can share one
  ephemeris load. These helpers are not wired into the production report path.
- **Shipped surfaces:** the assumptions panel reaches both web and PDF. The web yoga/domain chips
  currently use `reportStabilityMarkers`, a conservative cusp-based proxy over the one rendered
  lagna; the PDF does not carry stability markers.
- **Remaining roadmap:** production must evaluate the actual alternate candidate lagna, feed the
  exact diff into the web report, and propagate those exact markers into PDF. Only then can Stage 4
  claim exact stable-vs-lagna delivery end to end.
- **No engine schema change is expected:** the exact production path can reuse
  `calculate_sidereal_context` with a shared `astronomy=` instance and the existing typed marker.
- **Tier:** an exact two-lagna diff is Layer-1 deterministic. The current cusp proxy must remain
  identified as a proxy, not presented in engineering evidence as proof that the dual pass shipped.

---

## §C. The guard amendment (exact before/after)

The covenant changes from **"words only"** to **"no un-calibrated / hidden numbers."** Two comment
edits; the quarantine test is untouched.

### C.1 `backend/src/almamesh/schemas/astrology.py:158-162`

**BEFORE (verified current text):**
```python
# Qualitative yoga grade. NO numeric strengths/percentages anywhere — the old
# "effective_strength 77.9" headline multiplied a base score by a STUB shadbala
# ratio (real Shadbala lives in the lazy strength context, never on the natal
# path), which violated the calculation-integrity mandate.
YogaGrade = Literal["strong", "moderate", "weak"]
```
**AFTER:**
```python
# Qualitative yoga grade + a CALIBRATED structural strength %. The banned thing
# was never "a percentage" — it was the old "effective_strength 77.9": an
# UN-calibrated, HIDDEN, false-precise number that multiplied a base score by a
# STUB shadbala ratio (real Shadbala lives in the lazy strength context, never
# on the natal path). What is now REQUIRED instead: strength_pct is anchored to
# the yoga's own max-favorable/max-unfavorable mark lattice (yogas/factors.py),
# monotonic, chart-invariant, golden-locked, and tagged strength_tier="structural"
# so it never implies empirical validity (a Layer-2 MODEL output, not a measured
# fact). STILL FORBIDDEN: any hidden or uncalibrated magnitude, and any per-signal
# numeric that isn't auditable to its ledger.
YogaGrade = Literal["strong", "moderate", "weak"]
```

### C.2 `frontend/apps/web/src/lib/rectifySignals.ts:22-24`

**BEFORE (verified current text):**
```ts
 * ANTI-SCAM: this module renders WORDS only. Scores, contributions and
 * percentages are never formatted here — polarity may use the SIGN of a
 * contribution, never its value.
```
**AFTER:**
```ts
 * ANTI-SCAM: this module renders WORDS + POLARITY only for PER-SIGNAL evidence.
 * Per-event contributions are never formatted as numbers here — polarity may use
 * the SIGN of a contribution, never its value. (The AGGREGATE rectification
 * confidence % — margin×100, event-validated, gated below MIN_DISCRIMINATING_EVENTS
 * — is a CALIBRATED number and is formatted in the result header, NOT here.) The
 * ban is on hidden/uncalibrated magnitudes, not on principled, anchored, tested %.
```

### C.3 `frontend/apps/web/src/styles/report-print.css:618-619` (the text-by-design law)

The letterpress-word styling stays; the comment is broadened so a future editor doesn't read it as
"grades may never be numeric":
```css
/* The engine's qualitative grade as a small-caps typographic mark. The calibrated
   strength_pct renders as its own calibrated numeric mark (see .report-strength-pct);
   this word remains a word — never a fake badge/number in place of the real %. */
```

### C.4 `backend/tests/test_scoring_quarantine.py` — **NO CHANGE**

The quarantined sigmoid (`dasha/scoring.py:65`, `_sigmoid_calibrate = 1/(1+exp(-3(x−0.5)))`, feeding
`apply_expert_rules` "guaranteed high probability" scenarios) stays quarantined. Our percentages are
**anchored transforms of deterministic quantities**, not a *learned/opinionated probability model* —
the exact thing the guard exists to keep out of the chart pipeline (`test_scoring_quarantine.py:1-8`,
scoped to the chart pipeline's import closure). None of stages 1–4 import `dasha/scoring`, so the
fresh-interpreter guard keeps passing untouched. **This is the bright line:** anchored ≠ learned.

---

## §D. Historical staged delivery plan (stages 1–3 complete; Stage 4 partial)

The following is the TDD-first plan used for stages 1–4, ordered cheapest-highest-value. Stages 1–3
are complete; Stage 4 records both the shipped support and the remaining production work. Each
stage is additive and touches no stored-data schema, signing, PWA-cache, or storage path.

### Stage 1 — Yoga strength % + ledger — **CHEAP**
*Self-contained, one golden, the mark integers already exist.*
- **Red tests first:** (unit) `favorability()` returns net/M⁺/M⁻/pct for hand-built positions;
  (calibration) exalted-Jupiter Gaja-Kesari → ≥85%, combust debilitated dusthana Mars and
  non-combust debilitated dusthana Sun → ≤15%, across ≥3 distinct charts; (property) monotonicity —
  adding a favorable factor never lowers pct, removing one never raises it; (parity) regenerate
  `chart_golden_de421.json`, `parity.mjs` green; (e2e touch)
  Playwright report renders `.report-strength-pct` with the tier label next to the grade word.
- **Render slots:** web `ReportYogas.tsx:66-74` (add pct + ledger after the grade span, before
  `.report-yoga-desc`); PDF `ReportPdfYogas.tsx:18-28` `YogaCard` (add pct line under `yogaChip`).
- **Re-blesses:** `chart_golden_de421.json` (+ parity).
- **Covenant:** guard amendment C.1 + C.3 land here.

### Stage 2 — Life-domain strength % + ledger — **MODERATE**
*Two goldens; two anchored axes + a combiner; the 2×required ceiling needs a ruling (§E-1).*
- **Red tests first:** (unit) `_pct_shadbala`/`_pct_sav` hit the pivots exactly (required→60%,
  28→50%); (calibration) 2×-required Saturn career → ≥90%, 0.4×-required Moon home → ≤30%, on ≥3
  charts; (property) monotonic in both rupas and bindus; (parity) regen `domains_golden` +
  `predictive_golden`, parity green; (e2e) domain block shows headline % + both axis chips.
- **Render slots:** web `ReportDomains.tsx:22-36` (`.report-domain-band` L25 → add %; strength_line
  L30-36 becomes the ledger showing both axes); PDF `ReportPdfDomains.tsx:66-73` `DomainCard`
  (`block.band` L71 → add %, `strengthLine` L73 → two-axis ledger).
- **Re-blesses:** `domains_golden_de421.json` + `predictive_golden_de421.json` (+ parity).
- **Tier:** M.

### Stage 3 — Rectification confidence % + opposing vectors — **CHEAP (render-heavy, numbers already threaded)**
*The margin/fit_score/totals already reach TS; this is surfacing + the min-evidence gate.*
- **Red tests first:** (unit) `confidence_pct` is `None`/inconclusive below `MIN_DISCRIMINATING_EVENTS`
  and `margin*100` at/above it; (calibration) 5-event margin-0.42 case → "42%, consistent",
  2-event case → "inconclusive"; (property) pct monotonic in margin; (parity) `rectification_golden`
  if the field is added; (e2e) report Section XI shows the % (or "inconclusive") + the
  supporting-vs-opposing totals.
- **Render slots:** web `ReportRectification.tsx:105-108` (`band_label` dd L107 → add the % or the
  inconclusive word); opposing vectors from `positive_total` vs `penalty_total` per candidate;
  per-signal cells stay words-only (`candidateReading` L78-86 unchanged).
- **Re-blesses:** `rectification_golden.json` (only if `confidence_pct` added; else none).
- **Tier:** E — the highest-status number in the product; label it "confirmed by your events."

### Stage 4 — Stable-vs-lagna dual pass + assumptions panel — **PARTIAL**
*No new engine number; exact helpers and assumptions shipped, production dual-pass wiring remains.*
- **Shipped:** exact pure diff helpers and dual-pass tests; the assumptions panel on web and PDF;
  conservative cusp-proxy stability chips on the web report.
- **Remaining:** call the dual pass from the production report flow, pass its exact yoga/domain
  verdict diffs to the web chips, and add the same markers to PDF.
- **Acceptance tests still required:** production integration proves the alternate candidate is
  evaluated exactly once with a shared ephemeris; web and PDF both render the resulting exact
  marker; the proxy is no longer the source for a rectified two-lagna report.
- **Re-blesses:** none expected (pure reuse); add integration/e2e coverage for both renderers.
- **Tier:** only the completed exact two-lagna diff is deterministic Layer-1 evidence.

### Stage 5 — hand off to **markovflow** (north-star, external, deferred) — out of scope
*The probabilistic-convergence layer is markovflow's job (§0.5), not this repo's.* This spec's only
obligation is to leave the seam clean: stage-1 confidence objects are posterior-ready (structured
evidence + uncertainty + tier, not a bare scalar) and the engine stays a pure, repeatedly-evaluable
function. No Stage-5 implementation, tests, or goldens are specified here — markovflow is already
spec'd elsewhere and consumes these typed claims when it lands.

---

## §E. Risks & open questions (a jyotiṣī could contest these — user rules)

1. **[NEEDS RULING] Domain Shadbala 100% ceiling = `2 × required_rupas`.** `required_rupas` is a real
   classical minimum, but the *strong ceiling* has no canonical value — 2× is a defensible AlmaMesh
   choice, not śāstra. Options: (a) `2×required` (current proposal); (b) the theoretical Shadbala max
   per graha (cleaner anchor, but rarely approached, compresses everyone low); (c) an empirical
   percentile from a chart corpus (Tier-M→E, but needs Stage 5). This is the single most contestable
   anchor.
2. **Yoga `min()` vs additive combination across planets.** We keep the engine's additive `net`
   (`factors.py:126`) — but a jyotiṣī might argue one debilitated key planet should *veto* a yoga
   (min-style), not merely subtract a mark. Current design preserves existing semantics; flag for a
   doctrine call.
3. **Kendra/trikona as one mark (not two).** The code counts them as a single favorable mark
   (`factors.py:116`); some traditions weight trikonas (dharma houses) above kendras. We honor the
   code as-is; changing it is a Layer-2 model decision, not a bug fix.
4. **Retrograde as favorable.** `factors.py:117` counts vakra as favorable (high cheṣṭā-bala). This is
   a real but *contested* doctrine (some read retrograde malefics as harmful). It materially moves the
   yoga %. Documented at `factors.py:48`; flag if the user wants it neutralized.
5. **Combustion applicability.** For the max-unfavorable anchor `M⁻`, which planets *can* combust
   matters (Sun never; nodes debatable). The anchor must encode this per-planet or a Sun-yoga's %
   scale is wrong. Implementation detail with a doctrinal edge.
6. **Rectification % semantics.** The margin is *separation between two candidate times*, not
   *probability the time is right*. If users read "42%" as "42% chance my time is correct," that is a
   miscommunication risk even though the number is honest — the label wording is load-bearing.
7. **Combining two independent percentage axes with `min()`** (domains) is conservative but discards
   information (a 95%/61% domain and a 61%/61% domain read identically). The qualitative band is a
   separate parallel output over `meets_minimum` and raw SAV averages; it must never be inferred from
   the headline percentage. A documented weighted blend is the percentage alternative; `min()` was
   chosen for honesty (weakest-link) over resolution.

---

## Appendix — verification ledger (every claim, file:line, checked 2026-07-11)

- Yoga marks additive ledger: `yogas/factors.py:114-121` (`_net_marks`), grade buckets `:124-131`.
- Yoga factor emission: `yogas/factors.py:65-100`; `YogaStrengthFactor` `schemas/astrology.py:169`
  (fields: factor_type/planet/value/basis — **no numeric mark today**).
- Yoga assembly: `yogas/rules.py:111-140` (`_make_yoga`).
- No-numeric guard: `schemas/astrology.py:158-162`.
- Domain strength: `schemas/domains.py:114-134` (`StrengthSummary`); band logic
  `domains/strength_summary.py:24-34,41-49`; forecast `schemas/domains.py:188-199`;
  window severity `schemas/domains.py:167-181`; emphasis `schemas/domains.py:139-164`.
- Anchors: `schemas/strength.py:9` (bindus 0..8/house, SAV 0..56), `:34` (VIRUPAS_PER_RUPA 60),
  `:140-141,154-156` (total_rupas/required_rupas/meets_minimum), `:66-75` (SarvashtakavargaChart).
- Rectification: `rectification/models.py:75-113` (Candidate/Result fields), scorer margin
  `:709-714`, band+gate `:717-725`, constants `:156,162-163`, fit_score `:657,665`, decorrelation
  `:165-169`, silent-miss penalty `:608,635-644`.
- Transit fusion: `transits/fusion.py:40-45` (heuristic coeffs), `:57-78` (`score_fusion`, clamp,
  severity), `:66-69` (reinforcing/afflicting args).
- Engine purity: `calculations.py:678-698` (pure, `astronomy=` reuse, `reference_date`),
  `predictive.py:46-56` (`compute_predictive_contexts`).
- Quarantine: `dasha/scoring.py:1-28` (DORMANT header), `:65` (sigmoid); `test_scoring_quarantine.py:1-10`.
- Parity gate: `packages/browser/integration/parity.mjs:1-26` (offline, `model_dump(mode="json")`,
  6-dp round + sorted keys, deep-compare, 5 fixtures).
- Worker/threading: `chartWorker.ts:61,76,153` (dump), `:216,228,240,252` (parse to typed).
- TS mirrors: `pyodide/chart.ts:104-140` (YogaGrade/StrengthFactor/Data),
  `pyodide/predictive.ts:304-347` (StrengthSummary/Emphasis/Window/Forecast/Context);
  `@almamesh/shared-types` (RectificationCandidate/EventEvidence via `rectifySignals.ts:28`).
- Render slots: yoga web `ReportYogas.tsx:66-74`, yoga PDF `ReportPdfYogas.tsx:18-28`;
  domain web `ReportDomains.tsx:22-36`, domain PDF `ReportPdfDomains.tsx:66-73`;
  rectification web `ReportRectification.tsx:78-108`; cusp `ReportCover.tsx:107-129`;
  ayanamsa `ReportFooter.tsx:1-5`; text-by-design law `styles/report-print.css:618-628`.
- Goldens: `backend/tests/fixtures/{chart,domains,predictive}_golden_de421.json`,
  `rectification_golden.json`, `rectification_window_golden.json`; regen scripts
  `regen_{domains,predictive,strength,mesh}_golden.py`.
